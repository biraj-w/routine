const Teacher = require("../models/Teacher");

// ✅ CREATE TEACHER
exports.createTeacher = async (req, res) => {
  try {
    const { name, department } = req.body;

    if (!name || !department) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const teacher = await Teacher.create({
      name,
      department,
    });

    res.status(201).json({
      message: "Teacher created successfully",
      teacher,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET ALL TEACHERS
exports.getTeachers = async (req, res) => {
  try {
    const teachers = await Teacher.findAll({
      attributes: ["id", "name", "department"],
    });

    res.json(teachers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ GET SINGLE TEACHER
exports.getTeacherById = async (req, res) => {
  try {
    const teacher = await Teacher.findByPk(req.params.id);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }
    res.json(teacher);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ UPDATE TEACHER
exports.updateTeacher = async (req, res) => {
  try {
    const { name, department } = req.body;

    const teacher = await Teacher.findByPk(req.params.id);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    await teacher.update({
      name,
      department,
    });

    res.json({
      message: "Teacher updated successfully",
      teacher,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ DELETE TEACHER
exports.deleteTeacher = async (req, res) => {
  try {
    const teacher = await Teacher.findByPk(req.params.id);
    if (!teacher) {
      return res.status(404).json({ message: "Teacher not found" });
    }

    await teacher.destroy();
    res.json({ message: "Teacher deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
