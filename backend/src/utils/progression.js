export function xpRequiredForLevel(level) {
  if (level <= 1) {
    return 0;
  }

  return Math.round(180 * Math.pow(level - 1, 2));
}

export function levelFromXp(xpPoints) {
  let level = 1;

  while (xpRequiredForLevel(level + 1) <= xpPoints) {
    level += 1;
  }

  return level;
}

export function buildProgressDto(row) {
  const xpPoints = Number(row.xp_points ?? 0);
  const level = Number(row.level ?? levelFromXp(xpPoints));
  const currentLevelXp = xpRequiredForLevel(level);
  const nextLevelXp = xpRequiredForLevel(level + 1);
  const xpIntoLevel = xpPoints - currentLevelXp;
  const xpSpan = Math.max(1, nextLevelXp - currentLevelXp);

  return {
    xpPoints,
    level,
    nextLevelXp,
    currentLevelXp,
    xpIntoLevel,
    progressPercent: Math.min(100, Math.round((xpIntoLevel / xpSpan) * 100)),
    heartsReceived: Number(row.hearts_received ?? 0),
  };
}
