/**
 * Validation chains for the factory-driven master-data resources:
 * semester, course, room and time slot.
 *
 * Grouped in one file because they are short and always read together; the
 * larger hand-written resources keep their own validator files.
 */
const { body } = require("express-validator");
const {
  requiredString,
  optionalRef,
  optionalDate,
  existsAndActive,
  paginationQuery,
} = require("./common.validator");
const { TERMS, ROOM_TYPES, COURSE_TYPES } = require("../config/constants");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/* ── Semester ────────────────────────────────────────────────────────────── */

const semesterFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    // department is force-set by injectScope for department admins, so it is
    // only required from a Super Admin — hence optional with an existence check.
    optionalRef("department", "Department"),
    opt(body("number").isInt({ min: 1, max: 12 })
      .withMessage("Semester number must be between 1 and 12").toInt()),
    opt(body("academicYear").matches(/^\d{4}-\d{4}$/)
      .withMessage('Academic year must look like "2025-2026"')),
    opt(body("term").isIn(TERMS).withMessage(`Term must be one of: ${TERMS.join(", ")}`)),
    body("sections").optional().isArray({ min: 1 })
      .withMessage("At least one section is required"),
    body("sections.*").optional().isString().trim().isLength({ min: 1, max: 5 })
      .withMessage("Each section label must be 1–5 characters"),
    // optionalDate, not optional({nullable:true}): a blank date input posts "",
    // which the latter treats as an invalid date rather than as "no date".
    optionalDate("startDate", "Start date"),
    optionalDate("endDate", "End date"),
    body("isActive").optional().isBoolean().toBoolean(),
  ];
};

exports.semester = {
  list: paginationQuery,
  create: semesterFields(false),
  update: semesterFields(true),
};

/* ── Course ──────────────────────────────────────────────────────────────── */

const courseFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    opt(body("code").isString().bail().trim().toUpperCase().isLength({ min: 3, max: 15 })
      .withMessage("Course code must be between 3 and 15 characters")),
    opt(body("title").isString().bail().trim().isLength({ min: 3, max: 150 })
      .withMessage("Course title must be between 3 and 150 characters")),
    optionalRef("department", "Department"),
    opt(body("semesterNumber").isInt({ min: 1, max: 12 })
      .withMessage("Semester level must be between 1 and 12").toInt()),
    opt(body("credits").isFloat({ min: 0, max: 6 })
      .withMessage("Credits must be between 0 and 6").toFloat()),
    body("type").optional().isIn(COURSE_TYPES)
      .withMessage(`Course type must be one of: ${COURSE_TYPES.join(", ")}`),
    body("weeklyClasses").optional().isInt({ min: 1, max: 10 })
      .withMessage("Weekly classes must be between 1 and 10").toInt(),
    body("description").optional().trim().isLength({ max: 500 }),
    body("isActive").optional().isBoolean().toBoolean(),
  ];
};

exports.course = {
  list: paginationQuery,
  create: courseFields(false),
  update: courseFields(true),
};

/* ── Room ────────────────────────────────────────────────────────────────── */

const roomFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    opt(body("code").isString().bail().trim().toUpperCase().isLength({ min: 2, max: 20 })
      .withMessage("Room code must be between 2 and 20 characters")),
    body("name").optional().trim().isLength({ max: 100 }),
    opt(body("building").isString().bail().trim().isLength({ min: 1, max: 60 })
      .withMessage("Building is required")),
    body("floor").optional().isInt({ min: -2, max: 50 })
      .withMessage("Floor must be between -2 and 50").toInt(),
    opt(body("capacity").isInt({ min: 1, max: 1000 })
      .withMessage("Capacity must be between 1 and 1000").toInt()),
    opt(body("type").isIn(ROOM_TYPES)
      .withMessage(`Room type must be one of: ${ROOM_TYPES.join(", ")}`)),
    // Explicitly nullable: null means a shared, institution-wide room.
    body("department").optional({ nullable: true }).custom(async (value) => {
      if (value === null || value === "" || value === undefined) return true;
      return existsAndActive("Department")(value);
    }),
    body("hasProjector").optional().isBoolean().toBoolean(),
    body("isActive").optional().isBoolean().toBoolean(),
  ];
};

exports.room = {
  list: paginationQuery,
  create: roomFields(false),
  update: roomFields(true),
};

/* ── Time slot ───────────────────────────────────────────────────────────── */

const timeSlotFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    body("label").optional().trim().isLength({ max: 30 }),
    opt(body("startTime").matches(HHMM)
      .withMessage("Start time must be in 24-hour HH:mm format")),
    opt(body("endTime").matches(HHMM)
      .withMessage("End time must be in 24-hour HH:mm format")),
    opt(body("order").isInt({ min: 1, max: 50 })
      .withMessage("Order must be between 1 and 50").toInt()),
    body("isBreak").optional().isBoolean().toBoolean(),
    body("isActive").optional().isBoolean().toBoolean(),
  ];
};

exports.timeSlot = {
  list: paginationQuery,
  create: timeSlotFields(false),
  update: timeSlotFields(true),
};
