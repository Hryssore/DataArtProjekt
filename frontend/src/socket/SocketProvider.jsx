import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../app/store/AuthStore.jsx";
import { createSocket } from "./client.js";

const SocketContext = createContext(null);

function isAuthenticationError(error) {
  const message = String(error?.message ?? "").toLowerCase();
  return message.includes("authentication failed") || message.includes("unauthorized");
}

function getTabId() {
  const key = "classic-chat-tab-id";
  const existing = window.sessionStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next = crypto.randomUUID();
  window.sessionStorage.setItem(key, next);
  return next;
}

export function SocketProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  const [authError, setAuthError] = useState(null);
  const tabId = useMemo(() => getTabId(), []);

  useEffect(() => {
    const socket = createSocket(tabId);
    socketRef.current = socket;

    function handleConnect() {
      setIsConnected(true);
      setAuthError(null);
    }

    function handleDisconnect() {
      setIsConnected(false);
    }

    function handleConnectError(error) {
      setIsConnected(false);

      if (isAuthenticationError(error)) {
        setAuthError(error?.message ?? "Authentication failed");
        return;
      }

      setAuthError(null);
    }

    socket.on("connect", handleConnect);
    socket.on("disconnect", handleDisconnect);
    socket.on("connect_error", handleConnectError);

    if (isAuthenticated) {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("disconnect", handleDisconnect);
      socket.off("connect_error", handleConnectError);
      socket.disconnect();
    };
  }, [isAuthenticated, tabId]);

  useEffect(() => {
    if (!socketRef.current) {
      return;
    }

    if (isAuthenticated && !socketRef.current.connected) {
      socketRef.current.connect();
    }

    if (!isAuthenticated && socketRef.current.connected) {
      socketRef.current.disconnect();
    }
  }, [isAuthenticated]);

  return (
    <SocketContext.Provider
      value={{
        socket: socketRef.current,
        isConnected,
        authError,
      }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used inside SocketProvider");
  }

  return context;
}
