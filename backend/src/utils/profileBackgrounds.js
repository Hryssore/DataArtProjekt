export const PROFILE_BACKGROUND_KEYS = [
  "bg-aurora",
  "bg-midnight-grid",
  "bg-sunrise-wave",
  "bg-emerald-cloud",
];

export function isProfileBackgroundKey(value) {
  return PROFILE_BACKGROUND_KEYS.includes(value);
}
