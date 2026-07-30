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
      unique: true,
      trim: true,
      minlength: [2, "Department name must be at least 2 characters"],
      maxlength: [120, "Department name must be at most 120 characters"],
    },

    code: {
      type: String,
      required: [true, "Department code is required"],
      unique: true,
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

module.exports = model("Department", departmentSchema);
