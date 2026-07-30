/**
 * Department validation chains.
 */
const { body } = require("express-validator");
const { requiredString, optionalRef, paginationQuery } = require("./common.validator");

exports.list = paginationQuery;

exports.create = [
  requiredString("name", { min: 2, max: 120, label: "Department name" }),
  body("code")
    .isString()
    .withMessage("Department code is required")
    .bail()
    .trim()
    .toUpperCase()
    .isLength({ min: 2, max: 10 })
    .withMessage("Department code must be between 2 and 10 characters")
    .matches(/^[A-Z0-9]+$/)
    .withMessage("Department code may contain only letters and digits"),
  body("description").optional().trim().isLength({ max: 500 })
    .withMessage("Description must be at most 500 characters"),
  optionalRef("headTeacher", "Teacher"),
  body("isActive").optional().isBoolean().withMessage("isActive must be true or false").toBoolean(),
];

/** Update: every field optional, but the same rules when present. */
exports.update = [
  body("name").optional().trim().isLength({ min: 2, max: 120 })
    .withMessage("Department name must be between 2 and 120 characters"),
  body("code")
    .optional()
    .trim()
    .toUpperCase()
    .isLength({ min: 2, max: 10 })
    .withMessage("Department code must be between 2 and 10 characters")
    .matches(/^[A-Z0-9]+$/)
    .withMessage("Department code may contain only letters and digits"),
  body("description").optional().trim().isLength({ max: 500 }),
  optionalRef("headTeacher", "Teacher"),
  body("isActive").optional().isBoolean().toBoolean(),
];
