/**
 * Validation chains for teacher and student, whose bodies mix profile fields
 * with optional account-creation fields.
 */
const { body } = require("express-validator");
const { optionalRef, paginationQuery, existsAndActive } = require("./common.validator");
const { DESIGNATIONS, DAYS } = require("../config/constants");

/* ── Teacher ─────────────────────────────────────────────────────────────── */

const teacherFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    opt(body("employeeCode").isString().bail().trim().toUpperCase().isLength({ min: 2, max: 20 })
      .withMessage("Employee code must be between 2 and 20 characters")),
    opt(body("fullName").isString().bail().trim().isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters")),
    body("email").optional({ checkFalsy: true }).isEmail()
      .withMessage("Please provide a valid email address").bail().normalizeEmail({ gmail_remove_dots: false }),
    optionalRef("department", "Department"),
    body("designation").optional().isIn(DESIGNATIONS)
      .withMessage(`Designation must be one of: ${DESIGNATIONS.join(", ")}`),
    body("specialization").optional().isArray().withMessage("Specialization must be an array"),
    body("specialization.*").optional().isString().trim().isLength({ max: 60 }),
    body("maxWeeklyClasses").optional().isInt({ min: 1, max: 40 })
      .withMessage("Weekly class cap must be between 1 and 40").toInt(),
    body("contact.phone").optional().trim().isLength({ max: 20 }),
    body("contact.officeRoom").optional().trim().isLength({ max: 30 }),
    body("status").optional().isIn(["active", "on-leave", "inactive"])
      .withMessage("Status must be active, on-leave or inactive"),

    // Optional: supplying a password provisions a login account. An email is
    // required alongside it, since the email IS the username.
    body("password").optional().custom((value, { req }) => {
      if (!value) return true;
      if (!req.body.email) throw new Error("An email address is required to create a login account");
      return true;
    }),
  ];
};

exports.teacher = {
  list: paginationQuery,
  create: [
    ...teacherFields(false),
    body("password").optional({ checkFalsy: true }).isLength({ min: 8, max: 72 })
      .withMessage("Password must be between 8 and 72 characters"),
  ],
  update: teacherFields(true),
  availability: [
    body("unavailableSlots").isArray().withMessage("unavailableSlots must be an array"),
    body("unavailableSlots.*.day").isIn(DAYS).withMessage(`Day must be one of: ${DAYS.join(", ")}`),
    body("unavailableSlots.*.timeSlot").isMongoId().bail().custom(existsAndActive("TimeSlot")),
    body("unavailableSlots.*.reason").optional().trim().isLength({ max: 100 }),
  ],
};

/* ── Student ─────────────────────────────────────────────────────────────── */

const studentFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    opt(body("rollNo").isString().bail().trim().toUpperCase().isLength({ min: 2, max: 25 })
      .withMessage("Roll number must be between 2 and 25 characters")),
    opt(body("fullName").isString().bail().trim().isLength({ min: 2, max: 100 })
      .withMessage("Name must be between 2 and 100 characters")),
    body("email").optional({ checkFalsy: true }).isEmail()
      .withMessage("Please provide a valid email address").bail().normalizeEmail({ gmail_remove_dots: false }),
    optionalRef("department", "Department"),
    opt(body("semester").isMongoId().withMessage("A semester is required")
      .bail().custom(existsAndActive("Semester"))),
    opt(body("section").isString().bail().trim().toUpperCase().isLength({ min: 1, max: 5 })
      .withMessage("Section must be between 1 and 5 characters")),
    body("groupLabel").optional().trim().toUpperCase().isLength({ max: 5 })
      .withMessage("Group label must be at most 5 characters"),
    body("batchYear").optional({ nullable: true }).isInt({ min: 1900, max: 2200 })
      .withMessage("Batch year is out of range").toInt(),
    body("admissionDate").optional({ nullable: true }).isISO8601()
      .withMessage("Admission date must be a valid date").toDate(),
    body("contactPhone").optional().trim().isLength({ max: 20 }),
    body("status").optional().isIn(["active", "graduated", "suspended", "inactive"])
      .withMessage("Status must be active, graduated, suspended or inactive"),
    body("password").optional().custom((value, { req }) => {
      if (!value) return true;
      if (!req.body.email) throw new Error("An email address is required to create a login account");
      return true;
    }),
  ];
};

exports.student = {
  list: paginationQuery,
  create: [
    ...studentFields(false),
    body("password").optional({ checkFalsy: true }).isLength({ min: 8, max: 72 })
      .withMessage("Password must be between 8 and 72 characters"),
  ],
  update: studentFields(true),
};
