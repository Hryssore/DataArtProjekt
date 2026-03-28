import { mkdirSync } from "node:fs";
import { basename, join } from "node:path";

import multer from "multer";
import { Router } from "express";

import { env } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { getAttachmentForDownload, uploadAttachments } from "./service.js";

const tempDir = join(env.uploadsDir, ".tmp");
mkdirSync(tempDir, { recursive: true });

const upload = multer({
  dest: tempDir,
  limits: {
    fileSize: env.maxFileSizeBytes,
  },
});

const router = Router();

router.use(requireAuth);

router.post(
  "/messages/:messageId",
  upload.array("files", 10),
  asyncHandler(async (request, response) => {
    const attachments = await uploadAttachments(
      request.auth.user.id,
      request.params.messageId,
      request.files,
      request.body.comment ?? null,
      request.app.locals.io,
    );

    response.status(201).json({ attachments });
  }),
);

router.get(
  "/:attachmentId/download",
  asyncHandler(async (request, response) => {
    const attachment = await getAttachmentForDownload(
      request.auth.user.id,
      request.params.attachmentId,
    );

    response.type(attachment.mimeType);
    if (request.query.inline === "1" || request.query.inline === "true") {
      response.sendFile(attachment.path);
      return;
    }

    response.download(attachment.path, basename(attachment.originalName));
  }),
);

export default router;
