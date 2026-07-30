/**
 * Room — a physical teaching space.
 *
 * ── Why `department` is nullable ────────────────────────────────────────────
 * `department: null` means a shared, institution-wide room. This is what makes
 * room double-booking a genuinely CROSS-DEPARTMENT conflict: two department
 * admins can independently book the same central lecture hall, and neither can
 * see the other's routine. It is the strongest justification in the project for
 * why conflict detection must ignore department scoping while the rest of the
 * API respects it.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");
const { ROOM_TYPES } = require("../config/constants");

const roomSchema = new Schema(
  {
    code: {
      type: String,
      required: [true, "Room code is required"],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [20, "Room code must be at most 20 characters"],
    },

    name: { type: String, trim: true, default: "" },

    building: {
      type: String,
      required: [true, "Building is required"],
      trim: true,
      maxlength: [60, "Building must be at most 60 characters"],
    },

    floor: { type: Number, default: 0, min: [-2, "Floor is out of range"], max: [50, "Floor is out of range"] },

    capacity: {
      type: Number,
      required: [true, "Capacity is required"],
      min: [1, "Capacity must be at least 1"],
      max: [1000, "Capacity must be at most 1000"],
    },

    type: {
      type: String,
      required: true,
      enum: { values: ROOM_TYPES, message: "{VALUE} is not a valid room type" },
      default: "Lecture Hall",
    },

    /** null = shared / central room, bookable by any department. */
    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },

    hasProjector: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: "rooms" }
);

applyCommonPlugins(roomSchema);

roomSchema.index({ department: 1, type: 1 });
roomSchema.index({ building: 1, code: 1 });

roomSchema.virtual("label").get(function label() {
  return this.name ? `${this.code} (${this.name})` : this.code;
});

/** True when any department may book this room. */
roomSchema.virtual("isShared").get(function isShared() {
  return this.department === null || this.department === undefined;
});

module.exports = model("Room", roomSchema);
