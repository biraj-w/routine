/**
 * Activity log writer.
 *
 * ── Fire-and-forget by design ──────────────────────────────────────────────
 * `record()` never throws and never awaits its own write on the request path. A
 * failure to log must not turn a successful routine update into a 500 — the
 * audit trail is important, but it is not more important than the operation it
 * describes. Failures are logged to the console instead.
 *
 * Actor details are SNAPSHOT rather than referenced, so the log stays readable
 * after an account is renamed or deactivated, and records the role the user held
 * at the time. See models/ActivityLog.js.
 */
const { ActivityLog } = require("../models");
const logger = require("../utils/logger");
const { ACTIVITY_ACTIONS } = require("../config/constants");

/** Fields never written into an audit diff, no matter what changed. */
const REDACTED = ["passwordHash", "password", "passwordResetToken", "refreshTokenHash"];

/**
 * Reduce two documents to only what actually differs.
 *
 * Storing whole documents would bloat the collection and risk copying a password
 * hash into a readable log, so only changed fields are kept.
 */
function diff(before = {}, after = {}) {
  const changedBefore = {};
  const changedAfter = {};

  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (REDACTED.includes(key)) continue;
    if (["updatedAt", "createdAt", "__v", "updatedBy"].includes(key)) continue;

    const a = before?.[key];
    const b = after?.[key];
    // String comparison handles ObjectIds and Dates, which are never === equal.
    if (String(a) !== String(b)) {
      changedBefore[key] = a;
      changedAfter[key] = b;
    }
  }

  return Object.keys(changedAfter).length ? { before: changedBefore, after: changedAfter } : null;
}

/**
 * Write one audit entry.
 *
 * @param {Object}  params
 * @param {Object}  [params.req]         request, for actor snapshot + IP/agent
 * @param {string}   params.action       one of ACTIVITY_ACTIONS
 * @param {string}  [params.entityType]
 * @param {any}     [params.entityId]
 * @param {string}  [params.description]
 * @param {Object}  [params.changes]     result of diff()
 * @param {any}     [params.department]
 * @param {string}  [params.status]      SUCCESS | FAILURE
 * @param {Object}  [params.actorOverride] for events with no authenticated user
 *                                         (e.g. a failed login)
 */
function record({
  req = null,
  action,
  entityType = "",
  entityId = null,
  description = "",
  changes = null,
  department = null,
  status = "SUCCESS",
  actorOverride = null,
}) {
  const auth = req?.auth;

  const payload = {
    actor: actorOverride?.id ?? auth?.userId ?? null,
    actorEmail: actorOverride?.email ?? auth?.user?.email ?? "",
    actorName: actorOverride?.name ?? auth?.user?.name ?? "",
    actorRole: actorOverride?.role ?? auth?.roleName ?? "",
    action,
    entityType,
    entityId,
    description,
    changes: changes || { before: null, after: null },
    department: department ?? auth?.departmentId ?? null,
    ipAddress: req?.ip || req?.socket?.remoteAddress || "",
    userAgent: req?.headers?.["user-agent"] || "",
    status,
  };

  // Deliberately not awaited.
  ActivityLog.create(payload).catch((err) => {
    logger.error(`Failed to write activity log (${action}):`, err.message);
  });
}

module.exports = { record, diff, ACTIONS: ACTIVITY_ACTIONS };
