import { parse as parseCookie } from "cookie";

import { env } from "../config/env.js";
import { pool, query } from "../db/pool.js";
import { emitToUser } from "../utils/realtime.js";
import { hashOpaqueToken } from "../utils/session.js";

async function getSessionFromSocket(socket) {
  const rawCookie = socket.handshake.headers.cookie;
  if (!rawCookie) {
    return null;
  }

  const cookies = parseCookie(rawCookie);
  const token = cookies[env.sessionCookieName];
  if (!token) {
    return null;
  }

  const result = await query(
    `
      SELECT sessions.id, sessions.user_id
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE session_token_hash = $1
        AND expires_at > NOW()
        AND users.deleted_at IS NULL
    `,
    [hashOpaqueToken(token)],
  );

  return result.rows[0] ?? null;
}

async function refreshPresence(client, userId) {
  const userResult = await client.query(
    `
      SELECT 1
      FROM users
      WHERE id = $1
        AND deleted_at IS NULL
    `,
    [userId],
  );

  if (userResult.rowCount === 0) {
    await client.query(`DELETE FROM presence_connections WHERE user_id = $1`, [userId]);
    await client.query(`DELETE FROM presence_states WHERE user_id = $1`, [userId]);

    return {
      userId,
      status: "offline",
      lastActivityAt: null,
    };
  }

  const result = await client.query(
    `
      SELECT
        COUNT(*)::INT AS open_tabs,
        MAX(last_activity_at) AS last_activity_at
      FROM presence_connections
      WHERE user_id = $1
    `,
    [userId],
  );

  const row = result.rows[0];
  let status = "offline";

  if (row.open_tabs > 0) {
    const lastActivity = row.last_activity_at ? new Date(row.last_activity_at).getTime() : 0;
    status = Date.now() - lastActivity > 60_000 ? "afk" : "online";
  }

  await client.query(
    `
      INSERT INTO presence_states (user_id, status, last_online_at, last_activity_at, updated_at)
      VALUES (
        $1,
        $2::presence_status_enum,
        CASE
          WHEN $2::presence_status_enum = 'offline'::presence_status_enum THEN NULL
          ELSE NOW()
        END,
        $3,
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        status = EXCLUDED.status,
        last_online_at = CASE
          WHEN EXCLUDED.status = 'offline' THEN presence_states.last_online_at
          ELSE NOW()
        END,
        last_activity_at = EXCLUDED.last_activity_at,
        updated_at = NOW()
    `,
    [userId, status, row.last_activity_at],
  );

  return {
    userId,
    status,
    lastActivityAt: row.last_activity_at,
  };
}

const voiceRooms = new Map();
const roomTypingStates = new Map();

function listVoiceParticipants(roomId) {
  return [...(voiceRooms.get(roomId)?.values() ?? [])].sort(
    (left, right) => new Date(left.joinedAt).getTime() - new Date(right.joinedAt).getTime(),
  );
}

function upsertVoiceParticipant(roomId, socketId, participant) {
  if (!voiceRooms.has(roomId)) {
    voiceRooms.set(roomId, new Map());
  }

  voiceRooms.get(roomId).set(socketId, {
    socketId,
    ...participant,
  });
}

function removeVoiceParticipant(socketId) {
  const updatedRoomIds = [];

  voiceRooms.forEach((participants, roomId) => {
    if (!participants.delete(socketId)) {
      return;
    }

    updatedRoomIds.push(roomId);
    if (participants.size === 0) {
      voiceRooms.delete(roomId);
    }
  });

  return updatedRoomIds;
}

function listTypingUsers(roomId) {
  const roomEntries = [...(roomTypingStates.get(roomId)?.values() ?? [])];
  const uniqueUsers = new Map();

  roomEntries.forEach(entry => {
    if (!uniqueUsers.has(entry.userId)) {
      uniqueUsers.set(entry.userId, {
        userId: entry.userId,
        username: entry.username,
        displayName: entry.displayName,
        startedAt: entry.startedAt,
      });
      return;
    }

    const current = uniqueUsers.get(entry.userId);
    if (new Date(entry.startedAt).getTime() < new Date(current.startedAt).getTime()) {
      uniqueUsers.set(entry.userId, {
        userId: entry.userId,
        username: entry.username,
        displayName: entry.displayName,
        startedAt: entry.startedAt,
      });
    }
  });

  return [...uniqueUsers.values()].sort(
    (left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime(),
  );
}

function emitTypingState(io, roomId) {
  io.to(`room:${roomId}`).emit("room:typing-state", {
    roomId,
    users: listTypingUsers(roomId),
  });
}

function clearTypingSocket(roomId, socketId) {
  const roomEntries = roomTypingStates.get(roomId);
  const currentEntry = roomEntries?.get(socketId);

  if (!roomEntries || !currentEntry) {
    return false;
  }

  if (currentEntry.timeoutId) {
    clearTimeout(currentEntry.timeoutId);
  }

  roomEntries.delete(socketId);
  if (roomEntries.size === 0) {
    roomTypingStates.delete(roomId);
  }

  return true;
}

function removeTypingSocketEverywhere(socketId) {
  const updatedRoomIds = [];

  roomTypingStates.forEach((entries, roomId) => {
    const currentEntry = entries.get(socketId);
    if (!currentEntry) {
      return;
    }

    if (currentEntry.timeoutId) {
      clearTimeout(currentEntry.timeoutId);
    }

    entries.delete(socketId);
    updatedRoomIds.push(roomId);

    if (entries.size === 0) {
      roomTypingStates.delete(roomId);
    }
  });

  return updatedRoomIds;
}

export function registerSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const session = await getSessionFromSocket(socket);
      if (!session) {
        next(new Error("Authentication failed"));
        return;
      }

      socket.data.session = session;
      socket.data.tabId = socket.handshake.auth?.tabId ?? socket.id;
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", async socket => {
    const { id: sessionId, user_id: userId } = socket.data.session;
    socket.join(`user:${userId}`);

    try {
      const client = await pool.connect();
      try {
        await client.query(
          `
            INSERT INTO presence_connections (user_id, session_id, socket_id, tab_id)
            VALUES ($1, $2, $3, $4)
          `,
          [userId, sessionId, socket.id, socket.data.tabId],
        );

        const profile = await client.query(
          `
            SELECT username, display_name
            FROM users
            WHERE id = $1
          `,
          [userId],
        );
        socket.data.userProfile = profile.rows[0] ?? null;

        const rooms = await client.query(
          `SELECT room_id FROM room_members WHERE user_id = $1`,
          [userId],
        );
        rooms.rows.forEach(row => socket.join(`room:${row.room_id}`));

        const dialogs = await client.query(
          `
            SELECT id
            FROM personal_dialogs
            WHERE user_low_id = $1 OR user_high_id = $1
          `,
          [userId],
        );
        dialogs.rows.forEach(row => socket.join(`dialog:${row.id}`));

        const presence = await refreshPresence(client, userId);
        emitToUser(io, userId, "presence:self", presence);
        socket.broadcast.emit("presence:update", presence);
      } finally {
        client.release();
      }
    } catch (error) {
      console.error("[socket:connection:init]", error);
      socket.disconnect(true);
      return;
    }

    socket.on("presence:heartbeat", async payload => {
      try {
        const heartbeatClient = await pool.connect();
        try {
          await heartbeatClient.query(
            `
              UPDATE presence_connections
              SET
                last_heartbeat_at = NOW(),
                last_activity_at = CASE
                  WHEN $1::BOOLEAN THEN NOW()
                  ELSE last_activity_at
                END
              WHERE socket_id = $2
            `,
            [Boolean(payload?.isActive), socket.id],
          );

          const presence = await refreshPresence(heartbeatClient, userId);
          emitToUser(io, userId, "presence:self", presence);
          socket.broadcast.emit("presence:update", presence);
        } finally {
          heartbeatClient.release();
        }
      } catch (error) {
        console.error("[socket:presence:heartbeat]", error);
      }
    });

    socket.on("room:subscribe", async payload => {
      const targetRoomId = payload?.roomId;
      if (!targetRoomId) {
        return;
      }

      const subscribeClient = await pool.connect();
      try {
        const membership = await subscribeClient.query(
          `
            SELECT 1
            FROM room_members
            WHERE room_id = $1
              AND user_id = $2
          `,
          [targetRoomId, userId],
        );

        if (membership.rowCount > 0) {
          socket.join(`room:${targetRoomId}`);
        }
      } finally {
        subscribeClient.release();
      }
    });

    socket.on("room:typing", async payload => {
      const targetRoomId = payload?.roomId;
      if (!targetRoomId) {
        return;
      }

      const typingClient = await pool.connect();
      try {
        const membership = await typingClient.query(
          `
            SELECT 1
            FROM room_members
            WHERE room_id = $1
              AND user_id = $2
          `,
          [targetRoomId, userId],
        );

        if (membership.rowCount === 0) {
          return;
        }

        const shouldType = Boolean(payload?.isTyping);
        if (!shouldType) {
          if (clearTypingSocket(targetRoomId, socket.id)) {
            emitTypingState(io, targetRoomId);
          }
          return;
        }

        if (!roomTypingStates.has(targetRoomId)) {
          roomTypingStates.set(targetRoomId, new Map());
        }

        const roomEntries = roomTypingStates.get(targetRoomId);
        const existingEntry = roomEntries.get(socket.id);
        if (existingEntry?.timeoutId) {
          clearTimeout(existingEntry.timeoutId);
        }

        const timeoutId = setTimeout(() => {
          if (clearTypingSocket(targetRoomId, socket.id)) {
            emitTypingState(io, targetRoomId);
          }
        }, 3500);

        roomEntries.set(socket.id, {
          socketId: socket.id,
          userId,
          username: socket.data.userProfile?.username ?? "member",
          displayName:
            socket.data.userProfile?.display_name || socket.data.userProfile?.username || "Member",
          startedAt: existingEntry?.startedAt ?? new Date().toISOString(),
          timeoutId,
        });

        emitTypingState(io, targetRoomId);
      } finally {
        typingClient.release();
      }
    });

    socket.on("dialog:subscribe", async payload => {
      const targetDialogId = payload?.dialogId;
      if (!targetDialogId) {
        return;
      }

      const subscribeClient = await pool.connect();
      try {
        const dialog = await subscribeClient.query(
          `
            SELECT 1
            FROM personal_dialogs
            WHERE id = $1
              AND (user_low_id = $2 OR user_high_id = $2)
          `,
          [targetDialogId, userId],
        );

        if (dialog.rowCount > 0) {
          socket.join(`dialog:${targetDialogId}`);
        }
      } finally {
        subscribeClient.release();
      }
    });

    socket.on("voice:state:request", async payload => {
      const targetRoomId = payload?.roomId;
      if (!targetRoomId) {
        return;
      }

      const voiceClient = await pool.connect();
      try {
        const membership = await voiceClient.query(
          `
            SELECT 1
            FROM room_members
            WHERE room_id = $1
              AND user_id = $2
          `,
          [targetRoomId, userId],
        );

        if (membership.rowCount === 0) {
          return;
        }

        socket.emit("voice:participants", {
          roomId: targetRoomId,
          participants: listVoiceParticipants(targetRoomId),
        });
      } finally {
        voiceClient.release();
      }
    });

    socket.on("voice:join", async payload => {
      const targetRoomId = payload?.roomId;
      if (!targetRoomId) {
        return;
      }

      const voiceClient = await pool.connect();
      try {
        const membership = await voiceClient.query(
          `
            SELECT 1
            FROM room_members
            WHERE room_id = $1
              AND user_id = $2
          `,
          [targetRoomId, userId],
        );

        if (membership.rowCount === 0) {
          return;
        }

        const previousRoomId = socket.data.voiceRoomId;
        if (previousRoomId && previousRoomId !== targetRoomId) {
          removeVoiceParticipant(socket.id);
          io.to(`room:${previousRoomId}`).emit("voice:participants", {
            roomId: previousRoomId,
            participants: listVoiceParticipants(previousRoomId),
          });
        }

        socket.data.voiceRoomId = targetRoomId;
        upsertVoiceParticipant(targetRoomId, socket.id, {
          userId,
          muted: Boolean(payload?.muted),
          cameraEnabled: Boolean(payload?.cameraEnabled),
          speaking: Boolean(payload?.speaking),
          screenSharing: Boolean(payload?.screenSharing),
          joinedAt: new Date().toISOString(),
        });

        io.to(`room:${targetRoomId}`).emit("voice:participants", {
          roomId: targetRoomId,
          participants: listVoiceParticipants(targetRoomId),
        });
      } finally {
        voiceClient.release();
      }
    });

    socket.on("voice:update", payload => {
      const targetRoomId = payload?.roomId;
      if (!targetRoomId || socket.data.voiceRoomId !== targetRoomId) {
        return;
      }

      const roomParticipants = voiceRooms.get(targetRoomId);
      const currentParticipant = roomParticipants?.get(socket.id);
      if (!currentParticipant) {
        return;
      }

      roomParticipants.set(socket.id, {
        ...currentParticipant,
        muted: Boolean(payload?.muted),
        cameraEnabled: Boolean(payload?.cameraEnabled),
        speaking: Boolean(payload?.speaking),
        screenSharing: Boolean(payload?.screenSharing),
      });

      io.to(`room:${targetRoomId}`).emit("voice:participants", {
        roomId: targetRoomId,
        participants: listVoiceParticipants(targetRoomId),
      });
    });

    socket.on("voice:signal", payload => {
      const targetRoomId = payload?.roomId;
      const targetSocketId = payload?.targetSocketId;
      if (!targetRoomId || !targetSocketId || socket.data.voiceRoomId !== targetRoomId) {
        return;
      }

      const participants = voiceRooms.get(targetRoomId);
      const senderParticipant = participants?.get(socket.id);
      const targetParticipant = participants?.get(targetSocketId);
      if (!senderParticipant || !targetParticipant) {
        return;
      }

      io.to(targetSocketId).emit("voice:signal", {
        roomId: targetRoomId,
        senderSocketId: socket.id,
        description: payload?.description ?? null,
        candidate: payload?.candidate ?? null,
      });
    });

    socket.on("voice:leave", payload => {
      const targetRoomId = payload?.roomId || socket.data.voiceRoomId;
      if (!targetRoomId) {
        return;
      }

      removeVoiceParticipant(socket.id);
      socket.data.voiceRoomId = null;
      io.to(`room:${targetRoomId}`).emit("voice:participants", {
        roomId: targetRoomId,
        participants: listVoiceParticipants(targetRoomId),
      });
    });

    socket.on("disconnect", async () => {
      try {
        const disconnectClient = await pool.connect();
        try {
          const updatedVoiceRooms = removeVoiceParticipant(socket.id);
          updatedVoiceRooms.forEach(roomId => {
            io.to(`room:${roomId}`).emit("voice:participants", {
              roomId,
              participants: listVoiceParticipants(roomId),
            });
          });

          const updatedTypingRooms = removeTypingSocketEverywhere(socket.id);
          updatedTypingRooms.forEach(roomId => {
            emitTypingState(io, roomId);
          });

          await disconnectClient.query(
            `DELETE FROM presence_connections WHERE socket_id = $1`,
            [socket.id],
          );

          const presence = await refreshPresence(disconnectClient, userId);
          emitToUser(io, userId, "presence:self", presence);
          socket.broadcast.emit("presence:update", presence);
        } finally {
          disconnectClient.release();
        }
      } catch (error) {
        console.error("[socket:disconnect]", error);
      }
    });
  });
}
