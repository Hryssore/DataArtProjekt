import { Router } from "express";
import { z } from "zod";

import { env, getSessionCookieOptions } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth.js";
import { validate } from "../../middlewares/validate.js";
import { listSocketIdsForSession } from "../sessions/service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { disconnectUserSockets } from "../../utils/realtime.js";
import {
  changePassword,
  deleteCurrentAccount,
  loginUser,
  logoutCurrentSession,
  registerUser,
  requestPasswordReset,
  resetPassword,
} from "./service.js";

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  nextPassword: z.string().min(8).max(128),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  nextPassword: z.string().min(8).max(128),
});

function getClearSessionCookieOptions() {
  const { maxAge, ...options } = getSessionCookieOptions();
  return options;
}

router.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (request, response) => {
    const result = await registerUser({
      ...request.body,
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
    });

    response.cookie(env.sessionCookieName, result.token, getSessionCookieOptions());
    response.status(201).json({
      user: result.user,
      session: result.session,
    });
  }),
);

router.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (request, response) => {
    const result = await loginUser({
      ...request.body,
      ipAddress: request.ip,
      userAgent: request.get("user-agent"),
    });

    response.cookie(env.sessionCookieName, result.token, getSessionCookieOptions());
    response.json({
      user: result.user,
      session: result.session,
    });
  }),
);

router.get(
  "/me",
  requireAuth,
  asyncHandler(async (request, response) => {
    response.json({
      user: request.auth.user,
      session: request.auth.session,
    });
  }),
);

router.post(
  "/logout",
  requireAuth,
  asyncHandler(async (request, response) => {
    const socketIds = await listSocketIdsForSession(request.auth.session.id);
    await logoutCurrentSession(request.auth.session.id);
    socketIds.forEach(socketId => {
      const socket = request.app.locals.io?.sockets.sockets.get(socketId);
      socket?.emit("session:revoked", { sessionId: request.auth.session.id });
      socket?.disconnect(true);
    });
    response.clearCookie(env.sessionCookieName, getClearSessionCookieOptions());
    response.json({ ok: true });
  }),
);

router.post(
  "/change-password",
  requireAuth,
  validate(changePasswordSchema),
  asyncHandler(async (request, response) => {
    await changePassword(
      request.auth.user.id,
      request.body.currentPassword,
      request.body.nextPassword,
    );

    response.json({ ok: true });
  }),
);

router.post(
  "/forgot-password",
  validate(forgotPasswordSchema),
  asyncHandler(async (request, response) => {
    const result = await requestPasswordReset(request.body.email);
    response.json(result);
  }),
);

router.post(
  "/reset-password",
  validate(resetPasswordSchema),
  asyncHandler(async (request, response) => {
    await resetPassword(request.body.token, request.body.nextPassword);
    response.json({ ok: true });
  }),
);

router.delete(
  "/account",
  requireAuth,
  asyncHandler(async (request, response) => {
    disconnectUserSockets(request.app.locals.io, request.auth.user.id);
    await deleteCurrentAccount(request.auth.user.id, request.app.locals.io);
    response.clearCookie(env.sessionCookieName, getClearSessionCookieOptions());
    response.json({ ok: true });
  }),
);

export default router;
