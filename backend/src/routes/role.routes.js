/**
 * Role routes — Super Admin only.
 *
 * Roles are readable by anyone holding "View Roles" (needed to populate a role
 * dropdown), but only "Assign Permissions" may change a role's grants. Editing
 * permissions invalidates the permission cache, so the change takes effect on
 * the next request — the property that makes DB-resolved authorization worth its
 * cost.
 */
const express = require("express");
const { body } = require("express-validator");
const controller = require("../controllers/user.controller");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { objectIdParam } = require("../validators/common.validator");
const { PERMISSIONS: P, ALL_PERMISSIONS, PERMISSION_META } = require("../config/permissions");
const { success } = require("../utils/response");

const router = express.Router();
router.use(authenticate);

router.get("/", authorize(P.VIEW_ROLES), controller.listRoles);

/**
 * The permission catalogue, grouped by module — drives the role editor's
 * checkbox list. Served from config/permissions.js rather than the database, so
 * the UI can never offer a permission the code does not define.
 */
router.get("/permissions", authorize(P.VIEW_ROLES), (req, res) => {
  const grouped = {};
  for (const name of ALL_PERMISSIONS) {
    const meta = PERMISSION_META[name];
    grouped[meta.module] = grouped[meta.module] || [];
    grouped[meta.module].push({ name, description: meta.description });
  }
  return success(res, { data: grouped, message: "Permission catalogue fetched" });
});

router.put(
  "/:id/permissions",
  authorize(P.ASSIGN_PERMISSIONS),
  validate([
    objectIdParam("id"),
    body("permissions").isArray().withMessage("permissions must be an array of permission names"),
    body("permissions.*").isString().trim().notEmpty(),
  ]),
  controller.setRolePermissions
);

module.exports = router;
