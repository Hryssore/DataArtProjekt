import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";

import { authApi } from "../../api/authApi.js";
import { dialogsApi } from "../../api/dialogsApi.js";
import { friendsApi } from "../../api/friendsApi.js";
import { roomsApi } from "../../api/roomsApi.js";
import { usersApi } from "../../api/usersApi.js";
import { usePresenceHeartbeat } from "../../hooks/usePresenceHeartbeat.js";
import { useSocket } from "../../socket/SocketProvider.jsx";
import { useAuth } from "../../app/store/AuthStore.jsx";
import { RightSidebar } from "./RightSidebar.jsx";

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, clearAuth } = useAuth();
  const { socket, authError } = useSocket();
  const [workspace, setWorkspace] = useState({
    rooms: [],
    dialogs: [],
    friends: [],
    unread: { rooms: [], dialogs: [] },
    isLoading: true,
  });

  usePresenceHeartbeat();

  const refreshWorkspace = useCallback(async () => {
    try {
      const [roomsResult, dialogsResult, friendsResult, unreadResult] = await Promise.all([
        roomsApi.listMine(),
        dialogsApi.list(),
        friendsApi.list(),
        usersApi.unread(),
      ]);

      setWorkspace({
        rooms: roomsResult.rooms,
        dialogs: dialogsResult.dialogs,
        friends: friendsResult.friends,
        unread: unreadResult,
        isLoading: false,
      });
    } catch (error) {
      if (error.status === 401) {
        clearAuth();
        navigate("/login");
        return;
      }

      throw error;
    }
  }, [clearAuth, navigate]);

  useEffect(() => {
    refreshWorkspace().catch(() => {
      setWorkspace(current => ({ ...current, isLoading: false }));
    });
  }, [refreshWorkspace]);

  useEffect(() => {
    if (!authError) {
      return;
    }

    clearAuth();
    navigate("/login");
  }, [authError, clearAuth, navigate]);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const events = [
      "unread:refresh",
      "room:members-updated",
      "room:admins-updated",
      "room:deleted",
      "room:banned",
      "room:invited",
      "friends:accepted",
      "friends:removed",
      "dialogs:updated",
      "bans:updated",
      "presence:update",
      "message:created",
      "message:attachments-added",
    ];

    function handleRefresh() {
      refreshWorkspace().catch(() => undefined);
    }

    function handleSessionRevoked() {
      clearAuth();
      navigate("/login");
    }

    events.forEach(event => socket.on(event, handleRefresh));
    socket.on("session:revoked", handleSessionRevoked);
    return () => {
      events.forEach(event => socket.off(event, handleRefresh));
      socket.off("session:revoked", handleSessionRevoked);
    };
  }, [clearAuth, navigate, refreshWorkspace, socket]);

  async function handleLogout() {
    await authApi.logout();
    clearAuth();
  }

  const isFocusedDialogRoute = location.pathname.startsWith("/dialogs/");
  const topMenuLinks = [
    { to: "/rooms", label: "Rooms" },
    { to: "/friends", label: "Friends" },
    { to: "/profile", label: "Profile" },
    { to: "/settings", label: "Settings" },
  ];

  return (
    <div className={`app-shell ${isFocusedDialogRoute ? "app-shell--focused" : ""}`}>
      <header className="workspace-topbar">
        <div className="workspace-topbar__brand">
          <strong>Classic Chat</strong>
          <small>Rooms, contacts, history, and presence</small>
        </div>
        <nav className="workspace-topbar__nav" aria-label="Top menu">
          {topMenuLinks.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `workspace-topbar__link ${isActive ? "is-active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <div className="app-shell__body">
        <main className={`app-shell__content ${isFocusedDialogRoute ? "app-shell__content--focused" : ""}`}>
          <Outlet
            context={{
              ...workspace,
              refreshWorkspace,
              currentUser: user,
            }}
          />
        </main>
        {!isFocusedDialogRoute ? (
          <aside className="app-shell__sidebar">
            <RightSidebar
              rooms={workspace.rooms}
              dialogs={workspace.dialogs}
              friends={workspace.friends}
              unread={workspace.unread}
              onLogout={handleLogout}
              onWorkspaceRefresh={refreshWorkspace}
              currentUser={user}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
