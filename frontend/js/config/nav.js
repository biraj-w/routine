/**
 * Navigation, declared as data.
 *
 * The sidebar markup exists in ONE place (core/layout.js) and filters itself
 * against the current user's permissions. The previous version repeated the nav
 * in every HTML file, which meant adding a page required editing eleven files
 * and role-based visibility was impossible without a conditional per link.
 *
 * `permission` may be a single string or an array (any-of).
 */
window.NAV = [
  {
    section: "Overview",
    items: [
      { label: "Dashboard", href: "dashboard.html", icon: "▦", permission: window.PERM.VIEW_DASHBOARD },
      {
        label: "My routine",
        href: "my-routine.html",
        icon: "◷",
        // Only shown to teachers and students: an admin has no personal timetable.
        permission: window.PERM.VIEW_OWN_ROUTINE,
      },
      { label: "Routines", href: "routines.html", icon: "▤", permission: window.PERM.VIEW_ROUTINE },
      { label: "Search", href: "search.html", icon: "⌕", permission: window.PERM.SEARCH_ROUTINE },
      { label: "Reports", href: "reports.html", icon: "▥", permission: window.PERM.VIEW_REPORTS },
    ],
  },
  {
    section: "Academic",
    items: [
      { label: "Departments", href: "departments.html", icon: "◫", permission: window.PERM.MANAGE_DEPARTMENTS },
      { label: "Semesters", href: "semesters.html", icon: "❑", permission: window.PERM.MANAGE_SEMESTERS },
      { label: "Courses", href: "courses.html", icon: "❐", permission: window.PERM.MANAGE_COURSES },
      { label: "Teachers", href: "teachers.html", icon: "♟", permission: window.PERM.VIEW_TEACHERS },
      { label: "Students", href: "students.html", icon: "♙", permission: window.PERM.MANAGE_STUDENTS },
    ],
  },
  {
    section: "Facilities",
    items: [
      { label: "Rooms", href: "rooms.html", icon: "⌂", permission: window.PERM.MANAGE_ROOMS },
      { label: "Time slots", href: "timeslots.html", icon: "◔", permission: window.PERM.MANAGE_TIMESLOTS },
    ],
  },
  {
    section: "Administration",
    items: [
      { label: "Users", href: "users.html", icon: "☰", permission: window.PERM.VIEW_USERS },
      { label: "Roles", href: "roles.html", icon: "⚿", permission: window.PERM.VIEW_ROLES },
      { label: "Activity log", href: "activity.html", icon: "≡", permission: window.PERM.VIEW_ACTIVITY_LOGS },
    ],
  },
  {
    section: "Account",
    items: [
      { label: "Profile", href: "profile.html", icon: "☺", permission: window.PERM.UPDATE_OWN_PROFILE },
      { label: "Devices", href: "sessions.html", icon: "▢" }, // no permission: everyone may manage their own sessions
      { label: "Notifications", href: "notifications.html", icon: "◈", permission: window.PERM.VIEW_NOTIFICATIONS },
    ],
  },
];
