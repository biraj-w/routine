/**
 * Departments page — configuration only. All behaviour is in core/crud.js.
 *
 * `headTeacher` is a ref rather than a text field, and is optional: a department
 * may exist before a head is appointed. The table has always shown a "Head"
 * column, but the form had no field for it, so the value could only ever be set
 * by the seeder — it was unreachable from the UI.
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
    {
      name: "headTeacher",
      label: "Head of department",
      type: "ref",
      resource: "teachers",
      labelKey: "fullName",
      placeholder: "— not appointed —",
      help: "Optional. Any teacher may be named head.",
    },
    { name: "description", label: "Description", type: "textarea", wide: true },
    { name: "isActive", label: "Active", type: "checkbox", default: true },
  ],
  // The list response populates headTeacher as an object, so it has to be
  // flattened to an id for the <select>, and "" sent back as an explicit null
  // (the server reads null as "no head", and would otherwise keep the old one).
  toFormValues: (row) => ({ ...row, headTeacher: Fmt.idOf(row.headTeacher) }),
  toPayload: (values) => ({
    ...values,
    headTeacher: values.headTeacher ? Fmt.idOf(values.headTeacher) : null,
  }),
});
