import { query } from "../../db/pool.js";

export async function getUnreadSummary(userId) {
  const roomsResult = await query(
    `
      SELECT
        rooms.id AS room_id,
        rooms.name,
        COUNT(messages.id)::INT AS unread_count
      FROM room_members
      JOIN rooms ON rooms.id = room_members.room_id
      LEFT JOIN conversation_reads
        ON conversation_reads.room_id = rooms.id
       AND conversation_reads.user_id = $1
      LEFT JOIN messages
        ON messages.room_id = rooms.id
       AND messages.deleted_at IS NULL
       AND messages.sender_id IS DISTINCT FROM $1
       AND messages.created_at > COALESCE(conversation_reads.updated_at, TO_TIMESTAMP(0))
      WHERE room_members.user_id = $1
      GROUP BY rooms.id, rooms.name
      ORDER BY rooms.name
    `,
    [userId],
  );

  const dialogsResult = await query(
    `
      SELECT
        personal_dialogs.id AS dialog_id,
        other_user.id AS other_user_id,
        other_user.username AS other_username,
        COUNT(messages.id)::INT AS unread_count
      FROM personal_dialogs
      JOIN users AS other_user
        ON other_user.id = CASE
          WHEN personal_dialogs.user_low_id = $1 THEN personal_dialogs.user_high_id
          ELSE personal_dialogs.user_low_id
        END
      LEFT JOIN conversation_reads
        ON conversation_reads.dialog_id = personal_dialogs.id
       AND conversation_reads.user_id = $1
      LEFT JOIN messages
        ON messages.dialog_id = personal_dialogs.id
       AND messages.deleted_at IS NULL
       AND messages.sender_id IS DISTINCT FROM $1
       AND messages.created_at > COALESCE(conversation_reads.updated_at, TO_TIMESTAMP(0))
      WHERE personal_dialogs.user_low_id = $1 OR personal_dialogs.user_high_id = $1
      GROUP BY personal_dialogs.id, other_user.id, other_user.username
      ORDER BY other_user.username
    `,
    [userId],
  );

  return {
    rooms: roomsResult.rows.map(row => ({
      roomId: row.room_id,
      name: row.name,
      unreadCount: row.unread_count,
    })),
    dialogs: dialogsResult.rows.map(row => ({
      dialogId: row.dialog_id,
      otherUserId: row.other_user_id,
      otherUsername: row.other_username,
      unreadCount: row.unread_count,
    })),
  };
}
