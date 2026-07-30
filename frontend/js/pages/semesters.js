/**
 * Semesters page.
 *
 * A semester is one OFFERED instance: department + level + academic year + term.
 * `sections` is a comma-separated field rather than a tag widget — short lists,
 * and readForm splits it back into an array.
 */
Crud.createPage({
  resource: "semesters",
  title: "Semesters",
  singular: "semester",
  subtitle: "One row per offered semester: a department's level in a given year and term.",
  permissions: {
    view: PERM.VIEW_SEMESTERS,
    create: PERM.MANAGE_SEMESTERS,
    update: PERM.MANAGE_SEMESTERS,
    delete: PERM.MANAGE_SEMESTERS,
  },
  searchPlaceholder: "Search year or term…",
  defaultSort: "number",
  filters: [
    { key: "department", label: "departments", resource: "departments", labelKey: "name" },
    { key: "term", label: "terms", options: ["Spring", "Summer", "Fall"] },
  ],
  columns: [
    { key: "department", label: "Department", render: (r) => Fmt.labelOf(r.department, "code") },
    { key: "number", label: "Level", sortable: true, align: "center" },
    { key: "term", label: "Term", sortable: true },
    { key: "academicYear", label: "Academic year", sortable: true },
    { key: "sections", label: "Sections", render: (r) => (r.sections || []).join(", ") },
    {
      key: "isActive",
      label: "Status",
      render: (r) => UI.badge(r.isActive ? "Active" : "Inactive", r.isActive ? "success" : "neutral"),
    },
  ],
  formFields: [
    { name: "department", label: "Department", type: "ref", resource: "departments", labelKey: "name", required: true },
    { name: "number", label: "Semester level", type: "number", min: 1, max: 12, required: true },
    { name: "academicYear", label: "Academic year", type: "text", required: true, placeholder: "2025-2026" },
    { name: "term", label: "Term", type: "select", options: ["Spring", "Summer", "Fall"], required: true },
    {
      name: "sections",
      label: "Sections",
      type: "multi",
      placeholder: "A, B",
      help: "Comma-separated. Routine entries may only use a section listed here.",
      default: ["A"],
    },
    { name: "startDate", label: "Starts", type: "date" },
    { name: "endDate", label: "Ends", type: "date" },
    { name: "isActive", label: "Active", type: "checkbox", default: true },
  ],
  toFormValues: (row) => ({ ...row, department: Fmt.idOf(row.department) }),
  toPayload: (values) => ({ ...values, department: Fmt.idOf(values.department) }),
});
