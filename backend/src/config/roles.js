/**
 * Role definitions and the role → permission matrix.
 *
 * ── The key idea in this file ──────────────────────────────────────────────
 * `dataScope` separates WHAT a role may do from WHICH ROWS it may do it to.
 *
 *   permissions  →  "may this user manage courses at all?"
 *   dataScope    →  "which department's courses?"
 *
 * Because scope is a data attribute of the role rather than a hardcoded
 * `if (role === 'Department Admin')`, the scoping middleware
 * (src/middlewares/scope.js) works for any role added later without touching a
 * single controller. "Own department" is therefore NOT a permission.
 * ──────────────────────────────────────────────────────────────────────────
 */
const { PERMISSIONS: P, ALL_PERMISSIONS } = require("./permissions");

/** Row visibility for a role. */
const DATA_SCOPES = {
  GLOBAL: "global", // every row, every department
  DEPARTMENT: "department", // only rows belonging to the user's own department
  SELF: "self", // only rows belonging to the user personally
};

const ROLES = {
  SUPER_ADMIN: "Super Admin",
  DEPARTMENT_ADMIN: "Department Admin",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

/**
 * Department Admin: full authority over their own department's academic data,
 * but cannot touch users, roles, departments, rooms or time slots (those are
 * institution-wide), and critically cannot APPROVE or PUBLISH a routine — they
 * build and submit it, a Super Admin signs it off. That separation is the
 * whole point of having an approval workflow.
 */
const DEPARTMENT_ADMIN_PERMISSIONS = [
  P.VIEW_DEPARTMENTS,
  P.VIEW_SEMESTERS,
  P.MANAGE_SEMESTERS,
  P.VIEW_COURSES,
  P.MANAGE_COURSES,
  P.VIEW_TEACHERS,
  P.MANAGE_TEACHERS,
  P.VIEW_STUDENTS,
  P.MANAGE_STUDENTS,
  P.VIEW_ROOMS,
  P.VIEW_TIMESLOTS,
  P.VIEW_ROUTINE,
  P.SEARCH_ROUTINE,
  P.MANAGE_ROUTINE,
  P.SUBMIT_ROUTINE,
  P.VIEW_DASHBOARD,
  P.VIEW_REPORTS,
  P.UPDATE_OWN_PROFILE,
  P.VIEW_NOTIFICATIONS,
  P.VIEW_ACTIVITY_LOGS,
];

/** Teacher: reads their own timetable, edits their own profile. No writes. */
const TEACHER_PERMISSIONS = [
  P.VIEW_OWN_ROUTINE,
  P.SEARCH_ROUTINE,
  P.VIEW_COURSES,
  P.VIEW_TIMESLOTS,
  P.VIEW_ROOMS,
  P.VIEW_DASHBOARD,
  P.VIEW_REPORTS,
  P.UPDATE_OWN_PROFILE,
  P.VIEW_NOTIFICATIONS,
];

/** Student: reads and searches their own published routine. */
const STUDENT_PERMISSIONS = [
  P.VIEW_OWN_ROUTINE,
  P.SEARCH_ROUTINE,
  P.VIEW_COURSES,
  P.VIEW_TIMESLOTS,
  P.VIEW_DASHBOARD,
  P.UPDATE_OWN_PROFILE,
  P.VIEW_NOTIFICATIONS,
];

/**
 * Seeded into the `roles` collection. `isSystem: true` makes a role
 * undeletable — the app's authorization model depends on these four existing.
 */
const ROLE_DEFINITIONS = [
  {
    name: ROLES.SUPER_ADMIN,
    description: "Full institution-wide control, including routine approval and publishing.",
    dataScope: DATA_SCOPES.GLOBAL,
    isSystem: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    name: ROLES.DEPARTMENT_ADMIN,
    description: "Manages one department's courses, teachers, students and routine. Cannot approve or publish.",
    dataScope: DATA_SCOPES.DEPARTMENT,
    isSystem: true,
    permissions: DEPARTMENT_ADMIN_PERMISSIONS,
  },
  {
    name: ROLES.TEACHER,
    description: "Views their own teaching routine and edits their own profile.",
    dataScope: DATA_SCOPES.SELF,
    isSystem: true,
    permissions: TEACHER_PERMISSIONS,
  },
  {
    name: ROLES.STUDENT,
    description: "Views and searches their own class routine.",
    dataScope: DATA_SCOPES.SELF,
    isSystem: true,
    permissions: STUDENT_PERMISSIONS,
  },
];

/**
 * Roles whose users must belong to a department. Super Admin is deliberately
 * department-less (`department: null`) because their scope is global.
 */
const DEPARTMENT_BOUND_ROLES = [ROLES.DEPARTMENT_ADMIN, ROLES.TEACHER, ROLES.STUDENT];

/** The role assigned to public self-registration. Never read from the request body. */
const DEFAULT_REGISTRATION_ROLE = ROLES.STUDENT;

module.exports = {
  ROLES,
  DATA_SCOPES,
  ROLE_DEFINITIONS,
  DEPARTMENT_BOUND_ROLES,
  DEFAULT_REGISTRATION_ROLE,
};
