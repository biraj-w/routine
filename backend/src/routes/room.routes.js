/**
 * Room routes — institution-wide, NOT department-scoped.
 *
 * Every role may read every room: a department admin has to see the shared
 * lecture halls in order to book one, and cannot know a room is free without
 * seeing it. Write access is restricted by permission instead — only Super Admin
 * holds "Manage Rooms" — and cross-department double-booking is caught by the
 * conflict service rather than by hiding rooms.
 */
const { buildCrudRoutes } = require("./helpers/crudRoutes");
const { Room } = require("../models");
const controller = require("../controllers/room.controller");
const { room: validator } = require("../validators/masterData.validator");
const { PERMISSIONS: P } = require("../config/permissions");

module.exports = buildCrudRoutes({
  Model: Room,
  controller,
  validator,
  viewPermission: P.VIEW_ROOMS,
  managePermission: P.MANAGE_ROOMS,
  scoped: false,
  scopeFields: [], // never overwrite `department`: null means "shared"
});
