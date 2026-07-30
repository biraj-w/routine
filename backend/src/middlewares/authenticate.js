/**
 * Authentication: prove who the caller is, then load what they may do.
 *
 * Runs four checks, each of which closes a real gap:
 *
 *   1. The JWT verifies and is an access token.
 *   2. Its session row exists and has not been revoked. This is what makes
 *      logout immediate — without it, a "logged out" token would keep working
 *      until it expired.
 *   3. The user still exists, is not soft-deleted, and is active. A deactivated
 *      or locked account loses access on its next request, not on token expiry.
 *   4. The token was issued AFTER the user's last password change. Changing a
 *      password therefore invalidates tokens held on other devices.
 *
 * On success it attaches `req.auth` — the single object every downstream
 * middleware and controller reads:
 *
 *   req.auth = {
 *     userId, user, roleId, roleName,
 *     dataScope,     // 'global' | 'department' | 'self'  → drives scope.js
 *     departmentId,
 *     sessionId,
 *     permissions,   // Set<string>                       → drives authorize.js
 *   }
 */
const { verifyAccessToken } = require("../config/jwt");
const { resolveRole } = require("../services/permission.service");
const { User, Session } = require("../models");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { ERROR_CODES, USER_STATUS } = require("../config/constants");

const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    throw ApiError.unauthorized("Authentication token missing", ERROR_CODES.TOKEN_MISSING);
  }

  // (1) Signature and expiry. jwt errors propagate to errorHandler, which maps
  //     TokenExpiredError to code TOKEN_EXPIRED — the signal the frontend uses
  //     to refresh silently.
  const payload = verifyAccessToken(header.slice(7).trim());

  // (2) The session must still be live.
  const session = await Session.findById(payload.sid);
  if (!session || !session.isLive()) {
    throw ApiError.unauthorized(
      "Your session has ended. Please log in again.",
      ERROR_CODES.SESSION_REVOKED
    );
  }

  // (3) The account must still be usable.
  const user = await User.findById(payload.sub);
  if (!user) {
    throw ApiError.unauthorized("User account no longer exists", ERROR_CODES.SESSION_REVOKED);
  }
  if (user.status === USER_STATUS.LOCKED) {
    throw ApiError.forbidden("This account is locked. Contact an administrator.");
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden(`This account is ${user.status}.`);
  }

  // (4) A password change invalidates tokens issued before it.
  if (user.isTokenStale(payload.iat)) {
    throw ApiError.unauthorized(
      "Your password was changed. Please log in again.",
      ERROR_CODES.SESSION_REVOKED
    );
  }

  const role = await resolveRole(user.role);
  if (!role) {
    // A user pointing at a missing role must not fall through as unprivileged —
    // fail closed and make the misconfiguration loud.
    throw ApiError.forbidden("Your account has no valid role assigned. Contact an administrator.");
  }

  req.auth = {
    userId: user._id,
    user,
    roleId: user.role,
    roleName: role.name,
    dataScope: role.dataScope,
    departmentId: user.department || null,
    sessionId: session._id,
    permissions: role.permissions,
  };

  // Touched for the active-devices list; failure here must never break the
  // request, so it is fire-and-forget.
  Session.updateOne({ _id: session._id }, { $set: { lastUsedAt: new Date() } }).catch(() => {});

  next();
});

/**
 * Attach req.auth when a token is present, but allow the request through when
 * it is not. For endpoints that show more to a signed-in caller without
 * requiring one.
 */
const optionalAuthenticate = asyncHandler(async (req, res, next) => {
  if (!(req.headers.authorization || "").startsWith("Bearer ")) return next();
  return authenticate(req, res, next);
});

module.exports = authenticate;
module.exports.optionalAuthenticate = optionalAuthenticate;
