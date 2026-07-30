/**
 * Creating and updating Teacher / Student profiles together with their linked
 * User account.
 *
 * ── Why this is a service and not the CRUD factory ─────────────────────────
 * Each of these operations writes TWO documents: a domain profile and,
 * optionally, the login account that goes with it. That is not CRUD, and it has
 * a failure mode CRUD does not: the first write succeeding and the second
 * failing.
 *
 * ── No transactions available ──────────────────────────────────────────────
 * A standalone mongod has no replica set, so session.startTransaction() throws.
 * The alternative used here is COMPENSATING CLEANUP: if the second write fails,
 * the first is undone explicitly. This is weaker than a transaction — a crash
 * between the two leaves an orphan — but it is what the deployment allows, and
 * the orphan is a user account with no profile, which is inert rather than
 * dangerous. Documented in docs/architecture.md.
 */
const { User, Teacher, Student, Role, Semester } = require("../models");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const { ROLES } = require("../config/roles");
const { USER_STATUS } = require("../config/constants");

/**
 * Create the login account for a profile, if one was asked for.
 * @returns {Promise<Object|null>} the created User, or null
 */
async function createLinkedUser({ email, name, password, roleName, department }) {
  if (!email || !password) return null;

  const normalised = String(email).toLowerCase().trim();
  if (await User.findOne({ email: normalised })) {
    throw ApiError.conflict(`A user account already exists for ${normalised}`);
  }

  const role = await Role.findOne({ name: roleName });
  if (!role) {
    logger.error(`Role "${roleName}" not found. Run: npm run seed`);
    throw ApiError.internal("Roles are not configured. Contact an administrator.");
  }

  const user = new User({
    name,
    email: normalised,
    password,
    role: role._id,
    department: department || null,
    status: USER_STATUS.ACTIVE,
    // An account created by an administrator carries a password the admin chose,
    // so the holder is prompted to replace it on first login.
    mustChangePassword: true,
  });
  await user.save();
  return user;
}

/**
 * Create a Teacher, optionally with a login account.
 *
 * @param {Object} data  profile fields + optional { password }
 * @param {Object} auth  req.auth
 */
async function createTeacher(data, auth) {
  const { password, ...profile } = data;

  const user = await createLinkedUser({
    email: profile.email,
    name: profile.fullName,
    password,
    roleName: ROLES.TEACHER,
    department: profile.department,
  });

  try {
    const teacher = await Teacher.create({
      ...profile,
      user: user ? user._id : null,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
    return teacher;
  } catch (err) {
    // Undo the account so a failed profile does not leave a login behind.
    if (user) {
      await User.deleteOne({ _id: user._id });
      logger.warn(`Rolled back user ${user.email} after teacher-profile failure: ${err.message}`);
    }
    throw err;
  }
}

/** Create a Student, optionally with a login account. */
async function createStudent(data, auth) {
  const { password, ...profile } = data;

  // A section label must be one the semester actually offers, otherwise the
  // student's timetable would silently be empty.
  await assertSectionExists(profile.semester, profile.section);

  const user = await createLinkedUser({
    email: profile.email,
    name: profile.fullName,
    password,
    roleName: ROLES.STUDENT,
    department: profile.department,
  });

  try {
    const student = await Student.create({
      ...profile,
      user: user ? user._id : null,
      createdBy: auth.userId,
      updatedBy: auth.userId,
    });
    return student;
  } catch (err) {
    if (user) {
      await User.deleteOne({ _id: user._id });
      logger.warn(`Rolled back user ${user.email} after student-profile failure: ${err.message}`);
    }
    throw err;
  }
}

/**
 * Keep the linked account's denormalised fields in step with the profile.
 * Never touches role, status or password — those are the user module's business.
 */
async function syncLinkedUser(profileDoc, changes) {
  if (!profileDoc.user) return;

  const update = {};
  if (changes.fullName) update.name = changes.fullName;
  if (changes.department) update.department = changes.department;
  if (Object.keys(update).length) {
    await User.updateOne({ _id: profileDoc.user }, { $set: update });
  }
}

/** A section must be listed on its semester. */
async function assertSectionExists(semesterId, section) {
  if (!semesterId || !section) return;

  const semester = await Semester.findById(semesterId).select("sections").lean();
  if (!semester) throw ApiError.badRequest("No such semester");

  const wanted = String(section).trim().toUpperCase();
  if (!semester.sections.includes(wanted)) {
    throw ApiError.validation("Validation failed", [
      {
        field: "section",
        message: `Section "${wanted}" is not offered by this semester. Available: ${semester.sections.join(", ")}`,
      },
    ]);
  }
}

module.exports = { createTeacher, createStudent, syncLinkedUser, createLinkedUser, assertSectionExists };
