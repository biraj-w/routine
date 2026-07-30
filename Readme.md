cd backend

npm init -y

npm install bcrypt cors dotenv express jsonwebtoken mysql2 sequelize

Explanation of dependencies:
express → Server framework
sequelize → ORM for MySQL
mysql2 → MySQL driver
dotenv → Load environment variables
jsonwebtoken → JWT authentication
bcrypt → Password hashing
cors → Enable Cross-Origin Resource Sharing

npm install --save-dev nodemon

npm run dev


## Project

University Routine (timetable) Management System. Express + MongoDB/Mongoose REST API with JWT auth
and permission-based RBAC, serving a **build-step-free vanilla-JS frontend from the same origin**.
Two top-level dirs: `backend/` (the Node app) and `frontend/` (static HTML/CSS/JS served by Express).

## Commands

All npm scripts run from `backend/`:

```bash
npm run dev          # nodemon src/server.js
npm start            # node src/server.js
npm run seed         # idempotent upsert seed — safe to re-run
npm run seed:fresh   # drop this app's collections, then seed
node src/seeds/seed.js --only=permissions,roles   # seed selected steps only
```

Setup: `cd backend && npm install && cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`),
then a local MongoDB on `mongodb://127.0.0.1:27017/routine_db`, then `npm run seed`.

App at `http://localhost:3000` → redirects to `/pages/login.html`; health at `/api/health`
(reports DB connection state). Seeded dev logins are printed by the seeder — `superadmin@univ.edu`,
`cse.admin@univ.edu`, `eee.admin@univ.edu` (use to test department isolation),
`rita.sharma@univ.edu`; passwords come from the `SEED_*` vars in `.env`.

**There is no test suite, no linter, and no build step.** Verification is done by running the app
against the live database. Don't invent `npm test`/`npm run lint`.

## Architecture

### Request pipeline

`server.js` owns the process (DB connect → listen → signal handling); `app.js` only assembles
middleware and routes and exports the app without calling `listen()`. Middleware order in `app.js`
is documented in its header and is load-bearing (helmet → cors → body parsers → `sanitize` →
morgan → static frontend → `/api` routes → `notFound` → `errorHandler`).

Per-route chain (see `routes/helpers/crudRoutes.js`):

```
authenticate → authorize → validate → enforceScope/loadDoc → injectScope → handler
```

`validate` deliberately precedes scope so a malformed id is a 422, not a DB lookup.

### Authorization is two independent axes

This is the single most important design fact in the codebase:

| Axis | Question | Driven by | Implemented in |
|---|---|---|---|
| **Permissions** | *may this user manage courses at all?* | permission strings on the role | `middlewares/authorize.js` |
| **Data scope** | *which department's courses?* | `role.dataScope` = `global`\|`department`\|`self` | `middlewares/scope.js` |

There is intentionally **no `if (roleName === 'Department Admin')` anywhere**. Roles are
configuration (`config/roles.js`), permissions are the contract (`config/permissions.js` is the
single source of truth for every permission string). Add a role by adding data, not branches.

`scope.js` exposes four tools because there are four distinct ways to leak — all four matter:

- `withScope()` — narrows list/detail read queries into `req.scopeFilter`
- `enforceScope(Model)` — loads a `/:id` doc, verifies ownership, attaches `req.doc`
- `loadDoc(Model)` — unscoped sibling for institution-wide resources (rooms, time slots)
- `assertReferencesInScope()` — validates *foreign keys in the body*; called from services, since the
  reference set depends on the payload. This is the one usually missed: forcing the caller's own
  `department` doesn't stop them referencing another department's teacher.

`injectScope()` also strips client-supplied audit fields (`createdBy`/`updatedBy`/`isDeleted`/…).

`authenticate` re-resolves permissions from the DB on every request (via `services/permission.service.js`,
60s in-process cache, explicitly invalidated on role writes) rather than trusting the JWT — so a
revoked permission takes effect on the next call. It also checks session liveness, account status,
and that the token predates the last password change.

### Response envelope (frozen contract)

Everything goes through `utils/response.js`:

```
success: { success: true,  message, data, meta? }
failure: { success: false, message, code, errors? }
```

`withIds()` normalises `id` alongside `_id` recursively, because list endpoints use `.lean()` and
so bypass the `toJSON` plugin. `paginated()` computes the page arithmetic and **preserves extra
`meta` keys** callers add (e.g. `unreadCount`). `code` values live in `config/constants.js`
`ERROR_CODES`; the frontend branches on them (notably `TOKEN_EXPIRED`).

`middlewares/errorHandler.js` is the only place errors are translated, which is why controllers have
no try/catch — they're wrapped in `utils/asyncHandler.js`. Duplicate-key errors are mapped **by
index name** via its `INDEX_MESSAGES` table, so **any new unique index should be given an explicit
name and an entry there**.

### CRUD is generated in matched pairs

`utils/crudFactory.js` (handlers) + `routes/helpers/crudRoutes.js` (routes/middleware) generate
uniform resources. Applied to **semester, course, room, timeslot**.
`controllers/department.controller.js` is deliberately left hand-written as the reference
implementation of what the factory does. **Teacher, Student and User stay hand-written** because each
also creates/updates a linked `User` account. Routes and permissions always stay explicit in each
`routes/*.js` — never moved into a config object — so an endpoint's security posture is readable in
place.

`utils/queryFeatures.js` whitelists filter keys and sort fields and regex-escapes search terms;
never spread `req.query` into a filter.

### Soft delete, with one caveat

`models/plugins/softDelete.plugin.js` adds `isDeleted: false` to every `find*`/`countDocuments`
query, so leaking deleted rows requires opting in (`.setOptions({ withDeleted: true })` or an
explicit `isDeleted` filter). **Query middleware does not run for aggregation pipelines** — every
pipeline in `services/dashboard.service.js` and `services/report.service.js` must open with an
explicit `$match: { isDeleted: false }`.

### Conflict detection — the actual business logic

`models/RoutineEntry.js` denormalises `sessionKey`, `department` and `semester` from the parent
`Routine` so that three **unique partial indexes** (`uniq_teacher_slot`, `uniq_room_slot`,
`uniq_section_slot`, all `partialFilterExpression: { isDeleted: false }`) can enforce the rules
atomically and across departments. Division of labour: **the indexes produce correctness; the
service produces good messages.**

`services/conflict.service.js` collapses all rules into one indexed `$or` query and returns blocking
`conflicts` plus non-blocking `warnings` (teacher unavailable/overloaded, room too small, break slot,
over quota, room-type mismatch). Two things to preserve when touching it:

- **`excludeId` on update** — without it an entry conflicts with itself and nothing can be edited.
- **`groupLabel` in the audience triple** `{semester, section, groupLabel}` — it's what lets split
  lab batches G1/G2 share a slot. The "duplicate course" rule is a *message refinement* of the
  section rule, not an independent constraint; see the `RoutineEntry` header for why a fourth index
  can't be expressed.

`sessionKey`/`department`/`semester` on an entry always come from the routine, **never from the
request body** — accepting them from a client would let a caller opt out of conflict detection.

### Routine lifecycle

`draft → submitted → approved → published → archived`, with reject sending it back to `draft`.
`ROUTINE_TRANSITIONS` in `config/constants.js` is the sole authority; illegal moves are 409s.
All transitions funnel through `routineService.changeStatus()`, which stamps workflow fields, writes
the activity log and notifies. Entries are editable **only while `draft`**. The permission split is
the point of the workflow: Department Admin holds `MANAGE_ROUTINE` + `SUBMIT_ROUTINE`; only Super
Admin holds `APPROVE_ROUTINE` + `PUBLISH_ROUTINE`.

### Frontend: five shared layers, no framework

Each of the 23 pages in `frontend/pages/` is a near-empty HTML file containing `<div id="app">`
plus an **ordered list of `<script>` tags**. Load order is a real dependency graph
(`config/permissions.js` → `config/nav.js` → `core/format.js` → `core/auth.js` → `core/api.js` →
`core/ui.js` → `core/layout.js` → `core/crud.js` → `pages/<name>.js`); modules are IIFEs publishing
`window.PERM`, `window.NAV`, `window.Fmt`, `window.Auth`, `window.Api`, `window.UI`,
`window.Layout`, `window.Crud`. Copy an existing page's script block when adding one.

- `core/api.js` — the only `fetch` wrapper. Unwraps the envelope, and does **single-flight** silent
  refresh on `TOKEN_EXPIRED` then replays the request. Single-flight is required, not an
  optimisation: the backend rotates refresh tokens and treats a replay as theft. 403 toasts, never
  redirects.
- `core/auth.js` — session state in `localStorage` and page guards. **Everything here is cosmetic**;
  the server re-derives permissions per request.
- `core/layout.js` — injects sidebar/header from `config/nav.js`; `applyPermissions()` **removes**
  (not hides) elements carrying `data-permission` / `data-permission-any` / `data-role`, and must be
  re-run after any render that emits them.
- `core/crud.js` — `Crud.createPage(config)` is the client counterpart to `crudFactory`; the
  master-data pages are 25–60 line declarations (see `pages/courses.js`). Note the `Fmt.idOf`
  pattern in `toFormValues`/`toPayload` — populated refs must be flattened back to ids.
- `core/ui.js` — `el()` sets `textContent`, so server data is never interpolated as HTML.

`frontend/js/config/permissions.js` is a **documented mirror** of the backend catalogue used only for
show/hide. Adding a permission means touching both files.

## Conventions and gotchas

- Import models from `models/index.js`, not individual files, so every schema is registered for
  `.populate()`.
- In route files, literal paths (`/search`, `/me`, `/unread-count`) must be declared **before**
  `/:id`, or Express parses the literal as an ObjectId.
- `DAYS` in `config/constants.js` is Sunday-first (South Asian academic week, Saturday holiday) and
  its **array order drives the routine grid rows — do not sort it**.
- Validation is three layers, all intentional: express-validator chains in `validators/`, then
  Mongoose schema rules + unique indexes, then business rules in `services/`.
- Source comments reference a `docs/architecture.md` that **does not exist** in the repo; the design
  rationale actually lives in the file headers, which are unusually detailed — read the header
  before changing a module.
- Root `Readme.md` is **stale**: it documents the MySQL/Sequelize stack that commit `e74544d`
  removed. Prefer `backend/.env.example` and this file.
