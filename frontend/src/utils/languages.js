export const LANGUAGE_OPTIONS = [
  { code: "uk", label: "Ukrainian" },
  { code: "en", label: "English" },
  { code: "pl", label: "Polish" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "it", label: "Italian" },
  { code: "pt", label: "Portuguese" },
  { code: "tr", label: "Turkish" },
  { code: "ru", label: "Russian" },
];

const LANGUAGE_LABELS = Object.fromEntries(LANGUAGE_OPTIONS.map(item => [item.code, item.label]));
const LANGUAGE_ALIASES = {
  uk: "uk",
  ukrainian: "uk",
  "українська": "uk",
  en: "en",
  english: "en",
  "англійська": "en",
  pl: "pl",
  polish: "pl",
  polski: "pl",
  de: "de",
  german: "de",
  deutsch: "de",
  es: "es",
  spanish: "es",
  fr: "fr",
  french: "fr",
  it: "it",
  italian: "it",
  pt: "pt",
  portuguese: "pt",
  tr: "tr",
  turkish: "tr",
  ru: "ru",
  russian: "ru",
};

export function normalizeLanguageCode(value) {
  if (!value) {
    return "";
  }

  const normalized = String(value).trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? normalized.slice(0, 12);
}

export function getLanguageLabel(code) {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) {
    return "";
  }

  return LANGUAGE_LABELS[normalized] ?? normalized.toUpperCase();
}
