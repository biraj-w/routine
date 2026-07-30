/**
 * Student — the domain profile of an enrolled student.
 *
 * A student's routine is not stored per student: it is the routine of their
 * {department, semester, section}. The compound index below is what turns
 * "show me my timetable" into a single indexed lookup, and it is the same
 * triple the section-conflict rule guards.
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");
const { DEFAULT_GROUP_LABEL } = require("../config/constants");

const studentSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rollNo: {
      type: String,
      required: [true, "Roll number is required"],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [25, "Roll number must be at most 25 characters"],
    },

    fullName: {
      type: String,
      required: [true, "Student name is required"],
      trim: true,
      maxlength: [100, "Name must be at most 100 characters"],
    },

    email: { type: String, lowercase: true, trim: true, default: "" },

    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Student must belong to a department"],
      index: true,
    },

    semester: {
      type: Schema.Types.ObjectId,
      ref: "Semester",
      required: [true, "Student must be enrolled in a semester"],
      index: true,
    },

    section: {
      type: String,
      required: [true, "Section is required"],
      uppercase: true,
      trim: true,
      maxlength: [5, "Section must be at most 5 characters"],
      default: "A",
    },

    /**
     * Lab batch. A section's practical classes may split into G1/G2 running
     * simultaneously in different labs; this records which batch the student is
     * in so their grid shows the right one.
     */
    groupLabel: {
      type: String,
      uppercase: true,
      trim: true,
      default: DEFAULT_GROUP_LABEL,
    },

    batchYear: {
      type: Number,
      min: [1900, "Batch year is out of range"],
      max: [2200, "Batch year is out of range"],
      default: null,
    },

    admissionDate: { type: Date, default: null },
    contactPhone: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["active", "graduated", "suspended", "inactive"],
      default: "active",
    },
  },
  { timestamps: true, collection: "students" }
);

applyCommonPlugins(studentSchema);

/**
 * One student per user account, many students with no account yet.
 * Partial rather than sparse — see the equivalent index on Teacher for why
 * `sparse` does not do what it appears to when the field defaults to null.
 */
studentSchema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: { user: { $type: "objectId" } },
    name: "uniq_student_user",
  }
);

/** Serves "my routine": resolve the student, then read their section's entries. */
studentSchema.index({ department: 1, semester: 1, section: 1 }, { name: "idx_student_section" });

studentSchema.index({ fullName: "text", rollNo: "text" }, { name: "text_student_search" });

studentSchema.virtual("label").get(function label() {
  return `${this.fullName} (${this.rollNo})`;
});

module.exports = model("Student", studentSchema);
