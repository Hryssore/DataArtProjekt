import { query, withTransaction } from "../../db/pool.js";
import { isGeneratedAvatarKey } from "../../utils/avatarPresets.js";
import { ApiError } from "../../utils/apiError.js";
import { deleteFileIfExists } from "../../utils/fileStorage.js";
import { normalizeLanguageCode } from "../../utils/languages.js";
import { isProfileBackgroundKey } from "../../utils/profileBackgrounds.js";
import { emitToRoom } from "../../utils/realtime.js";
import { buildCompactUserSummary, buildUserSummary } from "../../utils/userDtos.js";

const PERIOD_INTERVALS = {
  day: "1 day",
  week: "7 days",
  month: "30 days",
};

const QUEST_REFRESH_TIME_ZONE = "Europe/Kiev";
const QUEST_REFRESH_HOUR = 16;
const FREE_DECORATION_KEYS = new Set(["ring-sunrise", "ring-aurora", "ring-royal", "heartflare"]);
const FREE_AVATAR_KEYS = new Set([
  "ember-fox",
  "midnight-cat",
  "garden-owl",
  "sky-whale",
  "initial-sunrise",
  "initial-ember",
  "initial-forest",
  "initial-ocean",
  "initial-royal",
  "initial-graphite",
]);

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value]),
  );

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const interpretedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return interpretedAsUtc - date.getTime();
}

function createDateInTimeZone(parts, timeZone) {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0,
  );
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - offset);
}

function shiftCalendarDay(parts, dayDelta) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + dayDelta, 12, 0, 0));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function getQuestWindow(now = new Date()) {
  const localNow = getTimeZoneParts(now, QUEST_REFRESH_TIME_ZONE);
  const todayRefreshAt = createDateInTimeZone(
    {
      year: localNow.year,
      month: localNow.month,
      day: localNow.day,
      hour: QUEST_REFRESH_HOUR,
      minute: 0,
      second: 0,
    },
    QUEST_REFRESH_TIME_ZONE,
  );

  if (now >= todayRefreshAt) {
    const nextDay = shiftCalendarDay(localNow, 1);
    return {
      startedAt: todayRefreshAt,
      refreshAt: createDateInTimeZone(
        {
          ...nextDay,
          hour: QUEST_REFRESH_HOUR,
          minute: 0,
          second: 0,
        },
        QUEST_REFRESH_TIME_ZONE,
      ),
    };
  }

  const previousDay = shiftCalendarDay(localNow, -1);
  return {
    startedAt: createDateInTimeZone(
      {
        ...previousDay,
        hour: QUEST_REFRESH_HOUR,
        minute: 0,
        second: 0,
      },
      QUEST_REFRESH_TIME_ZONE,
    ),
    refreshAt: todayRefreshAt,
  };
}

function buildQuestSuggestions(stats) {
  return [
    {
      id: "daily-check-in",
      title: "Daily check-in",
      description: "Send 3 messages across rooms or private chats today.",
      progress: stats.dailyMessages,
      target: 3,
      rewardXp: 50,
      isComplete: stats.dailyMessages >= 3,
    },
    {
      id: "daily-writing",
      title: "Keep the conversation going",
      description: "Write at least 250 characters across chats today.",
      progress: stats.dailyCharacters,
      target: 250,
      rewardXp: 60,
      isComplete: stats.dailyCharacters >= 250,
    },
    {
      id: "support-circle",
      title: "Support circle",
      description: "Send 1 appreciation heart to a friend profile.",
      progress: stats.heartsGiven,
      target: 1,
      rewardXp: 40,
      isComplete: stats.heartsGiven >= 1,
    },
  ];
}

async function getUserStats(client, userId, questWindowStartedAt) {
  const countsResult = await client.query(
    `
      SELECT
        (SELECT COUNT(*)::INT FROM room_members WHERE user_id = $1) AS joined_rooms,
        (
          SELECT COUNT(*)::INT
          FROM friendships
          WHERE user_low_id = $1 OR user_high_id = $1
        ) AS friends_count,
        (
          SELECT COUNT(*)::INT
          FROM messages
          WHERE sender_id = $1
            AND deleted_at IS NULL
        ) AS sent_messages
    `,
    [userId],
  );
  const questStatsResult = await client.query(
    `
      SELECT COALESCE(SUM(xp_delta), 0)::INT AS daily_xp
      FROM user_xp_events
      WHERE user_id = $1
        AND created_at >= $2
    `,
    [userId, questWindowStartedAt],
  );
  const dailyCharactersResult = await client.query(
    `
      SELECT COALESCE(SUM(CHAR_LENGTH(body)), 0)::INT AS daily_characters
      FROM messages
      WHERE sender_id = $1
        AND deleted_at IS NULL
        AND created_at >= $2
    `,
    [userId, questWindowStartedAt],
  );
  const activeRoomsResult = await client.query(
    `
      SELECT COUNT(DISTINCT room_id)::INT AS active_rooms
      FROM messages
      WHERE sender_id = $1
        AND room_id IS NOT NULL
        AND deleted_at IS NULL
        AND created_at >= $2
    `,
    [userId, questWindowStartedAt],
  );
  const dailyMessagesResult = await client.query(
    `
      SELECT COUNT(*)::INT AS daily_messages
      FROM messages
      WHERE sender_id = $1
        AND deleted_at IS NULL
        AND created_at >= $2
    `,
    [userId, questWindowStartedAt],
  );
  const heartsResult = await client.query(
    `
      SELECT COUNT(*)::INT AS hearts_given
      FROM profile_hearts
      WHERE sender_user_id = $1
        AND created_at >= $2
    `,
    [userId, questWindowStartedAt],
  );

  const counts = countsResult.rows[0] ?? {};
  return {
    joinedRooms: Number(counts.joined_rooms ?? 0),
    activeRooms: Number(activeRoomsResult.rows[0]?.active_rooms ?? 0),
    friendsCount: Number(counts.friends_count ?? 0),
    sentMessages: Number(counts.sent_messages ?? 0),
    dailyXp: Number(questStatsResult.rows[0]?.daily_xp ?? 0),
    dailyMessages: Number(dailyMessagesResult.rows[0]?.daily_messages ?? 0),
    dailyCharacters: Number(dailyCharactersResult.rows[0]?.daily_characters ?? 0),
    heartsGiven: Number(heartsResult.rows[0]?.hearts_given ?? 0),
  };
}

export async function searchUsers(currentUserId, searchTerm) {
  const result = await query(
    `
      SELECT id, username, display_name, avatar_key, decoration_key, level, hearts_received
      FROM users
      WHERE deleted_at IS NULL
        AND id <> $1
        AND (
          username ILIKE $2
          OR display_name ILIKE $2
        )
      ORDER BY level DESC, username
      LIMIT 20
    `,
    [currentUserId, `%${searchTerm}%`],
  );

  return result.rows.map(buildCompactUserSummary);
}

export async function getCurrentUserProfile(userId) {
  return withTransaction(async client => {
    const result = await client.query(
      `
        SELECT
          id,
          email,
          username,
          display_name,
          bio,
          avatar_key,
          decoration_key,
          profile_background_key,
          preferred_language,
          skill_focus,
          assessment_summary,
          xp_points,
          level,
          hearts_received,
          created_at
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [userId],
    );

    const row = result.rows[0] ?? null;
    if (!row) {
      return null;
    }

    const questWindow = getQuestWindow();
    const stats = await getUserStats(client, userId, questWindow.startedAt);
    const profile = buildUserSummary(row);

    return {
      ...profile,
      stats,
      quests: buildQuestSuggestions(stats),
      questPeriodStartedAt: questWindow.startedAt.toISOString(),
      questRefreshAt: questWindow.refreshAt.toISOString(),
    };
  });
}

export async function getUserProfileById(viewerUserId, userId) {
  return withTransaction(async client => {
    const result = await client.query(
      `
        SELECT
          id,
          NULL::TEXT AS email,
          username,
          display_name,
          bio,
          avatar_key,
          decoration_key,
          profile_background_key,
          preferred_language,
          skill_focus,
          assessment_summary,
          xp_points,
          level,
          hearts_received,
          created_at
        FROM users
        WHERE id = $1
          AND deleted_at IS NULL
      `,
      [userId],
    );

    const row = result.rows[0] ?? null;
    if (!row) {
      throw new ApiError(404, "User not found.");
    }

    const questWindow = getQuestWindow();
    const stats = await getUserStats(client, userId, questWindow.startedAt);
    const friendshipResult = await client.query(
      `
        SELECT 1
        FROM friendships
        WHERE user_low_id = LEAST($1, $2)::uuid
          AND user_high_id = GREATEST($1, $2)::uuid
      `,
      [viewerUserId, userId],
    );
    const heartResult = await client.query(
      `
        SELECT 1
        FROM profile_hearts
        WHERE sender_user_id = $1
          AND target_user_id = $2
      `,
      [viewerUserId, userId],
    );

    const profile = buildUserSummary(row);

    return {
      ...profile,
      stats,
      relationship: {
        isSelf: viewerUserId === userId,
        isFriend: friendshipResult.rowCount > 0,
        isLikedByCurrentUser: heartResult.rowCount > 0,
      },
      questPeriodStartedAt: questWindow.startedAt.toISOString(),
      questRefreshAt: questWindow.refreshAt.toISOString(),
    };
  });
}

export async function updateCurrentUserProfile(userId, payload) {
  const preferredLanguage = normalizeLanguageCode(payload.preferredLanguage?.trim() || "");
  const avatarKey = payload.avatarKey?.trim() || null;
  const decorationKey = payload.decorationKey?.trim() || null;
  const profileBackgroundKey = payload.profileBackgroundKey?.trim() || null;
  if (avatarKey && !isGeneratedAvatarKey(avatarKey) && !FREE_AVATAR_KEYS.has(avatarKey)) {
    throw new ApiError(400, "Unsupported avatar preset.");
  }
  if (decorationKey && !FREE_DECORATION_KEYS.has(decorationKey)) {
    throw new ApiError(400, "Unsupported ring preset.");
  }
  if (profileBackgroundKey && !isProfileBackgroundKey(profileBackgroundKey)) {
    throw new ApiError(400, "Unsupported profile background preset.");
  }

  const result = await query(
    `
      UPDATE users
      SET
        display_name = COALESCE(NULLIF($2, ''), username),
        bio = $3,
        preferred_language = $4,
        skill_focus = $5,
        assessment_summary = $6,
        avatar_key = COALESCE($7, avatar_key),
        decoration_key = COALESCE($8, decoration_key),
        profile_background_key = COALESCE($9, profile_background_key),
        updated_at = NOW()
      WHERE id = $1
        AND deleted_at IS NULL
      RETURNING
        id,
        email,
        username,
        display_name,
        bio,
        avatar_key,
        decoration_key,
        profile_background_key,
        preferred_language,
        skill_focus,
        assessment_summary,
        xp_points,
        level,
        hearts_received,
        created_at
    `,
    [
      userId,
      payload.displayName?.trim() ?? "",
      payload.bio?.trim() ?? "",
      preferredLanguage || null,
      payload.skillFocus?.trim() || null,
      payload.assessmentSummary?.trim() || null,
      avatarKey,
      decorationKey,
      profileBackgroundKey,
    ],
  );

  if (result.rowCount === 0) {
    throw new ApiError(404, "User not found.");
  }

  return buildUserSummary(result.rows[0]);
}

export async function giveHeartToUser(senderUserId, targetUserId) {
  if (senderUserId === targetUserId) {
    throw new ApiError(400, "You cannot give a heart to yourself.");
  }

  return withTransaction(async client => {
    async function loadTargetUserSummary(isLikedByCurrentUser) {
      const targetResult = await client.query(
        `
          SELECT
            id,
            username,
            display_name,
            avatar_key,
            decoration_key,
            profile_background_key,
            level,
            hearts_received,
            $2::BOOLEAN AS is_liked_by_current_user
          FROM users
          WHERE id = $1
        `,
        [targetUserId, isLikedByCurrentUser],
      );

      return buildCompactUserSummary(targetResult.rows[0]);
    }

    const friendship = await client.query(
      `
          SELECT 1
          FROM friendships
          WHERE user_low_id = LEAST($1, $2)::uuid
          AND user_high_id = GREATEST($1, $2)::uuid
      `,
      [senderUserId, targetUserId],
    );

    if (friendship.rowCount === 0) {
      throw new ApiError(403, "Hearts can only be sent to friends.");
    }

    const existing = await client.query(
      `
        SELECT 1
        FROM profile_hearts
        WHERE sender_user_id = $1
          AND target_user_id = $2
      `,
      [senderUserId, targetUserId],
    );

    if (existing.rowCount > 0) {
      await client.query(
        `
          DELETE FROM profile_hearts
          WHERE sender_user_id = $1
            AND target_user_id = $2
        `,
        [senderUserId, targetUserId],
      );
      await client.query(
        `
          UPDATE users
          SET hearts_received = GREATEST(0, hearts_received - 1), updated_at = NOW()
          WHERE id = $1
        `,
        [targetUserId],
      );

      return loadTargetUserSummary(false);
    }

    await client.query(
      `
        INSERT INTO profile_hearts (sender_user_id, target_user_id)
        VALUES ($1, $2)
      `,
      [senderUserId, targetUserId],
    );
    await client.query(
      `
        UPDATE users
        SET hearts_received = hearts_received + 1, updated_at = NOW()
        WHERE id = $1
      `,
      [targetUserId],
    );

    return loadTargetUserSummary(true);
  });
}

export async function getLeaderboard(period = "week", viewerUserId = null) {
  const interval = PERIOD_INTERVALS[period] ?? PERIOD_INTERVALS.week;
  const leadersResult = await query(
    `
      WITH ranked AS (
        SELECT
          users.id,
          users.username,
          users.display_name,
          users.avatar_key,
          users.decoration_key,
          users.profile_background_key,
          users.level,
          users.hearts_received,
          users.skill_focus,
          users.assessment_summary,
          COALESCE(SUM(user_xp_events.xp_delta), 0)::INT AS xp_gained,
          RANK() OVER (
            ORDER BY
              COALESCE(SUM(user_xp_events.xp_delta), 0) DESC,
              users.level DESC,
              users.username ASC
          )::INT AS rank_position,
          COUNT(*) OVER ()::INT AS total_users
        FROM users
        LEFT JOIN user_xp_events
          ON user_xp_events.user_id = users.id
         AND user_xp_events.created_at >= NOW() - ($1)::INTERVAL
        WHERE users.deleted_at IS NULL
        GROUP BY users.id
      )
      SELECT *
      FROM ranked
      ORDER BY rank_position ASC
      LIMIT 20
    `,
    [interval],
  );

  const leaders = leadersResult.rows.map(row => ({
    rank: Number(row.rank_position ?? 0),
    user: buildCompactUserSummary(row),
    xpGained: Number(row.xp_gained ?? 0),
  }));

  let viewer = null;
  if (viewerUserId) {
    const viewerResult = await query(
      `
        WITH ranked AS (
          SELECT
            users.id,
            users.username,
            users.display_name,
            users.avatar_key,
            users.decoration_key,
            users.profile_background_key,
            users.level,
            users.hearts_received,
            users.skill_focus,
            users.assessment_summary,
            COALESCE(SUM(user_xp_events.xp_delta), 0)::INT AS xp_gained,
            RANK() OVER (
              ORDER BY
                COALESCE(SUM(user_xp_events.xp_delta), 0) DESC,
                users.level DESC,
                users.username ASC
            )::INT AS rank_position,
            COUNT(*) OVER ()::INT AS total_users
          FROM users
          LEFT JOIN user_xp_events
            ON user_xp_events.user_id = users.id
           AND user_xp_events.created_at >= NOW() - ($1)::INTERVAL
          WHERE users.deleted_at IS NULL
          GROUP BY users.id
        )
        SELECT *
        FROM ranked
        WHERE id = $2
      `,
      [interval, viewerUserId],
    );

    if (viewerResult.rowCount > 0) {
      const row = viewerResult.rows[0];
      const totalUsers = Number(row.total_users ?? 0);
      const rank = Number(row.rank_position ?? 0);
      viewer = {
        rank,
        totalUsers,
        xpGained: Number(row.xp_gained ?? 0),
        topPercent: totalUsers > 0 ? Math.max(1, Math.ceil((rank / totalUsers) * 100)) : null,
        isTopTen: rank > 0 && rank <= 10,
        user: buildCompactUserSummary(row),
      };
    }
  }

  return {
    leaders,
    viewer,
  };
}

export async function deleteAccount(userId, io = null) {
  const { filesToDelete, deletedRoomIds } = await withTransaction(async client => {
    const ownedRoomsResult = await client.query(
      `
        SELECT id
        FROM rooms
        WHERE owner_id = $1
        ORDER BY created_at ASC
      `,
      [userId],
    );

    const deletedRoomIds = ownedRoomsResult.rows.map(row => row.id);

    const ownedRoomFiles = deletedRoomIds.length
      ? await client.query(
      `
        SELECT DISTINCT attachments.storage_path
        FROM rooms
        JOIN messages ON messages.room_id = rooms.id
        JOIN attachments ON attachments.message_id = messages.id
        WHERE rooms.id = ANY($1::UUID[])
      `,
          [deletedRoomIds],
        )
      : { rows: [] };

    const dialogFiles = await client.query(
      `
        SELECT DISTINCT attachments.storage_path
        FROM personal_dialogs
        JOIN messages ON messages.dialog_id = personal_dialogs.id
        JOIN attachments ON attachments.message_id = messages.id
        WHERE personal_dialogs.user_low_id = $1
           OR personal_dialogs.user_high_id = $1
      `,
      [userId],
    );

    await client.query(`DELETE FROM users WHERE id = $1`, [userId]);

    return {
      filesToDelete: [...ownedRoomFiles.rows, ...dialogFiles.rows].map(row => row.storage_path),
      deletedRoomIds,
    };
  });

  await Promise.all(filesToDelete.map(pathname => deleteFileIfExists(pathname)));

  deletedRoomIds.forEach(roomId => {
    emitToRoom(io, roomId, "room:deleted", { roomId });
  });
}
