/**
 * THE PERMISSION CATALOGUE — single source of truth.
 *
 * Every permission string in the system is defined here exactly once. It is
 * consumed by:
 *   - src/seeds/permission.seeder.js   (creates the `permissions` collection)
 *   - src/config/roles.js              (maps roles to permission sets)
 *   - every routes/*.js via authorize(P.X)
 *   - frontend/js/config/permissions.js (a documented mirror, used only to
 *     show/hide UI — the server always re-checks)
 *
 * Naming convention:
 *   "View X"   → read list + detail
 *   "Manage X" → create + update + delete
 * One permission per resource keeps a four-role matrix readable. Splitting
 * into Create/Edit/Delete would triple the catalogue for no teaching gain.
 *
 * Routine lifecycle transitions get their OWN permissions, because that is
 * precisely where Department Admin and Super Admin diverge: a department admin
 * builds and submits a routine, only a super admin approves and publishes it.
 */

const PERMISSIONS = {
  // Users & roles — Super Admin only
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

  // Reporting & misc
  VIEW_DASHBOARD: "View Dashboard",
  VIEW_REPORTS: "View Reports",
  UPDATE_OWN_PROFILE: "Update Own Profile",
  VIEW_NOTIFICATIONS: "View Notifications",
  VIEW_ACTIVITY_LOGS: "View Activity Logs",
};

/**
 * Module grouping + description for each permission. Drives the seeder and the
 * role-editor UI, which lists permissions grouped by module.
 */
const PERMISSION_META = {
  [PERMISSIONS.VIEW_USERS]: { module: "Users", description: "View user accounts" },
  [PERMISSIONS.MANAGE_USERS]: { module: "Users", description: "Create, edit and deactivate user accounts" },
  [PERMISSIONS.VIEW_ROLES]: { module: "Roles", description: "View roles and their permissions" },
  [PERMISSIONS.MANAGE_ROLES]: { module: "Roles", description: "Create and edit roles" },
  [PERMISSIONS.ASSIGN_PERMISSIONS]: { module: "Roles", description: "Grant or revoke permissions on a role" },

  [PERMISSIONS.VIEW_DEPARTMENTS]: { module: "Departments", description: "View departments" },
  [PERMISSIONS.MANAGE_DEPARTMENTS]: { module: "Departments", description: "Create, edit and delete departments" },
  [PERMISSIONS.VIEW_SEMESTERS]: { module: "Semesters", description: "View semesters" },
  [PERMISSIONS.MANAGE_SEMESTERS]: { module: "Semesters", description: "Create, edit and delete semesters" },
  [PERMISSIONS.VIEW_COURSES]: { module: "Courses", description: "View courses" },
  [PERMISSIONS.MANAGE_COURSES]: { module: "Courses", description: "Create, edit and delete courses" },
  [PERMISSIONS.VIEW_TEACHERS]: { module: "Teachers", description: "View teachers" },
  [PERMISSIONS.MANAGE_TEACHERS]: { module: "Teachers", description: "Create, edit and delete teachers" },
  [PERMISSIONS.VIEW_STUDENTS]: { module: "Students", description: "View students" },
  [PERMISSIONS.MANAGE_STUDENTS]: { module: "Students", description: "Create, edit and delete students" },
  [PERMISSIONS.VIEW_ROOMS]: { module: "Rooms", description: "View rooms" },
  [PERMISSIONS.MANAGE_ROOMS]: { module: "Rooms", description: "Create, edit and delete rooms" },
  [PERMISSIONS.VIEW_TIMESLOTS]: { module: "Timeslots", description: "View time slots" },
  [PERMISSIONS.MANAGE_TIMESLOTS]: { module: "Timeslots", description: "Create, edit and delete time slots" },

  [PERMISSIONS.VIEW_ROUTINE]: { module: "Routine", description: "View any routine" },
  [PERMISSIONS.VIEW_OWN_ROUTINE]: { module: "Routine", description: "View only one's own routine" },
  [PERMISSIONS.SEARCH_ROUTINE]: { module: "Routine", description: "Search published routines" },
  [PERMISSIONS.MANAGE_ROUTINE]: { module: "Routine", description: "Create and edit routine entries" },
  [PERMISSIONS.SUBMIT_ROUTINE]: { module: "Routine", description: "Submit a draft routine for approval" },
  [PERMISSIONS.APPROVE_ROUTINE]: { module: "Routine", description: "Approve or reject a submitted routine" },
  [PERMISSIONS.PUBLISH_ROUTINE]: { module: "Routine", description: "Publish an approved routine" },

  [PERMISSIONS.VIEW_DASHBOARD]: { module: "Reports", description: "View the dashboard" },
  [PERMISSIONS.VIEW_REPORTS]: { module: "Reports", description: "Generate and view reports" },
  [PERMISSIONS.UPDATE_OWN_PROFILE]: { module: "Profile", description: "Edit one's own profile" },
  [PERMISSIONS.VIEW_NOTIFICATIONS]: { module: "Notifications", description: "View one's own notifications" },
  [PERMISSIONS.VIEW_ACTIVITY_LOGS]: { module: "Logs", description: "View the activity log" },
};

/** Every permission string, for the seeder and for Super Admin's grant. */
const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/** Distinct module names, in catalogue order. */
const PERMISSION_MODULES = [...new Set(Object.values(PERMISSION_META).map((m) => m.module))];

module.exports = { PERMISSIONS, PERMISSION_META, ALL_PERMISSIONS, PERMISSION_MODULES };
