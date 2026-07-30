/**
 * Users page — Super Admin only.
 *
 * The most sensitive screen in the application, since it is where privilege is
 * granted. Three server-side rules will reject a request from here and the
 * messages are shown verbatim: you cannot change your own role, you cannot
 * remove the last Super Admin, and a department-bound role needs a department
 * while Super Admin must not have one.
 */
Crud.createPage({
  resource: "users",
  title: "Users",
  singular: "user",
  subtitle: "Login accounts and the role each one holds. Changing a role or password ends that user's sessions immediately.",
  permissions: {
    view: PERM.VIEW_USERS,
    create: PERM.MANAGE_USERS,
    update: PERM.MANAGE_USERS,
    delete: PERM.MANAGE_USERS,
  },
  searchPlaceholder: "Search name or email…",
  defaultSort: "name",
  filters: [
    { key: "role", label: "roles", resource: "roles", labelKey: "name" },
    { key: "department", label: "departments", resource: "departments", labelKey: "name" },
    { key: "status", label: "statuses", options: ["active", "inactive", "locked"] },
  ],
  columns: [
    { key: "name", label: "Name", sortable: true },
    { key: "email", label: "Email", sortable: true },
    { key: "role", label: "Role", render: (r) => UI.badge(Fmt.labelOf(r.role, "name"), "primary") },
    {
      key: "department",
      label: "Department",
      render: (r) => (r.department ? Fmt.labelOf(r.department, "code") : UI.badge("Institution-wide", "info")),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) =>
        UI.badge(
          Fmt.titleCase(r.status),
          r.status === "active" ? "success" : r.status === "locked" ? "danger" : "neutral"
        ),
    },
    { key: "lastLoginAt", label: "Last seen", sortable: true, render: (r) => Fmt.relative(r.lastLoginAt) },
  ],
  formFields: [
    { name: "name", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", required: true, autocomplete: "off" },
    { name: "role", label: "Role", type: "ref", resource: "roles", labelKey: "name", required: true },
    {
      name: "department",
      label: "Department",
      type: "ref",
      resource: "departments",
      labelKey: "name",
      help: "Required for Department Admin, Teacher and Student. Must be blank for a Super Admin.",
    },
    { name: "phone", label: "Phone", type: "tel" },
    { name: "status", label: "Status", type: "select", options: ["active", "inactive", "locked"], default: "active" },
    {
      name: "password",
      label: "Password",
      type: "password",
      wide: true,
      autocomplete: "new-password",
      help: "On create this is required. On edit, filling it resets the password and signs the user out everywhere.",
    },
  ],
  toFormValues: (row) => ({
    ...row,
    role: Fmt.idOf(row.role),
    department: Fmt.idOf(row.department),
    password: "",
  }),
  toPayload: (values) => {
    const body = {
      ...values,
      role: Fmt.idOf(values.role),
      department: values.department ? Fmt.idOf(values.department) : null,
    };
    // An empty password field on edit means "leave it alone", not "blank it".
    if (!body.password) delete body.password;
    return body;
  },
  rowActions: [
    {
      label: "Unlock",
      variant: "ghost",
      permission: PERM.MANAGE_USERS,
      // Only meaningful for an account that is actually locked out.
      visible: (row) => row.status === "locked",
      onClick: async (row, { reload }) => {
        try {
          await Api.put(`/users/${Fmt.idOf(row)}`, { status: "active" });
          UI.toast(`${row.name} unlocked`, "success");
          reload();
        } catch (err) {
          UI.toast(err.message, "error");
        }
      },
    },
  ],
});
