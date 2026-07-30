/**
 * Department controller.
 *
 * This module is written out by hand, longhand, even though seven other
 * resources need almost identical code. It is the reference implementation:
 * utils/crudFactory.js was extracted FROM this file, not designed ahead of it,
 * so the abstraction matches something that demonstrably works.
 *
 * Note there is no try/catch anywhere — asyncHandler forwards rejections to the
 * central error handler.
 */
const { Department, Course, Teacher, Student, Semester, Routine } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { success, created, paginated } = require("../utils/response");
const { buildListQuery, paginate } = require("../utils/queryFeatures");
const { scoped } = require("../middlewares/scope");
const activityService = require("../services/activity.service");
const { ACTIVITY_ACTIONS } = require("../config/constants");

/**
 * Collections that point at a Department. Consulted before deleting, so a
 * department with courses attached is refused rather than leaving orphans.
 */
const REFERENCES = [
  { Model: Course, field: "department", label: "course" },
  { Model: Teacher, field: "department", label: "teacher" },
  { Model: Student, field: "department", label: "student" },
  { Model: Semester, field: "department", label: "semester" },
  { Model: Routine, field: "department", label: "routine" },
];

/** GET /api/departments */
exports.list = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    searchFields: ["name", "code"],
    allowedFilters: ["isActive"],
    allowedSorts: ["name", "code", "createdAt", "updatedAt"],
    defaultSort: "name",
  });

  // The only line concerned with scoping: a department admin sees just theirs.
  const filter = scoped(req, options.filter);

  const { items, meta } = await paginate(Department, filter, {
    ...options,
    populate: [{ path: "headTeacher", select: "fullName employeeCode" }],
  });

  return paginated(res, items, meta, "Departments fetched");
});

/** GET /api/departments/:id — document already loaded and scope-checked. */
exports.get = asyncHandler(async (req, res) => {
  const department = await req.doc.populate({ path: "headTeacher", select: "fullName employeeCode" });
  return success(res, { data: department, message: "Department fetched" });
});

/** POST /api/departments */
exports.create = asyncHandler(async (req, res) => {
  const department = await Department.create(req.body);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.CREATE,
    entityType: "Department",
    entityId: department._id,
    description: `Created department ${department.code} — ${department.name}`,
    department: department._id,
  });

  return created(res, department, "Department created");
});

/** PUT /api/departments/:id */
exports.update = asyncHandler(async (req, res) => {
  const department = req.doc;
  const before = department.toObject();

  Object.assign(department, req.body);
  await department.save();

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.UPDATE,
    entityType: "Department",
    entityId: department._id,
    description: `Updated department ${department.code}`,
    changes: activityService.diff(before, department.toObject()),
    department: department._id,
  });

  return success(res, { data: department, message: "Department updated" });
});

/**
 * DELETE /api/departments/:id — soft delete.
 *
 * Refuses when other records still reference this department. No cascade:
 * silently deleting a department's courses would be far more destructive than
 * an error message, and orphaning them would corrupt every report.
 */
exports.remove = asyncHandler(async (req, res) => {
  const department = req.doc;

  const blocking = [];
  for (const ref of REFERENCES) {
    const count = await ref.Model.countDocuments({ [ref.field]: department._id });
    if (count > 0) blocking.push(`${count} ${ref.label}${count === 1 ? "" : "s"}`);
  }

  if (blocking.length) {
    throw ApiError.conflict(
      `Cannot delete this department: ${blocking.join(", ")} still reference it. ` +
        `Deactivate it instead, or reassign those records first.`,
      "REFERENCED",
      blocking.map((b) => ({ field: "department", message: `${b} reference this department` }))
    );
  }

  await department.softDelete(req.auth.userId);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.DELETE,
    entityType: "Department",
    entityId: department._id,
    description: `Deleted department ${department.code}`,
    department: department._id,
  });

  return success(res, { message: "Department deleted" });
});
