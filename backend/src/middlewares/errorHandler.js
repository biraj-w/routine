/**
 * Centralised error handler — the LAST middleware registered in app.js.
 *
 * Every error in the application converges here, which is why no controller
 * needs a try/catch (see utils/asyncHandler.js). Its job is to translate
 * whatever was thrown into the standard error envelope:
 *
 *   { success: false, message, code, errors? }
 *
 * Translations handled:
 *   ApiError                  → its own status / code / errors
 *   Mongoose ValidationError  → 422 with per-field messages
 *   Mongoose CastError        → 400 "invalid value for <field>"
 *   Mongo E11000 duplicate    → 409, looked up BY INDEX NAME so the message
 *                               names the actual rule that was violated
 *   JWT errors                → 401 with a code the frontend branches on
 *   Body-parser failures      → 400
 *
 * Anything unrecognised is a 500. In production its message is replaced with a
 * generic string so internal details never reach the client.
 */
const config = require("../config/env");
const { ERROR_CODES } = require("../config/constants");
const logger = require("../utils/logger");

/**
 * Friendly messages keyed by index name. The routine indexes are named
 * explicitly in the RoutineEntry schema precisely so this mapping is stable —
 * parsing field lists out of Mongo's error text is not.
 */
const INDEX_MESSAGES = {
  uniq_teacher_slot: "That teacher is already teaching another class in this time slot.",
  uniq_room_slot: "That room is already booked in this time slot.",
  uniq_section_slot: "That section already has a class in this time slot.",
  uniq_routine_session: "A routine already exists for this department, semester and term.",
  uniq_semester_instance: "That semester already exists for this department, year and term.",
  uniq_course_code_per_dept: "A course with that code already exists in this department.",
  uniq_timeslot_order: "Another time slot already uses that display order.",
  uniq_timeslot_range: "A time slot with that start and end time already exists.",
  uniq_teacher_user: "That user account is already linked to another teacher.",
  uniq_student_user: "That user account is already linked to another student.",
};

/** Best-effort extraction of the violated index name from a duplicate-key error. */
function duplicateKeyMessage(err) {
  const indexName = err.errmsg?.match(/index:\s*([\w.$]+)/)?.[1];
  if (indexName && INDEX_MESSAGES[indexName]) return INDEX_MESSAGES[indexName];

  const fields = Object.keys(err.keyPattern || err.keyValue || {});
  if (fields.length) {
    const values = fields.map((f) => `${f} "${err.keyValue?.[f]}"`).join(", ");
    return `Already exists: ${values}`;
  }
  return "That record already exists.";
}

/* eslint-disable-next-line no-unused-vars -- Express identifies an error handler by arity (4 args) */
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message;
  let code = err.code;
  let errors = err.errors || null;

  // ── Mongoose schema validation ──────────────────────────────────────────
  if (err.name === "ValidationError" && err.errors) {
    statusCode = 422;
    code = ERROR_CODES.VALIDATION_ERROR;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
  }

  // ── Unparseable ObjectId (or other cast failure) ────────────────────────
  else if (err.name === "CastError") {
    statusCode = 400;
    code = "INVALID_ID";
    message = `Invalid value for "${err.path}": ${err.value}`;
  }

  // ── Unique-index violation ──────────────────────────────────────────────
  else if (err.code === 11000 || err.code === 11001) {
    statusCode = 409;
    code = ERROR_CODES.DUPLICATE_KEY;
    message = duplicateKeyMessage(err);
  }

  // ── JWT ─────────────────────────────────────────────────────────────────
  else if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_EXPIRED; // the frontend refreshes on this code
    message = "Access token expired";
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = ERROR_CODES.TOKEN_INVALID;
    message = "Invalid access token";
  }

  // ── Malformed JSON body ─────────────────────────────────────────────────
  else if (err.type === "entity.parse.failed") {
    statusCode = 400;
    code = "MALFORMED_JSON";
    message = "Request body is not valid JSON";
  } else if (err.type === "entity.too.large") {
    statusCode = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large";
  }

  // Server-side faults are logged in full; client faults are not worth the noise.
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} → ${statusCode}`, err.stack || err.message);
    if (config.isProduction) message = "Internal server error";
  }

  const body = {
    success: false,
    message: message || "Something went wrong",
    code: code || ERROR_CODES.INTERNAL_ERROR,
  };
  if (errors) body.errors = errors;
  // Stacks help while developing and leak internals in production.
  if (config.isDevelopment && statusCode >= 500) body.stack = err.stack;

  return res.status(statusCode).json(body);
}

module.exports = errorHandler;
module.exports.INDEX_MESSAGES = INDEX_MESSAGES;
