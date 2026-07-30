/**
 * Department — the top-level organisational unit, and the axis every
 * department-scoped permission check pivots on.
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");

const departmentSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Department name is required"],
      trim: true,
      minlength: [2, "Department name must be at least 2 characters"],
      maxlength: [120, "Department name must be at most 120 characters"],
    },

    code: {
      type: String,
      required: [true, "Department code is required"],
      uppercase: true,
      trim: true,
      minlength: [2, "Department code must be at least 2 characters"],
      maxlength: [10, "Department code must be at most 10 characters"],
      match: [/^[A-Z0-9]+$/, "Department code may contain only letters and digits"],
    },

    description: { type: String, trim: true, default: "" },

    headTeacher: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      default: null,
    },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "departments" }
);

applyCommonPlugins(departmentSchema);

/**
 * Uniqueness is PARTIAL, scoped to live rows.
 *
 * A plain `unique: true` on the field would keep enforcing itself against
 * soft-deleted documents, so deleting a department would permanently reserve its
 * code — an institution could never recreate "CSE" after removing it, and
 * nothing in the interface could release it. Scoping the index to
 * `isDeleted: false` makes a soft delete behave like a delete from the caller's
 * point of view while still retaining the row for audit purposes.
 *
 * The same reasoning applies to every soft-deletable natural key in this project.
 */
const LIVE_ONLY = { partialFilterExpression: { isDeleted: false } };

departmentSchema.index({ code: 1 }, { unique: true, ...LIVE_ONLY, name: "uniq_department_code" });
departmentSchema.index({ name: 1 }, { unique: true, ...LIVE_ONLY, name: "uniq_department_name" });

module.exports = model("Department", departmentSchema);
