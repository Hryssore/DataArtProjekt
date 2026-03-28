import { Router } from "express";

import { requireAuth } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  getDialogById,
  getOrCreateDialogByOtherUser,
  hideDialogForUser,
  listDialogs,
} from "./service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const dialogs = await listDialogs(request.auth.user.id);
    response.json({ dialogs });
  }),
);

router.get(
  "/:dialogId",
  asyncHandler(async (request, response) => {
    const dialog = await getDialogById(request.auth.user.id, request.params.dialogId);
    response.json({ dialog });
  }),
);

router.post(
  "/with/:otherUserId",
  asyncHandler(async (request, response) => {
    const dialog = await getOrCreateDialogByOtherUser(
      request.auth.user.id,
      request.params.otherUserId,
    );
    response.status(201).json({ dialog });
  }),
);

router.delete(
  "/:dialogId",
  asyncHandler(async (request, response) => {
    const result = await hideDialogForUser(
      request.auth.user.id,
      request.params.dialogId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

export default router;
