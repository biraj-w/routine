/**
 * Student controller. Hand-written for the same reason as teacher: it manages a
 * linked User account.
 */
const { Student, User } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const { success, created, paginated } = require("../utils/response");
const { buildListQuery, paginate } = require("../utils/queryFeatures");
const { scoped } = require("../middlewares/scope");
const profileService = require("../services/profile.service");
const activityService = require("../services/activity.service");
const { ACTIVITY_ACTIONS } = require("../config/constants");

/** GET /api/students */
exports.list = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    searchFields: ["fullName", "rollNo", "email"],
    allowedFilters: ["department", "semester", "section", "groupLabel", "status", "batchYear"],
    allowedSorts: ["fullName", "rollNo", "section", "createdAt"],
    defaultSort: "rollNo",
  });

  const { items, meta } = await paginate(Student, scoped(req, options.filter), {
    ...options,
    populate: [
      { path: "department", select: "name code" },
      { path: "semester", select: "number academicYear term" },
      { path: "user", select: "email status lastLoginAt" },
    ],
  });

  return paginated(res, items, meta, "Students fetched");
});

/** GET /api/students/:id */
exports.get = asyncHandler(async (req, res) => {
  const student = await req.doc.populate([
    { path: "department", select: "name code" },
    { path: "semester", select: "number academicYear term sections" },
    { path: "user", select: "email status lastLoginAt" },
  ]);
  return success(res, { data: student, message: "Student fetched" });
});

/** POST /api/students — `password` optional; supplying it creates a login. */
exports.create = asyncHandler(async (req, res) => {
  const student = await profileService.createStudent(req.body, req.auth);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.CREATE,
    entityType: "Student",
    entityId: student._id,
    description: `Created student ${student.fullName} (${student.rollNo})` +
      (student.user ? " with a login account" : " without a login account"),
    department: student.department,
  });

  return created(res, student, "Student created");
});

/** PUT /api/students/:id */
exports.update = asyncHandler(async (req, res) => {
  const student = req.doc;
  const before = student.toObject();

  delete req.body.user;
  delete req.body.password;

  // Moving a student to a different section or semester must land on a section
  // that exists, or their timetable would silently come back empty.
  const semester = req.body.semester ?? student.semester;
  const section = req.body.section ?? student.section;
  if (req.body.semester || req.body.section) {
    await profileService.assertSectionExists(semester, section);
  }

  Object.assign(student, req.body);
  await student.save();
  await profileService.syncLinkedUser(student, req.body);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.UPDATE,
    entityType: "Student",
    entityId: student._id,
    description: `Updated student ${student.fullName}`,
    changes: activityService.diff(before, student.toObject()),
    department: student.department,
  });

  return success(res, { data: student, message: "Student updated" });
});

/**
 * DELETE /api/students/:id — soft delete.
 *
 * Unlike a teacher, a student is not referenced by routine entries (their
 * timetable is derived from semester + section), so there is nothing to block
 * the delete. The linked account is deactivated rather than removed.
 */
exports.remove = asyncHandler(async (req, res) => {
  const student = req.doc;

  await student.softDelete(req.auth.userId);
  if (student.user) {
    await User.updateOne({ _id: student.user }, { $set: { status: "inactive" } });
  }

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.DELETE,
    entityType: "Student",
    entityId: student._id,
    description: `Deleted student ${student.fullName} (${student.rollNo})`,
    department: student.department,
  });

  return success(res, { message: "Student deleted" });
});
