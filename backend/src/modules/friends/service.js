import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/apiError.js";
import { normalizeUserPair } from "../../utils/pairs.js";
import { emitToUser } from "../../utils/realtime.js";

function mapFriendRow(row) {
  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarKey: row.avatar_key,
    decorationKey: row.decoration_key,
    level: Number(row.level ?? 1),
    heartsReceived: Number(row.hearts_received ?? 0),
    isLikedByCurrentUser: Boolean(row.is_liked_by_current_user),
    status: row.status ?? "offline",
    dialogId: row.dialog_id,
    createdAt: row.created_at,
  };
}

function mapFriendRequestRow(row, userId) {
  return {
    id: row.id,
    sender: {
      id: row.sender_id,
      username: row.sender_username,
      displayName: row.sender_display_name || row.sender_username,
    },
    receiver: {
      id: row.receiver_id,
      username: row.receiver_username,
      displayName: row.receiver_display_name || row.receiver_username,
    },
    message: row.message,
    status: row.status,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    direction: row.sender_id === userId ? "outgoing" : "incoming",
  };
}

export async function listFriends(userId) {
  const result = await query(
    `
      SELECT
        friend_user.id AS user_id,
        friend_user.username,
        friend_user.display_name,
        friend_user.avatar_key,
        friend_user.decoration_key,
        friend_user.level,
        friend_user.hearts_received,
        viewer_heart.sender_user_id IS NOT NULL AS is_liked_by_current_user,
        presence_states.status,
        friendships.created_at,
        personal_dialogs.id AS dialog_id
      FROM friendships
      JOIN users AS friend_user
        ON friend_user.id = CASE
          WHEN friendships.user_low_id = $1 THEN friendships.user_high_id
          ELSE friendships.user_low_id
        END
      LEFT JOIN presence_states ON presence_states.user_id = friend_user.id
      LEFT JOIN personal_dialogs
        ON personal_dialogs.user_low_id = LEAST(friend_user.id, $1)::uuid
       AND personal_dialogs.user_high_id = GREATEST(friend_user.id, $1)::uuid
      LEFT JOIN profile_hearts AS viewer_heart
        ON viewer_heart.sender_user_id = $1
       AND viewer_heart.target_user_id = friend_user.id
      WHERE friendships.user_low_id = $1 OR friendships.user_high_id = $1
      ORDER BY friend_user.username
    `,
    [userId],
  );

  return result.rows.map(mapFriendRow);
}

export async function listFriendRequests(userId) {
  const result = await query(
    `
      SELECT
        friend_requests.*,
        sender.username AS sender_username,
        receiver.username AS receiver_username,
        sender.display_name AS sender_display_name,
        receiver.display_name AS receiver_display_name
      FROM friend_requests
      JOIN users AS sender ON sender.id = friend_requests.sender_id
      JOIN users AS receiver ON receiver.id = friend_requests.receiver_id
      WHERE sender_id = $1 OR receiver_id = $1
      ORDER BY created_at DESC
    `,
    [userId],
  );

  return result.rows.map(row => mapFriendRequestRow(row, userId));
}

export async function createFriendRequest(senderId, payload, io = null) {
  return withTransaction(async client => {
    let targetUserId = payload.targetUserId ?? null;

    if (!targetUserId) {
      const targetUser = await client.query(
        `
          SELECT id
          FROM users
          WHERE username = $1
            AND deleted_at IS NULL
        `,
        [payload.username],
      );

      if (targetUser.rowCount === 0) {
        throw new ApiError(404, "Target user not found.");
      }

      targetUserId = targetUser.rows[0].id;
    }

    if (targetUserId === senderId) {
      throw new ApiError(400, "You cannot friend yourself.");
    }

    const [lowId, highId] = normalizeUserPair(senderId, targetUserId);
    const friendship = await client.query(
      `
        SELECT 1
        FROM friendships
        WHERE user_low_id = $1 AND user_high_id = $2
      `,
      [lowId, highId],
    );

    if (friendship.rowCount > 0) {
      throw new ApiError(409, "You are already friends.");
    }

    const ban = await client.query(
      `
        SELECT 1
        FROM user_bans
        WHERE (source_user_id = $1 AND target_user_id = $2)
           OR (source_user_id = $2 AND target_user_id = $1)
      `,
      [senderId, targetUserId],
    );

    if (ban.rowCount > 0) {
      throw new ApiError(403, "A user ban blocks friend requests.");
    }

    const reversePending = await client.query(
      `
        SELECT 1
        FROM friend_requests
        WHERE sender_id = $1
          AND receiver_id = $2
          AND status = 'pending'
      `,
      [targetUserId, senderId],
    );

    if (reversePending.rowCount > 0) {
      throw new ApiError(409, "An incoming friend request from this user already exists.");
    }

    const inserted = await client.query(
      `
        INSERT INTO friend_requests (sender_id, receiver_id, message)
        VALUES ($1, $2, $3)
        ON CONFLICT (sender_id, receiver_id)
        DO UPDATE SET
          message = EXCLUDED.message,
          status = 'pending',
          responded_at = NULL,
          created_at = NOW()
        RETURNING *
      `,
      [senderId, targetUserId, payload.message ?? null],
    );

    const hydrated = await client.query(
      `
        SELECT
          friend_requests.*,
          sender.username AS sender_username,
          receiver.username AS receiver_username,
          sender.display_name AS sender_display_name,
          receiver.display_name AS receiver_display_name
        FROM friend_requests
        JOIN users AS sender ON sender.id = friend_requests.sender_id
        JOIN users AS receiver ON receiver.id = friend_requests.receiver_id
        WHERE friend_requests.id = $1
      `,
      [inserted.rows[0].id],
    );

    emitToUser(io, targetUserId, "friends:request", { requestId: inserted.rows[0].id });

    return mapFriendRequestRow(hydrated.rows[0], senderId);
  });
}

export async function acceptFriendRequest(userId, requestId, io = null) {
  return withTransaction(async client => {
    const requestResult = await client.query(
      `
        SELECT *
        FROM friend_requests
        WHERE id = $1
          AND receiver_id = $2
          AND status = 'pending'
      `,
      [requestId, userId],
    );

    if (requestResult.rowCount === 0) {
      throw new ApiError(404, "Pending friend request not found.");
    }

    const request = requestResult.rows[0];
    const [lowId, highId] = normalizeUserPair(request.sender_id, request.receiver_id);

    await client.query(
      `
        INSERT INTO friendships (user_low_id, user_high_id)
        VALUES ($1, $2)
        ON CONFLICT (user_low_id, user_high_id) DO NOTHING
      `,
      [lowId, highId],
    );
    await client.query(
      `
        UPDATE friend_requests
        SET status = 'accepted', responded_at = NOW()
        WHERE id = $1
      `,
      [requestId],
    );
    await client.query(
      `
        DELETE FROM friend_requests
        WHERE sender_id = $1
          AND receiver_id = $2
      `,
      [request.receiver_id, request.sender_id],
    );
    await client.query(
      `
        INSERT INTO personal_dialogs (user_low_id, user_high_id)
        VALUES ($1, $2)
        ON CONFLICT (user_low_id, user_high_id) DO NOTHING
      `,
      [lowId, highId],
    );

    emitToUser(io, request.sender_id, "friends:accepted", { userId });
    emitToUser(io, request.receiver_id, "friends:accepted", { userId: request.sender_id });

    return { ok: true };
  });
}

export async function rejectFriendRequest(userId, requestId, io = null) {
  return withTransaction(async client => {
    const requestResult = await client.query(
      `
        SELECT *
        FROM friend_requests
        WHERE id = $1
          AND receiver_id = $2
          AND status = 'pending'
      `,
      [requestId, userId],
    );

    if (requestResult.rowCount === 0) {
      throw new ApiError(404, "Pending friend request not found.");
    }

    const request = requestResult.rows[0];
    await client.query(
      `
        UPDATE friend_requests
        SET status = 'rejected', responded_at = NOW()
        WHERE id = $1
      `,
      [requestId],
    );

    emitToUser(io, request.sender_id, "friends:rejected", { userId });
    return { ok: true };
  });
}

export async function cancelFriendRequest(userId, requestId, io = null) {
  return withTransaction(async client => {
    const requestResult = await client.query(
      `
        SELECT *
        FROM friend_requests
        WHERE id = $1
          AND sender_id = $2
          AND status = 'pending'
      `,
      [requestId, userId],
    );

    if (requestResult.rowCount === 0) {
      throw new ApiError(404, "Pending outgoing friend request not found.");
    }

    const request = requestResult.rows[0];

    await client.query(
      `
        DELETE FROM friend_requests
        WHERE id = $1
      `,
      [requestId],
    );

    emitToUser(io, request.receiver_id, "friends:cancelled", { userId });
    return { ok: true };
  });
}

export async function removeFriend(userId, targetUserId, io = null) {
  const [lowId, highId] = normalizeUserPair(userId, targetUserId);
  await query(
    `
      DELETE FROM friendships
      WHERE user_low_id = $1 AND user_high_id = $2
    `,
    [lowId, highId],
  );

  emitToUser(io, targetUserId, "friends:removed", { userId });
}

export async function banUser(sourceUserId, targetUserId, io = null) {
  if (sourceUserId === targetUserId) {
    throw new ApiError(400, "You cannot ban yourself.");
  }

  return withTransaction(async client => {
    await client.query(
      `
        INSERT INTO user_bans (source_user_id, target_user_id)
        VALUES ($1, $2)
        ON CONFLICT (source_user_id, target_user_id) DO NOTHING
      `,
      [sourceUserId, targetUserId],
    );

    const [lowId, highId] = normalizeUserPair(sourceUserId, targetUserId);
    await client.query(
      `
        DELETE FROM friendships
        WHERE user_low_id = $1 AND user_high_id = $2
      `,
      [lowId, highId],
    );
    await client.query(
      `
        DELETE FROM friend_requests
        WHERE (sender_id = $1 AND receiver_id = $2)
           OR (sender_id = $2 AND receiver_id = $1)
      `,
      [sourceUserId, targetUserId],
    );
    await client.query(
      `
        UPDATE personal_dialogs
        SET is_frozen = TRUE, frozen_reason = 'user_ban', updated_at = NOW()
        WHERE user_low_id = $1 AND user_high_id = $2
      `,
      [lowId, highId],
    );

    emitToUser(io, sourceUserId, "bans:updated", { targetUserId });
    emitToUser(io, targetUserId, "bans:updated", { targetUserId: sourceUserId });

    return { ok: true };
  });
}

export async function unbanUser(sourceUserId, targetUserId, io = null) {
  return withTransaction(async client => {
    await client.query(
      `
        DELETE FROM user_bans
        WHERE source_user_id = $1
          AND target_user_id = $2
      `,
      [sourceUserId, targetUserId],
    );

    const [lowId, highId] = normalizeUserPair(sourceUserId, targetUserId);
    await client.query(
      `
        UPDATE personal_dialogs
        SET is_frozen = FALSE, frozen_reason = NULL, updated_at = NOW()
        WHERE user_low_id = $1
          AND user_high_id = $2
      `,
      [lowId, highId],
    );

    emitToUser(io, sourceUserId, "bans:updated", { targetUserId });
    return { ok: true };
  });
}
