/**
 * Conflict detection — the business logic that makes this more than CRUD.
 *
 * ── Why a service, not a Mongoose hook ─────────────────────────────────────
 * A pre('save') hook cannot do this job:
 *   - On update it has no clean way to exclude the document being edited, so an
 *     entry would conflict with itself.
 *   - It cannot run for a dry-run preview, which the UI needs in order to warn
 *     before the user submits.
 *   - It can only throw on the FIRST violation, when the useful answer is all of
 *     them at once.
 *   - It would bury the most important logic in the project inside a schema.
 *
 * A service is also reused by all three callers — create, update and preview —
 * so the rules exist in exactly one place.
 *
 * ── One query, three rules ─────────────────────────────────────────────────
 * All the rules share the same "where": same academic session, same day, same
 * time slot, not deleted, excluding self. So they collapse into a single indexed
 * $or rather than three round trips.
 *
 * Because time slots are a fixed non-overlapping catalogue, every comparison is
 * an EQUALITY test, never interval arithmetic — which is exactly what allows the
 * unique indexes in models/RoutineEntry.js to enforce the same rules atomically.
 * This service exists to produce good messages; the indexes produce correctness.
 */
const { RoutineEntry, Teacher, Room, Student, TimeSlot, Course } = require("../models");
const { DEFAULT_GROUP_LABEL } = require("../config/constants");

/** Machine-readable conflict identifiers, surfaced in the 409 body. */
const RULES = {
  TEACHER_BUSY: "TEACHER_BUSY",
  ROOM_BUSY: "ROOM_BUSY",
  SECTION_BUSY: "SECTION_BUSY",
  DUPLICATE_COURSE: "DUPLICATE_COURSE",
};

/** Non-blocking advisories — the save proceeds. */
const WARNINGS = {
  TEACHER_UNAVAILABLE: "TEACHER_UNAVAILABLE",
  TEACHER_OVERLOADED: "TEACHER_OVERLOADED",
  ROOM_TOO_SMALL: "ROOM_TOO_SMALL",
  BREAK_SLOT: "BREAK_SLOT",
  COURSE_OVER_QUOTA: "COURSE_OVER_QUOTA",
  ROOM_TYPE_MISMATCH: "ROOM_TYPE_MISMATCH",
};

/**
 * Find every conflict a candidate entry would cause.
 *
 * @param {Object} candidate  { sessionKey, day, timeSlot, teacher, room,
 *                              semester, section, groupLabel, course }
 * @param {string|null} excludeId  _id of the entry being UPDATED.
 *
 *   Passing excludeId on update is the single most commonly missed detail in
 *   this kind of feature: without it, saving an unchanged entry reports a
 *   conflict with itself and the user can never edit anything.
 *
 * @returns {Promise<Array<{rule, field, message, conflictWith}>>}
 */
async function findConflicts(candidate, excludeId = null) {
  const base = {
    sessionKey: candidate.sessionKey,
    day: candidate.day,
    timeSlot: candidate.timeSlot,
    isDeleted: false,
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };

  const clashes = await RoutineEntry.find({
    ...base,
    $or: [
      // R1 — this teacher is already teaching in this slot, anywhere in the
      //      institution. Crosses departments: a visiting lecturer shared
      //      between two departments must not be booked twice.
      { teacher: candidate.teacher },

      // R2 — this room is already occupied in this slot, anywhere. Also crosses
      //      departments, which is why shared rooms exist.
      { room: candidate.room },

      // R3 + R4 — this AUDIENCE already has a class.
      //
      // One arm, not two. `groupLabel` is essential and must be part of the
      // match: it is what allows a split lab (G1 and G2) to run concurrently in
      // different rooms with different instructors. A course-and-section match
      // that ignored groupLabel would reject that legitimate arrangement.
      //
      // Rule 4 ("the same course must not appear twice in the same slot") is
      // therefore not an independent constraint here — it is rule 3 with a more
      // specific message, chosen below by whether the course also matches.
      {
        semester: candidate.semester,
        section: candidate.section,
        groupLabel: candidate.groupLabel,
      },
    ],
  })
    .populate("course", "code title")
    .populate("teacher", "fullName employeeCode")
    .populate("room", "code name")
    .populate("timeSlot", "label")
    .lean();

  const conflicts = [];
  const when = (entry) => `${candidate.day} ${entry.timeSlot?.label || ""}`.trim();

  for (const clash of clashes) {
    const courseCode = clash.course?.code || "another class";

    if (String(clash.teacher?._id) === String(candidate.teacher)) {
      conflicts.push({
        rule: RULES.TEACHER_BUSY,
        field: "teacher",
        message: `${clash.teacher.fullName} is already teaching ${courseCode} on ${when(clash)}.`,
        conflictWith: clash._id,
      });
    }

    if (String(clash.room?._id) === String(candidate.room)) {
      conflicts.push({
        rule: RULES.ROOM_BUSY,
        field: "room",
        message: `Room ${clash.room.code} is already occupied by ${courseCode} on ${when(clash)}.`,
        conflictWith: clash._id,
      });
    }

    // The audience is the triple {semester, section, groupLabel}. Two entries
    // only clash if all three match — which is what leaves split lab batches
    // free to share a slot.
    const sameAudience =
      String(clash.semester) === String(candidate.semester) &&
      clash.section === candidate.section &&
      clash.groupLabel === candidate.groupLabel;

    if (sameAudience) {
      const group =
        candidate.groupLabel && candidate.groupLabel !== DEFAULT_GROUP_LABEL
          ? ` (${candidate.groupLabel})`
          : "";

      // Same course → the more specific message. Different course → the general
      // one. Only ever one of the two, so the user sees one clear reason.
      conflicts.push(
        String(clash.course?._id) === String(candidate.course)
          ? {
              rule: RULES.DUPLICATE_COURSE,
              field: "course",
              message: `${courseCode} is already scheduled for section ${candidate.section}${group} on ${when(clash)}.`,
              conflictWith: clash._id,
            }
          : {
              rule: RULES.SECTION_BUSY,
              field: "timeSlot",
              message: `Section ${candidate.section}${group} already has ${courseCode} on ${when(clash)}.`,
              conflictWith: clash._id,
            }
      );
    }
  }

  return dedupe(conflicts);
}

/**
 * Collapse repeats.
 *
 * One existing entry can match several arms of the $or — the same teacher AND
 * the same room, say — and the same (rule, other entry) pair must be reported
 * once, not once per arm.
 */
function dedupe(conflicts) {
  const seen = new Set();
  return conflicts.filter((c) => {
    const key = `${c.rule}|${c.conflictWith}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Advisory checks that do NOT block a save.
 *
 * These are judgement calls, not invariants: a head of department may have a
 * good reason to override a teacher's stated preference or seat 62 students in a
 * room built for 60. Reporting them as warnings respects that while still
 * surfacing the information.
 */
async function findWarnings(candidate, excludeId = null) {
  const warnings = [];

  const [teacher, room, slot, course] = await Promise.all([
    Teacher.findById(candidate.teacher).select("fullName maxWeeklyClasses unavailableSlots").lean(),
    Room.findById(candidate.room).select("code capacity type").lean(),
    TimeSlot.findById(candidate.timeSlot).select("label isBreak").lean(),
    candidate.course
      ? Course.findById(candidate.course).select("code type weeklyClasses").lean()
      : null,
  ]);

  // Scheduling over a declared break.
  if (slot?.isBreak) {
    warnings.push({
      rule: WARNINGS.BREAK_SLOT,
      field: "timeSlot",
      message: `${slot.label} is marked as a break. Scheduling a class here is unusual.`,
    });
  }

  // The teacher said they are not available then.
  if (teacher?.unavailableSlots?.length) {
    const clash = teacher.unavailableSlots.find(
      (u) => u.day === candidate.day && String(u.timeSlot) === String(candidate.timeSlot)
    );
    if (clash) {
      warnings.push({
        rule: WARNINGS.TEACHER_UNAVAILABLE,
        field: "teacher",
        message:
          `${teacher.fullName} has marked ${candidate.day} ${slot?.label || ""} as unavailable` +
          (clash.reason ? ` (${clash.reason}).` : "."),
      });
    }
  }

  // Weekly teaching load.
  if (teacher?.maxWeeklyClasses) {
    const filter = {
      teacher: candidate.teacher,
      sessionKey: candidate.sessionKey,
      isDeleted: false,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    };
    const current = await RoutineEntry.countDocuments(filter);
    if (current + 1 > teacher.maxWeeklyClasses) {
      warnings.push({
        rule: WARNINGS.TEACHER_OVERLOADED,
        field: "teacher",
        message:
          `This would give ${teacher.fullName} ${current + 1} classes this term, ` +
          `above their limit of ${teacher.maxWeeklyClasses}.`,
      });
    }
  }

  // Room capacity against the actual size of the section.
  if (room?.capacity && candidate.semester && candidate.section) {
    const headcount = await Student.countDocuments({
      semester: candidate.semester,
      section: candidate.section,
      status: "active",
      isDeleted: false,
    });
    if (headcount > room.capacity) {
      warnings.push({
        rule: WARNINGS.ROOM_TOO_SMALL,
        field: "room",
        message: `Section ${candidate.section} has ${headcount} students but room ${room.code} seats ${room.capacity}.`,
      });
    }
  }

  // A lab course in a room that is not a lab.
  if (course?.type === "Lab" && room?.type && room.type !== "Lab") {
    warnings.push({
      rule: WARNINGS.ROOM_TYPE_MISMATCH,
      field: "room",
      message: `${course.code} is a lab course but room ${room.code} is a ${room.type}.`,
    });
  }

  // More classes this week than the curriculum specifies.
  if (course?.weeklyClasses) {
    const filter = {
      course: candidate.course,
      semester: candidate.semester,
      section: candidate.section,
      groupLabel: candidate.groupLabel,
      sessionKey: candidate.sessionKey,
      isDeleted: false,
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    };
    const scheduled = await RoutineEntry.countDocuments(filter);
    if (scheduled + 1 > course.weeklyClasses) {
      warnings.push({
        rule: WARNINGS.COURSE_OVER_QUOTA,
        field: "course",
        message:
          `${course.code} would be scheduled ${scheduled + 1} times a week for section ` +
          `${candidate.section}, above its ${course.weeklyClasses} expected classes.`,
      });
    }
  }

  return warnings;
}

/** Both checks together — what the create/update path and the preview both use. */
async function check(candidate, excludeId = null) {
  const [conflicts, warnings] = await Promise.all([
    findConflicts(candidate, excludeId),
    findWarnings(candidate, excludeId),
  ]);
  return { conflicts, warnings, ok: conflicts.length === 0 };
}

module.exports = { findConflicts, findWarnings, check, RULES, WARNINGS };
