/**
 * Rooms page.
 *
 * An empty department means a SHARED, institution-wide room. That is why the
 * payload converts "" to null rather than dropping the key: null is meaningful
 * here, and omitting the field would leave an existing owner in place.
 */
Crud.createPage({
  resource: "rooms",
  title: "Rooms",
  singular: "room",
  subtitle: "Teaching spaces. A room with no department is shared across the institution.",
  permissions: {
    view: PERM.VIEW_ROOMS,
    create: PERM.MANAGE_ROOMS,
    update: PERM.MANAGE_ROOMS,
    delete: PERM.MANAGE_ROOMS,
  },
  searchPlaceholder: "Search code, name or building…",
  defaultSort: "code",
  filters: [
    { key: "type", label: "types", options: ["Lecture Hall", "Lab", "Seminar Hall", "Auditorium"] },
    { key: "department", label: "departments", resource: "departments", labelKey: "name" },
  ],
  columns: [
    { key: "code", label: "Code", sortable: true },
    { key: "building", label: "Building", sortable: true },
    { key: "floor", label: "Floor", align: "center" },
    { key: "capacity", label: "Seats", sortable: true, align: "center" },
    { key: "type", label: "Type", render: (r) => UI.badge(r.type, r.type === "Lab" ? "success" : "primary") },
    {
      key: "department",
      label: "Owner",
      render: (r) => (r.department ? Fmt.labelOf(r.department, "code") : UI.badge("Shared", "info")),
    },
    { key: "hasProjector", label: "Projector", align: "center", render: (r) => (r.hasProjector ? "Yes" : "No") },
  ],
  formFields: [
    { name: "code", label: "Room code", type: "text", required: true, placeholder: "A-101" },
    { name: "name", label: "Name", type: "text" },
    { name: "building", label: "Building", type: "text", required: true },
    { name: "floor", label: "Floor", type: "number", min: -2, max: 50, default: 0 },
    { name: "capacity", label: "Capacity", type: "number", min: 1, max: 1000, required: true },
    { name: "type", label: "Type", type: "select", options: ["Lecture Hall", "Lab", "Seminar Hall", "Auditorium"], required: true },
    {
      name: "department",
      label: "Owning department",
      type: "ref",
      resource: "departments",
      labelKey: "name",
      placeholder: "— shared (any department) —",
      help: "Leave blank for a shared room that any department may book.",
    },
    { name: "hasProjector", label: "Has a projector", type: "checkbox" },
    { name: "isActive", label: "Active", type: "checkbox", default: true },
  ],
  toFormValues: (row) => ({ ...row, department: Fmt.idOf(row.department) }),
  toPayload: (values) => ({ ...values, department: values.department ? Fmt.idOf(values.department) : null }),
});
