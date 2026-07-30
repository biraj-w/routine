/**
 * NoSQL-injection defence: strip Mongo operator keys from incoming data.
 *
 * Mongoose casts values against the schema, which stops most mischief, but any
 * place a raw request object reaches a query unchecked is exploitable. The
 * classic example is a login body of:
 *
 *   { "email": "admin@univ.edu", "password": { "$ne": null } }
 *
 * If that object reached `User.findOne(req.body)`, `$ne: null` would match any
 * stored password. Removing keys that begin with `$`, and keys containing `.`
 * (which Mongo interprets as a path traversal), closes the whole class.
 *
 * Written by hand rather than pulled from a package: it is a dozen lines, and
 * the point of the exercise is to show the mechanism.
 *
 * Note `req.query` is NOT reassigned — Express 5 makes it a getter-only
 * property. Its keys are scrubbed in place instead.
 */
const logger = require("../utils/logger");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Recursively remove dangerous keys. Returns a new structure for objects and
 * arrays; primitives pass through untouched.
 */
function clean(value, path, removed) {
  if (Array.isArray(value)) {
    return value.map((item, i) => clean(item, `${path}[${i}]`, removed));
  }
  if (!isPlainObject(value)) return value;

  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (key.startsWith("$") || key.includes(".")) {
      removed.push(path ? `${path}.${key}` : key);
      continue;
    }
    out[key] = clean(val, path ? `${path}.${key}` : key, removed);
  }
  return out;
}

function sanitize(req, res, next) {
  const removed = [];

  if (isPlainObject(req.body) || Array.isArray(req.body)) {
    req.body = clean(req.body, "body", removed);
  }
  if (isPlainObject(req.params)) {
    req.params = clean(req.params, "params", removed);
  }
  // Mutate in place: req.query may be a read-only getter.
  if (isPlainObject(req.query)) {
    for (const key of Object.keys(req.query)) {
      if (key.startsWith("$") || key.includes(".")) {
        removed.push(`query.${key}`);
        delete req.query[key];
      }
    }
  }

  if (removed.length) {
    logger.warn(
      `Stripped Mongo operator key(s) from ${req.method} ${req.originalUrl}: ${removed.join(", ")}`
    );
  }
  next();
}

module.exports = sanitize;
