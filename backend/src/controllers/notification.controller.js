/**
 * Notifications and the activity log.
 *
 * Notifications are strictly personal: every query is pinned to
 * `recipient: req.auth.userId`, so there is no way to read someone else's inbox
 * regardless of role. The activity log is the opposite — an administrative view,
 * department-scoped so a Department Admin sees their own department's history.
 */
const { Notification, ActivityLog } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { success, paginated } = require("../utils/response");
const { buildListQuery, paginate } = require("../utils/queryFeatures");
const { scoped } = require("../middlewares/scope");

/** GET /api/notifications?unread=true */
exports.list = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    allowedFilters: ["isRead", "type"],
    allowedSorts: ["createdAt"],
    defaultSort: "-createdAt",
  });

  // Pinned to the caller — never scoped by department or role.
  const filter = { ...options.filter, recipient: req.auth.userId };
  if (req.query.unread === "true") filter.isRead = false;

  const { items, meta } = await paginate(Notification, filter, options);
  const unreadCount = await Notification.countDocuments({
    recipient: req.auth.userId,
    isRead: false,
  });

  return paginated(res, items, { ...meta, unreadCount }, "Notifications fetched");
});

/** GET /api/notifications/unread-count — drives the header badge. */
exports.unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({ recipient: req.auth.userId, isRead: false });
  return success(res, { data: { unreadCount: count }, message: "Unread count fetched" });
});

/** PATCH /api/notifications/:id/read */
exports.markRead = asyncHandler(async (req, res) => {
  const notification = await Notification.findOne({
    _id: req.params.id,
    recipient: req.auth.userId,
  });
  // 404 rather than 403: another user's notification should not be discoverable.
  if (!notification) throw ApiError.notFound("Notification not found");

  await notification.markRead();
  return success(res, { data: notification, message: "Marked as read" });
});

/** PATCH /api/notifications/read-all */
exports.markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.auth.userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );
  return success(res, {
    data: { updated: result.modifiedCount || 0 },
    message: "All notifications marked as read",
  });
});

/**
 * GET /api/activity-logs
 *
 * Requires "View Activity Logs". Department-scoped, so a Department Admin sees
 * their own department's history and a Super Admin sees everything.
 */
exports.activityLogs = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    searchFields: ["actorEmail", "actorName", "description"],
    allowedFilters: ["action", "entityType", "actor", "status"],
    allowedSorts: ["createdAt", "action"],
    defaultSort: "-createdAt",
    maxLimit: 200,
  });

  const { items, meta } = await paginate(ActivityLog, scoped(req, options.filter), {
    ...options,
    populate: [{ path: "actor", select: "name email" }],
  });

  return paginated(res, items, meta, "Activity log fetched");
});
