# Development Roadmap
## AI-Powered DevOps Monitoring Platform — MVP, Structured for Antigravity Agents

**Document Version:** 1.0
**Status:** MVP Baseline
**Related Documents:** All prior docs (01–09) — this roadmap sequences their implementation

---

## 1. Purpose & How This Roadmap Is Structured

This roadmap breaks the MVP into **phases**, and each phase into **missions** — small, independently deliverable units of work sized for delegation to an autonomous coding agent in Antigravity, rather than one large "build the platform" prompt.

**Why this sizing matters for agent-assisted development:** Antigravity agents work best when given a scoped, verifiable goal — they plan, execute, and then produce an **Artifact** (a diff, a test run, a screenshot, a terminal log) that you review before moving on. A mission here is deliberately sized to:

- Touch a small, coherent set of files (ideally one module/layer at a time)
- Have an explicit, checkable **Definition of Done** — something the agent can verify itself (a passing test, a successful curl call, a rendered screenshot) before reporting back
- Depend only on missions that came before it, never on work that hasn't happened yet
- Be re-runnable/resumable — if a mission's output isn't right, you can re-delegate just that mission with feedback rather than unwinding a giant task

**How to use this document with Antigravity:** treat each mission below as a single agent task/mission. Paste the mission's Goal + Inputs + Definition of Done as the task description, point the agent at the relevant document(s) in `/docs`, and review the resulting Artifact before starting the next mission. Missions within a phase can sometimes run in parallel (noted where applicable); phases themselves are meant to be mostly sequential, since later phases depend on earlier ones being real and working.

---

## 2. Phase Overview

| Phase | Focus | Depends On |
|---|---|---|
| 0 | Project scaffolding & local environment | — |
| 1 | Auth & multi-tenancy backend | 0 |
| 2 | Auth & org UI | 1 |
| 3 | Server monitoring backend (Prometheus integration) | 1 |
| 4 | Server monitoring UI | 2, 3 |
| 5 | API monitoring backend | 1 |
| 6 | API monitoring UI | 2, 5 |
| 7 | Alerting backend (rules, alerts, notifications) | 3, 5 |
| 8 | Alerting UI | 4, 6, 7 |
| 9 | AI Service — anomaly detection | 3, 5 |
| 10 | AI Insights UI | 8, 9 |
| 11 | Reporting | 7, 9 |
| 12 | Real-time layer (Socket.IO end-to-end) | 4, 6, 8, 10 |
| 13 | Security hardening & cross-tenant test suite | All prior |
| 14 | Deployment polish & demo readiness | All prior |

Each phase below lists its missions with Goal, Inputs, and Definition of Done.

---

## Phase 0 — Project Scaffolding & Local Environment

**Goal of phase:** a running, empty skeleton — every service starts, talks to its neighbors, and does nothing useful yet. This is the foundation every later phase builds on, and deliberately contains zero business logic.

### Mission 0.1 — Repository & folder structure
**Goal:** Create the monorepo structure: `/frontend`, `/backend`, `/ai-service`, `/docs` (already populated), `/infra` (docker-compose, later k8s).
**Inputs:** `04-system-architecture.md` §4, §6
**Definition of Done:** Folder structure exists, each service folder has a minimal `README.md` describing its purpose, root `.gitignore` covers `node_modules`, `.env`, `__pycache__`, `models/`.

### Mission 0.2 — Docker Compose skeleton
**Goal:** Write `docker-compose.yml` with all services from Architecture §6 (frontend, core-api, ai-service, mongodb, prometheus, node-exporter, blackbox-exporter, grafana) as empty/hello-world containers that start and network correctly.
**Inputs:** `04-system-architecture.md` §6
**Definition of Done:** `docker compose up` starts all containers without crash-looping; `core-api` can `ping`/resolve `mongodb` and `ai-service` by service name over the Docker network.

### Mission 0.3 — Core API skeleton (Express)
**Goal:** Minimal Express app with a `/health` endpoint, environment config loading, and MongoDB connection.
**Inputs:** `04-system-architecture.md` §4.2, `08-security-design.md` §9.4 (env-based secrets)
**Definition of Done:** `GET /health` returns `200 { status: "ok", mongoConnected: true }` when run inside Docker Compose.

### Mission 0.4 — AI Service skeleton (FastAPI)
**Goal:** Minimal FastAPI app with a `/internal/ai/health` endpoint per `07-ai-module-design.md` §8.2.
**Inputs:** `07-ai-module-design.md` §9, §10
**Definition of Done:** `GET /internal/ai/health` returns `200` inside Docker Compose; container has scikit-learn/pandas/numpy installed and importable (verify with a trivial `import` smoke test).

### Mission 0.5 — Frontend skeleton (React + Tailwind)
**Goal:** Vite/CRA React app with Tailwind configured, design tokens from `09-ui-ux-design.md` §2.1/§2.2 set up as CSS variables, a placeholder route rendering "Platform is running."
**Inputs:** `09-ui-ux-design.md` §2
**Definition of Done:** `npm run dev` (or containerized equivalent) serves a page using the dark palette and Inter font; color tokens are real CSS variables, not hardcoded hex values scattered in components.

### Mission 0.6 — Prometheus base config
**Goal:** `prometheus.yml` with a static scrape job for `node-exporter` and a blackbox job placeholder, per Architecture §6.
**Inputs:** `04-system-architecture.md` §6, §4.5
**Definition of Done:** Prometheus UI (`:9090`) shows the `node-exporter` target as `UP`.

**Phase 0 exit check:** all 6 services running together via one `docker compose up`, each individually health-checked. This combined check is itself a good final Antigravity mission ("verify full stack boots clean") producing a terminal-log Artifact.

---

## Phase 1 — Auth & Multi-Tenancy Backend

### Mission 1.1 — Organization & User Mongoose models
**Goal:** Implement `organizations` and `users` schemas with `$jsonSchema`-equivalent Mongoose validation.
**Inputs:** `05-data-model-erd.md` §4.1, §4.2, §5
**Definition of Done:** Models enforce required fields and enums as documented; a unit test attempting to save a `users` doc without `orgId` (for a non-super_admin role) fails validation.

### Mission 1.2 — bcrypt password hashing utility
**Goal:** Implement hash/compare utility, cost factor 12.
**Inputs:** `08-security-design.md` §2.1
**Definition of Done:** Unit test: hashing the same password twice produces different hashes; `compare()` correctly validates both.

### Mission 1.3 — JWT access token + refresh token issuance
**Goal:** Implement token generation, refresh token hashing/storage (`refreshTokens` collection), rotation-on-use logic.
**Inputs:** `08-security-design.md` §2.2, §2.3; `05-data-model-erd.md` §4.3
**Definition of Done:** Unit tests: access token contains correct claims and 15-min expiry; using a refresh token issues a new one and revokes the old; reusing a revoked refresh token is rejected.

### Mission 1.4 — `POST /auth/register` and `POST /auth/login`
**Goal:** Implement per API Spec §2.1–2.2 exactly (including generic error message on login failure).
**Inputs:** `06-api-specification.md` §2.1, §2.2
**Definition of Done:** Integration test hits both endpoints, asserts response shape matches spec exactly, asserts duplicate-email registration returns `409`, asserts wrong password and unknown email return identical `401` bodies.

### Mission 1.5 — `POST /auth/refresh` and `POST /auth/logout`
**Goal:** Implement per API Spec §2.3–2.4.
**Inputs:** `06-api-specification.md` §2.3, §2.4; `08-security-design.md` §2.5
**Definition of Done:** Integration test: refresh rotates token correctly; logout revokes the specific token; reuse-detection triggers full session revocation (test asserts a second use of an old token, after a legitimate refresh, invalidates *all* that user's sessions).

### Mission 1.6 — Auth middleware (JWT verification)
**Goal:** Middleware that extracts `{ userId, orgId, role }` from a verified access token and attaches to `req.context`.
**Inputs:** `08-security-design.md` §2.2, §3.1
**Definition of Done:** Requests with missing/expired/tampered tokens return `401`; a protected test route confirms `req.context` is populated correctly for a valid token.

### Mission 1.7 — RBAC middleware & shared permission config
**Goal:** Implement the permission table as a shared config file, and middleware that checks `(role, resource, action)` against it.
**Inputs:** `03-user-roles-permission-matrix.md` (all sections); `08-security-design.md` §3
**Definition of Done:** Config file has an entry for every action in the Permission Matrix; a test suite iterates the matrix and asserts the middleware allows/denies correctly for each `(role, action)` pair — this test suite is worth building thoroughly now since Phase 13 extends it.

### Mission 1.8 — Scoped-query data access wrapper
**Goal:** Implement the `orgId`-injecting query helper described in Data Model §6.3.
**Inputs:** `05-data-model-erd.md` §6.2, §6.3
**Definition of Done:** Unit test: wrapper always injects `orgId` from context even if a caller's filter object tries to override it; a lint rule or code-review checklist item is documented for flagging direct unwrapped model calls.

### Mission 1.9 — Org & User management endpoints
**Goal:** Implement `GET/PUT /organizations/me`, `GET /users`, `POST /users/invite`, `PATCH /users/:id/role`, `DELETE /users/:id`, `GET/PATCH /users/me`.
**Inputs:** `06-api-specification.md` §3.1–3.2, §4
**Definition of Done:** Integration tests per endpoint matching request/response shapes and role restrictions in the spec.

### Mission 1.10 — Super Admin platform endpoint
**Goal:** Implement `GET /platform/organizations` returning aggregate-only data.
**Inputs:** `06-api-specification.md` §3.3; `03-user-roles-permission-matrix.md` §4
**Definition of Done:** Response contains no org-internal document fields (servers/alerts/anomalies) — test explicitly asserts the response shape is limited to the documented aggregate fields.

**Phase 1 exit check:** a scripted flow — register org → login → invite user → login as invited user → attempt (and fail) a super_admin-only action — runnable as one Antigravity verification mission.

---

## Phase 2 — Auth & Org UI

### Mission 2.1 — Login page
**Goal:** Build per `09-ui-ux-design.md` §5.1, wired to `POST /auth/login`, access token held in memory only (never `localStorage`).
**Inputs:** `09-ui-ux-design.md` §5.1; `08-security-design.md` §2.2
**Definition of Done:** Manual/agent-driven browser check: successful login navigates to Dashboard placeholder; invalid credentials show the generic error message; DevTools confirms no token in `localStorage`.

### Mission 2.2 — Register Organization page
**Goal:** Build per §5.1, wired to `POST /auth/register`.
**Inputs:** `09-ui-ux-design.md` §5.1
**Definition of Done:** New org registration lands the user authenticated on an empty Dashboard shell.

### Mission 2.3 — Auth context, token refresh, and protected routing
**Goal:** React context/provider managing access token in memory, silent refresh flow, route guards redirecting unauthenticated users to Login.
**Inputs:** `08-security-design.md` §2.2–2.3; `09-ui-ux-design.md` §3
**Definition of Done:** Access token silently refreshes before its 15-min expiry without disrupting the user; direct navigation to a protected URL while logged out redirects to Login.

### Mission 2.4 — App shell: sidebar + top bar
**Goal:** Build persistent sidebar/top bar per §3.1–3.2, with role-based item visibility (hide, not disable — NFR-9).
**Inputs:** `09-ui-ux-design.md` §3; `03-user-roles-permission-matrix.md`
**Definition of Done:** Logging in as each of the 5 roles shows the correct sidebar item set (verify against the Permission Matrix's summary table §6) — worth a small per-role screenshot Artifact.

### Mission 2.5 — User Management page
**Goal:** Build per §5.11, wired to Phase 1's user endpoints.
**Inputs:** `09-ui-ux-design.md` §5.11
**Definition of Done:** org_admin can invite a user and change a role live against the backend; non-org_admin roles never see this nav item (per 2.4) and get `403` if the route is hit directly.

### Mission 2.6 — Org Settings page (profile + notification defaults only for now)
**Goal:** Build per §5.12 (AI sensitivity section deferred to Phase 10).
**Inputs:** `09-ui-ux-design.md` §5.12
**Definition of Done:** org_admin can update org name and notification email list, persisted and reflected on reload.

### Mission 2.7 — My Profile page
**Goal:** Build per §5.13.
**Inputs:** `09-ui-ux-design.md` §5.13
**Definition of Done:** Any role can update name/password; password change requires correct current password (matches API Spec §4.6 error case).

---

## Phase 3 — Server Monitoring Backend

### Mission 3.1 — Server Mongoose model + CRUD endpoints
**Goal:** Implement `servers` collection and `POST/GET/PUT/DELETE /servers`, `GET /servers/:id`.
**Inputs:** `05-data-model-erd.md` §4.4; `06-api-specification.md` §5.1–5.3, §5.5–5.6
**Definition of Done:** Integration tests cover validation rules (unique `(orgId, hostAddress)`), and RBAC (only org_admin/devops_engineer can create/edit/delete, per Mission 1.7's shared config).

### Mission 3.2 — Prometheus service-discovery integration
**Goal:** On server create/delete, write/remove the target from Prometheus's file-based service discovery (Architecture §4.5).
**Inputs:** `04-system-architecture.md` §4.5
**Definition of Done:** Registering a server via the API results in it appearing as a scrape target in Prometheus within one scrape interval (verifiable via Prometheus's `/targets` endpoint).

### Mission 3.3 — Server status computation
**Goal:** Background job/logic computing `healthy/degraded/down/unknown` status from Prometheus reachability + basic thresholds.
**Inputs:** `02-srs-mvp.md` FR-2.4; `04-system-architecture.md` §4.2
**Definition of Done:** Stopping a monitored node-exporter target results in the server's status flipping to `down` within a bounded time window (test with a demo target you can start/stop).

### Mission 3.4 — `GET /servers/:id/metrics` (Prometheus query proxy)
**Goal:** Implement range-query proxying with the documented query params.
**Inputs:** `06-api-specification.md` §5.4
**Definition of Done:** Integration test requests a known metric/time-range and asserts the returned series shape matches spec; a cross-org test confirms requesting another org's `servers/:id/metrics` returns `404`.

---

## Phase 4 — Server Monitoring UI

### Mission 4.1 — Servers List page
**Goal:** Build per `09-ui-ux-design.md` §5.3 (table, filters, Add Server modal).
**Inputs:** `09-ui-ux-design.md` §5.3
**Definition of Done:** Live data from Phase 3 endpoints renders correctly; status badges use the correct color tokens (§2.1); Add Server modal round-trips to the backend.

### Mission 4.2 — Server Detail page with metric graphs
**Goal:** Build per §5.4 — header, time-series charts (charting library per Architecture/frontend constraints), Alert Rules panel placeholder (real logic in Phase 7).
**Inputs:** `09-ui-ux-design.md` §5.4
**Definition of Done:** Selecting different time ranges (1h/6h/24h/7d) correctly re-queries and re-renders the CPU/memory/disk graphs against real Prometheus data.

---

## Phase 5 — API Monitoring Backend

*(Structurally mirrors Phase 3 — a good candidate for delegating as a near-parallel Antigravity mission set once Phase 3 patterns are established.)*

### Mission 5.1 — API Monitor Mongoose model + CRUD endpoints
**Inputs:** `05-data-model-erd.md` §4.5; `06-api-specification.md` §6.1–6.3, §6.5–6.6
**Definition of Done:** Same pattern as Mission 3.1, adapted for `apiMonitors` fields/validation (URL format, unique `(orgId, url)`).

### Mission 5.2 — Blackbox Exporter integration
**Goal:** Register/deregister probe targets in Prometheus's blackbox exporter config on API monitor create/delete.
**Inputs:** `04-system-architecture.md` §4.5
**Definition of Done:** Registering an API monitor results in a probe result appearing in Prometheus within one check interval.

### Mission 5.3 — API status, uptime %, error rate computation
**Inputs:** `02-srs-mvp.md` FR-3.3–3.4
**Definition of Done:** `GET /api-monitors/:id` returns correct `uptimePercent24h`/`avgResponseTimeMs`/`errorRate24h` computed from real probe data.

### Mission 5.4 — `GET /api-monitors/:id/metrics`
**Inputs:** `06-api-specification.md` §6.4
**Definition of Done:** Same verification pattern as Mission 3.4.

---

## Phase 6 — API Monitoring UI

### Mission 6.1 — API Monitors List page
**Inputs:** `09-ui-ux-design.md` §5.5
**Definition of Done:** Mirrors Mission 4.1's verification, for API monitors.

### Mission 6.2 — API Monitor Detail page
**Inputs:** `09-ui-ux-design.md` §5.5
**Definition of Done:** Mirrors Mission 4.2's verification, with response-time/error-rate graphs instead of CPU/memory/disk.

---

## Phase 7 — Alerting Backend

### Mission 7.1 — Alert Rules model + CRUD
**Inputs:** `05-data-model-erd.md` §4.6; `06-api-specification.md` §7
**Definition of Done:** Validation rejects a `metric` invalid for the given `resourceType` (e.g., `error_rate` on a `server`) with `422`, per spec.

### Mission 7.2 — Threshold evaluation job
**Goal:** Background job periodically evaluating active `alertRules` against current Prometheus values, creating `alerts` documents on breach.
**Inputs:** `02-srs-mvp.md` FR-6.1; `05-data-model-erd.md` §4.7
**Definition of Done:** Manually pushing a metric value past a configured threshold (e.g., via a test load script) results in a new `alerts` document with `source: "threshold"` within one evaluation cycle.

### Mission 7.3 — Alerts CRUD/lifecycle endpoints
**Goal:** `GET /alerts`, `GET /alerts/:id`, `PATCH /alerts/:id/acknowledge`, `PATCH /alerts/:id/resolve`, `DELETE /alerts/:id`.
**Inputs:** `06-api-specification.md` §8
**Definition of Done:** Lifecycle test: create → acknowledge → resolve, asserting status transitions and `acknowledgedBy`/`resolvedBy` population; attempting to acknowledge an already-resolved alert returns `409`.

### Mission 7.4 — Email notification dispatch
**Goal:** On alert creation, send email to org's configured recipients.
**Inputs:** `02-srs-mvp.md` FR-6.2; `04-system-architecture.md` §7 (external interfaces)
**Definition of Done:** Test alert creation triggers an email via a test SMTP catcher (e.g., Mailhog in Docker Compose for local verification) — Artifact: captured email content matching the alert.

### Mission 7.5 — In-app notification creation
**Goal:** `notifications` documents created alongside alerts; `GET /notifications`, `PATCH /notifications/:id/read`, `PATCH /notifications/read-all`.
**Inputs:** `06-api-specification.md` §10; `05-data-model-erd.md` §4.9
**Definition of Done:** New alert results in a notification per relevant user; own-notification-only access is tested (user A cannot mark user B's notification read).

---

## Phase 8 — Alerting UI

### Mission 8.1 — Alerts page
**Inputs:** `09-ui-ux-design.md` §5.8
**Definition of Done:** Table with severity-colored left border, filters work against live data, acknowledge/resolve actions round-trip.

### Mission 8.2 — Alert Detail page
**Inputs:** `09-ui-ux-design.md` §5.11 (Alert Detail entry, §4 table row 11)
**Definition of Done:** Shows full alert context; link to linked anomaly renders only when `source: "anomaly"` (placeholder acceptable until Phase 10 wires the real anomaly link).

### Mission 8.3 — Notification bell dropdown
**Inputs:** `09-ui-ux-design.md` §5.9
**Definition of Done:** Unread badge count matches backend state; opening dropdown and reading marks items read live.

### Mission 8.4 — Wire Alert Rules panel into Server/API Monitor Detail pages
**Goal:** Connect the placeholder panels from Missions 4.2/6.2 to real Phase 7 endpoints.
**Inputs:** `09-ui-ux-design.md` §5.4
**Definition of Done:** Creating a threshold rule from the Server Detail page and then breaching it (via test load) produces a visible alert without leaving the page (may rely on manual refresh until Phase 12 adds real-time push).

---

## Phase 9 — AI Service: Anomaly Detection

### Mission 9.1 — Prometheus client & preprocessing pipeline
**Goal:** Implement `prometheus_client.py` and `preprocessing.py` per AI Module Design §5.
**Inputs:** `07-ai-module-design.md` §5
**Definition of Done:** Unit test with a mocked Prometheus response verifies cleaning (gap-fill, outlier rejection) and feature extraction (`mean`, `std`, `min`, `max`, `rate_of_change`, `rolling_mean_delta`) produce expected values on known synthetic input.

### Mission 9.2 — Model registry & training logic
**Goal:** Implement `model_registry.py` — train, save (`joblib`), load per `(orgId, resourceId, metric)`.
**Inputs:** `07-ai-module-design.md` §6.3–6.4
**Definition of Done:** Training on a synthetic 24h dataset produces a persisted `.joblib` file; loading it back and scoring a known-normal window returns a low anomaly score, and a synthetically-injected spike returns a high one.

### Mission 9.3 — Scoring engine & score normalization
**Inputs:** `07-ai-module-design.md` §6.1–6.2, §7.1, §7.3
**Definition of Done:** Unit tests confirm `0–1` normalized output range and that scores are comparable in direction (higher = more anomalous) across two differently-scaled synthetic metrics.

### Mission 9.4 — Scheduler & cold-start handling
**Goal:** Implement the interval loop (`scheduler.py`) iterating all active resources/metrics per org, skipping resources without sufficient history (cold start).
**Inputs:** `07-ai-module-design.md` §6.3 (cold start), §8.3
**Definition of Done:** Running the scheduler against a mixed set (one resource with 24h+ history, one brand-new) scores only the former and logs a clear skip reason for the latter.

### Mission 9.5 — Anomaly persistence
**Goal:** Write `anomalies` documents to MongoDB per Data Model §4.8.
**Inputs:** `05-data-model-erd.md` §4.8
**Definition of Done:** A scoring run above threshold produces a correctly-shaped document, including `modelVersion` and full `metricSnapshot`.

### Mission 9.6 — AI Service ↔ Core API internal contract
**Goal:** Implement `POST /internal/ai/insight-notify` (AI Service → Core API) and Core API's alert-creation-from-anomaly logic (including dedup against recent open alerts).
**Inputs:** `07-ai-module-design.md` §8.1
**Definition of Done:** End-to-end test: inject a synthetic anomaly-worthy window → AI Service detects and notifies → Core API creates exactly one `alerts` document tagged `source: "anomaly"` → repeating within the same window does not create a duplicate alert.

### Mission 9.7 — `GET /internal/ai/health` wired into Core API graceful degradation
**Inputs:** `07-ai-module-design.md` §10; `04-system-architecture.md` §8.3
**Definition of Done:** Stopping the AI Service container results in Core API responses flagging AI Insights as "temporarily unavailable" rather than erroring or timing out user-facing requests.

---

## Phase 10 — AI Insights UI

### Mission 10.1 — Anomalies endpoints in Core API
**Goal:** `GET /anomalies`, `GET /anomalies/:id`, `PATCH /anomalies/:id/review`.
**Inputs:** `06-api-specification.md` §9.1–9.3
**Definition of Done:** Standard integration test pattern (shape + RBAC + cross-org 404), matching Phase 3/5 conventions.

### Mission 10.2 — AI Insights list page
**Inputs:** `09-ui-ux-design.md` §5.6
**Definition of Done:** Anomaly score renders as a visual gauge, not a bare decimal; cold-start resources appear in the separate "Collecting Baseline" section (requires the backend to expose which resources lack a trained model yet — small addition to Mission 10.1 if not already present).

### Mission 10.3 — Anomaly Detail page
**Inputs:** `09-ui-ux-design.md` §5.7
**Definition of Done:** Metric snapshot renders as a chart with the anomalous region visually highlighted; review/dismiss action round-trips.

### Mission 10.4 — AI Settings section in Org Settings
**Goal:** Wire the deferred AI sensitivity slider from Mission 2.6 to `PUT /organizations/me/ai-settings`.
**Inputs:** `09-ui-ux-design.md` §5.12; `06-api-specification.md` §9.4
**Definition of Done:** Adjusting the slider changes the org's `anomalySensitivity`, verified against a subsequent scoring run's alert-generation behavior.

---

## Phase 11 — Reporting

### Mission 11.1 — CSV export endpoint
**Inputs:** `06-api-specification.md` §11.1; `05-data-model-erd.md` §4.10
**Definition of Done:** Requesting each `type` (metrics/alerts/anomalies) with a valid range returns a correctly-formatted, downloadable CSV matching on-screen data for the same range; range >90 days returns `400`.

### Mission 11.2 — Reports page
**Inputs:** `09-ui-ux-design.md` §5.10
**Definition of Done:** Form triggers a real browser download; date range picker enforces the 90-day cap client-side too (defense in depth, not a substitute for 11.1's server check).

---

## Phase 12 — Real-Time Layer (Socket.IO End-to-End)

This phase deliberately comes after the REST-driven UI works, so real-time is an enhancement layer added to already-correct pages, not a dependency the earlier phases' verification relied on.

### Mission 12.1 — Socket.IO server: connection auth & org rooms
**Inputs:** `04-system-architecture.md` §4.7; `08-security-design.md` §4.3
**Definition of Done:** Connecting with a valid JWT joins `org:{orgId}`; connecting with an invalid/missing token is rejected; a test asserts a client cannot join an arbitrary org room by client-supplied ID.

### Mission 12.2 — Emit `metric:update`, `alert:created`, `alert:updated`, `anomaly:detected`, `notification:new`
**Inputs:** `06-api-specification.md` §12
**Definition of Done:** Each backend action from prior phases (metric ingestion, alert lifecycle, anomaly detection, notification creation) now also emits the corresponding event; a two-client test confirms org A's client never receives org B's events.

### Mission 12.3 — Frontend Socket.IO integration into Dashboard, Alerts, AI Insights, Notification bell
**Inputs:** `09-ui-ux-design.md` §5.2 (real-time behavior), §5.9
**Definition of Done:** Dashboard stat cards and status grid visibly update live (with the highlight animation per §5.2) without a manual refresh, verified via a scripted "trigger backend event → observe UI change" browser check.

---

## Phase 13 — Security Hardening & Cross-Tenant Test Suite

This phase is a dedicated hardening pass — not new features, but the automated backstop referenced throughout the Security Design Document.

### Mission 13.1 — Full cross-tenant test suite
**Goal:** For every resource-returning endpoint across all modules, assert org A cannot read/update/delete org B's resource (expect `404`).
**Inputs:** `08-security-design.md` §4.2, §7, §10.3
**Definition of Done:** Test suite enumerates every endpoint from the API Specification and includes a cross-org case for each; this is treated as the single most important test suite in the project (Security Design §7) — Artifact should be a clear pass/fail report per endpoint.

### Mission 13.2 — Full RBAC test suite completion
**Goal:** Extend Mission 1.7's test suite to cover every endpoint added in Phases 3–11, not just Phase 1's.
**Inputs:** `03-user-roles-permission-matrix.md`; `06-api-specification.md` (all §)
**Definition of Done:** Every endpoint × every role combination has an explicit pass/fail assertion.

### Mission 13.3 — Security headers, CORS, rate limiting
**Inputs:** `08-security-design.md` §5.4–5.6
**Definition of Done:** Automated check confirms `helmet`-equivalent headers present; CORS rejects an unlisted origin; hitting `/auth/login` 6 times in a minute returns `429` on the 6th.

### Mission 13.4 — Input validation fuzz pass
**Inputs:** `08-security-design.md` §5.2, §10.4
**Definition of Done:** Sending malformed/oversized/wrong-type payloads to every write endpoint returns `400`, never a `500` or unhandled exception/stack trace leak.

---

## Phase 14 — Deployment Polish & Demo Readiness

### Mission 14.1 — Seed/demo data script
**Goal:** Script that creates a demo org, a handful of servers/API monitors with realistic historical metrics (needed to clear the AI cold-start window per AI Module Design §6.3 without waiting 24 real hours).
**Inputs:** `07-ai-module-design.md` §6.3; `01-vision-and-scope.md` §8 (success criteria)
**Definition of Done:** Running the script against a fresh environment produces a demo-ready state where AI Insights already has scored resources, not an empty cold-start list.

### Mission 14.2 — README & setup instructions
**Goal:** Root `README.md` covering local setup (`docker compose up`), demo script usage, and a summary linking to the `/docs` folder.
**Definition of Done:** A person following the README from a clean checkout reaches a working demo without needing out-of-band help.

### Mission 14.3 — Kubernetes manifests (documented artifact, per Vision & Scope §6.1 constraint)
**Goal:** Helm chart or raw manifests mirroring the Docker Compose service topology, as a demonstrated skill artifact — not the primary run path.
**Inputs:** `04-system-architecture.md` §6, §9
**Definition of Done:** `kubectl apply` (or `helm install`) against a local cluster (minikube/kind) brings up the same service topology; this is verified once as a capability demonstration, not maintained as the default dev loop.

### Mission 14.4 — Final success-criteria walkthrough
**Goal:** Manually (or agent-assisted) walk through every item in Vision & Scope §8 end-to-end against the finished system.
**Inputs:** `01-vision-and-scope.md` §8
**Definition of Done:** Each success criterion is checked off with an observed result, not assumed — this is the project's final acceptance pass.

---

## 3. Notes on Parallelizing with Multiple Antigravity Agents

Some mission groups are structurally independent enough to run as parallel agent missions once their shared dependency is done:

- **Phase 3 and Phase 5** (server vs. API monitoring backend) can run in parallel after Phase 1 — they touch different collections/routes with no overlap.
- **Phase 4 and Phase 6** (their respective UIs) likewise, after Phase 2's app shell exists.
- **Mission 9.1–9.3** (preprocessing, model registry, scoring engine) are independently unit-testable and can be built somewhat in parallel by separate missions before being wired together in 9.4.

Everything touching the **shared permission config (1.7)**, the **scoped-query wrapper (1.8)**, or the **Socket.IO org-room mechanism (12.1)** should be treated as a single-owner, sequential mission — these are exactly the shared-foundation pieces where parallel, uncoordinated agent edits are most likely to produce the tenant-isolation bugs Security Design §7 warns about.

---

## 4. Traceability

Every mission above cites the specific document section it implements. Before marking a phase complete, cross-check its missions' Definitions of Done against:
- The relevant FR/NFR IDs in `02-srs-mvp.md`
- The relevant role restrictions in `03-user-roles-permission-matrix.md`
- The relevant endpoint contract in `06-api-specification.md`

This roadmap is the last document in the pre-implementation set — from here, implementation begins mission by mission.
