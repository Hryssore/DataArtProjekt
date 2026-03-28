import bcrypt from "bcryptjs";

import { env } from "../../config/env.js";
import { withTransaction } from "../../db/pool.js";
import { ApiError } from "../../utils/apiError.js";
import { sendPasswordResetEmail } from "../../utils/mailer.js";
import { createPasswordResetToken, hashOpaqueToken } from "../../utils/session.js";
import { buildUserSummary } from "../../utils/userDtos.js";
import { deleteAccount } from "../users/service.js";
import { createSessionForUser, destroyAllSessionsForUser, destroyCurrentSession } from "../sessions/service.js";

function buildUserDto(row) {
  return buildUserSummary(row);
}

function mapConstraintError(error) {
  if (error?.code !== "23505") {
    return error;
  }

  if (String(error.constraint).includes("users_email")) {
    return new ApiError(409, "Email is already registered.");
  }

  if (String(error.constraint).includes("users_username")) {
    return new ApiError(409, "Username is already taken.");
  }

  return new ApiError(409, "A unique field already exists.");
}

export async function registerUser({ email, username, password, ipAddress, userAgent }) {
  try {
    return await withTransaction(async client => {
      const passwordHash = await bcrypt.hash(password, 12);
      const createdUser = await client.query(
        `
          INSERT INTO users (email, username, password_hash)
          VALUES ($1, $2, $3)
          RETURNING *
        `,
        [email, username, passwordHash],
      );

      const user = createdUser.rows[0];
      const { token, session } = await createSessionForUser(client, {
        userId: user.id,
        ipAddress,
        userAgent,
      });

      return {
        user: buildUserDto(user),
        token,
        session,
      };
    });
  } catch (error) {
    throw mapConstraintError(error);
  }
}

export async function loginUser({ email, password, ipAddress, userAgent }) {
  return withTransaction(async client => {
    const userResult = await client.query(
      `
        SELECT *
        FROM users
        WHERE email = $1
          AND deleted_at IS NULL
      `,
      [email],
    );

    if (userResult.rowCount === 0) {
      throw new ApiError(401, "Invalid email or password.");
    }

    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      throw new ApiError(401, "Invalid email or password.");
    }

    const { token, session } = await createSessionForUser(client, {
      userId: user.id,
      ipAddress,
      userAgent,
    });

    return {
      user: buildUserDto(user),
      token,
      session,
    };
  });
}

export async function changePassword(userId, currentPassword, nextPassword) {
  return withTransaction(async client => {
    const userResult = await client.query(
      `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );

    if (userResult.rowCount === 0) {
      throw new ApiError(404, "User not found.");
    }

    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isValidPassword) {
      throw new ApiError(400, "Current password is incorrect.");
    }

    const newPasswordHash = await bcrypt.hash(nextPassword, 12);
    await client.query(
      `
        UPDATE users
        SET password_hash = $2, updated_at = NOW()
        WHERE id = $1
      `,
      [userId, newPasswordHash],
    );
  });
}

export async function requestPasswordReset(email) {
  const resetRequest = await withTransaction(async client => {
    const userResult = await client.query(
      `
        SELECT id, email, username, display_name
        FROM users
        WHERE email = $1
          AND deleted_at IS NULL
      `,
      [email],
    );

    if (userResult.rowCount === 0) {
      return null;
    }

    const resetToken = createPasswordResetToken();
    await client.query(
      `
        DELETE FROM password_reset_tokens
        WHERE user_id = $1
          AND used_at IS NULL
      `,
      [userResult.rows[0].id],
    );
    await client.query(
      `
        INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
        VALUES ($1, $2, NOW() + ($3 || ' minutes')::INTERVAL)
      `,
      [userResult.rows[0].id, hashOpaqueToken(resetToken), env.resetTokenTtlMinutes],
    );

    return {
      resetToken,
      user: userResult.rows[0],
    };
  });

  if (resetRequest) {
    const resetUrl = new URL(env.resetPasswordUrlBase);
    resetUrl.searchParams.set("token", resetRequest.resetToken);

    await sendPasswordResetEmail({
      email: resetRequest.user.email,
      displayName: resetRequest.user.display_name || resetRequest.user.username,
      resetUrl: resetUrl.toString(),
    });
  }

  return {
    ok: true,
    message: "If the email exists, reset instructions have been sent.",
  };
}

export async function resetPassword(resetToken, nextPassword) {
  return withTransaction(async client => {
    const tokenHash = hashOpaqueToken(resetToken);
    const tokenResult = await client.query(
      `
        SELECT *
        FROM password_reset_tokens
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
      `,
      [tokenHash],
    );

    if (tokenResult.rowCount === 0) {
      throw new ApiError(400, "Reset token is invalid or expired.");
    }

    const tokenRow = tokenResult.rows[0];
    const passwordHash = await bcrypt.hash(nextPassword, 12);

    await client.query(
      `UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
      [tokenRow.user_id, passwordHash],
    );
    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`,
      [tokenRow.id],
    );
    await destroyAllSessionsForUser(client, tokenRow.user_id);
  });
}

export async function logoutCurrentSession(sessionId) {
  await destroyCurrentSession(sessionId);
}

export async function deleteCurrentAccount(userId, io = null) {
  await deleteAccount(userId, io);
}
