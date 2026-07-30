/**
 * Dashboard statistics via MongoDB aggregation pipelines.
 *
 * ── One caveat that governs every pipeline here ─────────────────────────────
 * Aggregation BYPASSES Mongoose query middleware, so the softDelete plugin's
 * pre(/^find/) hook does not run. Every pipeline below must therefore open with
 * an explicit `$match: { isDeleted: false }`. Forgetting it silently includes
 * deleted records in the counts — a bug that is invisible until someone deletes
 * something and the numbers stop adding up.
 *
 * ── Why pipelines rather than countDocuments ────────────────────────────────
 * The simple totals could be countDocuments calls. $facet is used instead
 * because it returns every counter in ONE round trip, and because the
 * interesting numbers (workload, utilisation, per-department breakdowns) are
 * genuinely relational and need $lookup / $group regardless.
 *
 * Department scoping is applied by merging req.scopeFilter into the opening
 * $match, so a Department Admin's dashboard shows only their own department
 * without any per-pipeline branching.
 */
const {
  User, Department, Semester, Course, Room, TimeSlot,
  Teacher, Student, Routine, RoutineEntry,
} = require("../models");
const { DAYS, ROUTINE_STATUS } = require("../config/constants");

/** Today's teaching day, or null at the weekend. */
function todayName() {
  const name = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return DAYS.includes(name) ? name : null;
}

/** Current time as minutes since midnight, for "upcoming" comparisons. */
function nowMinutes() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Headline counters.
 *
 * Uses $facet so a single aggregation over routine_entries yields several
 * unrelated summaries, plus parallel counts for the master-data collections
 * (which are separate collections and so cannot share one pipeline).
 */
async function overview(scopeFilter = {}) {
  const entryMatch = { isDeleted: false, ...scopeFilter };

  const [
    counts,
    entryFacets,
    publishedRoutines,
  ] = await Promise.all([
    // Master-data totals. Each is its own collection; the scope filter applies
    // to those that have a department.
    Promise.all([
      User.countDocuments({ isDeleted: false, ...(scopeFilter.department ? { department: scopeFilter.department } : {}) }),
      Department.countDocuments({ isDeleted: false, ...(scopeFilter.department ? { _id: scopeFilter.department } : {}) }),
      Teacher.countDocuments({ isDeleted: false, ...scopeFilter }),
      Student.countDocuments({ isDeleted: false, ...scopeFilter }),
      Course.countDocuments({ isDeleted: false, ...scopeFilter }),
      Room.countDocuments({ isDeleted: false }), // institution-wide
      Semester.countDocuments({ isDeleted: false, ...scopeFilter }),
      TimeSlot.countDocuments({ isDeleted: false, isActive: true }),
    ]),

    // Several summaries of routine_entries in one pass.
    RoutineEntry.aggregate([
      { $match: entryMatch },
      {
        $facet: {
          total: [{ $count: "value" }],
          byDay: [
            { $group: { _id: "$day", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
          ],
          byClassType: [{ $group: { _id: "$classType", count: { $sum: 1 } } }],
          distinctTeachers: [
            { $group: { _id: "$teacher" } },
            { $count: "value" },
          ],
          distinctRooms: [{ $group: { _id: "$room" } }, { $count: "value" }],
        },
      },
    ]),

    Routine.aggregate([
      { $match: { isDeleted: false, ...scopeFilter } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const [users, departments, teachers, students, courses, rooms, semesters, timeSlots] = counts;
  const facet = entryFacets[0] || {};

  // Order the per-day counts by the teaching week, not by frequency.
  const byDayMap = new Map((facet.byDay || []).map((d) => [d._id, d.count]));
  const classesByDay = DAYS.map((day) => ({ day, count: byDayMap.get(day) || 0 }));

  const routinesByStatus = Object.fromEntries(
    Object.values(ROUTINE_STATUS).map((s) => [s, 0])
  );
  for (const row of publishedRoutines) routinesByStatus[row._id] = row.count;

  return {
    totals: {
      users,
      departments,
      teachers,
      students,
      courses,
      rooms,
      semesters,
      timeSlots,
      classes: facet.total?.[0]?.value || 0,
    },
    routinesByStatus,
    classesByDay,
    classesByType: (facet.byClassType || []).map((t) => ({ type: t._id, count: t.count })),
    teachersScheduled: facet.distinctTeachers?.[0]?.value || 0,
    roomsInUse: facet.distinctRooms?.[0]?.value || 0,
  };
}

/**
 * Today's classes and the ones still to come.
 *
 * Published routines only: an unpublished draft is not anybody's timetable yet.
 */
async function todaySchedule(scopeFilter = {}) {
  const day = todayName();
  if (!day) return { day: null, isTeachingDay: false, classes: [], upcoming: [] };

  const published = await Routine.find({ status: ROUTINE_STATUS.PUBLISHED, isDeleted: false })
    .select("_id")
    .lean();
  const routineIds = published.map((r) => r._id);

  const classes = await RoutineEntry.aggregate([
    { $match: { isDeleted: false, day, routine: { $in: routineIds }, ...scopeFilter } },
    // $lookup is MongoDB's join. Each stage pulls in one related collection and
    // $unwind flattens the single-element array it produces.
    { $lookup: { from: "timeslots", localField: "timeSlot", foreignField: "_id", as: "slot" } },
    { $unwind: "$slot" },
    { $lookup: { from: "courses", localField: "course", foreignField: "_id", as: "course" } },
    { $unwind: "$course" },
    { $lookup: { from: "teachers", localField: "teacher", foreignField: "_id", as: "teacher" } },
    { $unwind: "$teacher" },
    { $lookup: { from: "rooms", localField: "room", foreignField: "_id", as: "room" } },
    { $unwind: "$room" },
    {
      $project: {
        section: 1,
        groupLabel: 1,
        classType: 1,
        slot: { label: "$slot.label", startTime: "$slot.startTime", endTime: "$slot.endTime", startMinutes: "$slot.startMinutes", order: "$slot.order" },
        course: { code: "$course.code", title: "$course.title" },
        teacher: { fullName: "$teacher.fullName" },
        room: { code: "$room.code" },
      },
    },
    { $sort: { "slot.order": 1 } },
  ]);

  const current = nowMinutes();
  return {
    day,
    isTeachingDay: true,
    classes,
    upcoming: classes.filter((c) => c.slot.startMinutes > current),
  };
}

/**
 * Teaching load per teacher, against their declared weekly cap.
 *
 * $lookup joins the teacher record for the name and limit; $addFields computes
 * the utilisation ratio in the database rather than shipping raw counts to be
 * divided in JavaScript.
 */
async function teacherWorkload(scopeFilter = {}, limit = 10) {
  return RoutineEntry.aggregate([
    { $match: { isDeleted: false, ...scopeFilter } },
    { $group: { _id: "$teacher", classes: { $sum: 1 }, days: { $addToSet: "$day" } } },
    { $lookup: { from: "teachers", localField: "_id", foreignField: "_id", as: "teacher" } },
    { $unwind: "$teacher" },
    { $match: { "teacher.isDeleted": false } },
    {
      $addFields: {
        fullName: "$teacher.fullName",
        employeeCode: "$teacher.employeeCode",
        designation: "$teacher.designation",
        maxWeeklyClasses: "$teacher.maxWeeklyClasses",
        daysTeaching: { $size: "$days" },
        utilisationPercent: {
          $round: [
            {
              $multiply: [
                { $divide: ["$classes", { $max: ["$teacher.maxWeeklyClasses", 1] }] },
                100,
              ],
            },
            0,
          ],
        },
      },
    },
    {
      $addFields: {
        isOverloaded: { $gt: ["$classes", "$teacher.maxWeeklyClasses"] },
      },
    },
    { $project: { teacher: 0, days: 0 } },
    { $sort: { classes: -1 } },
    { $limit: limit },
  ]);
}

/**
 * Room utilisation as a percentage of bookable slots.
 *
 * The denominator — teaching days × non-break slots — is computed first, because
 * it is a property of the timetable grid rather than of any room. Rooms that are
 * never booked would not appear in a $group over entries, so they are merged in
 * afterwards with a zero: an unused room is exactly what this report should
 * surface.
 */
async function roomUtilisation(scopeFilter = {}) {
  const bookableSlots = await TimeSlot.countDocuments({ isDeleted: false, isActive: true, isBreak: false });
  const capacity = bookableSlots * DAYS.length;

  const used = await RoutineEntry.aggregate([
    { $match: { isDeleted: false, ...scopeFilter } },
    { $group: { _id: "$room", booked: { $sum: 1 }, days: { $addToSet: "$day" } } },
    {
      $addFields: {
        utilisationPercent: capacity
          ? { $round: [{ $multiply: [{ $divide: ["$booked", capacity] }, 100] }, 1] }
          : 0,
      },
    },
  ]);

  const usedMap = new Map(used.map((u) => [String(u._id), u]));

  const rooms = await Room.find({ isDeleted: false, isActive: true })
    .select("code name building capacity type")
    .sort("code")
    .lean();

  return {
    bookableSlotsPerWeek: capacity,
    rooms: rooms.map((room) => {
      const stat = usedMap.get(String(room._id));
      return {
        id: room._id,
        code: room.code,
        name: room.name,
        building: room.building,
        type: room.type,
        seats: room.capacity,
        booked: stat?.booked || 0,
        free: capacity - (stat?.booked || 0),
        utilisationPercent: stat?.utilisationPercent || 0,
      };
    }),
  };
}

/**
 * Per-department totals in one pipeline.
 *
 * The classic "join in a document database" demonstration: three $lookup stages
 * followed by $size, which counts the joined arrays without loading them.
 */
async function departmentBreakdown(scopeFilter = {}) {
  const match = { isDeleted: false };
  if (scopeFilter.department) match._id = scopeFilter.department;

  return Department.aggregate([
    { $match: match },
    {
      $lookup: {
        from: "courses",
        let: { deptId: "$_id" },
        pipeline: [{ $match: { $expr: { $eq: ["$department", "$$deptId"] }, isDeleted: false } }],
        as: "courses",
      },
    },
    {
      $lookup: {
        from: "teachers",
        let: { deptId: "$_id" },
        pipeline: [{ $match: { $expr: { $eq: ["$department", "$$deptId"] }, isDeleted: false } }],
        as: "teachers",
      },
    },
    {
      $lookup: {
        from: "students",
        let: { deptId: "$_id" },
        pipeline: [{ $match: { $expr: { $eq: ["$department", "$$deptId"] }, isDeleted: false } }],
        as: "students",
      },
    },
    {
      $project: {
        name: 1,
        code: 1,
        isActive: 1,
        courses: { $size: "$courses" },
        teachers: { $size: "$teachers" },
        students: { $size: "$students" },
      },
    },
    { $sort: { code: 1 } },
  ]);
}

/**
 * How busy each (day, slot) cell is across the whole timetable.
 *
 * Feeds a heat map: five lines of pipeline for a view that makes over- and
 * under-used periods obvious at a glance.
 */
async function slotDensity(scopeFilter = {}) {
  const rows = await RoutineEntry.aggregate([
    { $match: { isDeleted: false, ...scopeFilter } },
    { $group: { _id: { day: "$day", timeSlot: "$timeSlot" }, count: { $sum: 1 } } },
    { $lookup: { from: "timeslots", localField: "_id.timeSlot", foreignField: "_id", as: "slot" } },
    { $unwind: "$slot" },
    {
      $project: {
        _id: 0,
        day: "$_id.day",
        timeSlot: "$_id.timeSlot",
        label: "$slot.label",
        order: "$slot.order",
        count: 1,
      },
    },
    { $sort: { order: 1 } },
  ]);

  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return { days: DAYS, cells: rows, maxCount: max };
}

/**
 * Rooms free in a given day and slot.
 *
 * Reuses the conflict indexes: finding the booked rooms is the same query shape
 * as the room double-booking rule, then everything else is free.
 */
async function freeRooms({ day, timeSlot, sessionKey }) {
  const filter = { isDeleted: false, day, timeSlot };
  if (sessionKey) filter.sessionKey = sessionKey;

  const booked = await RoutineEntry.find(filter).select("room").lean();
  const bookedIds = booked.map((b) => b.room);

  return Room.find({ isDeleted: false, isActive: true, _id: { $nin: bookedIds } })
    .select("code name building capacity type hasProjector")
    .sort("code")
    .lean();
}

module.exports = {
  overview,
  todaySchedule,
  teacherWorkload,
  roomUtilisation,
  departmentBreakdown,
  slotDensity,
  freeRooms,
  todayName,
};
