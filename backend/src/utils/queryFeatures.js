/**
 * Pagination, filtering, searching and sorting for list endpoints.
 *
 * Written once here rather than eight times across the CRUD modules.
 *
 * ── Two security decisions worth understanding ─────────────────────────────
 *
 * 1. Filter keys are WHITELISTED, never spread from req.query.
 *    `Model.find({ ...req.query })` is a NoSQL operator-injection hole: a
 *    request like `?password[$ne]=` reaches Mongo as an operator object and
 *    matches every document. Only keys the endpoint explicitly declares are
 *    ever copied into the filter.
 *
 * 2. Search terms are REGEX-ESCAPED before `new RegExp()`.
 *    Raw user input in a regex is both a correctness bug (`a.b` matching
 *    "axb") and a denial-of-service vector — a pattern like `(a+)+$` makes the
 *    engine backtrack exponentially (ReDoS).
 * ──────────────────────────────────────────────────────────────────────────
 */

const DEFAULT_LIMIT = 10;

/**
 * Upper bound on `?limit=`.
 *
 * 200 rather than 100 because reference dropdowns fetch their whole option list
 * in one call (frontend/js/core/crud.js loadOptions, plus the routine builder,
 * reports and search pages) — a paginated <select> is not a thing. 100 made
 * every one of those requests fail.
 *
 * validators/common.validator.js derives its bound from this constant rather
 * than repeating the number: the two layers disagreeing is what caused the
 * failure in the first place. buildListQuery() clamps, the validator rejects, so
 * they MUST agree.
 */
const MAX_LIMIT = 200;

/** Neutralise every regex metacharacter in user input. */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Translate req.query into safe Mongo query options.
 *
 * @param {import('express').Request} req
 * @param {Object}   opts
 * @param {string[]} opts.searchFields   fields `?search=` matches against
 * @param {string[]} opts.allowedFilters query keys copied verbatim into the filter
 * @param {string[]} opts.allowedSorts   sortable field names (without the `-`)
 * @param {string}   opts.defaultSort
 * @returns {{filter: Object, sort: string, skip: number, limit: number, page: number}}
 */
function buildListQuery(req, {
  searchFields = [],
  allowedFilters = [],
  allowedSorts = [],
  defaultSort = "-createdAt",
  maxLimit = MAX_LIMIT,
} = {}) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));

  const filter = {};

  // (1) Whitelisted equality filters only.
  for (const key of allowedFilters) {
    const value = req.query[key];
    if (value === undefined || value === "" || value === null) continue;
    // Reject anything that isn't a primitive — an object here means someone is
    // trying to smuggle in a query operator.
    if (typeof value === "object") continue;
    if (value === "true") filter[key] = true;
    else if (value === "false") filter[key] = false;
    else filter[key] = value;
  }

  // (2) Escaped case-insensitive search across the declared fields.
  const term = typeof req.query.search === "string" ? req.query.search.trim() : "";
  if (term && searchFields.length) {
    const rx = new RegExp(escapeRegex(term), "i");
    filter.$or = searchFields.map((field) => ({ [field]: rx }));
  }

  // (3) Sort, also whitelisted — an arbitrary sort key can leak index
  //     information and lets a caller force expensive unindexed sorts.
  let sort = defaultSort;
  if (typeof req.query.sort === "string" && req.query.sort) {
    const requested = req.query.sort;
    const bare = requested.startsWith("-") ? requested.slice(1) : requested;
    if (allowedSorts.includes(bare)) sort = requested;
  }

  return { filter, sort, skip: (page - 1) * limit, limit, page };
}

/** Virtuals that must never be serialised, whatever a schema declares. */
const VIRTUAL_DENYLIST = new Set([
  "id", // utils/response.js withIds() already sets this
  "password", // a setter-only virtual on User; must not leave the API
]);

/**
 * Attach a model's virtual getters to plain objects from a `.lean()` query.
 *
 * ── Why this is needed ─────────────────────────────────────────────────────
 * The toJSON plugin sets `virtuals: true`, so a Mongoose DOCUMENT serialises
 * with its virtuals. `.lean()` returns plain driver objects and skips that
 * entirely — so `GET /semesters/:id` returned `label` while `GET /semesters`
 * did not. Every reference dropdown reads its option text from a LIST call, so
 * `labelKey: "label"` rendered "—" for Semester, Course, Room, Teacher and
 * Student (each of which defines `label` as a virtual). TimeSlot was unaffected
 * only because its `label` is a real field.
 *
 * This is the same lean-vs-document asymmetry that withIds() exists to paper
 * over for `id`; virtuals need the model, so they are resolved here where it is
 * in scope rather than in the response envelope.
 *
 * A getter that throws must not take the whole list down with it — a missing
 * label is a cosmetic problem, a 500 is not.
 */
function applyVirtuals(Model, docs) {
  const virtuals = Object.entries(Model.schema.virtuals).filter(
    ([name, v]) => !VIRTUAL_DENYLIST.has(name) && typeof v.getters?.[0] === "function"
  );
  if (!virtuals.length) return docs;

  for (const doc of docs) {
    if (!doc || typeof doc !== "object") continue;
    for (const [name, virtual] of virtuals) {
      if (doc[name] !== undefined) continue; // a real field of the same name wins
      try {
        doc[name] = virtual.applyGetters(undefined, doc);
      } catch {
        /* leave it absent */
      }
    }
  }
  return docs;
}

/**
 * Run a paginated find plus its matching count.
 *
 * The count uses the same filter, so `meta.total` always agrees with the rows.
 * Both queries are issued together rather than sequentially.
 */
async function paginate(Model, filter, { sort, skip, limit, page, populate = [], select } = {}) {
  const query = Model.find(filter).sort(sort).skip(skip).limit(limit).lean();
  if (select) query.select(select);
  for (const p of populate) query.populate(p);

  const [items, total] = await Promise.all([query, Model.countDocuments(filter)]);
  // Virtuals restored so a list row carries the same fields as a detail read.
  return { items: applyVirtuals(Model, items), meta: { page, limit, total } };
}

module.exports = { buildListQuery, paginate, applyVirtuals, escapeRegex, DEFAULT_LIMIT, MAX_LIMIT };
