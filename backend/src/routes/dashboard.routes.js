/**
 * Dashboard routes.
 *
 * withScope() runs on every one, so each aggregation receives req.scopeFilter and
 * a Department Admin's figures are automatically limited to their department.
 */
const express = require("express");
const { query } = require("express-validator");
const controller = require("../controllers/dashboard.controller");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { withScope } = require("../middlewares/scope");
const { PERMISSIONS: P } = require("../config/permissions");
const { DAYS } = require("../config/constants");

const router = express.Router();
router.use(authenticate);
router.use(authorize(P.VIEW_DASHBOARD));
router.use(withScope());

router.get("/", controller.overview);
router.get("/today", controller.today);
router.get(
  "/teacher-workload",
  validate([query("limit").optional().isInt({ min: 1, max: 50 }).toInt()]),
  controller.teacherWorkload
);
router.get("/room-utilisation", controller.roomUtilisation);
router.get(
  "/free-rooms",
  validate([
    query("day").isIn(DAYS).withMessage(`day must be one of: ${DAYS.join(", ")}`),
    query("timeSlot").isMongoId().withMessage("timeSlot must be a valid id"),
    query("sessionKey").optional().isString().trim(),
  ]),
  controller.freeRooms
);

module.exports = router;
