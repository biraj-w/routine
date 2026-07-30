/**
 * MongoDB connection via Mongoose.
 *
 * Note on transactions: this project targets a standalone `mongod`, which has
 * no replica set and therefore no multi-document transaction support —
 * session.startTransaction() would throw. Correctness that would normally lean
 * on a transaction is instead guaranteed by unique indexes (enforced
 * atomically at the storage layer) plus compensating cleanup in services.
 * See docs/architecture.md.
 */
const mongoose = require("mongoose");
const config = require("./env");
const logger = require("../utils/logger");

/** Strip credentials before a URI ever reaches a log line. */
function safeUri(uri) {
  return uri.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@");
}

async function connectDB() {
  mongoose.set("strictQuery", true);

  mongoose.connection.on("connected", () => {
    logger.info(`MongoDB connected → ${mongoose.connection.name}`);
  });
  mongoose.connection.on("error", (err) => {
    logger.error("MongoDB connection error:", err.message);
  });
  mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
  });

  try {
    await mongoose.connect(config.mongoUri, {
      serverSelectionTimeoutMS: 8000,
    });
  } catch (err) {
    logger.error(`Could not connect to MongoDB at ${safeUri(config.mongoUri)}`);
    logger.error(err.message);
    logger.error("Is mongod running? On Windows: Get-Service MongoDB");
    process.exit(1);
  }
}

async function disconnectDB() {
  await mongoose.connection.close(false);
}

/** Human-readable state for the /api/health endpoint. */
function connectionState() {
  return (
    { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" }[
      mongoose.connection.readyState
    ] || "unknown"
  );
}

module.exports = { connectDB, disconnectDB, connectionState };
