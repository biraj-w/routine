/**
 * Students page.
 *
 * `groupLabel` is the lab batch. It matters more than it looks: a student in G2
 * sees the G2 lab in their timetable and not G1's, and it is the field that lets
 * two lab batches legitimately occupy the same slot.
 */
Crud.createPage({
  resource: "students",
  title: "Students",
  singular: "student",
  subtitle: "Enrolled students. Their timetable comes from their semester and section, not from a per-student schedule.",
  permissions: {
    view: PERM.VIEW_STUDENTS,
    create: PERM.MANAGE_STUDENTS,
    update: PERM.MANAGE_STUDENTS,
    delete: PERM.MANAGE_STUDENTS,
  },
  searchPlaceholder: "Search name, roll number or email…",
  defaultSort: "rollNo",
  filters: [
    { key: "department", label: "departments", resource: "departments", labelKey: "name" },
    { key: "status", label: "statuses", options: ["active", "graduated", "suspended", "inactive"] },
  ],
  columns: [
    { key: "rollNo", label: "Roll no", sortable: true },
    { key: "fullName", label: "Name", sortable: true },
    { key: "department", label: "Department", render: (r) => Fmt.labelOf(r.department, "code") },
    {
      key: "semester",
      label: "Semester",
      render: (r) => (r.semester ? `${r.semester.number} · ${r.semester.term} ${r.semester.academicYear}` : "—"),
    },
    { key: "section", label: "Section", sortable: true, align: "center" },
    {
      key: "groupLabel",
      label: "Lab group",
      align: "center",
      render: (r) => (r.groupLabel && r.groupLabel !== "ALL" ? UI.badge(r.groupLabel, "info") : "—"),
    },
    {
      key: "user",
      label: "Account",
      render: (r) => (r.user ? UI.badge("Yes", "success") : UI.badge("None", "neutral")),
    },
  ],
  formFields: [
    { name: "rollNo", label: "Roll number", type: "text", required: true, placeholder: "CSE-2301" },
    { name: "fullName", label: "Full name", type: "text", required: true },
    { name: "email", label: "Email", type: "email", help: "Required if you want to create a login account." },
    { name: "department", label: "Department", type: "ref", resource: "departments", labelKey: "name", required: true },
    {
      name: "semester",
      label: "Semester",
      type: "ref",
      resource: "semesters",
      labelKey: "label",
      required: true,
      help: "The section below must be one this semester offers.",
    },
    { name: "section", label: "Section", type: "text", required: true, default: "A" },
    { name: "groupLabel", label: "Lab group", type: "text", default: "ALL", help: 'ALL, or G1/G2 for a split lab batch.' },
    { name: "batchYear", label: "Batch year", type: "number", min: 1900, max: 2200 },
    { name: "admissionDate", label: "Admission date", type: "date" },
    { name: "status", label: "Status", type: "select", options: ["active", "graduated", "suspended", "inactive"], default: "active" },
    { name: "contactPhone", label: "Phone", type: "tel" },
    {
      name: "password",
      label: "Initial password",
      type: "password",
      wide: true,
      autocomplete: "new-password",
      help: "Optional. Set one to create a login account.",
    },
  ],
  toFormValues: (row) => ({
    ...row,
    department: Fmt.idOf(row.department),
    semester: Fmt.idOf(row.semester),
    password: "",
  }),
  toPayload: (values, mode) => {
    const body = {
      ...values,
      department: Fmt.idOf(values.department),
      semester: Fmt.idOf(values.semester),
    };
    if (mode === "edit" || !body.password) delete body.password;
    return body;
  },
});
