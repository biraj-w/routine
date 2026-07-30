/**
 * Activity-log routes — administrative, read-only.
 *
 * withScope() means a Department Admin reads their own department's history while
 * a Super Admin reads everything. The log has no write endpoint: entries are
 * created only by services/activity.service.js as a side effect of real actions,
 * which is what makes it trustworthy as an audit trail.
 */
const express = require("express");
const controller = require("../controllers/notification.controller");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { withScope } = require("../middlewares/scope");
const { paginationQuery } = require("../validators/common.validator");
const { PERMISSIONS: P } = require("../config/permissions");

const router = express.Router();
router.use(authenticate);
router.use(authorize(P.VIEW_ACTIVITY_LOGS));
router.use(withScope());

router.get("/", validate(paginationQuery), controller.activityLogs);

module.exports = router;
