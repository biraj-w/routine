/**
 * Notification — one message for one recipient.
 *
 * ── Fan-out on write ───────────────────────────────────────────────────────
 * Publishing a routine notifies every affected teacher and student, and this is
 * modelled as one document PER RECIPIENT rather than one document with a
 * `recipients[]` array. The array version looks cheaper but makes the two most
 * common operations awkward: an unread count becomes an aggregation over array
 * elements, and "mark as read" becomes a positional array update. With one row
 * each, both are single-document operations served by one index.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { Schema, model } = require("mongoose");
const { toJSONPlugin } = require("./plugins");
const { NOTIFICATION_TYPES } = require("../config/constants");

const notificationSchema = new Schema(
  {
    recipient: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      enum: Object.values(NOTIFICATION_TYPES),
      default: NOTIFICATION_TYPES.SYSTEM,
    },

    title: { type: String, required: true, trim: true, maxlength: 150 },
    message: { type: String, required: true, trim: true, maxlength: 500 },

    /**
     * Polymorphic pointer to whatever this is about, e.g.
     * { kind: 'Routine', id: ... }. Embedded because it has no identity of its
     * own and is meaningless apart from its notification.
     */
    entity: {
      kind: { type: String, default: null },
      id: { type: Schema.Types.ObjectId, default: null },
    },

    /** Frontend deep link, e.g. "/pages/routine.html?routine=<id>". */
    link: { type: String, trim: true, default: "" },

    isRead: { type: Boolean, default: false },
    readAt: { type: Date, default: null },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true, collection: "notifications" }
);

// Read/unread rather than deleted, so no soft-delete plugin.
notificationSchema.plugin(toJSONPlugin);

/** Serves the unread badge and the notification list in one index. */
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 }, { name: "idx_notification_inbox" });

/** Housekeeping: notifications self-expire after 90 days. */
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90, name: "ttl_notification" });

notificationSchema.methods.markRead = function markRead() {
  if (this.isRead) return this;
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

module.exports = model("Notification", notificationSchema);
