/**
 * Teacher controller.
 *
 * Hand-written rather than generated, because create and update also manage the
 * linked User account — see services/profile.service.js.
 */
const { Teacher, User, RoutineEntry, Department } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { success, created, paginated } = require("../utils/response");
const { buildListQuery, paginate } = require("../utils/queryFeatures");
const { scoped } = require("../middlewares/scope");
const profileService = require("../services/profile.service");
const activityService = require("../services/activity.service");
const { ACTIVITY_ACTIONS } = require("../config/constants");

/** GET /api/teachers */
exports.list = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    searchFields: ["fullName", "employeeCode", "email"],
    allowedFilters: ["department", "designation", "status"],
    allowedSorts: ["fullName", "employeeCode", "designation", "createdAt"],
    defaultSort: "fullName",
  });

  const { items, meta } = await paginate(Teacher, scoped(req, options.filter), {
    ...options,
    populate: [
      { path: "department", select: "name code" },
      { path: "user", select: "email status lastLoginAt" },
    ],
  });

  return paginated(res, items, meta, "Teachers fetched");
});

/** GET /api/teachers/:id */
exports.get = asyncHandler(async (req, res) => {
  const teacher = await req.doc.populate([
    { path: "department", select: "name code" },
    { path: "user", select: "email status lastLoginAt" },
    { path: "unavailableSlots.timeSlot", select: "label startTime endTime" },
  ]);
  return success(res, { data: teacher, message: "Teacher fetched" });
});

/**
 * POST /api/teachers
 *
 * `password` in the body is optional. Supplying it creates a login account
 * alongside the profile; omitting it creates a teacher who can appear in
 * timetables but cannot yet sign in.
 */
exports.create = asyncHandler(async (req, res) => {
  const teacher = await profileService.createTeacher(req.body, req.auth);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.CREATE,
    entityType: "Teacher",
    entityId: teacher._id,
    description: `Created teacher ${teacher.fullName} (${teacher.employeeCode})` +
      (teacher.user ? " with a login account" : " without a login account"),
    department: teacher.department,
  });

  return created(res, teacher, "Teacher created");
});

/** PUT /api/teachers/:id */
exports.update = asyncHandler(async (req, res) => {
  const teacher = req.doc;
  const before = teacher.toObject();

  // The account is managed through the user module, not here.
  delete req.body.user;
  delete req.body.password;

  Object.assign(teacher, req.body);
  await teacher.save();
  await profileService.syncLinkedUser(teacher, req.body);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.UPDATE,
    entityType: "Teacher",
    entityId: teacher._id,
    description: `Updated teacher ${teacher.fullName}`,
    changes: activityService.diff(before, teacher.toObject()),
    department: teacher.department,
  });

  return success(res, { data: teacher, message: "Teacher updated" });
});

/**
 * DELETE /api/teachers/:id — soft delete.
 *
 * Refused while the teacher still appears in a routine: removing them would
 * leave classes with no instructor. The linked account is DEACTIVATED rather
 * than deleted, so the audit trail and any historical references stay intact.
 */
exports.remove = asyncHandler(async (req, res) => {
  const teacher = req.doc;

  const entries = await RoutineEntry.countDocuments({ teacher: teacher._id });
  if (entries > 0) {
    throw ApiError.conflict(
      `Cannot delete this teacher: they are assigned to ${entries} routine ` +
        `entr${entries === 1 ? "y" : "ies"}. Reassign those classes first, or set their status to inactive.`,
      "REFERENCED",
      [{ field: "teacher", message: `${entries} routine entries reference this teacher` }]
    );
  }

  await teacher.softDelete(req.auth.userId);
  if (teacher.user) {
    await User.updateOne({ _id: teacher.user }, { $set: { status: "inactive" } });
  }

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.DELETE,
    entityType: "Teacher",
    entityId: teacher._id,
    description: `Deleted teacher ${teacher.fullName}` + (teacher.user ? " and deactivated their account" : ""),
    department: teacher.department,
  });

  return success(res, { message: "Teacher deleted" });
});

/**
 * PUT /api/teachers/:id/availability
 *
 * Declared unavailable slots do not block scheduling — the conflict service
 * reports them as non-blocking warnings, because a head of department may
 * legitimately need to override a preference.
 */
exports.setAvailability = asyncHandler(async (req, res) => {
  const teacher = req.doc;
  teacher.unavailableSlots = req.body.unavailableSlots || [];
  teacher.updatedBy = req.auth.userId;
  await teacher.save();

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.UPDATE,
    entityType: "Teacher",
    entityId: teacher._id,
    description: `Updated unavailable slots for ${teacher.fullName} (${teacher.unavailableSlots.length} slot(s))`,
    department: teacher.department,
  });

  return success(res, { data: teacher, message: "Availability updated" });
});
