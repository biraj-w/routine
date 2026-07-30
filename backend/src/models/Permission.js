/**
 * Permission — an atomic capability, e.g. "Manage Routine".
 *
 * `name` IS the string passed to authorize() in the route files. There is
 * deliberately no separate machine `code` field: one identifier means one thing
 * to keep in sync. Typos are prevented not by a second column but by
 * config/permissions.js, which exports every string as a constant and is the
 * only place they are written literally.
 *
 * Rows are created by the seeder from that catalogue and are effectively
 * read-only at runtime — what changes is which permissions a ROLE holds.
 */
const { Schema, model } = require("mongoose");
const { toJSONPlugin } = require("./plugins");
const { PERMISSION_MODULES } = require("../config/permissions");

const permissionSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, "Permission name is required"],
      unique: true,
      trim: true,
    },
    module: {
      type: String,
      required: true,
      enum: {
        values: PERMISSION_MODULES,
        message: "{VALUE} is not a recognised permission module",
      },
      index: true,
    },
    description: { type: String, trim: true, default: "" },
  },
  { timestamps: true, collection: "permissions" }
);

// Not soft-deletable: the catalogue is fixed by the code, and a "deleted"
// permission that routes still reference would be a silent security hole.
permissionSchema.plugin(toJSONPlugin);

module.exports = model("Permission", permissionSchema);
