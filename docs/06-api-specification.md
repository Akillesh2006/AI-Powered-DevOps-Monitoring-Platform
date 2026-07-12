# REST API Specification
## AI-Powered DevOps Monitoring Platform — MVP

**Document Version:** 1.0
**Status:** MVP Baseline
**Related Documents:** 02-srs-mvp.md, 03-user-roles-permission-matrix.md, 04-system-architecture.md, 05-data-model-erd.md
**Base URL (local):** `http://localhost:5000/api/v1`

---

## 1. Conventions

### 1.1 Authentication
All endpoints except `POST /auth/register`, `POST /auth/login`, and `POST /auth/refresh` require a valid JWT access token:

```
Authorization: Bearer <accessToken>
```

The server derives `{ userId, orgId, role }` from this token on every request — clients never supply `orgId` for scoping purposes, per Data Model §6.2. Any `orgId`-like field a client sends in a request body is ignored for authorization purposes.

### 1.2 Authorization
Every endpoint below lists the roles permitted to call it, per the Permission Matrix (`03-user-roles-permission-matrix.md`). A request from a role not listed returns `403 Forbidden`.

### 1.3 Standard Response Envelope

**Success:**
```json
{
  "success": true,
  "data": { },
  "meta": { }
}
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "STRING_ERROR_CODE",
    "message": "Human-readable description",
    "details": []
  }
}
```

### 1.4 Standard HTTP Status Codes Used

| Code | Meaning |
|---|---|
| 200 | Success (GET, PUT/PATCH) |
| 201 | Resource created |
| 204 | Success, no content (DELETE) |
| 400 | Validation error |
| 401 | Missing/invalid/expired token |
| 403 | Authenticated but not authorized (RBAC / cross-org) |
| 404 | Resource not found (or not visible to this org — see §1.5) |
| 409 | Conflict (duplicate resource) |
| 422 | Semantically invalid request (e.g., bad enum value) |
| 429 | Rate limited |
| 500 | Internal server error |

### 1.5 Cross-Tenant Access Behavior
If a user requests a resource by ID that exists but belongs to a **different** organization, the API returns `404 Not Found` — **not** `403 Forbidden`. This intentionally avoids confirming the resource's existence to a user outside its tenant (standard practice for tenant isolation; a 403 would leak the fact that the ID is valid).

### 1.6 Pagination

List endpoints support:
```
?page=1&limit=25&sort=-createdAt
```

Response `meta`:
```json
{
  "page": 1,
  "limit": 25,
  "total": 143,
  "totalPages": 6
}
```

### 1.7 Common Error Codes

| Code | Meaning |
|---|---|
| `VALIDATION_ERROR` | Request body/params failed validation |
| `UNAUTHORIZED` | Missing/invalid/expired token |
| `FORBIDDEN` | Role not permitted for this action |
| `NOT_FOUND` | Resource not found or not in caller's org |
| `DUPLICATE_RESOURCE` | Unique constraint violation |
| `RATE_LIMITED` | Too many requests |
| `INTERNAL_ERROR` | Unexpected server error |

---

## 2. Auth Module

### 2.1 `POST /auth/register`
Registers a new organization with an initial Org Admin. **No auth required.**

**Request:**
```json
{
  "organizationName": "Acme Corp",
  "adminEmail": "admin@acme.com",
  "adminPassword": "StrongPassword123!"
}
```

**Validation:**
- `organizationName`: required, 2–100 chars
- `adminEmail`: required, valid email, unique
- `adminPassword`: required, min 8 chars, must include upper, lower, number

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "organization": { "id": "org_123", "name": "Acme Corp", "slug": "acme-corp" },
    "user": { "id": "usr_123", "email": "admin@acme.com", "role": "org_admin" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:** `409 DUPLICATE_RESOURCE` (email already registered), `400 VALIDATION_ERROR`

---

### 2.2 `POST /auth/login`
**No auth required.**

**Request:**
```json
{ "email": "admin@acme.com", "password": "StrongPassword123!" }
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "user": { "id": "usr_123", "email": "admin@acme.com", "role": "org_admin", "orgId": "org_123" },
    "accessToken": "eyJ...",
    "refreshToken": "eyJ..."
  }
}
```

**Errors:** `401 UNAUTHORIZED` (invalid credentials — same error for wrong password vs. unknown email, to avoid user enumeration)

---

### 2.3 `POST /auth/refresh`
**No auth header required; refresh token sent in body or httpOnly cookie.**

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response `200`:**
```json
{ "success": true, "data": { "accessToken": "eyJ...", "refreshToken": "eyJ..." } }
```

**Errors:** `401 UNAUTHORIZED` (expired/revoked/invalid refresh token)

**Notes:** Implements refresh token rotation — old refresh token is revoked and a new one issued on each use, limiting replay window.

---

### 2.4 `POST /auth/logout`
**Auth required. All roles.**

**Request:**
```json
{ "refreshToken": "eyJ..." }
```

**Response `204`:** No content. Revokes the given refresh token.

---

## 3. Organization Module

### 3.1 `GET /organizations/me`
Returns the caller's own organization. **Roles:** all (org-scoped roles).

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "org_123",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "plan": "free",
    "notificationDefaults": { "alertEmailRecipients": ["ops@acme.com"] },
    "createdAt": "2026-06-01T00:00:00Z"
  }
}
```

### 3.2 `PUT /organizations/me`
Updates org settings. **Roles:** org_admin.

**Request:**
```json
{ "name": "Acme Corporation", "notificationDefaults": { "alertEmailRecipients": ["ops@acme.com", "cto@acme.com"] } }
```

**Response `200`:** Updated organization object.
**Errors:** `403 FORBIDDEN` if caller is not org_admin.

### 3.3 `GET /platform/organizations`
Platform-level list of all orgs, high-level only. **Roles:** super_admin only.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "id": "org_123", "name": "Acme Corp", "userCount": 6, "resourceCount": 14, "activeAlertCount": 2, "isActive": true }
  ],
  "meta": { "page": 1, "limit": 25, "total": 8, "totalPages": 1 }
}
```

Per Permission Matrix §4, this endpoint returns aggregate counts only — never underlying servers/alerts/anomalies documents.

---

## 4. User Module

### 4.1 `GET /users`
List users in caller's org. **Roles:** org_admin, devops_engineer, team_lead.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "id": "usr_123", "email": "admin@acme.com", "role": "org_admin", "isActive": true }
  ],
  "meta": { "page": 1, "limit": 25, "total": 6, "totalPages": 1 }
}
```

### 4.2 `POST /users/invite`
Invites a new user to caller's org. **Roles:** org_admin.

**Request:**
```json
{ "email": "engineer@acme.com", "role": "devops_engineer" }
```

**Validation:** `role` must be one of `org_admin, devops_engineer, team_lead, viewer` (org_admin cannot invite a `super_admin`).

**Response `201`:**
```json
{ "success": true, "data": { "id": "usr_456", "email": "engineer@acme.com", "role": "devops_engineer", "status": "invited" } }
```

**Errors:** `409 DUPLICATE_RESOURCE`, `422` (invalid role value)

### 4.3 `PATCH /users/:id/role`
Change a user's role. **Roles:** org_admin.

**Request:**
```json
{ "role": "team_lead" }
```

**Response `200`:** Updated user object.
**Errors:** `404 NOT_FOUND` (user not in caller's org), `400` (cannot change own role away from org_admin if last remaining admin — business rule)

### 4.4 `DELETE /users/:id`
Deactivate/remove a user from the org. **Roles:** org_admin.

**Response `204`:** No content.

### 4.5 `GET /users/me`
Caller's own profile. **Roles:** all.

### 4.6 `PATCH /users/me`
Update own profile (name, password). **Roles:** all.

**Request:**
```json
{ "currentPassword": "old...", "newPassword": "New$trongPass1" }
```

**Errors:** `400 VALIDATION_ERROR` (weak password), `401` (currentPassword incorrect)

---

## 5. Server Monitoring Module

### 5.1 `POST /servers`
Register a Linux server. **Roles:** org_admin, devops_engineer.

**Request:**
```json
{
  "name": "prod-web-01",
  "hostAddress": "10.0.1.15",
  "exporterPort": 9100,
  "labels": ["production", "web"]
}
```

**Validation:**
- `name`: required, 2–100 chars
- `hostAddress`: required, valid IPv4/hostname
- `exporterPort`: optional int, default 9100
- Uniqueness: `(orgId, hostAddress)` must be unique — `409 DUPLICATE_RESOURCE` otherwise

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "srv_789",
    "name": "prod-web-01",
    "hostAddress": "10.0.1.15",
    "exporterPort": 9100,
    "status": "unknown",
    "labels": ["production", "web"],
    "createdAt": "2026-07-11T10:00:00Z"
  }
}
```

### 5.2 `GET /servers`
List servers in caller's org, with current status. **Roles:** all.

**Query params:** `?status=healthy|degraded|down|unknown`

**Response `200`:** array of server objects (as above) + `meta` pagination.

### 5.3 `GET /servers/:id`
Server detail. **Roles:** all.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "srv_789",
    "name": "prod-web-01",
    "hostAddress": "10.0.1.15",
    "status": "healthy",
    "currentMetrics": { "cpuPercent": 34.2, "memoryPercent": 61.5, "diskPercent": 40.1 }
  }
}
```

### 5.4 `GET /servers/:id/metrics`
Historical metrics (proxied/aggregated from Prometheus). **Roles:** all.

**Query params:** `?metric=cpu_utilization&from=2026-07-10T00:00:00Z&to=2026-07-11T00:00:00Z&step=60s`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "metric": "cpu_utilization",
    "series": [
      { "timestamp": "2026-07-11T09:00:00Z", "value": 32.1 },
      { "timestamp": "2026-07-11T09:01:00Z", "value": 33.8 }
    ]
  }
}
```

### 5.5 `PUT /servers/:id`
Update server config (name, labels, exporterPort). **Roles:** org_admin, devops_engineer.

### 5.6 `DELETE /servers/:id`
Deregister a server. **Roles:** org_admin, devops_engineer.

**Response `204`:** No content. Also cascades: disables associated `alertRules`, does not delete historical `alerts`/`anomalies` (retained for audit/report history).

---

## 6. API Monitoring Module

### 6.1 `POST /api-monitors`
Register a REST API to monitor. **Roles:** org_admin, devops_engineer.

**Request:**
```json
{
  "name": "Payments API Health",
  "url": "https://api.acme.com/health",
  "method": "GET",
  "expectedStatus": 200,
  "checkIntervalSeconds": 60
}
```

**Validation:**
- `url`: required, valid URL, must be `https://` or `http://`
- `checkIntervalSeconds`: min 15, max 3600
- Uniqueness: `(orgId, url)` unique

**Response `201`:** created object (mirrors request + `id`, `status: "unknown"`, `createdAt`).

### 6.2 `GET /api-monitors`
List API monitors in caller's org. **Roles:** all.

### 6.3 `GET /api-monitors/:id`
Detail, including current uptime %. **Roles:** all.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "api_321",
    "name": "Payments API Health",
    "url": "https://api.acme.com/health",
    "status": "up",
    "uptimePercent24h": 99.8,
    "avgResponseTimeMs": 142,
    "errorRate24h": 0.002
  }
}
```

### 6.4 `GET /api-monitors/:id/metrics`
Historical response time / status code history. **Roles:** all. Same query param pattern as §5.4.

### 6.5 `PUT /api-monitors/:id`
Update config. **Roles:** org_admin, devops_engineer.

### 6.6 `DELETE /api-monitors/:id`
**Roles:** org_admin, devops_engineer. Same cascade behavior as §5.6.

---

## 7. Alert Rules Module

### 7.1 `POST /alert-rules`
**Roles:** org_admin, devops_engineer.

**Request:**
```json
{
  "resourceType": "server",
  "resourceId": "srv_789",
  "metric": "cpu_utilization",
  "condition": "gte",
  "thresholdValue": 90
}
```

**Validation:**
- `resourceType`: enum `server` | `apiMonitor`
- `resourceId`: must exist and belong to caller's org (`404` otherwise)
- `metric`: must be valid for the given `resourceType` (e.g. `error_rate` invalid for `server`) → `422`
- `condition`: enum `gt|gte|lt|lte`

**Response `201`:** created rule object.

### 7.2 `GET /alert-rules`
List rules, filterable by `resourceType`/`resourceId`. **Roles:** all (read).

### 7.3 `PUT /alert-rules/:id`
**Roles:** org_admin, devops_engineer.

### 7.4 `DELETE /alert-rules/:id`
**Roles:** org_admin, devops_engineer.

---

## 8. Alerts Module

### 8.1 `GET /alerts`
List alerts for caller's org. **Roles:** all.

**Query params:** `?status=open|acknowledged|resolved&severity=low|medium|high|critical&resourceType=server|apiMonitor`

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "alt_555",
      "resourceType": "server",
      "resourceId": "srv_789",
      "resourceName": "prod-web-01",
      "source": "threshold",
      "severity": "high",
      "status": "open",
      "message": "CPU utilization 94% exceeds threshold 90%",
      "createdAt": "2026-07-11T10:15:00Z"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 3, "totalPages": 1 }
}
```

### 8.2 `GET /alerts/:id`
Alert detail. **Roles:** all.

### 8.3 `PATCH /alerts/:id/acknowledge`
**Roles:** org_admin, devops_engineer, team_lead.

**Response `200`:**
```json
{ "success": true, "data": { "id": "alt_555", "status": "acknowledged", "acknowledgedBy": "usr_123", "acknowledgedAt": "2026-07-11T10:20:00Z" } }
```

**Errors:** `409` if alert already resolved.

### 8.4 `PATCH /alerts/:id/resolve`
**Roles:** org_admin, devops_engineer, team_lead.

**Response `200`:** alert object with `status: "resolved"`, `resolvedBy`, `resolvedAt`.

### 8.5 `DELETE /alerts/:id`
Delete alert history (hard delete, admin cleanup only). **Roles:** org_admin.

---

## 9. AI Insights (Anomalies) Module

### 9.1 `GET /anomalies`
List AI-detected anomalies for caller's org. **Roles:** all.

**Query params:** `?resourceType=server|apiMonitor&resourceId=...&reviewed=true|false&from=...&to=...`

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "anm_901",
      "resourceType": "server",
      "resourceId": "srv_789",
      "resourceName": "prod-web-01",
      "anomalyScore": 0.87,
      "metric": "memory_utilization",
      "windowStart": "2026-07-11T10:00:00Z",
      "windowEnd": "2026-07-11T10:05:00Z",
      "reviewed": false,
      "alertId": "alt_555",
      "detectedAt": "2026-07-11T10:05:30Z"
    }
  ],
  "meta": { "page": 1, "limit": 25, "total": 12, "totalPages": 1 }
}
```

### 9.2 `GET /anomalies/:id`
Anomaly detail, including full `metricSnapshot`. **Roles:** all.

### 9.3 `PATCH /anomalies/:id/review`
Mark as reviewed / dismiss as false positive. **Roles:** org_admin, devops_engineer, team_lead.

**Request:**
```json
{ "reviewed": true, "note": "Expected spike during deploy window" }
```

### 9.4 `PUT /organizations/me/ai-settings`
Adjust anomaly sensitivity threshold for the org. **Roles:** org_admin, devops_engineer.

**Request:**
```json
{ "anomalySensitivity": 0.75 }
```

**Validation:** `anomalySensitivity` between 0 and 1 (higher = fewer, more confident alerts).

---

## 10. Notifications Module

### 10.1 `GET /notifications`
Caller's own in-app notifications. **Roles:** all.

**Query params:** `?read=true|false`

**Response `200`:**
```json
{
  "success": true,
  "data": [
    { "id": "ntf_111", "type": "alert_created", "message": "New high-severity alert on prod-web-01", "read": false, "createdAt": "2026-07-11T10:15:05Z" }
  ]
}
```

### 10.2 `PATCH /notifications/:id/read`
**Roles:** all (own notifications only — enforced via `userId` match, not just `orgId`).

### 10.3 `PATCH /notifications/read-all`
Marks all of caller's notifications as read. **Roles:** all.

### 10.4 `PATCH /users/me/notification-preferences`
**Roles:** all.

**Request:**
```json
{ "emailEnabled": true, "inAppEnabled": true }
```

---

## 11. Reporting Module

### 11.1 `GET /reports/export`
Generates and streams a CSV export. **Roles:** all (read).

**Query params:**
```
?type=metrics|alerts|anomalies&from=2026-07-01T00:00:00Z&to=2026-07-11T00:00:00Z&resourceType=server&resourceId=srv_789
```

**Validation:**
- `type`: required, enum `metrics|alerts|anomalies`
- `from`/`to`: required, ISO 8601, `to` must be after `from`, range capped at 90 days for MVP

**Response `200`:** `Content-Type: text/csv`, streamed file with `Content-Disposition: attachment; filename="alerts-2026-07-01-to-2026-07-11.csv"`

A corresponding entry is written to `reportExports` for audit purposes (per Data Model §4.10), but not surfaced as a separate retrievable endpoint in MVP.

**Errors:** `400 VALIDATION_ERROR` (range too large, invalid type), `404` (resourceId not found in caller's org)

---

## 12. Real-Time Events (Socket.IO — Not REST, Documented for Completeness)

Not part of the REST surface, but consumed the same way by the frontend and governed by the same auth/org-scoping rules (Architecture §4.7).

**Connection:** client connects with `Authorization` header or `token` query param carrying the JWT; server validates and joins the socket to room `org:{orgId}`.

**Server → Client events:**

| Event | Payload | Trigger |
|---|---|---|
| `metric:update` | `{ resourceType, resourceId, metric, value, timestamp }` | New metric sample available |
| `alert:created` | Alert object (§8.1 shape) | New alert generated |
| `alert:updated` | Alert object | Status change (ack/resolve) |
| `anomaly:detected` | Anomaly object (§9.1 shape) | New anomaly persisted |
| `notification:new` | Notification object (§10.1 shape) | New notification for connected user |

---

## 13. Rate Limiting (MVP baseline)

| Scope | Limit |
|---|---|
| `/auth/login` | 5 requests / minute / IP |
| `/auth/register` | 3 requests / minute / IP |
| All other authenticated endpoints | 100 requests / minute / user |

Exceeding a limit returns `429` with `error.code = "RATE_LIMITED"` and a `Retry-After` header.

---

## 14. Traceability to Permission Matrix

Every endpoint's **Roles** line above is drawn directly from `03-user-roles-permission-matrix.md`. If the matrix changes, this document's role annotations must be updated in the same change — they are not independently maintained. RBAC middleware implementation should ideally load its rule set from a single shared source (e.g., a permissions config file) referenced by both documentation generation and runtime enforcement, to prevent drift between this spec and actual behavior.
