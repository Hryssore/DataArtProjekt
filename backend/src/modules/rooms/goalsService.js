import { withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/apiError.js";
import { getLanguageLabel, getLanguageResourceKey } from "../../utils/languages.js";
import { assertRoomMember } from "../../utils/permissions.js";
import { awardUserProgress } from "../../utils/progressionStore.js";
import { emitToRoom } from "../../utils/realtime.js";

const DISCUSSION_TOPIC_PREFIX = "[Discussion] ";

const ROOM_GOAL_BASE_SELECT = `
  SELECT
    room_goals.id AS goal_id,
    room_goals.room_id AS goal_room_id,
    room_goals.created_by_user_id AS goal_created_by_user_id,
    room_goals.title AS goal_title,
    room_goals.description AS goal_description,
    room_goals.reward_xp AS goal_reward_xp,
    room_goals.status AS goal_status,
    room_goals.created_at AS goal_created_at,
    room_goals.updated_at AS goal_updated_at,
    room_goals.completed_at AS goal_completed_at,
    (rooms.active_topic_goal_id = room_goals.id) AS goal_is_active_topic,
    room_goal_steps.id AS step_id,
    room_goal_steps.title AS step_title,
    room_goal_steps.is_completed AS step_is_completed,
    room_goal_steps.step_order
  FROM room_goals
  JOIN rooms ON rooms.id = room_goals.room_id
  LEFT JOIN room_goal_steps ON room_goal_steps.goal_id = room_goals.id
`;

const STEP_LIBRARY = {
  javascript: [
    "Define the core concept you want to master.",
    "Build one tiny example from scratch.",
    "Write down two mistakes you hit and how you fixed them.",
    "Share the result in the room and ask for feedback.",
  ],
  react: [
    "Break the feature into UI state, data flow, and events.",
    "Sketch the component tree before coding.",
    "Implement the smallest working component first.",
    "Refactor after the first working pass and document what changed.",
  ],
  english: [
    "Choose one topic and list ten useful words.",
    "Write a short paragraph using the new vocabulary.",
    "Read it aloud and note pronunciation problems.",
    "Ask the group for one correction and one improvement.",
  ],
  default: [
    "Clarify the target outcome in one sentence.",
    "Split it into small steps you can finish in one sitting.",
    "Complete the first step and note what blocked you.",
    "Share progress with the group and plan the next move.",
  ],
};

const RESOURCE_LIBRARY = {
  javascript: [
    { title: "MDN JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide" },
    { title: "javascript.info", url: "https://javascript.info/" },
  ],
  react: [
    { title: "React Learn", url: "https://react.dev/learn" },
    { title: "React Router Tutorial", url: "https://reactrouter.com/en/main/start/tutorial" },
  ],
  english: [
    { title: "BBC Learning English", url: "https://www.bbc.co.uk/learningenglish" },
    { title: "Cambridge Activities", url: "https://www.cambridgeenglish.org/learning-english/activities-for-learners/" },
  ],
  default: [
    { title: "freeCodeCamp", url: "https://www.freecodecamp.org/learn/" },
    { title: "Roadmap.sh", url: "https://roadmap.sh/" },
  ],
};

function buildStepSuggestions(title, preferredLanguage, skillFocus) {
  const key = [getLanguageResourceKey(preferredLanguage), getLanguageLabel(preferredLanguage), skillFocus, title]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (key.includes("react")) {
    return {
      steps: STEP_LIBRARY.react,
      resources: RESOURCE_LIBRARY.react,
    };
  }

  if (key.includes("javascript") || key.includes("js")) {
    return {
      steps: STEP_LIBRARY.javascript,
      resources: RESOURCE_LIBRARY.javascript,
    };
  }

  if (key.includes("english")) {
    return {
      steps: STEP_LIBRARY.english,
      resources: RESOURCE_LIBRARY.english,
    };
  }

  return {
    steps: STEP_LIBRARY.default,
    resources: RESOURCE_LIBRARY.default,
  };
}

function mapGoals(rows) {
  const goals = new Map();

  rows.forEach(row => {
    if (!goals.has(row.goal_id)) {
      goals.set(row.goal_id, {
        id: row.goal_id,
        title: row.goal_title,
        description: row.goal_description,
        rewardXp: Number(row.goal_reward_xp ?? 0),
        status: row.goal_status,
        roomId: row.goal_room_id,
        createdByUserId: row.goal_created_by_user_id,
        createdAt: row.goal_created_at,
        updatedAt: row.goal_updated_at,
        completedAt: row.goal_completed_at,
        isActiveTopic: Boolean(row.goal_is_active_topic),
        steps: [],
      });
    }

    if (row.step_id) {
      goals.get(row.goal_id).steps.push({
        id: row.step_id,
        title: row.step_title,
        isCompleted: row.step_is_completed,
        stepOrder: Number(row.step_order ?? 0),
      });
    }
  });

  return [...goals.values()];
}

async function listGoalsForWhere(client, whereSql, params) {
  const result = await client.query(
    `
      ${ROOM_GOAL_BASE_SELECT}
      ${whereSql}
      ORDER BY room_goals.created_at DESC, room_goal_steps.step_order ASC, room_goal_steps.created_at ASC
    `,
    params,
  );

  return mapGoals(result.rows);
}

async function getRoomGoalForUser(client, roomId, goalId, userId) {
  const result = await client.query(
    `
      SELECT
        room_goals.id,
        room_goals.room_id,
        room_goals.created_by_user_id,
        room_goals.title,
        room_goals.reward_xp,
        rooms.active_topic_goal_id = room_goals.id AS is_active_topic,
        EXISTS (
          SELECT 1
          FROM room_admins
          WHERE room_admins.room_id = room_goals.room_id
            AND room_admins.user_id = $3
        ) AS current_user_is_admin,
        rooms.owner_id = $3 AS current_user_is_owner
      FROM room_goals
      JOIN rooms ON rooms.id = room_goals.room_id
      WHERE room_goals.id = $1
        AND room_goals.room_id = $2
    `,
    [goalId, roomId, userId],
  );

  return result.rows[0] ?? null;
}

async function assertGoalManager(client, roomId, goalId, userId) {
  const goal = await getRoomGoalForUser(client, roomId, goalId, userId);

  if (!goal) {
    throw new ApiError(404, "Goal or topic not found.");
  }

  if (
    goal.created_by_user_id !== userId &&
    !goal.current_user_is_admin &&
    !goal.current_user_is_owner
  ) {
    throw new ApiError(403, "Only the creator, an admin, or the owner can change this item.");
  }

  return goal;
}

async function fetchSingleGoal(client, goalId) {
  const goals = await listGoalsForWhere(client, `WHERE room_goals.id = $1`, [goalId]);
  return goals[0] ?? null;
}

export async function listRoomGoals(userId, roomId) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);
    return listGoalsForWhere(client, `WHERE room_goals.room_id = $1`, [roomId]);
  });
}

export async function createRoomGoal(userId, roomId, payload, io = null) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const created = await client.query(
      `
        INSERT INTO room_goals (room_id, created_by_user_id, title, description, reward_xp, resource_language)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `,
      [
        roomId,
        userId,
        payload.title.trim(),
        payload.description?.trim() ?? "",
        payload.rewardXp ?? 30,
        payload.resourceLanguage ?? null,
      ],
    );

    const goalId = created.rows[0].id;
    const steps = (payload.steps ?? []).filter(Boolean);
    for (let index = 0; index < steps.length; index += 1) {
      await client.query(
        `
          INSERT INTO room_goal_steps (goal_id, title, step_order)
          VALUES ($1, $2, $3)
        `,
        [goalId, steps[index], index],
      );
    }

    const shouldActivateInChat =
      Boolean(payload.activateInChat) &&
      payload.title.trim().startsWith(DISCUSSION_TOPIC_PREFIX);

    if (shouldActivateInChat) {
      await client.query(
        `
          UPDATE rooms
          SET active_topic_goal_id = $2
          WHERE id = $1
        `,
        [roomId, goalId],
      );
    }

    const goal = await fetchSingleGoal(client, goalId);
    emitToRoom(io, roomId, "room:goals-updated", { roomId, goalId });
    if (shouldActivateInChat) {
      emitToRoom(io, roomId, "room:topic-updated", { roomId, goalId });
    }
    return goal;
  });
}

export async function suggestRoomGoalPlan(userId, roomId, title) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const profileResult = await client.query(
      `
        SELECT preferred_language, skill_focus
        FROM users
        WHERE id = $1
      `,
      [userId],
    );

    const profile = profileResult.rows[0] ?? {};
    return buildStepSuggestions(title, profile.preferred_language, profile.skill_focus);
  });
}

export async function addRoomGoalStep(userId, roomId, goalId, title, io = null) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const goalResult = await client.query(
      `
        SELECT id
        FROM room_goals
        WHERE id = $1
          AND room_id = $2
      `,
      [goalId, roomId],
    );

    if (goalResult.rowCount === 0) {
      throw new ApiError(404, "Goal not found.");
    }

    const orderResult = await client.query(
      `
        SELECT COALESCE(MAX(step_order), -1) + 1 AS next_order
        FROM room_goal_steps
        WHERE goal_id = $1
      `,
      [goalId],
    );

    await client.query(
      `
        INSERT INTO room_goal_steps (goal_id, title, step_order)
        VALUES ($1, $2, $3)
      `,
      [goalId, title.trim(), orderResult.rows[0].next_order],
    );

    const goal = await fetchSingleGoal(client, goalId);
    emitToRoom(io, roomId, "room:goals-updated", { roomId, goalId });
    return goal;
  });
}

export async function updateRoomGoal(userId, roomId, goalId, payload, io = null) {
  return withTransaction(async client => {
    const goal = await assertGoalManager(client, roomId, goalId, userId);

    await client.query(
      `
        UPDATE room_goals
        SET
          title = $3,
          description = $4,
          updated_at = NOW()
        WHERE id = $1
          AND room_id = $2
      `,
      [goalId, roomId, payload.title.trim(), payload.description?.trim() ?? ""],
    );

    const shouldClearActiveTopic =
      goal.is_active_topic && !payload.title.trim().startsWith(DISCUSSION_TOPIC_PREFIX);

    if (shouldClearActiveTopic) {
      await client.query(
        `
          UPDATE rooms
          SET active_topic_goal_id = NULL
          WHERE id = $1
        `,
        [roomId],
      );
    }

    const updatedGoal = await fetchSingleGoal(client, goalId);
    emitToRoom(io, roomId, "room:goals-updated", { roomId, goalId });
    if (goal.is_active_topic || shouldClearActiveTopic) {
      emitToRoom(io, roomId, "room:topic-updated", { roomId, goalId: shouldClearActiveTopic ? null : goalId });
    }
    return updatedGoal;
  });
}

export async function deleteRoomGoal(userId, roomId, goalId, io = null) {
  return withTransaction(async client => {
    const goal = await assertGoalManager(client, roomId, goalId, userId);

    if (goal.is_active_topic) {
      await client.query(
        `
          UPDATE rooms
          SET active_topic_goal_id = NULL
          WHERE id = $1
        `,
        [roomId],
      );
    }

    await client.query(
      `
        DELETE FROM room_goals
        WHERE id = $1
          AND room_id = $2
      `,
      [goalId, roomId],
    );

    emitToRoom(io, roomId, "room:goals-updated", { roomId, goalId });
    if (goal.is_active_topic) {
      emitToRoom(io, roomId, "room:topic-updated", { roomId, goalId: null });
    }

    return { ok: true };
  });
}

export async function setActiveRoomTopic(userId, roomId, goalId, io = null) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);
    const goal = await getRoomGoalForUser(client, roomId, goalId, userId);

    if (!goal) {
      throw new ApiError(404, "Discussion topic not found.");
    }

    if (!goal.title.startsWith(DISCUSSION_TOPIC_PREFIX)) {
      throw new ApiError(400, "Only discussion topics can be opened in chat.");
    }

    await client.query(
      `
        UPDATE rooms
        SET active_topic_goal_id = $2
        WHERE id = $1
      `,
      [roomId, goalId],
    );

    const updatedGoal = await fetchSingleGoal(client, goalId);
    emitToRoom(io, roomId, "room:topic-updated", { roomId, goalId });
    emitToRoom(io, roomId, "room:goals-updated", { roomId, goalId });
    return updatedGoal;
  });
}

export async function clearActiveRoomTopic(userId, roomId, io = null) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    await client.query(
      `
        UPDATE rooms
        SET active_topic_goal_id = NULL
        WHERE id = $1
      `,
      [roomId],
    );

    emitToRoom(io, roomId, "room:topic-updated", { roomId, goalId: null });
    emitToRoom(io, roomId, "room:goals-updated", { roomId, goalId: null });
    return { ok: true };
  });
}

export async function toggleRoomGoalStep(userId, roomId, goalId, stepId, io = null) {
  return withTransaction(async client => {
    await assertRoomMember(client, roomId, userId);

    const stepResult = await client.query(
      `
        SELECT room_goal_steps.id, room_goal_steps.is_completed, room_goals.reward_xp, room_goals.status
        FROM room_goal_steps
        JOIN room_goals ON room_goals.id = room_goal_steps.goal_id
        WHERE room_goal_steps.id = $1
          AND room_goal_steps.goal_id = $2
          AND room_goals.room_id = $3
      `,
      [stepId, goalId, roomId],
    );

    if (stepResult.rowCount === 0) {
      throw new ApiError(404, "Goal step not found.");
    }

    const step = stepResult.rows[0];
    await client.query(
      `
        UPDATE room_goal_steps
        SET
          is_completed = $2,
          completed_by_user_id = CASE WHEN $2 THEN $3::uuid ELSE NULL::uuid END,
          completed_at = CASE WHEN $2 THEN NOW() ELSE NULL END
        WHERE id = $1
      `,
      [stepId, !step.is_completed, userId],
    );

    const remaining = await client.query(
      `
        SELECT COUNT(*)::INT AS remaining_count
        FROM room_goal_steps
        WHERE goal_id = $1
          AND is_completed = FALSE
      `,
      [goalId],
    );

    if (Number(remaining.rows[0]?.remaining_count ?? 0) === 0 && step.status !== "completed") {
      await client.query(
        `
          UPDATE room_goals
          SET
            status = 'completed',
            completed_by_user_id = $2::uuid,
            completed_at = NOW(),
            updated_at = NOW()
          WHERE id = $1
        `,
        [goalId, userId],
      );
      await awardUserProgress(
        client,
        userId,
        "room_goal",
        goalId,
        Number(step.reward_xp ?? 30),
      );
    } else if (Number(remaining.rows[0]?.remaining_count ?? 0) > 0 && step.status === "completed") {
      await client.query(
        `
          UPDATE room_goals
          SET
            status = 'open',
            completed_by_user_id = NULL,
            completed_at = NULL,
            updated_at = NOW()
          WHERE id = $1
        `,
        [goalId],
      );
    } else {
      await client.query(
        `
          UPDATE room_goals
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [goalId],
      );
    }

    const goal = await fetchSingleGoal(client, goalId);
    emitToRoom(io, roomId, "room:goals-updated", { roomId, goalId });
    return goal;
  });
}
