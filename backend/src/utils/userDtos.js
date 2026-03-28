import { buildProgressDto } from "./progression.js";
import { normalizeLanguageCode } from "./languages.js";

export function buildUserSummary(row) {
  return {
    id: row.id,
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
    createdAt: row.created_at,
    ...buildProgressDto(row),
  };
}

export function buildCompactUserSummary(row) {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name || row.username,
    avatarKey: row.avatar_key ?? "ember-fox",
    decorationKey: row.decoration_key ?? "ring-sunrise",
    profileBackgroundKey: row.profile_background_key ?? "bg-aurora",
    level: Number(row.level ?? 1),
    heartsReceived: Number(row.hearts_received ?? 0),
    isLikedByCurrentUser: Boolean(row.is_liked_by_current_user),
    statusLabel: row.skill_focus ?? "",
    profileTitle: row.assessment_summary ?? "",
  };
}
