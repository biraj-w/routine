/**
 * Report routes.
 *
 * Teachers and students hold "View Reports"/"View Own Routine" but not
 * "View Routine", so the controller pins the teacher and student reports to the
 * caller's own profile. A teacher cannot read a colleague's workload.
 */
const express = require("express");
const { query } = require("express-validator");
const controller = require("../controllers/report.controller");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { PERMISSIONS: P } = require("../config/permissions");
const { DAYS } = require("../config/constants");

const router = express.Router();
router.use(authenticate);

const idQuery = (name) =>
  query(name).optional().isMongoId().withMessage(`${name} must be a valid id`);

router.get(
  "/teacher",
  authorize(P.VIEW_REPORTS, P.VIEW_OWN_ROUTINE),
  validate([idQuery("teacher"), idQuery("department")]),
  controller.teacher
);

router.get(
  "/student",
  authorize(P.VIEW_REPORTS, P.VIEW_OWN_ROUTINE),
  validate([idQuery("student")]),
  controller.student
);

router.get(
  "/department",
  authorize(P.VIEW_REPORTS),
  validate([
    idQuery("department"),
    idQuery("semester"),
    query("section").optional().isString().trim().toUpperCase().isLength({ max: 5 }),
  ]),
  controller.department
);

router.get("/room-utilisation", authorize(P.VIEW_REPORTS), controller.roomUtilisation);

router.get(
  "/daily",
  authorize(P.VIEW_REPORTS, P.VIEW_OWN_ROUTINE),
  validate([
    query("day").optional().isIn(DAYS).withMessage(`day must be one of: ${DAYS.join(", ")}`),
    idQuery("department"),
  ]),
  controller.daily
);

router.get(
  "/weekly",
  authorize(P.VIEW_REPORTS, P.VIEW_OWN_ROUTINE),
  validate([idQuery("routine"), idQuery("department"), idQuery("semester")]),
  controller.weekly
);

module.exports = router;
