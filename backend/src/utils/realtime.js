export function emitToUser(io, userId, event, payload) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

export function emitToRoom(io, roomId, event, payload) {
  if (io) {
    io.to(`room:${roomId}`).emit(event, payload);
  }
}

export function emitToDialog(io, dialogId, event, payload) {
  if (io) {
    io.to(`dialog:${dialogId}`).emit(event, payload);
  }
}

export function removeUserFromRoom(io, userId, roomId) {
  if (io) {
    io.in(`user:${userId}`).socketsLeave(`room:${roomId}`);
  }
}

export function disconnectUserSockets(io, userId) {
  if (io) {
    io.in(`user:${userId}`).disconnectSockets(true);
  }
}
