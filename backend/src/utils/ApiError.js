/**
 * Operational error carrying an HTTP status, a machine-readable code and
 * optional field-level detail.
 *
 * `isOperational` distinguishes errors we anticipated (a validation failure, a
 * missing record) from genuine bugs. The error handler shows the former to the
 * client verbatim and hides the latter behind a generic 500 in production.
 *
 * Status code policy used throughout this project:
 *   400  malformed request (bad ObjectId, unparseable JSON)
 *   401  not authenticated (missing / invalid / expired token, revoked session)
 *   403  authenticated but not permitted (missing permission, out of scope)
 *   404  resource does not exist
 *   409  conflict (routine clash, duplicate key, illegal state transition,
 *        delete blocked by references)
 *   422  request was well-formed but failed field validation
 *   429  rate limited
 *   500  unexpected
 */
const { ERROR_CODES } = require("../config/constants");

const DEFAULT_CODES = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: ERROR_CODES.NOT_FOUND,
  409: "CONFLICT",
  422: ERROR_CODES.VALIDATION_ERROR,
  429: ERROR_CODES.RATE_LIMITED,
  500: ERROR_CODES.INTERNAL_ERROR,
};

class ApiError extends Error {
  /**
   * @param {number} statusCode
   * @param {string} message   shown to the client
   * @param {string} [code]    machine-readable, for frontend branching
   * @param {Array}  [errors]  field errors, or the conflict list
   */
  constructor(statusCode, message, code = null, errors = null) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code || DEFAULT_CODES[statusCode] || "ERROR";
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message, code, errors) {
    return new ApiError(400, message, code, errors);
  }

  static unauthorized(message = "Authentication required", code) {
    return new ApiError(401, message, code);
  }

  static forbidden(message = "You do not have permission to do that", code) {
    return new ApiError(403, message, code);
  }

  static notFound(message = "Resource not found") {
    return new ApiError(404, message, ERROR_CODES.NOT_FOUND);
  }

  static conflict(message, code, errors) {
    return new ApiError(409, message, code, errors);
  }

  static validation(message = "Validation failed", errors) {
    return new ApiError(422, message, ERROR_CODES.VALIDATION_ERROR, errors);
  }

  static tooMany(message = "Too many requests, please try again later") {
    return new ApiError(429, message, ERROR_CODES.RATE_LIMITED);
  }

  static internal(message = "Internal server error") {
    return new ApiError(500, message, ERROR_CODES.INTERNAL_ERROR);
  }
}

module.exports = ApiError;
