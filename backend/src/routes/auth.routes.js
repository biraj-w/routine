/**
 * Auth routes.
 *
 * Read a route and its whole security posture is visible on one line: which
 * middleware runs, what is validated, and what permission is needed.
 *
 * The unauthenticated endpoints are rate-limited: they are the ones an attacker
 * can hammer without credentials.
 */
const express = require("express");
const rateLimit = require("express-rate-limit");

const controller = require("../controllers/auth.controller");
const validator = require("../validators/auth.validator");
const validate = require("../middlewares/validate");
const authenticate = require("../middlewares/authenticate");
const authorize = require("../middlewares/authorize");
const { objectIdParam } = require("../validators/common.validator");
const { PERMISSIONS: P } = require("../config/permissions");
const { ERROR_CODES } = require("../config/constants");

const router = express.Router();

/** Emit the standard envelope rather than express-rate-limit's plain text. */
const limitHandler = (message) => (req, res) =>
  res.status(429).json({ success: false, message, code: ERROR_CODES.RATE_LIMITED });

/**
 * Bound online password guessing against a SINGLE account.
 *
 * Two deliberate choices here:
 *
 * `skipSuccessfulRequests` — only FAILED attempts count. An attacker's attempts
 * fail by definition, so counting successes would punish nobody but legitimate
 * users signing in from several devices.
 *
 * Keyed by IP *and* email, not IP alone. With an IP-only key, ten failed
 * guesses at one account would lock out every other user sharing that address —
 * which on a university network is an entire computer lab behind one NAT. Per
 * (IP, account) buckets mean an attack on one account cannot deny service to
 * another, while still throttling the attack itself.
 *
 * The gap this leaves — an attacker spraying one guess across many accounts gets
 * a fresh bucket per address — is covered by `authIpLimiter` below and, for
 * targeted attacks, by the per-account lockout in auth.service.js.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || "").toLowerCase()}`,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler("Too many failed attempts for this account. Please try again in 15 minutes."),
});

/**
 * Backstop against credential spraying: a per-IP ceiling across every auth
 * endpoint, loose enough never to inconvenience real users but low enough to
 * make thousands of attempts impractical.
 */
const authIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler("Too many requests from this address. Please try again later."),
});

/** Registration and reset: cheap to request, so capped per IP. */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: limitHandler("Too many requests. Please try again later."),
});

/* ── Public ──────────────────────────────────────────────────────────────── */

// Per-IP backstop across every auth endpoint, applied before the specific caps.
router.use(authIpLimiter);

router.post("/register", publicLimiter, validate(validator.register), controller.register);
router.post("/login", loginLimiter, validate(validator.login), controller.login);
router.post("/refresh", validate(validator.refresh), controller.refresh);
router.post("/forgot-password", publicLimiter, validate(validator.forgotPassword), controller.forgotPassword);
router.post("/reset-password", publicLimiter, validate(validator.resetPassword), controller.resetPassword);

/* ── Authenticated ───────────────────────────────────────────────────────── */

router.use(authenticate);

router.get("/me", controller.me);
router.post("/logout", controller.logout);
router.post("/logout-all", controller.logoutAll);

router.patch(
  "/profile",
  authorize(P.UPDATE_OWN_PROFILE),
  validate(validator.updateProfile),
  controller.updateProfile
);

router.post("/change-password", validate(validator.changePassword), controller.changePassword);

router.get("/sessions", controller.listSessions);
router.delete("/sessions/:id", validate([objectIdParam("id")]), controller.revokeSession);

module.exports = router;
