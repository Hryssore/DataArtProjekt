import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/apiError.js";
import { normalizeUserPair } from "../../utils/pairs.js";
import { emitToUser } from "../../utils/realtime.js";

function mapDialogRow(row, userId) {
  const isLowUser = row.user_low_id === userId;

  return {
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isFrozen: row.is_frozen,
    frozenReason: row.frozen_reason,
    canWrite: row.can_write,
    messageCount: Number(row.message_count ?? 0),
    otherUser: {
      id: isLowUser ? row.user_high_id : row.user_low_id,
      username: isLowUser ? row.user_high_username : row.user_low_username,
      displayName: isLowUser ? row.user_high_display_name || row.user_high_username : row.user_low_display_name || row.user_low_username,
      avatarKey: isLowUser ? row.user_high_avatar_key : row.user_low_avatar_key,
      decorationKey: isLowUser ? row.user_high_decoration_key : row.user_low_decoration_key,
      level: Number(isLowUser ? row.user_high_level : row.user_low_level),
      heartsReceived: Number(isLowUser ? row.user_high_hearts_received : row.user_low_hearts_received),
      isLikedByCurrentUser: Boolean(row.viewer_liked_other_user),
      status: row.other_status ?? "offline",
    },
    lastMessage: row.last_message_id
      ? {
          id: row.last_message_id,
          body: row.last_message_body,
          createdAt: row.last_message_created_at,
          senderId: row.last_message_sender_id,
        }
      : null,
  };
}

async function getDialogByIdWithExecutor(executor, userId, dialogId) {
  const result = await executor.query(
    `
      SELECT
        personal_dialogs.*,
        low_user.username AS user_low_username,
        high_user.username AS user_high_username,
        low_user.display_name AS user_low_display_name,
        high_user.display_name AS user_high_display_name,
        low_user.avatar_key AS user_low_avatar_key,
        high_user.avatar_key AS user_high_avatar_key,
        low_user.decoration_key AS user_low_decoration_key,
        high_user.decoration_key AS user_high_decoration_key,
        low_user.level AS user_low_level,
        high_user.level AS user_high_level,
        low_user.hearts_received AS user_low_hearts_received,
        high_user.hearts_received AS user_high_hearts_received,
        EXISTS (
          SELECT 1
          FROM profile_hearts
          WHERE sender_user_id = $1
            AND target_user_id = CASE
              WHEN personal_dialogs.user_low_id = $1 THEN personal_dialogs.user_high_id
              ELSE personal_dialogs.user_low_id
            END
        ) AS viewer_liked_other_user,
        other_presence.status AS other_status,
        NULL::UUID AS last_message_id,
        NULL::TEXT AS last_message_body,
        NULL::TIMESTAMPTZ AS last_message_created_at,
        NULL::UUID AS last_message_sender_id,
        (
          SELECT COUNT(*)::INT
          FROM messages
          WHERE dialog_id = personal_dialogs.id
            AND deleted_at IS NULL
        ) AS message_count,
        (
          EXISTS (
            SELECT 1
            FROM friendships
            WHERE user_low_id = personal_dialogs.user_low_id
              AND user_high_id = personal_dialogs.user_high_id
          )
          AND NOT personal_dialogs.is_frozen
          AND NOT EXISTS (
            SELECT 1
            FROM user_bans
            WHERE (source_user_id = personal_dialogs.user_low_id AND target_user_id = personal_dialogs.user_high_id)
               OR (source_user_id = personal_dialogs.user_high_id AND target_user_id = personal_dialogs.user_low_id)
          )
        ) AS can_write
      FROM personal_dialogs
      JOIN users AS low_user ON low_user.id = personal_dialogs.user_low_id
      JOIN users AS high_user ON high_user.id = personal_dialogs.user_high_id
      LEFT JOIN presence_states AS other_presence
        ON other_presence.user_id = CASE
          WHEN personal_dialogs.user_low_id = $1 THEN personal_dialogs.user_high_id
          ELSE personal_dialogs.user_low_id
        END
      WHERE personal_dialogs.id = $2
        AND ($1 = personal_dialogs.user_low_id OR $1 = personal_dialogs.user_high_id)
        AND (
          CASE
            WHEN personal_dialogs.user_low_id = $1 THEN personal_dialogs.hidden_for_low_user_at IS NULL
            ELSE personal_dialogs.hidden_for_high_user_at IS NULL
          END
        )
    `,
    [userId, dialogId],
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "Dialog not found.");
  }

  return mapDialogRow(result.rows[0], userId);
}

export async function listDialogs(userId) {
  const result = await query(
    `
      SELECT
        personal_dialogs.*,
        low_user.username AS user_low_username,
        high_user.username AS user_high_username,
        low_user.display_name AS user_low_display_name,
        high_user.display_name AS user_high_display_name,
        low_user.avatar_key AS user_low_avatar_key,
        high_user.avatar_key AS user_high_avatar_key,
        low_user.decoration_key AS user_low_decoration_key,
        high_user.decoration_key AS user_high_decoration_key,
        low_user.level AS user_low_level,
        high_user.level AS user_high_level,
        low_user.hearts_received AS user_low_hearts_received,
        high_user.hearts_received AS user_high_hearts_received,
        EXISTS (
          SELECT 1
          FROM profile_hearts
          WHERE sender_user_id = $1
            AND target_user_id = CASE
              WHEN personal_dialogs.user_low_id = $1 THEN personal_dialogs.user_high_id
              ELSE personal_dialogs.user_low_id
            END
        ) AS viewer_liked_other_user,
        other_presence.status AS other_status,
        last_message.id AS last_message_id,
        last_message.body AS last_message_body,
        last_message.created_at AS last_message_created_at,
        last_message.sender_id AS last_message_sender_id,
        (
          SELECT COUNT(*)::INT
          FROM messages
          WHERE dialog_id = personal_dialogs.id
            AND deleted_at IS NULL
        ) AS message_count,
        (
          EXISTS (
            SELECT 1
            FROM friendships
            WHERE user_low_id = personal_dialogs.user_low_id
              AND user_high_id = personal_dialogs.user_high_id
          )
          AND NOT personal_dialogs.is_frozen
          AND NOT EXISTS (
            SELECT 1
            FROM user_bans
            WHERE (source_user_id = personal_dialogs.user_low_id AND target_user_id = personal_dialogs.user_high_id)
               OR (source_user_id = personal_dialogs.user_high_id AND target_user_id = personal_dialogs.user_low_id)
          )
        ) AS can_write
      FROM personal_dialogs
      JOIN users AS low_user ON low_user.id = personal_dialogs.user_low_id
      JOIN users AS high_user ON high_user.id = personal_dialogs.user_high_id
      LEFT JOIN presence_states AS other_presence
        ON other_presence.user_id = CASE
          WHEN personal_dialogs.user_low_id = $1 THEN personal_dialogs.user_high_id
          ELSE personal_dialogs.user_low_id
        END
      LEFT JOIN LATERAL (
        SELECT id, body, created_at, sender_id
        FROM messages
        WHERE dialog_id = personal_dialogs.id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS last_message ON TRUE
      WHERE (personal_dialogs.user_low_id = $1 OR personal_dialogs.user_high_id = $1)
        AND (
          CASE
            WHEN personal_dialogs.user_low_id = $1 THEN personal_dialogs.hidden_for_low_user_at IS NULL
            ELSE personal_dialogs.hidden_for_high_user_at IS NULL
          END
        )
      ORDER BY COALESCE(last_message.created_at, personal_dialogs.created_at) DESC
    `,
    [userId],
  );

  return result.rows.map(row => mapDialogRow(row, userId));
}

export async function getDialogById(userId, dialogId) {
  return getDialogByIdWithExecutor({ query }, userId, dialogId);
}

export async function getOrCreateDialogByOtherUser(userId, otherUserId) {
  return withTransaction(async client => {
    const [lowId, highId] = normalizeUserPair(userId, otherUserId);
    const existing = await client.query(
      `
        SELECT id
        FROM personal_dialogs
        WHERE user_low_id = $1 AND user_high_id = $2
      `,
      [lowId, highId],
    );

    if (existing.rowCount > 0) {
      await client.query(
        `
          UPDATE personal_dialogs
          SET
            hidden_for_low_user_at = CASE WHEN user_low_id = $2 THEN NULL ELSE hidden_for_low_user_at END,
            hidden_for_high_user_at = CASE WHEN user_high_id = $2 THEN NULL ELSE hidden_for_high_user_at END,
            updated_at = NOW()
          WHERE id = $1
        `,
        [existing.rows[0].id, userId],
      );
      return getDialogByIdWithExecutor(client, userId, existing.rows[0].id);
    }

    const users = await client.query(
      `
        SELECT id
        FROM users
        WHERE id = ANY($1::UUID[])
          AND deleted_at IS NULL
      `,
      [[userId, otherUserId]],
    );

    if (users.rowCount !== 2) {
      throw new ApiError(404, "User not found.");
    }

    const friendship = await client.query(
      `
        SELECT 1
        FROM friendships
        WHERE user_low_id = $1 AND user_high_id = $2
      `,
      [lowId, highId],
    );

    if (friendship.rowCount === 0) {
      throw new ApiError(403, "Personal dialogs can only be started between friends.");
    }

    const ban = await client.query(
      `
        SELECT 1
        FROM user_bans
        WHERE (source_user_id = $1 AND target_user_id = $2)
           OR (source_user_id = $2 AND target_user_id = $1)
      `,
      [userId, otherUserId],
    );

    if (ban.rowCount > 0) {
      throw new ApiError(403, "A user ban blocks personal messaging.");
    }

    const created = await client.query(
      `
        INSERT INTO personal_dialogs (user_low_id, user_high_id)
        VALUES ($1, $2)
        RETURNING id
      `,
      [lowId, highId],
    );

    return getDialogByIdWithExecutor(client, userId, created.rows[0].id);
  });
}

export async function hideDialogForUser(userId, dialogId, io = null) {
  return withTransaction(async client => {
    const dialogResult = await client.query(
      `
        SELECT *
        FROM personal_dialogs
        WHERE id = $1
          AND ($2 = user_low_id OR $2 = user_high_id)
      `,
      [dialogId, userId],
    );

    if (dialogResult.rowCount === 0) {
      throw new ApiError(404, "Dialog not found.");
    }

    const dialog = dialogResult.rows[0];
    const latestMessage = await client.query(
      `
        SELECT id
        FROM messages
        WHERE dialog_id = $1
          AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [dialogId],
    );

    await client.query(
      `
        UPDATE personal_dialogs
        SET
          hidden_for_low_user_at = CASE WHEN user_low_id = $2 THEN NOW() ELSE hidden_for_low_user_at END,
          hidden_for_high_user_at = CASE WHEN user_high_id = $2 THEN NOW() ELSE hidden_for_high_user_at END,
          updated_at = NOW()
        WHERE id = $1
      `,
      [dialogId, userId],
    );

    const updatedRead = await client.query(
      `
        UPDATE conversation_reads
        SET
          last_read_message_id = $3,
          updated_at = NOW()
        WHERE user_id = $1
          AND dialog_id = $2
      `,
      [userId, dialogId, latestMessage.rows[0]?.id ?? null],
    );

    if (updatedRead.rowCount === 0) {
      await client.query(
        `
          INSERT INTO conversation_reads (user_id, dialog_id, last_read_message_id, updated_at)
          VALUES ($1, $2, $3, NOW())
        `,
        [userId, dialogId, latestMessage.rows[0]?.id ?? null],
      );
    }

    await client.query(
      `
        UPDATE personal_dialogs
        SET updated_at = NOW()
        WHERE id = $1
      `,
      [dialogId],
    );

    emitToUser(io, userId, "dialogs:updated", { dialogId });

    return { ok: true, dialogId, hiddenByUserId: userId, otherUserId: dialog.user_low_id === userId ? dialog.user_high_id : dialog.user_low_id };
  });
}
