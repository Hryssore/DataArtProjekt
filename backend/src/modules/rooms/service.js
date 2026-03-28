import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/apiError.js";
import { deleteFileIfExists } from "../../utils/fileStorage.js";
import { assertRoomAdmin, assertRoomMember, assertRoomOwner, getRoomAccess } from "../../utils/permissions.js";
import { emitToRoom, emitToUser, removeUserFromRoom } from "../../utils/realtime.js";

function mapRoomRow(row) {
  const memberCount = Number(row.member_count ?? 0);
  const maxMembers = row.max_members ? Number(row.max_members) : null;
  const onlineCount = Number(row.online_count ?? 0);
  const messageCount = Number(row.message_count ?? 0);

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    category: row.category ?? "general",
    ownerId: row.owner_id,
    memberCount,
    maxMembers,
    onlineCount,
    messageCount,
    levelRequirement: Number(row.level_requirement ?? 1),
    voiceEnabled: Boolean(row.voice_enabled),
    videoEnabled: Boolean(row.video_enabled),
    isListed: row.is_listed !== false,
    isFull: maxMembers !== null && memberCount >= maxMembers,
    isMember: Boolean(row.is_member),
    isAdmin: Boolean(row.is_admin) || row.owner_id === row.current_user_id,
    isOwner: row.owner_id === row.current_user_id,
    createdAt: row.created_at,
  };
}

async function fetchRoom(client, roomId, currentUserId) {
  const result = await client.query(
    `
      SELECT
        rooms.*,
        $2::UUID AS current_user_id,
        COUNT(DISTINCT room_members.id)::INT AS member_count,
        (
          SELECT COUNT(*)::INT
          FROM messages
          WHERE messages.room_id = rooms.id
            AND messages.deleted_at IS NULL
        ) AS message_count,
        COUNT(DISTINCT CASE
          WHEN presence_states.status = 'online' THEN room_members.user_id
          ELSE NULL
        END)::INT AS online_count,
        EXISTS (
          SELECT 1 FROM room_members WHERE room_id = rooms.id AND user_id = $2
        ) AS is_member,
        EXISTS (
          SELECT 1 FROM room_admins WHERE room_id = rooms.id AND user_id = $2
        ) AS is_admin
      FROM rooms
      LEFT JOIN room_members ON room_members.room_id = rooms.id
      LEFT JOIN presence_states ON presence_states.user_id = room_members.user_id
      WHERE rooms.id = $1
      GROUP BY rooms.id
    `,
    [roomId, currentUserId],
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "Room not found.");
  }

  return mapRoomRow(result.rows[0]);
}

async function deleteRoomFiles(client, roomId) {
  const attachmentsResult = await client.query(
    `
      SELECT attachments.storage_path
      FROM attachments
      JOIN messages ON messages.id = attachments.message_id
      WHERE messages.room_id = $1
    `,
    [roomId],
  );

  await client.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);

  return attachmentsResult.rows.map(row => row.storage_path);
}

export async function createRoom(ownerId, payload, io = null) {
  try {
    return await withTransaction(async client => {
      const normalizedName = payload.name.trim();
      const normalizedDescription = payload.description?.trim() ?? "";
      const roomResult = await client.query(
        `
          INSERT INTO rooms (
            name,
            description,
            visibility,
            owner_id,
            category,
            max_members,
            voice_enabled,
            video_enabled,
            level_requirement,
            is_listed
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `,
        [
          normalizedName,
          normalizedDescription,
          payload.visibility,
          ownerId,
          payload.category ?? "general",
          payload.maxMembers ?? null,
          Boolean(payload.voiceEnabled),
          Boolean(payload.videoEnabled),
          payload.levelRequirement ?? 1,
          payload.visibility === "public" ? payload.isListed !== false : false,
        ],
      );

      const roomId = roomResult.rows[0].id;
      await client.query(
        `INSERT INTO room_members (room_id, user_id) VALUES ($1, $2)`,
        [roomId, ownerId],
      );
      await client.query(
        `INSERT INTO room_admins (room_id, user_id, granted_by_user_id) VALUES ($1, $2, $2)`,
        [roomId, ownerId],
      );

      return fetchRoom(client, roomId, ownerId);
    });
  } catch (error) {
    if (error?.code === "23505") {
      throw new ApiError(409, "Room name must be unique.");
    }

    throw error;
  }
}

export async function listRoomCatalog(userId, filters = {}) {
  const search = filters.search ?? "";
  const category = filters.category ?? "all";
  const sort = filters.sort ?? "name";
  const onlyAvailable = Boolean(filters.onlyAvailable);
  const requireVoice = filters.voiceEnabled === true;
  const requireVideo = filters.videoEnabled === true;

  const orderBy = {
    name: "rooms.name ASC",
    newest: "rooms.created_at DESC",
    popular: "member_count DESC, online_count DESC, rooms.name ASC",
    online: "online_count DESC, member_count DESC, rooms.name ASC",
  }[sort] ?? "rooms.name ASC";

  const result = await query(
    `
      SELECT
        rooms.*,
        $1::UUID AS current_user_id,
        COUNT(DISTINCT room_members.id)::INT AS member_count,
        (
          SELECT COUNT(*)::INT
          FROM messages
          WHERE messages.room_id = rooms.id
            AND messages.deleted_at IS NULL
        ) AS message_count,
        COUNT(DISTINCT CASE
          WHEN presence_states.status = 'online' THEN room_members.user_id
          ELSE NULL
        END)::INT AS online_count,
        EXISTS (
          SELECT 1 FROM room_members WHERE room_id = rooms.id AND user_id = $1
        ) AS is_member,
        EXISTS (
          SELECT 1 FROM room_admins WHERE room_id = rooms.id AND user_id = $1
        ) AS is_admin
      FROM rooms
      LEFT JOIN room_members ON room_members.room_id = rooms.id
      LEFT JOIN presence_states ON presence_states.user_id = room_members.user_id
      WHERE rooms.visibility = 'public'
        AND rooms.is_listed = TRUE
        AND rooms.name ILIKE $2
        AND ($3::TEXT = 'all' OR rooms.category::TEXT = $3)
        AND ($4::BOOLEAN = FALSE OR rooms.voice_enabled = TRUE)
        AND ($5::BOOLEAN = FALSE OR rooms.video_enabled = TRUE)
      GROUP BY rooms.id
      HAVING (
        $6::BOOLEAN = FALSE
        OR rooms.max_members IS NULL
        OR COUNT(DISTINCT room_members.id) < rooms.max_members
      )
      ORDER BY ${orderBy}
    `,
    [userId, `%${search}%`, category, requireVoice, requireVideo, onlyAvailable],
  );

  return result.rows.map(mapRoomRow);
}

export async function listMyRooms(userId) {
  const result = await query(
    `
      SELECT
        rooms.*,
        $1::UUID AS current_user_id,
        COUNT(DISTINCT all_members.id)::INT AS member_count,
        (
          SELECT COUNT(*)::INT
          FROM messages
          WHERE messages.room_id = rooms.id
            AND messages.deleted_at IS NULL
        ) AS message_count,
        COUNT(DISTINCT CASE
          WHEN presence_states.status = 'online' THEN all_members.user_id
          ELSE NULL
        END)::INT AS online_count,
        TRUE AS is_member,
        EXISTS (
          SELECT 1 FROM room_admins WHERE room_id = rooms.id AND user_id = $1
        ) AS is_admin
      FROM room_members
      JOIN rooms ON rooms.id = room_members.room_id
      LEFT JOIN room_members AS all_members ON all_members.room_id = rooms.id
      LEFT JOIN presence_states ON presence_states.user_id = all_members.user_id
      WHERE room_members.user_id = $1
      GROUP BY rooms.id
      ORDER BY rooms.name
    `,
    [userId],
  );

  return result.rows.map(mapRoomRow);
}

export async function listMyInvitations(userId) {
  const result = await query(
    `
      SELECT
        room_invitations.id,
        room_invitations.created_at,
        rooms.id AS room_id,
        rooms.name,
        rooms.description,
        inviter.id AS inviter_id,
        inviter.username AS inviter_username
      FROM room_invitations
      JOIN rooms ON rooms.id = room_invitations.room_id
      LEFT JOIN users AS inviter ON inviter.id = room_invitations.invited_by_user_id
      WHERE room_invitations.invited_user_id = $1
        AND room_invitations.status = 'pending'
      ORDER BY room_invitations.created_at DESC
    `,
    [userId],
  );

  return result.rows.map(row => ({
    id: row.id,
    createdAt: row.created_at,
    room: {
      id: row.room_id,
      name: row.name,
      description: row.description,
    },
    inviter: row.inviter_id
      ? {
          id: row.inviter_id,
          username: row.inviter_username,
        }
      : null,
  }));
}

export async function getRoomById(userId, roomId) {
  const result = await query(
    `
      SELECT
        rooms.*,
        $2::UUID AS current_user_id,
        COUNT(DISTINCT room_members.id)::INT AS member_count,
        (
          SELECT COUNT(*)::INT
          FROM messages
          WHERE messages.room_id = rooms.id
            AND messages.deleted_at IS NULL
        ) AS message_count,
        COUNT(DISTINCT CASE
          WHEN presence_states.status = 'online' THEN room_members.user_id
          ELSE NULL
        END)::INT AS online_count,
        EXISTS (
          SELECT 1 FROM room_members WHERE room_id = rooms.id AND user_id = $2
        ) AS is_member,
        EXISTS (
          SELECT 1 FROM room_admins WHERE room_id = rooms.id AND user_id = $2
        ) AS is_admin
      FROM rooms
      LEFT JOIN room_members ON room_members.room_id = rooms.id
      LEFT JOIN presence_states ON presence_states.user_id = room_members.user_id
      WHERE rooms.id = $1
      GROUP BY rooms.id
    `,
    [roomId, userId],
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "Room not found.");
  }

  const room = mapRoomRow(result.rows[0]);
  if (!room.isMember && room.visibility !== "public") {
    throw new ApiError(403, "You do not have access to this room.");
  }

  return room;
}

export async function joinPublicRoom(userId, roomId, io = null) {
  return withTransaction(async client => {
    const access = await getRoomAccess(client, roomId, userId);

    if (access.visibility !== "public") {
      throw new ApiError(403, "Private rooms may only be joined by invitation.");
    }

    if (access.is_banned) {
      throw new ApiError(403, "You are banned from this room.");
    }

    const userResult = await client.query(
      `SELECT level FROM users WHERE id = $1`,
      [userId],
    );
    const userLevel = Number(userResult.rows[0]?.level ?? 1);

    if (userLevel < Number(access.level_requirement ?? 1)) {
      throw new ApiError(403, "Your level is too low for this room.");
    }

    const memberStats = await client.query(
      `
        SELECT COUNT(*)::INT AS member_count
        FROM room_members
        WHERE room_id = $1
      `,
      [roomId],
    );

    const memberCount = Number(memberStats.rows[0]?.member_count ?? 0);
    if (access.max_members && memberCount >= Number(access.max_members)) {
      throw new ApiError(403, "This room has reached its participant limit.");
    }

    await client.query(
      `
        INSERT INTO room_members (room_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (room_id, user_id) DO NOTHING
      `,
      [roomId, userId],
    );

    const room = await fetchRoom(client, roomId, userId);
    emitToRoom(io, roomId, "room:members-updated", { roomId });
    return room;
  });
}

export async function inviteUserToRoom(actorId, roomId, invitedUserId, io = null) {
  return withTransaction(async client => {
    const access = await assertRoomAdmin(client, roomId, actorId);

    if (access.visibility !== "private") {
      throw new ApiError(400, "Invitations are only needed for private rooms.");
    }

    const invitedUser = await client.query(
      `SELECT id FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [invitedUserId],
    );
    if (invitedUser.rowCount === 0) {
      throw new ApiError(404, "User not found.");
    }

    const membership = await client.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, invitedUserId],
    );
    if (membership.rowCount > 0) {
      throw new ApiError(409, "User is already a room member.");
    }

    const ban = await client.query(
      `SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2`,
      [roomId, invitedUserId],
    );
    if (ban.rowCount > 0) {
      throw new ApiError(403, "Banned users cannot be invited.");
    }

    const invitation = await client.query(
      `
        INSERT INTO room_invitations (room_id, invited_user_id, invited_by_user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (room_id, invited_user_id)
        DO UPDATE SET
          invited_by_user_id = EXCLUDED.invited_by_user_id,
          status = 'pending',
          responded_at = NULL,
          created_at = NOW()
        RETURNING *
      `,
      [roomId, invitedUserId, actorId],
    );

    emitToUser(io, invitedUserId, "room:invited", { roomId });
    return invitation.rows[0];
  });
}

export async function acceptRoomInvitation(userId, invitationId, io = null) {
  return withTransaction(async client => {
    const invitationResult = await client.query(
      `
        SELECT *
        FROM room_invitations
        WHERE id = $1
          AND invited_user_id = $2
          AND status = 'pending'
      `,
      [invitationId, userId],
    );

    if (invitationResult.rowCount === 0) {
      throw new ApiError(404, "Pending invitation not found.");
    }

    const invitation = invitationResult.rows[0];
    const ban = await client.query(
      `SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2`,
      [invitation.room_id, userId],
    );
    if (ban.rowCount > 0) {
      throw new ApiError(403, "You are banned from this room.");
    }

    const roomRules = await client.query(
      `
        SELECT max_members, level_requirement
        FROM rooms
        WHERE id = $1
      `,
      [invitation.room_id],
    );
    const currentUser = await client.query(`SELECT level FROM users WHERE id = $1`, [userId]);
    const memberStats = await client.query(
      `SELECT COUNT(*)::INT AS member_count FROM room_members WHERE room_id = $1`,
      [invitation.room_id],
    );

    const roomRow = roomRules.rows[0];
    if (Number(currentUser.rows[0]?.level ?? 1) < Number(roomRow?.level_requirement ?? 1)) {
      throw new ApiError(403, "Your level is too low for this room.");
    }

    if (roomRow?.max_members && Number(memberStats.rows[0]?.member_count ?? 0) >= Number(roomRow.max_members)) {
      throw new ApiError(403, "This room has reached its participant limit.");
    }

    await client.query(
      `
        INSERT INTO room_members (room_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT (room_id, user_id) DO NOTHING
      `,
      [invitation.room_id, userId],
    );
    await client.query(
      `
        UPDATE room_invitations
        SET status = 'accepted', responded_at = NOW()
        WHERE id = $1
      `,
      [invitationId],
    );

    emitToRoom(io, invitation.room_id, "room:members-updated", { roomId: invitation.room_id });
    return fetchRoom(client, invitation.room_id, userId);
  });
}

export async function leaveRoom(userId, roomId, io = null) {
  return withTransaction(async client => {
    const access = await assertRoomMember(client, roomId, userId);

    if (access.is_owner) {
      throw new ApiError(400, "The room owner cannot leave the room and must delete it instead.");
    }

    await client.query(
      `DELETE FROM room_admins WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
    await client.query(
      `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );
    await client.query(
      `DELETE FROM conversation_reads WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId],
    );

    emitToRoom(io, roomId, "room:members-updated", { roomId });
    removeUserFromRoom(io, userId, roomId);
    return { ok: true };
  });
}

export async function deleteRoom(ownerId, roomId, io = null) {
  const filesToDelete = await withTransaction(async client => {
    await assertRoomOwner(client, roomId, ownerId);
    return deleteRoomFiles(client, roomId);
  });

  await Promise.all(filesToDelete.map(pathname => deleteFileIfExists(pathname)));
  emitToRoom(io, roomId, "room:deleted", { roomId });
  return { ok: true };
}

export async function listRoomMembers(userId, roomId) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const result = await client.query(
      `
        SELECT
          users.id,
          users.username,
          users.display_name,
          users.avatar_key,
          users.decoration_key,
          users.level,
          users.hearts_received,
          room_members.joined_at,
          presence_states.status,
          (rooms.owner_id = users.id) AS is_owner,
          EXISTS (
            SELECT 1
            FROM room_admins
            WHERE room_admins.room_id = room_members.room_id
              AND room_admins.user_id = users.id
          ) AS is_admin
        FROM room_members
        JOIN users ON users.id = room_members.user_id
        JOIN rooms ON rooms.id = room_members.room_id
        LEFT JOIN presence_states ON presence_states.user_id = users.id
        WHERE room_members.room_id = $1
        ORDER BY is_owner DESC, is_admin DESC, users.username
      `,
      [roomId],
    );

    return result.rows.map(row => ({
      id: row.id,
      username: row.username,
      displayName: row.display_name || row.username,
      avatarKey: row.avatar_key,
      decorationKey: row.decoration_key,
      level: Number(row.level ?? 1),
      heartsReceived: Number(row.hearts_received ?? 0),
      status: row.status ?? "offline",
      joinedAt: row.joined_at,
      isOwner: row.is_owner,
      isAdmin: row.is_admin || row.is_owner,
    }));
  });
}

export async function listRoomAdmins(userId, roomId) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const result = await client.query(
      `
        SELECT
          users.id,
          users.username,
          (rooms.owner_id = users.id) AS is_owner
        FROM room_admins
        JOIN users ON users.id = room_admins.user_id
        JOIN rooms ON rooms.id = room_admins.room_id
        WHERE room_admins.room_id = $1
        ORDER BY is_owner DESC, users.username
      `,
      [roomId],
    );

    return result.rows.map(row => ({
      id: row.id,
      username: row.username,
      isOwner: row.is_owner,
    }));
  });
}

export async function addRoomAdmin(actorId, roomId, targetUserId, io = null) {
  return withTransaction(async client => {
    const access = await assertRoomOwner(client, roomId, actorId);

    if (access.owner_id === targetUserId) {
      throw new ApiError(400, "The room owner already has full room access.");
    }

    const member = await client.query(
      `SELECT 1 FROM room_members WHERE room_id = $1 AND user_id = $2`,
      [roomId, targetUserId],
    );
    if (member.rowCount === 0) {
      throw new ApiError(404, "Target user is not a room member.");
    }

    await client.query(
      `
        INSERT INTO room_admins (room_id, user_id, granted_by_user_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (room_id, user_id) DO NOTHING
      `,
      [roomId, targetUserId, actorId],
    );

    emitToRoom(io, roomId, "room:admins-updated", { roomId });
    emitToRoom(io, roomId, "room:members-updated", { roomId });
    return { ok: true };
  });
}

export async function removeRoomAdmin(actorId, roomId, targetUserId, io = null) {
  return withTransaction(async client => {
    const access = await assertRoomAdmin(client, roomId, actorId);

    if (access.owner_id === targetUserId) {
      throw new ApiError(400, "The room owner cannot lose admin status.");
    }

    if (!access.is_owner && actorId === targetUserId) {
      throw new ApiError(400, "Admins may remove other admins, not themselves.");
    }

    await client.query(
      `DELETE FROM room_admins WHERE room_id = $1 AND user_id = $2`,
      [roomId, targetUserId],
    );

    emitToRoom(io, roomId, "room:admins-updated", { roomId });
    emitToRoom(io, roomId, "room:members-updated", { roomId });
    return { ok: true };
  });
}

export async function listRoomBans(actorId, roomId) {
  return withTransaction(async client => {
    await assertRoomAdmin(client, roomId, actorId);

    const result = await client.query(
      `
        SELECT
          room_bans.user_id,
          users.username,
          room_bans.reason,
          room_bans.created_at,
          room_bans.banned_by_user_id,
          banned_by.username AS banned_by_username
        FROM room_bans
        JOIN users ON users.id = room_bans.user_id
        LEFT JOIN users AS banned_by ON banned_by.id = room_bans.banned_by_user_id
        WHERE room_bans.room_id = $1
        ORDER BY room_bans.created_at DESC
      `,
      [roomId],
    );

    return result.rows.map(row => ({
      userId: row.user_id,
      username: row.username,
      reason: row.reason,
      createdAt: row.created_at,
      bannedBy: row.banned_by_user_id
        ? {
            userId: row.banned_by_user_id,
            username: row.banned_by_username,
          }
        : null,
    }));
  });
}

export async function banRoomUser(actorId, roomId, targetUserId, reason = null, io = null) {
  return withTransaction(async client => {
    const access = await assertRoomAdmin(client, roomId, actorId);

    if (access.owner_id === targetUserId) {
      throw new ApiError(400, "The room owner cannot be banned.");
    }

    const targetAdmin = await client.query(
      `SELECT 1 FROM room_admins WHERE room_id = $1 AND user_id = $2`,
      [roomId, targetUserId],
    );

    if (!access.is_owner && targetAdmin.rowCount > 0) {
      throw new ApiError(403, "Only the room owner may ban another admin.");
    }

    await client.query(
      `
        INSERT INTO room_bans (room_id, user_id, banned_by_user_id, reason)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (room_id, user_id)
        DO UPDATE SET
          banned_by_user_id = EXCLUDED.banned_by_user_id,
          reason = EXCLUDED.reason,
          created_at = NOW()
      `,
      [roomId, targetUserId, actorId, reason],
    );
    await client.query(`DELETE FROM room_admins WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
    await client.query(`DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);
    await client.query(`DELETE FROM room_invitations WHERE room_id = $1 AND invited_user_id = $2`, [roomId, targetUserId]);
    await client.query(`DELETE FROM conversation_reads WHERE room_id = $1 AND user_id = $2`, [roomId, targetUserId]);

    emitToUser(io, targetUserId, "room:banned", { roomId });
    emitToRoom(io, roomId, "room:members-updated", { roomId });
    removeUserFromRoom(io, targetUserId, roomId);
    return { ok: true };
  });
}

export async function unbanRoomUser(actorId, roomId, targetUserId, io = null) {
  return withTransaction(async client => {
    await assertRoomAdmin(client, roomId, actorId);
    await client.query(
      `DELETE FROM room_bans WHERE room_id = $1 AND user_id = $2`,
      [roomId, targetUserId],
    );
    emitToRoom(io, roomId, "room:bans-updated", { roomId });
    return { ok: true };
  });
}
