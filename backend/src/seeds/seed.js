/**
 * Database seeder.
 *
 *   npm run seed                      idempotent upsert — safe to re-run
 *   npm run seed:fresh                drop this app's collections, then seed
 *   node src/seeds/seed.js --only=permissions,roles
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 * Every insert is a findOneAndUpdate({ <natural key> }, ..., { upsert: true }),
 * and there is no random or faked data anywhere. Running the seeder twice
 * therefore produces identical counts rather than duplicate rows — which is
 * verified as a gate, because a seeder that multiplies its own data on the
 * second run is worse than no seeder at all.
 *
 * Natural keys: Permission.name · Role.name · User.email · Department.code ·
 * Semester{department,number,academicYear,term} · Course{department,code} ·
 * Room.code · TimeSlot.order · Teacher.employeeCode · Student.rollNo ·
 * Routine{department,semester,academicYear,term} ·
 * RoutineEntry{sessionKey,day,timeSlot,semester,section,groupLabel}
 */
const mongoose = require("mongoose");
const config = require("../config/env");
const { connectDB, disconnectDB } = require("../config/db");
const logger = require("../utils/logger");
const M = require("../models");
const { ALL_PERMISSIONS, PERMISSION_META, PERMISSIONS: P } = require("../config/permissions");
const { ROLE_DEFINITIONS, ROLES } = require("../config/roles");
const { ROUTINE_STATUS, DEFAULT_GROUP_LABEL } = require("../config/constants");
const { invalidateAll } = require("../services/permission.service");

/* ── CLI parsing ─────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const FRESH = argv.includes("--fresh");
const ONLY = (argv.find((a) => a.startsWith("--only=")) || "").replace("--only=", "");
const ONLY_SET = ONLY ? new Set(ONLY.split(",").map((s) => s.trim())) : null;

const shouldRun = (step) => !ONLY_SET || ONLY_SET.has(step);

/* ── Counters ────────────────────────────────────────────────────────────── */

const stats = {};
function track(collection, result) {
  stats[collection] = stats[collection] || { created: 0, updated: 0 };
  // upsertedCount on a bulk result, or lastErrorObject.upserted on findOneAndUpdate
  if (result?.created) stats[collection].created += 1;
  else stats[collection].updated += 1;
}

/**
 * Upsert one document by its natural key.
 *
 * `$setOnInsert` holds values that must not be overwritten on a re-run (a
 * password an admin has since changed, for instance), while `$set` holds fields
 * the seeder owns and should keep current.
 */
async function upsert(Model, naturalKey, { set = {}, setOnInsert = {} } = {}) {
  const existing = await Model.findOne(naturalKey).lean();

  const update = {};
  if (Object.keys(set).length) update.$set = set;
  if (Object.keys(setOnInsert).length && !existing) update.$setOnInsert = setOnInsert;

  const doc = await Model.findOneAndUpdate(naturalKey, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  track(Model.collection.collectionName, { created: !existing });
  return doc;
}

/**
 * Users cannot use findOneAndUpdate: the password hash comes from a virtual
 * setter that only runs on document save. So a missing user is constructed and
 * saved, and an existing one is updated in place without touching its password.
 */
async function upsertUser({ email, name, password, role, department, mustChangePassword = false }) {
  const existing = await M.User.findOne({ email: email.toLowerCase() });

  if (existing) {
    existing.name = name;
    existing.role = role;
    existing.department = department ?? null;
    await existing.save();
    track("users", { created: false });
    return existing;
  }

  const user = new M.User({ email, name, password, role, department: department ?? null, mustChangePassword });
  await user.save();
  track("users", { created: true });
  return user;
}

/* ── Steps ───────────────────────────────────────────────────────────────── */

async function seedPermissions() {
  logger.info("Seeding permissions…");
  const byName = {};
  for (const name of ALL_PERMISSIONS) {
    const meta = PERMISSION_META[name] || { module: "System", description: "" };
    byName[name] = await upsert(
      M.Permission,
      { name },
      { set: { module: meta.module, description: meta.description } }
    );
  }
  return byName;
}

async function seedRoles(permissionsByName) {
  logger.info("Seeding roles…");
  const byName = {};
  for (const def of ROLE_DEFINITIONS) {
    const ids = def.permissions
      .map((name) => permissionsByName[name]?._id)
      .filter(Boolean);

    if (ids.length !== def.permissions.length) {
      const missing = def.permissions.filter((n) => !permissionsByName[n]);
      throw new Error(`Role "${def.name}" references unknown permissions: ${missing.join(", ")}`);
    }

    byName[def.name] = await upsert(
      M.Role,
      { name: def.name },
      {
        // Permissions are re-set every run, so editing config/roles.js and
        // re-seeding is how the matrix is updated.
        set: {
          description: def.description,
          dataScope: def.dataScope,
          isSystem: def.isSystem,
          permissions: ids,
        },
      }
    );
  }
  return byName;
}

async function seedDepartments() {
  logger.info("Seeding departments…");
  const defs = [
    { code: "CSE", name: "Computer Science and Engineering" },
    { code: "EEE", name: "Electrical and Electronic Engineering" },
    { code: "BBA", name: "Business Administration" },
  ];
  const byCode = {};
  for (const d of defs) {
    byCode[d.code] = await upsert(
      M.Department,
      { code: d.code },
      { set: { name: d.name, isActive: true } }
    );
  }
  return byCode;
}

async function seedTimeSlots() {
  logger.info("Seeding time slots…");
  // A fixed, non-overlapping grid — the property the conflict indexes depend on.
  const defs = [
    { order: 1, startTime: "09:00", endTime: "10:00" },
    { order: 2, startTime: "10:00", endTime: "11:00" },
    { order: 3, startTime: "11:00", endTime: "12:00" },
    { order: 4, startTime: "12:00", endTime: "13:00", isBreak: true },
    { order: 5, startTime: "13:00", endTime: "14:00" },
    { order: 6, startTime: "14:00", endTime: "15:00" },
    { order: 7, startTime: "15:00", endTime: "16:00" },
  ];
  const byOrder = {};
  for (const d of defs) {
    byOrder[d.order] = await upsert(
      M.TimeSlot,
      { order: d.order },
      {
        set: {
          startTime: d.startTime,
          endTime: d.endTime,
          label: `${d.startTime}-${d.endTime}`,
          startMinutes: Number(d.startTime.split(":")[0]) * 60 + Number(d.startTime.split(":")[1]),
          endMinutes: Number(d.endTime.split(":")[0]) * 60 + Number(d.endTime.split(":")[1]),
          isBreak: Boolean(d.isBreak),
          isActive: true,
        },
      }
    );
  }
  return byOrder;
}

async function seedRooms(departments) {
  logger.info("Seeding rooms…");
  const defs = [
    { code: "A-101", building: "Academic Block A", floor: 1, capacity: 60, type: "Lecture Hall", department: null },
    { code: "A-102", building: "Academic Block A", floor: 1, capacity: 60, type: "Lecture Hall", department: null },
    { code: "A-201", building: "Academic Block A", floor: 2, capacity: 40, type: "Seminar Hall", department: null },
    { code: "CSE-LAB1", building: "Academic Block B", floor: 1, capacity: 30, type: "Lab", department: departments.CSE._id, hasProjector: true },
    { code: "CSE-LAB2", building: "Academic Block B", floor: 1, capacity: 30, type: "Lab", department: departments.CSE._id },
    { code: "EEE-LAB1", building: "Academic Block C", floor: 1, capacity: 25, type: "Lab", department: departments.EEE._id },
    { code: "AUD-1", building: "Main Building", floor: 0, capacity: 300, type: "Auditorium", department: null },
  ];
  const byCode = {};
  for (const d of defs) {
    byCode[d.code] = await upsert(
      M.Room,
      { code: d.code },
      {
        set: {
          building: d.building,
          floor: d.floor,
          capacity: d.capacity,
          type: d.type,
          department: d.department,
          hasProjector: Boolean(d.hasProjector),
          isActive: true,
        },
      }
    );
  }
  return byCode;
}

const ACADEMIC_YEAR = "2025-2026";
const TERM = "Spring";

async function seedSemesters(departments) {
  logger.info("Seeding semesters…");
  const key = {};
  for (const code of ["CSE", "EEE", "BBA"]) {
    for (const number of [1, 3, 5]) {
      const doc = await upsert(
        M.Semester,
        { department: departments[code]._id, number, academicYear: ACADEMIC_YEAR, term: TERM },
        {
          set: {
            // CSE runs two sections at level 3, so the section-conflict rule has
            // something meaningful to guard.
            sections: code === "CSE" && number === 3 ? ["A", "B"] : ["A"],
            sessionKey: `${ACADEMIC_YEAR}-${TERM}`,
            isActive: true,
            startDate: new Date("2026-01-15"),
            endDate: new Date("2026-06-15"),
          },
        }
      );
      key[`${code}-${number}`] = doc;
    }
  }
  return key;
}

async function seedCourses(departments) {
  logger.info("Seeding courses…");
  const defs = [
    { code: "CSE101", title: "Introduction to Programming", dept: "CSE", sem: 1, credits: 3, type: "Theory" },
    { code: "CSE102", title: "Programming Laboratory", dept: "CSE", sem: 1, credits: 1, type: "Lab", weeklyClasses: 2 },
    { code: "CSE301", title: "Web Engineering", dept: "CSE", sem: 3, credits: 3, type: "Theory" },
    { code: "CSE302", title: "Database Management Systems", dept: "CSE", sem: 3, credits: 3, type: "Theory" },
    { code: "CSE303", title: "Operating Systems", dept: "CSE", sem: 3, credits: 3, type: "Theory" },
    { code: "CSE304", title: "Web Engineering Laboratory", dept: "CSE", sem: 3, credits: 1, type: "Lab", weeklyClasses: 2 },
    { code: "CSE501", title: "Advanced Software Engineering", dept: "CSE", sem: 5, credits: 3, type: "Theory" },
    { code: "CSE502", title: "Machine Learning", dept: "CSE", sem: 5, credits: 3, type: "Theory" },
    { code: "EEE101", title: "Basic Electrical Engineering", dept: "EEE", sem: 1, credits: 3, type: "Theory" },
    { code: "EEE301", title: "Digital Electronics", dept: "EEE", sem: 3, credits: 3, type: "Theory" },
    { code: "BBA101", title: "Principles of Management", dept: "BBA", sem: 1, credits: 3, type: "Theory" },
    { code: "BBA301", title: "Financial Accounting", dept: "BBA", sem: 3, credits: 3, type: "Theory" },
  ];
  const byCode = {};
  for (const d of defs) {
    byCode[d.code] = await upsert(
      M.Course,
      { department: departments[d.dept]._id, code: d.code },
      {
        set: {
          title: d.title,
          semesterNumber: d.sem,
          credits: d.credits,
          type: d.type,
          weeklyClasses: d.weeklyClasses || 3,
          isActive: true,
        },
      }
    );
  }
  return byCode;
}

async function seedUsersAndProfiles(roles, departments, semesters) {
  logger.info("Seeding users, teachers and students…");

  // ── Super Admin: no department, because their scope is global ────────────
  const superAdmin = await upsertUser({
    email: config.seed.superAdminEmail,
    name: "System Administrator",
    password: config.seed.superAdminPassword,
    role: roles[ROLES.SUPER_ADMIN]._id,
    department: null,
    mustChangePassword: false,
  });

  // ── Two department admins in DIFFERENT departments ───────────────────────
  // Deliberate: cross-department isolation cannot be tested with only one.
  const cseAdmin = await upsertUser({
    email: "cse.admin@univ.edu",
    name: "CSE Department Admin",
    password: config.seed.deptAdminPassword,
    role: roles[ROLES.DEPARTMENT_ADMIN]._id,
    department: departments.CSE._id,
  });
  const eeeAdmin = await upsertUser({
    email: "eee.admin@univ.edu",
    name: "EEE Department Admin",
    password: config.seed.deptAdminPassword,
    role: roles[ROLES.DEPARTMENT_ADMIN]._id,
    department: departments.EEE._id,
  });

  // ── Teachers ────────────────────────────────────────────────────────────
  const teacherDefs = [
    { code: "T-1001", name: "Dr Rita Sharma", email: "rita.sharma@univ.edu", dept: "CSE", designation: "Professor", account: true },
    { code: "T-1002", name: "Dr Anil Bose", email: "anil.bose@univ.edu", dept: "CSE", designation: "Associate Professor", account: true },
    { code: "T-1003", name: "Ms Sunita Karki", email: "sunita.karki@univ.edu", dept: "CSE", designation: "Lecturer" },
    { code: "T-1004", name: "Mr Prakash Thapa", email: "prakash.thapa@univ.edu", dept: "CSE", designation: "Assistant Professor" },
    { code: "T-2001", name: "Dr Bimal Gurung", email: "bimal.gurung@univ.edu", dept: "EEE", designation: "Professor" },
    { code: "T-3001", name: "Ms Nisha Rai", email: "nisha.rai@univ.edu", dept: "BBA", designation: "Lecturer" },
  ];

  const teachers = {};
  for (const t of teacherDefs) {
    let userId = null;
    if (t.account) {
      const u = await upsertUser({
        email: t.email,
        name: t.name,
        password: config.seed.teacherPassword,
        role: roles[ROLES.TEACHER]._id,
        department: departments[t.dept]._id,
      });
      userId = u._id;
    }
    // Teachers without an account demonstrate the partial index on `user`:
    // many null values coexist, but no two teachers share one account.
    teachers[t.code] = await upsert(
      M.Teacher,
      { employeeCode: t.code },
      {
        set: {
          fullName: t.name,
          email: t.email,
          department: departments[t.dept]._id,
          designation: t.designation,
          user: userId,
          maxWeeklyClasses: 18,
          status: "active",
        },
      }
    );
  }

  // ── Students ────────────────────────────────────────────────────────────
  const studentDefs = [
    { roll: "CSE-2301", name: "Asha Rai", email: "asha.rai@student.univ.edu", dept: "CSE", sem: "CSE-3", section: "A", account: true },
    { roll: "CSE-2302", name: "Bikash Shrestha", email: "bikash.shrestha@student.univ.edu", dept: "CSE", sem: "CSE-3", section: "A" },
    { roll: "CSE-2303", name: "Chandra Adhikari", email: "chandra.adhikari@student.univ.edu", dept: "CSE", sem: "CSE-3", section: "A", group: "G2" },
    { roll: "CSE-2304", name: "Deepa Magar", email: "deepa.magar@student.univ.edu", dept: "CSE", sem: "CSE-3", section: "B" },
    { roll: "CSE-2305", name: "Eshan Limbu", email: "eshan.limbu@student.univ.edu", dept: "CSE", sem: "CSE-3", section: "B" },
    { roll: "CSE-2101", name: "Fatima Ansari", email: "fatima.ansari@student.univ.edu", dept: "CSE", sem: "CSE-1", section: "A" },
    { roll: "CSE-2102", name: "Gagan Bista", email: "gagan.bista@student.univ.edu", dept: "CSE", sem: "CSE-1", section: "A" },
    { roll: "CSE-2501", name: "Hari Poudel", email: "hari.poudel@student.univ.edu", dept: "CSE", sem: "CSE-5", section: "A" },
    { roll: "EEE-2301", name: "Indira Tamang", email: "indira.tamang@student.univ.edu", dept: "EEE", sem: "EEE-3", section: "A" },
    { roll: "BBA-2301", name: "Jeevan Khadka", email: "jeevan.khadka@student.univ.edu", dept: "BBA", sem: "BBA-3", section: "A" },
  ];

  const students = {};
  for (const s of studentDefs) {
    let userId = null;
    if (s.account) {
      const u = await upsertUser({
        email: s.email,
        name: s.name,
        password: config.seed.studentPassword,
        role: roles[ROLES.STUDENT]._id,
        department: departments[s.dept]._id,
      });
      userId = u._id;
    }
    students[s.roll] = await upsert(
      M.Student,
      { rollNo: s.roll },
      {
        set: {
          fullName: s.name,
          email: s.email,
          department: departments[s.dept]._id,
          semester: semesters[s.sem]._id,
          section: s.section,
          groupLabel: s.group || DEFAULT_GROUP_LABEL,
          batchYear: 2023,
          status: "active",
        },
      }
    );
  }

  // Head of department, now that teachers exist.
  await M.Department.updateOne(
    { _id: departments.CSE._id },
    { $set: { headTeacher: teachers["T-1001"]._id } }
  );

  return { superAdmin, cseAdmin, eeeAdmin, teachers, students };
}

async function seedRoutines({ departments, semesters, courses, teachers, rooms, slots, users }) {
  logger.info("Seeding routines…");

  const sessionKey = `${ACADEMIC_YEAR}-${TERM}`;

  /**
   * A PUBLISHED routine for CSE semester 3 — so the grid, the reports and the
   * dashboard all render non-empty on first login, and teachers/students have
   * something visible immediately.
   */
  const published = await upsert(
    M.Routine,
    { department: departments.CSE._id, semester: semesters["CSE-3"]._id, academicYear: ACADEMIC_YEAR, term: TERM },
    {
      set: {
        title: `CSE Semester 3 — ${TERM} ${ACADEMIC_YEAR}`,
        sessionKey,
        status: ROUTINE_STATUS.PUBLISHED,
        submittedBy: users.cseAdmin._id,
        submittedAt: new Date("2026-01-05"),
        approvedBy: users.superAdmin._id,
        approvedAt: new Date("2026-01-08"),
        publishedBy: users.superAdmin._id,
        publishedAt: new Date("2026-01-10"),
        effectiveFrom: new Date("2026-01-15"),
        createdBy: users.cseAdmin._id,
      },
    }
  );

  /**
   * A DRAFT routine for CSE semester 5, so the submit → approve → publish
   * workflow can be demonstrated straight away without first building one.
   */
  const draft = await upsert(
    M.Routine,
    { department: departments.CSE._id, semester: semesters["CSE-5"]._id, academicYear: ACADEMIC_YEAR, term: TERM },
    {
      set: {
        title: `CSE Semester 5 — ${TERM} ${ACADEMIC_YEAR}`,
        sessionKey,
        status: ROUTINE_STATUS.DRAFT,
        createdBy: users.cseAdmin._id,
      },
    }
  );

  /**
   * Entries for the published routine. Section A and B run in parallel, and
   * CSE304 is a split lab (G1/G2 in two different labs at the same time) — which
   * exercises the groupLabel dimension of the section-conflict rule.
   *
   * Every teacher/room/slot combination below is deliberately conflict-free;
   * the seeder would fail loudly on a unique-index violation otherwise, which
   * makes it a useful self-check on the index definitions.
   */
  const E = (day, order, courseCode, teacherCode, roomCode, section, group, classType) => ({
    day,
    timeSlot: slots[order]._id,
    course: courses[courseCode]._id,
    teacher: teachers[teacherCode]._id,
    room: rooms[roomCode]._id,
    section,
    groupLabel: group || DEFAULT_GROUP_LABEL,
    classType: classType || "Lecture",
  });

  const entries = [
    // ── Sunday ──
    E("Sunday", 1, "CSE301", "T-1001", "A-101", "A"),
    E("Sunday", 1, "CSE302", "T-1002", "A-102", "B"),
    E("Sunday", 2, "CSE302", "T-1002", "A-101", "A"),
    E("Sunday", 2, "CSE301", "T-1001", "A-102", "B"),
    E("Sunday", 3, "CSE303", "T-1003", "A-101", "A"),
    // ── Monday ──
    E("Monday", 1, "CSE303", "T-1003", "A-101", "A"),
    E("Monday", 2, "CSE301", "T-1001", "A-101", "A"),
    E("Monday", 5, "CSE304", "T-1004", "CSE-LAB1", "A", "G1", "Lab"),
    E("Monday", 5, "CSE304", "T-1002", "CSE-LAB2", "A", "G2", "Lab"),
    // ── Tuesday ──
    E("Tuesday", 1, "CSE302", "T-1002", "A-101", "A"),
    E("Tuesday", 2, "CSE303", "T-1003", "A-101", "A"),
    E("Tuesday", 3, "CSE301", "T-1001", "A-101", "A"),
    // ── Wednesday ──
    E("Wednesday", 1, "CSE301", "T-1001", "A-101", "A"),
    E("Wednesday", 2, "CSE302", "T-1002", "A-101", "A"),
    E("Wednesday", 5, "CSE304", "T-1004", "CSE-LAB1", "B", "G1", "Lab"),
    // ── Thursday ──
    E("Thursday", 1, "CSE303", "T-1003", "A-101", "A"),
    E("Thursday", 2, "CSE301", "T-1001", "A-201", "A"),
  ];

  for (const e of entries) {
    await upsert(
      M.RoutineEntry,
      {
        sessionKey,
        day: e.day,
        timeSlot: e.timeSlot,
        semester: semesters["CSE-3"]._id,
        section: e.section,
        groupLabel: e.groupLabel,
      },
      {
        set: {
          routine: published._id,
          department: departments.CSE._id,
          course: e.course,
          teacher: e.teacher,
          room: e.room,
          classType: e.classType,
          createdBy: users.cseAdmin._id,
        },
      }
    );
  }

  await M.Routine.updateOne({ _id: published._id }, { $set: { entryCount: entries.length } });

  return { published, draft };
}

/* ── Runner ──────────────────────────────────────────────────────────────── */

/** Collections this app owns. --fresh drops only these, never the whole database. */
const APP_COLLECTIONS = [
  "permissions", "roles", "users", "sessions",
  "departments", "semesters", "courses", "rooms", "timeslots",
  "teachers", "students", "routines", "routine_entries",
  "notifications", "activity_logs",
];

async function dropAppCollections() {
  logger.warn("--fresh: dropping this application's collections…");
  const present = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  for (const name of APP_COLLECTIONS) {
    if (present.includes(name)) {
      await mongoose.connection.db.collection(name).drop();
      logger.info(`  dropped ${name}`);
    }
  }
}

function printSummary() {
  const rows = Object.entries(stats).sort(([a], [b]) => a.localeCompare(b));
  const width = Math.max(...rows.map(([name]) => name.length), 12);

  console.log("\n  Collection".padEnd(width + 4) + "Created   Existing");
  console.log("  " + "─".repeat(width + 22));
  let created = 0;
  let updated = 0;
  for (const [name, s] of rows) {
    console.log(`  ${name.padEnd(width + 2)}${String(s.created).padStart(5)}${String(s.updated).padStart(11)}`);
    created += s.created;
    updated += s.updated;
  }
  console.log("  " + "─".repeat(width + 22));
  console.log(`  ${"TOTAL".padEnd(width + 2)}${String(created).padStart(5)}${String(updated).padStart(11)}\n`);
}

function printCredentials() {
  console.log("  Demo accounts");
  console.log("  ─────────────────────────────────────────────────────────────────────");
  const rows = [
    ["Super Admin", config.seed.superAdminEmail, config.seed.superAdminPassword, "everything, incl. approve + publish"],
    ["Dept Admin (CSE)", "cse.admin@univ.edu", config.seed.deptAdminPassword, "CSE only; cannot publish"],
    ["Dept Admin (EEE)", "eee.admin@univ.edu", config.seed.deptAdminPassword, "EEE only — use to test isolation"],
    ["Teacher", "rita.sharma@univ.edu", config.seed.teacherPassword, "own routine, read-only"],
    ["Student", "asha.rai@student.univ.edu", config.seed.studentPassword, "own routine + search"],
  ];
  for (const [role, email, password, note] of rows) {
    console.log(`  ${role.padEnd(18)} ${email.padEnd(30)} ${password.padEnd(12)} ${note}`);
  }
  console.log("  ─────────────────────────────────────────────────────────────────────\n");
}

async function main() {
  const started = Date.now();
  await connectDB();

  if (FRESH) await dropAppCollections();

  // Ensure indexes exist before inserting, so a bad seed fails on the unique
  // constraint rather than quietly creating conflicting data.
  logger.info("Building indexes…");
  for (const Model of Object.values(M)) await Model.createIndexes();

  const permissions = shouldRun("permissions") ? await seedPermissions() : {};
  const roles = shouldRun("roles") ? await seedRoles(permissions) : {};

  if (ONLY_SET && !shouldRun("departments")) {
    invalidateAll();
    printSummary();
    await disconnectDB();
    return;
  }

  const departments = await seedDepartments();
  const slots = await seedTimeSlots();
  const rooms = await seedRooms(departments);
  const semesters = await seedSemesters(departments);
  const courses = await seedCourses(departments);
  const users = await seedUsersAndProfiles(roles, departments, semesters);
  await seedRoutines({
    departments, semesters, courses, rooms, slots,
    teachers: users.teachers, users,
  });

  // The cache may hold a stale role → permission mapping from before this run.
  invalidateAll();

  printSummary();
  printCredentials();
  logger.info(`Seed complete in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  await disconnectDB();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    logger.error("Seeding failed:", err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
