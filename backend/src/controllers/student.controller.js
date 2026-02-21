const { Student } = require("../models");

// Create Student
exports.createStudent = async (req, res) => {
  try {
    const student = await Student.create(req.body);
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Get All Students
exports.getStudents = async (req, res) => {
  const students = await Student.findAll();
  res.json(students);
};

// Get Student By ID
exports.getStudentById = async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });
  res.json(student);
};

// Update Student
exports.updateStudent = async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });

  await student.update(req.body);
  res.json(student);
};

// Delete Student
exports.deleteStudent = async (req, res) => {
  const student = await Student.findByPk(req.params.id);
  if (!student) return res.status(404).json({ message: "Student not found" });

  await student.destroy();
  res.json({ message: "Student deleted" });
};
