import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import nodemailer from "nodemailer";

import { env } from "../config/env.js";

let transporter = null;

function getTransporter() {
  if (!env.smtpHost) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth:
        env.smtpUser && env.smtpPass
          ? {
              user: env.smtpUser,
              pass: env.smtpPass,
            }
          : undefined,
    });
  }

  return transporter;
}

async function storeMailboxCopy(payload) {
  await mkdir(env.mailboxDir, { recursive: true });

  const fileName = `${Date.now()}-${payload.kind}.json`;
  const filePath = join(env.mailboxDir, fileName);

  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");

  return filePath;
}

export async function sendPasswordResetEmail({ email, displayName, resetUrl }) {
  const subject = "Reset your Classic Chat password";
  const greeting = displayName ? `Hi ${displayName},` : "Hi,";
  const text = [
    greeting,
    "",
    "We received a request to reset your Classic Chat password.",
    "Open the link below to choose a new password:",
    resetUrl,
    "",
    `This link expires in ${env.resetTokenTtlMinutes} minutes.`,
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #17212f;">
      <p>${greeting}</p>
      <p>We received a request to reset your Classic Chat password.</p>
      <p>
        <a href="${resetUrl}" style="display: inline-block; padding: 10px 16px; border-radius: 10px; background: #2858ff; color: #ffffff; text-decoration: none;">
          Reset password
        </a>
      </p>
      <p>If the button does not work, copy this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in ${env.resetTokenTtlMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    </div>
  `.trim();

  const mailboxPath = await storeMailboxCopy({
    kind: "password-reset",
    createdAt: new Date().toISOString(),
    to: email,
    subject,
    resetUrl,
    text,
  });

  const activeTransporter = getTransporter();

  if (!activeTransporter) {
    console.info(`[mailbox] Password reset link stored at ${mailboxPath}`);
    return;
  }

  try {
    await activeTransporter.sendMail({
      from: env.mailFrom,
      to: email,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("[mailbox] SMTP delivery failed, local mailbox copy kept.", error);
  }
}
