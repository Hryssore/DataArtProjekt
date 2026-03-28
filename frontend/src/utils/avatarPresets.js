export const STATIC_AVATAR_LOOKS = {
  "ember-fox": {
    glyph: "F",
    label: "Ember Fox",
    background: "linear-gradient(135deg, #f7c27a, #c35f2c)",
  },
  "midnight-cat": {
    glyph: "C",
    label: "Midnight Cat",
    background: "linear-gradient(135deg, #6674a0, #273246)",
  },
  "garden-owl": {
    glyph: "O",
    label: "Garden Owl",
    background: "linear-gradient(135deg, #97c079, #4c7250)",
  },
  "sky-whale": {
    glyph: "W",
    label: "Sky Whale",
    background: "linear-gradient(135deg, #8fd1e8, #3e7ca2)",
  },
};

export const GENERATED_AVATAR_PRESETS = [
  { key: "initial-sunrise", label: "Sunrise Letter", colors: ["#f7c27a", "#e48b57", "#b9542b"] },
  { key: "initial-ember", label: "Ember Letter", colors: ["#ffb17a", "#df6c45", "#7c2d1e"] },
  { key: "initial-forest", label: "Forest Letter", colors: ["#a3d18e", "#5a8a5d", "#21483a"] },
  { key: "initial-ocean", label: "Ocean Letter", colors: ["#8fd6f0", "#4f8fca", "#214b7d"] },
  { key: "initial-royal", label: "Royal Letter", colors: ["#b9a2f4", "#8065b2", "#3f2a6d"] },
  { key: "initial-graphite", label: "Graphite Letter", colors: ["#e7d8cb", "#7b7481", "#2f3540"] },
];

const GENERATED_AVATAR_MAP = Object.fromEntries(
  GENERATED_AVATAR_PRESETS.map(item => [item.key, item]),
);

function getSeed(text) {
  return [...(text || "A")].reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
}

export function getInitialGlyph(user) {
  const source = user?.displayName || user?.username || "?";
  const firstCharacter = source.trim().charAt(0) || "?";
  return firstCharacter.toUpperCase();
}

export function isGeneratedAvatarKey(value) {
  return Boolean(GENERATED_AVATAR_MAP[value]);
}

export function getSuggestedGeneratedAvatarKey(user) {
  const seed = getSeed(getInitialGlyph(user));
  return GENERATED_AVATAR_PRESETS[seed % GENERATED_AVATAR_PRESETS.length].key;
}

export function getRandomGeneratedAvatarKey(user, currentKey = "") {
  const available = GENERATED_AVATAR_PRESETS.map(item => item.key).filter(key => key !== currentKey);
  if (available.length === 0) {
    return getSuggestedGeneratedAvatarKey(user);
  }

  const seedBase = getSeed(`${getInitialGlyph(user)}-${Date.now()}-${Math.random()}`);
  return available[seedBase % available.length];
}

export function getAvatarLook(user) {
  const avatarKey = user?.avatarKey || "ember-fox";
  if (STATIC_AVATAR_LOOKS[avatarKey]) {
    return STATIC_AVATAR_LOOKS[avatarKey];
  }

  if (GENERATED_AVATAR_MAP[avatarKey]) {
    const preset = GENERATED_AVATAR_MAP[avatarKey];
    const glyph = getInitialGlyph(user);
    const seed = getSeed(glyph);
    const first = preset.colors[seed % preset.colors.length];
    const second = preset.colors[(seed + 1) % preset.colors.length];
    return {
      glyph,
      label: `${preset.label} (${glyph})`,
      background: `linear-gradient(135deg, ${first}, ${second})`,
    };
  }

  return STATIC_AVATAR_LOOKS["ember-fox"];
}
