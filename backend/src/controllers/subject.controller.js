// src/controllers/subject.controller.js
const Subject = require("../models/Subject");

// ✅ CREATE SUBJECT
exports.createSubject = async (req, res) => {
  try {
    const { subjectName } = req.body;

    if (!subjectName) {
      return res.status(400).json({ message: "Subject name is required" });
    }

    const subject = await Subject.create({ subjectName });

    res.status(201).json({
      message: "Subject created successfully",
      subject,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET ALL SUBJECTS
exports.getSubjects = async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      attributes: ["id", "subjectName", "createdAt", "updatedAt"],
    });
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET SINGLE SUBJECT
exports.getSubjectById = async (req, res) => {
  try {
    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }
    res.json(subject);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ UPDATE SUBJECT
exports.updateSubject = async (req, res) => {
  try {
    const { subjectName } = req.body;

    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    await subject.update({ subjectName });

    res.json({
      message: "Subject updated successfully",
      subject,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ DELETE SUBJECT
exports.deleteSubject = async (req, res) => {
  try {
    const subject = await Subject.findByPk(req.params.id);
    if (!subject) {
      return res.status(404).json({ message: "Subject not found" });
    }

    await subject.destroy();
    res.json({ message: "Subject deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
