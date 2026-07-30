/**
 * Course routes — department-scoped.
 */
const { buildCrudRoutes } = require("./helpers/crudRoutes");
const { Course } = require("../models");
const controller = require("../controllers/course.controller");
const { course: validator } = require("../validators/masterData.validator");
const { PERMISSIONS: P } = require("../config/permissions");

module.exports = buildCrudRoutes({
  Model: Course,
  controller,
  validator,
  viewPermission: P.VIEW_COURSES,
  managePermission: P.MANAGE_COURSES,
});
