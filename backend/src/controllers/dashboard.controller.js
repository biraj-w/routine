/**
 * Dashboard controller.
 *
 * Every handler passes `req.scopeFilter` into the pipeline, so a Department
 * Admin's figures cover only their own department with no branching here.
 */
const asyncHandler = require("../utils/asyncHandler");
const { success } = require("../utils/response");
const dashboardService = require("../services/dashboard.service");
const { TimeSlot } = require("../models");
const ApiError = require("../utils/ApiError");

/**
 * GET /api/dashboard
 *
 * Everything the landing page needs in one request: the counters, today's
 * classes, the busiest teachers, room utilisation and the density heat map.
 * Issued concurrently, so the page costs one round trip rather than five.
 */
exports.overview = asyncHandler(async (req, res) => {
  const scope = req.scopeFilter || {};

  const [overview, today, workload, rooms, departments, density] = await Promise.all([
    dashboardService.overview(scope),
    dashboardService.todaySchedule(scope),
    dashboardService.teacherWorkload(scope, 10),
    dashboardService.roomUtilisation(scope),
    dashboardService.departmentBreakdown(scope),
    dashboardService.slotDensity(scope),
  ]);

  return success(res, {
    data: {
      ...overview,
      today,
      teacherWorkload: workload,
      roomUtilisation: rooms,
      departments,
      slotDensity: density,
      scope: req.auth.dataScope,
    },
    message: "Dashboard fetched",
  });
});

/** GET /api/dashboard/today */
exports.today = asyncHandler(async (req, res) => {
  const data = await dashboardService.todaySchedule(req.scopeFilter || {});
  return success(res, { data, message: "Today's schedule fetched" });
});

/** GET /api/dashboard/teacher-workload */
exports.teacherWorkload = asyncHandler(async (req, res) => {
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const data = await dashboardService.teacherWorkload(req.scopeFilter || {}, limit);
  return success(res, { data, message: "Teacher workload fetched" });
});

/** GET /api/dashboard/room-utilisation */
exports.roomUtilisation = asyncHandler(async (req, res) => {
  const data = await dashboardService.roomUtilisation(req.scopeFilter || {});
  return success(res, { data, message: "Room utilisation fetched" });
});

/**
 * GET /api/dashboard/free-rooms?day=&timeSlot=
 *
 * Genuinely useful when building a routine, and it reuses the same index the
 * room double-booking rule relies on.
 */
exports.freeRooms = asyncHandler(async (req, res) => {
  const { day, timeSlot, sessionKey } = req.query;

  if (!day || !timeSlot) {
    throw ApiError.badRequest("Both `day` and `timeSlot` are required");
  }
  const slot = await TimeSlot.findById(timeSlot).select("label").lean();
  if (!slot) throw ApiError.badRequest("No such time slot");

  const rooms = await dashboardService.freeRooms({ day, timeSlot, sessionKey });

  return success(res, {
    data: { day, timeSlot: slot, rooms },
    message: `${rooms.length} room(s) free on ${day} ${slot.label}`,
  });
});
