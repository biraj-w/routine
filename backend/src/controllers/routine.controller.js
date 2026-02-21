const { Routine, Student, Teacher, Subject } = require("../models");
const { Op } = require("sequelize");

/**
 * CREATE ROUTINE
 */
exports.createRoutine = async (req, res) => {
  try {
    const { studentId, teacherId, subjectId, day, startTime, endTime } = req.body;

    if (!studentId || !teacherId || !subjectId || !day || !startTime || !endTime) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // ⏰ Check for time clash (same teacher, same day)
    const clash = await Routine.findOne({
      where: {
        teacherId,
        day,
        [Op.or]: [
          {
            startTime: { [Op.between]: [startTime, endTime] },
          },
          {
            endTime: { [Op.between]: [startTime, endTime] },
          },
          {
            [Op.and]: [
              { startTime: { [Op.lte]: startTime } },
              { endTime: { [Op.gte]: endTime } },
            ],
          },
        ],
      },
    });

    if (clash) {
      return res.status(409).json({ message: "Teacher already has a routine at this time" });
    }

    const routine = await Routine.create({ studentId, teacherId, subjectId, day, startTime, endTime });

    const routineWithRelations = await Routine.findByPk(routine.id, {
      include: [Student, Teacher, Subject],
    });

    res.status(201).json({
      message: "Routine created successfully",
      routine: routineWithRelations,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET ALL ROUTINES
 */
exports.getAllRoutines = async (req, res) => {
  try {
    const routines = await Routine.findAll({
      include: [Student, Teacher, Subject],
      order: [["day", "ASC"], ["startTime", "ASC"]],
    });

    res.json(routines);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * GET ROUTINE BY ID
 */
exports.getRoutineById = async (req, res) => {
  try {
    const routine = await Routine.findByPk(req.params.id, { include: [Student, Teacher, Subject] });
    if (!routine) return res.status(404).json({ message: "Routine not found" });
    res.json(routine);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * UPDATE ROUTINE
 */
exports.updateRoutine = async (req, res) => {
  try {
    const routine = await Routine.findByPk(req.params.id);
    if (!routine) return res.status(404).json({ message: "Routine not found" });

    const { studentId, teacherId, subjectId, day, startTime, endTime } = req.body;

    // ⏰ Time clash check excluding self
    const clash = await Routine.findOne({
      where: {
        id: { [Op.ne]: routine.id },
        teacherId,
        day,
        [Op.or]: [
          { startTime: { [Op.between]: [startTime, endTime] } },
          { endTime: { [Op.between]: [startTime, endTime] } },
          { [Op.and]: [{ startTime: { [Op.lte]: startTime } }, { endTime: { [Op.gte]: endTime } }] },
        ],
      },
    });

    if (clash) return res.status(409).json({ message: "Teacher already has a routine at this time" });

    await routine.update({ studentId, teacherId, subjectId, day, startTime, endTime });

    const routineWithRelations = await Routine.findByPk(routine.id, {
      include: [Student, Teacher, Subject],
    });

    res.json({ message: "Routine updated successfully", routine: routineWithRelations });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * DELETE ROUTINE
 */
exports.deleteRoutine = async (req, res) => {
  try {
    const routine = await Routine.findByPk(req.params.id);
    if (!routine) return res.status(404).json({ message: "Routine not found" });

    await routine.destroy();
    res.json({ message: "Routine deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
