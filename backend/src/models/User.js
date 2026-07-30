/**
 * User — authentication and authorization only.
 *
 * Domain attributes live on Teacher/Student profiles, which reference a User
 * 1:1. The split keeps this collection about credentials and role, and means
 * "update own profile" touches a Teacher document and can never reach `role`.
 *
 * Security details worth reading:
 *   - `passwordHash` is `select: false`: it is absent from every query unless
 *     explicitly asked for with `.select('+passwordHash')` (login only), and
 *     the toJSON plugin strips it even then.
 *   - `passwordChangedAt` invalidates already-issued access tokens. The
 *     authenticate middleware rejects any token whose `iat` predates it, so
 *     changing a password logs out other devices immediately.
 *   - `failedLoginAttempts` / `status: locked` bound brute-force attempts.
 */
const { Schema, model } = require("mongoose");
const bcrypt = require("bcryptjs");
const { applyCommonPlugins } = require("./plugins");
const { USER_STATUS } = require("../config/constants");
const config = require("../config/env");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name must be at most 100 characters"],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_PATTERN, "Please provide a valid email address"],
    },

    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },

    role: {
      type: Schema.Types.ObjectId,
      ref: "Role",
      required: [true, "A user must have a role"],
      index: true,
    },

    /**
     * Null for Super Admin, whose scope is global. Required for every
     * department-bound role — enforced in the service layer rather than by the
     * schema, because the rule depends on the role's dataScope.
     */
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },

    phone: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: Object.values(USER_STATUS),
      default: USER_STATUS.ACTIVE,
      index: true,
    },

    /** Seeded accounts set this, prompting a password change on first login. */
    mustChangePassword: { type: Boolean, default: false },

    lastLoginAt: { type: Date, default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    passwordChangedAt: { type: Date, default: null },

    /** Only the SHA-256 hash of the reset token is stored, never the token. */
    passwordResetToken: { type: String, default: null, select: false },
    passwordResetExpires: { type: Date, default: null, select: false },
  },
  { timestamps: true, collection: "users" }
);

applyCommonPlugins(userSchema);

userSchema.index({ department: 1, status: 1 });

/**
 * Virtual write-only `password`: assigning it hashes into `passwordHash` on
 * save, so no caller has to remember to hash. Reading it always yields
 * undefined.
 */
userSchema
  .virtual("password")
  .set(function setPassword(plain) {
    this._plainPassword = plain;
  });

/**
 * Hash on `pre('validate')`, NOT `pre('save')`.
 *
 * Mongoose registers its own validation as a pre-save hook when the Schema is
 * constructed, so it runs before any pre('save') hook added afterwards. Hashing
 * there would leave validation looking at an undefined `passwordHash` and
 * failing its `required` check. pre('validate') runs earlier, so the hash
 * exists by the time the field is validated.
 */
userSchema.pre("validate", async function hashPassword(next) {
  if (!this._plainPassword) return next();
  this.passwordHash = await bcrypt.hash(this._plainPassword, config.security.bcryptRounds);
  // Only stamp on a change, not on initial creation, so a brand-new user's
  // first token is not immediately treated as stale.
  if (!this.isNew) this.passwordChangedAt = new Date();
  this._plainPassword = undefined;
  next();
});

/** Timing-safe comparison via bcrypt. Requires passwordHash to be selected. */
userSchema.methods.comparePassword = function comparePassword(plain) {
  if (!this.passwordHash) {
    throw new Error("comparePassword called without passwordHash selected");
  }
  return bcrypt.compare(plain, this.passwordHash);
};

/** True when an access token issued at `iat` (seconds) predates a password change. */
userSchema.methods.isTokenStale = function isTokenStale(iatSeconds) {
  if (!this.passwordChangedAt) return false;
  return iatSeconds * 1000 < this.passwordChangedAt.getTime();
};

module.exports = model("User", userSchema);
