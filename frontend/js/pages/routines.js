/**
 * Routines list — one row per timetable, with its lifecycle state.
 *
 * Creating a routine only asks for a semester: the department, academic year and
 * term are all derived from it server-side, so they cannot disagree.
 */
Crud.createPage({
  resource: "routines",
  title: "Routines",
  singular: "routine",
  subtitle: "One timetable per department, semester and term. Build it as a draft, then submit it for approval.",
  permissions: {
    view: PERM.VIEW_ROUTINE,
    create: PERM.MANAGE_ROUTINE,
    update: PERM.MANAGE_ROUTINE,
    delete: PERM.MANAGE_ROUTINE,
  },
  searchPlaceholder: "Search title or year…",
  defaultSort: "-createdAt",
  filters: [
    { key: "status", label: "statuses", options: ["draft", "submitted", "approved", "published", "archived"] },
    { key: "department", label: "departments", resource: "departments", labelKey: "name" },
  ],
  columns: [
    { key: "title", label: "Routine", sortable: true },
    { key: "department", label: "Department", render: (r) => Fmt.labelOf(r.department, "code") },
    {
      key: "semester",
      label: "Semester",
      render: (r) => (r.semester ? `Level ${r.semester.number}` : "—"),
    },
    { key: "term", label: "Term", render: (r) => `${r.term} ${r.academicYear}` },
    { key: "entryCount", label: "Classes", align: "center" },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) =>
        UI.badge(
          Fmt.titleCase(r.status),
          {
            draft: "neutral",
            submitted: "warning",
            approved: "info",
            published: "success",
            archived: "neutral",
          }[r.status] || "neutral"
        ),
    },
    { key: "publishedAt", label: "Published", sortable: true, render: (r) => Fmt.date(r.publishedAt) },
  ],
  formFields: [
    {
      name: "semester",
      label: "Semester",
      type: "ref",
      resource: "semesters",
      labelKey: "label",
      required: true,
      wide: true,
      help: "The department, academic year and term are taken from the semester.",
    },
    { name: "title", label: "Title", type: "text", wide: true, help: "Optional — generated from the semester if left blank." },
    { name: "effectiveFrom", label: "Effective from", type: "date" },
  ],
  toFormValues: (row) => ({ ...row, semester: Fmt.idOf(row.semester) }),
  toPayload: (values) => ({ ...values, semester: Fmt.idOf(values.semester) }),
  rowActions: [
    {
      label: "Open",
      variant: "primary",
      onClick: (row) => {
        window.location.href = `routine.html?routine=${Fmt.idOf(row)}`;
      },
    },
  ],
});
