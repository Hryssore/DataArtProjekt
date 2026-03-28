import { levelFromXp } from "./progression.js";

export async function awardUserProgress(client, userId, sourceType, sourceId, xpDelta) {
  const safeXpDelta = Math.max(0, Math.trunc(xpDelta ?? 0));

  const currentResult = await client.query(
    `
      SELECT xp_points, level
      FROM users
      WHERE id = $1
    `,
    [userId],
  );

  if (currentResult.rowCount === 0) {
    return null;
  }

  const current = currentResult.rows[0];
  const nextXp = Number(current.xp_points ?? 0) + safeXpDelta;
  const nextLevel = levelFromXp(nextXp);

  if (safeXpDelta > 0) {
    await client.query(
      `
        INSERT INTO user_xp_events (user_id, source_type, source_id, xp_delta)
        VALUES ($1, $2, $3, $4)
      `,
      [userId, sourceType, sourceId, safeXpDelta],
    );
  }

  const updated = await client.query(
    `
      UPDATE users
      SET
        xp_points = $2,
        level = $3,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [userId, nextXp, nextLevel],
  );

  return updated.rows[0] ?? null;
}
