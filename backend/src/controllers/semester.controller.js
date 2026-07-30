/**
 * Semester controller — generated from the CRUD factory.
 * See utils/crudFactory.js and the hand-written department.controller.js.
 */
const { Semester, Student, Routine, RoutineEntry } = require("../models");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController({
  Model: Semester,
  label: "semester",
  searchFields: ["academicYear", "term"],
  allowedFilters: ["department", "number", "academicYear", "term", "isActive"],
  allowedSorts: ["number", "academicYear", "term", "createdAt"],
  defaultSort: "number",
  populate: [{ path: "department", select: "name code" }],
  references: [
    { Model: Student, field: "semester", label: "student" },
    { Model: Routine, field: "semester", label: "routine" },
    { Model: RoutineEntry, field: "semester", label: "routine entry" },
  ],
  describe: (doc) => `${doc.term} ${doc.academicYear} (semester ${doc.number})`,
});
