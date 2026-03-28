import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";

import { authApi } from "../api/authApi.js";
import { sessionsApi } from "../api/sessionsApi.js";
import { useAuth } from "../app/store/AuthStore.jsx";
import { useUiPreferences } from "../app/store/UiPreferencesStore.jsx";
import { Modal } from "../components/ui/Modal.jsx";
import { formatDateTime } from "../utils/date.js";

export function SettingsPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const { rooms = [] } = useOutletContext();
  const { theme, setTheme, recentRooms, clearRecentRooms } = useUiPreferences();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    nextPassword: "",
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [revokingSessionId, setRevokingSessionId] = useState("");

  const roomMap = useMemo(() => new Map(rooms.map(room => [room.id, room])), [rooms]);
  const recentAccessibleRooms = useMemo(
    () =>
      recentRooms
        .map(entry => {
          const room = roomMap.get(entry.id);
          if (!room) {
            return null;
          }

          return {
            ...entry,
            room,
          };
        })
        .filter(Boolean),
    [recentRooms, roomMap],
  );

  async function loadSessions() {
    const result = await sessionsApi.list();
    setSessions(result.sessions);
  }

  useEffect(() => {
    loadSessions().catch(nextError => setSessionError(nextError.message));
  }, []);

  async function handlePasswordChange(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsUpdatingPassword(true);

    try {
      await authApi.changePassword(passwordForm);
      setMessage("Password updated successfully.");
      setPasswordForm({ currentPassword: "", nextPassword: "" });
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  async function handleDeleteAccount() {
    setIsDeletingAccount(true);
    try {
      await authApi.deleteAccount();
      auth.clearAuth();
      navigate("/login");
    } finally {
      setIsDeletingAccount(false);
    }
  }

  async function handleRevokeSession(session) {
    setSessionError("");
    setRevokingSessionId(session.id);
    try {
      const result = await sessionsApi.revoke(session.id);
      if (result?.currentSessionLoggedOut) {
        auth.clearAuth();
        navigate("/login");
        return;
      }

      await loadSessions();
    } catch (nextError) {
      setSessionError(nextError.message);
    } finally {
      setRevokingSessionId("");
    }
  }

  return (
    <div className="workspace-page">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>General settings</h1>
          <p>Appearance, room history, sessions, password, and account controls live here.</p>
        </div>
      </section>

      <div className="two-column-grid">
        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Theme</h2>
          </div>
          <div className="stack">
            <p>Choose the look you want for the whole workspace.</p>
            <div className="inline-actions wrap-actions">
              <button
                type="button"
                className={`ghost-button ${theme === "light" ? "is-selected" : ""}`}
                onClick={() => setTheme("light")}
              >
                Light
              </button>
              <button
                type="button"
                className={`ghost-button ${theme === "dark" ? "is-selected" : ""}`}
                onClick={() => setTheme("dark")}
              >
                Dark
              </button>
            </div>
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Room history</h2>
            {recentAccessibleRooms.length ? (
              <button
                type="button"
                className="ghost-button sidebar-card__button"
                onClick={clearRecentRooms}
              >
                Clear
              </button>
            ) : null}
          </div>
          <div className="stack">
            {recentAccessibleRooms.map(entry => (
              <Link key={entry.room.id} className="sidebar-link" to={`/rooms/${entry.room.id}/chat`}>
                <span className="sidebar-link__stack">
                  <span>{entry.room.name}</span>
                  <small>
                    {entry.room.visibility} {entry.room.category} - {formatDateTime(entry.visitedAt)}
                  </small>
                </span>
              </Link>
            ))}
            {!recentAccessibleRooms.length ? (
              <p className="muted-label">Rooms you open will appear here.</p>
            ) : null}
          </div>
        </section>
      </div>

      <div className="two-column-grid">
        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Sessions</h2>
          </div>
          <div className="stack">
            <p>Manage this device and other signed-in sessions from one place.</p>
            {sessions.map(session => (
              <div key={session.id} className="catalog-card">
                <div>
                  <strong>{session.browser}</strong>
                  <p>{session.userAgent}</p>
                  <small>
                    {session.ip || "unknown IP"} - {session.deviceType} -{" "}
                    {session.isCurrent ? "current session" : "remote session"}
                  </small>
                </div>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleRevokeSession(session)}
                  disabled={revokingSessionId === session.id}
                  aria-busy={revokingSessionId === session.id}
                >
                  {revokingSessionId === session.id
                    ? session.isCurrent
                      ? "Logging out..."
                      : "Revoking..."
                    : session.isCurrent
                      ? "Logout here"
                      : "Revoke"}
                </button>
              </div>
            ))}
            {!sessions.length ? (
              <p className="muted-label">No active sessions to manage right now.</p>
            ) : null}
            {sessionError ? <p className="error-text">{sessionError}</p> : null}
          </div>
        </section>

        <section className="panel-card">
          <div className="panel-card__header">
            <h2>Change password</h2>
          </div>
          <form className="stack" onSubmit={handlePasswordChange}>
            <input
              className="text-input"
              placeholder="Current password"
              type="password"
              value={passwordForm.currentPassword}
              onChange={event =>
                setPasswordForm(current => ({ ...current, currentPassword: event.target.value }))
              }
            />
            <input
              className="text-input"
              placeholder="New password"
              type="password"
              value={passwordForm.nextPassword}
              onChange={event =>
                setPasswordForm(current => ({ ...current, nextPassword: event.target.value }))
              }
            />
            {message ? <p className="success-text">{message}</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
            <button
              type="submit"
              className="primary-button"
              disabled={isUpdatingPassword}
              aria-busy={isUpdatingPassword}
            >
              {isUpdatingPassword ? "Updating..." : "Update password"}
            </button>
          </form>
        </section>

        <section className="panel-card danger-panel">
          <div className="panel-card__header">
            <h2>Delete account</h2>
          </div>
          <div className="stack">
            <p>
              This removes the account, deletes rooms you own, removes your membership from other
              rooms, and invalidates active sessions.
            </p>
            <button type="button" className="primary-button danger-button" onClick={() => setShowDeleteModal(true)}>
              Delete account
            </button>
          </div>
        </section>
      </div>

      {showDeleteModal ? (
        <Modal title="Delete account" onClose={() => setShowDeleteModal(false)}>
          <div className="stack">
            <p>This action is permanent and also removes rooms you own with their files.</p>
            <button
              type="button"
              className="primary-button danger-button"
              onClick={handleDeleteAccount}
              disabled={isDeletingAccount}
              aria-busy={isDeletingAccount}
            >
              {isDeletingAccount ? "Deleting..." : "Confirm account deletion"}
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
