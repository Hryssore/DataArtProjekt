import { UAParser } from "ua-parser-js";

import { env } from "../../config/env.js";
import { query } from "../../db/pool.js";
import { createSessionToken, hashOpaqueToken } from "../../utils/session.js";

function buildSessionDto(row, currentSessionId = null) {
  return {
    id: row.id,
    ip: row.ip,
    userAgent: row.user_agent,
    browser: row.browser,
    deviceType: row.device_type,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    expiresAt: row.expires_at,
    isCurrent: currentSessionId ? row.id === currentSessionId : false,
  };
}

export async function createSessionForUser(client, { userId, ipAddress, userAgent }) {
  const parser = new UAParser(userAgent ?? "");
  const browser = parser.getBrowser().name ?? "Unknown";
  const deviceType = parser.getDevice().type ?? "desktop";
  const token = createSessionToken();
  const hashedToken = hashOpaqueToken(token);

  const result = await client.query(
    `
      INSERT INTO sessions (
        user_id,
        session_token_hash,
        ip,
        user_agent,
        browser,
        device_type,
        expires_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        NOW() + ($7 || ' days')::INTERVAL
      )
      RETURNING *
    `,
    [userId, hashedToken, ipAddress, userAgent, browser, deviceType, env.sessionTtlDays],
  );

  return {
    token,
    session: buildSessionDto(result.rows[0]),
  };
}

export async function listSessions(userId, currentSessionId) {
  const result = await query(
    `
      SELECT *
      FROM sessions
      WHERE user_id = $1
        AND expires_at > NOW()
      ORDER BY created_at DESC
    `,
    [userId],
  );

  return result.rows.map(row => buildSessionDto(row, currentSessionId));
}

export async function destroySessionById(userId, sessionId) {
  const result = await query(
    `
      DELETE FROM sessions
      WHERE id = $1
        AND user_id = $2
    `,
    [sessionId, userId],
  );

  return result.rowCount;
}

export async function destroyCurrentSession(sessionId) {
  const result = await query(`DELETE FROM sessions WHERE id = $1`, [sessionId]);
  return result.rowCount;
}

export async function destroyAllSessionsForUser(client, userId) {
  await client.query(`DELETE FROM sessions WHERE user_id = $1`, [userId]);
}

export async function listSocketIdsForSession(sessionId) {
  const result = await query(
    `
      SELECT socket_id
      FROM presence_connections
      WHERE session_id = $1
    `,
    [sessionId],
  );

  return result.rows.map(row => row.socket_id);
}
