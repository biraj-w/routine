/**
 * Process entry point: connect the database, bind the port, and shut down
 * cleanly.
 *
 * Kept separate from app.js so that "what the application is" (routes,
 * middleware) is independent of "how this process runs it" (ports, signals,
 * connections).
 */
const config = require("./config/env");
const { connectDB, disconnectDB } = require("./config/db");
const logger = require("./utils/logger");
const app = require("./app");

let server;

async function start() {
  // Connect first: booting a server that cannot reach its database only moves
  // the failure to the first request, where it is harder to diagnose.
  await connectDB();

  server = app.listen(config.port, () => {
    logger.info(`Server listening on http://localhost:${config.port}  [${config.nodeEnv}]`);
    logger.info(`API      → http://localhost:${config.port}/api/health`);
    logger.info(`Frontend → http://localhost:${config.port}/pages/login.html`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      logger.error(`Port ${config.port} is already in use. Stop the other process or change PORT in .env.`);
      process.exit(1);
    }
    throw err;
  });
}

/**
 * Stop accepting connections, let in-flight requests finish, then close the
 * database. The 10s timer is a backstop against a hung connection keeping the
 * process alive forever.
 */
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down.`);
  const forceExit = setTimeout(() => {
    logger.error("Graceful shutdown timed out after 10s, forcing exit.");
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  try {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
    logger.info("Shutdown complete.");
    process.exit(0);
  } catch (err) {
    logger.error("Error during shutdown:", err.message);
    process.exit(1);
  }
}

["SIGINT", "SIGTERM"].forEach((signal) => process.on(signal, () => shutdown(signal)));

// A rejection or exception that reaches this point means state is unknown, so
// the only safe action is to log loudly and let the supervisor restart us.
process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection:", reason);
  shutdown("unhandledRejection");
});
process.on("uncaughtException", (err) => {
  logger.error("Uncaught exception:", err.stack || err.message);
  process.exit(1);
});

start();
