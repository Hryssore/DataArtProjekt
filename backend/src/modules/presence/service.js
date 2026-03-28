import { query, withTransaction } from "../../db/pool.js";
import { assertDialogParticipant, assertRoomMember } from "../../utils/permissions.js";

function mapPresenceRow(row) {
  return {
    userId: row.user_id ?? row.id,
    username: row.username,
    status: row.status ?? "offline",
    lastActivityAt: row.last_activity_at,
    lastOnlineAt: row.last_online_at,
  };
}

export async function getSelfPresence(userId) {
  const result = await query(
    `
      SELECT user_id, status, last_activity_at, last_online_at
      FROM presence_states
      WHERE user_id = $1
    `,
    [userId],
  );

  return result.rowCount > 0
    ? {
        userId: result.rows[0].user_id,
        status: result.rows[0].status,
        lastActivityAt: result.rows[0].last_activity_at,
        lastOnlineAt: result.rows[0].last_online_at,
      }
    : {
        userId,
        status: "offline",
        lastActivityAt: null,
        lastOnlineAt: null,
      };
}

export async function listUsersPresence(_requestingUserId, userIds) {
  const result = await query(
    `
      SELECT users.id, users.username, presence_states.status, presence_states.last_activity_at, presence_states.last_online_at
      FROM users
      LEFT JOIN presence_states ON presence_states.user_id = users.id
      WHERE users.id = ANY($1::UUID[])
      ORDER BY users.username
    `,
    [userIds],
  );

  return result.rows.map(mapPresenceRow);
}

export async function listRoomPresence(userId, roomId) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const result = await client.query(
      `
        SELECT users.id, users.username, presence_states.status, presence_states.last_activity_at, presence_states.last_online_at
        FROM room_members
        JOIN users ON users.id = room_members.user_id
        LEFT JOIN presence_states ON presence_states.user_id = users.id
        WHERE room_members.room_id = $1
        ORDER BY users.username
      `,
      [roomId],
    );

    return result.rows.map(mapPresenceRow);
  });
}

export async function listDialogPresence(userId, dialogId) {
  return withTransaction(async client => {
    const dialog = await assertDialogParticipant(client, dialogId, userId);

    const result = await client.query(
      `
        SELECT users.id, users.username, presence_states.status, presence_states.last_activity_at, presence_states.last_online_at
        FROM users
        LEFT JOIN presence_states ON presence_states.user_id = users.id
        WHERE users.id = ANY($1::UUID[])
        ORDER BY users.username
      `,
      [[dialog.user_low_id, dialog.user_high_id]],
    );

    return result.rows.map(mapPresenceRow);
  });
}
