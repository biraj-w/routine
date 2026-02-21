const express = require("express");
const router = express.Router();
const routineController = require("../controllers/routine.controller");

/**
 * ROUTINE ROUTES
 * Base URL: /api/routines
 */

// Create Routine
router.post("/", routineController.createRoutine);

// Update Routine
router.put("/:id", routineController.updateRoutine);

// Get All Routines
router.get("/", routineController.getAllRoutines);

// Get Routine By ID
router.get("/:id", routineController.getRoutineById);

// Delete Routine
router.delete("/:id", routineController.deleteRoutine);

module.exports = router;