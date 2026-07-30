/**
 * Routine business logic: entry management and the approval lifecycle.
 *
 * ── The lifecycle ──────────────────────────────────────────────────────────
 *
 *   draft ──submit──► submitted ──approve──► approved ──publish──► published
 *     ▲                   │                      │                     │
 *     └───────reject──────┴──────────────────────┘              archive─┘
 *
 * Transitions are checked against ROUTINE_TRANSITIONS in config/constants.js.
 * An illegal move is a 409, never a silent write — "approve" on a draft that was
 * never submitted has to fail, or the approval step means nothing.
 *
 * The permission split is the point of the workflow: a Department Admin holds
 * "Manage Routine" and "Submit Routine" but NOT "Approve Routine" or "Publish
 * Routine". They build a timetable and hand it up; a Super Admin signs it off.
 * Enforced on the routes, not here.
 */
const { Routine, RoutineEntry, Semester } = require("../models");
const conflictService = require("./conflict.service");
const notificationService = require("./notification.service");
const activityService = require("./activity.service");
const { assertReferencesInScope } = require("../middlewares/scope");
const ApiError = require("../utils/ApiError");
const {
  ROUTINE_STATUS,
  ROUTINE_TRANSITIONS,
  ACTIVITY_ACTIONS,
  DEFAULT_GROUP_LABEL,
  ERROR_CODES,
} = require("../config/constants");

/* ────────────────────────────────────────────────────────────────────────────
 * Entries
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Assemble a full entry from the request body plus the parent routine.
 *
 * sessionKey, department and semester are taken from the ROUTINE, never from the
 * client. They are the fields the conflict indexes key on, so letting a caller
 * supply them would let them opt out of conflict detection entirely — by
 * claiming a different academic session, an entry would compare against nothing.
 */
function buildCandidate(routine, body) {
  return {
    routine: routine._id,
    sessionKey: routine.sessionKey,
    department: routine.department,
    semester: routine.semester,
    section: String(body.section || "").trim().toUpperCase(),
    groupLabel: String(body.groupLabel || DEFAULT_GROUP_LABEL).trim().toUpperCase(),
    day: body.day,
    timeSlot: body.timeSlot,
    course: body.course,
    teacher: body.teacher,
    room: body.room,
    classType: body.classType || "Lecture",
    note: body.note || "",
  };
}

/** The section must be one the semester actually offers. */
async function assertSectionValid(semesterId, section) {
  const semester = await Semester.findById(semesterId).select("sections").lean();
  if (!semester) throw ApiError.badRequest("The routine's semester no longer exists");

  if (!semester.sections.includes(section)) {
    throw ApiError.validation("Validation failed", [
      {
        field: "section",
        message: `Section "${section}" is not offered by this semester. Available: ${semester.sections.join(", ")}`,
      },
    ]);
  }
}

/** Entries may only be added or changed while the routine is a draft. */
function assertEditable(routine) {
  if (routine.status !== ROUTINE_STATUS.DRAFT) {
    throw ApiError.conflict(
      `This routine is "${routine.status}" and cannot be edited. ` +
        `Only a draft may be changed — reject it back to draft first.`,
      ERROR_CODES.INVALID_TRANSITION
    );
  }
}

/**
 * Dry run: report conflicts and warnings without writing anything.
 *
 * The UI calls this as the form is filled in, so a clash is visible before the
 * user commits. Shares findConflicts with the write path, so the preview can
 * never disagree with what a save would actually do.
 */
async function previewConflicts(routine, body, excludeId = null) {
  const candidate = buildCandidate(routine, body);
  return conflictService.check(candidate, excludeId);
}

/** Add an entry to a draft routine. */
async function addEntry(routine, body, req) {
  assertEditable(routine);

  const candidate = buildCandidate(routine, body);
  await assertSectionValid(candidate.semester, candidate.section);

  // A department admin's own `department` is already forced correct, but the
  // teacher, course and room they reference could still belong to someone else.
  await assertReferencesInScope(req.auth, [
    { model: "Teacher", id: candidate.teacher, label: "teacher" },
    { model: "Course", id: candidate.course, label: "course" },
    { model: "Room", id: candidate.room, label: "room", allowGlobalNull: true },
  ]);

  const { conflicts, warnings } = await conflictService.check(candidate, null);
  if (conflicts.length) {
    throw ApiError.conflict(
      conflicts.length === 1
        ? conflicts[0].message
        : `This class clashes with ${conflicts.length} existing entries.`,
      ERROR_CODES.ROUTINE_CONFLICT,
      conflicts
    );
  }

  const entry = await RoutineEntry.create({
    ...candidate,
    createdBy: req.auth.userId,
    updatedBy: req.auth.userId,
  });

  await Routine.updateOne({ _id: routine._id }, { $inc: { entryCount: 1 } });

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.CREATE,
    entityType: "RoutineEntry",
    entityId: entry._id,
    description: `Added a class to ${routine.title || "routine"} on ${candidate.day}`,
    department: routine.department,
  });

  return { entry, warnings };
}

/**
 * Update an entry.
 *
 * Note `excludeId`: without it the entry would be found as a conflict with
 * itself and no edit could ever succeed.
 */
async function updateEntry(routine, entry, body, req) {
  assertEditable(routine);

  const before = entry.toObject();
  const merged = buildCandidate(routine, {
    section: body.section ?? entry.section,
    groupLabel: body.groupLabel ?? entry.groupLabel,
    day: body.day ?? entry.day,
    timeSlot: body.timeSlot ?? entry.timeSlot,
    course: body.course ?? entry.course,
    teacher: body.teacher ?? entry.teacher,
    room: body.room ?? entry.room,
    classType: body.classType ?? entry.classType,
    note: body.note ?? entry.note,
  });

  await assertSectionValid(merged.semester, merged.section);
  await assertReferencesInScope(req.auth, [
    { model: "Teacher", id: merged.teacher, label: "teacher" },
    { model: "Course", id: merged.course, label: "course" },
    { model: "Room", id: merged.room, label: "room", allowGlobalNull: true },
  ]);

  const { conflicts, warnings } = await conflictService.check(merged, entry._id);
  if (conflicts.length) {
    throw ApiError.conflict(
      conflicts.length === 1
        ? conflicts[0].message
        : `This change clashes with ${conflicts.length} existing entries.`,
      ERROR_CODES.ROUTINE_CONFLICT,
      conflicts
    );
  }

  Object.assign(entry, merged, { updatedBy: req.auth.userId });
  await entry.save();

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.UPDATE,
    entityType: "RoutineEntry",
    entityId: entry._id,
    description: `Updated a class in ${routine.title || "routine"}`,
    changes: activityService.diff(before, entry.toObject()),
    department: routine.department,
  });

  // A change to an already-published routine has to reach the people affected.
  if (routine.status === ROUTINE_STATUS.PUBLISHED) {
    await notificationService.notifyEntryChanged(routine, entry, req);
  }

  return { entry, warnings };
}

/** Soft-delete an entry, freeing its slot immediately (partial indexes). */
async function removeEntry(routine, entry, req) {
  assertEditable(routine);

  await entry.softDelete(req.auth.userId);
  await Routine.updateOne({ _id: routine._id }, { $inc: { entryCount: -1 } });

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.DELETE,
    entityType: "RoutineEntry",
    entityId: entry._id,
    description: `Removed a class from ${routine.title || "routine"} on ${entry.day}`,
    department: routine.department,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Lifecycle
 * ──────────────────────────────────────────────────────────────────────────── */

/** Human-readable action name for each target status, used in messages. */
const TRANSITION_VERBS = {
  [ROUTINE_STATUS.SUBMITTED]: "submit",
  [ROUTINE_STATUS.APPROVED]: "approve",
  [ROUTINE_STATUS.PUBLISHED]: "publish",
  [ROUTINE_STATUS.DRAFT]: "reject",
  [ROUTINE_STATUS.ARCHIVED]: "archive",
};

/**
 * Move a routine to a new status.
 *
 * Every transition passes through here so the state machine is checked in one
 * place, the workflow audit fields are stamped consistently, and the right
 * people are notified.
 */
async function changeStatus(routine, nextStatus, req, { reason = "" } = {}) {
  const verb = TRANSITION_VERBS[nextStatus] || "change";

  if (!routine.canTransitionTo(nextStatus)) {
    const allowed = ROUTINE_TRANSITIONS[routine.status] || [];
    throw ApiError.conflict(
      `Cannot ${verb} a routine that is "${routine.status}". ` +
        (allowed.length
          ? `From here it can only become: ${allowed.join(", ")}.`
          : `It is in a final state.`),
      ERROR_CODES.INVALID_TRANSITION
    );
  }

  // An empty timetable must not enter the approval queue.
  if (nextStatus === ROUTINE_STATUS.SUBMITTED) {
    const count = await RoutineEntry.countDocuments({ routine: routine._id });
    if (count === 0) {
      throw ApiError.conflict(
        "This routine has no classes yet. Add at least one before submitting it for approval.",
        ERROR_CODES.INVALID_TRANSITION
      );
    }
  }

  const previous = routine.status;
  const now = new Date();
  routine.status = nextStatus;
  routine.updatedBy = req.auth.userId;

  switch (nextStatus) {
    case ROUTINE_STATUS.SUBMITTED:
      routine.submittedBy = req.auth.userId;
      routine.submittedAt = now;
      routine.rejectionReason = "";
      break;
    case ROUTINE_STATUS.APPROVED:
      routine.approvedBy = req.auth.userId;
      routine.approvedAt = now;
      break;
    case ROUTINE_STATUS.PUBLISHED:
      routine.publishedBy = req.auth.userId;
      routine.publishedAt = now;
      break;
    case ROUTINE_STATUS.DRAFT:
      // Rejection sends it back for revision; the reason is the useful part.
      routine.rejectionReason = reason;
      routine.approvedBy = null;
      routine.approvedAt = null;
      break;
    default:
      break;
  }

  await routine.save();

  const ACTION_FOR = {
    [ROUTINE_STATUS.SUBMITTED]: ACTIVITY_ACTIONS.SUBMIT,
    [ROUTINE_STATUS.APPROVED]: ACTIVITY_ACTIONS.APPROVE,
    [ROUTINE_STATUS.PUBLISHED]: ACTIVITY_ACTIONS.PUBLISH,
    [ROUTINE_STATUS.DRAFT]: ACTIVITY_ACTIONS.REJECT,
    [ROUTINE_STATUS.ARCHIVED]: ACTIVITY_ACTIONS.UPDATE,
  };

  activityService.record({
    req,
    action: ACTION_FOR[nextStatus] || ACTIVITY_ACTIONS.UPDATE,
    entityType: "Routine",
    entityId: routine._id,
    description:
      `${verb.charAt(0).toUpperCase() + verb.slice(1)}ed routine "${routine.title}" ` +
      `(${previous} → ${nextStatus})` + (reason ? `: ${reason}` : ""),
    changes: { before: { status: previous }, after: { status: nextStatus } },
    department: routine.department,
  });

  await notificationService.notifyStatusChange(routine, previous, nextStatus, req, reason);

  return routine;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Grid
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch a routine's entries flat, fully populated, ready for the frontend to
 * pivot into a days × slots matrix.
 *
 * The pivot happens in the browser rather than here: the same flat array also
 * feeds the reports and the search results, so shaping it server-side would mean
 * three response formats for one dataset.
 */
async function getEntries(filter) {
  return RoutineEntry.find(filter)
    .populate("course", "code title type credits")
    .populate("teacher", "fullName employeeCode designation")
    .populate("room", "code name building type capacity")
    .populate("timeSlot", "label startTime endTime order isBreak")
    .populate("semester", "number academicYear term sections")
    .populate("department", "name code")
    .sort("day timeSlot")
    .lean();
}

module.exports = {
  buildCandidate,
  previewConflicts,
  addEntry,
  updateEntry,
  removeEntry,
  changeStatus,
  getEntries,
  assertEditable,
};
