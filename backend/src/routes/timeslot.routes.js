/**
 * Time-slot routes — institution-wide, NOT department-scoped.
 *
 * The slot grid is shared by the whole institution: if one department could
 * define its own periods, "the same time slot" would stop being comparable
 * across departments and cross-department room and teacher conflicts could no
 * longer be detected by equality. Only Super Admin may change it.
 */
const { buildCrudRoutes } = require("./helpers/crudRoutes");
const { TimeSlot } = require("../models");
const controller = require("../controllers/timeslot.controller");
const { timeSlot: validator } = require("../validators/masterData.validator");
const { PERMISSIONS: P } = require("../config/permissions");

module.exports = buildCrudRoutes({
  Model: TimeSlot,
  controller,
  validator,
  viewPermission: P.VIEW_TIMESLOTS,
  managePermission: P.MANAGE_TIMESLOTS,
  scoped: false,
  scopeFields: [],
});
