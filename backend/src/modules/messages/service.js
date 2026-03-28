import { Buffer } from "node:buffer";

import { env } from "../../config/env.js";
import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/apiError.js";
import { getLanguageLabel, normalizeLanguageCode } from "../../utils/languages.js";
import { clampLimit } from "../../utils/pairs.js";
import { awardUserProgress } from "../../utils/progressionStore.js";
import { translateText } from "../../utils/translation.js";
import { assertDialogParticipant, assertDialogWritable, assertRoomAdmin, assertRoomMember } from "../../utils/permissions.js";
import { emitToDialog, emitToRoom } from "../../utils/realtime.js";

function mapMessageRow(row, attachments, reactions = []) {
  const senderUsername = row.sender_username ?? row.sender_username_snapshot;
  const senderDisplayName = row.sender_display_name || senderUsername;

  return {
    id: row.id,
    roomId: row.room_id,
    dialogId: row.dialog_id,
    sender: {
      id: row.sender_id,
      username: senderUsername,
      displayName: senderDisplayName,
      avatarKey: row.sender_avatar_key,
      decorationKey: row.sender_decoration_key,
      level: Number(row.sender_level ?? 1),
    },
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    editedAt: row.edited_at,
    isEdited: Boolean(row.edited_at),
    deletedAt: row.deleted_at,
    isDeleted: Boolean(row.deleted_at),
    replyTo: row.reply_id
      ? {
          id: row.reply_id,
          body: row.reply_body,
          senderUsername: row.reply_sender_username,
          senderDisplayName: row.reply_sender_display_name || row.reply_sender_username,
        }
      : null,
    attachments,
    reactions,
  };
}

async function loadAttachments(client, messageIds) {
  if (messageIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `
      SELECT *
      FROM attachments
      WHERE message_id = ANY($1::UUID[])
      ORDER BY created_at ASC
    `,
    [messageIds],
  );

  const map = new Map();
  for (const row of result.rows) {
    const current = map.get(row.message_id) ?? [];
    current.push({
      id: row.id,
      originalName: row.original_name,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      isImage: row.is_image,
      comment: row.comment,
      createdAt: row.created_at,
    });
    map.set(row.message_id, current);
  }

  return map;
}

async function loadReactions(client, messageIds) {
  if (messageIds.length === 0) {
    return new Map();
  }

  const result = await client.query(
    `
      SELECT
        message_id,
        reaction,
        COUNT(*)::INT AS reaction_count,
        ARRAY_AGG(user_id::TEXT ORDER BY created_at ASC) AS reacted_user_ids,
        MIN(created_at) AS first_created_at
      FROM message_reactions
      WHERE message_id = ANY($1::UUID[])
      GROUP BY message_id, reaction
      ORDER BY first_created_at ASC, reaction ASC
    `,
    [messageIds],
  );

  const map = new Map();
  for (const row of result.rows) {
    const current = map.get(row.message_id) ?? [];
    current.push({
      reaction: row.reaction,
      count: Number(row.reaction_count ?? 0),
      reactedUserIds: row.reacted_user_ids ?? [],
    });
    map.set(row.message_id, current);
  }

  return map;
}

function assertMessageBody(body) {
  if (!body) {
    return;
  }

  if (Buffer.byteLength(body, "utf8") > env.maxTextBytes) {
    throw new ApiError(400, `Message text exceeds ${env.maxTextBytes} bytes.`);
  }
}

function normalizeReactionValue(reaction) {
  return String(reaction ?? "").trim();
}

function assertReactionValue(reaction) {
  const normalized = normalizeReactionValue(reaction);

  if (!normalized || normalized.length > 16 || /\s/u.test(normalized)) {
    throw new ApiError(400, "Reaction must be a compact emoji or short token.");
  }

  return normalized;
}

function getProgressReward(body) {
  const text = body ?? "";
  return {
    xpDelta: Math.min(600, Buffer.byteLength(text, "utf8")),
  };
}

async function ensureReplyMessage(client, payload, roomId, dialogId) {
  if (!payload.replyToMessageId) {
    return null;
  }

  const result = await client.query(
    `
      SELECT id
      FROM messages
      WHERE id = $1
        AND room_id IS NOT DISTINCT FROM $2
        AND dialog_id IS NOT DISTINCT FROM $3
    `,
    [payload.replyToMessageId, roomId, dialogId],
  );

  if (result.rowCount === 0) {
    throw new ApiError(400, "Reply target must belong to the same conversation.");
  }

  return payload.replyToMessageId;
}

async function buildPaginatedMessages(client, rows) {
  const orderedRows = [...rows].reverse();
  const attachments = await loadAttachments(
    client,
    orderedRows.map(row => row.id),
  );
  const reactions = await loadReactions(
    client,
    orderedRows.map(row => row.id),
  );

  return orderedRows.map(row =>
    mapMessageRow(row, attachments.get(row.id) ?? [], reactions.get(row.id) ?? []),
  );
}

async function loadMessageDto(client, messageId) {
  const result = await client.query(
    `
      SELECT
        messages.*,
        sender_user.username AS sender_username,
        sender_user.display_name AS sender_display_name,
        sender_user.avatar_key AS sender_avatar_key,
        sender_user.decoration_key AS sender_decoration_key,
        sender_user.level AS sender_level,
        reply.id AS reply_id,
        reply.body AS reply_body,
        COALESCE(reply_sender_user.username, reply.sender_username_snapshot) AS reply_sender_username,
        reply_sender_user.display_name AS reply_sender_display_name
      FROM messages
      LEFT JOIN users AS sender_user ON sender_user.id = messages.sender_id
      LEFT JOIN messages AS reply ON reply.id = messages.reply_to_message_id
      LEFT JOIN users AS reply_sender_user ON reply_sender_user.id = reply.sender_id
      WHERE messages.id = $1
    `,
    [messageId],
  );

  const attachments = await loadAttachments(client, [messageId]);
  const reactions = await loadReactions(client, [messageId]);
  return mapMessageRow(
    result.rows[0],
    attachments.get(messageId) ?? [],
    reactions.get(messageId) ?? [],
  );
}

export async function listRoomMessages(userId, roomId, pagination) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const limit = clampLimit(pagination.limit, 30, 1, 100);
    const before = pagination.before ? new Date(pagination.before) : new Date();
    const result = await client.query(
      `
        SELECT
          messages.*,
          sender_user.username AS sender_username,
          sender_user.display_name AS sender_display_name,
          sender_user.avatar_key AS sender_avatar_key,
          sender_user.decoration_key AS sender_decoration_key,
          sender_user.level AS sender_level,
          reply.id AS reply_id,
          reply.body AS reply_body,
          COALESCE(reply_sender_user.username, reply.sender_username_snapshot) AS reply_sender_username,
          reply_sender_user.display_name AS reply_sender_display_name
        FROM messages
        LEFT JOIN users AS sender_user ON sender_user.id = messages.sender_id
        LEFT JOIN messages AS reply ON reply.id = messages.reply_to_message_id
        LEFT JOIN users AS reply_sender_user ON reply_sender_user.id = reply.sender_id
        WHERE messages.room_id = $1
          AND messages.created_at < $2
        ORDER BY messages.created_at DESC
        LIMIT $3
      `,
      [roomId, before.toISOString(), limit + 1],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    return {
      messages: await buildPaginatedMessages(client, rows),
      nextCursor: hasMore ? rows[rows.length - 1].created_at : null,
      hasMore,
    };
  });
}

export async function listDialogMessages(userId, dialogId, pagination) {
  return withTransaction(async client => {
    await assertDialogParticipant(client, dialogId, userId);

    const limit = clampLimit(pagination.limit, 30, 1, 100);
    const before = pagination.before ? new Date(pagination.before) : new Date();
    const result = await client.query(
      `
        SELECT
          messages.*,
          sender_user.username AS sender_username,
          sender_user.display_name AS sender_display_name,
          sender_user.avatar_key AS sender_avatar_key,
          sender_user.decoration_key AS sender_decoration_key,
          sender_user.level AS sender_level,
          reply.id AS reply_id,
          reply.body AS reply_body,
          COALESCE(reply_sender_user.username, reply.sender_username_snapshot) AS reply_sender_username,
          reply_sender_user.display_name AS reply_sender_display_name
        FROM messages
        LEFT JOIN users AS sender_user ON sender_user.id = messages.sender_id
        LEFT JOIN messages AS reply ON reply.id = messages.reply_to_message_id
        LEFT JOIN users AS reply_sender_user ON reply_sender_user.id = reply.sender_id
        WHERE messages.dialog_id = $1
          AND messages.created_at < $2
        ORDER BY messages.created_at DESC
        LIMIT $3
      `,
      [dialogId, before.toISOString(), limit + 1],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;

    return {
      messages: await buildPaginatedMessages(client, rows),
      nextCursor: hasMore ? rows[rows.length - 1].created_at : null,
      hasMore,
    };
  });
}

export async function createRoomMessage(user, roomId, payload, io = null) {
  assertMessageBody(payload.body ?? "");

  return withTransaction(async client => {
    await assertRoomMember(client, roomId, user.id);
    const replyToMessageId = await ensureReplyMessage(client, payload, roomId, null);

    const created = await client.query(
      `
        INSERT INTO messages (
          room_id,
          sender_id,
          sender_username_snapshot,
          body,
          reply_to_message_id
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [roomId, user.id, user.username, payload.body ?? "", replyToMessageId],
    );

    const message = await loadMessageDto(client, created.rows[0].id);
    const reward = getProgressReward(payload.body ?? "");
    await awardUserProgress(client, user.id, "message_room", message.id, reward.xpDelta);
    emitToRoom(io, roomId, "message:created", { contextType: "room", roomId, message });
    emitToRoom(io, roomId, "unread:refresh", { contextType: "room", roomId });
    return message;
  });
}

export async function createDialogMessage(user, dialogId, payload, io = null) {
  assertMessageBody(payload.body ?? "");

  return withTransaction(async client => {
    await assertDialogWritable(client, dialogId, user.id);
    const replyToMessageId = await ensureReplyMessage(client, payload, null, dialogId);

    const created = await client.query(
      `
        INSERT INTO messages (
          dialog_id,
          sender_id,
          sender_username_snapshot,
          body,
          reply_to_message_id
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [dialogId, user.id, user.username, payload.body ?? "", replyToMessageId],
    );

    await client.query(
      `
        UPDATE personal_dialogs
        SET
          hidden_for_low_user_at = NULL,
          hidden_for_high_user_at = NULL,
          updated_at = NOW()
        WHERE id = $1
      `,
      [dialogId],
    );

    const message = await loadMessageDto(client, created.rows[0].id);
    const reward = getProgressReward(payload.body ?? "");
    await awardUserProgress(client, user.id, "message_dialog", message.id, reward.xpDelta);
    emitToDialog(io, dialogId, "message:created", { contextType: "dialog", dialogId, message });
    emitToDialog(io, dialogId, "unread:refresh", { contextType: "dialog", dialogId });
    return message;
  });
}

export async function updateMessage(userId, messageId, body, io = null) {
  assertMessageBody(body ?? "");

  return withTransaction(async client => {
    const result = await client.query(
      `SELECT * FROM messages WHERE id = $1`,
      [messageId],
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "Message not found.");
    }

    const message = result.rows[0];
    if (message.sender_id !== userId) {
      throw new ApiError(403, "Only the sender can edit this message.");
    }

    if (message.deleted_at) {
      throw new ApiError(400, "Deleted messages cannot be edited.");
    }

    if (message.room_id) {
      await assertRoomMember(client, message.room_id, userId);
    }

    if (message.dialog_id) {
      await assertDialogParticipant(client, message.dialog_id, userId);
    }

    const updated = await client.query(
      `
        UPDATE messages
        SET body = $2, edited_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [messageId, body ?? ""],
    );

    const dto = await loadMessageDto(client, updated.rows[0].id);

    if (dto.roomId) {
      emitToRoom(io, dto.roomId, "message:updated", { contextType: "room", roomId: dto.roomId, message: dto });
    } else {
      emitToDialog(io, dto.dialogId, "message:updated", { contextType: "dialog", dialogId: dto.dialogId, message: dto });
    }

    return dto;
  });
}

export async function deleteMessageByActor(actorId, messageId, io = null) {
  return withTransaction(async client => {
    const result = await client.query(`SELECT * FROM messages WHERE id = $1`, [messageId]);
    if (result.rowCount === 0) {
      throw new ApiError(404, "Message not found.");
    }

    const message = result.rows[0];
    let allowed = message.sender_id === actorId;

    if (message.room_id && !allowed) {
      await assertRoomAdmin(client, message.room_id, actorId);
      allowed = true;
    }

    if (message.dialog_id && !allowed) {
      throw new ApiError(403, "Only the sender can delete dialog messages.");
    }

    if (!allowed) {
      throw new ApiError(403, "You do not have permission to delete this message.");
    }

    await client.query(`DELETE FROM message_reactions WHERE message_id = $1`, [messageId]);

    const updated = await client.query(
      `
        UPDATE messages
        SET body = '', deleted_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [messageId],
    );

    const dto = await loadMessageDto(client, updated.rows[0].id);

    if (dto.roomId) {
      emitToRoom(io, dto.roomId, "message:deleted", { contextType: "room", roomId: dto.roomId, message: dto });
    } else {
      emitToDialog(io, dto.dialogId, "message:deleted", { contextType: "dialog", dialogId: dto.dialogId, message: dto });
    }

    return dto;
  });
}

export async function addMessageReaction(userId, messageId, reaction, io = null) {
  const normalizedReaction = assertReactionValue(reaction);

  return withTransaction(async client => {
    const result = await client.query(`SELECT * FROM messages WHERE id = $1`, [messageId]);
    if (result.rowCount === 0) {
      throw new ApiError(404, "Message not found.");
    }

    const message = result.rows[0];
    if (message.deleted_at) {
      throw new ApiError(400, "Deleted messages cannot be reacted to.");
    }

    if (message.room_id) {
      await assertRoomMember(client, message.room_id, userId);
    }

    if (message.dialog_id) {
      await assertDialogParticipant(client, message.dialog_id, userId);
    }

    await client.query(
      `
        INSERT INTO message_reactions (message_id, user_id, reaction)
        VALUES ($1, $2, $3)
        ON CONFLICT (message_id, user_id, reaction) DO NOTHING
      `,
      [messageId, userId, normalizedReaction],
    );

    const dto = await loadMessageDto(client, messageId);

    if (dto.roomId) {
      emitToRoom(io, dto.roomId, "message:updated", {
        contextType: "room",
        roomId: dto.roomId,
        message: dto,
      });
    } else {
      emitToDialog(io, dto.dialogId, "message:updated", {
        contextType: "dialog",
        dialogId: dto.dialogId,
        message: dto,
      });
    }

    return dto;
  });
}

export async function removeMessageReaction(userId, messageId, reaction, io = null) {
  const normalizedReaction = assertReactionValue(reaction);

  return withTransaction(async client => {
    const result = await client.query(`SELECT * FROM messages WHERE id = $1`, [messageId]);
    if (result.rowCount === 0) {
      throw new ApiError(404, "Message not found.");
    }

    const message = result.rows[0];
    if (message.room_id) {
      await assertRoomMember(client, message.room_id, userId);
    }

    if (message.dialog_id) {
      await assertDialogParticipant(client, message.dialog_id, userId);
    }

    await client.query(
      `
        DELETE FROM message_reactions
        WHERE message_id = $1
          AND user_id = $2
          AND reaction = $3
      `,
      [messageId, userId, normalizedReaction],
    );

    const dto = await loadMessageDto(client, messageId);

    if (dto.roomId) {
      emitToRoom(io, dto.roomId, "message:updated", {
        contextType: "room",
        roomId: dto.roomId,
        message: dto,
      });
    } else {
      emitToDialog(io, dto.dialogId, "message:updated", {
        contextType: "dialog",
        dialogId: dto.dialogId,
        message: dto,
      });
    }

    return dto;
  });
}

async function upsertConversationRead(client, userId, roomId, dialogId, lastReadMessageId) {
  if (roomId) {
    await client.query(
      `
        INSERT INTO conversation_reads (user_id, room_id, dialog_id, last_read_message_id)
        VALUES ($1, $2, NULL, $3)
        ON CONFLICT (user_id, room_id) WHERE room_id IS NOT NULL
        DO UPDATE SET
          last_read_message_id = EXCLUDED.last_read_message_id,
          updated_at = NOW()
      `,
      [userId, roomId, lastReadMessageId],
    );

    return;
  }

  await client.query(
    `
      INSERT INTO conversation_reads (user_id, room_id, dialog_id, last_read_message_id)
      VALUES ($1, NULL, $2, $3)
      ON CONFLICT (user_id, dialog_id) WHERE dialog_id IS NOT NULL
      DO UPDATE SET
        last_read_message_id = EXCLUDED.last_read_message_id,
        updated_at = NOW()
    `,
    [userId, dialogId, lastReadMessageId],
  );
}

export async function markRoomRead(userId, roomId, lastReadMessageId, io = null) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);
    await upsertConversationRead(client, userId, roomId, null, lastReadMessageId ?? null);
    emitToRoom(io, roomId, "unread:refresh", { contextType: "room", roomId });
    return { ok: true };
  });
}

export async function markDialogRead(userId, dialogId, lastReadMessageId, io = null) {
  return withTransaction(async client => {
    await assertDialogParticipant(client, dialogId, userId);
    await upsertConversationRead(client, userId, null, dialogId, lastReadMessageId ?? null);
    emitToDialog(io, dialogId, "unread:refresh", { contextType: "dialog", dialogId });
    return { ok: true };
  });
}

export async function getMessageById(userId, messageId) {
  return withTransaction(async client => {
    const result = await client.query(`SELECT * FROM messages WHERE id = $1`, [messageId]);
    if (result.rowCount === 0) {
      throw new ApiError(404, "Message not found.");
    }

    const message = result.rows[0];
    if (message.room_id) {
      await assertRoomMember(client, message.room_id, userId);
    }
    if (message.dialog_id) {
      await assertDialogParticipant(client, message.dialog_id, userId);
    }

    return loadMessageDto(client, messageId);
  });
}

export async function translateMessageForUser(user, messageId, requestedTargetLanguage) {
  return withTransaction(async client => {
    const result = await client.query(`SELECT * FROM messages WHERE id = $1`, [messageId]);
    if (result.rowCount === 0) {
      throw new ApiError(404, "Message not found.");
    }

    const message = result.rows[0];
    if (message.room_id) {
      await assertRoomMember(client, message.room_id, user.id);
    }
    if (message.dialog_id) {
      await assertDialogParticipant(client, message.dialog_id, user.id);
    }

    if (message.deleted_at) {
      throw new ApiError(400, "Deleted messages cannot be translated.");
    }

    const body = message.body?.trim();
    if (!body) {
      throw new ApiError(400, "Only text messages can be translated.");
    }

    const targetLanguage = normalizeLanguageCode(
      requestedTargetLanguage || user.preferredLanguage || "",
    );
    if (!targetLanguage) {
      throw new ApiError(400, "Set your main language in profile before translating messages.");
    }

    const translation = await translateText(body, targetLanguage);
    return {
      messageId,
      originalText: body,
      translatedText: translation.translatedText,
      targetLanguage: translation.targetLanguage,
      targetLanguageLabel: translation.targetLanguageLabel,
      detectedSourceLanguage: translation.detectedSourceLanguage,
      detectedSourceLanguageLabel:
        translation.detectedSourceLanguageLabel ||
        getLanguageLabel(translation.detectedSourceLanguage),
      provider: translation.provider,
    };
  });
}
