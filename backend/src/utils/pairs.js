export function normalizeUserPair(leftId, rightId) {
  return [leftId, rightId].sort((left, right) => left.localeCompare(right));
}

export function clampLimit(value, fallback = 30, min = 1, max = 100) {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}
