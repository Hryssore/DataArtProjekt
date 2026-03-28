import { Router } from "express";
import { z } from "zod";

import { env, getSessionCookieOptions } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { disconnectUserSockets } from "../../utils/realtime.js";
import { getUnreadSummary } from "../unread/service.js";
import {
  deleteAccount,
  getCurrentUserProfile,
  getUserProfileById,
  getLeaderboard,
  giveHeartToUser,
  searchUsers,
  updateCurrentUserProfile,
} from "./service.js";

const router = Router();

const searchSchema = z.object({
  query: z.string().min(1).max(32),
});

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(48),
  bio: z.string().trim().max(280).optional().default(""),
  preferredLanguage: z.string().trim().max(32).optional().nullable(),
  avatarKey: z.string().trim().max(64).optional().nullable(),
  decorationKey: z.string().trim().max(64).optional().nullable(),
  profileBackgroundKey: z.string().trim().max(64).optional().nullable(),
  skillFocus: z.string().trim().max(64).optional().nullable(),
  assessmentSummary: z.string().trim().max(500).optional().nullable(),
});

const leaderboardSchema = z.object({
  period: z.enum(["day", "week", "month"]).optional().default("week"),
});

router.use(requireAuth);

router.get(
  "/me",
  asyncHandler(async (request, response) => {
    const user = await getCurrentUserProfile(request.auth.user.id);
    response.json({ user });
  }),
);

router.patch(
  "/me",
  validate(profileSchema),
  asyncHandler(async (request, response) => {
    const user = await updateCurrentUserProfile(request.auth.user.id, request.body);
    response.json({ user });
  }),
);

router.get(
  "/search",
  validate(searchSchema, "query"),
  asyncHandler(async (request, response) => {
    const users = await searchUsers(request.auth.user.id, request.query.query);
    response.json({ users });
  }),
);

router.get(
  "/me/unread",
  asyncHandler(async (request, response) => {
    const unread = await getUnreadSummary(request.auth.user.id);
    response.json(unread);
  }),
);

router.post(
  "/:userId/hearts",
  asyncHandler(async (request, response) => {
    const user = await giveHeartToUser(request.auth.user.id, request.params.userId);
    response.json({ user });
  }),
);

router.get(
  "/leaderboard",
  validate(leaderboardSchema, "query"),
  asyncHandler(async (request, response) => {
    const result = await getLeaderboard(request.query.period, request.auth.user.id);
    response.json(result);
  }),
);

router.get(
  "/:userId",
  asyncHandler(async (request, response) => {
    const user = await getUserProfileById(request.auth.user.id, request.params.userId);
    response.json({ user });
  }),
);

router.delete(
  "/me",
  asyncHandler(async (request, response) => {
    await deleteAccount(request.auth.user.id);
    disconnectUserSockets(request.app.locals.io, request.auth.user.id);
    response.clearCookie(env.sessionCookieName, getSessionCookieOptions());
    response.json({ ok: true });
  }),
);

export default router;
