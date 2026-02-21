// src/models/index.js
const User = require("./User");        // ✅ Add User
const Student = require("./Student");
const Teacher = require("./Teacher");
const Subject = require("./Subject");
const Routine = require("./Routine");

/**
 * ==========================
 * MODEL RELATIONSHIPS
 * ==========================
 */

// ==========================
// Teacher ↔ Subject
// ==========================
Teacher.hasMany(Subject, {
  foreignKey: "teacherId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Subject.belongsTo(Teacher, {
  foreignKey: "teacherId",
});

// ==========================
// Student ↔ Routine
// ==========================
Student.hasMany(Routine, {
  foreignKey: "studentId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Routine.belongsTo(Student, {
  foreignKey: "studentId",
});

// ==========================
// Subject ↔ Routine
// ==========================
Subject.hasMany(Routine, {
  foreignKey: "subjectId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Routine.belongsTo(Subject, {
  foreignKey: "subjectId",
});

// ==========================
// Teacher ↔ Routine
// ==========================
Teacher.hasMany(Routine, {
  foreignKey: "teacherId",
  onDelete: "CASCADE",
  onUpdate: "CASCADE",
});

Routine.belongsTo(Teacher, {
  foreignKey: "teacherId",
});

module.exports = {
  User,      // ✅ Export User
  Student,
  Teacher,
  Subject,
  Routine,
};
