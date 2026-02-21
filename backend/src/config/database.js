// src/config/database.js
const { Sequelize } = require("sequelize");
require("dotenv").config();

// Create Sequelize instance
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: "mysql",

    // Connection pool (similar to mysql2.createPool)
    pool: {
      max: 10, // max connections
      min: 0,  // min connections
      acquire: 30000,
      idle: 10000,
    },

    logging: false, // disable SQL logs
  }
);

/**
 * Connect to the database and test connection
 */
const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ MySQL Connected (Sequelize)");
  } catch (error) {
    console.error("❌ MySQL Connection Failed:", error.message);
    process.exit(1); // exit if DB not reachable
  }
};

module.exports = {
  sequelize,
  connectDB,
};
