/**
 * Session — the server-side half of authentication.
 *
 * A stateless JWT alone cannot be revoked: a logout would only clear the
 * client's copy while the token stayed valid until expiry. Storing a session
 * row and checking it on every request makes logout, "log out all devices" and
 * admin-forced revocation take effect immediately. That is the concrete payoff
 * for resolving auth from the database instead of trusting token claims.
 *
 * Design notes:
 *   - The refresh token is an opaque 64-byte random string, NOT a JWT. It has
 *     to hit the database anyway, so signing it would add nothing.
 *   - Only `sha256(token)` is stored. A leaked database dump therefore does not
 *     hand over live sessions — the same reasoning as hashing passwords.
 *   - `expiresAt` carries a TTL index, so MongoDB deletes expired sessions on
 *     its own and the collection cannot grow without bound.
 *   - `replacedBy` records the rotation chain, which is what makes reuse
 *     detection possible: if a token that was already rotated away is presented
 *     again, it was likely stolen, so every session for that user is revoked.
 */
const { Schema, model } = require("mongoose");
const crypto = require("crypto");
const { toJSONPlugin } = require("./plugins");

const REVOKE_REASONS = [
  "logout",
  "logout_all",
  "rotated",
  "reuse_detected",
  "password_change",
  "admin",
  "expired",
];

const sessionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    refreshTokenHash: {
      type: String,
      required: true,
      unique: true,
    },

    userAgent: { type: String, default: "" },
    ipAddress: { type: String, default: "" },

    expiresAt: { type: Date, required: true },
    lastUsedAt: { type: Date, default: Date.now },

    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, enum: REVOKE_REASONS, default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: "Session", default: null },
  },
  { timestamps: true, collection: "sessions" }
);

// Sessions are revoked, never soft-deleted, so only the JSON shaping applies.
sessionSchema.plugin(toJSONPlugin);

/** TTL: MongoDB removes the document once expiresAt passes. */
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/** Serves both "is this session live?" and the active-devices list. */
sessionSchema.index({ user: 1, revokedAt: 1 });

/** Hash a raw refresh token for storage or lookup. */
sessionSchema.statics.hashToken = function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
};

/** Generate a fresh opaque refresh token. */
sessionSchema.statics.generateToken = function generateToken() {
  return crypto.randomBytes(64).toString("hex");
};

/** Live = not revoked and not past its absolute expiry. */
sessionSchema.methods.isLive = function isLive() {
  return !this.revokedAt && this.expiresAt > new Date();
};

sessionSchema.methods.revoke = function revoke(reason, replacedBy = null) {
  this.revokedAt = new Date();
  this.revokedReason = reason;
  this.replacedBy = replacedBy;
  return this.save();
};

module.exports = model("Session", sessionSchema);
module.exports.REVOKE_REASONS = REVOKE_REASONS;
