/**
 * Departments page — configuration only. All behaviour is in core/crud.js.
 */
Crud.createPage({
  resource: "departments",
  title: "Departments",
  singular: "department",
  subtitle: "Top-level organisational units. Every course, teacher and routine belongs to one.",
  permissions: {
    view: PERM.VIEW_DEPARTMENTS,
    create: PERM.MANAGE_DEPARTMENTS,
    update: PERM.MANAGE_DEPARTMENTS,
    delete: PERM.MANAGE_DEPARTMENTS,
  },
  searchPlaceholder: "Search name or code…",
  defaultSort: "name",
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "name", label: "Name", sortable: true },
    { key: "headTeacher", label: "Head", render: (r) => Fmt.labelOf(r.headTeacher, "fullName") },
    {
      key: "isActive",
      label: "Status",
      render: (r) => UI.badge(r.isActive ? "Active" : "Inactive", r.isActive ? "success" : "neutral"),
    },
  ],
  formFields: [
    { name: "code", label: "Department code", type: "text", required: true, help: "Letters and digits only, e.g. CSE" },
    { name: "name", label: "Department name", type: "text", required: true },
    { name: "description", label: "Description", type: "textarea", wide: true },
    { name: "isActive", label: "Active", type: "checkbox", default: true },
  ],
});
