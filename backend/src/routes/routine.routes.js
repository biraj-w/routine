/**
 * Routine routes — the module where the RBAC design earns its keep.
 *
 * Note the permission split down the page:
 *
 *   MANAGE_ROUTINE   build and edit entries      → Department Admin + Super Admin
 *   SUBMIT_ROUTINE   hand it up for approval     → Department Admin + Super Admin
 *   APPROVE_ROUTINE  sign it off                 → Super Admin only
 *   PUBLISH_ROUTINE  make it visible to everyone → Super Admin only
 *
 * If approval and publication shared a permission with editing, the workflow
 * would be decoration — the same person could approve their own work. Separate
 * permissions are what make it a real control.
 *
 * Route ORDER matters here: the literal paths /search and /me must be declared
 * before /:id, or Express would try to parse "search" as an ObjectId.
 */
const express = require("express");
const controller = require("../controllers/routine.controller");
const validator = require("../validators/routine.validator");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { withScope, enforceScope, injectScope } = require("../middlewares/scope");
const { objectIdParam } = require("../validators/common.validator");
const { Routine } = require("../models");
const { PERMISSIONS: P } = require("../config/permissions");

const router = express.Router();
router.use(authenticate);

/* ── Literal paths first ─────────────────────────────────────────────────── */

/** Cross-routine search. Available to every role; results are visibility-filtered. */
router.get(
  "/search",
  authorize(P.SEARCH_ROUTINE, P.VIEW_ROUTINE),
  withScope(),
  validate(validator.search),
  controller.search
);

/** A teacher's or student's own timetable, resolved from their linked profile. */
router.get("/me", authorize(P.VIEW_OWN_ROUTINE, P.VIEW_ROUTINE), controller.myRoutine);

/* ── Routine headers ─────────────────────────────────────────────────────── */

router.get(
  "/",
  authorize(P.VIEW_ROUTINE, P.VIEW_OWN_ROUTINE),
  withScope(),
  validate(validator.list),
  controller.list
);

router.post(
  "/",
  authorize(P.MANAGE_ROUTINE),
  injectScope({ fields: [] }), // department comes from the semester, not the body
  validate(validator.create),
  controller.create
);

router.get(
  "/:id",
  authorize(P.VIEW_ROUTINE, P.VIEW_OWN_ROUTINE),
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.get
);

router.put(
  "/:id",
  authorize(P.MANAGE_ROUTINE),
  validate([objectIdParam("id"), ...validator.update]),
  enforceScope(Routine),
  controller.update
);

router.delete(
  "/:id",
  authorize(P.MANAGE_ROUTINE),
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.remove
);

/* ── Grid and entries ────────────────────────────────────────────────────── */

router.get(
  "/:id/grid",
  authorize(P.VIEW_ROUTINE, P.VIEW_OWN_ROUTINE),
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.grid
);

router.get(
  "/:id/entries",
  authorize(P.VIEW_ROUTINE, P.VIEW_OWN_ROUTINE),
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.listEntries
);

/**
 * Dry-run conflict check. Requires MANAGE_ROUTINE because it is a scheduling
 * tool, and because it reveals who is teaching where.
 */
router.post(
  "/:id/check-conflicts",
  authorize(P.MANAGE_ROUTINE),
  validate([objectIdParam("id"), ...validator.checkConflicts]),
  enforceScope(Routine),
  controller.checkConflicts
);

router.post(
  "/:id/entries",
  authorize(P.MANAGE_ROUTINE),
  validate([objectIdParam("id"), ...validator.createEntry]),
  enforceScope(Routine),
  controller.addEntry
);

router.put(
  "/:id/entries/:entryId",
  authorize(P.MANAGE_ROUTINE),
  validate([...validator.entryParam, ...validator.updateEntry]),
  enforceScope(Routine),
  controller.updateEntry
);

router.delete(
  "/:id/entries/:entryId",
  authorize(P.MANAGE_ROUTINE),
  validate(validator.entryParam),
  enforceScope(Routine),
  controller.removeEntry
);

/* ── Lifecycle ───────────────────────────────────────────────────────────── */

router.post(
  "/:id/submit",
  authorize(P.SUBMIT_ROUTINE),
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.submit
);

router.post(
  "/:id/approve",
  authorize(P.APPROVE_ROUTINE), // Super Admin only
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.approve
);

router.post(
  "/:id/reject",
  authorize(P.APPROVE_ROUTINE),
  validate([objectIdParam("id"), ...validator.reject]),
  enforceScope(Routine),
  controller.reject
);

router.post(
  "/:id/publish",
  authorize(P.PUBLISH_ROUTINE), // Super Admin only
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.publish
);

router.post(
  "/:id/archive",
  authorize(P.PUBLISH_ROUTINE),
  validate([objectIdParam("id")]),
  enforceScope(Routine),
  controller.archive
);

module.exports = router;
