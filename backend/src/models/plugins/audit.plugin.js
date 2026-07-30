/**
 * Audit-field plugin: who created and who last modified each document.
 *
 * Applied to every master-data and routine schema so the fields are declared
 * once rather than copied into eleven files. `createdAt`/`updatedAt` come from
 * Mongoose's own `timestamps: true`, set in each schema's options.
 *
 * The values are populated centrally by middlewares/scope.js (injectScope),
 * so controllers never assign them by hand and cannot forget to.
 */
const { Schema } = require("mongoose");

module.exports = function auditPlugin(schema) {
  schema.add({
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  });
};
