import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { attachAuthContext } from "./middlewares/auth.js";
import { errorHandler, notFoundHandler } from "./middlewares/errorHandler.js";
import attachmentsRoutes from "./modules/attachments/routes.js";
import authRoutes from "./modules/auth/routes.js";
import dialogsRoutes from "./modules/dialogs/routes.js";
import friendsRoutes from "./modules/friends/routes.js";
import messagesRoutes from "./modules/messages/routes.js";
import moderationRoutes from "./modules/moderation/routes.js";
import presenceRoutes from "./modules/presence/routes.js";
import roomsRoutes from "./modules/rooms/routes.js";
import sessionsRoutes from "./modules/sessions/routes.js";
import usersRoutes from "./modules/users/routes.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendOrigin,
      credentials: true,
    }),
  );
  app.use(helmet());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(attachAuthContext);

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      service: "classic-web-chat-backend",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/sessions", sessionsRoutes);
  app.use("/api/friends", friendsRoutes);
  app.use("/api/rooms", roomsRoutes);
  app.use("/api/dialogs", dialogsRoutes);
  app.use("/api/messages", messagesRoutes);
  app.use("/api/attachments", attachmentsRoutes);
  app.use("/api/admin", moderationRoutes);
  app.use("/api/presence", presenceRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
