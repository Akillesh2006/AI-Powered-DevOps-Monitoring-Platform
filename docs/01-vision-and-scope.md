# Vision & Scope Document
## AI-Powered DevOps Monitoring Platform

**Document Version:** 1.0
**Status:** MVP Baseline
**Last Updated:** 2026-07-11

---

## 1. Purpose

This document defines the vision, business context, and scope boundaries for the AI-Powered DevOps Monitoring Platform. It is the reference point for all downstream documents (SRS, Architecture, Data Model, API Spec, AI Design, Security Design) and for scope decisions made during implementation.

This is a portfolio project intended to demonstrate full-stack, cloud-native, DevOps, and AI integration skills through a realistic, enterprise-style SaaS product — not a production commercial offering.

---

## 2. Problem Statement

Organizations running distributed infrastructure (servers, containers, clusters, APIs) struggle to get a unified, real-time view of system health. Traditional monitoring tools generate large volumes of alerts with limited prioritization, and root cause analysis is manual and slow. This leads to:

- Delayed incident detection and response
- Alert fatigue from noisy, unprioritized notifications
- Fragmented visibility across infrastructure and application layers
- Reactive (rather than predictive) operations

## 3. Vision Statement

Build a unified, multi-tenant DevOps monitoring platform that gives engineering teams real-time visibility into their infrastructure and APIs, augmented with AI-driven anomaly detection, so that issues are surfaced early, intelligently prioritized, and easier to diagnose — reducing downtime and operational overhead.

## 4. Goals

| # | Goal |
|---|------|
| G1 | Provide a single dashboard for infrastructure and API health across an organization |
| G2 | Detect abnormal system behavior automatically using AI, without relying solely on static thresholds |
| G3 | Ensure strict data isolation between organizations (multi-tenant SaaS model) |
| G4 | Provide role-appropriate access and workflows for 5 distinct user roles |
| G5 | Deliver alerting and reporting that reduces time-to-detect and time-to-understand incidents |
| G6 | Demonstrate enterprise-grade architecture, security, and engineering practices suitable for a professional portfolio |

## 5. Non-Goals (Explicitly Out of Scope for the Project as a Whole)

- Competing commercially with Datadog/New Relic
- Supporting monitoring agents for operating systems other than Linux
- Building a custom time-series database (Prometheus is used instead)
- Payment processing / real billing integration (subscription tiers may be simulated, not charged)
- Mobile native applications

## 6. MVP Scope

The MVP is the first deliverable milestone. It must be a coherent, demoable product on its own — not a partial fragment of the full vision.

### 6.1 In Scope for MVP

- **Multi-tenant authentication & organization management**
  - Organization self-registration
  - JWT-based auth with refresh tokens, bcrypt password hashing
  - RBAC across all 5 roles (Super Admin, Org Admin, DevOps Engineer, Team Lead, Viewer)
- **Linux server monitoring**
  - CPU, memory, disk, network metrics via Prometheus node-exporter
  - Server health status (up/down/degraded)
- **REST API monitoring**
  - Uptime checks, response time, status code / error rate tracking for user-registered API endpoints
- **AI-powered anomaly detection**
  - Near-real-time (batch, every few minutes) anomaly scoring on server and API metrics
  - AI Insights view surfacing detected anomalies
- **Dashboards**
  - Real-time (polling/socket-driven) dashboard with CPU/memory graphs, server list, API health summary
- **Alerting**
  - Threshold-based and anomaly-based alerts
  - Email notifications
  - In-app notifications
  - Active alert management (acknowledge/resolve)
- **Reporting**
  - On-demand CSV export of metrics, alerts, and anomaly history

### 6.2 Explicitly Deferred to Phase 2+

| Feature | Reason for Deferral |
|---|---|
| Docker container monitoring | Adds agent/exporter complexity beyond core loop |
| Kubernetes cluster monitoring | Requires cluster provisioning; validated better once core platform proven |
| Centralized log management (ELK) | Separate ingestion/storage pipeline; independent of metrics/AI core |
| Failure prediction | Requires historical anomaly data the MVP itself will generate |
| Root cause suggestions | Depends on correlated logs + metrics (post-ELK) |
| Intelligent alert prioritization (AI-ranked) | Requires sufficient alert volume/history to be meaningful |
| PDF generation, scheduled reports | Additive; not required to prove core value |
| Full Super Admin cross-org console, full Team Lead workflows | Thin in MVP; expanded later |

## 7. Target Users / Personas

| Role | Description | Primary Needs |
|---|---|---|
| Super Admin | Platform owner (Anthropic-style "operator" of the SaaS itself) | Cross-org visibility, platform health, tenant management |
| Org Admin | Owns an organization's account | User management, billing/plan (simulated), org-wide settings |
| DevOps Engineer | Hands-on operator | Add/configure monitored resources, respond to alerts, view AI insights |
| Team Lead | Oversees a team's slice of infrastructure | Team-scoped dashboards, reports |
| Viewer | Read-only stakeholder | Dashboards and reports, no configuration rights |

## 8. Success Criteria (MVP)

- An organization can register, invite users with distinct roles, and see enforced permission differences between roles.
- A registered Linux server and REST API begin reporting live metrics within minutes of setup.
- Injected abnormal load/behavior on a monitored resource is detected as an anomaly without a manually-set static threshold.
- An alert generated from a threshold or anomaly triggers both an email and an in-app notification.
- A CSV report of metrics/alerts can be exported and matches dashboard data.
- No user can access another organization's data under any tested scenario.

## 9. Assumptions

- Local deployment via Docker Compose is sufficient for demonstration; Kubernetes deployment manifests are a documented artifact, not the primary runtime for MVP demos.
- Metric volume is at portfolio/demo scale (single-digit to low-dozens of monitored resources per org), not production SaaS scale — this bounds infrastructure and AI design decisions.
- "Real-time" dashboard means low-latency (seconds) via Socket.IO push, not sub-second streaming.

## 10. Constraints

- Preferred stack (React/Tailwind, Node/Express, Python/Scikit-learn, MongoDB, Prometheus/Grafana, Socket.IO, Docker/Kubernetes) is fixed per project requirements.
- Multi-tenancy isolation uses a shared-database, `orgId`-scoped model (not database-per-tenant), enforced at the service layer.
- Solo-developer project; documentation and architecture must be thorough enough to compensate for lack of a team review process.

## 11. Document Set Roadmap

1. Vision & Scope (this document)
2. Software Requirements Specification — MVP
3. User Roles & Permission Matrix
4. System Architecture Document
5. Data Model / ERD
6. API Specification
7. AI Module Design Document
8. Security Design Document
9. Non-Functional Requirements Document
10. Roadmap / Phase 2+ Backlog
