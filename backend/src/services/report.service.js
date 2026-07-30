/**
 * Reports.
 *
 * Each returns structured JSON that the frontend renders as a printable table or
 * a weekly grid. Formatting stays on the client so the same data can be shown,
 * printed or exported without three server-side variants.
 *
 * Like dashboard.service.js, any aggregation here opens with an explicit
 * `$match: { isDeleted: false }`, because aggregation bypasses the soft-delete
 * query hook.
 */
const { RoutineEntry, Routine, Teacher, Student, TimeSlot } = require("../models");
const dashboardService = require("./dashboard.service");
const ApiError = require("../utils/ApiError");
const { DAYS, ROUTINE_STATUS } = require("../config/constants");

/** Ids of routines the report may draw on. */
async function visibleRoutineIds({ publishedOnly = true, department = null } = {}) {
  const filter = { isDeleted: false };
  if (publishedOnly) filter.status = ROUTINE_STATUS.PUBLISHED;
  if (department) filter.department = department;

  const routines = await Routine.find(filter).select("_id").lean();
  return routines.map((r) => r._id);
}

/** The populated entries every report is built from. */
function fetchEntries(filter) {
  return RoutineEntry.find(filter)
    .populate("course", "code title credits type")
    .populate("teacher", "fullName employeeCode designation")
    .populate("room", "code name building type")
    .populate("timeSlot", "label startTime endTime order isBreak")
    .populate("semester", "number academicYear term")
    .populate("department", "name code")
    .sort("day")
    .lean();
}

/** The grid axes, so a client can lay out a week without a second request. */
async function gridAxes() {
  const timeSlots = await TimeSlot.find({ isDeleted: false, isActive: true })
    .sort("order")
    .select("label startTime endTime order isBreak")
    .lean();
  return { days: DAYS, timeSlots };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Teacher routine
 * ──────────────────────────────────────────────────────────────────────────── */

async function teacherRoutine({ teacherId, publishedOnly = true, department = null }) {
  const teacher = await Teacher.findById(teacherId)
    .populate("department", "name code")
    .select("fullName employeeCode designation department maxWeeklyClasses")
    .lean();
  if (!teacher) throw ApiError.notFound("Teacher not found");

  const routineIds = await visibleRoutineIds({ publishedOnly, department });
  const entries = await fetchEntries({ teacher: teacherId, routine: { $in: routineIds } });

  const totalMinutes = entries.reduce((sum, e) => {
    const slot = e.timeSlot;
    if (!slot?.startTime || !slot?.endTime) return sum;
    const [sh, sm] = slot.startTime.split(":").map(Number);
    const [eh, em] = slot.endTime.split(":").map(Number);
    return sum + (eh * 60 + em - (sh * 60 + sm));
  }, 0);

  return {
    report: "Teacher routine",
    subject: teacher,
    ...(await gridAxes()),
    entries,
    summary: {
      totalClasses: entries.length,
      weeklyLimit: teacher.maxWeeklyClasses,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      distinctCourses: new Set(entries.map((e) => String(e.course?._id))).size,
      daysTeaching: new Set(entries.map((e) => e.day)).size,
      isOverloaded: entries.length > teacher.maxWeeklyClasses,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Student routine
 * ──────────────────────────────────────────────────────────────────────────── */

async function studentRoutine({ studentId, publishedOnly = true }) {
  const student = await Student.findById(studentId)
    .populate("department", "name code")
    .populate("semester", "number academicYear term")
    .select("fullName rollNo section groupLabel department semester")
    .lean();
  if (!student) throw ApiError.notFound("Student not found");

  const routineIds = await visibleRoutineIds({ publishedOnly });

  // A student sees whole-section classes plus their own lab batch — never the
  // other batch's, which would put two classes in one cell of their grid.
  const entries = await fetchEntries({
    routine: { $in: routineIds },
    semester: student.semester._id,
    section: student.section,
    groupLabel: { $in: ["ALL", student.groupLabel] },
  });

  return {
    report: "Student routine",
    subject: student,
    ...(await gridAxes()),
    entries,
    summary: {
      totalClasses: entries.length,
      distinctCourses: new Set(entries.map((e) => String(e.course?._id))).size,
      totalCredits: [
        ...new Map(entries.map((e) => [String(e.course?._id), e.course?.credits || 0])).values(),
      ].reduce((a, b) => a + b, 0),
      daysWithClasses: new Set(entries.map((e) => e.day)).size,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. Department routine
 * ──────────────────────────────────────────────────────────────────────────── */

async function departmentRoutine({ departmentId, semesterId = null, section = null, publishedOnly = true }) {
  const routineIds = await visibleRoutineIds({ publishedOnly, department: departmentId });

  const filter = { routine: { $in: routineIds }, department: departmentId };
  if (semesterId) filter.semester = semesterId;
  if (section) filter.section = String(section).toUpperCase();

  const entries = await fetchEntries(filter);

  // Group by semester and section, which is how a department reads its own
  // timetable — one grid per cohort rather than one enormous list.
  const groups = new Map();
  for (const entry of entries) {
    const key = `${entry.semester?.number ?? "?"}-${entry.section}`;
    if (!groups.has(key)) {
      groups.set(key, {
        semester: entry.semester,
        section: entry.section,
        entries: [],
      });
    }
    groups.get(key).entries.push(entry);
  }

  return {
    report: "Department routine",
    ...(await gridAxes()),
    groups: [...groups.values()].sort(
      (a, b) =>
        (a.semester?.number || 0) - (b.semester?.number || 0) || a.section.localeCompare(b.section)
    ),
    summary: {
      totalClasses: entries.length,
      cohorts: groups.size,
      distinctTeachers: new Set(entries.map((e) => String(e.teacher?._id))).size,
      distinctRooms: new Set(entries.map((e) => String(e.room?._id))).size,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Room utilisation
 * ──────────────────────────────────────────────────────────────────────────── */

/** Delegates to the dashboard service, which already computes this. */
async function roomUtilisation({ department = null } = {}) {
  const scope = department ? { department } : {};
  const data = await dashboardService.roomUtilisation(scope);

  return {
    report: "Room utilisation",
    ...data,
    summary: {
      totalRooms: data.rooms.length,
      unused: data.rooms.filter((r) => r.booked === 0).length,
      averageUtilisation:
        data.rooms.length
          ? Math.round(
              (data.rooms.reduce((s, r) => s + r.utilisationPercent, 0) / data.rooms.length) * 10
            ) / 10
          : 0,
      busiest: [...data.rooms].sort((a, b) => b.booked - a.booked)[0] || null,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 5. Daily routine
 * ──────────────────────────────────────────────────────────────────────────── */

async function dailyRoutine({ day, departmentId = null, publishedOnly = true }) {
  if (!DAYS.includes(day)) {
    throw ApiError.badRequest(`"${day}" is not a teaching day. Expected one of: ${DAYS.join(", ")}`);
  }

  const routineIds = await visibleRoutineIds({ publishedOnly, department: departmentId });
  const filter = { routine: { $in: routineIds }, day };
  if (departmentId) filter.department = departmentId;

  const entries = await fetchEntries(filter);
  const { timeSlots } = await gridAxes();

  // Ordered by period, since that is how a day is actually read.
  const byPeriod = timeSlots.map((slot) => ({
    timeSlot: slot,
    entries: entries
      .filter((e) => String(e.timeSlot?._id) === String(slot._id))
      .sort((a, b) => (a.semester?.number || 0) - (b.semester?.number || 0)),
  }));

  return {
    report: "Daily routine",
    day,
    timeSlots,
    byPeriod,
    entries,
    summary: {
      totalClasses: entries.length,
      busiestPeriod: [...byPeriod].sort((a, b) => b.entries.length - a.entries.length)[0]?.timeSlot?.label || null,
      teachersEngaged: new Set(entries.map((e) => String(e.teacher?._id))).size,
      roomsInUse: new Set(entries.map((e) => String(e.room?._id))).size,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 6. Weekly routine
 * ──────────────────────────────────────────────────────────────────────────── */

async function weeklyRoutine({ routineId = null, departmentId = null, semesterId = null, section = null, publishedOnly = true }) {
  let filter;

  if (routineId) {
    const routine = await Routine.findById(routineId).lean();
    if (!routine) throw ApiError.notFound("Routine not found");
    if (publishedOnly && routine.status !== ROUTINE_STATUS.PUBLISHED) {
      throw ApiError.notFound("Routine not found");
    }
    filter = { routine: routine._id };
  } else {
    const routineIds = await visibleRoutineIds({ publishedOnly, department: departmentId });
    filter = { routine: { $in: routineIds } };
    if (departmentId) filter.department = departmentId;
    if (semesterId) filter.semester = semesterId;
    if (section) filter.section = String(section).toUpperCase();
  }

  const entries = await fetchEntries(filter);
  const { days, timeSlots } = await gridAxes();

  // Per-day totals, so the client can show a load profile alongside the grid.
  const perDay = days.map((day) => ({
    day,
    count: entries.filter((e) => e.day === day).length,
  }));

  return {
    report: "Weekly routine",
    days,
    timeSlots,
    entries,
    perDay,
    summary: {
      totalClasses: entries.length,
      distinctCourses: new Set(entries.map((e) => String(e.course?._id))).size,
      distinctTeachers: new Set(entries.map((e) => String(e.teacher?._id))).size,
      averagePerDay: Math.round((entries.length / days.length) * 10) / 10,
    },
  };
}

module.exports = {
  teacherRoutine,
  studentRoutine,
  departmentRoutine,
  roomUtilisation,
  dailyRoutine,
  weeklyRoutine,
};
