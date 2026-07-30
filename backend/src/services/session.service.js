/**
 * Session lifecycle: issue, rotate and revoke.
 *
 * ── Refresh-token rotation with reuse detection ─────────────────────────────
 * Every refresh consumes the presented token and issues a new one, marking the
 * old row `rotated` with `replacedBy` pointing at its successor. That chain is
 * what makes theft detectable.
 *
 * If a token that was ALREADY rotated away is presented again, there are two
 * possible explanations: a benign race (a client retried), or an attacker
 * replaying a stolen token while the legitimate client holds the newer one.
 * The two are indistinguishable from here, so the safe response is to revoke
 * every session for that user and force a fresh login. Losing a session is a
 * minor inconvenience; leaving a stolen one live is not.
 *
 * Only sha256(token) is ever stored — see models/Session.js.
 */
const { Session } = require("../models");
const config = require("../config/env");
const logger = require("../utils/logger");
const ApiError = require("../utils/ApiError");
const { ERROR_CODES } = require("../config/constants");

const DAY_MS = 24 * 60 * 60 * 1000;

function absoluteExpiry() {
  return new Date(Date.now() + config.session.refreshTokenDays * DAY_MS);
}

/** Extract client fingerprint for the active-devices list. */
function clientInfo(req) {
  return {
    userAgent: (req?.headers?.["user-agent"] || "").slice(0, 300),
    ipAddress: req?.ip || req?.socket?.remoteAddress || "",
  };
}

/**
 * Create a session and return its raw refresh token.
 * The raw token is returned ONCE and never persisted.
 */
async function createSession(userId, req) {
  const rawToken = Session.generateToken();

  const session = await Session.create({
    user: userId,
    refreshTokenHash: Session.hashToken(rawToken),
    expiresAt: absoluteExpiry(),
    lastUsedAt: new Date(),
    ...clientInfo(req),
  });

  return { session, refreshToken: rawToken };
}

/**
 * Exchange a refresh token for a new pair.
 *
 * @returns {Promise<{session: Object, refreshToken: string, userId: any}>}
 * @throws  {ApiError} 401 on anything suspicious
 */
async function rotateSession(rawToken, req) {
  if (!rawToken || typeof rawToken !== "string") {
    throw ApiError.unauthorized("Refresh token missing", ERROR_CODES.TOKEN_MISSING);
  }

  const hash = Session.hashToken(rawToken);
  const existing = await Session.findOne({ refreshTokenHash: hash });

  if (!existing) {
    throw ApiError.unauthorized("Invalid refresh token", ERROR_CODES.TOKEN_INVALID);
  }

  // ── Reuse detection ──────────────────────────────────────────────────────
  if (existing.revokedAt) {
    logger.warn(
      `Refresh-token reuse detected for user ${existing.user} ` +
        `(session ${existing._id}, revoked as "${existing.revokedReason}"). Revoking all sessions.`
    );
    await revokeAllForUser(existing.user, "reuse_detected");
    throw ApiError.unauthorized(
      "This session is no longer valid. For your security, all sessions have been ended.",
      ERROR_CODES.SESSION_REVOKED
    );
  }

  if (existing.expiresAt <= new Date()) {
    await existing.revoke("expired");
    throw ApiError.unauthorized("Your session has expired. Please log in again.", ERROR_CODES.SESSION_REVOKED);
  }

  // Idle timeout: a session untouched for longer than the window is stale even
  // if its absolute expiry has not arrived.
  const idleLimitMs = config.session.refreshIdleHours * 60 * 60 * 1000;
  if (existing.lastUsedAt && Date.now() - existing.lastUsedAt.getTime() > idleLimitMs) {
    await existing.revoke("expired");
    throw ApiError.unauthorized(
      "Your session timed out through inactivity. Please log in again.",
      ERROR_CODES.SESSION_REVOKED
    );
  }

  // Issue the successor, then point the old row at it.
  const { session: next, refreshToken } = await createSession(existing.user, req);
  await existing.revoke("rotated", next._id);

  return { session: next, refreshToken, userId: existing.user };
}

/** Revoke one session (logout). */
async function revokeSession(sessionId, reason = "logout") {
  const session = await Session.findById(sessionId);
  if (!session || session.revokedAt) return false;
  await session.revoke(reason);
  return true;
}

/**
 * Revoke every live session for a user.
 * @param {any} userId
 * @param {string} reason
 * @param {any} [exceptSessionId] keep this one live (used by change-password)
 */
async function revokeAllForUser(userId, reason = "logout_all", exceptSessionId = null) {
  const filter = { user: userId, revokedAt: null };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };

  const result = await Session.updateMany(filter, {
    $set: { revokedAt: new Date(), revokedReason: reason },
  });
  return result.modifiedCount || 0;
}

/** Live sessions for the active-devices list, newest first. */
async function listActiveSessions(userId) {
  return Session.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .sort("-lastUsedAt")
    .select("userAgent ipAddress lastUsedAt createdAt expiresAt")
    .lean();
}

module.exports = {
  createSession,
  rotateSession,
  revokeSession,
  revokeAllForUser,
  listActiveSessions,
};
