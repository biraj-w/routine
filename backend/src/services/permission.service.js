/**
 * Resolves a role's permission set, with a short-lived in-process cache.
 *
 * ── Why resolve from the database at all? ───────────────────────────────────
 * The alternative is to embed permissions in the JWT and trust them. That is
 * cheaper but wrong for this system: a permission revoked by a Super Admin
 * would keep working until every affected token expired. Resolving per request
 * means a change takes effect on the very next call — which is also the single
 * most convincing thing to demonstrate in a viva.
 *
 * ── Why the cache is safe ──────────────────────────────────────────────────
 * Permissions change on the order of never, while requests arrive constantly,
 * so a 60-second TTL removes essentially all the cost. The cache is also
 * invalidated EXPLICITLY whenever a role is written (role.controller.js calls
 * invalidateRole), so the TTL is only a backstop for changes made outside the
 * app — e.g. directly in Compass.
 *
 * A Map in process memory is the right scope here: single-process deployment,
 * and a cold start costs one query per role.
 */
const { Role } = require("../models");
const logger = require("../utils/logger");

const TTL_MS = 60 * 1000;

/** roleId (string) → { permissions: Set<string>, dataScope: string, name: string, at: number } */
const cache = new Map();

/**
 * @param {string|ObjectId} roleId
 * @returns {Promise<{permissions: Set<string>, dataScope: string, name: string}|null>}
 */
async function resolveRole(roleId) {
  const key = String(roleId);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;

  const role = await Role.findById(roleId).populate("permissions", "name").lean();
  if (!role) return null;

  const entry = {
    // A Set gives O(1) `.has()` in authorize(), called on every guarded route.
    permissions: new Set((role.permissions || []).map((p) => p.name).filter(Boolean)),
    dataScope: role.dataScope,
    name: role.name,
    at: Date.now(),
  };
  cache.set(key, entry);
  return entry;
}

/** Convenience wrapper when only the permission set is needed. */
async function getPermissionsForRole(roleId) {
  const resolved = await resolveRole(roleId);
  return resolved ? resolved.permissions : new Set();
}

/** Drop one role from the cache. Call after any write that changes its grants. */
function invalidateRole(roleId) {
  const removed = cache.delete(String(roleId));
  if (removed) logger.debug(`Permission cache invalidated for role ${roleId}`);
}

/** Drop everything — used by the seeder after rewriting the role matrix. */
function invalidateAll() {
  cache.clear();
  logger.debug("Permission cache cleared");
}

module.exports = { resolveRole, getPermissionsForRole, invalidateRole, invalidateAll, TTL_MS };
