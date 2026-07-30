/**
 * Time slots page.
 *
 * The subtitle spells out why this list must stay disjoint: it is the reason
 * every conflict rule can be an equality comparison, and therefore the reason
 * the database can enforce them.
 */
Crud.createPage({
  resource: "timeslots",
  title: "Time slots",
  singular: "time slot",
  subtitle:
    "The daily period grid, shared institution-wide. Slots must not overlap — a class occupies exactly one, which is what makes clash detection exact.",
  permissions: {
    view: PERM.VIEW_TIMESLOTS,
    create: PERM.MANAGE_TIMESLOTS,
    update: PERM.MANAGE_TIMESLOTS,
    delete: PERM.MANAGE_TIMESLOTS,
  },
  searchPlaceholder: "Search label…",
  defaultSort: "order",
  columns: [
    { key: "order", label: "#", sortable: true, align: "center" },
    { key: "label", label: "Period", sortable: true },
    { key: "startTime", label: "Starts", sortable: true },
    { key: "endTime", label: "Ends" },
    {
      key: "durationMinutes",
      label: "Length",
      align: "center",
      render: (r) => (r.durationMinutes ? `${r.durationMinutes} min` : "—"),
    },
    {
      key: "isBreak",
      label: "Kind",
      render: (r) => UI.badge(r.isBreak ? "Break" : "Teaching", r.isBreak ? "warning" : "primary"),
    },
  ],
  formFields: [
    { name: "order", label: "Display order", type: "number", min: 1, max: 50, required: true, help: "Position across the day." },
    { name: "startTime", label: "Start time", type: "text", required: true, placeholder: "09:00", help: "24-hour HH:mm" },
    { name: "endTime", label: "End time", type: "text", required: true, placeholder: "10:00" },
    { name: "label", label: "Label", type: "text", help: "Optional — derived from the times if left blank." },
    { name: "isBreak", label: "This is a break, not a teaching period", type: "checkbox", wide: true },
    { name: "isActive", label: "Active", type: "checkbox", default: true },
  ],
});
