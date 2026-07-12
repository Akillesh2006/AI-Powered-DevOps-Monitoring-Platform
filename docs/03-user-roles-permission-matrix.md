# User Roles & Permission Matrix
## AI-Powered DevOps Monitoring Platform — MVP

**Document Version:** 1.0
**Status:** MVP Baseline
**Related Documents:** 01-vision-and-scope.md, 02-srs-mvp.md

---

## 1. Purpose

This document defines the exact permissions for each of the platform's 5 roles, across every resource and action in the MVP scope. It is the source of truth for:

- Backend authorization middleware (every protected route must check against this matrix)
- Frontend UI gating (hiding/disabling actions a role cannot perform)
- Future test plans (permission tests should be derived directly from this table)

Per NFR-9 (Usability) and NFR-2 (Multi-tenancy) in the SRS, permission checks must be enforced server-side regardless of what the UI shows, and every check is implicitly also scoped by `orgId` — a role never grants cross-organization access, only in-organization scope (except Super Admin, defined separately in §4).

---

## 2. Roles Overview

| Role | Scope | Summary |
|---|---|---|
| **Super Admin** | Platform-wide, across all orgs | Platform owner/operator. Manages tenants at a high level. Does not operate inside any org's day-to-day monitoring data. |
| **Org Admin** | Single organization, full control | Owns the organization account. Full control over users, settings, and all monitoring/alerting/reporting features within their org. |
| **DevOps Engineer** | Single organization, operational control | Hands-on operator. Configures monitored resources, manages alerts, uses AI insights. Cannot manage users or org settings. |
| **Team Lead** | Single organization, team-scoped oversight | Oversight role. Broad read access, limited write access (mainly alert handling and reporting), no resource configuration or user management. |
| **Viewer** | Single organization, read-only | Read-only access to dashboards, alerts, insights, and reports. No configuration or mutation rights anywhere. |

---

## 3. Permission Matrix

Legend: **C** = Create, **R** = Read, **U** = Update, **D** = Delete, **—** = No access

### 3.1 Organization & Account Settings

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Register a new organization | — | C (self-service signup) | — | — | — |
| View own organization's profile/settings | — | R | R | R | R |
| Update organization settings (name, plan/tier, notification defaults) | — | U | — | — | — |
| Delete / deactivate organization | R (platform-level) | — | — | — | — |
| View list of all organizations (platform level) | R | — | — | — | — |
| View aggregate org health (platform level, no org-internal detail) | R | — | — | — | — |

### 3.2 User Management

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Invite user to organization | — | C | — | — | — |
| Assign / change a user's role | — | U | — | — | — |
| View list of users in own organization | — | R | R | R | — |
| Deactivate / remove a user from organization | — | D | — | — | — |
| View own user profile | R | R | R | R | R |
| Update own user profile (name, password) | R | U | U | U | U |
| Suspend an organization's admin account (platform-level abuse handling) | U | — | — | — | — |

### 3.3 Monitored Resources — Linux Servers

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Register a new server | — | C | C | — | — |
| View server list & metrics | — | R | R | R | R |
| Update server configuration (thresholds, labels) | — | U | U | — | — |
| Deregister / delete a server | — | D | D | — | — |

### 3.4 Monitored Resources — REST APIs

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Register a new API endpoint to monitor | — | C | C | — | — |
| View API endpoint list & metrics | — | R | R | R | R |
| Update API monitor configuration (interval, expected status) | — | U | U | — | — |
| Delete an API monitor | — | D | D | — | — |

### 3.5 AI Anomaly Detection / AI Insights

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| View AI Insights dashboard (detected anomalies) | — | R | R | R | R |
| Adjust anomaly sensitivity threshold for org | — | U | U | — | — |
| Mark an anomaly as reviewed / dismiss as false positive | — | U | U | U | — |

### 3.6 Alerts

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| View active/historical alerts | — | R | R | R | R |
| Configure alert rules (thresholds, recipients) | — | C/U | C/U | — | — |
| Acknowledge an alert | — | U | U | U | — |
| Resolve / close an alert | — | U | U | U | — |
| Delete alert history | — | D | — | — | — |

### 3.7 Notifications

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Receive email notifications | — | ✓ | ✓ | ✓ | Optional (configurable) |
| Receive in-app notifications | — | ✓ | ✓ | ✓ | ✓ |
| Configure own notification preferences | R/U | R/U | R/U | R/U | R/U |
| Configure org-wide notification defaults (e.g. default alert recipients) | — | U | — | — | — |

### 3.8 Dashboards

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| View org-wide monitoring dashboard | — | R | R | R | R |
| View platform-level dashboard (cross-org health, no org detail) | R | — | — | — | — |
| Customize/arrange own dashboard view (MVP: layout preferences) | — | U | U | U | U |

### 3.9 Reporting (CSV Export)

| Action | Super Admin | Org Admin | DevOps Engineer | Team Lead | Viewer |
|---|:---:|:---:|:---:|:---:|:---:|
| Export metrics as CSV | — | R | R | R | R |
| Export alert history as CSV | — | R | R | R | R |
| Export AI anomaly history as CSV | — | R | R | R | R |

---

## 4. Super Admin Scope Clarification

The Super Admin is a **platform-operator** role, not an "all-access" role within tenant data. This is a deliberate design choice for two reasons: it demonstrates a realistic SaaS operator model (platform staff should not casually browse customer data), and it keeps the multi-tenancy isolation guarantee (SRS FR-1.9) meaningful even for the highest-privileged role.

Super Admin capabilities are limited to:
- Viewing the list of organizations and each org's high-level health/status (e.g., active user count, resource count, current alert volume) — **not** the underlying metrics, logs, or alert details themselves
- Suspending or reactivating an organization at the account level (e.g., for abuse or non-payment in a real system)
- Viewing platform-level operational data (not covered elsewhere in this matrix; see future Non-Functional Requirements doc for platform observability)

If a future requirement needs Super Admin to access org-internal data for support purposes, this must be an explicit, audited "impersonation" or "support access" feature — not a default permission — and should be captured as a separate, deliberate requirement rather than folded into this matrix silently.

---

## 5. Enforcement Notes (for Architecture & API Spec)

- **Every** request must resolve to `(userId, orgId, role)` from the validated JWT before any authorization check runs.
- Authorization should be enforced as **middleware**, checking `(role, resource, action)` against this matrix — not scattered as inline `if` statements per route handler.
- All non-Super-Admin roles are implicitly scoped to `orgId = user.orgId`; this scoping is a precondition to permission checks, not a substitute for them.
- Frontend route/component gating should mirror this matrix but is a UX convenience only — the backend matrix is the actual security boundary (NFR-9).
- Any new feature added in Phase 2+ (Docker/K8s monitoring, ELK logs, failure prediction, alert prioritization, PDF/scheduled reports) must extend this matrix with new rows before implementation — this document should be treated as living and versioned alongside the SRS.

---

## 6. Summary Table — Permission Level by Role

| Role | Can Configure Resources | Can Manage Users | Can Manage Org Settings | Can Acknowledge/Resolve Alerts | Read Access to Org Data |
|---|:---:|:---:|:---:|:---:|:---:|
| Super Admin | No (platform-level only) | No (org-level users) | No (org-level settings) | No | No (org-internal) |
| Org Admin | Yes | Yes | Yes | Yes | Yes |
| DevOps Engineer | Yes | No | No | Yes | Yes |
| Team Lead | No | No | No | Yes | Yes |
| Viewer | No | No | No | No | Yes |
