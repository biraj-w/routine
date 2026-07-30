/**
 * Teacher routes — department-scoped, with an extra availability endpoint.
 *
 * Written out rather than built, because the controller is hand-written and has
 * a sixth action.
 */
const express = require("express");
const controller = require("../controllers/teacher.controller");
const { teacher: validator } = require("../validators/profile.validator");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { withScope, enforceScope, injectScope } = require("../middlewares/scope");
const { objectIdParam } = require("../validators/common.validator");
const { Teacher } = require("../models");
const { PERMISSIONS: P } = require("../config/permissions");

const router = express.Router();
router.use(authenticate);

router.get("/", authorize(P.VIEW_TEACHERS), withScope(), validate(validator.list), controller.list);

router.get(
  "/:id",
  authorize(P.VIEW_TEACHERS),
  validate([objectIdParam("id")]),
  enforceScope(Teacher),
  controller.get
);

router.post(
  "/",
  authorize(P.MANAGE_TEACHERS),
  injectScope(),
  validate(validator.create),
  controller.create
);

router.put(
  "/:id",
  authorize(P.MANAGE_TEACHERS),
  validate([objectIdParam("id"), ...validator.update]),
  enforceScope(Teacher),
  injectScope(),
  controller.update
);

/** Declared unavailability — advisory, surfaced as a scheduling warning. */
router.put(
  "/:id/availability",
  authorize(P.MANAGE_TEACHERS),
  validate([objectIdParam("id"), ...validator.availability]),
  enforceScope(Teacher),
  controller.setAvailability
);

router.delete(
  "/:id",
  authorize(P.MANAGE_TEACHERS),
  validate([objectIdParam("id")]),
  enforceScope(Teacher),
  controller.remove
);

module.exports = router;
