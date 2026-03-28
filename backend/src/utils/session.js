import crypto from "node:crypto";

export function createSessionToken() {
  return crypto.randomBytes(48).toString("hex");
}

export function hashOpaqueToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createPasswordResetToken() {
  return crypto.randomBytes(32).toString("hex");
}
