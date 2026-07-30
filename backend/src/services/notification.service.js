/**
 * Notifications — fan-out to the people a routine change actually affects.
 *
 * ── Called explicitly, not from a Mongoose hook ────────────────────────────
 * A post('save') hook would be tidier to wire up but wrong here: it has no
 * access to WHO made the change or WHY (the actor lives on the request, not the
 * document), and it would fire for every save including seeding and migrations.
 * Explicit calls from routine.service.js keep the notification tied to a real
 * user action.
 *
 * Failures are logged and swallowed. A notification that fails to send must not
 * roll back the routine publication it was describing.
 */
const { Notification, User, Student, Teacher, RoutineEntry, Role } = require("../models");
const logger = require("../utils/logger");
const { NOTIFICATION_TYPES, ROUTINE_STATUS } = require("../config/constants");
const { ROLES } = require("../config/roles");

/**
 * Insert one document per recipient.
 *
 * Fan-out on write rather than a shared document with a recipients array: per-user
 * unread counts and "mark as read" then become single-document operations served
 * by one index. See models/Notification.js.
 */
async function fanOut(recipientIds, payload, actorId = null) {
  // De-duplicate: a teacher who is also somehow in the student list, or a user
  // appearing twice through two profiles, should get one notification.
  const unique = [...new Set(recipientIds.filter(Boolean).map(String))];
  if (!unique.length) return 0;

  const docs = unique.map((recipient) => ({ ...payload, recipient, createdBy: actorId }));

  try {
    await Notification.insertMany(docs, { ordered: false });
    return docs.length;
  } catch (err) {
    logger.error(`Notification fan-out failed (${payload.type}):`, err.message);
    return 0;
  }
}

/** Every user account holding a given role. */
async function usersWithRole(roleName) {
  const role = await Role.findOne({ name: roleName }).select("_id").lean();
  if (!role) return [];
  const users = await User.find({ role: role._id, status: "active" }).select("_id").lean();
  return users.map((u) => u._id);
}

/**
 * The audience for a published routine: every teacher who appears in it, plus
 * every student in the sections it covers.
 */
async function audienceFor(routine) {
  const entries = await RoutineEntry.find({ routine: routine._id })
    .select("teacher section groupLabel")
    .lean();

  if (!entries.length) return [];

  const teacherIds = [...new Set(entries.map((e) => String(e.teacher)))];
  const sections = [...new Set(entries.map((e) => e.section))];

  const [teachers, students] = await Promise.all([
    Teacher.find({ _id: { $in: teacherIds }, user: { $ne: null } }).select("user").lean(),
    Student.find({
      semester: routine.semester,
      section: { $in: sections },
      status: "active",
      user: { $ne: null },
    })
      .select("user")
      .lean(),
  ]);

  return [...teachers.map((t) => t.user), ...students.map((s) => s.user)];
}

/**
 * Notify on a lifecycle transition. Who hears about it depends on the step:
 *
 *   submitted → the Super Admins who must act on it
 *   approved  → the department admin who submitted it
 *   rejected  → the submitter, with the reason
 *   published → every affected teacher and student
 */
async function notifyStatusChange(routine, previousStatus, nextStatus, req, reason = "") {
  const link = `/pages/routine.html?routine=${routine._id}`;
  const title = routine.title || "Routine";
  const actorId = req?.auth?.userId || null;

  try {
    switch (nextStatus) {
      case ROUTINE_STATUS.SUBMITTED: {
        const admins = await usersWithRole(ROLES.SUPER_ADMIN);
        return fanOut(
          admins,
          {
            type: NOTIFICATION_TYPES.ROUTINE_SUBMITTED,
            title: "Routine awaiting approval",
            message: `${title} has been submitted for approval by ${req?.auth?.user?.name || "a department admin"}.`,
            entity: { kind: "Routine", id: routine._id },
            link,
          },
          actorId
        );
      }

      case ROUTINE_STATUS.APPROVED: {
        return fanOut(
          [routine.submittedBy],
          {
            type: NOTIFICATION_TYPES.ROUTINE_APPROVED,
            title: "Routine approved",
            message: `${title} has been approved and is ready to publish.`,
            entity: { kind: "Routine", id: routine._id },
            link,
          },
          actorId
        );
      }

      case ROUTINE_STATUS.DRAFT: {
        // Only meaningful as a rejection — draft is also the initial state, but
        // a routine is never "transitioned" into it at creation.
        if (previousStatus === ROUTINE_STATUS.DRAFT) return 0;
        return fanOut(
          [routine.submittedBy],
          {
            type: NOTIFICATION_TYPES.ROUTINE_REJECTED,
            title: "Routine sent back for revision",
            message: reason
              ? `${title} was not approved: ${reason}`
              : `${title} has been sent back for revision.`,
            entity: { kind: "Routine", id: routine._id },
            link,
          },
          actorId
        );
      }

      case ROUTINE_STATUS.PUBLISHED: {
        const audience = await audienceFor(routine);
        return fanOut(
          audience,
          {
            type: NOTIFICATION_TYPES.ROUTINE_PUBLISHED,
            title: "New routine published",
            message: `${title} is now published. Check your timetable for the new schedule.`,
            entity: { kind: "Routine", id: routine._id },
            link,
          },
          actorId
        );
      }

      default:
        return 0;
    }
  } catch (err) {
    logger.error(`Failed to notify on ${previousStatus} → ${nextStatus}:`, err.message);
    return 0;
  }
}

/**
 * A single class changed in an ALREADY-PUBLISHED routine.
 *
 * Narrower audience than a publication: only the teacher assigned to that class
 * and the students in that specific section, not the whole cohort.
 */
async function notifyEntryChanged(routine, entry, req) {
  try {
    const [teacher, students] = await Promise.all([
      Teacher.findById(entry.teacher).select("user fullName").lean(),
      Student.find({
        semester: entry.semester,
        section: entry.section,
        status: "active",
        user: { $ne: null },
      })
        .select("user")
        .lean(),
    ]);

    const recipients = [teacher?.user, ...students.map((s) => s.user)];

    return fanOut(
      recipients,
      {
        type: NOTIFICATION_TYPES.ROUTINE_UPDATED,
        title: "Your routine has changed",
        message:
          `A class on ${entry.day} has been updated in ${routine.title || "your routine"}. ` +
          `Please check your timetable.`,
        entity: { kind: "RoutineEntry", id: entry._id },
        link: `/pages/routine.html?routine=${routine._id}`,
      },
      req?.auth?.userId || null
    );
  } catch (err) {
    logger.error("Failed to notify on routine entry change:", err.message);
    return 0;
  }
}

/** Direct account-related message, e.g. an admin created your login. */
async function notifyUser(userId, { title, message, link = "" }, actorId = null) {
  return fanOut(
    [userId],
    { type: NOTIFICATION_TYPES.ACCOUNT, title, message, link, entity: { kind: "User", id: userId } },
    actorId
  );
}

module.exports = { notifyStatusChange, notifyEntryChanged, notifyUser, fanOut, audienceFor };
