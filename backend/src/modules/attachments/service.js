import { env } from "../../config/env.js";
import { query, withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/apiError.js";
import { deleteFileIfExists, moveUploadedFile } from "../../utils/fileStorage.js";
import { assertDialogParticipant, assertDialogWritable, assertRoomMember } from "../../utils/permissions.js";
import { emitToDialog, emitToRoom } from "../../utils/realtime.js";

function mapAttachmentRow(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    isImage: row.is_image,
    comment: row.comment,
    createdAt: row.created_at,
  };
}

export async function uploadAttachments(userId, messageId, files, comment = null, io = null) {
  if (!files?.length) {
    throw new ApiError(400, "At least one file is required.");
  }

  const createdFiles = [];

  try {
    return await withTransaction(async client => {
      const messageResult = await client.query(
        `SELECT * FROM messages WHERE id = $1`,
        [messageId],
      );

      if (messageResult.rowCount === 0) {
        throw new ApiError(404, "Message not found.");
      }

      const message = messageResult.rows[0];
      if (message.sender_id !== userId) {
        throw new ApiError(403, "Only the message sender can upload attachments.");
      }
      if (message.deleted_at) {
        throw new ApiError(400, "Cannot attach files to a deleted message.");
      }

      if (message.room_id) {
        await assertRoomMember(client, message.room_id, userId);
      }

      if (message.dialog_id) {
        await assertDialogParticipant(client, message.dialog_id, userId);
        await assertDialogWritable(client, message.dialog_id, userId);
      }

      const attachments = [];
      for (const file of files) {
        const isImage = file.mimetype.startsWith("image/");
        if (file.size > env.maxFileSizeBytes) {
          throw new ApiError(400, "File exceeds the maximum file size.");
        }
        if (isImage && file.size > env.maxImageSizeBytes) {
          throw new ApiError(400, "Image exceeds the maximum image size.");
        }

        const moved = await moveUploadedFile(file.path, env.uploadsDir, file.originalname);
        createdFiles.push(moved.storagePath);

        const inserted = await client.query(
          `
            INSERT INTO attachments (
              message_id,
              stored_name,
              original_name,
              mime_type,
              size_bytes,
              is_image,
              storage_path,
              comment
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
          `,
          [
            messageId,
            moved.storedName,
            moved.originalName,
            file.mimetype,
            file.size,
            isImage,
            moved.storagePath,
            comment,
          ],
        );

        attachments.push(mapAttachmentRow(inserted.rows[0]));
      }

      if (message.room_id) {
        emitToRoom(io, message.room_id, "message:attachments-added", {
          contextType: "room",
          roomId: message.room_id,
          messageId,
          attachments,
        });
      } else {
        emitToDialog(io, message.dialog_id, "message:attachments-added", {
          contextType: "dialog",
          dialogId: message.dialog_id,
          messageId,
          attachments,
        });
      }

      return attachments;
    });
  } catch (error) {
    await Promise.all(
      files.map(file => deleteFileIfExists(file.path)).concat(createdFiles.map(deleteFileIfExists)),
    );
    throw error;
  }
}

export async function getAttachmentForDownload(userId, attachmentId) {
  return withTransaction(async client => {
    const result = await client.query(
      `
        SELECT
          attachments.*,
          messages.room_id,
          messages.dialog_id,
          messages.deleted_at
        FROM attachments
        JOIN messages ON messages.id = attachments.message_id
        WHERE attachments.id = $1
      `,
      [attachmentId],
    );

    if (result.rowCount === 0) {
      throw new ApiError(404, "Attachment not found.");
    }

    const attachment = result.rows[0];
    if (attachment.deleted_at) {
      throw new ApiError(404, "Attachment is unavailable.");
    }

    if (attachment.room_id) {
      await assertRoomMember(client, attachment.room_id, userId);
    }

    if (attachment.dialog_id) {
      await assertDialogParticipant(client, attachment.dialog_id, userId);
    }

    return {
      id: attachment.id,
      path: attachment.storage_path,
      originalName: attachment.original_name,
      mimeType: attachment.mime_type,
    };
  });
}
