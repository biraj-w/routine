/**
 * Routine validation chains.
 */
const { body, param, query } = require("express-validator");
const { existsAndActive, paginationQuery, objectIdParam } = require("./common.validator");
const { DAYS, CLASS_TYPES } = require("../config/constants");

exports.list = paginationQuery;

exports.create = [
  body("semester")
    .isMongoId()
    .withMessage("A semester is required")
    .bail()
    .custom(existsAndActive("Semester")),
  body("title").optional().trim().isLength({ max: 150 })
    .withMessage("Title must be at most 150 characters"),
  body("effectiveFrom").optional({ nullable: true }).isISO8601()
    .withMessage("Effective date must be a valid date").toDate(),
];

exports.update = [
  body("title").optional().trim().isLength({ min: 1, max: 150 })
    .withMessage("Title must be between 1 and 150 characters"),
  body("effectiveFrom").optional({ nullable: true }).isISO8601()
    .withMessage("Effective date must be a valid date").toDate(),
];

/**
 * Fields of a routine entry.
 *
 * sessionKey, department and semester are deliberately absent: they are copied
 * from the parent routine by routine.service.js. Accepting them would let a
 * caller claim a different academic session and thereby escape conflict
 * detection entirely, since sessionKey is the first key of every conflict index.
 */
const entryFields = (optional) => {
  const opt = (chain) => (optional ? chain.optional() : chain);
  return [
    opt(body("section").isString().bail().trim().toUpperCase().isLength({ min: 1, max: 5 })
      .withMessage("Section is required")),
    body("groupLabel").optional().trim().toUpperCase().isLength({ max: 5 })
      .withMessage("Group label must be at most 5 characters"),
    opt(body("day").isIn(DAYS).withMessage(`Day must be one of: ${DAYS.join(", ")}`)),
    opt(body("timeSlot").isMongoId().withMessage("A time slot is required")
      .bail().custom(existsAndActive("TimeSlot"))),
    opt(body("course").isMongoId().withMessage("A course is required")
      .bail().custom(existsAndActive("Course"))),
    opt(body("teacher").isMongoId().withMessage("A teacher is required")
      .bail().custom(existsAndActive("Teacher"))),
    opt(body("room").isMongoId().withMessage("A room is required")
      .bail().custom(existsAndActive("Room"))),
    body("classType").optional().isIn(CLASS_TYPES)
      .withMessage(`Class type must be one of: ${CLASS_TYPES.join(", ")}`),
    body("note").optional().trim().isLength({ max: 200 })
      .withMessage("Note must be at most 200 characters"),
  ];
};

exports.createEntry = entryFields(false);
exports.updateEntry = entryFields(true);

/**
 * The dry-run check. Every field optional, since the UI calls this while the
 * form is still being filled in — a partial candidate should report what it can
 * rather than 422.
 */
exports.checkConflicts = [
  ...entryFields(true),
  body("excludeEntryId").optional().isMongoId()
    .withMessage("excludeEntryId must be a valid id"),
];

exports.reject = [
  body("reason").optional().trim().isLength({ max: 500 })
    .withMessage("Reason must be at most 500 characters"),
];

exports.search = [
  ...paginationQuery,
  query("day").optional().isIn(DAYS).withMessage(`Day must be one of: ${DAYS.join(", ")}`),
  query("teacher").optional().isMongoId().withMessage("teacher must be a valid id"),
  query("room").optional().isMongoId().withMessage("room must be a valid id"),
  query("course").optional().isMongoId().withMessage("course must be a valid id"),
  query("department").optional().isMongoId().withMessage("department must be a valid id"),
  query("semester").optional().isMongoId().withMessage("semester must be a valid id"),
  query("section").optional().isString().trim().toUpperCase().isLength({ max: 5 }),
];

exports.entryParam = [objectIdParam("id"), objectIdParam("entryId")];
