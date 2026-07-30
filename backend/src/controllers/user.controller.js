/**
 * User management — Super Admin only.
 *
 * This is the module that can grant privilege, so it is the most sensitive in
 * the project and is hand-written rather than generated. Three rules are
 * enforced here and nowhere else:
 *
 *   1. An administrator cannot change their OWN role. Otherwise the only real
 *      check on a Super Admin is their own restraint, and an accidental
 *      self-demotion could leave the system with no administrator at all.
 *   2. The LAST active Super Admin cannot be demoted, deactivated or deleted.
 *      Locking everybody out of the administration of a live system is not a
 *      recoverable mistake through the UI.
 *   3. Assigning a department-bound role requires a department, and Super Admin
 *      must have none — otherwise scoping has nothing coherent to work with.
 */
const { User, Role, Permission, Teacher, Student } = require("../models");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const { success, created, paginated } = require("../utils/response");
const { buildListQuery, paginate } = require("../utils/queryFeatures");
const sessionService = require("../services/session.service");
const activityService = require("../services/activity.service");
const { invalidateRole } = require("../services/permission.service");
const { ROLES, DEPARTMENT_BOUND_ROLES } = require("../config/roles");
const { USER_STATUS, ACTIVITY_ACTIONS } = require("../config/constants");

/** A role's department requirement must match what was supplied. */
async function validateRoleDepartment(roleId, department) {
  const role = await Role.findById(roleId).select("name").lean();
  if (!role) throw ApiError.badRequest("No such role");

  if (DEPARTMENT_BOUND_ROLES.includes(role.name) && !department) {
    throw ApiError.validation("Validation failed", [
      { field: "department", message: `A ${role.name} must be assigned to a department` },
    ]);
  }
  if (role.name === ROLES.SUPER_ADMIN && department) {
    throw ApiError.validation("Validation failed", [
      { field: "department", message: "A Super Admin has institution-wide scope and must not be tied to a department" },
    ]);
  }
  return role;
}

/** Would this change remove the last usable Super Admin? */
async function assertNotLastSuperAdmin(user, { action }) {
  const superAdminRole = await Role.findOne({ name: ROLES.SUPER_ADMIN }).select("_id").lean();
  if (!superAdminRole || String(user.role) !== String(superAdminRole._id)) return;

  const others = await User.countDocuments({
    _id: { $ne: user._id },
    role: superAdminRole._id,
    status: USER_STATUS.ACTIVE,
  });

  if (others === 0) {
    throw ApiError.conflict(
      `Cannot ${action} the only active Super Admin. Create or activate another one first.`,
      "CONFLICT"
    );
  }
}

/** GET /api/users */
exports.list = asyncHandler(async (req, res) => {
  const options = buildListQuery(req, {
    searchFields: ["name", "email"],
    allowedFilters: ["role", "department", "status"],
    allowedSorts: ["name", "email", "status", "lastLoginAt", "createdAt"],
    defaultSort: "name",
  });

  const { items, meta } = await paginate(User, options.filter, {
    ...options,
    populate: [
      { path: "role", select: "name dataScope" },
      { path: "department", select: "name code" },
    ],
  });

  return paginated(res, items, meta, "Users fetched");
});

/** GET /api/users/:id */
exports.get = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate("role", "name dataScope")
    .populate("department", "name code");
  if (!user) throw ApiError.notFound("User not found");

  // Surface the linked domain profile, if any.
  const [teacher, student] = await Promise.all([
    Teacher.findOne({ user: user._id }).select("employeeCode fullName").lean(),
    Student.findOne({ user: user._id }).select("rollNo fullName section").lean(),
  ]);

  return success(res, {
    data: { ...user.toJSON(), profile: teacher || student || null },
    message: "User fetched",
  });
});

/** POST /api/users */
exports.create = asyncHandler(async (req, res) => {
  const { name, email, password, role, department, phone, status } = req.body;

  if (await User.findOne({ email: String(email).toLowerCase() })) {
    throw ApiError.conflict("An account with that email already exists");
  }

  const roleDoc = await validateRoleDepartment(role, department);

  const user = new User({
    name,
    email,
    password,
    role,
    department: department || null,
    phone: phone || "",
    status: status || USER_STATUS.ACTIVE,
    // The administrator chose this password, so the holder replaces it on first use.
    mustChangePassword: true,
    createdBy: req.auth.userId,
    updatedBy: req.auth.userId,
  });
  await user.save();

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.CREATE,
    entityType: "User",
    entityId: user._id,
    description: `Created ${roleDoc.name} account: ${user.email}`,
    department: user.department,
  });

  return created(res, await user.populate("role", "name dataScope"), "User created");
});

/** PUT /api/users/:id */
exports.update = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound("User not found");

  const before = user.toObject();
  const isSelf = String(user._id) === String(req.auth.userId);

  // Rule 1: no self role or status changes, whatever permissions the caller holds.
  if (isSelf && req.body.role && String(req.body.role) !== String(user.role)) {
    throw ApiError.forbidden(
      "You cannot change your own role. Ask another Super Admin to do it."
    );
  }
  if (isSelf && req.body.status && req.body.status !== user.status) {
    throw ApiError.forbidden("You cannot change your own account status.");
  }

  // Rule 2: protect the last Super Admin.
  const demoting = req.body.role && String(req.body.role) !== String(user.role);
  const deactivating = req.body.status && req.body.status !== USER_STATUS.ACTIVE;
  if (demoting) await assertNotLastSuperAdmin(user, { action: "change the role of" });
  if (deactivating) await assertNotLastSuperAdmin(user, { action: "deactivate" });

  // Rule 3: role and department must agree.
  const nextRole = req.body.role || user.role;
  const nextDepartment = req.body.department !== undefined ? req.body.department : user.department;
  await validateRoleDepartment(nextRole, nextDepartment);

  // A password set here goes through the virtual setter, which re-hashes and
  // stamps passwordChangedAt (invalidating the holder's existing tokens).
  const resettingPassword = Boolean(req.body.password);

  for (const field of ["name", "email", "phone", "status", "role", "department"]) {
    if (req.body[field] !== undefined) user[field] = req.body[field];
  }
  if (resettingPassword) {
    user.password = req.body.password;
    user.mustChangePassword = true;
  }
  user.updatedBy = req.auth.userId;
  await user.save();

  // Any change to role, status or password makes existing sessions unsafe.
  let revoked = 0;
  if (demoting || deactivating || resettingPassword) {
    revoked = await sessionService.revokeAllForUser(user._id, resettingPassword ? "password_change" : "admin");
  }

  activityService.record({
    req,
    action: demoting ? ACTIVITY_ACTIONS.PERMISSION_CHANGE : ACTIVITY_ACTIONS.UPDATE,
    entityType: "User",
    entityId: user._id,
    description:
      `Updated account ${user.email}` +
      (resettingPassword ? " (password reset by administrator)" : "") +
      (revoked ? ` — ${revoked} session(s) ended` : ""),
    changes: activityService.diff(before, user.toObject()),
    department: user.department,
  });

  return success(res, {
    data: await user.populate("role", "name dataScope"),
    message: "User updated",
  });
});

/** DELETE /api/users/:id — soft delete, sessions revoked. */
exports.remove = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound("User not found");

  if (String(user._id) === String(req.auth.userId)) {
    throw ApiError.forbidden("You cannot delete your own account.");
  }
  await assertNotLastSuperAdmin(user, { action: "delete" });

  await user.softDelete(req.auth.userId);
  const revoked = await sessionService.revokeAllForUser(user._id, "admin");

  // Unlink the domain profile so it can be attached to a new account later —
  // the profile itself is left intact, since routines may still reference it.
  await Teacher.updateOne({ user: user._id }, { $set: { user: null } });
  await Student.updateOne({ user: user._id }, { $set: { user: null } });

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.DELETE,
    entityType: "User",
    entityId: user._id,
    description: `Deleted account ${user.email} (${revoked} session(s) ended)`,
    department: user.department,
  });

  return success(res, { message: "User deleted" });
});

/** GET /api/roles — needed to populate role dropdowns. */
exports.listRoles = asyncHandler(async (req, res) => {
  const roles = await Role.find()
    .populate("permissions", "name module")
    .sort("name")
    .lean();

  const data = roles.map((r) => ({
    id: r._id,
    name: r.name,
    description: r.description,
    dataScope: r.dataScope,
    isSystem: r.isSystem,
    permissionCount: (r.permissions || []).length,
    permissions: (r.permissions || []).map((p) => p.name),
  }));

  return success(res, { data, message: "Roles fetched" });
});

/**
 * PUT /api/roles/:id/permissions
 *
 * Rewrites a role's grants. The permission cache is invalidated explicitly, so
 * the change takes effect on the very next request rather than after the cache
 * TTL — which is the point of resolving permissions from the database at all.
 */
exports.setRolePermissions = asyncHandler(async (req, res) => {
  const role = await Role.findById(req.params.id);
  if (!role) throw ApiError.notFound("Role not found");

  const names = req.body.permissions || [];
  const permissions = await Permission.find({ name: { $in: names } }).select("_id name").lean();

  if (permissions.length !== names.length) {
    const found = new Set(permissions.map((p) => p.name));
    throw ApiError.badRequest(
      `Unknown permission(s): ${names.filter((n) => !found.has(n)).join(", ")}`
    );
  }

  const before = { permissionCount: role.permissions.length };
  role.permissions = permissions.map((p) => p._id);
  role.updatedBy = req.auth.userId;
  await role.save();

  invalidateRole(role._id);

  activityService.record({
    req,
    action: ACTIVITY_ACTIONS.PERMISSION_CHANGE,
    entityType: "Role",
    entityId: role._id,
    description: `Set ${permissions.length} permission(s) on role "${role.name}"`,
    changes: activityService.diff(before, { permissionCount: permissions.length }),
  });

  return success(res, {
    data: { id: role._id, name: role.name, permissions: permissions.map((p) => p.name) },
    message: "Role permissions updated",
  });
});
