# Master Project Specification
## AI-Powered DevOps Monitoring Platform — MVP

**Document Version:** 1.0
**Status:** MVP Baseline — Implementation-Ready
**Purpose:** Single consolidated reference for Antigravity agents. This document summarizes and cross-references all prior design documents (01–10) into one implementation guide, organized as small, dependency-ordered phases with objectives, tasks, and acceptance criteria. **No code is included** — this is a specification, not an implementation.

**Source documents this consolidates:**
| # | Document |
|---|---|
| 01 | Vision & Scope |
| 02 | Software Requirements Specification (SRS) |
| 03 | User Roles & Permission Matrix |
| 04 | System Architecture |
| 05 | Data Model & ERD |
| 06 | REST API Specification |
| 07 | AI Module Design |
| 08 | Security Design |
| 09 | UI/UX Design |
| 10 | Development Roadmap |

Where this document summarizes something, the full authoritative detail remains in the source document — this master spec is the entry point and index, not a replacement.

---

## PART A — PROJECT SUMMARY

### A.1 What We're Building

A multi-tenant SaaS DevOps monitoring platform. Organizations register independently, invite users under 5 roles, register Linux servers and REST APIs for monitoring, receive real-time dashboards and threshold/AI-driven alerts, and export reports — all with strict per-organization data isolation. *(Full detail: Doc 01)*

### A.2 MVP Scope Boundary

**In scope:** multi-tenant auth & org management, Linux server monitoring, REST API monitoring, AI anomaly detection (near-real-time, batch), real-time dashboards, threshold + AI alerting with email/in-app notifications, CSV reporting.

**Explicitly deferred to Phase 2+:** Docker container monitoring, Kubernetes cluster monitoring, ELK log management, failure prediction, root cause suggestions, AI-ranked alert prioritization, PDF/scheduled reports. *(Full detail: Doc 01 §6)*

### A.3 Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React.js + Tailwind CSS |
| Backend API | Node.js + Express.js |
| AI Service | Python + Scikit-learn, Pandas, NumPy |
| App Database | MongoDB |
| Metrics Database | Prometheus (+ node-exporter, blackbox-exporter) |
| Real-time | Socket.IO |
| Visualization (supplementary) | Grafana |
| Containerization | Docker / Docker Compose (MVP runtime) |
| Future deployment | Kubernetes (documented artifact, Phase 2+) |

*(Full detail: Doc 04 §7)*

### A.4 Success Criteria (What "Done" Means for the MVP)

- An org can register, invite users with distinct roles, and see enforced permission differences.
- A registered Linux server and REST API report live metrics within minutes of setup.
- Injected abnormal behavior is detected as an anomaly without a manually-set threshold.
- An alert (threshold or anomaly) triggers both email and in-app notification.
- A CSV export matches on-screen data for the same range.
- No user can access another organization's data under any tested scenario.

*(Full detail: Doc 01 §8 — this is the final acceptance checklist, revisited in Phase 14 below)*

---

## PART B — REFERENCE SUMMARIES

### B.1 Roles & Permissions (Summary)

| Role | Scope | Can Configure Resources | Can Manage Users | Can Manage Org Settings | Can Ack/Resolve Alerts | Read Access |
|---|---|:---:|:---:|:---:|:---:|:---:|
| Super Admin | Platform-wide, org-external only | No | No (org-level) | No (org-level) | No | Aggregate only, no org-internal |
| Org Admin | Own org, full control | Yes | Yes | Yes | Yes | Yes |
| DevOps Engineer | Own org, operational | Yes | No | No | Yes | Yes |
| Team Lead | Own org, oversight | No | No | No | Yes | Yes |
| Viewer | Own org, read-only | No | No | No | No | Yes |

**Critical invariant:** Super Admin is deliberately the *narrowest*, not broadest, data-access role — it manages tenant existence/health, never tenant-internal data. *(Full detail: Doc 03, all sections)*

### B.2 Architecture (Summary)

Four independently deployable units — React SPA, Node.js/Express Core API, Python AI Service, Prometheus/Grafana metrics infrastructure — backed by MongoDB (app data) and Prometheus's own TSDB (metrics). The **React SPA never talks directly to MongoDB, Prometheus, or the AI Service** — the Core API is the single entry point enforcing auth, RBAC, and tenant scoping. The AI Service is fully decoupled, communicating with the Core API only over internal REST.

```
React SPA ⇄ Core API (Express + Socket.IO) ⇄ MongoDB
                    ⇅                  ⇅
              AI Service (Python)  Prometheus ⇄ node-exporter / blackbox-exporter
                                        ⇅
                                    Grafana (supplementary)
```

*(Full detail: Doc 04, all sections)*

### B.3 Data Model (Summary)

| Collection | Purpose |
|---|---|
| `organizations` | Tenant root — no `orgId` field (its `_id` *is* the orgId) |
| `users` | Accounts, roles, org membership (`orgId: null` only for super_admin) |
| `refreshTokens` | Hashed, revocable, TTL-expiring sessions |
| `servers` | Registered Linux servers |
| `apiMonitors` | Registered REST API endpoints |
| `alertRules` | Threshold configuration per resource |
| `alerts` | Alert instances (threshold or AI-triggered) |
| `anomalies` | AI-detected anomaly records |
| `notifications` | In-app notifications per user |
| `reportExports` | Audit log of generated CSV exports |

**The multi-tenancy rule:** every collection except `organizations` carries an `orgId`, and every query is scoped by the `orgId` extracted server-side from the verified JWT — never client-supplied. Enforced through a mandatory query wrapper, not ad hoc per-route checks. *(Full detail: Doc 05, all sections)*

### B.4 API Surface (Summary)

| Module | Key Endpoints |
|---|---|
| Auth | `POST /auth/register`, `/login`, `/refresh`, `/logout` |
| Organizations | `GET/PUT /organizations/me`, `GET /platform/organizations` (super_admin) |
| Users | `GET /users`, `POST /users/invite`, `PATCH /users/:id/role`, `DELETE /users/:id`, `GET/PATCH /users/me` |
| Servers | `POST/GET/PUT/DELETE /servers`, `GET /servers/:id`, `GET /servers/:id/metrics` |
| API Monitors | `POST/GET/PUT/DELETE /api-monitors`, `GET /api-monitors/:id`, `GET /api-monitors/:id/metrics` |
| Alert Rules | `POST/GET/PUT/DELETE /alert-rules` |
| Alerts | `GET /alerts`, `GET /alerts/:id`, `PATCH /alerts/:id/acknowledge`, `/resolve`, `DELETE /alerts/:id` |
| AI Insights | `GET /anomalies`, `GET /anomalies/:id`, `PATCH /anomalies/:id/review`, `PUT /organizations/me/ai-settings` |
| Notifications | `GET /notifications`, `PATCH /notifications/:id/read`, `/read-all` |
| Reports | `GET /reports/export` |
| Real-time (Socket.IO) | `metric:update`, `alert:created`, `alert:updated`, `anomaly:detected`, `notification:new` |

**Two conventions apply everywhere:** cross-tenant resource lookups return `404` (never `403`, to avoid confirming existence); every endpoint's allowed roles are drawn directly from B.1's matrix, not independently maintained. *(Full detail: Doc 06, all sections)*

### B.5 AI Module (Summary)

- **Model:** Isolation Forest (Scikit-learn), unsupervised — no labeled incident data required.
- **Granularity:** one lightweight model per `(orgId, resourceId, metric)` combination, not a single global model — "normal" is resource-specific.
- **Cadence:** batch scoring every 2–5 minutes over a rolling ~30-minute window; models retrained daily on trailing history.
- **Cold start:** resources need ~24h of history before AI scoring begins; threshold alerting covers new resources in the meantime.
- **Score:** normalized to `0–1`, compared against an org-configurable `anomalySensitivity` setting to decide whether an alert is generated.
- **Communication:** AI Service persists anomalies directly to MongoDB and notifies the Core API via internal REST (`POST /internal/ai/insight-notify`); the Core API owns all alert-creation/dedup/notification logic.

*(Full detail: Doc 07, all sections)*

### B.6 Security (Summary)

- **Passwords:** bcrypt, cost factor 12.
- **Access tokens:** JWT, HS256, 15-minute expiry, held in memory on the client only (never `localStorage`).
- **Refresh tokens:** 7-day expiry, httpOnly/Secure/SameSite=Strict cookie, only a hash stored server-side, **rotated on every use**, with reuse-detection triggering full session revocation.
- **RBAC:** single shared permission config, checked in middleware before any handler runs.
- **Tenant isolation:** defense-in-depth — JWT-derived `orgId` only, mandatory query wrapper, `404`-not-`403` responses, MongoDB schema validation requiring `orgId`, and a dedicated cross-tenant test suite treated as a security control, not a QA nicety.
- **API hardening:** CORS restricted to known origins, security headers (helmet-equivalent), rate limiting (5/min on login), input validation allow-listing fields (mass-assignment prevention).

*(Full detail: Doc 08, all sections)*

### B.7 UI/UX (Summary)

- **Design direction:** dark-first, dense, scannable — an operations tool, not a marketing site. Desktop-first with defined responsive breakpoints down to mobile.
- **16 pages total**, role-gated by visibility (hidden, not just disabled) per B.1's matrix: Login, Register Org, Dashboard, Servers List/Detail, API Monitors List/Detail, AI Insights/Anomaly Detail, Alerts/Alert Detail, Reports, User Management, Org Settings, My Profile, Platform Console.
- **Consistent conventions:** status colors (green/amber/red/gray) used identically across every screen; AI-sourced content always carries a distinct purple accent tag, separate from severity color, so users learn to distinguish "AI flagged this" from "a known threshold fired."
- **Deliberate constraint:** Platform Console (super_admin) offers zero drill-down into any org's internal data — a UI enforcement of the same boundary as B.1/B.6.

*(Full detail: Doc 09, all sections)*

---

## PART C — PHASED IMPLEMENTATION PLAN

Each phase below has: **Objective**, **Tasks** (grouped; see Doc 10 for the full mission-level breakdown with per-mission acceptance criteria), **Acceptance Criteria** (phase-level, checkable), and **Dependencies**. This is the condensed, phase-level view — Doc 10 (`10-development-roadmap.md`) remains the authoritative source for individual Antigravity missions within each phase.

---

### Phase 0 — Project Scaffolding & Local Environment

**Objective:** A running, empty skeleton — every service starts and can reach its neighbors, with zero business logic.

**Tasks:**
- Establish monorepo structure (`/frontend`, `/backend`, `/ai-service`, `/docs`, `/infra`)
- Docker Compose skeleton for all 8 services (frontend, core-api, ai-service, mongodb, prometheus, node-exporter, blackbox-exporter, grafana)
- Minimal health-check endpoints on Core API and AI Service
- Frontend skeleton with design tokens (dark palette, Inter/JetBrains Mono) wired as CSS variables
- Base Prometheus scrape config

**Acceptance Criteria:**
- `docker compose up` brings up all services without crash-looping
- Core API's `/health` reports MongoDB connectivity
- AI Service's `/internal/ai/health` returns 200
- Frontend renders using real design-system tokens, not hardcoded values

**Dependencies:** None — first phase.

---

### Phase 1 — Auth & Multi-Tenancy Backend

**Objective:** The foundational security and tenancy layer every later feature depends on.

**Tasks:**
- `organizations`/`users`/`refreshTokens` schemas with validation (B.3, Doc 05 §4.1–4.3)
- bcrypt hashing utility (cost 12)
- JWT issuance + refresh token rotation-on-use logic
- `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`
- JWT verification middleware
- **RBAC middleware + shared permission config** (single source of truth mirroring B.1)
- **Scoped-query data access wrapper** (auto-injects `orgId` from server-side context)
- Org/User management endpoints (`/organizations/me`, `/users/*`)
- Super Admin platform endpoint (aggregate-only)

**Acceptance Criteria:**
- Full flow works end-to-end: register org → login → invite user → login as invited user
- Refresh token reuse (after rotation) revokes *all* sessions for that user
- RBAC test suite passes for every `(role, action)` pair defined in B.1
- Super Admin platform endpoint never returns org-internal document fields

**Dependencies:** Phase 0.

**⚠ Single-owner mission note:** the RBAC config and scoped-query wrapper built here are shared foundations used by every subsequent phase — treat as sequential, not parallelizable, work (Doc 10 §3).

---

### Phase 2 — Auth & Org UI

**Objective:** A usable, role-aware application shell wrapping Phase 1's backend.

**Tasks:**
- Login and Register Organization pages
- Auth context: in-memory access token, silent refresh, protected route guards
- App shell: sidebar + top bar with role-based item visibility (hidden, not disabled)
- User Management page (org_admin)
- Org Settings page (profile + notification defaults; AI sensitivity deferred to Phase 10)
- My Profile page

**Acceptance Criteria:**
- Access token never appears in `localStorage`/`sessionStorage` (DevTools-verifiable)
- Each of the 5 roles sees the correct sidebar item set on login
- Direct navigation to a protected/unauthorized route redirects or 403s appropriately

**Dependencies:** Phase 1.

---

### Phase 3 — Server Monitoring Backend

**Objective:** Linux servers can be registered and their metrics collected via Prometheus.

**Tasks:**
- `servers` model + CRUD endpoints
- Prometheus service-discovery integration (register/deregister scrape targets on create/delete)
- Server status computation (healthy/degraded/down/unknown)
- `GET /servers/:id/metrics` range-query proxy

**Acceptance Criteria:**
- Registering a server results in it appearing as a live scrape target within one interval
- Stopping a monitored target flips status to `down` within a bounded window
- Cross-org request for another org's server metrics returns `404`

**Dependencies:** Phase 1.

---

### Phase 4 — Server Monitoring UI

**Objective:** Users can see and manage servers visually.

**Tasks:**
- Servers List page (table, filters, Add Server modal)
- Server Detail page (metric graphs with time-range selector, placeholder Alert Rules panel)

**Acceptance Criteria:**
- Status badges match B.7's color conventions
- Time-range selector correctly re-queries and re-renders live Prometheus data

**Dependencies:** Phase 2, Phase 3.

---

### Phase 5 — API Monitoring Backend

**Objective:** REST APIs can be registered and probed via Prometheus's blackbox exporter.

**Tasks:**
- `apiMonitors` model + CRUD endpoints
- Blackbox Exporter probe-target integration
- Uptime %, avg response time, error rate computation
- `GET /api-monitors/:id/metrics`

**Acceptance Criteria:** Mirrors Phase 3's criteria, for API monitors.

**Dependencies:** Phase 1. *(Can run in parallel with Phase 3 — disjoint collections/routes.)*

---

### Phase 6 — API Monitoring UI

**Objective:** Users can see and manage API monitors visually.

**Tasks:** API Monitors List page; API Monitor Detail page (response-time/error-rate graphs).

**Acceptance Criteria:** Mirrors Phase 4's criteria.

**Dependencies:** Phase 2, Phase 5. *(Can run in parallel with Phase 4.)*

---

### Phase 7 — Alerting Backend

**Objective:** Threshold-based alerting, lifecycle management, and dual-channel notification.

**Tasks:**
- `alertRules` model + CRUD (metric validity checked per resource type)
- Threshold evaluation background job
- Alerts CRUD/lifecycle endpoints (acknowledge, resolve)
- Email notification dispatch
- In-app notification creation

**Acceptance Criteria:**
- Breaching a configured threshold produces an alert within one evaluation cycle
- Lifecycle transitions (open → acknowledged → resolved) enforce valid state (no acknowledging a resolved alert)
- Alert creation triggers both an email (verifiable via local SMTP catcher) and an in-app notification
- Users can only mark their *own* notifications read

**Dependencies:** Phase 3, Phase 5 (needs resources to attach rules/alerts to).

---

### Phase 8 — Alerting UI

**Objective:** Users can view, triage, and resolve alerts, and see notifications.

**Tasks:**
- Alerts page (filterable table, severity-colored)
- Alert Detail page
- Notification bell dropdown
- Wire Alert Rules panel (from Phase 4/6 placeholders) into real endpoints

**Acceptance Criteria:**
- Acknowledge/resolve actions round-trip against the backend
- Unread notification badge count matches backend state

**Dependencies:** Phase 4, Phase 6, Phase 7.

---

### Phase 9 — AI Service: Anomaly Detection

**Objective:** The AI Service independently detects anomalies and notifies the Core API.

**Tasks:**
- Prometheus client + preprocessing pipeline (cleaning, feature engineering)
- Model registry (train/save/load Isolation Forest models per resource+metric, `joblib`)
- Scoring engine + score normalization (`0–1`)
- Scheduler with cold-start handling
- Anomaly persistence to MongoDB
- AI Service ↔ Core API internal contract (`insight-notify`, dedup logic)
- Health check wired into Core API's graceful degradation

**Acceptance Criteria:**
- Synthetic normal window scores low; synthetic spike scores high
- A new resource with <24h history is skipped, not scored, with a clear log reason
- End-to-end: injected anomaly → AI Service detects → Core API creates exactly one deduplicated alert
- Stopping the AI Service degrades gracefully (Core API flags AI Insights as unavailable, doesn't error)

**Dependencies:** Phase 3, Phase 5 (needs real metric data to score).

---

### Phase 10 — AI Insights UI

**Objective:** Users can see and act on AI-detected anomalies.

**Tasks:**
- Anomalies endpoints (`GET /anomalies`, detail, review)
- AI Insights list page (score as visual gauge; cold-start resources in separate section)
- Anomaly Detail page (highlighted metric snapshot chart)
- AI Settings section in Org Settings (sensitivity slider)

**Acceptance Criteria:**
- Adjusting sensitivity measurably changes subsequent alert-generation behavior
- Cold-start resources are visually distinguished, not silently absent

**Dependencies:** Phase 8, Phase 9.

---

### Phase 11 — Reporting

**Objective:** Users can export data as CSV.

**Tasks:** CSV export endpoint (metrics/alerts/anomalies, 90-day cap); Reports page.

**Acceptance Criteria:** Exported CSV matches on-screen data for the same range; both server and client enforce the 90-day cap.

**Dependencies:** Phase 7, Phase 9 (needs alerts and anomalies to report on).

---

### Phase 12 — Real-Time Layer (Socket.IO)

**Objective:** Add live-update behavior on top of the already-correct, REST-driven UI.

**Tasks:**
- Socket.IO connection auth + org-room joining (server-side only, never client-specified)
- Emit events for metric updates, alert lifecycle, anomaly detection, notifications
- Frontend integration into Dashboard, Alerts, AI Insights, notification bell

**Acceptance Criteria:**
- Org A's connected client never receives org B's events (explicit two-client test)
- Dashboard visibly updates live without manual refresh

**Dependencies:** Phase 4, 6, 8, 10 (added as an enhancement layer after core pages work).

---

### Phase 13 — Security Hardening & Cross-Tenant Test Suite

**Objective:** A dedicated hardening pass validating every security guarantee made in Doc 08.

**Tasks:**
- Full cross-tenant test suite (every resource endpoint × cross-org access attempt)
- Full RBAC test suite (every endpoint × every role)
- Security headers, CORS, rate-limiting verification
- Input validation fuzz pass

**Acceptance Criteria:**
- 100% of resource-returning endpoints have a passing cross-org `404` test
- 100% of endpoints have RBAC pass/fail coverage per role
- No malformed input produces a `500` or leaks a stack trace

**Dependencies:** All prior functional phases (this validates the whole system).

**Note:** Per B.6/Doc 08 §7, this phase's cross-tenant suite is the single most important test suite in the project — the platform's core risk is an application-layer bug (a missed `orgId` filter), not an external exploit.

---

### Phase 14 — Deployment Polish & Demo Readiness

**Objective:** A demo-ready, documented, deployable system.

**Tasks:**
- Seed/demo data script (pre-populated history so AI Insights isn't stuck in cold-start for a live demo)
- README with setup instructions
- Kubernetes manifests/Helm chart (capability demonstration, not the primary run path)
- Final walkthrough against every success criterion in A.4

**Acceptance Criteria:**
- Fresh checkout → `docker compose up` → demo script → working, AI-populated demo, no manual data-waiting required
- Every item in A.4 is checked off with an *observed* result

**Dependencies:** All prior phases.

---

## PART D — CROSS-CUTTING RULES (APPLY IN EVERY PHASE)

These are not phase-specific tasks — they are standing constraints that every phase's work must respect, drawn from the source documents. An Antigravity agent working on any mission should treat these as always-on guardrails:

1. **Every query is `orgId`-scoped, server-side only.** No exceptions, no client-supplied tenant filters. *(Doc 05 §6, Doc 08 §4)*
2. **Cross-tenant lookups return `404`, never `403`.** *(Doc 06 §1.5)*
3. **RBAC is enforced in one shared middleware/config, not scattered per-route checks.** *(Doc 08 §3.2)*
4. **Frontend role-gating is UX only — the backend is always the real boundary.** Never trust a hidden button as security. *(Doc 09 §2.4, Doc 08 intro)*
5. **Access tokens live in memory only; refresh tokens are httpOnly cookies.** Never `localStorage`. *(Doc 08 §2.2–2.3)*
6. **New Phase 2+ features (Docker/K8s monitoring, ELK, failure prediction, etc.) are out of scope for this MVP roadmap** unless a new phase is explicitly added — don't let scope creep into these phases. *(Doc 01 §6.2)*
7. **Status colors and AI-accent tagging are used consistently across every screen** — don't introduce one-off color meanings on a new page. *(Doc 09 §2.4)*
8. **Every new collection/endpoint added during implementation must extend, not bypass, the Permission Matrix and cross-tenant test suite.** *(Doc 03 §5, Doc 10 Phase 13)*

---

## PART E — DOCUMENT INDEX FOR AGENT REFERENCE

When a mission needs authoritative detail beyond this summary, consult:

| Need | Document |
|---|---|
| Why a feature exists / is deferred | `01-vision-and-scope.md` |
| Exact functional/non-functional requirement wording | `02-srs-mvp.md` |
| Exact role permission for a specific action | `03-user-roles-permission-matrix.md` |
| Service boundaries, data flow, deployment topology | `04-system-architecture.md` |
| Collection schema, indexes, validation rules | `05-data-model-erd.md` |
| Exact endpoint contract, request/response shape, error codes | `06-api-specification.md` |
| AI preprocessing, model, scoring detail | `07-ai-module-design.md` |
| Auth/token/RBAC/attack-prevention detail | `08-security-design.md` |
| Page layout, widget behavior, design tokens, user journeys | `09-ui-ux-design.md` |
| Individual Antigravity mission breakdown per phase | `10-development-roadmap.md` |

**This document (11) is the entry point. Start here, drill into the source document only when a mission needs detail this summary doesn't carry.**
