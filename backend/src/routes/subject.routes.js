// src/routes/subject.routes.js
const express = require("express");
const router = express.Router();
const subjectController = require("../controllers/subject.controller");

// Create a new Subject
router.post("/", subjectController.createSubject);

// Get all Subjects
router.get("/", subjectController.getSubjects);

// Get a single Subject by ID
router.get("/:id", subjectController.getSubjectById);

// Update a Subject by ID
router.put("/:id", subjectController.updateSubject);

// Delete a Subject by ID
router.delete("/:id", subjectController.deleteSubject);

module.exports = router;
