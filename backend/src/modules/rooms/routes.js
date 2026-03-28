import { Router } from "express";
import { z } from "zod";

import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import {
  addRoomGoalStep,
  clearActiveRoomTopic,
  createRoomGoal,
  deleteRoomGoal,
  listRoomGoals,
  setActiveRoomTopic,
  suggestRoomGoalPlan,
  toggleRoomGoalStep,
  updateRoomGoal,
} from "./goalsService.js";
import {
  acceptRoomInvitation,
  addRoomAdmin,
  createRoom,
  deleteRoom,
  getRoomById,
  inviteUserToRoom,
  joinPublicRoom,
  leaveRoom,
  listMyInvitations,
  listMyRooms,
  listRoomAdmins,
  listRoomCatalog,
  listRoomMembers,
  removeRoomAdmin,
} from "./service.js";

const router = Router();

const booleanQuery = z.preprocess(value => value === true || value === "true", z.boolean());

const createRoomSchema = z.object({
  name: z.string().trim().min(3).max(64),
  description: z.string().trim().max(1000).optional(),
  visibility: z.enum(["public", "private"]),
  category: z.enum(["general", "study", "gaming", "hangout", "voice"]).default("general"),
  maxMembers: z.coerce.number().int().min(2).max(1000).optional().nullable(),
  voiceEnabled: z.boolean().optional().default(false),
  videoEnabled: z.boolean().optional().default(false),
  levelRequirement: z.coerce.number().int().min(1).max(100).optional().default(1),
  isListed: z.boolean().optional().default(true),
});

const catalogQuerySchema = z.object({
  search: z.string().max(64).optional().default(""),
  category: z.enum(["all", "general", "study", "gaming", "hangout", "voice"]).optional().default("all"),
  sort: z.enum(["name", "newest", "popular", "online"]).optional().default("name"),
  onlyAvailable: booleanQuery.optional().default(false),
  voiceEnabled: booleanQuery.optional().default(false),
  videoEnabled: booleanQuery.optional().default(false),
});

const inviteSchema = z.object({
  userId: z.string().uuid(),
});

const adminSchema = z.object({
  userId: z.string().uuid(),
});

const roomGoalSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
  rewardXp: z.coerce.number().int().min(0).max(500).optional(),
  resourceLanguage: z.string().trim().max(32).optional().nullable(),
  steps: z.array(z.string().trim().min(2).max(160)).max(10).optional().default([]),
  activateInChat: z.boolean().optional().default(false),
});

const roomGoalUpdateSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(500).optional(),
});

const roomGoalSuggestSchema = z.object({
  title: z.string().trim().min(3).max(120),
});

const roomGoalStepSchema = z.object({
  title: z.string().trim().min(2).max(160),
});

router.use(requireAuth);

router.post(
  "/",
  validate(createRoomSchema),
  asyncHandler(async (request, response) => {
    const room = await createRoom(request.auth.user.id, request.body, request.app.locals.io);
    response.status(201).json({ room });
  }),
);

router.get(
  "/catalog",
  validate(catalogQuerySchema, "query"),
  asyncHandler(async (request, response) => {
    const rooms = await listRoomCatalog(request.auth.user.id, request.query);
    response.json({ rooms });
  }),
);

router.get(
  "/mine",
  asyncHandler(async (request, response) => {
    const rooms = await listMyRooms(request.auth.user.id);
    response.json({ rooms });
  }),
);

router.get(
  "/invitations/mine",
  asyncHandler(async (request, response) => {
    const invitations = await listMyInvitations(request.auth.user.id);
    response.json({ invitations });
  }),
);

router.get(
  "/:roomId",
  asyncHandler(async (request, response) => {
    const room = await getRoomById(request.auth.user.id, request.params.roomId);
    response.json({ room });
  }),
);

router.post(
  "/:roomId/join",
  asyncHandler(async (request, response) => {
    const room = await joinPublicRoom(
      request.auth.user.id,
      request.params.roomId,
      request.app.locals.io,
    );
    response.json({ room });
  }),
);

router.post(
  "/:roomId/leave",
  asyncHandler(async (request, response) => {
    const result = await leaveRoom(
      request.auth.user.id,
      request.params.roomId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.delete(
  "/:roomId",
  asyncHandler(async (request, response) => {
    const result = await deleteRoom(
      request.auth.user.id,
      request.params.roomId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.get(
  "/:roomId/members",
  asyncHandler(async (request, response) => {
    const members = await listRoomMembers(request.auth.user.id, request.params.roomId);
    response.json({ members });
  }),
);

router.get(
  "/:roomId/admins",
  asyncHandler(async (request, response) => {
    const admins = await listRoomAdmins(request.auth.user.id, request.params.roomId);
    response.json({ admins });
  }),
);

router.get(
  "/:roomId/goals",
  asyncHandler(async (request, response) => {
    const goals = await listRoomGoals(request.auth.user.id, request.params.roomId);
    response.json({ goals });
  }),
);

router.post(
  "/:roomId/goals",
  validate(roomGoalSchema),
  asyncHandler(async (request, response) => {
    const goal = await createRoomGoal(
      request.auth.user.id,
      request.params.roomId,
      request.body,
      request.app.locals.io,
    );
    response.status(201).json({ goal });
  }),
);

router.patch(
  "/:roomId/goals/:goalId",
  validate(roomGoalUpdateSchema),
  asyncHandler(async (request, response) => {
    const goal = await updateRoomGoal(
      request.auth.user.id,
      request.params.roomId,
      request.params.goalId,
      request.body,
      request.app.locals.io,
    );
    response.json({ goal });
  }),
);

router.delete(
  "/:roomId/goals/:goalId",
  asyncHandler(async (request, response) => {
    const result = await deleteRoomGoal(
      request.auth.user.id,
      request.params.roomId,
      request.params.goalId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.post(
  "/:roomId/goals/suggest",
  validate(roomGoalSuggestSchema),
  asyncHandler(async (request, response) => {
    const plan = await suggestRoomGoalPlan(
      request.auth.user.id,
      request.params.roomId,
      request.body.title,
    );
    response.json(plan);
  }),
);

router.post(
  "/:roomId/goals/:goalId/steps",
  validate(roomGoalStepSchema),
  asyncHandler(async (request, response) => {
    const goal = await addRoomGoalStep(
      request.auth.user.id,
      request.params.roomId,
      request.params.goalId,
      request.body.title,
      request.app.locals.io,
    );
    response.json({ goal });
  }),
);

router.post(
  "/:roomId/goals/:goalId/steps/:stepId/toggle",
  asyncHandler(async (request, response) => {
    const goal = await toggleRoomGoalStep(
      request.auth.user.id,
      request.params.roomId,
      request.params.goalId,
      request.params.stepId,
      request.app.locals.io,
    );
    response.json({ goal });
  }),
);

router.post(
  "/:roomId/goals/:goalId/activate",
  asyncHandler(async (request, response) => {
    const goal = await setActiveRoomTopic(
      request.auth.user.id,
      request.params.roomId,
      request.params.goalId,
      request.app.locals.io,
    );
    response.json({ goal });
  }),
);

router.delete(
  "/:roomId/active-topic",
  asyncHandler(async (request, response) => {
    const result = await clearActiveRoomTopic(
      request.auth.user.id,
      request.params.roomId,
      request.app.locals.io,
    );
    response.json(result);
  }),
);

router.post(
  "/:roomId/invitations",
  validate(inviteSchema),
  asyncHandler(async (request, response) => {
    const invitation = await inviteUserToRoom(
      request.auth.user.id,
      request.params.roomId,
      request.body.userId,
      request.app.locals.io,
    );
    response.status(201).json({ invitation });
  }),
);

router.post(
  "/invitations/:invitationId/accept",
  asyncHandler(async (request, response) => {
    const room = await acceptRoomInvitation(
      request.auth.user.id,
      request.params.invitationId,
      request.app.locals.io,
    );
    response.json({ room });
  }),
);

router.post(
  "/:roomId/admins",
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
  "/:roomId/admins/:userId",
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

export default router;
