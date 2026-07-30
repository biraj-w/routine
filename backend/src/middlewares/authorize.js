/**
 * Authorization: does this caller hold the required permission?
 *
 * Checks PERMISSION STRINGS, never role names. `authorize('Publish Routine')`
 * keeps working if the permission is later granted to a new role, whereas
 * `if (role === 'Super Admin')` would have to be hunted down across the
 * codebase. Roles are configuration; permissions are the contract.
 *
 * Default semantics are ANY-OF, because almost every route names exactly one
 * permission and the remaining cases read naturally:
 *
 *   authorize(P.MANAGE_ROUTINE)
 *   authorize(P.VIEW_ROUTINE, P.VIEW_OWN_ROUTINE)   // either will do
 *   authorize.all(P.MANAGE_ROUTINE, P.APPROVE_ROUTINE)
 *
 * This decides WHAT the caller may do. WHICH ROWS they may do it to is a
 * separate concern, handled by middlewares/scope.js.
 */
const ApiError = require("../utils/ApiError");
const { ERROR_CODES } = require("../config/constants");

/** Caller needs at least one of the listed permissions. */
function authorize(...required) {
  if (!required.length) {
    throw new Error("authorize() called with no permissions — this is a programming error");
  }

  return function authorizeAny(req, res, next) {
    if (!req.auth) {
      return next(ApiError.unauthorized("Not authenticated", ERROR_CODES.TOKEN_MISSING));
    }
    const granted = required.some((permission) => req.auth.permissions.has(permission));
    if (!granted) {
      return next(
        ApiError.forbidden(
          `Access denied. This action requires: ${required.join(" or ")}.`,
          ERROR_CODES.NO_PERMISSION
        )
      );
    }
    return next();
  };
}

/** Caller needs every listed permission. */
authorize.all = function authorizeAll(...required) {
  return function authorizeEvery(req, res, next) {
    if (!req.auth) {
      return next(ApiError.unauthorized("Not authenticated", ERROR_CODES.TOKEN_MISSING));
    }
    const missing = required.filter((permission) => !req.auth.permissions.has(permission));
    if (missing.length) {
      return next(
        ApiError.forbidden(
          `Access denied. Missing permission(s): ${missing.join(", ")}.`,
          ERROR_CODES.NO_PERMISSION
        )
      );
    }
    return next();
  };
};

/**
 * Programmatic check for use inside a controller, where the decision depends on
 * the data rather than the route — e.g. "show all statuses if the caller may
 * view any routine, otherwise only published ones".
 */
authorize.has = function has(req, permission) {
  return Boolean(req.auth?.permissions?.has(permission));
};

module.exports = authorize;
