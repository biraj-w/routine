/**
 * Auth controller — thin by design.
 *
 * Controllers translate HTTP into service calls and back. Business rules live in
 * services/auth.service.js, which is why these functions are a few lines each
 * and contain no try/catch (see utils/asyncHandler.js).
 */
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { success, created } = require("../utils/response");
const authService = require("../services/auth.service");
const sessionService = require("../services/session.service");

/**
 * POST /api/auth/register — public. Creates a STUDENT account only.
 *
 * Privilege-bearing fields are deleted before the body reaches the service, so
 * even a future change to the service cannot accidentally start honouring them.
 */
exports.register = asyncHandler(async (req, res) => {
  delete req.body.role;
  delete req.body.status;
  delete req.body.permissions;

  const user = await authService.register(req.body, req);
  return created(res, { user }, "Registration successful. You can now log in.");
});

/** POST /api/auth/login — returns an access token, a refresh token and the user. */
exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, req);
  return success(res, { data: result, message: "Login successful" });
});

/** POST /api/auth/refresh — rotates the refresh token and issues a new access token. */
exports.refresh = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body.refreshToken, req);
  return success(res, { data: result, message: "Token refreshed" });
});

/** POST /api/auth/logout — revokes the current session immediately. */
exports.logout = asyncHandler(async (req, res) => {
  await authService.logout(req);
  return success(res, { message: "Logged out" });
});

/** POST /api/auth/logout-all — revokes every session for this user. */
exports.logoutAll = asyncHandler(async (req, res) => {
  const count = await authService.logoutAll(req);
  return success(res, { data: { sessionsEnded: count }, message: "Logged out of all devices" });
});

/** GET /api/auth/me — identity, role and resolved permissions. */
exports.me = asyncHandler(async (req, res) => {
  const user = await authService.buildAuthPayload(req.auth.user);
  return success(res, { data: { user }, message: "Profile fetched" });
});

/** PATCH /api/auth/profile — name and phone only. */
exports.updateProfile = asyncHandler(async (req, res) => {
  const user = await authService.updateOwnProfile(req.body, req);
  return success(res, { data: { user }, message: "Profile updated" });
});

/** POST /api/auth/change-password — ends other sessions, keeps this one. */
exports.changePassword = asyncHandler(async (req, res) => {
  const result = await authService.changePassword(req.body, req);
  return success(res, { data: result, message: "Password changed" });
});

/**
 * POST /api/auth/forgot-password
 *
 * Always reports success so the endpoint cannot be used to discover which
 * addresses have accounts. `devToken` is present only outside production.
 */
exports.forgotPassword = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body, req);
  return success(res, {
    data: result.devToken ? { devToken: result.devToken } : {},
    message: "If that email is registered, a reset link has been sent.",
  });
});

/** POST /api/auth/reset-password — consumes a single-use token. */
exports.resetPassword = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body, req);
  return success(res, {
    data: result,
    message: "Password reset. Please log in with your new password.",
  });
});

/** GET /api/auth/sessions — active devices for this account. */
exports.listSessions = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listActiveSessions(req.auth.userId);
  const data = sessions.map((s) => ({
    id: s._id,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    lastUsedAt: s.lastUsedAt,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    isCurrent: String(s._id) === String(req.auth.sessionId),
  }));
  return success(res, { data, message: "Active sessions fetched" });
});

/** DELETE /api/auth/sessions/:id — revoke one device. */
exports.revokeSession = asyncHandler(async (req, res) => {
  const sessions = await sessionService.listActiveSessions(req.auth.userId);
  // Only the owner may revoke a session — never trust an id from the URL alone.
  const owned = sessions.some((s) => String(s._id) === String(req.params.id));
  if (!owned) throw ApiError.notFound("Session not found");

  await sessionService.revokeSession(req.params.id, "admin");
  return success(res, { message: "Session revoked" });
});
