/**
 * Report controller.
 *
 * Two access rules run through all of these:
 *
 *   - Anyone without "View Routine" sees PUBLISHED data only. Enforced by
 *     passing publishedOnly through to the service, not by filtering afterwards.
 *   - A department-scoped caller has their own department forced into the query,
 *     so asking for another department's report returns their own rather than
 *     leaking.
 */
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { success } = require("../utils/response");
const reportService = require("../services/report.service");
const dashboardService = require("../services/dashboard.service");
const authorize = require("../middlewares/authorize");
const { Teacher, Student } = require("../models");
const { PERMISSIONS: P } = require("../config/permissions");
const { DATA_SCOPES } = require("../config/roles");

/** May this caller see unpublished routines? */
const publishedOnly = (req) => !authorize.has(req, P.VIEW_ROUTINE);

/**
 * The department a report must be limited to: the caller's own if they are
 * department-scoped, otherwise whatever they asked for.
 */
function departmentFor(req) {
  if (req.auth.dataScope === DATA_SCOPES.GLOBAL) return req.query.department || null;
  return req.auth.departmentId;
}

/**
 * GET /api/reports/teacher?teacher=
 *
 * A teacher with only "View Own Routine" may request their own report and no one
 * else's — resolved from their linked profile rather than from the query string.
 */
exports.teacher = asyncHandler(async (req, res) => {
  let teacherId = req.query.teacher;

  if (!authorize.has(req, P.VIEW_ROUTINE)) {
    const own = await Teacher.findOne({ user: req.auth.userId }).select("_id").lean();
    if (!own) throw ApiError.forbidden("Your account is not linked to a teacher profile.");
    // Silently pin to their own id: a teacher cannot read a colleague's load.
    teacherId = own._id;
  }
  if (!teacherId) throw ApiError.badRequest("A `teacher` id is required");

  const data = await reportService.teacherRoutine({
    teacherId,
    publishedOnly: publishedOnly(req),
    department: departmentFor(req),
  });

  return success(res, { data, message: "Teacher routine report" });
});

/** GET /api/reports/student?student= — same self-pinning rule as above. */
exports.student = asyncHandler(async (req, res) => {
  let studentId = req.query.student;

  if (!authorize.has(req, P.VIEW_ROUTINE)) {
    const own = await Student.findOne({ user: req.auth.userId }).select("_id").lean();
    if (!own) throw ApiError.forbidden("Your account is not linked to a student profile.");
    studentId = own._id;
  }
  if (!studentId) throw ApiError.badRequest("A `student` id is required");

  const data = await reportService.studentRoutine({
    studentId,
    publishedOnly: publishedOnly(req),
  });

  return success(res, { data, message: "Student routine report" });
});

/** GET /api/reports/department?department=&semester=&section= */
exports.department = asyncHandler(async (req, res) => {
  const departmentId = departmentFor(req);
  if (!departmentId) throw ApiError.badRequest("A `department` id is required");

  const data = await reportService.departmentRoutine({
    departmentId,
    semesterId: req.query.semester || null,
    section: req.query.section || null,
    publishedOnly: publishedOnly(req),
  });

  return success(res, { data, message: "Department routine report" });
});

/** GET /api/reports/room-utilisation */
exports.roomUtilisation = asyncHandler(async (req, res) => {
  const data = await reportService.roomUtilisation({ department: departmentFor(req) });
  return success(res, { data, message: "Room utilisation report" });
});

/** GET /api/reports/daily?day= */
exports.daily = asyncHandler(async (req, res) => {
  const day = req.query.day || dashboardService.todayName();
  if (!day) {
    throw ApiError.badRequest("Today is not a teaching day — pass an explicit `day`.");
  }

  const data = await reportService.dailyRoutine({
    day,
    departmentId: departmentFor(req),
    publishedOnly: publishedOnly(req),
  });

  return success(res, { data, message: "Daily routine report" });
});

/** GET /api/reports/weekly?routine=|department=&semester=&section= */
exports.weekly = asyncHandler(async (req, res) => {
  const data = await reportService.weeklyRoutine({
    routineId: req.query.routine || null,
    departmentId: departmentFor(req),
    semesterId: req.query.semester || null,
    section: req.query.section || null,
    publishedOnly: publishedOnly(req),
  });

  return success(res, { data, message: "Weekly routine report" });
});
