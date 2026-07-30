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
const MAX_LIMIT = 100;

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
  return { items, meta: { page, limit, total } };
}

module.exports = { buildListQuery, paginate, escapeRegex, DEFAULT_LIMIT, MAX_LIMIT };
