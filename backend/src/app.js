/**
 * Express application assembly.
 *
 * This file wires middleware and routes and exports the app — it deliberately
 * does NOT call listen(). Keeping startup (database connection, port binding,
 * signal handling) in server.js means the app can be imported and exercised
 * without opening a socket, and it separates "what the application is" from
 * "how this process runs it".
 *
 * ── Middleware order matters ───────────────────────────────────────────────
 *   1. helmet            security headers, before anything can respond
 *   2. cors              only if a separate frontend origin is configured
 *   3. body parsers      populate req.body
 *   4. sanitize          scrub Mongo operators from the parsed body
 *   5. morgan            log the request once it is understood
 *   6. static frontend   serve the UI from the same origin as the API
 *   7. /api routes       the application itself
 *   8. notFound          unmatched /api paths → 404 envelope
 *   9. errorHandler      last, so every throw above converges here
 * ──────────────────────────────────────────────────────────────────────────
 */
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const config = require("./config/env");
const apiRoutes = require("./routes");
const sanitize = require("./middlewares/sanitize");
const notFound = require("./middlewares/notFound");
const errorHandler = require("./middlewares/errorHandler");

const app = express();
const FRONTEND_DIR = path.join(__dirname, "..", "..", "frontend");

// Behind a reverse proxy this makes req.ip the real client address rather than
// the proxy's — the activity log records it.
app.set("trust proxy", 1);

/* ── 1. Security headers ─────────────────────────────────────────────────── */
app.use(
  helmet({
    // The frontend is plain HTML/CSS/JS from this same origin with no CDN
    // dependencies, so a restrictive CSP is achievable. 'unsafe-inline' for
    // styles only, since a few pages set inline style attributes.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

/* ── 2. CORS ─────────────────────────────────────────────────────────────────
 * Normally a no-op: Express serves the frontend itself, so requests are
 * same-origin and no preflight occurs. Configure CORS_ORIGINS only when
 * serving frontend/ separately (e.g. Live Server on :5500).
 * Note `origin: true` is never used — reflecting arbitrary origins while
 * accepting an Authorization header defeats the point of an allowlist.
 */
if (config.corsOrigins.length) {
  app.use(
    cors({
      origin: config.corsOrigins,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: false,
      maxAge: 600,
    })
  );
}

/* ── 3. Body parsing ────────────────────────────────────────────────────────
 * A 10 kB cap: no endpoint in this API legitimately accepts more, and an
 * unbounded parser is a trivial memory-exhaustion vector.
 */
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

/* ── 4. NoSQL operator stripping ─────────────────────────────────────────── */
app.use(sanitize);

/* ── 5. Request logging ─────────────────────────────────────────────────────
 * Skipped for static assets, which would otherwise drown the useful lines.
 */
app.use(
  morgan(config.isProduction ? "combined" : "dev", {
    skip: (req) => !req.originalUrl.startsWith("/api"),
  })
);

/* ── 6. Static frontend, same origin as the API ─────────────────────────── */
app.use(express.static(FRONTEND_DIR, { extensions: ["html"] }));
app.get("/", (req, res) => res.redirect("/pages/login.html"));

/* ── 7. The API ─────────────────────────────────────────────────────────── */
app.use("/api", apiRoutes);

/* ── 8/9. Fallbacks ─────────────────────────────────────────────────────── */
app.use("/api", notFound);
app.use(errorHandler);

module.exports = app;
