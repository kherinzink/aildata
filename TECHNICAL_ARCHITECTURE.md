# Aildata Framework - Technical Architecture Documentation

This document provides a comprehensive technical overview of the **Aildata** framework, detailing its cloud-native architecture, database schema, Cloudflare Worker backend, secure email authentication, and spreadsheet import pipeline.

---

## 1. System Architecture & Overview

Aildata is built as a cloud-native application transitioning from a local-first model to a pure serverless edge architecture powered by **Cloudflare D1** and **Cloudflare Workers**.

- **Frontend:** React Native Web (`App.tsx`, views for Dashboard, Spreadsheet Grid, File Import, and Auth).
- **Backend Edge API:** Cloudflare Worker (`worker/index.ts`) handling REST endpoints, security middleware, and D1 database integration.
- **Database:** Serverless SQLite at the edge via **Cloudflare D1**.
- **Security Layer:** Email-based user registration and authentication with PBKDF2 password hashing, secure JWT session tokens, and hardened Role-Based Access Control (RBAC).

---

## 2. Database Schema Design

The relational schema is optimized for SQLite and Cloudflare D1 (`src/database/d1_schema.sql`):

1. **`dynamic_records`**: Flexible key-value/JSON store used for high-performance bulk imports of unstructured spreadsheet rows.
2. **Normalized Relational Tables**:
   - `detainees`: Core subject profiles.
   - `detentions`: Booking and facility stays.
   - `charges`: Legal charges linked to detentions.
   - `legal_proceedings`: Judge orders and hearing dates.
   - `correspondence`: Penpals and location notes.
3. **`users` Table (Authentication & RBAC)**:
   - `id` (TEXT, PRIMARY KEY)
   - `email` (TEXT, UNIQUE, NOT NULL)
   - `password_hash` (TEXT, NOT NULL - securely hashed using Web Crypto PBKDF2)
   - `role` (TEXT, NOT NULL DEFAULT 'viewer' - `admin`, `analyst`, `viewer`)
   - `created_at` (DATETIME)

---

## 3. Cloudflare Worker API Backend (`worker/index.ts`)

The Cloudflare Worker acts as the serverless API gateway connecting the frontend to Cloudflare D1:

- **Security Middleware**: 
  - Verifies JWT session tokens.
  - Enforces RBAC permissions at the edge.
  - **Hardened Registration**: Ensures that privileged roles (`admin`, `analyst`) can only be assigned by existing administrators.
- **Email Authentication (AuthN)**:
  - `POST /api/auth/register`: Hashes passwords using Web Crypto PBKDF2 (100,000 iterations, SHA-256).
  - `POST /api/auth/login`: Validates credentials and issues signed JWT session tokens.
- **Data REST Endpoints**:
  - `GET /api/records`: Fetches dynamic records.
  - `POST /api/records/batch`: Executes high-performance batch insertions using D1 transactions.
  - `DELETE /api/records`: Clears all dynamic records.

---

## 4. Frontend Data Service & State (`src/services/dataService.ts`)

The data abstraction layer provides a unified interface to the Cloudflare Worker API:

- **Session & Token Management**: Securely manages bearer tokens and user emails in `localStorage`, automatically attaching `Authorization: Bearer <token>` headers to all secure API requests.
- **API Consolidation**: All data mutations and queries are routed exclusively to the configured `EXPO_PUBLIC_API_BASE_URL`.

---

## 5. Spreadsheet Import Pipeline (`ImportFileView.tsx`)

Aildata supports high-speed client-side parsing of `.xlsx`, `.ods`, and `.csv` files using SheetJS:

- **Validation & Batching**: Validates row data and performs instant bulk batch insertions into Cloudflare D1, preventing UI freezing during large imports.
- **Automatic Category Mapping**: Maps imported sheets to dynamic record categories automatically.

---

## 6. Security & Authorization (RBAC)

Authorization is enforced via Role-Based Access Control (RBAC) at both the Frontend and the Backend Edge:
- **`admin`**: Full privileges including user management, database clearing, and data mutations.
- **`analyst`**: Data import privileges, spreadsheet management, and record creation.
- **`viewer`**: Read-only access to dashboards and spreadsheet grids.
