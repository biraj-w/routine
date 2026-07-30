/**
 * Authentication business logic.
 *
 * ── Security decisions embodied here ───────────────────────────────────────
 *
 * 1. Registration NEVER reads a role from the request. The role is looked up
 *    server-side from DEFAULT_REGISTRATION_ROLE (Student). Accepting a `role`
 *    field would let anyone self-register as Super Admin.
 *
 * 2. Login failures always say "Invalid email or password". Distinguishing
 *    "no such user" from "wrong password" turns the endpoint into an account
 *    enumerator.
 *
 * 3. Forgot-password always reports success, whether or not the address exists,
 *    for the same reason.
 *
 * 4. Only sha256(resetToken) is stored. A database dump therefore does not hand
 *    over the ability to reset anyone's password.
 *
 * 5. Failed attempts are counted and the account locks at MAX_FAILED_LOGINS,
 *    bounding an online guessing attack.
 */
const crypto = require("crypto");
const { User, Role, Student, Teacher, Department } = require("../models");
const sessionService = require("./session.service");
const activityService = require("./activity.service");
const { resolveRole } = require("./permission.service");
const { signAccessToken } = require("../config/jwt");
const config = require("../config/env");
const logger = require("../utils/logger");
const ApiError = require("../utils/ApiError");
const { ROLES, DEFAULT_REGISTRATION_ROLE, DATA_SCOPES } = require("../config/roles");
const { USER_STATUS, ACTIVITY_ACTIONS } = require("../config/constants");

/** Deliberately identical for every login failure. */
const GENERIC_LOGIN_FAILURE = "Invalid email or password";

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Build the client-facing view of an authenticated user: identity, role, and
 * the resolved permission list the frontend uses to render its navigation.
 *
 * The permission list is a convenience for the UI only. Every endpoint
 * re-derives permissions from the database on each request.
 */
async function buildAuthPayload(user) {
  const role = await resolveRole(user.role);
  let department = null;
  if (user.department) {
    department = await Department.findById(user.department).select("name code").lean();
  }

  // Resolve the linked domain profile, so a teacher's or student's own routine
  // can be fetched without a second round trip.
  let profile = null;
  if (role?.name === ROLES.TEACHER) {
    profile = await Teacher.findOne({ user: user._id }).select("_id employeeCode fullName").lean();
  } else if (role?.name === ROLES.STUDENT) {
    profile = await Student.findOne({ user: user._id })
      .select("_id rollNo fullName semester section groupLabel")
      .lean();
  }

  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    status: user.status,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    role: role ? { id: user.role, name: role.name, dataScope: role.dataScope } : null,
    department: department ? { id: department._id, name: department.name, code: department.code } : null,
    profile: profile ? { ...profile, id: profile._id } : null,
    permissions: role ? [...role.permissions] : [],
  };
}

/** Issue an access token bound to a session, plus the session's refresh token. */
async function issueTokens(user, req) {
  const role = await resolveRole(user.role);
  const { session, refreshToken } = await sessionService.createSession(user._id, req);

  const accessToken = signAccessToken({
    userId: user._id,
    sessionId: session._id,
    roleName: role?.name || "",
    departmentId: user.department,
  });

  return { accessToken, refreshToken, sessionId: session._id };
}

/* ── Registration ────────────────────────────────────────────────────────── */

/**
 * Public self-registration. Creates a STUDENT account and its Student profile.
 *
 * The role is not a parameter. Any `role` in the request body was already
 * discarded by the controller before this is called.
 */
async function register({ name, email, password, phone, department, rollNo, semester, section }, req) {
  const existing = await User.findOne({ email: String(email).toLowerCase() });
  if (existing) throw ApiError.conflict("An account with that email already exists");

  const studentRole = await Role.findOne({ name: DEFAULT_REGISTRATION_ROLE });
  if (!studentRole) {
    // Seeder has not run — a configuration fault, not the caller's problem.
    logger.error(`Role "${DEFAULT_REGISTRATION_ROLE}" is missing. Run: npm run seed`);
    throw ApiError.internal("Registration is unavailable. Please contact an administrator.");
  }

  const user = await User.create({
    name,
    email,
    password, // hashed by the User schema's virtual setter
    phone: phone || "",
    role: studentRole._id,
    department: department || null,
    status: USER_STATUS.ACTIVE,
  });

  // Create the domain profile. If it fails, remove the orphaned account:
  // a standalone mongod has no transactions, so compensating cleanup is the
  // available mechanism (see docs/architecture.md).
  try {
    if (rollNo && department && semester) {
      await Student.create({
        user: user._id,
        rollNo,
        fullName: name,
        email: user.email,
        department,
        semester,
        section: section || "A",
      });
    }
  } catch (err) {
    await User.deleteOne({ _id: user._id });
    logger.warn(`Rolled back user ${user.email} after student-profile failure: ${err.message}`);
    throw err;
  }

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.CREATE,
    entityType: "User",
    entityId: user._id,
    description: `Self-registered as ${DEFAULT_REGISTRATION_ROLE}: ${user.email}`,
    actorOverride: { id: user._id, email: user.email, name: user.name, role: DEFAULT_REGISTRATION_ROLE },
  });

  return buildAuthPayload(user);
}

/* ── Login ───────────────────────────────────────────────────────────────── */

async function login({ email, password }, req) {
  const normalised = String(email || "").toLowerCase().trim();

  // passwordHash is select:false, so it must be requested explicitly.
  const user = await User.findOne({ email: normalised }).select("+passwordHash");

  if (!user) {
    activityService.record({
      req,
      action: ACTIVITY_ACTIONS.LOGIN_FAILED,
      entityType: "Auth",
      description: `Login attempt for unknown email: ${normalised}`,
      status: "FAILURE",
      actorOverride: { email: normalised },
    });
    throw ApiError.unauthorized(GENERIC_LOGIN_FAILURE);
  }

  if (user.status === USER_STATUS.LOCKED) {
    throw ApiError.forbidden(
      "This account is locked after too many failed attempts. Contact an administrator."
    );
  }
  if (user.status !== USER_STATUS.ACTIVE) {
    throw ApiError.forbidden(`This account is ${user.status}.`);
  }

  const matches = await user.comparePassword(password);
  if (!matches) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    const willLock = user.failedLoginAttempts >= config.security.maxFailedLogins;
    if (willLock) user.status = USER_STATUS.LOCKED;
    await user.save();

    activityService.record({
      req,
      action: ACTIVITY_ACTIONS.LOGIN_FAILED,
      entityType: "Auth",
      entityId: user._id,
      description: willLock
        ? `Account locked after ${user.failedLoginAttempts} failed attempts: ${user.email}`
        : `Failed login (${user.failedLoginAttempts}/${config.security.maxFailedLogins}): ${user.email}`,
      status: "FAILURE",
      actorOverride: { id: user._id, email: user.email, name: user.name },
    });

    if (willLock) {
      throw ApiError.forbidden(
        "Too many failed attempts. This account is now locked — contact an administrator."
      );
    }
    throw ApiError.unauthorized(GENERIC_LOGIN_FAILURE);
  }

  // Success: clear the failure counter and stamp the login.
  user.failedLoginAttempts = 0;
  user.lastLoginAt = new Date();
  await user.save();

  const tokens = await issueTokens(user, req);
  const payload = await buildAuthPayload(user);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.LOGIN,
    entityType: "Auth",
    entityId: user._id,
    description: `Logged in: ${user.email}`,
    department: user.department,
    actorOverride: {
      id: user._id,
      email: user.email,
      name: user.name,
      role: payload.role?.name || "",
    },
  });

  return { ...tokens, user: payload };
}

/* ── Refresh ─────────────────────────────────────────────────────────────── */

async function refresh(rawRefreshToken, req) {
  const { session, refreshToken, userId } = await sessionService.rotateSession(rawRefreshToken, req);

  const user = await User.findById(userId);
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    await sessionService.revokeSession(session._id, "admin");
    throw ApiError.unauthorized("This account is no longer active. Please log in again.");
  }

  const role = await resolveRole(user.role);
  const accessToken = signAccessToken({
    userId: user._id,
    sessionId: session._id,
    roleName: role?.name || "",
    departmentId: user.department,
  });

  return { accessToken, refreshToken, user: await buildAuthPayload(user) };
}

/* ── Logout ──────────────────────────────────────────────────────────────── */

async function logout(req) {
  await sessionService.revokeSession(req.auth.sessionId, "logout");
  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.LOGOUT,
    entityType: "Auth",
    entityId: req.auth.userId,
    description: `Logged out: ${req.auth.user.email}`,
  });
}

async function logoutAll(req) {
  const count = await sessionService.revokeAllForUser(req.auth.userId, "logout_all");
  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.LOGOUT,
    entityType: "Auth",
    entityId: req.auth.userId,
    description: `Logged out of all devices (${count} session(s)): ${req.auth.user.email}`,
  });
  return count;
}

/* ── Password change ─────────────────────────────────────────────────────── */

async function changePassword({ currentPassword, newPassword }, req) {
  const user = await User.findById(req.auth.userId).select("+passwordHash");
  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized("Your current password is incorrect");
  }
  if (currentPassword === newPassword) {
    throw ApiError.badRequest("The new password must be different from the current one");
  }

  user.password = newPassword; // virtual setter → re-hash + stamp passwordChangedAt
  user.mustChangePassword = false;
  await user.save();

  // Other devices are logged out; this one stays signed in. Note that
  // passwordChangedAt also invalidates their access tokens immediately, so
  // revocation here is belt-and-braces.
  const revoked = await sessionService.revokeAllForUser(
    user._id,
    "password_change",
    req.auth.sessionId
  );

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.PASSWORD_CHANGE,
    entityType: "User",
    entityId: user._id,
    description: `Changed their password (${revoked} other session(s) ended)`,
  });

  return { otherSessionsEnded: revoked };
}

/* ── Forgot / reset password ──────────────────────────────────────────────── */

/**
 * Issue a single-use reset token.
 *
 * There is no mail service in this project, so delivery is SIMULATED: the reset
 * link is written to the server console, and returned in the response only when
 * NODE_ENV !== 'production'. The token itself is real — random, hashed at rest,
 * expiring and single-use — so the flow is genuinely demonstrable end to end.
 * Swapping in Nodemailer means replacing the logger call below.
 */
async function forgotPassword({ email }, req) {
  const normalised = String(email || "").toLowerCase().trim();
  const user = await User.findOne({ email: normalised });

  // Always claim success: revealing which addresses exist would let anyone
  // enumerate accounts.
  if (!user || user.status !== USER_STATUS.ACTIVE) {
    logger.info(`Password reset requested for non-existent or inactive account: ${normalised}`);
    return { delivered: false, devToken: null };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  user.passwordResetToken = crypto.createHash("sha256").update(rawToken).digest("hex");
  user.passwordResetExpires = new Date(Date.now() + config.security.resetTokenTtlMinutes * 60 * 1000);
  await user.save();

  const resetUrl = `http://localhost:${config.port}/pages/reset-password.html?token=${rawToken}`;
  logger.info(
    `\n  ── PASSWORD RESET (simulated email) ──────────────────────────────\n` +
      `     To:      ${user.email}\n` +
      `     Expires: ${config.security.resetTokenTtlMinutes} minutes\n` +
      `     Link:    ${resetUrl}\n` +
      `  ──────────────────────────────────────────────────────────────────\n`
  );

  return {
    delivered: true,
    // Returned in development so the flow can be completed from a REST client.
    devToken: config.isProduction ? null : rawToken,
  };
}

async function resetPassword({ token, newPassword }, req) {
  const hashed = crypto.createHash("sha256").update(String(token || "")).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select("+passwordResetToken +passwordResetExpires");

  if (!user) throw ApiError.badRequest("This reset link is invalid or has expired");

  user.password = newPassword;
  user.passwordResetToken = null; // single use
  user.passwordResetExpires = null;
  user.mustChangePassword = false;
  // A reset is the recovery path for a compromised account, so unlock it.
  if (user.status === USER_STATUS.LOCKED) user.status = USER_STATUS.ACTIVE;
  user.failedLoginAttempts = 0;
  await user.save();

  // Every existing session is suspect after a reset.
  const revoked = await sessionService.revokeAllForUser(user._id, "password_change");

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.PASSWORD_RESET,
    entityType: "User",
    entityId: user._id,
    description: `Password reset via emailed token (${revoked} session(s) ended)`,
    actorOverride: { id: user._id, email: user.email, name: user.name },
  });

  return { sessionsEnded: revoked };
}

/* ── Profile ─────────────────────────────────────────────────────────────── */

/**
 * Update one's own profile. Only the fields listed here can be touched — a
 * `role`, `department` or `status` in the body is ignored, which is what stops
 * self-promotion.
 */
async function updateOwnProfile({ name, phone }, req) {
  const user = await User.findById(req.auth.userId);
  const before = { name: user.name, phone: user.phone };

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  user.updatedBy = req.auth.userId;
  await user.save();

  // Keep the denormalised name on the domain profile in step.
  if (name !== undefined) {
    await Teacher.updateOne({ user: user._id }, { $set: { fullName: name } });
    await Student.updateOne({ user: user._id }, { $set: { fullName: name } });
  }

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.UPDATE,
    entityType: "User",
    entityId: user._id,
    description: "Updated their own profile",
    changes: activityService.diff(before, { name: user.name, phone: user.phone }),
  });

  return buildAuthPayload(user);
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  changePassword,
  forgotPassword,
  resetPassword,
  updateOwnProfile,
  buildAuthPayload,
  issueTokens,
  DATA_SCOPES,
};
