/**
 * Builds the five standard REST routes with the full middleware chain.
 *
 * The counterpart to utils/crudFactory.js: that generates the handlers, this
 * wires them up. Each calling module still names its own permissions and model
 * explicitly, so the security posture of a resource is visible in its own route
 * file — which is the property that matters. What is removed is six copies of
 * identical plumbing.
 *
 * The chain, in order:
 *   authenticate → authorize → validate → enforceScope → injectScope → handler
 *
 * validate runs BEFORE enforceScope so a malformed id is reported as a
 * validation error rather than reaching a database lookup.
 */
const express = require("express");
const validate = require("../../middlewares/validate");
const authenticate = require("../../middlewares/authenticate");
const authorize = require("../../middlewares/authorize");
const { withScope, enforceScope, loadDoc, injectScope } = require("../../middlewares/scope");
const { objectIdParam } = require("../../validators/common.validator");

/**
 * @param {Object}   cfg
 * @param {Model}    cfg.Model
 * @param {Object}   cfg.controller       { list, get, create, update, remove }
 * @param {Object}   cfg.validator        { list, create, update }
 * @param {string}   cfg.viewPermission
 * @param {string}   cfg.managePermission
 * @param {string[]} cfg.scopeFields      body fields injectScope overwrites
 * @param {string}   cfg.scopeField       document field holding the department
 * @param {boolean}  cfg.allowGlobalNull  treat department:null as shared
 * @param {boolean}  cfg.scoped           apply department scoping at all
 */
function buildCrudRoutes({
  Model,
  controller,
  validator,
  viewPermission,
  managePermission,
  scopeFields = ["department"],
  scopeField = "department",
  allowGlobalNull = false,
  scoped = true,
}) {
  const router = express.Router();
  router.use(authenticate);

  const scopeRead = scoped ? [withScope({ field: scopeField, allowGlobalNull })] : [];

  // A scoped resource verifies ownership; an institution-wide one is merely
  // loaded. Using enforceScope for both would wrongly stop a department admin
  // from reading a shared room.
  const loadOne = scoped
    ? [enforceScope(Model, { field: scopeField, allowGlobalNull })]
    : [loadDoc(Model)];

  router.get("/", authorize(viewPermission), ...scopeRead, validate(validator.list), controller.list);

  router.get(
    "/:id",
    authorize(viewPermission),
    validate([objectIdParam("id")]),
    ...loadOne,
    controller.get
  );

  router.post(
    "/",
    authorize(managePermission),
    injectScope({ fields: scopeFields }),
    validate(validator.create),
    controller.create
  );

  router.put(
    "/:id",
    authorize(managePermission),
    validate([objectIdParam("id"), ...validator.update]),
    ...loadOne,
    injectScope({ fields: scopeFields }),
    controller.update
  );

  router.delete(
    "/:id",
    authorize(managePermission),
    validate([objectIdParam("id")]),
    ...loadOne,
    controller.remove
  );

  return router;
}

module.exports = { buildCrudRoutes };
