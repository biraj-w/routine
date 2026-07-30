/**
 * Course controller — generated from the CRUD factory.
 */
const { Course, RoutineEntry } = require("../models");
const { createCrudController } = require("../utils/crudFactory");

module.exports = createCrudController({
  Model: Course,
  label: "course",
  searchFields: ["code", "title"],
  allowedFilters: ["department", "semesterNumber", "type", "isActive"],
  allowedSorts: ["code", "title", "credits", "semesterNumber", "createdAt"],
  defaultSort: "code",
  populate: [{ path: "department", select: "name code" }],
  references: [{ Model: RoutineEntry, field: "course", label: "routine entry" }],
  describe: (doc) => `${doc.code} — ${doc.title}`,
});
