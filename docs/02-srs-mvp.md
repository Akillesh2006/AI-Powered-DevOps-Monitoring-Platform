# Software Requirements Specification (SRS)
## AI-Powered DevOps Monitoring Platform — MVP

**Document Version:** 1.0
**Status:** MVP Baseline
**Related Document:** 01-vision-and-scope.md

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the functional and non-functional requirements for the MVP release of the AI-Powered DevOps Monitoring Platform, as scoped in the Vision & Scope Document.

### 1.2 Scope
Covers: multi-tenant auth & org management, Linux server monitoring, REST API monitoring, AI anomaly detection, dashboards, alerting, and reporting (CSV).
Excludes: Docker monitoring, Kubernetes monitoring, ELK log management, failure prediction, root cause suggestions, AI alert prioritization, PDF/scheduled reports (all Phase 2+).

### 1.3 Definitions

| Term | Definition |
|---|---|
| Org / Tenant | An independent organization account; the primary data isolation boundary |
| Resource | A monitored entity (Linux server or REST API endpoint) |
| Anomaly | A metric pattern flagged by the AI model as statistically abnormal |
| Alert | A notification-worthy event, from a threshold breach or an anomaly |

---

## 2. Functional Requirements

Each requirement has an ID for traceability into design docs, tickets, and tests.

### 2.1 Authentication & Organization Management

| ID | Requirement |
|---|---|
| FR-1.1 | System shall allow a new organization to self-register with an initial Org Admin account |
| FR-1.2 | System shall hash all passwords using bcrypt before storage |
| FR-1.3 | System shall issue a short-lived JWT access token and a longer-lived refresh token on login |
| FR-1.4 | System shall allow refresh tokens to be used to obtain new access tokens without re-entering credentials |
| FR-1.5 | System shall allow refresh tokens to be revoked (logout / forced logout) |
| FR-1.6 | System shall allow Org Admins to invite users to their organization with an assigned role |
| FR-1.7 | System shall enforce that every authenticated request is scoped to the requesting user's `orgId` |
| FR-1.8 | System shall support 5 roles: Super Admin, Org Admin, DevOps Engineer, Team Lead, Viewer, each with distinct permissions (see Permission Matrix doc) |
| FR-1.9 | System shall prevent any cross-organization data access at the API layer, independent of UI restrictions |
| FR-1.10 | Super Admin shall be able to view platform-level org list and high-level org health (not org-internal data details) |

### 2.2 Linux Server Monitoring

| ID | Requirement |
|---|---|
| FR-2.1 | System shall allow a DevOps Engineer/Org Admin to register a Linux server as a monitored resource |
| FR-2.2 | System shall collect CPU utilization, memory utilization, disk usage, and network I/O from registered servers via Prometheus node-exporter |
| FR-2.3 | System shall display current and historical (time-range selectable) metrics per server |
| FR-2.4 | System shall classify each server's status as Healthy, Degraded, or Down based on reachability and threshold rules |
| FR-2.5 | System shall allow removal/deregistration of a monitored server |

### 2.3 REST API Monitoring

| ID | Requirement |
|---|---|
| FR-3.1 | System shall allow registration of an external REST API endpoint for monitoring (URL, method, expected status, check interval) |
| FR-3.2 | System shall periodically poll registered API endpoints and record response time and status code |
| FR-3.3 | System shall compute and display uptime percentage and error rate per API endpoint over selectable time windows |
| FR-3.4 | System shall flag an endpoint as Down after N consecutive failed checks (configurable) |

### 2.4 AI Anomaly Detection

| ID | Requirement |
|---|---|
| FR-4.1 | System shall periodically (batch interval, e.g. every 2–5 minutes) score recent metric windows per resource for anomalies |
| FR-4.2 | System shall use an unsupervised model (e.g. Isolation Forest) requiring no manual threshold configuration per metric |
| FR-4.3 | System shall persist detected anomalies with resource reference, timestamp, metric snapshot, and anomaly score |
| FR-4.4 | System shall expose an AI Insights view listing recent anomalies per organization |
| FR-4.5 | System shall generate an alert when an anomaly score exceeds a configured sensitivity threshold |

### 2.5 Dashboards

| ID | Requirement |
|---|---|
| FR-5.1 | System shall provide a main dashboard summarizing org-wide resource health (servers + APIs) |
| FR-5.2 | System shall render CPU and memory utilization as time-series graphs per server |
| FR-5.3 | System shall push near-real-time updates to connected dashboard clients via Socket.IO |
| FR-5.4 | System shall restrict dashboard data to the viewing user's organization and role-permitted scope |

### 2.6 Alerting & Notifications

| ID | Requirement |
|---|---|
| FR-6.1 | System shall generate alerts from threshold breaches (server/API) and AI anomalies |
| FR-6.2 | System shall send email notifications for new alerts to configured recipients |
| FR-6.3 | System shall display in-app notifications for new alerts |
| FR-6.4 | System shall allow authorized users to acknowledge and resolve alerts |
| FR-6.5 | System shall maintain an alert history per organization |

### 2.7 Reporting

| ID | Requirement |
|---|---|
| FR-7.1 | System shall allow export of metrics, alerts, and anomaly data as CSV for a selected time range |
| FR-7.2 | Exported data shall be scoped to the requesting user's organization and role permissions |

---

## 3. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-1 | Security | All passwords hashed with bcrypt (cost factor ≥ 10); JWTs signed with a strong secret; refresh tokens stored securely and revocable |
| NFR-2 | Multi-tenancy | Every data-access query must be scoped by `orgId` at the service/middleware layer, not left to individual route handlers |
| NFR-3 | Performance | Dashboard updates should reach connected clients within ~5–10 seconds of new data arrival at MVP scale |
| NFR-4 | Scalability (design intent) | Architecture should allow horizontal scaling of API and AI services even if MVP runs single-instance locally |
| NFR-5 | Availability (design intent) | Core services (API, DB, metrics pipeline) should be independently restartable without full-system data loss |
| NFR-6 | Maintainability | Codebase organized by domain module (auth, resources, alerts, ai, reporting) with documented API contracts |
| NFR-7 | Observability | The platform itself should emit basic operational logs for its own services (not user-facing, but present for engineering credibility) |
| NFR-8 | Data Retention (MVP) | Raw metrics retained for a defined rolling window (e.g. 7–14 days) at MVP scale; documented as configurable |
| NFR-9 | Usability | Role-based UI must not expose actions a role isn't permitted to perform (buttons/routes hidden or disabled, not just backend-blocked) |

---

## 4. External Interface Requirements

- **Metric source:** Prometheus (scraping node-exporter on monitored Linux hosts)
- **Email delivery:** SMTP-compatible provider (e.g. SMTP relay or transactional email API)
- **Real-time channel:** Socket.IO over WebSocket (fallback to polling)
- **AI service interface:** Internal REST API between Node.js backend and Python AI service

---

## 5. Traceability Note

Each FR/NFR ID in this document should be referenced in:
- The System Architecture Document (which component satisfies it)
- The API Specification (which endpoint(s) implement it)
- Future test plans (which test(s) verify it)

---

## 6. Open Items for Next Documents

- Exact permission matrix per role × resource × action → **User Roles & Permission Matrix**
- Service boundaries and data flow diagrams → **System Architecture Document**
- MongoDB collection schemas and `orgId` enforcement pattern → **Data Model / ERD**
- Endpoint-level contracts → **API Specification**
- Model choice, feature engineering, training/scoring pipeline → **AI Module Design Document**
