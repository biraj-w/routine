/**
 * Routine controller — routine headers, entries, the grid, search, and the
 * lifecycle endpoints.
 */
const { Routine, RoutineEntry, Semester, TimeSlot, Teacher, Student } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { success, created, paginated } = require("../utils/response");
const { buildListQuery, paginate } = require("../utils/queryFeatures");
const { scoped, isSelfScope } = require("../middlewares/scope");
const routineService = require("../services/routine.service");
const activityService = require("../services/activity.service");
const authorize = require("../middlewares/authorize");
const { PERMISSIONS: P } = require("../config/permissions");
const { ROUTINE_STATUS, DAYS, ACTIVITY_ACTIONS } = require("../config/constants");

/**
 * Restrict what a caller may see.
 *
 * Teachers and students hold only "View Own Routine", so they see PUBLISHED
 * routines and nothing else. Enforced in the query filter rather than by the UI,
 * because hiding a draft in the interface leaves the API returning it.
 */
function visibilityFilter(req, base = {}) {
  if (authorize.has(req, P.VIEW_ROUTINE)) return base;
  return { ...base, status: ROUTINE_STATUS.PUBLISHED };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Routine headers
 * ──────────────────────────────────────────────────────────────────────────── */

/** GET /api/routines */
exports.list = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    searchFields: ["title", "academicYear"],
    allowedFilters: ["department", "semester", "status", "academicYear", "term"],
    allowedSorts: ["createdAt", "publishedAt", "status", "academicYear"],
    defaultSort: "-createdAt",
  });

  const filter = visibilityFilter(req, scoped(req, options.filter));

  const { items, meta } = await paginate(Routine, filter, {
    ...options,
    populate: [
      { path: "department", select: "name code" },
      { path: "semester", select: "number academicYear term sections" },
      { path: "submittedBy", select: "name email" },
      { path: "approvedBy", select: "name email" },
      { path: "publishedBy", select: "name email" },
    ],
  });

  return paginated(res, items, meta, "Routines fetched");
});

/** GET /api/routines/:id */
exports.get = asyncHandler(async (req, res) => {
  const routine = req.doc;

  if (!authorize.has(req, P.VIEW_ROUTINE) && routine.status !== ROUTINE_STATUS.PUBLISHED) {
    // 404 rather than 403: an unpublished draft should not be discoverable.
    throw ApiError.notFound("Routine not found");
  }

  const populated = await routine.populate([
    { path: "department", select: "name code" },
    { path: "semester", select: "number academicYear term sections" },
    { path: "submittedBy", select: "name email" },
    { path: "approvedBy", select: "name email" },
    { path: "publishedBy", select: "name email" },
  ]);

  return success(res, {
    data: { ...populated.toJSON(), allowedTransitions: routine.allowedTransitions },
    message: "Routine fetched",
  });
});

/**
 * POST /api/routines — create an empty draft timetable.
 *
 * academicYear and term are copied from the chosen semester rather than accepted
 * separately, so the routine's sessionKey cannot disagree with its semester's.
 */
exports.create = asyncHandler(async (req, res) => {
  const semester = await Semester.findById(req.body.semester)
    .populate("department", "name code")
    .lean();
  if (!semester) throw ApiError.badRequest("No such semester");

  // A department admin may only build routines for their own department, and the
  // semester carries the authoritative department.
  if (req.auth.dataScope === "department" && String(semester.department._id) !== String(req.auth.departmentId)) {
    throw ApiError.forbidden("That semester belongs to another department.", "OUT_OF_SCOPE");
  }

  const routine = await Routine.create({
    title:
      req.body.title ||
      `${semester.department.code} Semester ${semester.number} — ${semester.term} ${semester.academicYear}`,
    department: semester.department._id,
    semester: semester._id,
    academicYear: semester.academicYear,
    term: semester.term,
    effectiveFrom: req.body.effectiveFrom || semester.startDate || null,
    status: ROUTINE_STATUS.DRAFT,
    createdBy: req.auth.userId,
    updatedBy: req.auth.userId,
  });

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.CREATE,
    entityType: "Routine",
    entityId: routine._id,
    description: `Created draft routine "${routine.title}"`,
    department: routine.department,
  });

  return created(res, routine, "Draft routine created");
});

/** PUT /api/routines/:id — title and effective date only. */
exports.update = asyncHandler(async (req, res) => {
  const routine = req.doc;
  routineService.assertEditable(routine);

  const before = routine.toObject();
  if (req.body.title !== undefined) routine.title = req.body.title;
  if (req.body.effectiveFrom !== undefined) routine.effectiveFrom = req.body.effectiveFrom;
  routine.updatedBy = req.auth.userId;
  await routine.save();

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.UPDATE,
    entityType: "Routine",
    entityId: routine._id,
    description: `Updated routine "${routine.title}"`,
    changes: activityService.diff(before, routine.toObject()),
    department: routine.department,
  });

  return success(res, { data: routine, message: "Routine updated" });
});

/** DELETE /api/routines/:id — soft-deletes the header and all its entries. */
exports.remove = asyncHandler(async (req, res) => {
  const routine = req.doc;

  if (routine.status === ROUTINE_STATUS.PUBLISHED) {
    throw ApiError.conflict(
      "A published routine cannot be deleted — archive it instead, so the historical record survives.",
      "INVALID_TRANSITION"
    );
  }

  // Entries are soft-deleted too, which also frees their slots for reuse.
  await RoutineEntry.updateMany(
    { routine: routine._id, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date(), deletedBy: req.auth.userId } }
  );
  await routine.softDelete(req.auth.userId);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.DELETE,
    entityType: "Routine",
    entityId: routine._id,
    description: `Deleted routine "${routine.title}" and its ${routine.entryCount} entries`,
    department: routine.department,
  });

  return success(res, { message: "Routine deleted" });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Entries
 * ──────────────────────────────────────────────────────────────────────────── */

/** GET /api/routines/:id/entries */
exports.listEntries = asyncHandler(async (req, res) => {
  const routine = req.doc;

  if (!authorize.has(req, P.VIEW_ROUTINE) && routine.status !== ROUTINE_STATUS.PUBLISHED) {
    throw ApiError.notFound("Routine not found");
  }

  const entries = await routineService.getEntries({ routine: routine._id });
  return success(res, { data: entries, message: "Routine entries fetched" });
});

/** POST /api/routines/:id/entries */
exports.addEntry = asyncHandler(async (req, res) => {
  const { entry, warnings } = await routineService.addEntry(req.doc, req.body, req);
  const populated = await routineService.getEntries({ _id: entry._id });

  return created(
    res,
    { entry: populated[0] || entry, warnings },
    warnings.length
      ? `Class added with ${warnings.length} warning(s)`
      : "Class added"
  );
});

/** PUT /api/routines/:id/entries/:entryId */
exports.updateEntry = asyncHandler(async (req, res) => {
  const entry = await RoutineEntry.findById(req.params.entryId);
  if (!entry || String(entry.routine) !== String(req.doc._id)) {
    throw ApiError.notFound("Routine entry not found");
  }

  const result = await routineService.updateEntry(req.doc, entry, req.body, req);
  const populated = await routineService.getEntries({ _id: entry._id });

  return success(res, {
    data: { entry: populated[0] || result.entry, warnings: result.warnings },
    message: result.warnings.length
      ? `Class updated with ${result.warnings.length} warning(s)`
      : "Class updated",
  });
});

/** DELETE /api/routines/:id/entries/:entryId */
exports.removeEntry = asyncHandler(async (req, res) => {
  const entry = await RoutineEntry.findById(req.params.entryId);
  if (!entry || String(entry.routine) !== String(req.doc._id)) {
    throw ApiError.notFound("Routine entry not found");
  }

  await routineService.removeEntry(req.doc, entry, req);
  return success(res, { message: "Class removed" });
});

/**
 * POST /api/routines/:id/check-conflicts
 *
 * Dry run — writes nothing. The form calls this as the user picks a teacher,
 * room and slot, so a clash is visible before submitting. Uses the same service
 * as the write path, so the preview and the save can never disagree.
 */
exports.checkConflicts = asyncHandler(async (req, res) => {
  const { conflicts, warnings, ok } = await routineService.previewConflicts(
    req.doc,
    req.body,
    req.body.excludeEntryId || null
  );

  return success(res, {
    data: { ok, conflicts, warnings },
    message: ok
      ? warnings.length
        ? `No conflicts, ${warnings.length} warning(s)`
        : "No conflicts"
      : `${conflicts.length} conflict(s) found`,
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Grid
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/routines/:id/grid
 *
 * Returns the flat entries plus the axes (days, slots, sections) the client needs
 * to lay out a matrix. Pivoting stays in the browser: the same flat array also
 * powers search and reports, so shaping it here would create a third format for
 * one dataset.
 */
exports.grid = asyncHandler(async (req, res) => {
  const routine = req.doc;

  if (!authorize.has(req, P.VIEW_ROUTINE) && routine.status !== ROUTINE_STATUS.PUBLISHED) {
    throw ApiError.notFound("Routine not found");
  }

  const filter = { routine: routine._id };
  if (req.query.section) filter.section = String(req.query.section).toUpperCase();

  const [entries, slots, semester] = await Promise.all([
    routineService.getEntries(filter),
    TimeSlot.find({ isActive: true }).sort("order").select("label startTime endTime order isBreak").lean(),
    Semester.findById(routine.semester).select("number academicYear term sections").lean(),
  ]);

  return success(res, {
    data: {
      routine: {
        id: routine._id,
        title: routine.title,
        status: routine.status,
        entryCount: routine.entryCount,
        allowedTransitions: routine.allowedTransitions,
      },
      days: DAYS,
      timeSlots: slots,
      sections: semester?.sections || [],
      entries,
    },
    message: "Routine grid fetched",
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Search and "my routine"
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/routines/search
 *
 * Cross-routine search by teacher, room, course, day, department, semester or
 * section. Restricted to published routines unless the caller may view any.
 */
exports.search = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    allowedFilters: ["department", "semester", "section", "groupLabel", "day", "teacher", "room", "course", "classType"],
    allowedSorts: ["day", "createdAt"],
    defaultSort: "day",
    maxLimit: 200,
  });

  let filter = scoped(req, options.filter);

  // Restrict to published routines for anyone without "View Routine", by first
  // resolving which routine ids are visible.
  if (!authorize.has(req, P.VIEW_ROUTINE)) {
    const visible = await Routine.find({ status: ROUTINE_STATUS.PUBLISHED }).select("_id").lean();
    filter.routine = { $in: visible.map((r) => r._id) };
  }

  const { items, meta } = await paginate(RoutineEntry, filter, {
    ...options,
    populate: [
      { path: "course", select: "code title" },
      { path: "teacher", select: "fullName employeeCode" },
      { path: "room", select: "code building" },
      { path: "timeSlot", select: "label startTime endTime order" },
      { path: "semester", select: "number academicYear term" },
      { path: "department", select: "name code" },
    ],
  });

  return paginated(res, items, meta, "Search results");
});

/**
 * GET /api/routines/me
 *
 * A teacher's or student's own timetable, resolved from their linked profile so
 * the caller cannot ask for someone else's. Published entries only.
 */
exports.myRoutine = asyncHandler(async (req, res) => {
  const published = await Routine.find({ status: ROUTINE_STATUS.PUBLISHED }).select("_id").lean();
  const routineIds = published.map((r) => r._id);

  const teacher = await Teacher.findOne({ user: req.auth.userId }).select("_id fullName").lean();
  const student = teacher ? null : await Student.findOne({ user: req.auth.userId })
    .select("_id fullName semester section groupLabel")
    .lean();

  if (!teacher && !student) {
    throw ApiError.notFound(
      "Your account is not linked to a teacher or student profile, so there is no personal routine to show."
    );
  }

  const filter = teacher
    ? { routine: { $in: routineIds }, teacher: teacher._id }
    : {
        routine: { $in: routineIds },
        semester: student.semester,
        section: student.section,
        // A student sees whole-section classes plus their own lab batch, not the
        // other batch's.
        groupLabel: { $in: ["ALL", student.groupLabel] },
      };

  const [entries, slots] = await Promise.all([
    routineService.getEntries(filter),
    TimeSlot.find({ isActive: true }).sort("order").select("label startTime endTime order isBreak").lean(),
  ]);

  return success(res, {
    data: {
      as: teacher ? "teacher" : "student",
      profile: teacher || student,
      days: DAYS,
      timeSlots: slots,
      entries,
    },
    message: "Your routine fetched",
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * Lifecycle
 * ──────────────────────────────────────────────────────────────────────────── */

const transition = (nextStatus) =>
  asyncHandler(async (req, res) => {
    const routine = await routineService.changeStatus(req.doc, nextStatus, req, {
      reason: req.body?.reason || "",
    });
    return success(res, {
      data: { id: routine._id, status: routine.status, allowedTransitions: routine.allowedTransitions },
      message: `Routine ${nextStatus}`,
    });
  });

exports.submit = transition(ROUTINE_STATUS.SUBMITTED);
exports.approve = transition(ROUTINE_STATUS.APPROVED);
exports.publish = transition(ROUTINE_STATUS.PUBLISHED);
exports.archive = transition(ROUTINE_STATUS.ARCHIVED);
/** Rejection returns it to draft, carrying the reason back to the submitter. */
exports.reject = transition(ROUTINE_STATUS.DRAFT);
