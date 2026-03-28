import { Router } from "express";

import { env, getSessionCookieOptions } from "../../config/env.js";
import { requireAuth } from "../../middlewares/auth.js";
import { ApiError } from "../../utils/apiError.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { destroyCurrentSession, destroySessionById, listSessions, listSocketIdsForSession } from "./service.js";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  asyncHandler(async (request, response) => {
    const sessions = await listSessions(request.auth.user.id, request.auth.session.id);
    response.json({ sessions });
  }),
);

router.delete(
  "/:sessionId",
  asyncHandler(async (request, response) => {
    const { sessionId } = request.params;
    const socketIds = await listSocketIdsForSession(sessionId);

    if (sessionId === request.auth.session.id) {
      await destroyCurrentSession(sessionId);
      socketIds.forEach(socketId => {
        const socket = request.app.locals.io?.sockets.sockets.get(socketId);
        socket?.emit("session:revoked", { sessionId });
        socket?.disconnect(true);
      });
      response.clearCookie(env.sessionCookieName, getSessionCookieOptions());
      response.json({ ok: true, currentSessionLoggedOut: true });
      return;
    }

    const deletedCount = await destroySessionById(request.auth.user.id, sessionId);
    if (deletedCount === 0) {
      throw new ApiError(404, "Session not found.");
    }

    socketIds.forEach(socketId => {
      const socket = request.app.locals.io?.sockets.sockets.get(socketId);
      socket?.emit("session:revoked", { sessionId });
      socket?.disconnect(true);
    });
    response.json({ ok: true });
  }),
);

export default router;
