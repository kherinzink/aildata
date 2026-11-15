This design plan unifies your React Native (Expo Web/Native) frontend, Cloudflare Worker API, and Cloudflare D1 relational/dynamic schema into a cohesive, production-ready architecture. It closes the current gaps between the flat `dynamic_records` import pipeline, the normalized relational tables (`detainees`, `detentions`, `charges`, `legal_proceedings`, `correspondence`), RBAC enforcement across the UI, and automated data lifecycle governance.

---

## 1. System Architecture & Cloudflare Topology

* **Frontend Hosting (Cloudflare Pages):** Deploy the Expo Web build (`npx expo export -p web`) to Cloudflare Pages. Configure `EXPO_PUBLIC_API_BASE_URL` at build time to point to your Worker route or custom domain (`[https://aildata.khanis.workers.dev](https://aildata.khanis.workers.dev)`).
* **Compute & API Gateway (Cloudflare Workers):** Single Worker handling authentication, RBAC middleware, D1 batch ingestion/normalization, relational queries, and scheduled maintenance (`scheduled()` Cron Trigger).
* **Persistence Layer (Cloudflare D1):**
* **Tier 1 — Raw Staging (`dynamic_records`):** Stores immutable JSON snapshots of imported rows (`category = import_<sheetName>`) for auditability and flexible schema capture.
* **Tier 2 — Normalized Core (`detainees` → `detentions` → `charges`, `legal_proceedings`, `correspondence`):** Structured relational tables populated deterministically during ingestion, enabling cross-sheet deduplication, longitudinal custody tracking, and fast SQL aggregations.
* **Tier 3 — Auth & Sessions (`users` + D1/KV session store):** Email/password auth with 128-char opaque session tokens (or signed tokens) mapped to `viewer`, `analyst`, and `admin` roles.



---

## 2. Database & Ingestion Pipeline Plan

### A. Schema Enhancements (D1 Migration `0002_indexes_and_lifecycle.sql`)

Your current schema has primary keys and foreign keys (`ON DELETE CASCADE`), but needs indexes for fast deduplication and retention sweeps:

```sql
-- Natural key & search indexes
CREATE INDEX IF NOT EXISTS idx_detainees_jacket ON detainees(jacket_number);
CREATE INDEX IF NOT EXISTS idx_detainees_ice_case ON detainees(ice_case_number);
CREATE INDEX IF NOT EXISTS idx_detainees_name ON detainees(name);
CREATE INDEX IF NOT EXISTS idx_detentions_detainee_id ON detentions(detainee_id);
CREATE INDEX IF NOT EXISTS idx_detentions_departure ON detentions(departure_date);
CREATE INDEX IF NOT EXISTS idx_dynamic_records_category ON dynamic_records(category);

-- Ephemeral retention tracking & permanent roll-up snapshots
ALTER TABLE detainees ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE detainees ADD COLUMN is_uncharged INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS aggregate_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date DATE NOT NULL UNIQUE,
    total_active INTEGER NOT NULL,
    total_released INTEGER NOT NULL,
    with_penpal INTEGER NOT NULL,
    by_country_json TEXT NOT NULL,
    by_agency_json TEXT NOT NULL,
    by_sex_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

```

### B. Deterministic Spreadsheet-to-Relational Normalization

Move header normalization and relational splitting into the Worker's `POST /api/records/batch` handler (wrapped in `env.DB.batch([...])` for atomic D1 writes):

1. **Header Alias Dictionary:** Map incoming spreadsheet keys (case-insensitive, trimmed) to exact D1 columns:
* **`detainees`:** `jacket_number` (`Jacket #`, `Jacket Number`), `name` (`Name`, `Detainee Name`), `age` (`Age`), `race` (`Race`), `sex` (`Sex`, `Gender`), `country` (`Country`, `COO`, `Country of Origin`), `ice_case_number` (`ICE Case #`, `A-Number`, `Case Number`).
* **`detentions`:** `book_date_gcj` (`Book Date`, `GCJ Book Date`), `departure_date` (`Departure Date`, `Release Date`, `Dep Date`), `cell` (`Cell`, `Housing`), `days_in_gcj` (`Days in GCJ`), `days_prior_facility` (`Days Prior Facility`), `came_from` (`Came From`), `sent_to_note` (`Sent To`, `Sent To Note`), `delivering_agency` (`Delivering Agency`), `duplicate_jacket_returned` (`Duplicate Jacket Returned`).
* **`charges`:** `charge_description` (`Charge`, `Charges`, `Offense` — split on `;` or `\n` into separate child rows).
* **`legal_proceedings`:** `judge_ordered` (`Judge Ordered`), `decision_date` (`Decision Date`), `day_wait` (`Day Wait`), `notes` (`Notes`, `Legal Notes`, `Habeas Notes`).
* **`correspondence`:** `penpal` (`Penpal`, `Pen Pal`), `loc_note` (`Loc Note`, `Location Note`).


2. **Entity Resolution (Upsert Logic):**
* Look up existing `detainees.id` by `jacket_number` (first priority), then `ice_case_number` (second priority), then normalized `LOWER(TRIM(name)) + LOWER(TRIM(country))`.
* If found, update mutable fields (`age`, `updated_at`) without duplicating the person; if not found, generate a UUID (`crypto.randomUUID()`) and insert into `detainees`.
* Upsert `detentions` keyed on `(detainee_id, book_date_gcj)` and replace/append child rows in `charges`, `legal_proceedings`, and `correspondence`.
* Simultaneously insert the raw row into `dynamic_records` under `category` so original cell values are preserved.



### C. Ephemeral Retention & Automated Purge Policy (Cloudflare Cron Trigger)

To support automated 1-year TTL hygiene without losing historical metrics:

* Configure a daily Cron Trigger in `wrangler.toml` (`crons = ["0 3 * * *"]`).
* Before purging expired records, write a daily summary row into `aggregate_rollups` so `DashboardView` retains historical trend counts permanently.
* Delete expired `detentions` (and cascade-delete orphaned `charges`, `legal_proceedings`, `correspondence`, and `detainees` with no remaining detentions) where `departure_date` is older than 1 year (365 days), plus matching `dynamic_records` rows older than 1 year.

---

## 3. API Contract & RBAC Matrix

### Endpoint Specifications

| Method & Path | Minimum Role | Purpose |
| --- | --- | --- |
| `POST /api/auth/login` | Public | Validates email/password hash, issues 128-char token + `{ email, role }` |
| `POST /api/auth/register` | **`admin`** | Creates a new `viewer`, `analyst`, or `admin` account |
| `GET /api/records` | `viewer` | Returns `dynamic_records` (supports `?category=...` and `?limit=&offset=`) |
| `GET /api/detainees` | `viewer` | Returns normalized `detainees` joined with active/latest `detentions` summary |
| `GET /api/detainees/:id` | `viewer` | Full master-detail payload (`detainee`, `detentions[]`, `charges[]`, `legal_proceedings[]`, `correspondence[]`) |
| `GET /api/stats` | `viewer` | Server-side SQL aggregations (active vs. released, top COO, top agencies, sex breakdown, live table counts) |
| `POST /api/records/batch` | **`analyst`** | Validates rows, writes raw `dynamic_records`, and atomically normalizes into relational tables |
| `DELETE /api/records/category/:cat` | **`admin`** | Deletes a specific imported sheet category |
| `DELETE /api/records` | **`admin`** | Full database reset (clears `dynamic_records` and cascades `detainees`) |
| `POST /api/maintenance/purge` | **`admin`** | Manually triggers the 1-year TTL rollup + purge job on demand |

---

## 4. Frontend Refactoring & UI/UX Plan

### A. Cross-Platform Auth & Storage (`services/dataService.ts`)

* **Platform-Aware Token Storage:** Replace raw `localStorage` calls with a small storage adapter (`localStorage` on `Platform.OS === 'web'`, `expo-secure-store` on iOS/Android) so native builds persist sessions properly.
* **401 Interceptor:** If any API call returns `401 Unauthorized` (expired/revoked token), automatically call `logoutUser()` and trigger the root app shell to return to `AuthView`.
* **New Typed Service Methods:** Add `getDetainees()`, `getDetaineeDetail(id)`, `getDashboardStats()`, and `runRetentionPurge(days)` alongside the existing methods.

### B. Root App Shell & Role-Aware Navigation (`App.tsx`)

* **Session Hydration on Boot:** Check `getAuthToken()` and `getAuthUser()` on mount. If missing, render `AuthView`; if present, render the authenticated workspace shell.
* **Header Bar:** Display the signed-in user's `email`, a color-coded role badge (`VIEWER` / `ANALYST` / `ADMIN`), and a **Sign Out** button (`logoutUser()`).
* **Role-Gated Tab Navigation:**
* `viewer`: **Dashboard** | **Spreadsheet**
* `analyst`: **Dashboard** | **Spreadsheet** | **Import**
* `admin`: **Dashboard** | **Spreadsheet** | **Import**



### C. Component-by-Component Upgrades

1. **`AuthView.tsx` (Sign-In Only):**
* Remove `isRegistering`, the `"Don't have an account? Register"` toggle, and the unauthenticated role selector buttons (`viewer`, `analyst`, `admin`), eliminating the broken pre-login registration flow.


2. **`ImportFileView.tsx` (Smart Header Detection & Native File Picker):**
* **Fix `range: 1` Bug:** Replace hardcoded `range: 1` with a header-row scanner that inspects rows `0..4` for recognizable header tokens (`name`, `jacket`, `country`, `agency`, `book`) so Row 1 headers are never skipped when a title banner is absent.
* **Pre-Import Preview:** Show detected column mappings (e.g., `Matched: Name, Country, Delivering Agency, Departure Date`) and row validation counts (`42 valid rows, 3 blank rows skipped`) before confirming upload.
* **Native Mobile Support:** Add `expo-document-picker` fallback when `Platform.OS !== 'web'` so analysts can import XLSX/CSV files from iOS/Android as well as web.


3. **`DashboardView.tsx` (Server-Backed Analytics & Admin Controls):**
* **Dynamic Cutoff Date:** Replace hardcoded `new Date('2026-11-02')` with `new Date()` (and optionally an "As-of Date" selector).
* **Server-Side Aggregations:** Prefer `GET /api/stats` over client-side `JSON.parse` loops so analytics scale smoothly past thousands of D1 rows and reflect deduplicated `detainees` rather than counting duplicate sheet rows twice.
* **Live Relational Entity Counts:** Turn the static `['detainees', 'detentions', ...]` badges into live record counts from `/api/stats`.
* **Admin-Only Sections (`role === 'admin'`):**
* **User Provisioning Card:** Email input, temporary password input, role pill selector (`viewer` | `analyst` | `admin`), and submit button wired to `registerUser()`.
* **Retention & Maintenance Card:** Gate category deletion badges and `Clear Database Records` strictly behind `isAdmin`, and add a **Run 1-Year Retention Purge** button.




4. **`SpreadsheetView.tsx` (Multi-View Mode & Detainee Drilldown):**
* **Dataset Mode Switcher:** Add top filter pills switching between **Normalized Detainees** (default, deduplicated view) and **Raw Imported Sheets** (`all` or individual `import_*` categories) so unrelated spreadsheet schemas don't collide in one wide table.
* **Sorting & Counter Fixes:** Switch column sorting to `localeCompare(..., undefined, { numeric: true })` so ages, jacket numbers, and day counts sort numerically, and fix the `0` results display (`Showing 0 - 0 of 0`).
* **Detainee Detail Modal:** Clicking any row opens a structured slide-over/modal displaying the full relational record (`detainees` profile, `detentions` timeline, `charges` list, `legal_proceedings` orders/dates, and `correspondence` penpal notes).



---

## 5. Phased Implementation Sequence

1. **Phase 1 — Security & UI Alignment (Immediate):**
* Strip self-registration from `AuthView.tsx`; add the Admin User Registration card and role-gating (`isAdmin` / `canImport`) to `DashboardView.tsx` and `App.tsx`; fix `ImportFileView.tsx` header detection (`range` scanner) and `SpreadsheetView.tsx` numeric sorting/filter pills.


2. **Phase 2 — D1 Relational Normalization & API Expansion:**
* Apply migration `0002_indexes_and_lifecycle.sql` via `wrangler d1 execute`; update Worker `POST /api/records/batch` to upsert into `detainees`, `detentions`, `charges`, `legal_proceedings`, and `correspondence`; add `GET /api/detainees`, `GET /api/detainees/:id`, and `GET /api/stats`.


3. **Phase 3 — Master-Detail Drilldown & Automated Retention:**
* Connect `DashboardView` to `/api/stats` and `SpreadsheetView` to the Detainee Detail modal; deploy the Cloudflare Worker Cron Trigger for daily `aggregate_rollups` snapshots and 1-year ephemeral purges.


---


Here is the exact file-level inventory across both the React Native (Expo) frontend and the Cloudflare Worker / D1 backend to execute the full design plan.

---

### 1. Files to Change (Modify)

#### Frontend (React Native / Expo)

* **`src/services/dataService.ts`** *(or `services/dataService.ts`)*
* Add typed interfaces for `DetaineeSummary`, `DetaineeDetail`, and `DashboardStats`.
* Add API client methods: `getDetainees()`, `getDetaineeDetail(id)`, `getDashboardStats()`, and `runRetentionPurge()`.
* Add a global `401 Unauthorized` response handler that clears the session and triggers a sign-out callback.
* Route token/user persistence through a cross-platform storage helper (`localStorage` on web, `expo-secure-store` / `AsyncStorage` on native).


* **`src/components/AuthView.tsx`** *(or `components/AuthView.tsx`)*
* Remove `isRegistering`, `role` state, the `"Don't have an account? Register"` toggle button, and the public `viewer / analyst / admin` role selector so unauthenticated users only see Sign In.


* **`src/components/DashboardView.tsx`**
* Replace the hardcoded `new Date('2026-11-02')` cutoff with `new Date()`.
* Consume server-side `/api/stats` aggregations and live table row counts for `detainees`, `detentions`, `charges`, `legal_proceedings`, and `correspondence` (falling back to client-side `records` calculation if offline/cached).
* Gate category deletion badges (`deleteCategoryRecords`), `Clear Database Records`, and the new **Run 1-Year Retention Purge** trigger behind `getAuthUser()?.role === 'admin'`.
* Add the **Admin User Provisioning** card (`email`, `password`, and `['viewer', 'analyst', 'admin']` selector calling `registerUser()`), gated by `isAdmin`.


* **`src/components/ImportFileView.tsx`**
* Replace hardcoded `range: 1` with an automatic header-row detector scanning rows `0..4` so spreadsheets without a top banner row don't lose their headers.
* Add a pre-import preview showing matched relational columns and valid vs. skipped row counts.
* Add `expo-document-picker` support for non-web (`Platform.OS !== 'web'`) file selection.


* **`src/components/SpreadsheetView.tsx`**
* Add a top filter bar to toggle between **Normalized Detainees** and **Raw Imported Sheets** (`all` or individual `import_*` categories).
* Fix column sorting to use `localeCompare(..., undefined, { numeric: true })` and fix the empty-state counter (`Showing 0 - 0 of 0`).
* Make table rows tappable (`TouchableOpacity`) to open the Detainee Master-Detail modal.


* **`App.tsx`** *(or `app/index.tsx`)*
* Hydrate session state on mount via `getAuthToken()` / `getAuthUser()`, rendering `AuthView` when signed out.
* Render a top workspace header displaying the logged-in email, role badge (`VIEWER` / `ANALYST` / `ADMIN`), and **Sign Out** button (`logoutUser()`).
* Gate the **Import** tab behind `role === 'analyst' || role === 'admin'` so `viewer` accounts only see **Dashboard** and **Spreadsheet**.



#### Backend (Cloudflare Worker & Config)

* **`worker/src/index.ts`** *(or your Worker entry file)*
* Update `POST /api/records/batch` to map incoming spreadsheet keys to relational columns, upsert `detainees` (keyed on `jacket_number` / `ice_case_number` / normalized `name + country`) and `detentions`, and split/insert child records into `charges`, `legal_proceedings`, and `correspondence` inside a single `env.DB.batch([...])` transaction alongside the raw `dynamic_records` insert.
* Add `GET /api/detainees`, `GET /api/detainees/:id`, `GET /api/stats`, and `POST /api/maintenance/purge` routes with RBAC middleware (`viewer`, `analyst`, `admin`).
* Export a `scheduled(event, env, ctx)` handler to snapshot daily metrics into `aggregate_rollups` and purge expired detention records older than 1 year (365 days).


* **`wrangler.toml`** *(or `wrangler.jsonc`)*
* Add the `[triggers]` block (`crons = ["0 3 * * *"]`) so Cloudflare runs the daily retention sweep automatically.



---

### 2. Files to Create (New)

* **`migrations/0002_indexes_and_lifecycle.sql`** *(or `schema/0002_indexes_and_lifecycle.sql`)*
* Adds indexes on `detainees(jacket_number)`, `detainees(ice_case_number)`, `detainees(name)`, `detentions(detainee_id)`, `detentions(departure_date)`, and `dynamic_records(category)`.
* Adds `updated_at` and `is_uncharged` columns to `detainees` and creates the `aggregate_rollups` table for permanent summary metrics.


* **`worker/src/normalizer.ts`** *(Backend Helper)*
* Isolates the header alias dictionary (`COO` → `country`, `Book Date` → `book_date_gcj`, etc.), charge splitting, and D1 `PreparedStatement` batch builder so `worker/src/index.ts` stays clean and testable.


* **`worker/src/retention.ts`** *(Backend Helper)*
* Shared logic called by both the daily `scheduled()` Cron Trigger and `POST /api/maintenance/purge` to compute `aggregate_rollups` and execute cascading 1-year TTL deletes.


* **`src/components/DetaineeDetailModal.tsx`** *(Frontend Modal/Drawer)*
* Renders the full relational profile when a row is clicked in `SpreadsheetView`: `detainees` header card, `detentions` timeline, `charges` list, `legal_proceedings` rulings/wait times, and `correspondence` penpal/location notes.


* **`src/utils/storage.ts`** *(Frontend Helper — Optional if keeping Web-Only)*
* Wraps `localStorage` (web) and `expo-secure-store` / `AsyncStorage` (native) behind a unified interface for `dataService.ts`.



---

### 3. Files to Delete (Remove)

* **None required.** Every existing file in your codebase maps directly to a permanent role in the target architecture. The only removals are **code blocks inside existing files**—specifically the unauthenticated registration UI inside `AuthView.tsx` and the hardcoded date / `range: 1` assumptions inside `DashboardView.tsx` and `ImportFileView.tsx`.
