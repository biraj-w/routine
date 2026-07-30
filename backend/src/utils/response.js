/**
 * The response envelope.
 *
 * Every response this API produces — success or failure — has the same top-level
 * shape, so the frontend needs exactly one parsing path
 * (see frontend/js/core/api.js):
 *
 *   success: { success: true,  message, data, meta? }
 *   failure: { success: false, message, code, errors? }
 *
 * `meta` appears only on paginated collections. `errors` carries field-level
 * validation detail or the routine-conflict list.
 *
 * This shape is frozen: everything downstream depends on it.
 */

/**
 * Guarantee every object in a response carries `id` alongside `_id`.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The toJSON plugin adds a friendly `id` to Mongoose documents, but list
 * endpoints use `.lean()` for speed — and `.lean()` returns plain objects
 * straight from the driver, so the plugin never runs. The result was an API
 * where `GET /courses/:id` returned `id` while `GET /courses` did not, and
 * nested populated references (`course.department`) never did.
 *
 * Any consumer that read `.id` therefore got `undefined` from a list, which is
 * the kind of inconsistency that produces confusing downstream bugs rather than
 * clean failures. Normalising here — the single point every response passes
 * through — keeps the contract uniform without giving up `.lean()`.
 *
 * `_id` is retained as well, so nothing that already relies on it breaks.
 */
function withIds(value) {
  if (Array.isArray(value)) return value.map(withIds);
  if (!value || typeof value !== "object") return value;

  // Dates, ObjectIds and Mongoose documents all define toJSON. Converting first
  // means this walks the same shape res.json() would ultimately serialise.
  if (typeof value.toJSON === "function") {
    const plain = value.toJSON();
    // ObjectId and Date serialise to primitives — nothing further to do.
    if (!plain || typeof plain !== "object") return plain;
    return withIds(plain);
  }

  const out = {};
  if (value._id !== undefined && value.id === undefined) out.id = String(value._id);
  for (const [key, val] of Object.entries(value)) out[key] = withIds(val);
  return out;
}

/** 2xx with a single object, an array, or null. */
function success(res, { data = null, message = "Success", status = 200, meta = null } = {}) {
  const body = { success: true, message, data: withIds(data) };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

/** 201 for a freshly created resource. */
function created(res, data, message = "Created successfully") {
  return success(res, { data, message, status: 201 });
}

/**
 * A paginated list. `meta` is computed here so no controller does pagination
 * arithmetic — a common source of off-by-one bugs on the last page.
 */
function paginated(res, items, { page, limit, total }, message = "Fetched successfully") {
  return success(res, {
    data: items,
    message,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}

/** 204, for deletes with nothing meaningful to return. */
function noContent(res) {
  return res.status(204).send();
}

/**
 * Error envelope. Normally reached via `next(ApiError...)` and the central
 * error handler rather than called directly.
 */
function error(res, { status = 500, message = "Something went wrong", code, errors = null }) {
  const body = { success: false, message, code };
  if (errors) body.errors = errors;
  return res.status(status).json(body);
}

module.exports = { success, created, paginated, noContent, error, withIds };
