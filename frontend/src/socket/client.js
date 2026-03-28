import { io } from "socket.io-client";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? "http://localhost:3000";

export function createSocket(tabId) {
  return io(SOCKET_URL, {
    autoConnect: false,
    withCredentials: true,
    auth: {
      tabId,
    },
  });
}
