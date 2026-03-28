const PROFILE_BACKGROUNDS = {
  "bg-aurora": {
    title: "Aurora Mist",
    background:
      "radial-gradient(circle at top left, rgba(49, 202, 177, 0.24), transparent 32%), linear-gradient(135deg, rgba(11, 28, 42, 0.98), rgba(18, 44, 58, 0.94), rgba(15, 37, 54, 0.96))",
  },
  "bg-midnight-grid": {
    title: "Midnight Grid",
    background:
      "linear-gradient(135deg, rgba(9, 17, 30, 0.98), rgba(18, 29, 52, 0.96)), repeating-linear-gradient(90deg, rgba(91, 136, 255, 0.08) 0, rgba(91, 136, 255, 0.08) 1px, transparent 1px, transparent 38px), repeating-linear-gradient(0deg, rgba(91, 136, 255, 0.08) 0, rgba(91, 136, 255, 0.08) 1px, transparent 1px, transparent 38px)",
  },
  "bg-sunrise-wave": {
    title: "Sunrise Wave",
    background:
      "radial-gradient(circle at top right, rgba(255, 196, 128, 0.22), transparent 28%), linear-gradient(135deg, rgba(49, 33, 45, 0.94), rgba(150, 89, 74, 0.9), rgba(84, 41, 49, 0.94))",
  },
  "bg-emerald-cloud": {
    title: "Emerald Cloud",
    background:
      'radial-gradient(circle at top left, rgba(117, 255, 202, 0.18), transparent 26%), radial-gradient(circle at bottom right, rgba(56, 185, 143, 0.22), transparent 34%), linear-gradient(135deg, rgba(8, 26, 30, 0.96), rgba(16, 56, 55, 0.92), rgba(10, 34, 39, 0.96))',
  },
};

export const PROFILE_BACKGROUND_OPTIONS = Object.entries(PROFILE_BACKGROUNDS).map(([key, value]) => ({
  key,
  title: value.title,
}));

export function getProfileBackgroundMeta(key) {
  return PROFILE_BACKGROUNDS[key] ?? PROFILE_BACKGROUNDS["bg-aurora"];
}

export function getProfileBackgroundStyle(key) {
  return {
    "--profile-background": getProfileBackgroundMeta(key).background,
  };
}
