/**
 * Soft-delete plugin.
 *
 * Master data is never physically removed: `isDeleted` is flipped instead, so
 * historical routines and activity logs keep referring to something real.
 *
 * ── The important part ─────────────────────────────────────────────────────
 * The `pre(/^find/)` hook silently adds `isDeleted: false` to every query.
 * That single line means no controller can leak deleted records by forgetting a
 * filter — the safe behaviour is the default, and seeing deleted rows requires
 * asking for them explicitly:
 *
 *     Course.find({ ... })                          // live rows only
 *     Course.find({ ... }).setOptions({ withDeleted: true })   // everything
 *     Course.find({ isDeleted: true })              // explicit → respected
 *
 * ── Caveat that must be remembered ─────────────────────────────────────────
 * Query middleware does NOT run for aggregation pipelines. Every pipeline in
 * this project therefore opens with an explicit `$match: { isDeleted: false }`.
 * See services/dashboard.service.js and services/report.service.js.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { Schema } = require("mongoose");

module.exports = function softDeletePlugin(schema) {
  schema.add({
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });

  // Covers find, findOne, findOneAndUpdate, findById, countDocuments, etc.
  schema.pre(/^find/, function excludeDeleted(next) {
    if (this.getOptions().withDeleted) return next();
    // Respect a filter that mentions isDeleted explicitly, so callers can still
    // ask for deleted rows (e.g. a restore screen or an integrity check).
    if (this.getFilter().isDeleted === undefined) {
      this.where({ isDeleted: false });
    }
    next();
  });

  schema.pre("countDocuments", function excludeDeletedFromCount(next) {
    if (this.getOptions().withDeleted) return next();
    if (this.getFilter().isDeleted === undefined) {
      this.where({ isDeleted: false });
    }
    next();
  });

  /** Mark this document deleted. Returns the saved document. */
  schema.methods.softDelete = function softDelete(userId = null) {
    this.isDeleted = true;
    this.deletedAt = new Date();
    this.deletedBy = userId;
    if (schema.path("updatedBy")) this.updatedBy = userId;
    return this.save();
  };

  /** Undo a soft delete. */
  schema.methods.restore = function restore(userId = null) {
    this.isDeleted = false;
    this.deletedAt = null;
    this.deletedBy = null;
    if (schema.path("updatedBy")) this.updatedBy = userId;
    return this.save();
  };
};
