/**
 * Courses page.
 *
 * `toPayload` strips the populated `department` object back to an id — the small
 * conversion that Fmt.idOf exists for, and the one that otherwise makes every
 * edit fail validation with "department must be a valid id".
 */
Crud.createPage({
  resource: "courses",
  title: "Courses",
  singular: "course",
  subtitle: "Subjects offered by each department, at a given semester level.",
  permissions: {
    view: PERM.VIEW_COURSES,
    create: PERM.MANAGE_COURSES,
    update: PERM.MANAGE_COURSES,
    delete: PERM.MANAGE_COURSES,
  },
  searchPlaceholder: "Search code or title…",
  defaultSort: "code",
  filters: [
    { key: "department", label: "departments", resource: "departments", labelKey: "name" },
    { key: "type", label: "types", options: ["Theory", "Lab", "Project"] },
  ],
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "title", label: "Title", sortable: true },
    { key: "department", label: "Department", render: (r) => Fmt.labelOf(r.department, "code") },
    { key: "semesterNumber", label: "Level", sortable: true, align: "center" },
    { key: "credits", label: "Credits", sortable: true, align: "center" },
    {
      key: "type",
      label: "Type",
      render: (r) =>
        UI.badge(r.type, r.type === "Lab" ? "success" : r.type === "Project" ? "warning" : "primary"),
    },
    { key: "weeklyClasses", label: "Per week", align: "center" },
  ],
  formFields: [
    { name: "code", label: "Course code", type: "text", required: true, placeholder: "CSE301" },
    { name: "title", label: "Title", type: "text", required: true, wide: true },
    { name: "department", label: "Department", type: "ref", resource: "departments", labelKey: "name", required: true },
    { name: "semesterNumber", label: "Semester level", type: "number", min: 1, max: 12, required: true },
    { name: "credits", label: "Credit hours", type: "number", min: 0, max: 6, step: 0.5, required: true },
    { name: "type", label: "Type", type: "select", options: ["Theory", "Lab", "Project"], default: "Theory" },
    { name: "weeklyClasses", label: "Classes per week", type: "number", min: 1, max: 10, default: 3 },
    { name: "isActive", label: "Active", type: "checkbox", default: true },
  ],
  toFormValues: (row) => ({ ...row, department: Fmt.idOf(row.department) }),
  toPayload: (values) => ({ ...values, department: Fmt.idOf(values.department) }),
});
