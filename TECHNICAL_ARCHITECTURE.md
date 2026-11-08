# Aildata Framework - Technical Architecture Documentation

This document provides a comprehensive technical overview of the **Aildata** framework, detailing its system architecture, database schema, Cloudflare Worker backend, email authentication and authorization, frontend services, and spreadsheet import pipeline.

---

## 1. System Architecture & Overview

Aildata is built as a hybrid cross-platform application (supporting Web via React Native Web and Mobile via Expo / React Native) transitioning to a serverless edge architecture powered by **Cloudflare D1** and **Cloudflare Workers**.

- **Frontend:** React Native / Expo (`App.tsx`, views for Dashboard, Spreadsheet Grid, File Import, and Record Insertion).
- **Backend Edge API:** Cloudflare Worker (`worker/index.ts`) handling REST endpoints and business logic at the edge.
- **Database:** Serverless SQLite at the edge via **Cloudflare D1**, with local fallback to `expo-sqlite` (mobile) or `localStorage` (browser).
- **Security Layer:** Email-based user registration and authentication with PBKDF2 password hashing, session tokens, and Role-Based Access Control (RBAC).

---

## 2. Database Schema Design

The relational schema is optimized for SQLite and Cloudflare D1 (`src/database/schema.sql` and `src/database/d1_schema.sql`):

1. **`schema_migrations`**: Tracks applied database migrations.
2. **`dynamic_records`**: Flexible key-value/JSON cache store (`id`, `category`, `data_json`) used for high-performance bulk imports of unstructured spreadsheet rows (ODS, XLSX, CSV).
3. **Normalized Relational Tables**:
   - `detainees`: Core subject profiles (`jacket_number`, `name`, `age`, `race`, `sex`, `country`, `ice_case_number`).
   - `detentions`: Booking and facility stays linked via foreign keys.
   - `charges`: Legal charges linked to detentions.
   - `legal_proceedings`: Judge orders and hearing dates.
   - `correspondence`: Penpals and location notes (`penpal`, `loc_note`).
4. **`users` Table (Authentication & RBAC)**:
   - `id` (TEXT, PRIMARY KEY)
   - `email` (TEXT, UNIQUE, NOT NULL - primary identifier)
   - `password_hash` (TEXT, NOT NULL - securely hashed using Web Crypto PBKDF2)
   - `role` (TEXT, NOT NULL DEFAULT 'viewer' - e.g., `admin`, `analyst`, `viewer`)
   - `created_at` (DATETIME)

---

## 3. Cloudflare Worker API Backend (`worker/index.ts`)

The Cloudflare Worker acts as the serverless API gateway connecting the frontend to Cloudflare D1:

- **CORS & Preflight Handling**: Fully configured CORS headers (`Access-Control-Allow-Origin: *`) supporting web clients.
- **Email Authentication (AuthN)**:
  - `POST /api/auth/register`: Hashes passwords using Web Crypto PBKDF2 (100,000 iterations, SHA-256) and stores unique email accounts in D1.
  - `POST /api/auth/login`: Validates email credentials against D1 and issues signed session tokens.
- **Data REST Endpoints**:
  - `GET /api/records`: Fetches dynamic records (optionally filtered by category/sheet).
  - `POST /api/records/batch`: Executes high-performance batch insertions for spreadsheet imports using D1 transactions (`env.DB.batch()`).
  - `DELETE /api/records`: Clears all dynamic records.
  - `DELETE /api/records/category/:category`: Deletes records associated with a specific imported sheet or database table.

---

## 4. Frontend Data Service & State (`src/services/dataService.ts`)

The data abstraction layer (`dataService.ts`) provides a unified interface across environments:

- **Environment Detection**: If `EXPO_PUBLIC_API_BASE_URL` is configured, it routes all queries and mutations to the Cloudflare Worker API. Otherwise, it defaults to local `expo-sqlite` (mobile) or `localStorage` (web).
- **Session & Token Management**: Securely manages bearer tokens and user emails in local storage / secure storage, automatically attaching `Authorization: Bearer <token>` headers to secure API requests.

---

## 5. Spreadsheet Import Pipeline (`ImportFileView.tsx`)

Aildata supports high-speed client-side parsing of `.xlsx`, `.ods`, and `.csv` files using SheetJS (`xlsx`):

- **Header & Range Handling**: Skips metadata header rows using `range: 1` (`sheet_to_json`) to ensure column headers are correctly aligned.
- **Validation & Batching**: Validates row data and performs instant bulk batch insertions into the database, preventing UI freezing on large datasets.

---

## 6. Security & Authorization (RBAC)

Authorization is enforced via Role-Based Access Control (RBAC) tied to user accounts:
- **`admin`**: Full administrative privileges including clearing databases, user management, and data mutations.
- **`analyst`**: Data import privileges, spreadsheet management, and analytics viewing.
- **`viewer`**: Read-only access to dashboards, analytics, and spreadsheet grids.
