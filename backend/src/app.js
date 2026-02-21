// src/app.js
const express = require("express");
const cors = require("cors");

// Routes
const authRoutes = require("./routes/auth.routes");
const studentRoutes = require("./routes/student.routes");
const teacherRoutes = require("./routes/teacher.routes");
const subjectRoutes = require("./routes/subject.routes");
const routineRoutes = require("./routes/routine.routes");

const app = express();

/* =========================
   MIDDLEWARES
========================= */

// ✅ Allow frontend (Live Server)
app.use(cors({
  origin: "http://127.0.0.1:5500",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

// ✅ Handle preflight explicitly (IMPORTANT)
app.options("*", (req, res) => {
  res.sendStatus(200);
});

// Parse JSON
app.use(express.json());

/* =========================
   ROUTES
========================= */
app.use("/api/auth", authRoutes);
app.use("/api/students", studentRoutes);
app.use("/api/teachers", teacherRoutes);
app.use("/api/subjects", subjectRoutes);
app.use("/api/routines", routineRoutes);

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("✅ Student Routine API is running");
});

module.exports = app;
