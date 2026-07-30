/**
 * Access-token signing and verification.
 *
 * Only the ACCESS token is a JWT. Refresh tokens are opaque random strings
 * stored (hashed) in the sessions collection — see models/Session.js for why
 * signing them would add nothing.
 *
 * ── What the payload is for ────────────────────────────────────────────────
 * The payload carries `role` and `dept` as HINTS, so the frontend can render
 * its navigation without an extra request. They are never used for
 * authorization: middlewares/authenticate.js re-resolves the user, their role
 * and their permissions from the database on every request. That is what makes
 * a revoked permission or a deactivated account take effect immediately rather
 * than whenever the token happens to expire.
 *
 * Permissions are deliberately NOT in the payload. Embedding ~30 strings would
 * bloat every request header and publish the entire authorization model to
 * anyone who pastes the token into jwt.io.
 * ──────────────────────────────────────────────────────────────────────────
 */
const jwt = require("jsonwebtoken");
const config = require("./env");

const TOKEN_TYPE_ACCESS = "access";

/**
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.sessionId  so a token can be tied to a revocable session
 * @param {string} params.roleName   UI hint only
 * @param {string|null} params.departmentId UI hint only
 */
function signAccessToken({ userId, sessionId, roleName, departmentId }) {
  return jwt.sign(
    {
      sub: String(userId),
      sid: String(sessionId),
      role: roleName,
      dept: departmentId ? String(departmentId) : null,
      typ: TOKEN_TYPE_ACCESS,
    },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessExpiresIn }
  );
}

/**
 * Verify and decode. Throws TokenExpiredError / JsonWebTokenError, which
 * middlewares/errorHandler.js maps to a 401 with a distinct code.
 */
function verifyAccessToken(token) {
  const payload = jwt.verify(token, config.jwt.accessSecret);
  // Guard against a token of another type being replayed as an access token.
  if (payload.typ !== TOKEN_TYPE_ACCESS) {
    const err = new Error("Wrong token type");
    err.name = "JsonWebTokenError";
    throw err;
  }
  return payload;
}

/** Read the payload WITHOUT verifying. Only for logging; never for auth. */
function decodeUnsafe(token) {
  return jwt.decode(token);
}

module.exports = { signAccessToken, verifyAccessToken, decodeUnsafe, TOKEN_TYPE_ACCESS };
