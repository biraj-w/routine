/**
 * Semester routes — department-scoped.
 */
const { buildCrudRoutes } = require("./helpers/crudRoutes");
const { Semester } = require("../models");
const controller = require("../controllers/semester.controller");
const { semester: validator } = require("../validators/masterData.validator");
const { PERMISSIONS: P } = require("../config/permissions");

module.exports = buildCrudRoutes({
  Model: Semester,
  controller,
  validator,
  viewPermission: P.VIEW_SEMESTERS,
  managePermission: P.MANAGE_SEMESTERS,
});
