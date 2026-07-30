/**
 * Department routes.
 *
 * The middleware chain on each line is the endpoint's entire security posture,
 * readable without opening another file:
 *
 *   authenticate      who are you?
 *   authorize(P.X)    may you do this at all?
 *   withScope/        which rows may you do it to?
 *   enforceScope
 *   injectScope       (writes) you may not choose someone else's department
 *   validate(...)     is the input well-formed?
 */
const express = require("express");
const controller = require("../controllers/department.controller");
const validator = require("../validators/department.validator");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { withScope, enforceScope, injectScope } = require("../middlewares/scope");
const { objectIdParam } = require("../validators/common.validator");
const { Department } = require("../models");
const { PERMISSIONS: P } = require("../config/permissions");

const router = express.Router();
router.use(authenticate);

/**
 * `field: "_id"` — NOT the default "department".
 *
 * A Department IS the department, so it has no `department` path. The default
 * produced `find({ department: <id> })`, and because config/db.js sets
 * `strictQuery: true` Mongoose STRIPPED that unknown path instead of erroring —
 * so scoping silently became a no-op and a Department Admin listed every
 * department. A scope filter that quietly does nothing is worse than one that
 * throws. The /:id routes below already got this right.
 */
router.get(
  "/",
  authorize(P.VIEW_DEPARTMENTS),
  withScope({ field: "_id" }),
  validate(validator.list),
  controller.list
);

router.get(
  "/:id",
  authorize(P.VIEW_DEPARTMENTS),
  validate([objectIdParam("id")]),
  enforceScope(Department, { field: "_id" }),
  controller.get
);

// Only Super Admin holds Manage Departments, so injectScope is a no-op here —
// kept for consistency, and so the audit fields are stamped centrally.
router.post(
  "/",
  authorize(P.MANAGE_DEPARTMENTS),
  injectScope({ fields: [] }),
  validate(validator.create),
  controller.create
);

router.put(
  "/:id",
  authorize(P.MANAGE_DEPARTMENTS),
  validate([objectIdParam("id"), ...validator.update]),
  enforceScope(Department, { field: "_id" }),
  injectScope({ fields: [] }),
  controller.update
);

router.delete(
  "/:id",
  authorize(P.MANAGE_DEPARTMENTS),
  validate([objectIdParam("id")]),
  enforceScope(Department, { field: "_id" }),
  controller.remove
);

module.exports = router;
