import { Router } from "express";
import { z } from "zod";

import { query } from "../../db/pool.js";
import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { ApiError } from "../../utils/apiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { deleteMessageByActor } from "../messages/service.js";
import {
  addRoomAdmin,
  banRoomUser,
  deleteRoom,
  listRoomBans,
  removeRoomAdmin,
  unbanRoomUser,
} from "../rooms/service.js";

const router = Router();

const banSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().max(500).optional().nullable(),
});

const adminSchema = z.object({
  userId: z.string().uuid(),
});

router.use(requireAuth);

router.get(
  "/rooms/:roomId/bans",
  asyncHandler(async (request, response) => {
    const bans = await listRoomBans(request.auth.user.id, request.params.roomId);
    response.json({ bans });
  }),
);

router.post(
  "/rooms/:roomId/members/:userId/remove",
  asyncHandler(async (request, response) => {
    const result = await banRoomUser(
      request.auth.user.id,
      request.params.roomId,
      request.params.userId,
      "Removed by moderator",
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.post(
  "/rooms/:roomId/bans",
  validate(banSchema),
  asyncHandler(async (request, response) => {
    const result = await banRoomUser(
      request.auth.user.id,
      request.params.roomId,
      request.body.userId,
      request.body.reason ?? null,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.delete(
  "/rooms/:roomId/bans/:userId",
  asyncHandler(async (request, response) => {
    const result = await unbanRoomUser(
      request.auth.user.id,
      request.params.roomId,
      request.params.userId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.post(
  "/rooms/:roomId/admins",
  validate(adminSchema),
  asyncHandler(async (request, response) => {
    const result = await addRoomAdmin(
      request.auth.user.id,
      request.params.roomId,
      request.body.userId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.delete(
  "/rooms/:roomId/admins/:userId",
  asyncHandler(async (request, response) => {
    const result = await removeRoomAdmin(
      request.auth.user.id,
      request.params.roomId,
      request.params.userId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.delete(
  "/rooms/:roomId/messages/:messageId",
  asyncHandler(async (request, response) => {
    const messageResult = await query(
      `
        SELECT room_id
        FROM messages
        WHERE id = $1
      `,
      [request.params.messageId],
    );

    if (messageResult.rowCount === 0) {
      throw new ApiError(404, "Message not found.");
    }

    if (messageResult.rows[0].room_id !== request.params.roomId) {
      throw new ApiError(404, "Message not found in this room.");
    }

    const message = await deleteMessageByActor(
      request.auth.user.id,
      request.params.messageId,
      request.app.locals.io,
    );
    response.json({ message });
  }),
);

router.delete(
  "/rooms/:roomId",
  asyncHandler(async (request, response) => {
    const result = await deleteRoom(
      request.auth.user.id,
      request.params.roomId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

export default router;
