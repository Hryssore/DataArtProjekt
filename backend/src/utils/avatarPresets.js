export const GENERATED_AVATAR_KEYS = [
  "initial-sunrise",
  "initial-ember",
  "initial-forest",
  "initial-ocean",
  "initial-royal",
  "initial-graphite",
];

export function isGeneratedAvatarKey(value) {
  return GENERATED_AVATAR_KEYS.includes(value);
}
