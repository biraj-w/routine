/**
 * Minimal levelled logger.
 *
 * Deliberately dependency-free: this project's logging needs are a timestamp
 * and a level, and a real logging library would be unexplained weight in a
 * teaching codebase. Swapping in winston/pino later means changing this file
 * only, since nothing else calls console directly.
 */
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };

// LOG_LEVEL doubles as the morgan format ("dev"), so treat anything that
// isn't one of our level names as "info".
const configured = process.env.LOG_LEVEL;
const threshold = LEVELS[configured] !== undefined ? LEVELS[configured] : LEVELS.info;

function stamp() {
  return new Date().toISOString();
}

function emit(level, sink, args) {
  if (LEVELS[level] > threshold) return;
  sink(`${stamp()} [${level.toUpperCase()}]`, ...args);
}

module.exports = {
  error: (...args) => emit("error", console.error, args),
  warn: (...args) => emit("warn", console.warn, args),
  info: (...args) => emit("info", console.log, args),
  debug: (...args) => emit("debug", console.log, args),
};
