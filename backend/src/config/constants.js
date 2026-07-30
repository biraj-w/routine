/**
 * Domain enumerations shared by models, validators and the frontend.
 */

/**
 * Teaching week, Sunday-first (the Nepali/South Asian academic week, where
 * Saturday is the weekly holiday). Array order drives the routine grid's rows,
 * so index position is meaningful — do not sort this.
 */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/**
 * Routine lifecycle. Transitions are NOT free-form — see
 * ROUTINE_TRANSITIONS below, which is the single authority on what may
 * follow what.
 */
const ROUTINE_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  APPROVED: "approved",
  PUBLISHED: "published",
  ARCHIVED: "archived",
};

/**
 * The state machine. An attempt to move to a status not listed for the current
 * one is a 409, never a silent write.
 *
 *   draft ──submit──► submitted ──approve──► approved ──publish──► published
 *     ▲                   │                                            │
 *     └──────reject───────┘                                     archive┘
 */
const ROUTINE_TRANSITIONS = {
  [ROUTINE_STATUS.DRAFT]: [ROUTINE_STATUS.SUBMITTED],
  [ROUTINE_STATUS.SUBMITTED]: [ROUTINE_STATUS.APPROVED, ROUTINE_STATUS.DRAFT],
  [ROUTINE_STATUS.APPROVED]: [ROUTINE_STATUS.PUBLISHED, ROUTINE_STATUS.DRAFT],
  [ROUTINE_STATUS.PUBLISHED]: [ROUTINE_STATUS.ARCHIVED],
  [ROUTINE_STATUS.ARCHIVED]: [],
};

const TERMS = ["Spring", "Summer", "Fall"];

const ROOM_TYPES = ["Lecture Hall", "Lab", "Seminar Hall", "Auditorium"];

const CLASS_TYPES = ["Lecture", "Lab", "Tutorial"];

const COURSE_TYPES = ["Theory", "Lab", "Project"];

const DESIGNATIONS = [
  "Professor",
  "Associate Professor",
  "Assistant Professor",
  "Lecturer",
  "Visiting Faculty",
];

const USER_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  LOCKED: "locked",
};

/**
 * Lab batch label. A section's lab may split into G1/G2 occupying the same slot
 * in different rooms — which is exactly why the section-conflict index includes
 * groupLabel, and why the duplicate-course rule is a separate check.
 */
const DEFAULT_GROUP_LABEL = "ALL";

const NOTIFICATION_TYPES = {
  ROUTINE_SUBMITTED: "ROUTINE_SUBMITTED",
  ROUTINE_APPROVED: "ROUTINE_APPROVED",
  ROUTINE_REJECTED: "ROUTINE_REJECTED",
  ROUTINE_PUBLISHED: "ROUTINE_PUBLISHED",
  ROUTINE_UPDATED: "ROUTINE_UPDATED",
  ACCOUNT: "ACCOUNT",
  SYSTEM: "SYSTEM",
};

const ACTIVITY_ACTIONS = {
  LOGIN: "LOGIN",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  SUBMIT: "SUBMIT",
  APPROVE: "APPROVE",
  REJECT: "REJECT",
  PUBLISH: "PUBLISH",
  PASSWORD_CHANGE: "PASSWORD_CHANGE",
  PASSWORD_RESET: "PASSWORD_RESET",
  PERMISSION_CHANGE: "PERMISSION_CHANGE",
};

/** Machine-readable error codes returned in the envelope's `code` field. */
const ERROR_CODES = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  TOKEN_MISSING: "TOKEN_MISSING",
  TOKEN_EXPIRED: "TOKEN_EXPIRED", // frontend reacts to this by refreshing
  TOKEN_INVALID: "TOKEN_INVALID",
  SESSION_REVOKED: "SESSION_REVOKED",
  NO_PERMISSION: "NO_PERMISSION",
  OUT_OF_SCOPE: "OUT_OF_SCOPE",
  ROUTINE_CONFLICT: "ROUTINE_CONFLICT",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  REFERENCED: "REFERENCED",
  DUPLICATE_KEY: "DUPLICATE_KEY",
  NOT_FOUND: "NOT_FOUND",
  RATE_LIMITED: "RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
};

module.exports = {
  DAYS,
  ROUTINE_STATUS,
  ROUTINE_TRANSITIONS,
  TERMS,
  ROOM_TYPES,
  CLASS_TYPES,
  COURSE_TYPES,
  DESIGNATIONS,
  USER_STATUS,
  DEFAULT_GROUP_LABEL,
  NOTIFICATION_TYPES,
  ACTIVITY_ACTIONS,
  ERROR_CODES,
};
