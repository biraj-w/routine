/**
 * Time-slot controller — generated from the CRUD factory, plus one business rule.
 *
 * `beforeSave` enforces non-overlap. The whole conflict-detection design rests on
 * time slots being a disjoint catalogue: because a class occupies exactly one
 * slot, all conflict rules are equality comparisons and can be enforced by unique
 * indexes. Overlapping slots would quietly break that invariant, so it is
 * checked on write rather than assumed.
 *
 * Slots are institution-wide, so no department scoping.
 */
const { TimeSlot, RoutineEntry } = require("../models");
const { createCrudController } = require("../utils/crudFactory");
const ApiError = require("../utils/ApiError");

/** "09:30" → 570 */
function toMinutes(hhmm) {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
}

async function rejectOverlaps(body, req, existing) {
  // On update only one endpoint may be supplied; fall back to the stored value.
  const startTime = body.startTime ?? existing?.startTime;
  const endTime = body.endTime ?? existing?.endTime;
  if (!startTime || !endTime) return;

  const startMinutes = toMinutes(startTime);
  const endMinutes = toMinutes(endTime);
  if (endMinutes <= startMinutes) {
    throw ApiError.validation("Validation failed", [
      { field: "endTime", message: "End time must be after start time" },
    ]);
  }

  // excludeId prevents a slot from overlapping itself when being edited.
  const clashes = await TimeSlot.findOverlapping(startMinutes, endMinutes, existing?._id || null);
  if (clashes.length) {
    throw ApiError.conflict(
      `That time range overlaps an existing slot: ${clashes.map((c) => c.label).join(", ")}. ` +
        `Time slots must not overlap.`,
      "CONFLICT",
      clashes.map((c) => ({ field: "startTime", message: `Overlaps ${c.label}` }))
    );
  }
}

module.exports = createCrudController({
  Model: TimeSlot,
  label: "time slot",
  searchFields: ["label"],
  allowedFilters: ["isBreak", "isActive"],
  allowedSorts: ["order", "startTime", "createdAt"],
  defaultSort: "order",
  references: [{ Model: RoutineEntry, field: "timeSlot", label: "routine entry" }],
  describe: (doc) => doc.label,
  beforeSave: rejectOverlaps,
  scopeDepartment: false,
});
