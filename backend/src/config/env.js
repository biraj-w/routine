/**
 * Centralised environment access.
 *
 * process.env is read here and nowhere else, so every setting has exactly one
 * name, one default and one type. Required values are validated at startup —
 * the app refuses to boot on a bad config rather than failing at the first
 * request that happens to need it.
 */
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

/** Read a required variable, or die with a message that says how to fix it. */
function required(key) {
  const value = process.env[key];
  if (!value || !value.trim()) {
    console.error(
      `\n[config] Missing required environment variable: ${key}\n` +
        `          Copy backend/.env.example to backend/.env and fill it in.\n`
    );
    process.exit(1);
  }
  return value.trim();
}

function num(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    console.error(`[config] ${key} must be a number, got "${raw}"`);
    process.exit(1);
  }
  return parsed;
}

function list(key) {
  return (process.env[key] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || "development";

const config = {
  nodeEnv,
  isProduction: nodeEnv === "production",
  isDevelopment: nodeEnv !== "production",
  port: num("PORT", 3000),

  mongoUri: required("MONGO_URI"),

  jwt: {
    accessSecret: required("JWT_ACCESS_SECRET"),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
  },

  session: {
    refreshTokenDays: num("REFRESH_TOKEN_DAYS", 7),
    refreshIdleHours: num("REFRESH_IDLE_HOURS", 8),
  },

  security: {
    bcryptRounds: num("BCRYPT_ROUNDS", 10),
    resetTokenTtlMinutes: num("RESET_TOKEN_TTL_MIN", 15),
    maxFailedLogins: num("MAX_FAILED_LOGINS", 5),
  },

  // Empty by default: Express serves the frontend on the same origin, so no
  // cross-origin requests occur. Populate only when serving the frontend
  // separately (e.g. Live Server).
  corsOrigins: list("CORS_ORIGINS"),

  seed: {
    superAdminEmail: process.env.SEED_SUPER_ADMIN_EMAIL || "superadmin@univ.edu",
    superAdminPassword: process.env.SEED_SUPER_ADMIN_PASSWORD || "Admin@123",
    deptAdminPassword: process.env.SEED_DEPT_ADMIN_PASSWORD || "Dept@123",
    teacherPassword: process.env.SEED_TEACHER_PASSWORD || "Teach@123",
    studentPassword: process.env.SEED_STUDENT_PASSWORD || "Stud@123",
  },

  logLevel: process.env.LOG_LEVEL || "dev",
};

// A weak secret in production is a deployment mistake, not a preference.
if (config.isProduction && config.jwt.accessSecret.length < 32) {
  console.error("[config] JWT_ACCESS_SECRET must be at least 32 characters in production.");
  process.exit(1);
}

module.exports = config;
