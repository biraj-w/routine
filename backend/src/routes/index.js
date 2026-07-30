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
