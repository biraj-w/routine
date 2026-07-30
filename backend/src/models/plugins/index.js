/**
 * Plugin bundle.
 *
 * `applyCommonPlugins(schema)` is what nearly every schema in this project
 * calls: audit fields, soft delete and response shaping in one line. Schemas
 * that should NOT be soft-deletable (ActivityLog is append-only, Session is
 * revoked rather than deleted) apply the plugins individually.
 */
const auditPlugin = require("./audit.plugin");
const softDeletePlugin = require("./softDelete.plugin");
const toJSONPlugin = require("./toJSON.plugin");

function applyCommonPlugins(schema) {
  schema.plugin(auditPlugin);
  schema.plugin(softDeletePlugin);
  schema.plugin(toJSONPlugin);
}

module.exports = { auditPlugin, softDeletePlugin, toJSONPlugin, applyCommonPlugins };
