/**
 * Teacher — the domain profile of a member of teaching staff.
 *
 * Separate from User, and referenced by routine entries rather than the User
 * document, because:
 *   - a teacher can appear in a timetable before an account is provisioned
 *     (hence `user` is unique but SPARSE, allowing many null values)
 *   - "update own profile" must reach designation and phone but never `role`
 *   - reports read teacher attributes constantly and credentials never
 *
 * `fullName` is denormalised from User. The duplication is deliberate: reports
 * and the routine grid display a teacher's name on every row, and copying one
 * string avoids a populate on the hottest read path. The teacher service keeps
 * the two in step.
 */
const { Schema, model } = require("mongoose");
const { applyCommonPlugins } = require("./plugins");
const { DESIGNATIONS, DAYS } = require("../config/constants");

/** Embedded: a slot the teacher is unavailable for. Bounded, always read with the parent. */
const unavailableSlotSchema = new Schema(
  {
    day: { type: String, enum: DAYS, required: true },
    timeSlot: { type: Schema.Types.ObjectId, ref: "TimeSlot", required: true },
    reason: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const teacherSchema = new Schema(
  {
    /** At most one teacher per account, but an account is optional — see the index below. */
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    employeeCode: {
      type: String,
      required: [true, "Employee code is required"],
      uppercase: true,
      trim: true,
      maxlength: [20, "Employee code must be at most 20 characters"],
    },

    fullName: {
      type: String,
      required: [true, "Teacher name is required"],
      trim: true,
      maxlength: [100, "Name must be at most 100 characters"],
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      default: "",
    },

    department: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: [true, "Teacher must belong to a department"],
      index: true,
    },

    designation: {
      type: String,
      enum: { values: DESIGNATIONS, message: "{VALUE} is not a valid designation" },
      default: "Lecturer",
    },

    specialization: { type: [String], default: [] },

    /** Soft cap: exceeding it produces a non-blocking warning, not a rejection. */
    maxWeeklyClasses: {
      type: Number,
      default: 18,
      min: [1, "Weekly class cap must be at least 1"],
      max: [40, "Weekly class cap must be at most 40"],
    },

    unavailableSlots: { type: [unavailableSlotSchema], default: [] },

    contact: {
      phone: { type: String, trim: true, default: "" },
      officeRoom: { type: String, trim: true, default: "" },
    },

    status: {
      type: String,
      enum: ["active", "on-leave", "inactive"],
      default: "active",
    },
  },
  { timestamps: true, collection: "teachers" }
);

applyCommonPlugins(teacherSchema);

/**
 * One teacher per user account, but many teachers may have no account.
 *
 * `sparse: true` is the obvious choice here and is WRONG: sparse only skips
 * documents where the field is ABSENT, while `default: null` makes it present
 * with a null value — so a second account-less teacher would collide on
 * `{ user: null }`. A partial index filtered to actual ObjectIds is explicit
 * about the intent and works whether the field is null or missing.
 */
teacherSchema.index(
  { user: 1 },
  {
    unique: true,
    partialFilterExpression: { user: { $type: "objectId" } },
    name: "uniq_teacher_user",
  }
);
// Partial, so a soft-deleted teacher releases their employee code.
teacherSchema.index(
  { employeeCode: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false }, name: "uniq_teacher_code" }
);
teacherSchema.index({ department: 1, isDeleted: 1 });
teacherSchema.index({ fullName: "text", employeeCode: "text" }, { name: "text_teacher_search" });

teacherSchema.virtual("label").get(function label() {
  return `${this.fullName} (${this.employeeCode})`;
});

/** True when this teacher has declared the given day/slot unavailable. */
teacherSchema.methods.isUnavailableAt = function isUnavailableAt(day, timeSlotId) {
  return this.unavailableSlots.some(
    (slot) => slot.day === day && String(slot.timeSlot) === String(timeSlotId)
  );
};

module.exports = model("Teacher", teacherSchema);
