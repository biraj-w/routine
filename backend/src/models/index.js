/**
 * Model registry.
 *
 * Requiring this file registers every schema with Mongoose, which matters
 * because `.populate('department')` needs the Department model to exist even if
 * the calling module never imported it directly. Importing from here rather
 * than from individual files means that always holds.
 *
 * Declaration order follows dependency order for readability; Mongoose itself
 * resolves refs lazily, so the order is not load-bearing.
 */

// Authorization
const Permission = require("./Permission");
const Role = require("./Role");
const User = require("./User");
const Session = require("./Session");

// Master data
const Department = require("./Department");
const Semester = require("./Semester");
const Course = require("./Course");
const Room = require("./Room");
const TimeSlot = require("./TimeSlot");
const Teacher = require("./Teacher");
const Student = require("./Student");

// Routine
const Routine = require("./Routine");
const RoutineEntry = require("./RoutineEntry");

// Cross-cutting
const Notification = require("./Notification");
const ActivityLog = require("./ActivityLog");

module.exports = {
  Permission,
  Role,
  User,
  Session,
  Department,
  Semester,
  Course,
  Room,
  TimeSlot,
  Teacher,
  Student,
  Routine,
  RoutineEntry,
  Notification,
  ActivityLog,
};
