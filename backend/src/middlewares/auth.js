import { env } from "../config/env.js";
import { query } from "../db/pool.js";
import { ApiError } from "../utils/apiError.js";
import { normalizeLanguageCode } from "../utils/languages.js";
import { hashOpaqueToken } from "../utils/session.js";

export async function attachAuthContext(request, _response, next) {
  try {
    const token = request.cookies?.[env.sessionCookieName];

    request.auth = {
      user: null,
      session: null,
    };

    if (!token) {
      next();
      return;
    }

    const result = await query(
      `
        SELECT
          sessions.id AS session_id,
          sessions.user_id,
          sessions.expires_at,
          sessions.browser,
          sessions.user_agent,
          users.email,
          users.username,
          users.display_name,
          users.bio,
          users.avatar_key,
          users.decoration_key,
          users.profile_background_key,
          users.preferred_language,
          users.skill_focus,
          users.assessment_summary,
          users.xp_points,
          users.level,
          users.hearts_received,
          users.created_at
        FROM sessions
        JOIN users ON users.id = sessions.user_id
        WHERE sessions.session_token_hash = $1
          AND sessions.expires_at > NOW()
          AND users.deleted_at IS NULL
      `,
      [hashOpaqueToken(token)],
    );

    if (result.rowCount > 0) {
      const row = result.rows[0];
      await query(
        `
          UPDATE sessions
          SET last_seen_at = NOW()
          WHERE id = $1
        `,
        [row.session_id],
      );

      request.auth = {
        session: {
          id: row.session_id,
          userId: row.user_id,
          expiresAt: row.expires_at,
          browser: row.browser,
          userAgent: row.user_agent,
        },
        user: {
          id: row.user_id,
          email: row.email,
          username: row.username,
          displayName: row.display_name || row.username,
          bio: row.bio ?? "",
          avatarKey: row.avatar_key ?? "ember-fox",
          decorationKey: row.decoration_key ?? "ring-sunrise",
          profileBackgroundKey: row.profile_background_key ?? "bg-aurora",
          preferredLanguage: normalizeLanguageCode(row.preferred_language ?? ""),
          skillFocus: row.skill_focus ?? "",
          assessmentSummary: row.assessment_summary ?? "",
          statusLabel: row.skill_focus ?? "",
          profileTitle: row.assessment_summary ?? "",
          xpPoints: Number(row.xp_points ?? 0),
          level: Number(row.level ?? 1),
          heartsReceived: Number(row.hearts_received ?? 0),
          createdAt: row.created_at,
        },
      };
    }

    next();
  } catch (error) {
    next(error);
  }
}

export function requireAuth(request, _response, next) {
  if (!request.auth?.user) {
    next(new ApiError(401, "Authentication is required."));
    return;
  }

  next();
}
