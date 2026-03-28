import { useEffect } from "react";

import { useSocket } from "../socket/SocketProvider.jsx";

export function usePresenceHeartbeat() {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) {
      return;
    }

    let isActive = true;

    function markActive() {
      isActive = true;
    }

    function handleVisibility() {
      isActive = document.visibilityState === "visible";
      socket.emit("presence:heartbeat", { isActive });
    }

    const interval = window.setInterval(() => {
      socket.emit("presence:heartbeat", { isActive });
      isActive = false;
    }, 30_000);

    window.addEventListener("mousemove", markActive);
    window.addEventListener("keydown", markActive);
    window.addEventListener("focus", markActive);
    document.addEventListener("visibilitychange", handleVisibility);

    socket.emit("presence:heartbeat", { isActive: true });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("focus", markActive);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isConnected, socket]);
}
