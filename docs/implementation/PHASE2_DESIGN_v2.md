# Phase 2 Software Design (Revised — based on actual repository analysis)
## AI-Powered DevOps Monitoring Platform

**Source repo analyzed:** `Akillesh2006/AI-Powered-DevOps-Monitoring-Platform`
**This supersedes my earlier draft**, which was written before I had access to the code. Field/route/file names below are copied verbatim from your repo.

**Your roadmap (as you defined it):**
Phase 1 Auth (done) → **Phase 2 Enterprise Backend (this doc)** → Phase 3 Monitoring Engine → Phase 4 AI Analytics → Phase 5 Frontend → Phase 6 Deployment/K8s.

---

## 1. What Phase 1 actually already contains (do not rebuild)

Your Phase 1 is materially stronger than a typical auth-only MVP:

- **RBAC**: 5 roles (`super_admin`, `org_admin`, `devops_engineer`, `team_lead`, `viewer`) with a default-deny, config-driven permission matrix (`config/permissions.js` + `hasPermission()`), enforced via `middleware/authorize.js`, already wired on every route including forward-looking resources (`servers`, `api_monitors`, `ai_insights`, `alerts`, `dashboards`, `reports`) for future phases.
- **Tenancy**: `data/scopedQuery.js` — a mandatory data-access wrapper (`scopedFind`, `scopedFindOne`, `scopedCreate`, `scopedUpdateOne/Many`, `scopedDeleteOne/Many`) that force-injects `orgId` into every query. The file header itself declares any unwrapped query a "critical security code-review flag." This is already excellent and I will extend it, not replace it.
- **User management**: `GET /users` (paginated), `POST /users/invite`, `PATCH /users/:id/role`, `DELETE /users/:id` (currently **hard** delete), `GET/PATCH /users/me` (profile + password change).
- **Org management**: `GET/PUT /organizations/me` (name, plan, `notificationDefaults`).
- **Platform (super_admin)**: `GET /platform/organizations`.
- **Response envelope**: every controller already hand-writes `{ success, data/error, meta }` consistently — it's a convention, not yet a shared utility.
- **Auth**: JWT access + rotating refresh tokens with reuse detection, rate limiting on `/auth/login` and `/auth/register` (hand-rolled, in-memory), bcrypt hashing, timing-safe login (dummy-hash comparison for non-existent users).
- **Indexes**: `User` has `{orgId,email}` unique + `{orgId,role}`; `Organization` has `{slug}` unique + `{isActive}`; `RefreshToken` has `{tokenHash}` unique + `{userId,revoked}` + TTL index on `expiresAt`. This is already solid — Phase 2 adds indexes only for new collections and validates the rest.
- **Tests**: `node --test`, no Jest/Supertest — integration tests use hand-rolled in-memory mock Mongoose models (see `tests/integration/users.management.test.js`). **Phase 2 tasks must follow this exact same test style**, not introduce Jest/Supertest.

## 2. Real gaps (this is what Phase 2 actually needs to fill)

| Gap | Evidence |
|---|---|
| **No global error-handling middleware** | `app.js` has no `(err,req,res,next)` handler. Every controller calls `next(err)` on unexpected errors, which currently falls through to Express's default handler (HTML/stack trace leak, breaks the `{success:false}` contract). This is a real, live bug. |
| **No shared response utility** | The `{success,data,error,meta}` shape is duplicated by hand in every controller — error-prone, not enforced. |
| **No request validation library** | Validation is hand-written per controller (regex, manual `errors.push(...)`). Works, but not reusable/consistent. |
| **`DELETE /users/:id` hard-deletes** | `users.controller.js` → `scopedDeleteOne`. No audit trail of who existed. |
| **No audit log / activity log at all** | Confirmed via repo-wide search — not in code, not in any design doc. |
| **No search/filter on `GET /users`** | Only `page`/`limit` supported. |
| **No single-user fetch (`GET /users/:id`)** | Only list + self exist. |
| **No API docs** | No Swagger/OpenAPI anywhere. |
| **No security headers/CORS/mongo-sanitize** | `app.js` only has `express.json()`. Your own docs defer this to "Phase 13," but you've asked to bring it forward — that's fine, it's purely additive. |
| **No API versioning** | Routes are unprefixed (`/auth`, `/users`, ...). Adding a version prefix without breaking existing paths needs care (see Task 19). |
| **No exposed "what can I do" endpoint** | Frontend (Phase 5) will need to know the caller's permission set to render UI conditionally; `hasPermission()` exists server-side but nothing surfaces it. |

## 3. Explicit non-goals for Phase 2

- No Prometheus/agents/metrics ingestion (Phase 3).
- No AI/ML services (Phase 4).
- No React frontend (Phase 5).
- No Kubernetes/deployment work (Phase 6).
- No redesign of RBAC's shape (role enum + static permission matrix stays — it's good, and changing it to a DB-driven custom-role system now would be premature and is not what you asked for).
- No change to the invite-as-direct-provisioning flow's core mechanism (still creates an active user immediately) — only its validation/response/audit wrapper improves. A full token-based invite-and-accept email workflow is out of scope unless you want it added back in.

---

## 4. Architecture Changes

New cross-cutting layers, all additive to the existing request pipeline (`authenticate` → `authorize` → controller):

```
authenticate (existing)
  → authorize (existing)
  → validate (NEW — schema check before controller runs)
  → controller (existing controllers extended, not replaced)
      → scopedQuery.js (existing, extended with soft-delete-aware + audit-aware helpers)
      → auditLogger service (NEW — fire-and-forget, never blocks the response)
  → apiResponse helper (NEW — controllers migrate to use this instead of hand-written JSON)
  → errorHandler middleware (NEW — last middleware in app.js, catches everything from next(err))
```

Security middleware (`helmet`, `cors`, `express-mongo-sanitize`) is added globally in `app.js`, ahead of routes, alongside the existing `express.json()`.

---

## 5. Database Changes

### 5.1 New collections

**`auditlogs`** — immutable, admin-facing security trail
```js
{
  _id,
  orgId,                  // matches existing field name convention (not organizationId)
  actorUserId,
  action,                  // "user.role_changed", "user.deleted", "org.updated", "invite.created"
  targetType, targetId,
  metadata: Object,        // e.g. { fromRole, toRole }
  createdAt
}
```
Index: `{ orgId: 1, createdAt: -1 }`

**`activitylogs`** — lighter, user-facing recent-activity feed
```js
{ _id, orgId, userId, action, description, createdAt }
```
Index: `{ orgId: 1, userId: 1, createdAt: -1 }`

### 5.2 Modified collections

**`User`** (`models/User.js`) — add:
```js
isDeleted: { type: Boolean, default: false },
deletedAt: { type: Date, default: null }
```
Note: `isActive` already exists and is used for account suspension — that's a distinct, existing concept from soft-delete and is untouched.

**`Organization`** — no schema change required (already has `isActive`; soft-delete of an org is out of scope for Phase 2 unless you want it — not in your listed requirements).

### 5.3 `scopedQuery.js` extension (additive functions, existing ones untouched)

- `scopedSoftDeleteOne(Model, context, filter)` — sets `isDeleted:true, deletedAt:now` instead of removing the document. Used to replace the internals of `deleteUser` only (see Task 8).
- `scopedFind`/`scopedFindOne` gain a default `isDeleted:{$ne:true}` filter, overridable via an explicit `{ includeDeleted: true }` option — this is the one change that touches shared, already-used code, so it ships with a full re-run of the existing Phase 1 test suite as its acceptance gate (Task 9).

### 5.4 Index additions

| Collection | Index | Reason |
|---|---|---|
| auditlogs | `{ orgId: 1, createdAt: -1 }` | timeline queries |
| activitylogs | `{ orgId: 1, userId: 1, createdAt: -1 }` | feed queries |
| User | `{ orgId: 1, isDeleted: 1 }` | list-query performance once soft delete ships |

Existing indexes (`User {orgId,email}`, `{orgId,role}`; `Organization {slug}`, `{isActive}`; `RefreshToken` TTL) are reviewed with `.explain()` in Task 18 but are not expected to need changes.

---

## 6. Folder Changes

```
backend/src/
├── middleware/
│   ├── authenticate.js          (existing, unchanged)
│   ├── authorize.js             (existing, unchanged)
│   ├── rateLimiter.js           (existing, unchanged)
│   ├── validate.js              [NEW]
│   ├── errorHandler.js          [NEW]
│   └── security.js              [NEW] (wraps helmet/cors/sanitize setup)
├── models/
│   ├── User.js                  (extended: isDeleted, deletedAt)
│   ├── Organization.js          (unchanged)
│   ├── RefreshToken.js          (unchanged)
│   ├── AuditLog.js              [NEW]
│   └── ActivityLog.js           [NEW]
├── controllers/
│   ├── users.controller.js      (extended: getUser, list filters/search, soft delete)
│   ├── organizations.controller.js (unchanged logic, response helper only)
│   ├── platform.controller.js   (unchanged logic, response helper only)
│   ├── auditLogs.controller.js  [NEW]
│   ├── activityLogs.controller.js [NEW]
│   └── permissions.controller.js [NEW] ("what can I do" endpoint)
├── routes/
│   ├── auditLogs.routes.js      [NEW]
│   ├── activityLogs.routes.js   [NEW]
│   └── permissions.routes.js    [NEW]
├── services/
│   ├── refreshTokenService.js   (existing, unchanged)
│   └── auditLogger.service.js   [NEW]
├── validators/                  [NEW]
│   ├── users.validators.js
│   └── organizations.validators.js
├── utils/
│   ├── jwt.js, password.js      (existing, unchanged)
│   ├── apiResponse.js           [NEW]
│   ├── apiError.js              [NEW]
│   └── queryHelpers.js          [NEW] (filter/search param parsing, shared by users/audit/activity lists)
├── data/
│   └── scopedQuery.js           (extended: scopedSoftDeleteOne, soft-delete-aware find)
├── config/
│   └── permissions.js           (unchanged)
└── docs/
    └── openapi.yaml             [NEW]
```

---

## 7. API Changes

All new/changed routes, using your existing unprefixed style plus an additive versioned mount (Task 19):

| Method | Route | Status |
|---|---|---|
| GET | `/users/:id` | **NEW** — single user fetch, `authorize('users','list')` |
| GET | `/users?search=&role=&isActive=&page=&limit=` | **EXTENDED** — adds search/filter to existing pagination |
| DELETE | `/users/:id` | **BEHAVIOR CHANGE** — soft delete instead of hard delete; same route, same 204, same business rules (last-admin protection unchanged) |
| GET | `/audit-logs?page=&limit=` | **NEW** — `authorize('audit','read')` (new resource added to permission matrix, org_admin + super_admin only) |
| GET | `/activity-logs?page=&limit=` | **NEW** — any authenticated org member, own-org scoped |
| GET | `/permissions/me` | **NEW** — returns the caller's resolved permission set from `hasPermission`/`config/permissions.js` |
| GET | `/docs` | **NEW** — Swagger UI |
| * | `/api/v1/*` | **NEW** — additive alias mount of all existing routers; legacy unprefixed paths keep working unchanged |

**Response envelope** — formalizes what's already the de facto convention:
```json
{ "success": true, "data": {}, "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 }, "error": null }
```
No breaking change to existing response shapes — this is what your controllers already output.

---

## 8. Milestone Breakdown

| # | Milestone | Why this order |
|---|---|---|
| M1 | Response/Error Foundation | Everything else should be built on top of a real error handler — fixes the live gap first |
| M2 | Validation Layer | Needed before adding new mutating endpoints (audit/activity list filters, user search) |
| M3 | User Management Completion | Fills concrete gaps (`GET /:id`, search/filter) on the existing, most-used resource |
| M4 | Soft Delete | Touches shared `scopedQuery.js` — done in isolation with a full regression gate, after the safer wins above |
| M5 | Audit Logging | Depends on soft delete existing (delete is one of the actions logged) |
| M6 | Activity Logs | Reuses M5's service/pattern |
| M7 | Permission Visibility | Small, standalone — surfaces existing `hasPermission` data |
| M8 | Security Hardening | Global middleware, independent of the above, done once the request pipeline shape (validation/error handler) is stable |
| M9 | API Documentation | Documents everything built in M1–M8 |
| M10 | DB Review & Versioning | Closing milestone: index verification + additive API versioning |

---

## 9. Task Breakdown

Every task: Node's built-in `node --test` style (matching `tests/integration/*.test.js` conventions — hand-rolled mock models, no Supertest/Jest), Postman-testable, 30–90 min, explicit rollback.

### Milestone 1 — Response/Error Foundation

**Task 1: `utils/apiError.js` + `utils/apiResponse.js`**
- `ApiError` class (`statusCode`, `code`, `message`, `details`); `success(res, data, meta, statusCode=200)` and `fail(res, err)` helpers matching the *exact* existing envelope shape (`{success,data,meta}` / `{success,error:{code,message,details}}`).
- No controller is touched yet — this task only creates the utility and a unit test proving its output matches the existing hand-written shape byte-for-byte.
- **Acceptance:** unit test asserts `success()` output deep-equals what `getMyOrganization` currently hand-writes for an equivalent payload.
- **Rollback:** delete the two files; nothing depends on them yet.

**Task 2: Global Error Handler**
- `middleware/errorHandler.js`, registered last in `app.js`. Catches anything reaching `next(err)`, returns `{success:false,error:{code:'INTERNAL_ERROR',message,details:[]}}` with status 500 (or `err.statusCode` if it's an `ApiError`).
- **Acceptance:** hitting a route that triggers an unexpected throw (e.g., temporarily disconnect Mongo, or a malformed ObjectId path not currently guarded) returns structured JSON, not an HTML stack trace.
- **Postman test:** POST `/organizations/me` with a body that causes a Mongoose validation throw not already handled → confirm JSON error, not HTML.
- **Rollback:** remove the one `app.use()` line in `app.js`.

**Task 3: Migrate `auth.controller.js` and `organizations.controller.js` to `apiResponse`/`apiError`**
- Swap hand-written JSON blocks for the Task 1 helpers. Pure refactor — no behavioral change.
- **Acceptance:** full existing Phase 1 Postman collection and `npm test` all pass unchanged.
- **Postman test:** re-run the entire existing collection.
- **Rollback:** `git checkout` the two files.

### Milestone 2 — Validation Layer

**Task 4: Add Joi + `middleware/validate.js`**
- `validate(schema)` middleware validating `body`/`query`/`params`; on failure throws `ApiError(422, 'VALIDATION_ERROR', ...)` (caught by Task 2's handler).
- **Acceptance:** a throwaway test route with a Joi schema rejects a malformed payload with 422 and the standard envelope.
- **Rollback:** remove test route; Joi dependency stays (harmless).

**Task 5: `validators/organizations.validators.js` applied to `PUT /organizations/me`**
- Replaces the manual `errors.push(...)` block in `updateMyOrganization` with a Joi schema via Task 4's middleware. Same validation rules, same error messages where feasible.
- **Acceptance:** existing organization-update tests still pass; malformed `notificationDefaults.alertEmailRecipients` still rejected, now via the shared layer.
- **Postman test:** re-run existing org-update Postman tests (valid + invalid payloads).
- **Rollback:** revert `organizations.controller.js`, delete validator file.

### Milestone 3 — User Management Completion

**Task 6: `GET /users/:id`**
- New controller fn `getUser` using `scopedFindOne`; `authorize('users','list')` (reuses existing permission — no new permission-matrix entry needed since it's the same access level as listing).
- **Acceptance:** returns 404 for a user in a different org (tenant isolation test, mirroring the existing pattern in `tenantIsolation.phase1.test.js`); 200 with same shape as list-item for a valid same-org id.
- **Postman test:** GET as org_admin for an in-org user → 200; GET with another org's token for that same id → 404.
- **Rollback:** remove route + controller export.

**Task 7: Search & Filter on `GET /users`**
- `utils/queryHelpers.js` → `parseListParams(query, { filterable: ['role','isActive'], searchable: ['email','name'] })`, applied in `getUsers`. Search does case-insensitive regex on `email`/`name` (small collections at this stage — safe without a text index).
- **Acceptance:** `?role=viewer` returns only viewers; `?search=jane` matches partial name/email; combining both plus pagination works together; existing no-param behavior unchanged (regression check against `users.management.test.js`).
- **Postman test:** GET `/users?role=viewer`, GET `/users?search=jane`, GET `/users?role=viewer&search=jane&page=1&limit=5`.
- **Rollback:** revert `getUsers` to prior version; delete `queryHelpers.js` (Task 12 also depends on it — remove together if rolling back).

### Milestone 4 — Soft Delete

**Task 8: `User` schema fields + `scopedSoftDeleteOne`**
- Add `isDeleted`/`deletedAt` to `models/User.js`. Add `scopedSoftDeleteOne` to `scopedQuery.js` (new function, existing ones untouched in this task).
- **Acceptance:** unit test calling `scopedSoftDeleteOne` on a mock/in-memory user sets the two fields correctly and does not remove the document.
- **Rollback:** revert both files; nothing else references the new function yet.

**Task 9: Rewire `deleteUser` to Soft Delete + Default-Exclude in Reads**
- `deleteUser` now calls `scopedSoftDeleteOne` instead of `scopedDeleteOne`. `scopedFind`/`scopedFindOne` gain the default `isDeleted:{$ne:true}` filter (overridable via an options flag for future admin "show deleted" views).
- **This is the one task that touches a shared, already-relied-upon file (`scopedQuery.js`) beyond pure addition — treat it as higher-risk.**
- **Acceptance:** (1) `DELETE /users/:id` still returns 204 and enforces the existing last-admin business rule unchanged; (2) deleted users vanish from `GET /users` and `GET /users/:id`; (3) **full existing Phase 1 test suite (`npm test`) passes unmodified** — this is the hard gate before merging; (4) a deleted user cannot log in (add one check in `auth.controller.js`'s `login` alongside the existing `isActive` check, or confirm `isActive` already covers it — needs explicit verification since these are now two different flags).
- **Postman test:** delete a user → confirm absent from list/detail → attempt login as that user → 401/403.
- **Rollback:** revert `scopedQuery.js` and `users.controller.js`; run full test suite to confirm clean revert.

### Milestone 5 — Audit Logging

**Task 10: `AuditLog` model + `services/auditLogger.service.js`**
- `logAudit({ orgId, actorUserId, action, targetType, targetId, metadata })` — fire-and-forget, wrapped in try/catch so a logging failure never fails the parent request.
- **Acceptance:** unit test — calling the service writes a correctly-shaped document (using the same mock-model pattern as existing tests).
- **Rollback:** delete files; unused elsewhere yet.

**Task 11: Wire Audit Logging into Role Changes, Deletes, Org Updates, Invites**
- Add `logAudit(...)` calls at the four existing mutation points (`updateUserRole`, `deleteUser`, `updateMyOrganization`, `inviteUser`). Add `audit:['read']` to `org_admin`/`super_admin` in `config/permissions.js`.
- **Acceptance:** performing each action produces exactly one audit entry with correct actor/target/org scoping; the parent action's response/status is unaffected even if logging is artificially made to throw (test this explicitly).
- **Postman test:** PATCH a user's role → later confirm via Task 12's endpoint that an entry exists.
- **Rollback:** remove the four call sites; core actions keep working.

**Task 12: `GET /audit-logs`**
- Paginated, org-scoped, newest-first; `authorize('audit','read')`.
- **Acceptance:** `viewer`/`devops_engineer`/`team_lead` get 403; `org_admin` sees only their org's entries.
- **Postman test:** GET as viewer → 403; GET as org_admin → 200 with entries from Task 11.
- **Rollback:** remove route + controller.

### Milestone 6 — Activity Logs

**Task 13: `ActivityLog` model + Wire into Login and Self-Profile Update**
- Lighter-weight, same fire-and-forget pattern; captures `user.login` and `user.profile_updated`.
- **Acceptance:** logging in and updating `/users/me` each produce one activity entry.
- **Rollback:** revert the two call sites; delete model.

**Task 14: `GET /activity-logs`**
- Any authenticated user, own-org scoped, paginated.
- **Acceptance:** returns only same-org entries; a user from Org B never sees Org A's feed.
- **Postman test:** GET as any role → 200, org-scoped; cross-org token → confirm no leakage.
- **Rollback:** remove route + controller.

### Milestone 7 — Permission Visibility

**Task 15: `GET /permissions/me`**
- Returns the caller's full resolved permission object from `config/permissions.js` for their role (no DB call needed — pure config lookup keyed by `req.context.role`).
- **Acceptance:** each role returns exactly its matrix entry from `permissions.js`; `super_admin` gets its (smaller) platform-level set, not org-role permissions.
- **Postman test:** GET as each of the 5 roles → compare output against `config/permissions.js` by hand.
- **Rollback:** remove route + controller.

### Milestone 8 — Security Hardening

**Task 16: Helmet + CORS**
- Add `helmet()` and `cors()` (env-driven `ALLOWED_ORIGINS`) globally in `app.js`, before routes.
- **Acceptance:** response headers show helmet defaults; requests from a non-allow-listed `Origin` are rejected; full existing test suite still passes (helmet/cors shouldn't affect same-origin Postman/test-runner requests).
- **Postman test:** normal request → check headers (`X-Content-Type-Options`, etc.); set `Origin` to a disallowed value → confirm CORS rejection.
- **Rollback:** remove the two `app.use()` lines.

**Task 17: `express-mongo-sanitize`**
- Strips `$`/`.` operators from `req.body`/`req.query`/`req.params` globally, ahead of routes.
- **Acceptance:** a payload like `{"email":{"$ne":null}}` on a filterable field is neutralized rather than executing as a Mongo operator.
- **Postman test:** attempt an operator-injection payload against `GET /users?role[$ne]=viewer` → confirm treated as a literal/ignored, not a bypass.
- **Rollback:** remove the middleware line.

### Milestone 9 — API Documentation

**Task 18: OpenAPI Spec + Swagger UI (`GET /docs`)**
- Cover every route that exists after M1–M8 (Phase 1 + Phase 2), including the standard envelope and JWT bearer scheme as reusable components.
- **Acceptance:** `/docs` renders; every route in Section 7 plus existing Phase 1 routes is documented; spec validates without schema errors.
- **Manual test:** browser check of `/docs`, confirm each route is try-able from the UI with a bearer token.
- **Rollback:** remove the `/docs` mount; spec file stays as reference.

### Milestone 10 — DB Review & Versioning

**Task 19: Index Verification + New-Collection Indexes**
- Add the Section 5.4 indexes for `auditlogs`/`activitylogs`/`User.isDeleted`; run `.explain()` on `GET /users` (with filters) and `GET /audit-logs` to confirm `IXSCAN`, not `COLLSCAN`.
- **Acceptance:** explain output shows index usage on the hot paths; no regression in existing `User`/`Organization`/`RefreshToken` index behavior.
- **Rollback:** `dropIndex()` the new indexes only — no code changes needed.

**Task 20: Additive `/api/v1` Mount**
- Mount all existing routers a second time under `/api/v1` in `app.js` (e.g., `app.use('/api/v1/users', require('./routes/users.routes'))` alongside the existing `app.use('/users', ...)`), so both old and new paths work identically. No route is moved or removed.
- **Acceptance:** every existing Postman request against the legacy paths still passes unchanged; the same requests replayed against `/api/v1/...` return identical results.
- **Postman test:** duplicate one existing collection folder, retarget it at `/api/v1`, run both — both green.
- **Rollback:** remove the duplicate `app.use()` lines; zero impact on legacy paths.

---

## Summary of changes from my first draft

- Dropped: separate `Role`/`Permission` Mongo collections, invitation token/expiry workflow, org soft-delete, service-layer extraction for existing controllers — none of these are needed; the existing config-driven RBAC and direct-provisioning invite already work well and weren't asked for again.
- Added: exact gap analysis against real files, `GET /users/:id`, `/permissions/me`, additive `/api/v1` versioning that doesn't break Phase 1 paths, explicit high-risk flag + full-regression gate on the one task (`scopedQuery.js` soft-delete change) that touches shared Phase 1 infrastructure.
- **20 tasks** (down from 40, because ~half of the original list already existed in your repo).

Waiting for your approval before starting Task 1.
