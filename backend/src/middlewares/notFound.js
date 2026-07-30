/**
 * Catch-all for unmatched /api routes.
 *
 * Mounted after every route but before the error handler, so an unknown
 * endpoint returns the standard error envelope rather than Express's default
 * HTML page — which would break the frontend's single JSON parsing path.
 */
const ApiError = require("../utils/ApiError");

function notFound(req, res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

module.exports = notFound;
