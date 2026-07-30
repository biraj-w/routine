/**
 * Department scoping — WHICH ROWS a caller may act on.
 *
 * authorize() answers "may this user manage courses at all?". This file answers
 * "which department's courses?". Keeping them separate is what lets the same
 * controller serve a Super Admin and a Department Admin with no branching.
 *
 * Everything here is driven by `role.dataScope` (global | department | self), so
 * adding a role later needs no controller changes. There is deliberately no
 * `if (roleName === 'Department Admin')` anywhere in the codebase.
 *
 * ── Four pieces, because there are four distinct ways to leak ───────────────
 *
 *   withScope()               reads   — narrows list/detail queries
 *   enforceScope(Model)       reads/writes on /:id — verifies ownership
 *   injectScope()             writes  — overwrites client-supplied department
 *   assertReferencesInScope() writes  — validates FOREIGN KEYS in the body
 *
 * The fourth is the one that is usually missed. A department admin's own
 * `department` field can be forced correctly while the `teacher` they reference
 * still belongs to someone else's department. Getting three of the four right
 * still leaves the system exploitable.
 * ──────────────────────────────────────────────────────────────────────────
 */
const mongoose = require("mongoose");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { DATA_SCOPES } = require("../config/roles");
const { ERROR_CODES } = require("../config/constants");

/* ────────────────────────────────────────────────────────────────────────────
 * 1. withScope — narrow read queries
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Sets `req.scopeFilter`, a filter fragment controllers merge into every query:
 *
 *     const filter = { ...listFilter, ...req.scopeFilter };
 *
 * @param {Object}  opts
 * @param {string}  opts.field           document field holding the department
 * @param {boolean} opts.allowGlobalNull also match rows with department: null
 *                                       (shared resources such as central rooms)
 */
function withScope({ field = "department", allowGlobalNull = false } = {}) {
  return function applyScope(req, res, next) {
    if (!req.auth) return next(ApiError.unauthorized("Not authenticated"));

    const { dataScope, departmentId } = req.auth;

    if (dataScope === DATA_SCOPES.GLOBAL) {
      req.scopeFilter = {};
      return next();
    }

    if (!departmentId) {
      // A department-bound account with no department cannot be scoped safely,
      // so it is denied rather than silently given global reach.
      return next(
        ApiError.forbidden(
          "Your account is not assigned to a department. Contact an administrator.",
          ERROR_CODES.OUT_OF_SCOPE
        )
      );
    }

    req.scopeFilter = allowGlobalNull
      ? { $or: [{ [field]: departmentId }, { [field]: null }] }
      : { [field]: departmentId };

    return next();
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 2. enforceScope — ownership check for /:id routes
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Loads the document once, rejects it if out of scope, and attaches it to the
 * request so the controller does not fetch it again.
 *
 * Returns 403 with an explicit message rather than 404. A 404 would hide the
 * record's existence, which is marginally more secure, but department
 * membership is not secret here and a clear boundary message is far easier to
 * demonstrate and debug. The trade-off is documented in docs/architecture.md.
 */
function enforceScope(Model, {
  param = "id",
  field = "department",
  attachAs = "doc",
  allowGlobalNull = false,
} = {}) {
  return asyncHandler(async (req, res, next) => {
    if (!req.auth) throw ApiError.unauthorized("Not authenticated");

    const id = req.params[param];
    if (!mongoose.isValidObjectId(id)) {
      throw ApiError.badRequest(`"${id}" is not a valid id`, "INVALID_ID");
    }

    const doc = await Model.findById(id);
    if (!doc) throw ApiError.notFound(`${Model.modelName} not found`);

    if (req.auth.dataScope !== DATA_SCOPES.GLOBAL) {
      const owner = doc[field];
      const isShared = allowGlobalNull && (owner === null || owner === undefined);
      if (!isShared && String(owner) !== String(req.auth.departmentId)) {
        throw ApiError.forbidden(
          `This ${Model.modelName.toLowerCase()} belongs to another department.`,
          ERROR_CODES.OUT_OF_SCOPE
        );
      }
    }

    req[attachAs] = doc;
    next();
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * 3. injectScope — force the department on writes
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Overwrites the listed body fields with the caller's own department, so a
 * department-scoped user cannot create or move a record into another department
 * by posting a different id. The value is REPLACED, not validated — there is
 * nothing to negotiate.
 *
 * Also stamps the audit fields centrally, so no controller can forget them.
 */
function injectScope({ fields = ["department"] } = {}) {
  return function applyWriteScope(req, res, next) {
    if (!req.auth) return next(ApiError.unauthorized("Not authenticated"));

    if (req.auth.dataScope === DATA_SCOPES.DEPARTMENT) {
      if (!req.auth.departmentId) {
        return next(
          ApiError.forbidden(
            "Your account is not assigned to a department.",
            ERROR_CODES.OUT_OF_SCOPE
          )
        );
      }
      for (const field of fields) req.body[field] = req.auth.departmentId;
    }

    // Audit fields are never accepted from a client.
    if (req.method === "POST") req.body.createdBy = req.auth.userId;
    req.body.updatedBy = req.auth.userId;
    delete req.body.isDeleted;
    delete req.body.deletedAt;
    delete req.body.deletedBy;

    return next();
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * 4. assertReferencesInScope — validate foreign keys
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Verify that every referenced document belongs to the caller's department.
 *
 * This is the leak that injectScope alone does not close: a department admin's
 * own `department` field can be forced correctly while the `teacher`, `course`
 * or `room` they point at belongs to a different department.
 *
 * Called from services rather than as route middleware, because the set of
 * references depends on what is actually present in the payload.
 *
 * @param {Object} auth  req.auth
 * @param {Array<{model: string, id: any, allowGlobalNull?: boolean, label?: string}>} refs
 */
async function assertReferencesInScope(auth, refs) {
  if (!auth) throw ApiError.unauthorized("Not authenticated");
  if (auth.dataScope === DATA_SCOPES.GLOBAL) return;

  for (const ref of refs) {
    if (!ref.id) continue;

    const Model = mongoose.model(ref.model);
    const doc = await Model.findById(ref.id).select("department").lean();
    const label = ref.label || ref.model.toLowerCase();

    if (!doc) throw ApiError.badRequest(`No such ${label}: ${ref.id}`);

    const isShared = ref.allowGlobalNull && (doc.department === null || doc.department === undefined);
    if (!isShared && String(doc.department) !== String(auth.departmentId)) {
      throw ApiError.forbidden(
        `That ${label} belongs to another department.`,
        ERROR_CODES.OUT_OF_SCOPE
      );
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/** True when the caller sees every department. */
function isGlobalScope(req) {
  return req.auth?.dataScope === DATA_SCOPES.GLOBAL;
}

/** True when the caller only ever sees their own records (Teacher / Student). */
function isSelfScope(req) {
  return req.auth?.dataScope === DATA_SCOPES.SELF;
}

/**
 * Merge the scope filter into a query filter. Trivial, but using it everywhere
 * makes "did this endpoint apply scoping?" a one-word grep.
 */
function scoped(req, filter = {}) {
  return { ...filter, ...(req.scopeFilter || {}) };
}

module.exports = {
  withScope,
  enforceScope,
  injectScope,
  assertReferencesInScope,
  isGlobalScope,
  isSelfScope,
  scoped,
};
