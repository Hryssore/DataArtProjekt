import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";

import { Server as SocketServer } from "socket.io";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/pool.js";
import { registerSocketHandlers } from "./sockets/registerSocketHandlers.js";

async function bootstrap() {
  await mkdir(env.uploadsDir, { recursive: true });

  const app = createApp();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: env.frontendOrigin,
      credentials: true,
    },
  });

  app.locals.io = io;
  app.locals.pool = pool;

  registerSocketHandlers(io);

  server.listen(env.port, () => {
    console.log(`Backend listening on port ${env.port}`);
  });
}

bootstrap().catch(error => {
  console.error("Failed to start backend", error);
  process.exit(1);
});
