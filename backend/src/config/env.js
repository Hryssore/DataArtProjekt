import { resolve } from "node:path";

import dotenv from "dotenv";

dotenv.config();

function readNumber(name, fallback) {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }

  return parsed;
}

function readBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === "") {
    return fallback;
  }

  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`Environment variable ${name} must be a boolean.`);
}

function readString(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Environment variable ${name} is required.`);
  }

  return value;
}

const nodeEnv = process.env.NODE_ENV ?? "development";

export const env = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  port: readNumber("APP_PORT", 3000),
  frontendOrigin: readString("FRONTEND_ORIGIN", "http://localhost:5173"),
  resetPasswordUrlBase: readString(
    "RESET_PASSWORD_URL_BASE",
    `${process.env.FRONTEND_ORIGIN ?? "http://localhost:5173"}/reset-password`,
  ),
  databaseUrl: readString("DATABASE_URL", "postgres://chat:chat@localhost:5432/chat_app"),
  sessionCookieName: readString("SESSION_COOKIE_NAME", "chat_sid"),
  sessionTtlDays: readNumber("SESSION_TTL_DAYS", 30),
  resetTokenTtlMinutes: readNumber("RESET_TOKEN_TTL_MINUTES", 30),
  uploadsDir: resolve(process.cwd(), readString("UPLOADS_DIR", "src/storage/uploads")),
  mailboxDir: resolve(process.cwd(), readString("MAILBOX_DIR", "src/storage/mailbox")),
  mailFrom: readString("MAIL_FROM", "Classic Chat <no-reply@classic-chat.local>"),
  smtpHost: process.env.SMTP_HOST?.trim() || "",
  smtpPort: readNumber("SMTP_PORT", 1025),
  smtpSecure: readBoolean("SMTP_SECURE", false),
  smtpUser: process.env.SMTP_USER?.trim() || "",
  smtpPass: process.env.SMTP_PASS?.trim() || "",
  maxTextBytes: readNumber("MAX_TEXT_BYTES", 3072),
  maxFileSizeBytes: readNumber("MAX_FILE_SIZE_BYTES", 20 * 1024 * 1024),
  maxImageSizeBytes: readNumber("MAX_IMAGE_SIZE_BYTES", 3 * 1024 * 1024),
  translationApiUrl: process.env.TRANSLATION_API_URL?.trim() || "http://translator:5000/translate",
  translationApiKey: process.env.TRANSLATION_API_KEY?.trim() || "",
  translationTimeoutMs: readNumber("TRANSLATION_TIMEOUT_MS", 15000),
};

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: env.isProduction,
    maxAge: env.sessionTtlDays * 24 * 60 * 60 * 1000,
    path: "/",
  };
}
