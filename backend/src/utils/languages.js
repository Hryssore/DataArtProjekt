const LANGUAGE_DEFINITIONS = [
  { code: "uk", label: "Ukrainian", aliases: ["uk", "ukrainian", "ukr", "українська", "украинский"] },
  { code: "en", label: "English", aliases: ["en", "english", "eng", "англійська", "английский"] },
  { code: "pl", label: "Polish", aliases: ["pl", "polish", "polski", "польська", "польский"] },
  { code: "de", label: "German", aliases: ["de", "german", "deutsch", "німецька", "немецкий"] },
  { code: "es", label: "Spanish", aliases: ["es", "spanish", "espanol", "espanol", "іспанська", "испанский"] },
  { code: "fr", label: "French", aliases: ["fr", "french", "francais", "français", "французька", "французский"] },
  { code: "it", label: "Italian", aliases: ["it", "italian", "italiano", "італійська", "итальянский"] },
  { code: "pt", label: "Portuguese", aliases: ["pt", "portuguese", "portugues", "português", "португальська", "португальский"] },
  { code: "tr", label: "Turkish", aliases: ["tr", "turkish", "turkce", "türkçe", "турецька", "турецкий"] },
  { code: "ru", label: "Russian", aliases: ["ru", "russian", "русский", "російська", "российский"] },
];

const LANGUAGE_ALIAS_MAP = new Map();
const LANGUAGE_LABEL_MAP = new Map();

for (const definition of LANGUAGE_DEFINITIONS) {
  LANGUAGE_LABEL_MAP.set(definition.code, definition.label);
  definition.aliases.forEach(alias => {
    LANGUAGE_ALIAS_MAP.set(alias.toLowerCase(), definition.code);
  });
}

const RESOURCE_KEY_MAP = {
  en: "english",
};

export function normalizeLanguageCode(value) {
  if (!value) {
    return "";
  }

  const normalized = String(value).trim().toLowerCase();
  return LANGUAGE_ALIAS_MAP.get(normalized) ?? normalized.slice(0, 12);
}

export function getLanguageLabel(code) {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) {
    return "";
  }

  return LANGUAGE_LABEL_MAP.get(normalized) ?? normalized.toUpperCase();
}

export function getLanguageResourceKey(code) {
  const normalized = normalizeLanguageCode(code);
  return RESOURCE_KEY_MAP[normalized] ?? normalized;
}

export function isSupportedLanguage(code) {
  return LANGUAGE_LABEL_MAP.has(normalizeLanguageCode(code));
}

export const SUPPORTED_LANGUAGE_CODES = LANGUAGE_DEFINITIONS.map(item => item.code);
