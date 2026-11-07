# Implementation Plan: Migrating to Cloudflare D1 Database & Worker API (with Email Auth & RBAC Security)

## Objective
Migrate the `aildata` application from client-side `expo-sqlite` and browser `localStorage` to **Cloudflare D1** (serverless SQLite at the edge) backed by a **Cloudflare Worker API**, incorporating full **Security, Authentication (AuthN), and Authorization (AuthZ)** centered around **email-based user accounts** and Role-Based Access Control (RBAC).

---

## Architecture Strategy

1. **Database Layer (Cloudflare D1) - Email & Users Schema:**
   - **`users` Table:**
     - `id` (TEXT, PRIMARY KEY)
     - `email` (TEXT, UNIQUE, NOT NULL - primary identifier for user accounts)
     - `password_hash` (TEXT, NOT NULL - securely hashed using Web Crypto PBKDF2)
     - `role` (TEXT, NOT NULL DEFAULT 'viewer' - e.g. `admin`, `analyst`, `viewer`)
     - `created_at` (DATETIME)
   - **`dynamic_records` Table:**
     - Standard records table from existing schema.

2. **Backend Security, Authentication & Authorization Layer (Cloudflare Workers):**
   - **Email Authentication (AuthN):**
     - `POST /api/auth/register`: Accepts user **email** and password, checks for unique email, hashes password, and creates the account in Cloudflare D1.
     - `POST /api/auth/login`: Accepts user **email** and password, verifies credentials against D1, and returns a signed JWT token.
     - JWT verification middleware validating requests via the `Authorization: Bearer <token>` header.
   - **Role-Based Authorization (AuthZ):**
     - RBAC middleware evaluating user **email** and assigned `role`:
       - `admin`: Full access (read, write, delete/clear database, manage users).
       - `analyst`: Read and write (import records, view spreadsheets, view analytics).
       - `viewer`: Read-only access to dashboard and spreadsheets.

3. **Frontend Data Service & Auth State (`src/services/dataService.ts`):**
   - Manage logged-in user **email** and session token state.
   - Store JWT token securely (Expo SecureStore for mobile, localStorage for web).
   - Attach `Authorization: Bearer <token>` header to all API requests.

---

## Implementation Phases

### Phase 1: Cloudflare D1 & Users Schema Update
1. Update `src/database/schema.sql` to include the `users` table with **email uniqueness constraints**:
   ```sql
   CREATE TABLE IF NOT EXISTS users (
       id TEXT PRIMARY KEY,
       email TEXT UNIQUE NOT NULL,
       password_hash TEXT NOT NULL,
       role TEXT NOT NULL DEFAULT 'viewer',
       created_at DATETIME DEFAULT CURRENT_TIMESTAMP
   );
   ```
2. Execute schema against D1: `npx wrangler d1 execute aildata-db --file=./src/database/schema.sql`.

### Phase 2: Cloudflare Worker Email Auth & API Backend
1. Implement password hashing using Web Crypto API (`crypto.subtle` PBKDF2) for edge compatibility.
2. Implement JWT signing and verification middleware in Cloudflare Workers.
3. Build email-centric authentication endpoints:
   - `/api/auth/register` (email + password registration)
   - `/api/auth/login` (email + password authentication)
   - `/api/records` (protected by JWT & RBAC checking user email/role)

### Phase 3: Frontend Integration
1. Add Login and Registration screens allowing users to sign up and sign in using their **email**.
2. Update `src/services/dataService.ts` to include authentication headers and email session state.

### Phase 4: Deployment & Validation
1. Deploy Worker to Cloudflare (`npx wrangler deploy`).
2. Test end-to-end **email registration**, **email login**, JWT token validation, RBAC authorization, and secure spreadsheet data imports.
