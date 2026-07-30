/**
 * Validation chains for the auth endpoints.
 *
 * Note what is NOT here: `role`. Registration must never accept a role from the
 * client, so rather than validating the field it is stripped by the controller.
 * Validating it would imply it is an accepted input.
 */
const { body } = require("express-validator");
const {
  emailRules,
  passwordRules,
  requiredString,
  existsAndActive,
} = require("./common.validator");

exports.register = [
  requiredString("name", { min: 2, max: 100, label: "Name" }),
  emailRules("email"),
  passwordRules("password"),
  body("phone").optional().trim().isLength({ max: 20 }).withMessage("Phone must be at most 20 characters"),

  // A self-registering student may supply their enrolment details, but all
  // three are needed to create a usable profile.
  body("department").optional().isMongoId().bail().custom(existsAndActive("Department")),
  body("semester").optional().isMongoId().bail().custom(existsAndActive("Semester")),
  body("rollNo").optional().trim().isLength({ min: 2, max: 25 })
    .withMessage("Roll number must be between 2 and 25 characters"),
  body("section").optional().trim().isLength({ max: 5 })
    .withMessage("Section must be at most 5 characters"),
  body().custom((value) => {
    const supplied = ["department", "semester", "rollNo"].filter((k) => value[k]);
    if (supplied.length && supplied.length < 3) {
      throw new Error("department, semester and rollNo must all be provided together");
    }
    return true;
  }),
];

exports.login = [
  body("email").isString().trim().notEmpty().withMessage("Email is required").toLowerCase(),
  // No strength rules on login — an old password that predates the current
  // policy must still be able to sign in.
  body("password").isString().notEmpty().withMessage("Password is required"),
];

exports.refresh = [
  body("refreshToken").isString().trim().notEmpty().withMessage("Refresh token is required"),
];

exports.changePassword = [
  body("currentPassword").isString().notEmpty().withMessage("Your current password is required"),
  passwordRules("newPassword"),
];

exports.forgotPassword = [emailRules("email")];

exports.resetPassword = [
  body("token").isString().trim().notEmpty().withMessage("Reset token is required"),
  passwordRules("newPassword"),
];

exports.updateProfile = [
  body("name").optional().trim().isLength({ min: 2, max: 100 })
    .withMessage("Name must be between 2 and 100 characters"),
  body("phone").optional().trim().isLength({ max: 20 })
    .withMessage("Phone must be at most 20 characters"),
];
