import { ApiError } from "./apiError.js";

export async function getRoomAccess(client, roomId, userId) {
  const result = await client.query(
    `
      SELECT
        rooms.id,
        rooms.owner_id,
        rooms.visibility,
        rooms.max_members,
        rooms.level_requirement,
        rooms.category,
        EXISTS (
          SELECT 1
          FROM room_members
          WHERE room_id = rooms.id AND user_id = $2
        ) AS is_member,
        EXISTS (
          SELECT 1
          FROM room_admins
          WHERE room_id = rooms.id AND user_id = $2
        ) AS is_admin,
        EXISTS (
          SELECT 1
          FROM room_bans
          WHERE room_id = rooms.id AND user_id = $2
        ) AS is_banned
      FROM rooms
      WHERE rooms.id = $1
    `,
    [roomId, userId],
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "Room not found.");
  }

  const row = result.rows[0];

  return {
    ...row,
    is_owner: row.owner_id === userId,
  };
}

export async function assertRoomMember(client, roomId, userId) {
  const access = await getRoomAccess(client, roomId, userId);
  if (!access.is_member || access.is_banned) {
    throw new ApiError(403, "You do not have access to this room.");
  }

  return access;
}

export async function assertRoomAdmin(client, roomId, userId) {
  const access = await assertRoomMember(client, roomId, userId);
  if (!access.is_owner && !access.is_admin) {
    throw new ApiError(403, "Room admin permissions are required.");
  }

  return access;
}

export async function assertRoomOwner(client, roomId, userId) {
  const access = await assertRoomMember(client, roomId, userId);
  if (!access.is_owner) {
    throw new ApiError(403, "Only the room owner can perform this action.");
  }

  return access;
}

export async function getDialogAccess(client, dialogId, userId) {
  const result = await client.query(
    `
      SELECT *
      FROM personal_dialogs
      WHERE id = $1
        AND ($2 = user_low_id OR $2 = user_high_id)
    `,
    [dialogId, userId],
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "Dialog not found.");
  }

  return result.rows[0];
}

export async function assertDialogParticipant(client, dialogId, userId) {
  return getDialogAccess(client, dialogId, userId);
}

export async function assertDialogWritable(client, dialogId, userId) {
  const dialog = await assertDialogParticipant(client, dialogId, userId);

  const friendship = await client.query(
    `
      SELECT 1
      FROM friendships
      WHERE user_low_id = LEAST($1, $2)::uuid
        AND user_high_id = GREATEST($1, $2)::uuid
    `,
    [dialog.user_low_id, dialog.user_high_id],
  );

  const ban = await client.query(
    `
      SELECT 1
      FROM user_bans
      WHERE (source_user_id = $1 AND target_user_id = $2)
         OR (source_user_id = $2 AND target_user_id = $1)
    `,
    [dialog.user_low_id, dialog.user_high_id],
  );

  if (dialog.is_frozen || friendship.rowCount === 0 || ban.rowCount > 0) {
    throw new ApiError(403, "This personal dialog is read-only.");
  }

  return dialog;
}
