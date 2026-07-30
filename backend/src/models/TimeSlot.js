/**
 * TimeSlot — one period in the daily grid, e.g. "09:00-10:00".
 *
 * ── The decision that makes conflict detection possible ────────────────────
 * Time slots are a FIXED, NON-OVERLAPPING CATALOGUE, and a routine entry
 * references one by id. Every class therefore occupies exactly one slot, so all
 * four conflict rules reduce to EQUALITY comparisons on `timeSlot` — which is
 * precisely what lets MongoDB enforce them with unique indexes.
 *
 * Free-form start/end times on each routine entry would instead require
 * range-overlap queries ($lt/$gt pairs), and a unique index cannot express
 * "these two intervals must not intersect". The catalogue is what buys
 * database-level correctness.
 *
 * `startMinutes`/`endMinutes` are derived so ordering and duration sums are
 * arithmetic rather than string comparisons, and so an optional overlap check
 * is available if the grid ever gains overlapping slots.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "09:30" → 570 */
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const timeSlotSchema = new Schema(
  {
    label: {
      type: String,
      required: [true, "Slot label is required"],
      trim: true,
    },

    startTime: {
      type: String,
      required: [true, "Start time is required"],
      match: [HHMM, "Start time must be in 24-hour HH:mm format"],
    },

    endTime: {
      type: String,
      required: [true, "End time is required"],
      match: [HHMM, "End time must be in 24-hour HH:mm format"],
    },

    /** Derived from startTime/endTime; never accepted from a client. */
    startMinutes: { type: Number, index: true },
    endMinutes: { type: Number },

    /** Display order across the day. Unique so the grid never has ties. */
    order: {
      type: Number,
      required: [true, "Display order is required"],
      min: [1, "Order must be at least 1"],
    },

    /** A lunch/tea break: appears in the grid but accepts no classes. */
    isBreak: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "timeslots" }
);

applyCommonPlugins(timeSlotSchema);

timeSlotSchema.index(
  { label: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "uniq_timeslot_label" }
);
timeSlotSchema.index(
  { order: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "uniq_timeslot_order" }
);
timeSlotSchema.index(
  { startTime: 1, endTime: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "uniq_timeslot_range" }
);

timeSlotSchema.pre("validate", function deriveMinutes(next) {
  if (this.startTime && HHMM.test(this.startTime)) this.startMinutes = toMinutes(this.startTime);
  if (this.endTime && HHMM.test(this.endTime)) this.endMinutes = toMinutes(this.endTime);

  if (this.startMinutes !== undefined && this.endMinutes !== undefined) {
    if (this.endMinutes <= this.startMinutes) {
      return next(new Error("End time must be after start time"));
    }
  }
  if (!this.label && this.startTime && this.endTime) {
    this.label = `${this.startTime}-${this.endTime}`;
  }
  next();
});

timeSlotSchema.virtual("durationMinutes").get(function durationMinutes() {
  if (this.startMinutes === undefined || this.endMinutes === undefined) return null;
  return this.endMinutes - this.startMinutes;
});

/**
 * Reject a slot that overlaps an existing one. The catalogue's whole value is
 * that its periods are disjoint, so this invariant is enforced on write rather
 * than assumed. Called by the timeslot service on create and update.
 *
 * Two ranges overlap when each starts before the other ends.
 */
timeSlotSchema.statics.findOverlapping = function findOverlapping(startMinutes, endMinutes, excludeId = null) {
  const filter = {
    startMinutes: { $lt: endMinutes },
    endMinutes: { $gt: startMinutes },
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return this.find(filter);
};

module.exports = model("TimeSlot", timeSlotSchema);
module.exports.toMinutes = toMinutes;
