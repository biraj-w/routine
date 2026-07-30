/**
 * Course — a subject offered by a department at a given semester level.
 *
 * `semesterNumber` is the LEVEL the course belongs to (3rd semester), not a
 * reference to a Semester instance. A course such as "CSE301 Web Engineering"
 * is a permanent part of the 3rd-semester curriculum and is taught again each
 * year; binding it to one Spring-2026 document would force a duplicate row per
 * intake. The Semester instance appears on the routine entry instead, which is
 * where the year/term actually matters.
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");
const { COURSE_TYPES } = require("../config/constants");

const courseSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, "Course code is required"],
      uppercase: true,
      trim: true,
      minlength: [3, "Course code must be at least 3 characters"],
      maxlength: [15, "Course code must be at most 15 characters"],
    },

    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
      minlength: [3, "Course title must be at least 3 characters"],
      maxlength: [150, "Course title must be at most 150 characters"],
    },

    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Course must belong to a department"],
      index: true,
    },

    semesterNumber: {
      type: Number,
      required: [true, "Semester level is required"],
      min: [1, "Semester level must be at least 1"],
      max: [12, "Semester level must be at most 12"],
    },

    credits: {
      type: Number,
      required: [true, "Credit hours are required"],
      min: [0, "Credits cannot be negative"],
      max: [6, "Credits must be at most 6"],
    },

    type: {
      type: String,
      enum: { values: COURSE_TYPES, message: "{VALUE} is not a valid course type" },
      default: "Theory",
    },

    /** Expected classes per week — drives report completeness checks. */
    weeklyClasses: {
      type: Number,
      default: 3,
      min: [1, "A course needs at least one class per week"],
      max: [10, "At most 10 classes per week"],
    },

    description: { type: String, trim: true, default: "", maxlength: 500 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "courses" }
);

applyCommonPlugins(courseSchema);

/**
 * Course codes are unique WITHIN a department, not globally: two departments
 * may each legitimately run a "101".
 */
courseSchema.index(
  { department: 1, code: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "uniq_course_code_per_dept" }
);

courseSchema.index({ department: 1, semesterNumber: 1 });

/** Full-text search over code and title, used by the course list endpoint. */
courseSchema.index({ code: "text", title: "text" }, { name: "text_course_search" });

courseSchema.virtual("label").get(function label() {
  return `${this.code} — ${this.title}`;
});

module.exports = model("Course", courseSchema);
