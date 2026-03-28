import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  getSelfPresence,
  listDialogPresence,
  listRoomPresence,
  listUsersPresence,
} from "./service.js";

const router = Router();

const querySchema = z.object({
  ids: z.string().optional().default(""),
});

router.use(requireAuth);

router.get(
  "/self",
  asyncHandler(async (request, response) => {
    const presence = await getSelfPresence(request.auth.user.id);
    response.json({ presence });
  }),
);

router.get(
  "/users",
  validate(querySchema, "query"),
  asyncHandler(async (request, response) => {
    const ids = request.query.ids
      .split(",")
      .map(value => value.trim())
      .filter(Boolean);
    const presence = ids.length
      ? await listUsersPresence(request.auth.user.id, ids)
      : [];
    response.json({ presence });
  }),
);

router.get(
  "/rooms/:roomId",
  asyncHandler(async (request, response) => {
    const presence = await listRoomPresence(request.auth.user.id, request.params.roomId);
    response.json({ presence });
  }),
);

router.get(
  "/dialogs/:dialogId",
  asyncHandler(async (request, response) => {
    const presence = await listDialogPresence(request.auth.user.id, request.params.dialogId);
    response.json({ presence });
  }),
);

export default router;
