# Aildata Framework - Technical Architecture Documentation

This document provides a comprehensive technical specification of the **Aildata** framework, detailing its cloud-native architecture, dual-tier relational database schema, Cloudflare Worker backend, secure email authentication with first-use setup, deterministic ingestion normalizer, and 1-year automated retention governance.

---

## 1. System Architecture & Overview

Aildata is built as a cloud-native application running on a pure serverless edge architecture powered by **Cloudflare D1** and **Cloudflare Workers**:

- **Frontend Application:** React Native (Expo SDK 58 / React Native Web) providing responsive workspaces across desktop and mobile devices.
- **Backend Edge Gateway:** Cloudflare Worker (`worker/index.ts`) handling REST endpoints, RBAC security middleware, D1 batch transactions, and scheduled cron jobs.
- **Database Engine:** Serverless SQLite at the edge via **Cloudflare D1** (`aildata-db`).
- **Security & RBAC:** PBKDF2 Web Crypto password hashing, secure JWT bearer tokens, initial admin bootstrapping with permanent public self-registration lockout, and role enforcement (`viewer`, `analyst`, `admin`).
- **Data Lifecycle Governance:** Ephemeral 1-year retention policy with daily summary metric rollups and cascading deletion of expired custody detentions.

---

## 2. Database Schema Design (`src/database/d1_schema.sql`)

The database architecture employs a **Dual-Tier Storage Strategy**:

### Tier 1 — Raw Dynamic Staging (`dynamic_records`)
Stores immutable JSON snapshots of imported spreadsheet rows (`category = import_<sheetName>`), guaranteeing auditability and zero data loss regardless of source schema variance.

### Tier 2 — Normalized Relational Core
Structured relational tables populated deterministically during batch ingestion:
- **`detainees`:** Core subject profiles (`id`, `jacket_number`, `name`, `age`, `race`, `sex`, `country`, `ice_case_number`, `is_uncharged`, `created_at`, `updated_at`).
- **`detentions`:** Facility stays and bookings (`id`, `detainee_id`, `book_date_gcj`, `departure_date`, `cell`, `days_in_gcj`, `days_prior_facility`, `came_from`, `sent_to_note`, `delivering_agency`, `duplicate_jacket_returned`).
- **`charges`:** Child offenses linked to detentions (`id`, `detention_id`, `charge_description`).
- **`legal_proceedings`:** Judicial rulings and orders linked to detentions (`id`, `detention_id`, `judge_ordered`, `decision_date`, `day_wait`, `notes`).
- **`correspondence`:** Penpal connections and location notes (`id`, `detainee_id`, `penpal`, `loc_note`).

### Tier 3 — Users & Retention Rollups
- **`users`:** Secure accounts (`id`, `email`, `password_hash`, `role`, `created_at`).
- **`aggregate_rollups`:** Permanent daily metric snapshots (`snapshot_date`, `total_active`, `total_released`, `with_penpal`, `by_country_json`, `by_agency_json`, `by_sex_json`).

---

## 3. Security, Authentication & Initial Admin Setup

### Initial Setup Flow (`GET /api/auth/setup-status`)
1. On boot, the client checks `/api/auth/setup-status`.
2. If `SELECT COUNT(*) FROM users` is `0`, the API reports `needsSetup: true`.
3. The frontend displays the initial administrator setup form. The first account created is automatically assigned the `admin` role.
4. Once the first account exists, `needsSetup` becomes `false` permanently. Public self-registration is completely disabled.

### One-Click Team Invites & Self-Activation
- Any subsequent user creation requires an authenticated administrator token (`role === 'admin'`).
- **No Admin-Managed Passwords:** Administrators use `POST /api/auth/invite` to generate a 7-day cryptographically secure activation token (`invite_token`).
- The administrator copies the activation link (e.g. `https://app.aildata.org/?invite=inv_...`) and sends it to the team member.
- The team member opens the link, the client validates the token via `GET /api/auth/invite/:token`, and the user chooses their own password via `POST /api/auth/activate`.
- Once activated, the one-time token is cleared, the user's password hash is stored, and an authenticated JWT session is issued immediately.

---

## 4. Ingestion Normalization Pipeline (`worker/src/normalizer.ts`)

During `POST /api/records/batch`:
1. **Header Alias Resolution:** Inspects arbitrary column keys against a dictionary of aliases (e.g., `COO` / `Country of Origin` → `country`; `Book Date in GCJ` → `book_date_gcj`; `Charges` → `charges`).
2. **Charge Splitting:** Semicolon `;` and newline separated charges are split into individual child rows in `charges`.
3. **Atomic Batching:** Statements for raw staging and relational tables are combined and executed in atomic chunks of 80 statements via `env.DB.batch([...])`.

---

## 5. Automated 1-Year Retention Lifecycle (`worker/src/retention.ts`)

To balance historical data retention with privacy and storage efficiency:
- **Daily Cron Trigger:** Runs daily at 03:00 UTC (`crons = ["0 3 * * *"]`).
- **Rollup Preservation:** Calculates total active, released, penpal counts, and demographic distributions for the day and saves an immutable row into `aggregate_rollups`.
- **1-Year Purge Sweep:**
  - Deletes detention records where `departure_date < (today - 365 days)`.
  - Cascades deletions to associated `charges`, `legal_proceedings`, and `correspondence`.
  - Prunes orphaned detainees who have no remaining detention records.
  - Deletes raw dynamic staging records older than 1 year (`created_at < datetime('now', '-1 year')`).
- **On-Demand Admin Purge:** Administrators can trigger the rollup and purge routine on demand via `POST /api/maintenance/purge`.

---

## 6. API Gateway Contract (`worker/index.ts`)

| Method & Path | Minimum Role | Description |
| :--- | :--- | :--- |
| `GET /api/auth/setup-status` | Public | Returns `{ needsSetup: boolean }` based on user count |
| `POST /api/auth/login` | Public | Validates credentials and returns 7-day JWT session token |
| `POST /api/auth/register` | **Admin** (or First Use) | Provisions root admin account during initial setup |
| `POST /api/auth/invite` | **Admin** | Generates a 7-day secure one-click activation link for a colleague |
| `GET /api/auth/invite/:token` | Public | Validates an invitation link and returns pre-filled email and role |
| `POST /api/auth/activate` | Public | Allows invited users to choose their own password and activate account |
| `GET /api/records` | Viewer | Returns raw dynamic records (supports `?category=`) |
| `GET /api/detainees` | Viewer | Returns normalized subjects joined with latest detention summary |
| `GET /api/detainees/:id` | Viewer | Returns full master-detail relational profile |
| `GET /api/stats` | Viewer | Returns server-side SQL analytics and live entity counts |
| `POST /api/records/batch` | **Analyst** | Batch-ingests rows into raw staging and normalized relational tables |
| `DELETE /api/records/category/:cat` | **Admin** | Deletes all records belonging to an imported sheet category |
| `DELETE /api/records` | **Admin** | Clears all dynamic records and cascades relational entities |
| `POST /api/maintenance/purge` | **Admin** | Manually triggers the 1-year rollup snapshot and purge job |
