/**
 * RoutineEntry — one class in one time slot on one day. The conflict-detection
 * surface, and the most important schema in the project.
 *
 * ── Denormalised fields, and why ───────────────────────────────────────────
 * `sessionKey`, `department` and `semester` are copied from the parent Routine.
 * This is a deliberate trade of storage for query capability:
 *
 *   1. A unique index can only span fields of ONE document. Conflict rules must
 *      compare a candidate against every entry in the same academic session,
 *      including entries belonging to OTHER departments' routines (two
 *      departments can book the same shared room, or the same visiting
 *      lecturer). Without sessionKey on the entry, that check would need a
 *      $lookup — and no index could enforce it.
 *   2. Department scoping filters entries directly, with no join.
 *
 * The routine service is the single writer of these fields, so they cannot
 * drift from the header.
 *
 * ── Three unique indexes, not four ─────────────────────────────────────────
 * These make conflict detection CORRECT rather than merely likely. The service
 * (services/conflict.service.js) queries first to produce good error messages;
 * the indexes then guarantee two simultaneous requests cannot both succeed.
 * Each is `partialFilterExpression: { isDeleted: false }`, so soft-deleting an
 * entry immediately frees its slot, and each is NAMED so
 * middlewares/errorHandler.js can map an E11000 to the rule that was violated.
 *
 * The requirements list FOUR conflict rules — teacher, room, section, and "the
 * same course must not appear twice in the same slot". Only the first three are
 * indexable constraints here, and the fourth deliberately is not:
 *
 *   - Including `groupLabel` in a course-slot index makes it strictly weaker
 *     than the section index below, so it could never fire independently.
 *   - EXCLUDING groupLabel makes it forbid a legitimate arrangement: a split
 *     lab where batches G1 and G2 take the same course in the same slot, in
 *     different rooms with different instructors. That is normal practice, and
 *     it is the entire reason `groupLabel` exists.
 *
 * So rule 4 is subsumed by rule 3 in this model: two entries sharing an
 * audience (semester + section + groupLabel) are already rejected whatever
 * their course. The conflict service still reports it SEPARATELY, because
 * "CSE301 is already scheduled for section A in this slot" is a far more useful
 * message than "section A already has a class". Rule 4 is therefore a
 * message refinement of rule 3, not an independent constraint — see
 * docs/architecture.md.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");
const { DAYS, CLASS_TYPES, DEFAULT_GROUP_LABEL } = require("../config/constants");

const routineEntrySchema = new Schema(
  {
    routine: {
      type: Schema.Types.ObjectId,
      ref: "Routine",
      required: [true, "Entry must belong to a routine"],
      index: true,
    },

    // ── Denormalised from the parent routine ──────────────────────────────
    sessionKey: {
      type: String,
      required: [true, "sessionKey is required"],
    },
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "department is required"],
    },
    semester: {
      type: Schema.Types.ObjectId,
      ref: "Semester",
      required: [true, "semester is required"],
    },

    section: {
      type: String,
      required: [true, "Section is required"],
      uppercase: true,
      trim: true,
      maxlength: [5, "Section must be at most 5 characters"],
    },

    /** "ALL" for a whole-section class, "G1"/"G2" for a split lab batch. */
    groupLabel: {
      type: String,
      uppercase: true,
      trim: true,
      default: DEFAULT_GROUP_LABEL,
      maxlength: [5, "Group label must be at most 5 characters"],
    },

    day: {
      type: String,
      required: [true, "Day is required"],
      enum: { values: DAYS, message: "{VALUE} is not a teaching day" },
    },

    timeSlot: {
      type: Schema.Types.ObjectId,
      ref: "TimeSlot",
      required: [true, "Time slot is required"],
    },

    course: {
      type: Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
    },

    teacher: {
      type: Schema.Types.ObjectId,
      ref: "Teacher",
      required: [true, "Teacher is required"],
    },

    room: {
      type: Schema.Types.ObjectId,
      ref: "Room",
      required: [true, "Room is required"],
    },

    classType: {
      type: String,
      enum: { values: CLASS_TYPES, message: "{VALUE} is not a valid class type" },
      default: "Lecture",
    },

    note: { type: String, trim: true, default: "", maxlength: [200, "Note must be at most 200 characters"] },
  },
  { timestamps: true, collection: "routine_entries" }
);

applyCommonPlugins(routineEntrySchema);

const LIVE_ONLY = { partialFilterExpression: { isDeleted: false } };

/* ── Conflict enforcement ─────────────────────────────────────────────────── */

// R1 — a teacher cannot teach two classes at the same time.
routineEntrySchema.index(
  { sessionKey: 1, day: 1, timeSlot: 1, teacher: 1 },
  { unique: true, ...LIVE_ONLY, name: "uniq_teacher_slot" }
);

// R2 — a room cannot be booked twice. Crosses departments by design.
routineEntrySchema.index(
  { sessionKey: 1, day: 1, timeSlot: 1, room: 1 },
  { unique: true, ...LIVE_ONLY, name: "uniq_room_slot" }
);

// R3 — a section (or lab batch) cannot have two simultaneous classes.
//      Also subsumes R4: see the header note on why a separate course-slot
//      constraint cannot be expressed without breaking split labs.
routineEntrySchema.index(
  { sessionKey: 1, day: 1, timeSlot: 1, semester: 1, section: 1, groupLabel: 1 },
  { unique: true, ...LIVE_ONLY, name: "uniq_section_slot" }
);

/* ── Read paths ───────────────────────────────────────────────────────────── */

routineEntrySchema.index({ routine: 1, day: 1, timeSlot: 1 }, { name: "idx_entry_grid" });
routineEntrySchema.index({ teacher: 1, sessionKey: 1 }, { name: "idx_entry_teacher" });
routineEntrySchema.index({ semester: 1, section: 1, sessionKey: 1 }, { name: "idx_entry_section" });
routineEntrySchema.index({ room: 1, sessionKey: 1 }, { name: "idx_entry_room" });
routineEntrySchema.index({ department: 1, sessionKey: 1 }, { name: "idx_entry_department" });

/** Grid cell key, matched by the frontend renderer. */
routineEntrySchema.virtual("cellKey").get(function cellKey() {
  return `${this.day}|${this.timeSlot}`;
});

module.exports = model("RoutineEntry", routineEntrySchema);
