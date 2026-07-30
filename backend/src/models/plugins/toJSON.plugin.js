/**
 * Response-shaping plugin.
 *
 * Normalises what leaves the API:
 *   - `id` alongside `_id`, so frontend code can use a conventional name
 *   - `__v` removed (Mongoose bookkeeping, meaningless to a client)
 *   - `passwordHash` and reset-token fields removed unconditionally
 *
 * The password removal is belt-and-braces. `passwordHash` is already
 * `select: false` on the User schema, but a field can reappear through an
 * explicit `.select('+passwordHash')` during login, and one careless
 * `res.json(user)` would then publish it. Stripping it here means it cannot
 * leave through the JSON path at all.
 */
const SENSITIVE_FIELDS = [
  "passwordHash",
  "password",
  "passwordResetToken",
  "passwordResetExpires",
  "refreshTokenHash",
];

module.exports = function toJSONPlugin(schema) {
  const existingTransform = schema.get("toJSON")?.transform;

  schema.set("toJSON", {
    virtuals: true,
    versionKey: false,
    transform(doc, ret, options) {
      ret.id = ret._id ? String(ret._id) : ret.id;
      delete ret.__v;
      for (const field of SENSITIVE_FIELDS) delete ret[field];
      return existingTransform ? existingTransform(doc, ret, options) : ret;
    },
  });
};

module.exports.SENSITIVE_FIELDS = SENSITIVE_FIELDS;
