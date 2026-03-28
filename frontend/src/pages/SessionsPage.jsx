import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { sessionsApi } from "../api/sessionsApi.js";
import { useAuth } from "../app/store/AuthStore.jsx";
import { EmptyState } from "../components/ui/EmptyState.jsx";

export function SessionsPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [sessions, setSessions] = useState([]);
  const [revokingSessionId, setRevokingSessionId] = useState("");

  async function loadSessions() {
    const result = await sessionsApi.list();
    setSessions(result.sessions);
  }

  useEffect(() => {
    loadSessions().catch(() => undefined);
  }, []);

  async function handleRevoke(session) {
    setRevokingSessionId(session.id);
    try {
      const result = await sessionsApi.revoke(session.id);
      if (result?.currentSessionLoggedOut) {
        auth.clearAuth();
        navigate("/login");
        return;
      }

      await loadSessions();
    } finally {
      setRevokingSessionId("");
    }
  }

  return (
    <div className="workspace-page">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Account access</p>
          <h1>Active sessions</h1>
          <p>Logout only this browser tab or revoke a remote session independently.</p>
        </div>
      </section>

      <section className="panel-card">
        <div className="stack">
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
                onClick={() => handleRevoke(session)}
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
          {!sessions.length ? <EmptyState title="No active sessions" description="Nothing to revoke right now." /> : null}
        </div>
      </section>
    </div>
  );
}
