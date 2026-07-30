/**
 * Validation building blocks reused across modules.
 */
const { body, param, query } = require("express-validator");
const mongoose = require("mongoose");

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
  query("limit")
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100")
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
  passwordRules,
  emailRules,
  requiredString,
};
