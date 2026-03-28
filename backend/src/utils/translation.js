import { env } from "../config/env.js";
import { ApiError } from "./apiError.js";
import { getLanguageLabel, normalizeLanguageCode } from "./languages.js";

function extractProviderError(payload) {
  if (!payload) {
    return "";
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (typeof payload.message === "string") {
    return payload.message;
  }

  return "";
}

export async function translateText(text, targetLanguage) {
  if (!env.translationApiUrl) {
    throw new ApiError(503, "Translation service is not configured.");
  }

  const normalizedTargetLanguage = normalizeLanguageCode(targetLanguage);
  if (!normalizedTargetLanguage) {
    throw new ApiError(400, "Choose a main language before translating messages.");
  }

  let response;
  try {
    response = await fetch(env.translationApiUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: text,
        source: "auto",
        target: normalizedTargetLanguage,
        format: "text",
        ...(env.translationApiKey
          ? {
              api_key: env.translationApiKey,
            }
          : {}),
      }),
      signal: AbortSignal.timeout(env.translationTimeoutMs),
    });
  } catch (_error) {
    throw new ApiError(503, "Translation service is warming up or unavailable right now.");
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const details = extractProviderError(payload);
    throw new ApiError(
      503,
      details || "Translation service could not process this message right now.",
    );
  }

  const translatedText = payload?.translatedText?.trim();
  if (!translatedText) {
    throw new ApiError(503, "Translation service returned an empty result.");
  }

  const detectedSourceLanguage = normalizeLanguageCode(
    payload?.detectedLanguage?.language ??
      payload?.detectedSourceLanguage ??
      payload?.detected_language,
  );

  return {
    provider: "libretranslate",
    translatedText,
    targetLanguage: normalizedTargetLanguage,
    targetLanguageLabel: getLanguageLabel(normalizedTargetLanguage),
    detectedSourceLanguage,
    detectedSourceLanguageLabel: getLanguageLabel(detectedSourceLanguage),
  };
}
