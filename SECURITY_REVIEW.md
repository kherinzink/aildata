# Aildata Security Review & Cloudflare JWT Guidance

## 1. Executive Summary & Architecture Overview
Aildata implements a defense-in-depth security architecture tailored for edge deployment on Cloudflare Workers and D1 SQLite. Key security pillars include:
- **Role-Based Access Control (RBAC):** Three privilege tiers (`viewer`, `analyst`, `admin`) with strict API route gating.
- **Cryptographic Authentication:** HMAC-SHA256 signed session tokens and PBKDF2-SHA256 password hashing (100,000 iterations) with per-user cryptographic salts.
- **Brute-Force & Rate-Limit Protection:** Dedicated `failed_logins` tracking table handling account lockouts and attempt counters.
- **SQL Injection Defense:** Parameterized queries (`.bind(...)`) across all Cloudflare D1 database operations.
- **Origin-Restricted CORS:** Whitelisted origins replacing wildcard policies.
- **Immutable Audit Logging with Before/After Diffs:** Dedicated `audit_logs` tracking table capturing all security and administrative events with explicit field-level diff tracking.

---

## 2. Component-by-Component Security Evaluation

### A. Authentication & Session Management
- **Password Hashing:** Uses Web Crypto `PBKDF2` with 100,000 iterations and unique per-user salts (`migrations/0005_security_hardening.sql`), preventing offline rainbow table attacks.
- **Token Signing:** Uses `HMAC-SHA256` via Web Crypto API with expiration checks (`payload.exp`).
- **Brute-Force Protection:** Tracks login attempts per identifier in `failed_logins`, locking accounts temporarily after repeated failures.

### B. Authorization & Administrative Guards
- **RBAC Enforcement:** Protected endpoints explicitly verify `authUser.role`.
- **Critical Administrative Safeguards:**
  - Prevents an administrator from self-suspending or self-deleting.
  - Prevents demoting or suspending/deleting the **last remaining active administrator**, preventing lockout scenarios.

### C. Data Access & Injection Defense
- **Parameterized Queries:** All SQL statements in `worker/index.ts` and worker modules use Cloudflare D1 parameterized bindings (`.bind(...)`), completely eliminating SQL injection vectors.
- **Data Isolation:** Clean separation between raw ingestion snapshots (`dynamic_records`) and relational normalized entities (`detainees`, `detentions`, `charges`, `legal_proceedings`, `correspondence`).

---

## 3. Audit Logging Subsystem & Before/After Diffs
To ensure accountability, compliance, and non-repudiation, an immutable audit logging system is integrated:
- **Database Schema:** `audit_logs` table (`migrations/0007_audit_logs.sql`) tracking `actor_id`, `actor_email`, `action`, `target_id`, `metadata`, `ip_address`, and `created_at`.
- **Before/After Diff Tracking:** 
  - Captures exact field-level state transitions (`field`, `before`, `after`) for detainee profile updates, detention stays, charges, correspondence, legal proceedings, and administrator role/status modifications.
  - Rendered inline directly in the Admin view (`AdminView.tsx`) with color-coded old vs. new values, plus a JSON metadata inspector modal.
- **Tracked Events:**
  - Auth: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`
  - User Lifecycle / RBAC: `USER_REGISTERED`, `USER_INVITED`, `USER_ACTIVATED`, `ROLE_CHANGED`, `STATUS_CHANGED`, `INVITE_RESET`, `PASSWORD_RESET`, `USER_DELETED`
  - Record Edits: `DETAINEE_UPDATED`, `DETAINED_RECORD_EDITED`, `CHARGE_MODIFIED`, `LEGAL_PROCEEDING_MODIFIED`
  - System & Maintenance: `BATCH_INGESTION`, `DATABASE_CLEARED`, `DATABASE_STAGING_PURGED`, `DATABASE_RELATIONAL_CLEARED`, `CATEGORY_DELETED`, `CATEGORY_STAGING_DELETED`, `CATEGORY_RELATIONAL_DELETED`, `RETENTION_PURGE`
- **Admin Access:** `GET /api/admin/audit-logs` protected by strict `admin` RBAC checks with pagination and filtering.

---

## 4. JWT & Cloudflare Deployment Recommendations

### 1. Secret Provisioning (`JWT_SECRET`)
- **Never rely on the fallback secret in production.** Store your HMAC secret securely in Cloudflare's encrypted secret store:
  ```bash
  npx wrangler secret put JWT_SECRET
  ```
- Ensure execution fails or logs a critical warning if `env.JWT_SECRET` is missing in production.

### 2. Token Lifetime (`exp` claim)
- Aildata currently sets tokens to expire after **7 days**. Evaluate whether 7 days aligns with your security policy. For high-assurance administrative environments, consider a shorter window (e.g., 8–12 hours) or sliding session renewal.

### 3. Revocation & User Status Synchronization
- Stateless JWTs cannot be natively revoked before expiration. Aildata checks user `status` (`active` vs `suspended`) on key actions, but active tokens remain valid until expiration. For instant lockout upon suspension, ensure requests validate current database state or maintain a short token revocation cache.

### 4. Edge Caching & Headers
- Ensure that authenticated API routes (`/api/*`) are never cached by Cloudflare's CDN edge. Aildata correctly sets `Cache-Control: no-store, no-cache, must-revalidate` in CORS response headers.

### 5. Cloudflare Dashboard Settings
- **SSL/TLS:** Set encryption mode to **Full (strict)**.
- **Security:** Enable **HSTS** (HTTP Strict Transport Security) and configure Cloudflare WAF rate-limiting rules for sensitive auth endpoints (`/api/auth/login`).
