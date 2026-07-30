/**
 * Runs express-validator chains and converts failures into the standard
 * envelope.
 *
 * Usage in a route file, which keeps the rules visible next to the endpoint:
 *
 *   router.post('/', validate(departmentValidator.create), controller.create);
 *
 * The output shape is always `errors: [{ field, message, value }]`, which the
 * frontend's UI.showFieldErrors() pins to the matching input — so a validation
 * failure lands on the offending box rather than as a generic toast.
 *
 * This is layer 1 of three. See docs/architecture.md:
 *   1. request layer  — these chains: presence, type, format, range
 *   2. schema layer   — Mongoose required/enum/min/match + unique indexes
 *   3. business layer — services: conflict detection, lifecycle legality, scope
 */
const { validationResult } = require("express-validator");
const ApiError = require("../utils/ApiError");

function validate(chains) {
  const list = Array.isArray(chains) ? chains : [chains];

  return [
    ...list,
    function collectErrors(req, res, next) {
      const result = validationResult(req);
      if (result.isEmpty()) return next();

      // onlyFirstError: one message per field, so a single bad value does not
      // produce four stacked complaints about the same input.
      const errors = result.array({ onlyFirstError: true }).map((e) => ({
        field: e.path,
        message: e.msg,
        // Never echo back what the user typed for secret fields.
        value: /password|token|secret/i.test(e.path || "") ? undefined : e.value,
      }));

      return next(ApiError.validation("Validation failed", errors));
    },
  ];
}

module.exports = validate;
