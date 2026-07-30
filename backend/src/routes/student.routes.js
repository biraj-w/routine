/**
 * Student routes — department-scoped.
 */
const { buildCrudRoutes } = require("./helpers/crudRoutes");
const { Student } = require("../models");
const controller = require("../controllers/student.controller");
const { student: validator } = require("../validators/profile.validator");
const { PERMISSIONS: P } = require("../config/permissions");

module.exports = buildCrudRoutes({
  Model: Student,
  controller,
  validator,
  viewPermission: P.VIEW_STUDENTS,
  managePermission: P.MANAGE_STUDENTS,
});
