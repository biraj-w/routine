/**
 * ActivityLog — append-only audit trail.
 *
 * ── Why the actor's details are duplicated ─────────────────────────────────
 * `actor` references a User, but `actorEmail`, `actorName` and `actorRole` are
 * SNAPSHOTS taken at the time of the action. An audit log has to remain
 * readable after the account is deactivated or renamed, and it must record the
 * role the user held WHEN they acted, not the role they hold now. A populate
 * would quietly rewrite history.
 *
 * `actor` is nullable so a failed login with an unknown email can still be
 * recorded — precisely the event worth keeping.
 *
 * No soft delete: entries are never modified or removed, and `createdAt` is
 * immutable. `updatedAt` is switched off because nothing here is ever updated.
 *
 * `changes` stores only the fields that actually changed, never a whole
 * document — a full snapshot would bloat the collection and risk copying a
 * password hash into a readable log.
 */
const { Schema, model } = require("mongoose");
const { toJSONPlugin } = require("./plugins");
const { ACTIVITY_ACTIONS } = require("../config/constants");

const activityLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },

    // Snapshots — see the note above.
    actorEmail: { type: String, default: "", trim: true },
    actorName: { type: String, default: "", trim: true },
    actorRole: { type: String, default: "", trim: true },

    action: {
      type: String,
      required: true,
      enum: Object.values(ACTIVITY_ACTIONS),
      index: true,
    },

    entityType: { type: String, default: "", trim: true },
    entityId: { type: Schema.Types.ObjectId, default: null },

    description: { type: String, default: "", trim: true, maxlength: 300 },

    /** Changed fields only. */
    changes: {
      before: { type: Schema.Types.Mixed, default: null },
      after: { type: Schema.Types.Mixed, default: null },
    },

    /** Lets a department admin read their own department's log. */
    department: { type: Schema.Types.ObjectId, ref: "Department", default: null, index: true },

    ipAddress: { type: String, default: "" },
    userAgent: { type: String, default: "" },

    status: { type: String, enum: ["SUCCESS", "FAILURE"], default: "SUCCESS" },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "activity_logs",
  }
);

activityLogSchema.plugin(toJSONPlugin);

activityLogSchema.path("createdAt").immutable(true);

activityLogSchema.index({ actor: 1, createdAt: -1 }, { name: "idx_log_actor" });
activityLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 }, { name: "idx_log_entity" });
activityLogSchema.index({ action: 1, createdAt: -1 }, { name: "idx_log_action" });
activityLogSchema.index({ department: 1, createdAt: -1 }, { name: "idx_log_department" });

module.exports = model("ActivityLog", activityLogSchema);
