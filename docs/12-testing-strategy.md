# Testing Strategy Document
## AI-Powered DevOps Monitoring Platform — MVP

**Document Version:** 1.0
**Status:** MVP Baseline
**Related Documents:** All prior docs (01–11), especially `02-srs-mvp.md`, `03-user-roles-permission-matrix.md`, `06-api-specification.md`, `08-security-design.md`, `10-development-roadmap.md`, `11-master-project-specification.md`

This document defines **what** to test and **why** — test case identifiers, coverage areas, and acceptance thresholds. It does not contain test code or framework-specific implementation; that belongs alongside the actual codebase once Phase 0 (per the Development Roadmap) is underway.

---

## 1. Testing Objectives

1. Verify every functional requirement in `02-srs-mvp.md` (FR-1.x through FR-7.x) behaves as specified.
2. Verify the multi-tenancy guarantee (NFR-2) holds under every code path that returns or mutates data — this is the platform's single highest-priority testing objective, per the threat model in `08-security-design.md` §7.
3. Verify RBAC is enforced identically to the Permission Matrix (`03-user-roles-permission-matrix.md`) for every role × endpoint combination.
4. Verify the AI anomaly detection pipeline produces meaningfully different scores for normal vs. abnormal behavior, and degrades gracefully when unavailable.
5. Verify the platform withstands the attack classes catalogued in `08-security-design.md` §6.
6. Verify the system meets its stated near-real-time performance intent (NFR-3) at MVP/demo scale.
7. Provide a repeatable regression safety net so that each new Development Roadmap phase (Doc 10) can be built without silently breaking previously-verified behavior.
8. Provide sign-off criteria for each roadmap phase, so "done" is a checkable fact, not a judgment call.

---

## 2. Testing Scope

### 2.1 In Scope
- All MVP functional modules per `01-vision-and-scope.md` §6.1: auth & org management, Linux server monitoring, REST API monitoring, AI anomaly detection, dashboards, alerting, reporting.
- Cross-cutting concerns: multi-tenancy isolation, RBAC, security controls, near-real-time behavior.
- All 5 roles' permitted and forbidden actions.
- Local Docker Compose deployment target (per Vision & Scope §6, the MVP runtime).

### 2.2 Out of Scope (for this MVP test cycle)
- Docker container monitoring, Kubernetes cluster monitoring, ELK log management, failure prediction, root cause suggestions, AI alert prioritization, PDF/scheduled reports — all deferred per Vision & Scope §6.2; test cases for these belong to their own Phase 2+ testing strategy addendum.
- Kubernetes deployment manifests are validated once as a capability demonstration (Roadmap Mission 14.3) but are not part of the regression suite, since Kubernetes is not the MVP's primary runtime.
- Full WCAG accessibility audit (noted as Phase 2+ in `09-ui-ux-design.md` §8).
- Load testing at real production SaaS scale (only demo/portfolio scale is validated — see §8).

---

## 3. Testing Levels

### 3.1 Unit Testing
**Purpose:** Verify individual functions/modules in isolation (hashing, token generation, validation logic, preprocessing/feature-engineering functions, scoring normalization).
**Owner:** written alongside each Roadmap mission that introduces new logic (per Doc 10's Definition of Done pattern).
**Coverage target:** all pure business logic (bcrypt utility, JWT utility, RBAC config lookups, scoped-query wrapper, AI preprocessing/feature functions, score normalization) — not UI rendering or network I/O, which belong to integration/UI levels.

### 3.2 Integration Testing
**Purpose:** Verify components work together correctly — Core API ↔ MongoDB, Core API ↔ Prometheus, Core API ↔ AI Service, AI Service ↔ Prometheus/MongoDB.
**Coverage target:** every documented internal contract in `04-system-architecture.md` §4 and `07-ai-module-design.md` §8 (e.g., server registration → Prometheus target appears; anomaly detected → alert created).

### 3.3 API Testing
**Purpose:** Verify every REST endpoint in `06-api-specification.md` against its documented request/response shape, validation rules, status codes, and RBAC restrictions.
**Coverage target:** 100% of documented endpoints — see §6 for module-by-module functional test cases and §9 for the cross-tenant dimension applied to each.

### 3.4 UI Testing
**Purpose:** Verify each of the 16 pages in `09-ui-ux-design.md` §4 renders correctly, reflects live backend state, respects role-based visibility, and behaves correctly across the responsive breakpoints in §6 of that document.
**Coverage target:** every page's primary user flow, every role-based visibility rule, and the responsive behavior at each defined breakpoint (desktop/laptop/tablet/mobile).

### 3.5 AI Model Validation
**Purpose:** Verify the anomaly detection pipeline produces useful, trustworthy output — distinct from standard software testing, since correctness here is statistical, not binary.
**Coverage target:** see §6.5 (functional test cases) and the model-specific validation criteria below:
- Score separation: synthetic normal windows score measurably lower than synthetic injected-anomaly windows across a representative sample of metrics.
- Cold-start behavior: resources below the history threshold are never scored, and are clearly labeled as such rather than silently absent.
- Sensitivity responsiveness: changing an org's `anomalySensitivity` setting measurably changes which scored windows cross the alert-generation threshold.
- Model retraining: a model retrained after a legitimate baseline shift (e.g., simulated sustained load increase) stops flagging the new baseline as anomalous.
- False-positive spot check: a sample of flagged anomalies is manually reviewed for plausibility before sign-off (not automatable, but required for phase acceptance — see §10, Phase 9).

### 3.6 Security Testing
**Purpose:** Verify every control in `08-security-design.md` actually holds. See §7 (Security Test Checklist) for the full checklist.

### 3.7 Performance Testing
**Purpose:** Verify the platform meets its stated near-real-time intent (NFR-3) and remains stable at documented MVP/demo scale (per Vision & Scope §9 assumptions: low-dozens of resources per org). See §8 (Performance Test Checklist).

### 3.8 User Acceptance Testing (UAT)
**Purpose:** Validate the system against the five user journeys defined in `09-ui-ux-design.md` §7 and the success criteria in `01-vision-and-scope.md` §8 — the final human sign-off that the product actually solves the problem it was built for, not just that individual pieces pass automated checks.

**UAT Scenarios (mapped to Doc 09 §7):**

| UAT ID | Scenario | Role | Source Journey |
|---|---|---|---|
| UAT-01 | Morning health check — spot a down server, trace it to an AI-flagged anomaly, resolve the alert | DevOps Engineer | Doc 09 §7.1 |
| UAT-02 | Onboard a new organization end-to-end (register → add resources → invite users → configure notifications) | Org Admin | Doc 09 §7.2 |
| UAT-03 | Weekly status review and CSV export for a stakeholder | Viewer | Doc 09 §7.3 |
| UAT-04 | Alert triage session, cross-referencing AI Insights for context | Team Lead | Doc 09 §7.4 |
| UAT-05 | Platform-level health glance with no org drill-down | Super Admin | Doc 09 §7.5 |

Each UAT scenario is signed off only when a human (not an automated check) walks through it against the running system and confirms the experience matches the documented journey.

---

## 4. Test Environment

| Environment | Purpose | Configuration |
|---|---|---|
| **Local Dev** | Developer/agent-driven testing during mission implementation | Docker Compose, per developer machine, seeded with minimal fixture data |
| **CI (per commit/PR)** | Automated unit + integration + API test suites | Docker Compose spun up fresh per run; no persistent state between runs |
| **Staging / Demo** | UAT, manual exploratory testing, performance testing, final phase sign-off | Docker Compose with the seed/demo data script (Roadmap Mission 14.1), long-running so AI cold-start clears naturally or via seeded historical data |

**Environment parity note:** since the MVP's only deployment target is Docker Compose (Vision & Scope §6.1), there is no separate "production-like" environment to diverge from — Staging/Demo *is* the closest approximation to how the system will actually be shown/used, which raises the importance of testing directly against it rather than only against mocked unit-level fixtures.

**Kubernetes environment:** used only for the one-time validation of Mission 14.3's manifests (§2.2) — not a continuously tested environment in the MVP cycle.

---

## 5. Test Data Strategy

### 5.1 Principles
- Test data must include **at least two distinct organizations** in every test suite that exercises resource-returning endpoints, so cross-tenant isolation (§9) can be verified as a matter of course, not a special case.
- Test data covers **all 5 roles**, including edge cases like an org with only one user (testing "cannot demote the last org_admin" business rules from `06-api-specification.md` §4.3).
- Synthetic metric data must include both **stable/normal patterns** and **injected anomalies** (spikes, gradual drift, flatlines) to exercise AI Model Validation (§3.5).

### 5.2 Data Categories

| Category | Description | Used For |
|---|---|---|
| **Fixture data** | Minimal, deterministic dataset (2 orgs, 5 roles represented, a handful of servers/API monitors) | Unit/integration/API test suites, CI |
| **Synthetic metric streams** | Generated time-series with known normal baselines and deliberately injected anomalies at known timestamps | AI Model Validation, dashboard/graph rendering tests |
| **Seed/demo data** (Roadmap Mission 14.1) | Larger, realistic-looking dataset with pre-cleared AI cold-start | UAT, Staging/Demo, screenshots for portfolio presentation |
| **Load-test data** | Programmatically generated volume at documented demo-scale ceiling (§8) | Performance testing |

### 5.3 Data Isolation in Testing
Test data for different organizations must never share identifiers in a way that could mask an isolation bug — e.g., avoid naming both test orgs' resources identically ("prod-web-01" in both org A and org B), since an isolation bug that leaks org B's server into org A's list could go unnoticed if the two look the same. Deliberately distinct naming between test orgs.

### 5.4 Data Reset
CI and Local Dev environments reset to a known fixture state on each run. Staging/Demo persists (it's meant to look "lived-in" for demo purposes) but has a documented reset script for when it needs a clean slate.

---

## 6. Functional Test Cases by Module

Each test case: ID, description, preconditions, expected result. Traces to source FR IDs and API endpoints. This is a representative core set per module — exhaustive edge-case enumeration belongs in the actual test suite, not this document.

### 6.1 Authentication

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| AUTH-01 | Register new organization with valid data | None | `201`, org + admin user created, tokens issued | FR-1.1, API §2.1 |
| AUTH-02 | Register with duplicate admin email | Email already registered | `409 DUPLICATE_RESOURCE` | API §2.1 |
| AUTH-03 | Register with weak password | None | `400 VALIDATION_ERROR` | API §2.1 |
| AUTH-04 | Login with correct credentials | Org registered | `200`, tokens issued | FR-1.3, API §2.2 |
| AUTH-05 | Login with wrong password | Org registered | `401`, generic error message | AUTH-05a compares identically to AUTH-05b message |
| AUTH-05a/b | Login with unknown email vs. wrong password | — | Both return identical error body (enumeration prevention) | Security Design §2.4 |
| AUTH-06 | Access protected endpoint with expired access token | Token expired (>15 min) | `401` | Security Design §2.2 |
| AUTH-07 | Refresh with valid refresh token | Valid refresh token held | `200`, new access + refresh token, old refresh token revoked | FR-1.4, API §2.3 |
| AUTH-08 | Reuse an already-rotated refresh token | Refresh already used once | `401`, **all** sessions for that user revoked | Security Design §2.3 |
| AUTH-09 | Logout revokes only the specified session | Multiple active sessions | Other sessions remain valid after logout | API §2.4 |
| AUTH-10 | Password stored as bcrypt hash, never plaintext | Any user created | DB inspection confirms hash, not plaintext; hash differs between two identical passwords | FR-1.2, Security Design §2.1 |
| AUTH-11 | Change password requires correct current password | User logged in | Wrong current password → `401`; correct → `200` and old password no longer works | API §4.6 |

### 6.2 Organization Management

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| ORG-01 | Org Admin views own org profile | Logged in as org_admin | `200`, correct org data | API §3.1 |
| ORG-02 | Org Admin updates org settings | Logged in as org_admin | `200`, changes persisted | API §3.2 |
| ORG-03 | Non-org_admin attempts to update org settings | Logged in as devops_engineer/team_lead/viewer | `403` | Permission Matrix §3.1 |
| ORG-04 | Org Admin invites a user with valid role | Logged in as org_admin | `201`, user created with `invited` status | FR-1.6, API §4.2 |
| ORG-05 | Org Admin invites with duplicate email | Email exists in org | `409` | API §4.2 |
| ORG-06 | Org Admin changes a user's role | Target user exists in same org | `200`, role updated | Permission Matrix §3.2 |
| ORG-07 | Org Admin attempts to demote the last remaining org_admin | Only one org_admin exists | `400`, blocked | API §4.3 |
| ORG-08 | Org Admin removes a user | Target user exists | `204`, user deactivated | API §4.4 |
| ORG-09 | Super Admin views platform organization list | Logged in as super_admin | `200`, aggregate counts only, no org-internal documents | Permission Matrix §4, API §3.3 |
| ORG-10 | Non-super_admin attempts platform endpoint | Any other role | `403` | Permission Matrix §4 |

### 6.3 Linux Server Monitoring

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| SRV-01 | Register a new server with valid data | Logged in as org_admin/devops_engineer | `201`, server created, appears as Prometheus scrape target | FR-2.1, API §5.1 |
| SRV-02 | Register a server with duplicate host in same org | Host already registered | `409` | API §5.1 |
| SRV-03 | Register a server with duplicate host in a *different* org | Host registered in org B, registering in org A | `201` succeeds — uniqueness is per-org, not global | Data Model §4.4 |
| SRV-04 | Viewer/team_lead attempts to register a server | Logged in as viewer/team_lead | `403` | Permission Matrix §3.3 |
| SRV-05 | List servers shows correct current status | Server registered and reachable | Status reflects `healthy`/`degraded`/`down`/`unknown` accurately | FR-2.4 |
| SRV-06 | Server goes unreachable | Monitored node-exporter target stopped | Status transitions to `down` within documented window | FR-2.4 |
| SRV-07 | Fetch historical metrics for a valid time range | Server has metric history | `200`, series data matches expected shape | FR-2.3, API §5.4 |
| SRV-08 | Deregister a server | Server exists | `204`, removed from Prometheus targets, historical alerts/anomalies retained | FR-2.5, API §5.6 |

### 6.4 REST API Monitoring

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| APIMON-01 | Register a new API monitor with valid data | Logged in as org_admin/devops_engineer | `201`, appears as blackbox probe target | FR-3.1, API §6.1 |
| APIMON-02 | Register with invalid URL format | — | `400` | API §6.1 |
| APIMON-03 | Register with check interval below minimum (15s) | — | `400`/`422` | API §6.1 |
| APIMON-04 | Uptime % correctly computed over 24h window | Probe history exists with known up/down pattern | Computed value matches expected percentage | FR-3.3 |
| APIMON-05 | Endpoint flagged Down after N consecutive failures | Configured failure threshold breached | Status transitions to `down` | FR-3.4 |
| APIMON-06 | Fetch historical response-time/status metrics | Monitor has history | `200`, correct series shape | API §6.4 |
| APIMON-07 | Delete an API monitor | Monitor exists | `204`, probe target removed | API §6.6 |

### 6.5 AI Anomaly Detection

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| AI-01 | Cold-start resource is not scored | Resource has <24h history | No anomaly record created; resource shown as "Collecting Baseline" in UI | AI Design §6.3 |
| AI-02 | Resource with sufficient history gets an initial model trained | Resource has ≥24h history | Model file persisted, `modelVersion` recorded | AI Design §6.3–6.4 |
| AI-03 | Synthetic normal window scores low | Model trained, normal-pattern window submitted | Normalized score well below default sensitivity threshold | AI Design §7.3 |
| AI-04 | Synthetic injected-spike window scores high | Model trained, anomalous window submitted | Normalized score exceeds sensitivity threshold, anomaly persisted | FR-4.1–4.3 |
| AI-05 | Anomaly above threshold generates exactly one alert | Anomaly persisted | One `alerts` document created, tagged `source: anomaly` | FR-4.5 |
| AI-06 | Repeated anomalous windows within dedup interval do not create duplicate alerts | Same resource/metric anomalous across consecutive runs | Only one open alert exists, not one per run | AI Design §8.1 |
| AI-07 | Adjusting `anomalySensitivity` changes alert-generation behavior | Org sensitivity changed | A previously sub-threshold score now (or no longer) generates an alert as expected | API §9.4 |
| AI-08 | Mark anomaly as reviewed/dismissed | Anomaly exists | `reviewed: true`, note persisted | API §9.3 |
| AI-09 | AI Service outage does not break dashboard/alerts | AI Service container stopped | Core API responses flag AI Insights unavailable; other features unaffected | AI Design §10, Architecture §8.3 |
| AI-10 | Model retrains and adapts to legitimate baseline drift | Simulated sustained load increase over retraining window | Post-retrain model does not flag the new baseline as anomalous | AI Design §6.3 |

### 6.6 Dashboard

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| DASH-01 | Summary stat cards reflect accurate counts | Known set of servers/APIs/alerts/anomalies | Displayed counts match backend state exactly | FR-5.1 |
| DASH-02 | Resource status grid updates in real time | Dashboard open, backend metric event fires | Status dot updates without manual refresh, within NFR-3's latency target | FR-5.3, NFR-3 |
| DASH-03 | Recent Alerts / AI Insights panels show correct latest items | Known alert/anomaly history | Correct 5 most recent items shown, correctly ordered | UI/UX §5.2 |
| DASH-04 | Viewer sees dashboard with no action buttons | Logged in as viewer | No create/edit/delete controls rendered | UI/UX §7.3, NFR-9 |
| DASH-05 | Dashboard data scoped to caller's own org only | Two orgs with different resource counts | Each org's dashboard shows only its own data | FR-5.4, NFR-2 |

### 6.7 Alerts

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| ALERT-01 | Threshold breach generates an alert | Alert rule configured, threshold breached | Alert created with `source: threshold` | FR-6.1 |
| ALERT-02 | Alert triggers email notification | Alert created | Email received matching alert content | FR-6.2 |
| ALERT-03 | Alert triggers in-app notification | Alert created | Notification document created for relevant users | FR-6.3 |
| ALERT-04 | Acknowledge an open alert | Alert status `open` | `200`, status → `acknowledged`, `acknowledgedBy` set | FR-6.4, API §8.3 |
| ALERT-05 | Acknowledge an already-resolved alert | Alert status `resolved` | `409` conflict | API §8.3 |
| ALERT-06 | Resolve an alert | Alert exists | `200`, status → `resolved`, `resolvedBy`/`resolvedAt` set | FR-6.4, API §8.4 |
| ALERT-07 | Viewer attempts to acknowledge an alert | Logged in as viewer | `403` | Permission Matrix §3.6 |
| ALERT-08 | Alert history persists after resolution | Alert resolved | Still queryable via `GET /alerts?status=resolved` | FR-6.5 |
| ALERT-09 | Org Admin deletes alert history | Logged in as org_admin | `204` | API §8.5 |

### 6.8 Reports

| ID | Description | Preconditions | Expected Result | Traces To |
|---|---|---|---|---|
| REPORT-01 | Export metrics CSV for valid range | Metric history exists | `200`, CSV content matches on-screen data for same range | FR-7.1 |
| REPORT-02 | Export alerts CSV for valid range | Alert history exists | CSV matches alert list for range | FR-7.1 |
| REPORT-03 | Export anomalies CSV for valid range | Anomaly history exists | CSV matches AI Insights list for range | FR-7.1 |
| REPORT-04 | Export with range exceeding 90 days | — | `400 VALIDATION_ERROR` | API §11.1 |
| REPORT-05 | Export scoped to caller's org only | Two orgs with different data | Exported CSV contains only caller's org data | FR-7.2, NFR-2 |
| REPORT-06 | Export audit entry recorded | Any export performed | `reportExports` document created (server-side, not user-visible in MVP) | Data Model §4.10 |

---

## 7. Security Test Checklist

Directly derived from `08-security-design.md` §6 and §10. Each item is a pass/fail gate, not a scored metric.

| # | Check | Reference |
|---|---|---|
| SEC-01 | Passwords hashed with bcrypt cost 12; never logged or returned in any response | §2.1 |
| SEC-02 | Access tokens expire at 15 minutes; expired tokens rejected | §2.2 |
| SEC-03 | Access tokens never persisted in `localStorage`/`sessionStorage` (verified via browser inspection) | §2.2 |
| SEC-04 | Refresh tokens delivered as httpOnly, Secure, SameSite=Strict cookies | §2.3 |
| SEC-05 | Only refresh token hashes stored server-side | §2.3 |
| SEC-06 | Refresh token rotation on every use; reused token triggers full session revocation | §2.3, §9.2 |
| SEC-07 | RBAC middleware enforces the Permission Matrix for every endpoint, sourced from one shared config | §3 |
| SEC-08 | Super Admin cannot access any org-scoped resource endpoint | §3.3 |
| SEC-09 | Every non-`organizations` document requires `orgId`; cannot be saved without it (schema validation test) | §4.1, Data Model §5 |
| SEC-10 | `orgId` is never accepted from client input for filtering purposes | §4.2 |
| SEC-11 | Cross-org resource access returns `404`, not `403`, across all endpoints | §4.2 |
| SEC-12 | Socket.IO connections join org rooms server-side only; client cannot specify an arbitrary room | §4.3 |
| SEC-13 | Production config enforces HTTPS/WSS; HTTP requests redirected (documented as local-only exception in Docker Compose) | §5.1 |
| SEC-14 | All request bodies validated against schema before reaching business logic | §5.2 |
| SEC-15 | CORS restricted to known frontend origin(s), not wildcard | §5.4 |
| SEC-16 | Security headers present (X-Content-Type-Options, X-Frame-Options, CSP) | §5.5 |
| SEC-17 | Rate limiting active on `/auth/login` (5/min/IP) and `/auth/register` (3/min/IP) | §5.6 |
| SEC-18 | Internal AI Service ↔ Core API endpoints require shared internal service token, not reachable externally | §5.7 |
| SEC-19 | NoSQL injection attempts (operator injection in request bodies) rejected by input validation | §6 |
| SEC-20 | XSS: user-supplied content (server names, alert messages) never rendered via `dangerouslySetInnerHTML` | §6 |
| SEC-21 | CSRF: state-changing requests require `Authorization` header; cookie alone insufficient | §6 |
| SEC-22 | Login/registration error messages do not reveal whether an email exists (enumeration prevention) | §6, §2.4 |
| SEC-23 | Role cannot be escalated via client-supplied fields on unrelated update endpoints (mass assignment test) | §6 |
| SEC-24 | JWT signing secret, DB connection string, internal service token sourced from environment/secrets, never committed | §6, §9.4 |
| SEC-25 | Authentication events logged with `userId`/`orgId`, never raw tokens or passwords | §9.1 |

---

## 8. Performance Test Checklist

Scoped to the MVP/portfolio scale explicitly assumed in `01-vision-and-scope.md` §9 (low-dozens of monitored resources per org) — this is **not** a production SaaS load test.

| # | Check | Target | Reference |
|---|---|---|---|
| PERF-01 | Dashboard update latency after a new metric/alert event | Client reflects update within ~5–10 seconds | NFR-3 |
| PERF-02 | Login response time under normal load | Sub-second excluding bcrypt's deliberate cost | NFR-3 (implied) |
| PERF-03 | `GET /servers`, `GET /api-monitors` list response time at demo scale (≤50 resources/org) | Sub-second | NFR-3 |
| PERF-04 | AI scoring cycle completes within its interval | A full scoring pass across all active resources in an org completes before the next scheduled run begins | AI Design §7.1 |
| PERF-05 | CSV export generation time for a 90-day range at demo scale | Completes without timeout; reasonable wait (a few seconds) | API §11.1 |
| PERF-06 | Socket.IO connection stability over an extended session (e.g., 8+ hours, simulating a dashboard left open) | No dropped/leaked connections, no memory growth indicating a leak | Architecture §4.7 |
| PERF-07 | Concurrent users within a single org (e.g., 5–10 simultaneous dashboard viewers) | No degradation in update latency or API response time | Vision & Scope §9 |
| PERF-08 | MongoDB query performance with indexes in place (per Data Model §4.x index definitions) | Primary query patterns (org-scoped lists, sorted by date) use indexes, not full collection scans | Data Model §4 |
| PERF-09 | Prometheus scrape/query performance at demo target count | No missed scrapes, query responses remain fast | Architecture §4.5 |
| PERF-10 | Graceful degradation timing: how quickly does the UI reflect an AI Service or Prometheus outage | Reasonably prompt (not left in a stale "loading" state indefinitely) | Architecture §8.3 |

**Explicitly not tested in MVP:** thousands of concurrent orgs, high-cardinality metric ingestion at real production volume, horizontal scaling behavior (all Phase 2+ concerns per Architecture §9).

---

## 9. Multi-Tenant Isolation Test Cases

This is the platform's highest-priority test category (Security Design §7). Every resource-returning or resource-mutating endpoint gets an explicit cross-tenant case, structured as: **Org A user attempts an action against Org B's resource → expect `404`.**

| ID | Description | Expected Result |
|---|---|---|
| TENANT-01 | Org A user fetches Org B's server by ID | `404` |
| TENANT-02 | Org A user updates Org B's server | `404` |
| TENANT-03 | Org A user deletes Org B's server | `404` |
| TENANT-04 | Org A user fetches Org B's server metrics | `404` |
| TENANT-05 | Org A user fetches Org B's API monitor by ID | `404` |
| TENANT-06 | Org A user updates/deletes Org B's API monitor | `404` |
| TENANT-07 | Org A user fetches Org B's alert rule | `404` |
| TENANT-08 | Org A user fetches/acknowledges/resolves Org B's alert | `404` |
| TENANT-09 | Org A user fetches Org B's anomaly | `404` |
| TENANT-10 | Org A user reviews/dismisses Org B's anomaly | `404` |
| TENANT-11 | Org A user marks Org B user's notification as read | `404` (or `403` if own-user-only, not org-only — see Data Model §4.9 note; test asserts whichever is documented, but never `200`) |
| TENANT-12 | Org A user exports a CSV report — verify Org B's data never appears in the file | Report contains zero Org B records |
| TENANT-13 | Org A user's Socket.IO connection — verify no Org B events are ever received, even when Org B's events fire simultaneously | Zero cross-org events observed over a sustained connection window |
| TENANT-14 | Org A `org_admin` attempts to invite/manage a user belonging to Org B | `404`/`403` — cannot act on a user outside their own org |
| TENANT-15 | Org A user list (`GET /users`) never includes Org B's users | Only Org A users returned |
| TENANT-16 | Attempt to bypass scoping by supplying a foreign `orgId` in a request body/query param | Ignored — server-side JWT-derived `orgId` is used regardless of what the client sends |
| TENANT-17 | Super Admin's platform endpoint returns aggregate counts only — verify no org-internal document fields leak through | Response contains only the documented aggregate fields, confirmed via schema diff against `06-api-specification.md` §3.3 |
| TENANT-18 | Two orgs with identically-named resources (e.g., both named "prod-web-01") — verify no confusion/merging occurs | Each org's resource remains fully independent; no cross-contamination in listings or metrics |

**This entire test category is re-run in full for every phase from Phase 3 onward** (per Development Roadmap Phase 13) — any new resource type or endpoint added must extend this table before that phase is considered complete.

---

## 10. Acceptance Criteria for Every Development Phase

Mirrors the phase structure in `10-development-roadmap.md` / `11-master-project-specification.md` Part C. A phase is not "done" until its acceptance criteria pass, in addition to its individual missions' Definitions of Done.

| Phase | Acceptance Criteria |
|---|---|
| 0 — Scaffolding | All services start via one `docker compose up`; each health endpoint returns success |
| 1 — Auth Backend | AUTH-01 through AUTH-11 pass; full RBAC test suite passes for all Phase 1 endpoints; ORG-09/ORG-10 pass |
| 2 — Auth UI | Role-based sidebar visibility confirmed for all 5 roles; token storage confirmed in-memory only (SEC-03) |
| 3 — Server Monitoring Backend | SRV-01 through SRV-08 pass; TENANT-01 through TENANT-04 pass |
| 4 — Server Monitoring UI | Server list/detail pages render live data correctly across responsive breakpoints |
| 5 — API Monitoring Backend | APIMON-01 through APIMON-07 pass; TENANT-05/TENANT-06 pass |
| 6 — API Monitoring UI | API monitor list/detail pages render live data correctly |
| 7 — Alerting Backend | ALERT-01 through ALERT-09 pass; TENANT-07/TENANT-08 pass |
| 8 — Alerting UI | Alerts page and notification bell reflect live backend state; role-gated actions confirmed |
| 9 — AI Service | AI-01 through AI-10 pass; AI Model Validation criteria (§3.5) met; manual false-positive spot check completed |
| 10 — AI Insights UI | AI Insights/Anomaly Detail pages render correctly; TENANT-09/TENANT-10 pass |
| 11 — Reporting | REPORT-01 through REPORT-06 pass; TENANT-12 passes |
| 12 — Real-Time Layer | DASH-02 passes with live Socket.IO events; TENANT-13 passes |
| 13 — Security Hardening | 100% of the Security Test Checklist (§7) passes; 100% of Multi-Tenant Isolation cases (§9) pass; 100% RBAC coverage confirmed |
| 14 — Deployment Polish | All UAT scenarios (§3.8) signed off; every success criterion in Vision & Scope §8 observed and checked off; Performance Test Checklist (§8) passes at demo scale |

---

## 11. Regression Testing Strategy

### 11.1 Principle
Every phase's automated test cases (unit, integration, API) remain part of a **cumulative regression suite** — later phases don't just add new tests, they continuously re-run all prior phases' tests. This is what allows Antigravity agents to safely build later missions without re-verifying earlier work by hand each time.

### 11.2 What Runs When

| Trigger | Suite Run |
|---|---|
| Every commit / PR (CI) | Full unit + integration + API test suite for all completed phases (fast feedback) |
| Before marking any Roadmap phase complete | That phase's specific acceptance criteria (§10) + full regression suite |
| Before any Staging/Demo deployment | Full regression suite + full Multi-Tenant Isolation suite (§9) + full Security Test Checklist (§7) |
| Before final MVP sign-off (Phase 14) | Everything: full regression, full UAT (§3.8), full Performance Checklist (§8), Deployment Validation Checklist (§12) |

### 11.3 Regression Priorities When Time-Constrained
If full regression cannot run before every change (e.g., mid-mission iteration), priority order is:
1. Multi-Tenant Isolation suite (§9) — highest risk, per Security Design §7
2. RBAC/Security Test Checklist (§7)
3. The specific module being changed
4. Everything else

### 11.4 Regression Ownership on New Features
Any mission that adds a new collection, endpoint, or role-gated action must, as part of its own Definition of Done, add corresponding entries to: the RBAC test suite (§7 SEC-07), the Multi-Tenant Isolation table (§9), and this document's relevant module test case table (§6) — regression coverage is not a separate, deferred task.

---

## 12. Deployment Validation Checklist

Run before considering the MVP demo-ready (Roadmap Phase 14).

| # | Check |
|---|---|
| DEPLOY-01 | Fresh checkout, `docker compose up`, all services healthy with no manual intervention |
| DEPLOY-02 | Seed/demo data script runs successfully and produces a non-empty, AI-populated demo state |
| DEPLOY-03 | README instructions followed literally by someone unfamiliar with the project reach a working demo |
| DEPLOY-04 | All environment variables/secrets documented (names and purpose, not actual secret values) in setup instructions |
| DEPLOY-05 | No secrets committed to source control (scan confirms `.env` files gitignored, no hardcoded credentials) |
| DEPLOY-06 | All 5 roles can be demonstrated end-to-end against the deployed instance |
| DEPLOY-07 | Kubernetes manifests/Helm chart apply successfully against a local cluster (one-time capability check, Roadmap Mission 14.3) |
| DEPLOY-08 | Every Vision & Scope §8 success criterion observed and checked off against the deployed instance |
| DEPLOY-09 | Full regression suite (§11) green immediately prior to any demo/presentation |
| DEPLOY-10 | Grafana (supplementary) accessible and shows the same underlying Prometheus data as the product's own dashboard, confirming ecosystem integration works even though it's not the primary UX |

---

## 13. Traceability Summary

| Testing Category | Primary Source Document(s) |
|---|---|
| Functional test cases | `02-srs-mvp.md`, `06-api-specification.md` |
| RBAC coverage | `03-user-roles-permission-matrix.md` |
| Multi-tenant isolation | `05-data-model-erd.md` §6, `08-security-design.md` §4, §7 |
| Security checklist | `08-security-design.md` §2–§9 |
| AI validation | `07-ai-module-design.md` §6–§7 |
| UI/responsive/UAT | `09-ui-ux-design.md` §4–§7 |
| Phase acceptance criteria | `10-development-roadmap.md`, `11-master-project-specification.md` Part C |

This document should be treated as living — any change to the Permission Matrix, API Specification, Data Model, or Security Design must be reflected here in the same change, per the same drift-prevention principle established in `06-api-specification.md` §14.
