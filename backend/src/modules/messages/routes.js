import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  addMessageReaction,
  createDialogMessage,
  createRoomMessage,
  deleteMessageByActor,
  getMessageById,
  listDialogMessages,
  listRoomMessages,
  markDialogRead,
  markRoomRead,
  removeMessageReaction,
  translateMessageForUser,
  updateMessage,
} from "./service.js";

const router = Router();

const messageSchema = z.object({
  body: z.string().max(3000).optional(),
  replyToMessageId: z.string().uuid().nullable().optional(),
});

const paginationSchema = z.object({
  before: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const readSchema = z.object({
  lastReadMessageId: z.string().uuid().optional().nullable(),
});

const updateSchema = z.object({
  body: z.string().max(3000).optional(),
});

const translateSchema = z.object({
  targetLanguage: z.string().trim().min(2).max(16).optional().nullable(),
});

const reactionSchema = z.object({
  reaction: z.string().trim().min(1).max(16),
});

router.use(requireAuth);

router.get(
  "/rooms/:roomId",
  validate(paginationSchema, "query"),
  asyncHandler(async (request, response) => {
    const history = await listRoomMessages(
      request.auth.user.id,
      request.params.roomId,
      request.query,
    );
    response.json(history);
  }),
);

router.post(
  "/rooms/:roomId",
  validate(messageSchema),
  asyncHandler(async (request, response) => {
    const message = await createRoomMessage(
      request.auth.user,
      request.params.roomId,
      request.body,
      request.app.locals.io,
    );
    response.status(201).json({ message });
  }),
);

router.post(
  "/rooms/:roomId/read",
  validate(readSchema),
  asyncHandler(async (request, response) => {
    const result = await markRoomRead(
      request.auth.user.id,
      request.params.roomId,
      request.body.lastReadMessageId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.get(
  "/dialogs/:dialogId",
  validate(paginationSchema, "query"),
  asyncHandler(async (request, response) => {
    const history = await listDialogMessages(
      request.auth.user.id,
      request.params.dialogId,
      request.query,
    );
    response.json(history);
  }),
);

router.post(
  "/dialogs/:dialogId",
  validate(messageSchema),
  asyncHandler(async (request, response) => {
    const message = await createDialogMessage(
      request.auth.user,
      request.params.dialogId,
      request.body,
      request.app.locals.io,
    );
    response.status(201).json({ message });
  }),
);

router.post(
  "/dialogs/:dialogId/read",
  validate(readSchema),
  asyncHandler(async (request, response) => {
    const result = await markDialogRead(
      request.auth.user.id,
      request.params.dialogId,
      request.body.lastReadMessageId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.get(
  "/:messageId",
  asyncHandler(async (request, response) => {
    const message = await getMessageById(request.auth.user.id, request.params.messageId);
    response.json({ message });
  }),
);

router.patch(
  "/:messageId",
  validate(updateSchema),
  asyncHandler(async (request, response) => {
    const message = await updateMessage(
      request.auth.user.id,
      request.params.messageId,
      request.body.body,
      request.app.locals.io,
    );
    response.json({ message });
  }),
);

router.post(
  "/:messageId/translate",
  validate(translateSchema),
  asyncHandler(async (request, response) => {
    const translation = await translateMessageForUser(
      request.auth.user,
      request.params.messageId,
      request.body.targetLanguage,
    );
    response.json({ translation });
  }),
);

router.post(
  "/:messageId/reactions",
  validate(reactionSchema),
  asyncHandler(async (request, response) => {
    const message = await addMessageReaction(
      request.auth.user.id,
      request.params.messageId,
      request.body.reaction,
      request.app.locals.io,
    );
    response.status(201).json({ message });
  }),
);

router.post(
  "/:messageId/reactions/remove",
  validate(reactionSchema),
  asyncHandler(async (request, response) => {
    const message = await removeMessageReaction(
      request.auth.user.id,
      request.params.messageId,
      request.body.reaction,
      request.app.locals.io,
    );
    response.json({ message });
  }),
);

router.delete(
  "/:messageId",
  asyncHandler(async (request, response) => {
    const message = await deleteMessageByActor(
      request.auth.user.id,
      request.params.messageId,
      request.app.locals.io,
    );
    response.json({ message });
  }),
);

export default router;
