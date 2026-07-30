/**
 * MIRROR of backend/src/config/permissions.js.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE INVARIANT: everything in this file is COSMETIC.
 *
 *  These strings decide which buttons and menu items are shown. They decide
 *  NOTHING about what is allowed. Every API endpoint re-derives the caller's
 *  permissions from the database on each request (see
 *  backend/src/middlewares/authenticate.js), so removing an element here does
 *  not protect the operation behind it, and editing this file in devtools grants
 *  nothing.
 *
 *  If this mirror ever drifts from the backend, the symptom is a visible button
 *  that returns 403 — annoying, not dangerous.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The authoritative list of what the CURRENT user holds arrives from
 * /api/auth/login and /api/auth/me as `user.permissions`, and is read through
 * Auth.hasPermission(). This file exists only so page code can name a permission
 * without typing the string literal.
 */
window.PERM = {
  // Users and roles
  VIEW_USERS: "View Users",
  MANAGE_USERS: "Manage Users",
  VIEW_ROLES: "View Roles",
  MANAGE_ROLES: "Manage Roles",
  ASSIGN_PERMISSIONS: "Assign Permissions",

  // Master data
  VIEW_DEPARTMENTS: "View Departments",
  MANAGE_DEPARTMENTS: "Manage Departments",
  VIEW_SEMESTERS: "View Semesters",
  MANAGE_SEMESTERS: "Manage Semesters",
  VIEW_COURSES: "View Courses",
  MANAGE_COURSES: "Manage Courses",
  VIEW_TEACHERS: "View Teachers",
  MANAGE_TEACHERS: "Manage Teachers",
  VIEW_STUDENTS: "View Students",
  MANAGE_STUDENTS: "Manage Students",
  VIEW_ROOMS: "View Rooms",
  MANAGE_ROOMS: "Manage Rooms",
  VIEW_TIMESLOTS: "View Timeslots",
  MANAGE_TIMESLOTS: "Manage Timeslots",

  // Routine
  VIEW_ROUTINE: "View Routine",
  VIEW_OWN_ROUTINE: "View Own Routine",
  SEARCH_ROUTINE: "Search Routine",
  MANAGE_ROUTINE: "Manage Routine",
  SUBMIT_ROUTINE: "Submit Routine",
  APPROVE_ROUTINE: "Approve Routine",
  PUBLISH_ROUTINE: "Publish Routine",

  // Reporting and misc
  VIEW_DASHBOARD: "View Dashboard",
  VIEW_REPORTS: "View Reports",
  UPDATE_OWN_PROFILE: "Update Own Profile",
  VIEW_NOTIFICATIONS: "View Notifications",
  VIEW_ACTIVITY_LOGS: "View Activity Logs",
};

/** Role names, for the rare case where a role rather than a permission matters. */
window.ROLE = {
  SUPER_ADMIN: "Super Admin",
  DEPARTMENT_ADMIN: "Department Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

/** Teaching week — must match backend/src/config/constants.js DAYS. */
window.DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
