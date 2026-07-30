/**
 * Role — a named bundle of permissions plus a data scope.
 *
 * ── Modelling note (documented in docs/architecture.md) ────────────────────
 * A relational design would need a `role_permissions` join table. In a document
 * database the many-to-many collapses into an array of references on the owning
 * side: a role is always read together with its permissions, the array is small
 * and bounded (~30 entries), and a single `.populate('permissions')` replaces a
 * join. The `permissions` array below IS the join table.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * `dataScope` is the second half of authorization and the reason this project
 * needs no per-controller department checks:
 *
 *     permissions  →  WHAT this role may do        ("Manage Courses")
 *     dataScope    →  WHICH ROWS it may do it to   (own department only)
 *
 * See src/middlewares/scope.js for the mechanism that consumes it.
 */
const { Schema, model } = require("mongoose");
const { auditPlugin, toJSONPlugin } = require("./plugins");
const { DATA_SCOPES } = require("../config/roles");

const roleSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Role name is required"],
      unique: true,
      trim: true,
    },
    description: { type: String, trim: true, default: "" },

    permissions: [
      {
        type: Schema.Types.ObjectId,
        ref: "Permission",
      },
    ],

    dataScope: {
      type: String,
      required: true,
      enum: {
        values: Object.values(DATA_SCOPES),
        message: "dataScope must be one of: global, department, self",
      },
      default: DATA_SCOPES.SELF,
    },

    /**
     * System roles underpin the authorization model, so the app refuses to
     * delete them (see role.controller.js). Custom roles added later are
     * deletable.
     */
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true, collection: "roles" }
);

roleSchema.plugin(auditPlugin);
roleSchema.plugin(toJSONPlugin);

/** Convenience for logging and the role-editor UI. */
roleSchema.virtual("permissionCount").get(function permissionCount() {
  return Array.isArray(this.permissions) ? this.permissions.length : 0;
});

module.exports = model("Role", roleSchema);
