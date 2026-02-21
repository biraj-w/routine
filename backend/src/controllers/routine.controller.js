const { Routine, Student, Teacher, Subject } = require("../models");

// CREATE ROUTINE
exports.createRoutine = async (req, res) => {
  try {
    const routine = await Routine.create(req.body);
    const routineWithRelations = await Routine.findByPk(routine.id, {
      include: [Student, Teacher, Subject],
    });
    res.status(201).json(routineWithRelations);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// GET ALL ROUTINES
exports.getAllRoutines = async (req, res) => {
  try {
    const routines = await Routine.findAll({ include: [Student, Teacher, Subject] });
    res.json(routines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET ROUTINE BY ID
exports.getRoutineById = async (req, res) => {
  try {
    const routine = await Routine.findByPk(req.params.id, { include: [Student, Teacher, Subject] });
    if (!routine) return res.status(404).json({ message: "Routine not found" });
    res.json(routine);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// UPDATE ROUTINE
exports.updateRoutine = async (req, res) => {
  try {
    const routine = await Routine.findByPk(req.params.id);
    if (!routine) return res.status(404).json({ message: "Routine not found" });

    await routine.update(req.body);

    const updatedRoutine = await Routine.findByPk(routine.id, { include: [Student, Teacher, Subject] });
    res.json(updatedRoutine);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// DELETE ROUTINE
exports.deleteRoutine = async (req, res) => {
  try {
    const routine = await Routine.findByPk(req.params.id);
    if (!routine) return res.status(404).json({ message: "Routine not found" });

    await routine.destroy();
    res.json({ message: "Routine deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};