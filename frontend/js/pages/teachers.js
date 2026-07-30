/**
 * Teachers page.
 *
 * The `password` field is optional and only offered when CREATING. Supplying it
 * provisions a login account alongside the profile; leaving it blank creates a
 * teacher who can appear in timetables but cannot yet sign in — which is a real
 * requirement, since staff are often scheduled before IT issues an account.
 */
Crud.createPage({
  resource: "teachers",
  title: "Teachers",
  singular: "teacher",
  subtitle: "Teaching staff. A login account is optional — a teacher can be scheduled before one exists.",
  permissions: {
    view: PERM.VIEW_TEACHERS,
    create: PERM.MANAGE_TEACHERS,
    update: PERM.MANAGE_TEACHERS,
    delete: PERM.MANAGE_TEACHERS,
  },
  searchPlaceholder: "Search name, code or email…",
  defaultSort: "fullName",
  filters: [
    { key: "department", label: "departments", resource: "departments", labelKey: "name" },
    {
      key: "designation",
      label: "designations",
      options: ["Professor", "Associate Professor", "Assistant Professor", "Lecturer", "Visiting Faculty"],
    },
  ],
  columns: [
    { key: "employeeCode", label: "Code", sortable: true },
    { key: "fullName", label: "Name", sortable: true },
    { key: "designation", label: "Designation", sortable: true },
    { key: "department", label: "Department", render: (r) => Fmt.labelOf(r.department, "code") },
    { key: "maxWeeklyClasses", label: "Weekly cap", align: "center" },
    {
      key: "user",
      label: "Account",
      render: (r) =>
        r.user
          ? UI.badge(r.user.status === "active" ? "Active" : Fmt.titleCase(r.user.status), r.user.status === "active" ? "success" : "neutral")
          : UI.badge("None", "neutral"),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => UI.badge(Fmt.titleCase(r.status), r.status === "active" ? "success" : "warning"),
    },
  ],
  formFields: [
    { name: "employeeCode", label: "Employee code", type: "text", required: true, placeholder: "T-1001" },
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", help: "Required if you want to create a login account." },
    { name: "department", label: "Department", type: "ref", resource: "departments", labelKey: "name", required: true },
    {
      name: "designation",
      label: "Designation",
      type: "select",
      options: ["Professor", "Associate Professor", "Assistant Professor", "Lecturer", "Visiting Faculty"],
      default: "Lecturer",
    },
    { name: "maxWeeklyClasses", label: "Weekly class limit", type: "number", min: 1, max: 40, default: 18, help: "Exceeding it produces a warning, not a rejection." },
    {
      name: "specialization",
      label: "Specialisations",
      type: "multi",
      wide: true,
      placeholder: "Algorithms, Databases",
      help: "Comma-separated. Optional.",
    },
    { name: "contact.phone", label: "Phone", type: "tel" },
    { name: "contact.officeRoom", label: "Office", type: "text" },
    { name: "status", label: "Status", type: "select", options: ["active", "on-leave", "inactive"], default: "active" },
    {
      name: "password",
      label: "Initial password",
      type: "password",
      wide: true,
      autocomplete: "new-password",
      help: "Optional. Set one to create a login account; the teacher must change it on first sign-in.",
    },
  ],
  toFormValues: (row) => ({
    ...row,
    department: Fmt.idOf(row.department),
    "contact.phone": row.contact?.phone || "",
    "contact.officeRoom": row.contact?.officeRoom || "",
    password: "", // never pre-fill a password field
  }),
  toPayload: (values, mode) => {
    const body = {
      ...values,
      department: Fmt.idOf(values.department),
      contact: { phone: values["contact.phone"] || "", officeRoom: values["contact.officeRoom"] || "" },
    };
    delete body["contact.phone"];
    delete body["contact.officeRoom"];
    // Account creation only happens on create; the user module owns password
    // resets afterwards.
    if (mode === "edit" || !body.password) delete body.password;
    return body;
  },
});
