/**
 * User and role routes — Super Admin only.
 *
 * There is deliberately NO scoping middleware here. Department scoping exists to
 * let a department admin manage their own department's academic data; user
 * accounts and roles are institution-wide and grant privilege, so they are
 * gated purely by permission. A Department Admin holds neither "Manage Users"
 * nor "Manage Roles" and so never reaches these handlers at all.
 */
const express = require("express");
const { body } = require("express-validator");
const controller = require("../controllers/user.controller");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const {
  objectIdParam,
  paginationQuery,
  emailRules,
  passwordRules,
  existsAndActive,
} = require("../validators/common.validator");
const { PERMISSIONS: P } = require("../config/permissions");
const { USER_STATUS } = require("../config/constants");

const router = express.Router();
router.use(authenticate);

const createRules = [
  body("name").isString().bail().trim().isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  emailRules("email"),
  passwordRules("password"),
  body("role").isMongoId().withMessage("A role is required").bail().custom(existsAndActive("Role")),
  body("department").optional({ nullable: true }).custom(async (value) => {
    if (!value) return true;
    return existsAndActive("Department")(value);
  }),
  body("phone").optional().trim().isLength({ max: 20 }),
  body("status").optional().isIn(Object.values(USER_STATUS))
    .withMessage(`Status must be one of: ${Object.values(USER_STATUS).join(", ")}`),
];

const updateRules = [
  body("name").optional().trim().isLength({ min: 2, max: 100 }),
  body("email").optional().isEmail().withMessage("Please provide a valid email address")
    .bail().normalizeEmail({ gmail_remove_dots: false }),
  // Optional on update: an administrator resetting someone's password.
  body("password").optional({ checkFalsy: true }).isLength({ min: 8, max: 72 })
    .withMessage("Password must be between 8 and 72 characters"),
  body("role").optional().isMongoId().bail().custom(existsAndActive("Role")),
  body("department").optional({ nullable: true }).custom(async (value) => {
    if (!value) return true;
    return existsAndActive("Department")(value);
  }),
  body("phone").optional().trim().isLength({ max: 20 }),
  body("status").optional().isIn(Object.values(USER_STATUS)),
];

/* ── Users ───────────────────────────────────────────────────────────────── */

router.get("/", authorize(P.VIEW_USERS), validate(paginationQuery), controller.list);
router.get("/:id", authorize(P.VIEW_USERS), validate([objectIdParam("id")]), controller.get);
router.post("/", authorize(P.MANAGE_USERS), validate(createRules), controller.create);
router.put(
  "/:id",
  authorize(P.MANAGE_USERS),
  validate([objectIdParam("id"), ...updateRules]),
  controller.update
);
router.delete("/:id", authorize(P.MANAGE_USERS), validate([objectIdParam("id")]), controller.remove);

module.exports = router;
