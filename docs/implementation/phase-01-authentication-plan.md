# Phase 1 Implementation Plan
## Authentication & Organization Management

**Document Version:** 1.0
**Status:** Ready for Implementation
**Phase Reference:** `10-development-roadmap.md` Phase 1; `11-master-project-specification.md` Part C — Phase 1
**Source Documents Consolidated Here:** `02-srs-mvp.md`, `03-user-roles-permission-matrix.md`, `04-system-architecture.md`, `05-data-model-erd.md`, `06-api-specification.md`, `08-security-design.md`, `09-ui-ux-design.md`, `12-testing-strategy.md`

**Scope of this plan:** backend only — Core API implementation of authentication, session management, RBAC foundation, tenant-scoping foundation, and organization/user management. Frontend (Login/Register/App Shell pages) is covered separately by the Phase 2 plan. **No application code is included below — this is a task breakdown for delegation to Antigravity agents.**

**Assumed starting state:** Phase 0 (Roadmap) is complete — a running Express app skeleton with a `/health` endpoint and MongoDB connectivity exists inside the Docker Compose stack, per Roadmap Mission 0.3.

---

## How to Use This Plan

Each task below is sized as a single Antigravity mission: one objective, a small closed set of files, explicit dependencies on earlier tasks, and acceptance criteria an agent can self-verify before reporting back. Work through tasks in order within each group; groups themselves are mostly sequential (later groups depend on earlier ones), except where a task explicitly notes it can run in parallel.

**Suggested file structure this plan assumes** (create as needed; adjust naming conventions to match whatever Phase 0 already established, but keep this general shape so later phases can follow the same pattern):

```
backend/
  src/
    config/          # env loading, permissions.js (RBAC config)
    models/          # Mongoose schemas
    middleware/       # authenticate, authorize, rateLimiter
    utils/            # password.js, jwt.js
    services/         # refreshTokenService.js, userService.js, orgService.js
    data/             # scopedQuery.js (tenant-scoping wrapper)
    controllers/       # auth, organizations, users, platform
    routes/            # auth, organizations, users, platform
    app.js             # route mounting
  tests/
    unit/
    integration/
```

---

## Task Group A — Data Layer Foundations

### Task 1.1 — Organization Mongoose Model

**Objective:** Define the `organizations` schema — the tenancy root — with the fields, defaults, and validation documented in the Data Model.

**Files to create/modify:**
- Create: `backend/src/models/Organization.js`

**Dependencies:** Phase 0 complete (MongoDB connection available).

**Acceptance Criteria:**
- Schema includes `name`, `slug` (unique), `plan` (enum `free|pro|enterprise`, default `free`), `isActive` (default `true`), `notificationDefaults.alertEmailRecipients` (array of strings), `createdAt`/`updatedAt`.
- `slug` has a unique index.
- Attempting to save an organization without a `name` fails validation.
- Matches `05-data-model-erd.md` §4.1 exactly.

**Manual Testing Steps:**
1. In a Node REPL or a throwaway script connected to the dev MongoDB instance, attempt to create an organization without a `name` — confirm it's rejected.
2. Create two organizations with the same `slug` — confirm the second is rejected.
3. Create a valid organization — confirm it's persisted with correct defaults for `plan` and `isActive`.

**Suggested Git commit message:**
`feat(models): add Organization schema with slug uniqueness and plan defaults`

---

### Task 1.2 — User Mongoose Model

**Objective:** Define the `users` schema, including the deliberate `orgId: null` exception for `super_admin`.

**Files to create/modify:**
- Create: `backend/src/models/User.js`

**Dependencies:** Task 1.1 (references `orgId` → `organizations`).

**Acceptance Criteria:**
- Schema includes `orgId` (nullable, required unless `role === 'super_admin'`), `email`, `passwordHash`, `role` (enum of the 5 roles), `isActive` (default `true`), `notificationPreferences`, timestamps.
- Compound unique index on `(orgId, email)`.
- A non-`super_admin` user without `orgId` fails validation.
- A `super_admin` user with `orgId: null` succeeds.
- Matches `05-data-model-erd.md` §4.2.

**Manual Testing Steps:**
1. Attempt to save a `devops_engineer` user with `orgId: null` — confirm rejection.
2. Save a `super_admin` user with `orgId: null` — confirm success.
3. Save two users with the same email in the same org — confirm the second is rejected.
4. Save two users with the same email in *different* orgs — confirm both succeed.

**Suggested Git commit message:**
`feat(models): add User schema with org-scoping and super_admin null-org exception`

---

### Task 1.3 — RefreshToken Mongoose Model

**Objective:** Define the `refreshTokens` schema, including the TTL index for automatic expiry cleanup.

**Files to create/modify:**
- Create: `backend/src/models/RefreshToken.js`

**Dependencies:** Task 1.2 (references `userId`).

**Acceptance Criteria:**
- Schema includes `userId`, `orgId` (nullable), `tokenHash` (unique), `issuedAt`, `expiresAt`, `revoked` (default `false`), `userAgent` (optional).
- TTL index on `expiresAt` configured so MongoDB auto-purges expired documents.
- Matches `05-data-model-erd.md` §4.3.

**Manual Testing Steps:**
1. Insert a refresh token document with `expiresAt` a few seconds in the future; confirm (via a short wait and a manual query, or MongoDB's documented TTL sweep interval) that it is eventually removed automatically.
2. Attempt to insert two documents with the same `tokenHash` — confirm rejection.

**Suggested Git commit message:**
`feat(models): add RefreshToken schema with TTL-based expiry`

---

## Task Group B — Security Utilities

### Task 1.4 — Password Hashing Utility (bcrypt)

**Objective:** Implement a small utility module wrapping bcrypt hash/compare, cost factor 12.

**Files to create/modify:**
- Create: `backend/src/utils/password.js`
- Create: `backend/tests/unit/password.test.js`

**Dependencies:** None (pure utility; can be built in parallel with Task Group A).

**Acceptance Criteria:**
- `hashPassword(plain)` returns a bcrypt hash at cost factor 12.
- `comparePassword(plain, hash)` correctly validates a matching password and rejects a non-matching one.
- Hashing the same password twice produces two different hash strings (salt uniqueness).
- Matches `08-security-design.md` §2.1.

**Manual Testing Steps:**
1. Run the unit test file directly; confirm all cases pass.
2. Manually hash a known password twice in a scratch script; confirm the two hashes differ but both validate against the original password via `comparePassword`.

**Suggested Git commit message:**
`feat(security): add bcrypt password hashing utility (cost factor 12)`

---

### Task 1.5 — JWT Access Token Utility

**Objective:** Implement access token generation and verification, with the exact claim shape and 15-minute expiry documented.

**Files to create/modify:**
- Create: `backend/src/utils/jwt.js`
- Create: `backend/tests/unit/jwt.test.js`

**Dependencies:** None (pure utility; can be built in parallel with Task 1.4).

**Acceptance Criteria:**
- `generateAccessToken({ userId, orgId, role })` returns a signed HS256 token with claims `sub`, `orgId`, `role`, `iat`, `exp` (15-minute expiry).
- `verifyAccessToken(token)` correctly decodes a valid token and throws/rejects on an expired or tampered token.
- Signing secret is read from an environment variable, never hardcoded.
- Matches `08-security-design.md` §2.2.

**Manual Testing Steps:**
1. Generate a token, decode it (e.g., via a JWT debugger or a scratch script) and confirm claim shape and expiry match spec.
2. Manually alter one character of a valid token's signature segment and confirm verification fails.
3. Generate a token with a very short custom expiry in a test context, wait for it to lapse, and confirm verification fails with an expiry-specific error.

**Suggested Git commit message:**
`feat(security): add JWT access token generation and verification utility`

---

### Task 1.6 — Refresh Token Service (Issue, Rotate, Revoke)

**Objective:** Implement the refresh token lifecycle: generation, hashed storage, rotation-on-use, revocation, and reuse detection.

**Files to create/modify:**
- Create: `backend/src/services/refreshTokenService.js`
- Create: `backend/tests/unit/refreshTokenService.test.js`

**Dependencies:** Task 1.3 (model), Task 1.4 (hashing pattern reused for token hashing — a plain fast hash like SHA-256 is acceptable here since refresh tokens are already high-entropy random values, unlike passwords; document this distinction inline if implemented differently from bcrypt).

**Acceptance Criteria:**
- `issueRefreshToken(userId, orgId)` generates a high-entropy random token, stores only its hash, sets a 7-day expiry, and returns the raw token to the caller (for client delivery).
- `rotateRefreshToken(rawToken)` validates the presented token against its stored hash, marks the old record `revoked: true`, and issues a new one — all in a single logical operation.
- `revokeAllForUser(userId)` marks every active refresh token for that user as revoked (used for reuse-detection response and manual "logout everywhere").
- Presenting an already-revoked token to `rotateRefreshToken` triggers `revokeAllForUser` for that token's owner and signals reuse detection to the caller.
- Matches `08-security-design.md` §2.3, §9.2.

**Manual Testing Steps:**
1. Issue a token, rotate it once — confirm the original is marked revoked and a new valid token is returned.
2. Attempt to rotate using the now-revoked original token — confirm it fails *and* confirm (via a direct DB query) that all of that user's other active refresh tokens are also now revoked.
3. Issue tokens for two different users; revoke-all for one; confirm the other user's tokens remain valid.

**Suggested Git commit message:**
`feat(security): add refresh token service with rotation and reuse detection`

---

## Task Group C — Middleware & Access Control Foundations

### Task 1.7 — Authentication Middleware (JWT Verification)

**Objective:** Express middleware that verifies the access token on protected routes and attaches `{ userId, orgId, role }` to the request context.

**Files to create/modify:**
- Create: `backend/src/middleware/authenticate.js`
- Create: `backend/tests/integration/authenticate.test.js`

**Dependencies:** Task 1.5.

**Acceptance Criteria:**
- A request with a valid `Authorization: Bearer <token>` header proceeds, with `req.context = { userId, orgId, role }` populated correctly.
- A request with a missing, malformed, expired, or tampered token returns `401` with the standard error envelope (per `06-api-specification.md` §1.3) and does not reach the route handler.
- Matches `08-security-design.md` §2.2, §3.1.

**Manual Testing Steps:**
1. Add a temporary test route protected by this middleware; hit it with a valid token — confirm `200` and correct context values (log them or return them in the test response).
2. Hit it with no `Authorization` header — confirm `401`.
3. Hit it with an expired token — confirm `401`.
4. Hit it with a token whose signature has been altered — confirm `401`.

**Suggested Git commit message:**
`feat(middleware): add JWT authentication middleware`

---

### Task 1.8 — Shared RBAC Permission Config

**Objective:** Encode the full Permission Matrix as a single, structured config file — the source of truth every RBAC check will reference.

**Files to create/modify:**
- Create: `backend/src/config/permissions.js`

**Dependencies:** None (pure data; can be built any time before Task 1.9, ideally in parallel with Task Group B).

**Acceptance Criteria:**
- Every `(role, resource, action)` combination documented in `03-user-roles-permission-matrix.md` §3 has a corresponding entry (or a documented default-deny for omitted combinations).
- Config structure is queryable by `(role, resource, action)` in a single lookup, not requiring the caller to know the matrix's internal shape.
- Includes entries for every Phase 1 endpoint's required permissions (org, user actions) at minimum — later phases will extend this same file, not create a second one.
- A short header comment in the file states its role as the single source of truth referenced by both this backend and, conceptually, `06-api-specification.md` §14's traceability note.

**Manual Testing Steps:**
1. Manually spot-check at least one entry per role against the Permission Matrix document's tables (§3.1–3.9) to confirm no transcription errors.
2. Confirm Super Admin has entries *only* for platform-level actions (§4 of the Permission Matrix) and no entries granting org-scoped resource access.

**Suggested Git commit message:**
`feat(config): add shared RBAC permission matrix config`

---

### Task 1.9 — RBAC Authorization Middleware

**Objective:** Express middleware that checks the authenticated user's `(role, resource, action)` against the Task 1.8 config and returns `403` on mismatch.

**Files to create/modify:**
- Create: `backend/src/middleware/authorize.js`
- Create: `backend/tests/integration/authorize.test.js`

**Dependencies:** Task 1.7 (needs `req.context.role`), Task 1.8.

**Acceptance Criteria:**
- Middleware factory accepts a `(resource, action)` pair and returns an Express middleware checking `req.context.role` against the permission config.
- Disallowed combinations return `403` with the standard error envelope (`error.code: "FORBIDDEN"`).
- A test suite iterates every `(role, action)` pair from the Permission Matrix and asserts correct allow/deny behavior — this is the seed of the RBAC test suite that `12-testing-strategy.md` §10 requires to be "full" by Phase 13; build it thoroughly now.
- Matches `08-security-design.md` §3.

**Manual Testing Steps:**
1. Using a temporary test route gated to `org_admin` only, confirm an `org_admin` token succeeds and every other role's token gets `403`.
2. Confirm the error response body matches the documented envelope shape exactly.

**Suggested Git commit message:**
`feat(middleware): add RBAC authorization middleware with full role-matrix test coverage`

---

### Task 1.10 — Scoped-Query Data Access Wrapper

**Objective:** Implement the tenant-scoping helper that every future data-access call must go through — the platform's primary defense against cross-tenant data leaks.

**Files to create/modify:**
- Create: `backend/src/data/scopedQuery.js`
- Create: `backend/tests/unit/scopedQuery.test.js`

**Dependencies:** Task 1.7 (relies on `req.context.orgId` being trustworthy).

**Acceptance Criteria:**
- Wrapper functions (e.g., `scopedFind`, `scopedFindOne`, `scopedCreate`, `scopedUpdate`, `scopedDelete`) accept a Mongoose model, the request context, and a caller-supplied filter/data object, and **always** inject/override `orgId` from `context.orgId` — even if the caller's filter object already contains a different `orgId`.
- A unit test explicitly attempts to override `orgId` in the filter and confirms the wrapper's injected value wins.
- Matches `05-data-model-erd.md` §6.2–6.3.
- A short comment block in the file explicitly states: *any direct, unwrapped model call elsewhere in the codebase touching a tenant-scoped collection should be treated as a code-review flag* (per Data Model §6.3 and Security Design §7) — this becomes a standing convention for every subsequent phase.

**Manual Testing Steps:**
1. Seed two organizations' worth of test data directly (bypassing the wrapper, since this is test setup).
2. Using the wrapper with Org A's context, attempt a query with a filter that explicitly names Org B's `orgId` — confirm the result set is still scoped to Org A only, not Org B.

**Suggested Git commit message:**
`feat(data): add tenant-scoped query wrapper enforcing server-side orgId injection`

---

## Task Group D — Auth Endpoints

### Task 1.11 — `POST /auth/register`

**Objective:** Implement organization self-registration with an initial Org Admin account.

**Files to create/modify:**
- Create: `backend/src/controllers/auth.controller.js` (register handler)
- Create: `backend/src/routes/auth.routes.js` (mount `/register`)
- Modify: `backend/src/app.js` (mount `auth.routes.js`)
- Create: `backend/tests/integration/auth.register.test.js`

**Dependencies:** Task 1.1, 1.2, 1.4, 1.5, 1.6.

**Acceptance Criteria:**
- Valid request creates an `organizations` document and a `users` document (`role: org_admin`), returns `201` with organization, user, `accessToken`, and `refreshToken` matching `06-api-specification.md` §2.1's response shape exactly.
- Duplicate `adminEmail` returns `409 DUPLICATE_RESOURCE`.
- Invalid/weak password or missing fields return `400 VALIDATION_ERROR`.
- Matches FR-1.1.

**Manual Testing Steps:**
1. Send a valid registration request via curl/Postman; confirm `201` and inspect the response shape against the API spec.
2. Repeat with the same `adminEmail` — confirm `409`.
3. Send with a password missing a number — confirm `400`.
4. Query MongoDB directly to confirm the organization and user documents were created correctly and the password is stored as a bcrypt hash, not plaintext.

**Suggested Git commit message:**
`feat(auth): implement POST /auth/register endpoint`

---

### Task 1.12 — `POST /auth/login`

**Objective:** Implement credential-based login with enumeration-safe error handling.

**Files to create/modify:**
- Modify: `backend/src/controllers/auth.controller.js` (add login handler)
- Modify: `backend/src/routes/auth.routes.js` (mount `/login`)
- Create: `backend/tests/integration/auth.login.test.js`

**Dependencies:** Task 1.11 (needs a registered user to log in against).

**Acceptance Criteria:**
- Valid credentials return `200` with user object, `accessToken`, `refreshToken`, matching `06-api-specification.md` §2.2.
- Wrong password and unknown email return **identical** `401` response bodies (byte-for-byte comparable error message).
- Matches FR-1.3, `08-security-design.md` §2.4.

**Manual Testing Steps:**
1. Log in with correct credentials from Task 1.11's registration — confirm `200` and valid tokens.
2. Log in with a correct email but wrong password — capture the exact response body.
3. Log in with a nonexistent email — capture the exact response body and confirm it is identical to step 2's.

**Suggested Git commit message:**
`feat(auth): implement POST /auth/login with enumeration-safe error responses`

---

### Task 1.13 — `POST /auth/refresh` and `POST /auth/logout`

**Objective:** Implement token refresh (with rotation) and logout (single-session revocation).

**Files to create/modify:**
- Modify: `backend/src/controllers/auth.controller.js` (add refresh, logout handlers)
- Modify: `backend/src/routes/auth.routes.js` (mount `/refresh`, `/logout`)
- Create: `backend/tests/integration/auth.refresh.test.js`
- Create: `backend/tests/integration/auth.logout.test.js`

**Dependencies:** Task 1.6, Task 1.12.

**Acceptance Criteria:**
- `POST /auth/refresh` with a valid refresh token returns a new `accessToken`/`refreshToken` pair and revokes the presented one (per Task 1.6).
- Reusing the just-rotated (now-revoked) token returns `401` and revokes **all** of that user's sessions (verify via a second, previously-issued token also being invalid afterward).
- `POST /auth/logout` revokes only the specific presented refresh token, leaving other active sessions for the same user untouched.
- Matches `06-api-specification.md` §2.3–2.4, `08-security-design.md` §2.3, §2.5, AUTH-07/AUTH-08/AUTH-09 from `12-testing-strategy.md` §6.1.

**Manual Testing Steps:**
1. Log in twice (simulating two devices) to get two separate refresh tokens for the same user.
2. Refresh using token A — confirm new tokens issued and token A is now invalid if reused.
3. Attempt to reuse token A again — confirm `401`, then confirm token B (from the second login) is *also* now invalid (reuse-detection cascade).
4. In a fresh pair of sessions, call `/auth/logout` with one token — confirm the other session's token still works afterward (logout is scoped, not global).

**Suggested Git commit message:**
`feat(auth): implement POST /auth/refresh with rotation and POST /auth/logout`

---

### Task 1.14 — Rate Limiting on Auth Endpoints

**Objective:** Apply brute-force-resistant rate limiting specifically to `/auth/login` and `/auth/register`, ahead of the full Phase 13 hardening pass, since these are the platform's first externally-reachable endpoints.

**Files to create/modify:**
- Create: `backend/src/middleware/rateLimiter.js`
- Modify: `backend/src/routes/auth.routes.js` (apply limiter to `/login`, `/register`)
- Create: `backend/tests/integration/auth.rateLimit.test.js`

**Dependencies:** Task 1.11, Task 1.12.

**Acceptance Criteria:**
- `/auth/login` allows 5 requests/minute/IP; the 6th within the window returns `429` with a `Retry-After` header.
- `/auth/register` allows 3 requests/minute/IP.
- Matches `08-security-design.md` §5.6, SEC-17 from `12-testing-strategy.md` §7.
- Note: this task only covers the auth-specific limiters; general-purpose rate limiting for all other authenticated endpoints remains a Phase 13 task per the Development Roadmap.

**Manual Testing Steps:**
1. Send 6 rapid login requests from the same client — confirm the 6th returns `429` and includes `Retry-After`.
2. Wait out the window and confirm requests succeed again.

**Suggested Git commit message:**
`feat(security): add rate limiting to auth login and register endpoints`

---

## Task Group E — Organization & User Management Endpoints

### Task 1.15 — `GET /organizations/me` and `PUT /organizations/me`

**Objective:** Implement org profile retrieval and update, RBAC-gated to org_admin for writes.

**Files to create/modify:**
- Create: `backend/src/controllers/organizations.controller.js`
- Create: `backend/src/routes/organizations.routes.js`
- Modify: `backend/src/app.js` (mount routes)
- Create: `backend/tests/integration/organizations.test.js`

**Dependencies:** Task 1.9, Task 1.10, Task 1.12 (need an authenticated user to test against).

**Acceptance Criteria:**
- `GET /organizations/me` returns the caller's org for any authenticated role.
- `PUT /organizations/me` succeeds only for `org_admin`; all other roles get `403`.
- Update correctly persists `name` and `notificationDefaults.alertEmailRecipients`.
- Matches `06-api-specification.md` §3.1–3.2, ORG-01/ORG-02/ORG-03 from `12-testing-strategy.md` §6.2.

**Manual Testing Steps:**
1. As org_admin, fetch and then update the org profile — confirm changes persist on a subsequent fetch.
2. As a non-org_admin role (create a second test user if needed), attempt the update — confirm `403`.
3. Confirm a *different* organization's admin cannot see or affect this organization's data (spot cross-tenant check ahead of the full Task Group F suite).

**Suggested Git commit message:**
`feat(organizations): implement GET and PUT /organizations/me endpoints`

---

### Task 1.16 — User Management Endpoints (`GET /users`, `POST /users/invite`, `PATCH /users/:id/role`, `DELETE /users/:id`)

**Objective:** Implement org-scoped user management for org_admin, including the "cannot demote the last org_admin" business rule.

**Files to create/modify:**
- Create: `backend/src/controllers/users.controller.js`
- Create: `backend/src/routes/users.routes.js`
- Modify: `backend/src/app.js` (mount routes)
- Create: `backend/tests/integration/users.management.test.js`

**Dependencies:** Task 1.15 (shares patterns), Task 1.10.

**Acceptance Criteria:**
- `GET /users` lists only the caller's org's users, for org_admin, devops_engineer, and team_lead (per Permission Matrix §3.2); viewer gets `403`.
- `POST /users/invite` creates a new user scoped to the caller's org with the specified role; rejects an attempt to invite a `super_admin`; duplicate email within the org returns `409`.
- `PATCH /users/:id/role` updates a target user's role, scoped to the caller's org (`404` if the target belongs to another org); blocks demoting the last remaining `org_admin` with `400`.
- `DELETE /users/:id` deactivates/removes a user, scoped to the caller's org.
- Matches `06-api-specification.md` §4.2–4.4, ORG-04 through ORG-08 from `12-testing-strategy.md` §6.2.

**Manual Testing Steps:**
1. As org_admin, invite a new `devops_engineer` — confirm `201` and the user appears in a subsequent `GET /users`.
2. Attempt to invite a duplicate email — confirm `409`.
3. Attempt to invite a `super_admin` — confirm rejection.
4. As the sole org_admin, attempt to change your own role to something else — confirm `400`.
5. Change the new user's role to `team_lead` — confirm persisted.
6. Remove the new user — confirm `204` and they no longer appear active.
7. As `viewer`, attempt `GET /users` — confirm `403`.

**Suggested Git commit message:**
`feat(users): implement user invitation, role management, and removal endpoints`

---

### Task 1.17 — `GET/PATCH /users/me`

**Objective:** Implement self-service profile and password-change endpoints available to every role.

**Files to create/modify:**
- Modify: `backend/src/controllers/users.controller.js` (add self-profile handlers)
- Modify: `backend/src/routes/users.routes.js` (mount `/users/me`)
- Create: `backend/tests/integration/users.me.test.js`

**Dependencies:** Task 1.16.

**Acceptance Criteria:**
- `GET /users/me` returns the caller's own profile, for any role.
- `PATCH /users/me` allows updating name and changing password; password change requires correct `currentPassword`, returns `401` if incorrect.
- Matches `06-api-specification.md` §4.5–4.6, AUTH-11 from `12-testing-strategy.md` §6.1.

**Manual Testing Steps:**
1. Fetch own profile as any role — confirm correct data, no other user's data.
2. Change password with the wrong `currentPassword` — confirm `401`.
3. Change password with the correct `currentPassword` — confirm success, then confirm login with the *old* password now fails and login with the new one succeeds.

**Suggested Git commit message:**
`feat(users): implement self-service profile and password change endpoints`

---

### Task 1.18 — `GET /platform/organizations` (Super Admin)

**Objective:** Implement the platform-level, aggregate-only organization list, strictly scoped to the narrow Super Admin boundary.

**Files to create/modify:**
- Create: `backend/src/controllers/platform.controller.js`
- Create: `backend/src/routes/platform.routes.js`
- Modify: `backend/src/app.js` (mount routes)
- Create: `backend/tests/integration/platform.test.js`

**Dependencies:** Task 1.9, Task 1.16 (needs orgs/users/resources to aggregate over — resource counts will be `0` until Phase 3/5 exist, which is acceptable at this stage).

**Acceptance Criteria:**
- Returns a list of organizations with only the documented aggregate fields (`id`, `name`, `userCount`, `resourceCount`, `activeAlertCount`, `isActive`) — no nested documents, no server/alert/anomaly detail.
- Accessible only to `super_admin`; every other role gets `403`.
- Matches `06-api-specification.md` §3.3, `03-user-roles-permission-matrix.md` §4, ORG-09/ORG-10 and TENANT-17 from `12-testing-strategy.md`.

**Manual Testing Steps:**
1. Create a `super_admin` test user directly in the database (no self-registration path for this role, by design).
2. As `super_admin`, call the endpoint — confirm the response contains only the documented aggregate fields for each org, with a manual diff against the API spec's example response.
3. As `org_admin`, attempt the same call — confirm `403`.

**Suggested Git commit message:**
`feat(platform): implement GET /platform/organizations with aggregate-only response`

---

## Task Group F — Phase 1 Verification & Exit Check

### Task 1.19 — RBAC Test Suite Completion for Phase 1 Endpoints

**Objective:** Extend Task 1.9's seed test suite so every Phase 1 endpoint has explicit pass/fail coverage for all 5 roles, per `12-testing-strategy.md` §7 (SEC-07) and §10's Phase 1 acceptance criteria.

**Files to create/modify:**
- Create: `backend/tests/integration/rbac.phase1.test.js`

**Dependencies:** Task 1.11 through 1.18 (all Phase 1 endpoints must exist).

**Acceptance Criteria:**
- Every Phase 1 endpoint × every role combination has an explicit assertion (allowed roles succeed, disallowed roles get `403`).
- Test output is structured so pass/fail per `(endpoint, role)` pair is individually visible, not collapsed into one aggregate pass/fail.

**Manual Testing Steps:**
1. Run the suite; manually scan the output against the Permission Matrix's tables (§3.1–3.2, §4) to confirm no combination was missed.

**Suggested Git commit message:**
`test(rbac): complete Phase 1 endpoint coverage for all 5 roles`

---

### Task 1.20 — Cross-Tenant Isolation Test Suite for Phase 1

**Objective:** Implement the Phase 1 subset of the Multi-Tenant Isolation test cases from `12-testing-strategy.md` §9 — the platform's highest-priority test category, established now as the pattern every later phase extends.

**Files to create/modify:**
- Create: `backend/tests/integration/tenantIsolation.phase1.test.js`
- Create: `backend/tests/fixtures/twoOrgSeed.js` (or equivalent fixture helper — two distinct, deliberately differently-named test organizations, per `12-testing-strategy.md` §5.3)

**Dependencies:** Task 1.15 through 1.18.

**Acceptance Criteria:**
- Org A `org_admin` cannot view, invite into, modify, or remove Org B's users (`404`/`403` per the documented pattern, never `200`).
- Org A's `GET /users` never includes Org B's users, even with a large combined dataset.
- Attempting to smuggle a foreign `orgId` into any Phase 1 request body/query is ignored — the server-side context value always wins (directly exercises Task 1.10's wrapper).
- Matches TENANT-14, TENANT-15, TENANT-16 from `12-testing-strategy.md` §9.

**Manual Testing Steps:**
1. Seed two organizations with distinctly-named users (per the anti-masking naming rule in `12-testing-strategy.md` §5.3).
2. As Org A's admin, attempt each of the cross-org actions above against Org B's data; confirm every attempt fails as documented.
3. Attempt to pass Org B's `orgId` explicitly in a request body while authenticated as Org A; confirm the response is still correctly scoped to Org A.

**Suggested Git commit message:**
`test(tenancy): add Phase 1 cross-tenant isolation test suite and two-org fixture`

---

### Task 1.21 — Phase 1 End-to-End Flow Verification

**Objective:** A single scripted flow exercising the full Phase 1 feature set together, matching the Phase 1 exit check defined in `10-development-roadmap.md`.

**Files to create/modify:**
- Create: `backend/tests/integration/phase1.e2e.test.js`

**Dependencies:** All prior Phase 1 tasks.

**Acceptance Criteria:** The following sequence completes successfully in one run:
1. Register a new organization (Task 1.11).
2. Log in as the new org_admin (Task 1.12).
3. Invite a `devops_engineer` user (Task 1.16).
4. Log in as the invited user (Task 1.12) using a temporary/reset password flow if applicable, or directly if invite flow issues credentials — confirm role-correct token claims.
5. As the `devops_engineer`, attempt a `super_admin`-only action (Task 1.18) — confirm `403`.
6. As the org_admin, refresh their session (Task 1.13) and confirm the old token is rejected afterward.
7. Log out and confirm the logged-out session's refresh token no longer works.

**Manual Testing Steps:**
1. Run the full sequence as an integration test.
2. Separately, walk through the same sequence manually via curl/Postman at least once, to confirm the experience matches what the automated test asserts (catches anything the test might assert too loosely).

**Suggested Git commit message:**
`test(e2e): add Phase 1 end-to-end authentication and org management flow`

---

## Phase 1 Completion Checklist

Before considering Phase 1 done and moving to Phase 2 (per `12-testing-strategy.md` §10):

- [ ] AUTH-01 through AUTH-11 (from `12-testing-strategy.md` §6.1) all pass
- [ ] ORG-01 through ORG-10 (§6.2) all pass
- [ ] Full RBAC test suite (Task 1.19) passes for all Phase 1 endpoints
- [ ] Cross-tenant isolation suite (Task 1.20) passes
- [ ] Phase 1 E2E flow (Task 1.21) passes
- [ ] SEC-01 through SEC-11, SEC-17, SEC-22, SEC-24 (the subset of `12-testing-strategy.md` §7 applicable to auth/org scope) pass
- [ ] No secrets (JWT signing key, DB URI) are hardcoded anywhere in the diff — confirmed via a manual scan before merging

Once this checklist is complete, proceed to the Phase 2 implementation plan (Auth & Org UI), which consumes every endpoint built in this phase.
