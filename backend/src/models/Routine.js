/**
 * Routine — the HEADER of one semester's timetable. Owns the approval lifecycle.
 *
 * ── Why the routine is two collections ─────────────────────────────────────
 * The lifecycle (draft → submitted → approved → published) belongs to a
 * timetable as a whole, not to each individual class. Putting `status` on every
 * cell would make "publish the routine" a bulk update across ~30 documents with
 * no single thing to approve, and no way to record who approved it and when.
 *
 * So: this document holds the status and the audit trail of the workflow, and
 * RoutineEntry holds the individual class slots. The entries must stay flat and
 * separately indexed because a unique index cannot span elements of an embedded
 * array — and those unique indexes are what enforce conflict detection at the
 * database layer.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");
const { ROUTINE_STATUS, ROUTINE_TRANSITIONS, TERMS } = require("../config/constants");

const routineSchema = new Schema(
  {
    title: {
      type: String,
      trim: true,
      maxlength: [150, "Title must be at most 150 characters"],
      default: "",
    },

    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Routine must belong to a department"],
      index: true,
    },

    semester: {
      type: Schema.Types.ObjectId,
      ref: "Semester",
      required: [true, "Routine must belong to a semester"],
      index: true,
    },

    academicYear: {
      type: String,
      required: [true, "Academic year is required"],
      match: [/^\d{4}-\d{4}$/, 'Academic year must look like "2025-2026"'],
    },

    term: {
      type: String,
      required: [true, "Term is required"],
      enum: { values: TERMS, message: "{VALUE} is not a valid term" },
    },

    /** Derived. Copied onto every entry, where it scopes all conflict checks. */
    sessionKey: { type: String, index: true },

    version: { type: Number, default: 1, min: 1 },

    status: {
      type: String,
      enum: { values: Object.values(ROUTINE_STATUS), message: "{VALUE} is not a valid routine status" },
      default: ROUTINE_STATUS.DRAFT,
      index: true,
    },

    effectiveFrom: { type: Date, default: null },

    // Workflow audit trail: who moved this routine, and when.
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    submittedAt: { type: Date, default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    publishedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, default: "", maxlength: 500 },

    /** Maintained by the routine service, so list pages need no per-row count. */
    entryCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "routines" }
);

applyCommonPlugins(routineSchema);

/**
 * One live timetable per department / semester / year / term. A revision bumps
 * `version` rather than creating a second live routine — two concurrent drafts
 * of the same timetable would compete for the entry-level unique indexes.
 */
routineSchema.index(
  { department: 1, semester: 1, academicYear: 1, term: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "uniq_routine_session" }
);

/** Serves the Super Admin approval queue. */
routineSchema.index({ status: 1, department: 1 }, { name: "idx_routine_status" });

routineSchema.pre("validate", function deriveFields(next) {
  if (this.academicYear && this.term) {
    this.sessionKey = `${this.academicYear}-${this.term}`;
  }
  next();
});

/** Is `next` a legal move from the current status? */
routineSchema.methods.canTransitionTo = function canTransitionTo(next) {
  return (ROUTINE_TRANSITIONS[this.status] || []).includes(next);
};

/** Legal next statuses, for the UI to render only the buttons that apply. */
routineSchema.virtual("allowedTransitions").get(function allowedTransitions() {
  return ROUTINE_TRANSITIONS[this.status] || [];
});

/** Only published routines are visible to teachers and students. */
routineSchema.virtual("isVisibleToEveryone").get(function isVisibleToEveryone() {
  return this.status === ROUTINE_STATUS.PUBLISHED;
});

/** Entries may only be edited while the routine is still a draft. */
routineSchema.virtual("isEditable").get(function isEditable() {
  return this.status === ROUTINE_STATUS.DRAFT;
});

module.exports = model("Routine", routineSchema);
