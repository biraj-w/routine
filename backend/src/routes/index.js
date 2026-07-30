/**
 * API route table. Everything here is mounted under /api by app.js.
 *
 * Feature routers are added as each phase lands; the health endpoint exists
 * from the start so the foundation is verifiable before any model does.
 */
const express = require("express");
const mongoose = require("mongoose");
const { connectionState } = require("../config/db");
const { success } = require("../utils/response");
const config = require("../config/env");

const router = express.Router();

/* ── Feature routers ─────────────────────────────────────────────────────── */
router.use("/auth", require("./auth.routes"));

// Administration
router.use("/users", require("./user.routes"));
router.use("/roles", require("./role.routes"));

// Master data
router.use("/departments", require("./department.routes"));
router.use("/semesters", require("./semester.routes"));
router.use("/courses", require("./course.routes"));
router.use("/teachers", require("./teacher.routes"));
router.use("/students", require("./student.routes"));
router.use("/rooms", require("./room.routes"));
router.use("/timeslots", require("./timeslot.routes"));

// Routine engine
router.use("/routines", require("./routine.routes"));

// Reporting and cross-cutting
router.use("/dashboard", require("./dashboard.routes"));
router.use("/reports", require("./report.routes"));
router.use("/notifications", require("./notification.routes"));
router.use("/activity-logs", require("./activity.routes"));

/**
 * GET /api/health
 * Liveness plus database reachability, in the standard envelope.
 */
router.get("/health", (req, res) =>
  success(res, {
    message: "API is healthy",
    data: {
      status: "ok",
      environment: config.nodeEnv,
      database: connectionState(),
      databaseName: mongoose.connection.name || null,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  })
);

module.exports = router;
