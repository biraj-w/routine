/**
 * Validation building blocks reused across modules.
 */
const { body, param, query } = require("express-validator");
const mongoose = require("mongoose");
const { MAX_LIMIT } = require("../utils/queryFeatures");

/** `:id` (or another param) must be a well-formed ObjectId. */
const objectIdParam = (name = "id") =>
  param(name).isMongoId().withMessage(`"${name}" must be a valid id`);

/**
 * Standard list-endpoint query parameters. `sort` is intentionally NOT validated
 * against a field list here — utils/queryFeatures.js whitelists it per endpoint,
 * which keeps the allowed set next to the data it applies to.
 */
const paginationQuery = [
  query("page").optional().isInt({ min: 1 }).withMessage("page must be a positive integer").toInt(),
  // The bound comes from MAX_LIMIT so this rule cannot drift from the clamp in
  // queryFeatures.buildListQuery(). When they disagreed, the request layer
  // rejected with 422 what the query layer would happily have clamped.
  query("limit")
    .optional()
    .isInt({ min: 1, max: MAX_LIMIT })
    .withMessage(`limit must be between 1 and ${MAX_LIMIT}`)
    .toInt(),
  query("search").optional().isString().trim().isLength({ max: 100 })
    .withMessage("search must be at most 100 characters"),
  query("sort").optional().isString().trim(),
];

/**
 * Custom validator factory: the referenced document must exist and not be
 * soft-deleted.
 *
 * Hand-written rather than pulled from a library — writing one `.custom()`
 * validator demonstrates the extension point, and existence is a rule no
 * built-in matcher can express.
 *
 *   body('teacher').isMongoId().bail().custom(existsAndActive('Teacher'))
 *
 * `.bail()` matters: without it the custom check would run on a malformed id
 * and produce a confusing cast error instead of "must be a valid id".
 */
const existsAndActive = (modelName, { field = null } = {}) =>
  async function checkExists(value) {
    if (!value) return true; // presence is a separate concern
    if (!mongoose.isValidObjectId(value)) throw new Error(`Invalid ${modelName.toLowerCase()} id`);

    const Model = mongoose.model(modelName);
    const doc = await Model.findById(value).select("_id isActive status").lean();
    if (!doc) throw new Error(`${modelName} not found`);

    if (field && doc[field] === false) throw new Error(`That ${modelName.toLowerCase()} is inactive`);
    return true;
  };

/** Optional reference: either absent/null, or a valid existing document. */
const optionalRef = (fieldName, modelName) =>
  body(fieldName)
    .optional({ nullable: true })
    .custom(async (value) => {
      if (value === null || value === "" || value === undefined) return true;
      return existsAndActive(modelName)(value);
    });

/**
 * Optional date that tolerates a blank form input.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * `<input type="date">` submits "" when empty, and UI.readForm() forwards that
 * as-is. `optional({ nullable: true })` skips only undefined and null, so ""
 * reached isISO8601() and failed — which made every OPTIONAL date effectively
 * REQUIRED: the Semester, Student and Routine forms could not be saved at all
 * unless every date was filled in.
 *
 * The sanitizer runs BEFORE the optional check, turning "" into an explicit
 * null. `optional({ values: "falsy" })` would also pass, but leaves "" in the
 * body and relies on Mongoose coercing it — null says "no date" unambiguously
 * and clears the field on update.
 *
 * Genuine garbage ("not-a-date") is still rejected.
 */
const optionalDate = (fieldName, label) =>
  body(fieldName)
    .customSanitizer((value) => (value === "" ? null : value))
    .optional({ nullable: true })
    .isISO8601()
    .withMessage(`${label || fieldName} must be a valid date`)
    .toDate();

/** A password strong enough to be worth hashing. */
const passwordRules = (fieldName = "password") =>
  body(fieldName)
    .isString()
    .isLength({ min: 8, max: 72 }) // 72 = bcrypt's own input limit
    .withMessage("Password must be between 8 and 72 characters")
    .matches(/[a-z]/)
    .withMessage("Password must contain a lowercase letter")
    .matches(/[A-Z]/)
    .withMessage("Password must contain an uppercase letter")
    .matches(/\d/)
    .withMessage("Password must contain a digit");

/** Normalised email. */
const emailRules = (fieldName = "email") =>
  body(fieldName)
    .isEmail()
    .withMessage("Please provide a valid email address")
    .bail()
    .normalizeEmail({ gmail_remove_dots: false })
    .isLength({ max: 150 })
    .withMessage("Email must be at most 150 characters");

/** Required trimmed string with a length window. */
const requiredString = (fieldName, { min = 1, max = 200, label } = {}) =>
  body(fieldName)
    .isString()
    .withMessage(`${label || fieldName} is required`)
    .bail()
    .trim()
    .isLength({ min, max })
    .withMessage(`${label || fieldName} must be between ${min} and ${max} characters`);

module.exports = {
  objectIdParam,
  paginationQuery,
  existsAndActive,
  optionalRef,
  optionalDate,
  passwordRules,
  emailRules,
  requiredString,
};
