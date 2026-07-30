/**
 * Semester — one offered semester instance, e.g. "CSE semester 3, Spring
 * 2025-2026".
 *
 * "Semester" is ambiguous in ordinary use: it can mean a level (1st–8th) or a
 * term (Spring 2026). One document here is the intersection of both, which is
 * what a routine is actually built for.
 *
 * ── Two modelling decisions ────────────────────────────────────────────────
 *
 * `sections` is an embedded array of labels, not a collection. A section
 * ("A", "B") carries no attributes of its own, is never queried independently,
 * and is always read with its semester. Section identity for conflict detection
 * is the triple {department, semester, section}, which is exactly what the
 * routine-entry index uses.
 *
 * `sessionKey` ("2025-2026-Spring") is the CONFLICT UNIVERSE. Two classes can
 * only clash if they occur in the same academic session, so this key is
 * denormalised onto every routine entry and forms the first field of all four
 * conflict indexes.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");
const { TERMS } = require("../config/constants");

const semesterSchema = new Schema(
  {
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Semester must belong to a department"],
      index: true,
    },

    number: {
      type: Number,
      required: [true, "Semester number is required"],
      min: [1, "Semester number must be at least 1"],
      max: [12, "Semester number must be at most 12"],
    },

    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      trim: true,
      match: [/^\d{4}-\d{4}$/, 'Academic year must look like "2025-2026"'],
    },

    term: {
      type: String,
      required: [true, "Term is required"],
      enum: { values: TERMS, message: "{VALUE} is not a valid term" },
    },

    /** Derived in pre-validate; never set by a client. */
    sessionKey: { type: String, index: true },

    sections: {
      type: [String],
      default: ["A"],
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "A semester must have at least one section",
      },
    },

    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true, collection: "semesters" }
);

applyCommonPlugins(semesterSchema);

/** One semester instance per department / number / year / term. */
semesterSchema.index(
  { department: 1, number: 1, academicYear: 1, term: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "uniq_semester_instance" }
);

semesterSchema.pre("validate", function deriveFields(next) {
  if (this.academicYear && this.term) {
    this.sessionKey = `${this.academicYear}-${this.term}`;
  }
  if (Array.isArray(this.sections)) {
    // Normalise to uppercase and drop duplicates: "a" and "A" are one section.
    this.sections = [...new Set(this.sections.map((s) => String(s).trim().toUpperCase()).filter(Boolean))];
  }
  if (this.startDate && this.endDate && this.endDate <= this.startDate) {
    return next(new Error("End date must be after start date"));
  }
  next();
});

/**
 * Human label used in dropdowns and reports.
 *
 * The department code is prefixed WHEN AVAILABLE, because a semester is only
 * unique per department: without it a Super Admin picking a semester in the
 * routine form saw three identical "Semester 1 — Spring 2025-2026" options, one
 * per department, with no way to tell them apart.
 *
 * `this.department?.code` is present only when the caller populated it (the list
 * and detail endpoints both do). When it is a bare ObjectId the prefix is simply
 * omitted rather than rendering an id, so the virtual is safe either way.
 */
semesterSchema.virtual("label").get(function label() {
  const base = `Semester ${this.number} — ${this.term} ${this.academicYear}`;
  const code = this.department?.code;
  return code ? `${code} · ${base}` : base;
});

module.exports = model("Semester", semesterSchema);
