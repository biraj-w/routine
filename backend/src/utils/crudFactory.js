/**
 * Generates the five standard CRUD handlers from a small config object.
 *
 * ── Provenance ─────────────────────────────────────────────────────────────
 * This was EXTRACTED from controllers/department.controller.js after that module
 * was written longhand and working. The department controller is deliberately
 * left un-refactored as the reference implementation: reading it shows what the
 * factory does, without having to reason about the abstraction.
 *
 * Applied to: semester, course, room, timeslot — resources whose behaviour is
 * genuinely uniform. Teacher, Student and User stay hand-written, because each
 * also creates or updates a linked User account, which is not CRUD.
 *
 * What the factory owns:
 *   - pagination, whitelisted filtering, escaped search, whitelisted sort
 *   - department scoping merged into every list query
 *   - soft delete, refused when other collections still reference the document
 *   - audit-log entries for create / update / delete
 *
 * What it deliberately does NOT own: routes and permissions. Those stay explicit
 * in each routes/*.js so the security posture of an endpoint is readable without
 * chasing a config object.
 */
const asyncHandler = require("./asyncHandler");
const ApiError = require("./ApiError");
const { success, created, paginated } = require("./response");
const { buildListQuery, paginate } = require("./queryFeatures");
const { scoped } = require("../middlewares/scope");
const activityService = require("../services/activity.service");
const { ACTIVITY_ACTIONS } = require("../config/constants");

/**
 * @param {Object}   cfg
 * @param {Model}    cfg.Model            the Mongoose model
 * @param {string}   cfg.label            singular human name, e.g. "course"
 * @param {string[]} cfg.searchFields     fields `?search=` matches
 * @param {string[]} cfg.allowedFilters   query keys copied into the filter
 * @param {string[]} cfg.allowedSorts     sortable fields
 * @param {string}   cfg.defaultSort
 * @param {Array}    cfg.populate         populate specs for list and get
 * @param {Array}    cfg.references       [{Model, field, label}] blocking delete
 * @param {Function} cfg.describe         (doc) => string, for the audit log
 * @param {Function} cfg.beforeSave       async (body, req, doc?) => void — extra
 *                                        business rules (e.g. overlap checks)
 * @param {boolean}  cfg.scopeDepartment  merge req.scopeFilter into list queries
 */
function createCrudController(cfg) {
  const {
    Model,
    label,
    searchFields = [],
    allowedFilters = [],
    allowedSorts = ["createdAt"],
    defaultSort = "-createdAt",
    populate = [],
    references = [],
    describe = (doc) => String(doc._id),
    beforeSave = null,
    scopeDepartment = true,
  } = cfg;

  const entityType = Model.modelName;
  const Label = label.charAt(0).toUpperCase() + label.slice(1);

  return {
    list: asyncHandler(async (req, res) => {
      const options = buildListQuery(req, {
        searchFields,
        allowedFilters,
        allowedSorts,
        defaultSort,
      });

      const filter = scopeDepartment ? scoped(req, options.filter) : options.filter;
      const { items, meta } = await paginate(Model, filter, { ...options, populate });

      return paginated(res, items, meta, `${Label}s fetched`);
    }),

    /** Relies on enforceScope having loaded and scope-checked req.doc. */
    get: asyncHandler(async (req, res) => {
      let doc = req.doc;
      for (const spec of populate) doc = await doc.populate(spec);
      return success(res, { data: doc, message: `${Label} fetched` });
    }),

    create: asyncHandler(async (req, res) => {
      if (beforeSave) await beforeSave(req.body, req, null);

      const doc = await Model.create(req.body);

      activityService.record({
        req,
        action: ACTIVITY_ACTIONS.CREATE,
        entityType,
        entityId: doc._id,
        description: `Created ${label} ${describe(doc)}`,
        department: doc.department || null,
      });

      return created(res, doc, `${Label} created`);
    }),

    update: asyncHandler(async (req, res) => {
      const doc = req.doc;
      const before = doc.toObject();

      if (beforeSave) await beforeSave(req.body, req, doc);

      Object.assign(doc, req.body);
      await doc.save();

      activityService.record({
        req,
        action: ACTIVITY_ACTIONS.UPDATE,
        entityType,
        entityId: doc._id,
        description: `Updated ${label} ${describe(doc)}`,
        changes: activityService.diff(before, doc.toObject()),
        department: doc.department || null,
      });

      return success(res, { data: doc, message: `${Label} updated` });
    }),

    remove: asyncHandler(async (req, res) => {
      const doc = req.doc;

      // Referential integrity without cascades: report what is in the way and
      // let the caller decide, rather than deleting their data for them.
      const blocking = [];
      for (const ref of references) {
        const count = await ref.Model.countDocuments({ [ref.field]: doc._id });
        if (count > 0) blocking.push(`${count} ${ref.label}${count === 1 ? "" : "s"}`);
      }

      if (blocking.length) {
        throw ApiError.conflict(
          `Cannot delete this ${label}: ${blocking.join(", ")} still reference it. ` +
            `Deactivate it instead, or reassign those records first.`,
          "REFERENCED",
          blocking.map((b) => ({ field: label, message: `${b} reference this ${label}` }))
        );
      }

      await doc.softDelete(req.auth.userId);

      activityService.record({
        req,
        action: ACTIVITY_ACTIONS.DELETE,
        entityType,
        entityId: doc._id,
        description: `Deleted ${label} ${describe(doc)}`,
        department: doc.department || null,
      });

      return success(res, { message: `${Label} deleted` });
    }),
  };
}

module.exports = { createCrudController };
