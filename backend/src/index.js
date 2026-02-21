// src/index.js
require("dotenv").config();
const app = require("./app");
const { connectDB, sequelize } = require("./config/database");

// ✅ Import all models BEFORE syncing
require("./models/Student.js");
require("./models/Teacher.js");
require("./models/Subject.js");
require("./models/Routine.js");

const startServer = async () => {
  try {
    // Connect to MySQL
    await connectDB();

    // Sync models => creates tables if not exist
    await sequelize.sync({ alter: true }); // safe in development

    // Start Express server
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
};

startServer();
