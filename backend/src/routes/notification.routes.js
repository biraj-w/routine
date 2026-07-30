/**
 * Notification routes — personal inbox, always pinned to the caller.
 */
const express = require("express");
const controller = require("../controllers/notification.controller");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { objectIdParam, paginationQuery } = require("../validators/common.validator");
const { PERMISSIONS: P } = require("../config/permissions");

const router = express.Router();
router.use(authenticate);
router.use(authorize(P.VIEW_NOTIFICATIONS));

// Literal path before /:id, so "unread-count" is not parsed as an id.
router.get("/unread-count", controller.unreadCount);
router.get("/", validate(paginationQuery), controller.list);
router.patch("/read-all", controller.markAllRead);
router.patch("/:id/read", validate([objectIdParam("id")]), controller.markRead);

module.exports = router;
