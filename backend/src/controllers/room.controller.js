/**
 * Room controller — generated from the CRUD factory.
 *
 * `scopeDepartment: false` is deliberate. Rooms with `department: null` are
 * shared institution-wide facilities, and a department admin must be able to SEE
 * and BOOK them even though they do not own them. Only Super Admin holds
 * "Manage Rooms", so read access being unscoped grants nothing dangerous; what
 * matters is that room DOUBLE-BOOKING is detected across departments, which the
 * conflict service handles.
 */
const { Room, RoutineEntry } = require("../models");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController({
  Model: Room,
  label: "room",
  searchFields: ["code", "name", "building"],
  allowedFilters: ["type", "building", "department", "isActive", "hasProjector"],
  allowedSorts: ["code", "building", "capacity", "type", "createdAt"],
  defaultSort: "code",
  populate: [{ path: "department", select: "name code" }],
  references: [{ Model: RoutineEntry, field: "room", label: "routine entry" }],
  describe: (doc) => doc.code,
  scopeDepartment: false,
});
