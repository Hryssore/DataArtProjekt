import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  acceptFriendRequest,
  banUser,
  cancelFriendRequest,
  createFriendRequest,
  rejectFriendRequest,
  listFriendRequests,
  listFriends,
  removeFriend,
  unbanUser,
} from "./service.js";

const router = Router();

const createRequestSchema = z
  .object({
    username: z.string().min(3).max(32).optional(),
    targetUserId: z.string().uuid().optional(),
    message: z.string().max(500).optional(),
  })
  .refine(payload => payload.username || payload.targetUserId, {
    message: "username or targetUserId is required",
  });

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const friends = await listFriends(request.auth.user.id);
    response.json({ friends });
  }),
);

router.get(
  "/requests",
  asyncHandler(async (request, response) => {
    const requests = await listFriendRequests(request.auth.user.id);
    response.json({ requests });
  }),
);

router.post(
  "/requests",
  validate(createRequestSchema),
  asyncHandler(async (request, response) => {
    const friendRequest = await createFriendRequest(
      request.auth.user.id,
      request.body,
      request.app.locals.io,
    );
    response.status(201).json({ request: friendRequest });
  }),
);

router.post(
  "/requests/:requestId/accept",
  asyncHandler(async (request, response) => {
    const result = await acceptFriendRequest(
      request.auth.user.id,
      request.params.requestId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.post(
  "/requests/:requestId/reject",
  asyncHandler(async (request, response) => {
    const result = await rejectFriendRequest(
      request.auth.user.id,
      request.params.requestId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.delete(
  "/requests/:requestId",
  asyncHandler(async (request, response) => {
    const result = await cancelFriendRequest(
      request.auth.user.id,
      request.params.requestId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.delete(
  "/:userId",
  asyncHandler(async (request, response) => {
    await removeFriend(
      request.auth.user.id,
      request.params.userId,
      request.app.locals.io,
    );
    response.json({ ok: true });
  }),
);

router.post(
  "/bans/:userId",
  asyncHandler(async (request, response) => {
    const result = await banUser(
      request.auth.user.id,
      request.params.userId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.delete(
  "/bans/:userId",
  asyncHandler(async (request, response) => {
    await unbanUser(
      request.auth.user.id,
      request.params.userId,
      request.app.locals.io,
    );
    response.json({ ok: true });
  }),
);

export default router;
