# Aildata Framework

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![React Native / Expo](https://img.shields.io/badge/Expo-SDK%2058-black.svg)](https://expo.dev/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1%20%2F%20Workers-orange.svg)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Aildata** is a high-performance, cloud-native database and spreadsheet management framework built for React Native Web and serverless edge deployment on **Cloudflare D1** and **Cloudflare Workers**. It provides real-time spreadsheet parsing (XLSX, ODS, CSV), deterministic relational schema normalization, 1-year automated data retention governance, and hardened Role-Based Access Control (RBAC).

---

## 🌟 Key Features

- **🌐 Cloud-Native Edge Architecture:** Fully consolidated to **Cloudflare D1** serverless SQLite at the edge. The application communicates exclusively with a Cloudflare Worker API gateway, ensuring high availability, sub-millisecond local reads, and low latency across all platforms.
- **🔐 Hardened Email Authentication & First-Use Setup:**
  - **First-Use Onboarding:** When deployed with an empty database (0 users), the Web UI automatically guides the initial user to create the root **Administrator** account.
  - **Self-Registration Lockout:** Once the root admin is created, public self-registration is permanently disabled. No other user can create an account or escalate their privileges without express intervention by an existing Administrator.
- **🛡️ Strict Role-Based Access Control (RBAC):**
  - **Admin:** Full access. Can invite team members via secure one-click activation links (users set their own passwords), select assigned roles (`viewer`, `analyst`, `admin`), execute 1-year retention purges, delete imported sheet categories, and clear database records.
  - **Analyst:** Ingestion access. Can upload and batch-ingest spreadsheet files (`.xlsx`, `.ods`, `.csv`) and manually create records.
  - **Viewer:** Read-only access. Can inspect normalized detainee profiles, search raw spreadsheets, and view analytics dashboards.
- **📊 Deterministic Relational Normalization & Ingestion:**
  - Client-side header scanner automatically detects header rows across rows `0..4` (eliminating issues with missing or banner headers).
  - Pre-import validation preview displays matched relational columns and valid vs. skipped row counts before confirming upload.
  - Worker ingestion pipeline atomically populates both the raw JSON snapshot (`dynamic_records`) and the normalized relational schema (`detainees` → `detentions` → `charges`, `legal_proceedings`, `correspondence`).
- **📈 Server-Side Analytics & Master-Detail Drilldown:**
  - Real-time aggregations calculated directly in SQLite at the edge (`/api/stats`), providing instant demographic breakdowns, top countries of origin, delivering agencies, and live entity counts.
  - Detainee drill-down modal providing instant access to full custody timelines, charges, and legal proceedings.
- **🧹 Automated 1-Year Retention Lifecycle:**
  - Cloudflare Worker Cron Trigger (`0 3 * * *`) snapshots daily metrics into `aggregate_rollups` so longitudinal reporting is permanently preserved.
  - Automated purge sweeps delete departed detention records older than 1 year (365 days), cascading to orphaned charges, legal notes, and detainees with no active detentions.

---

## 👥 Security & Account Provisioning Workflow

```
+-------------------------------------------------------------------------+
| Initial Deployment (0 Users in D1)                                      |
| -> Web UI displays "First-Time Setup: Create Administrator Account"     |
| -> First account created automatically receives root ADMIN privileges   |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
| System Initialized (1+ Users in D1)                                     |
| -> Public self-registration is permanently disabled                     |
| -> Login screen is restricted to Sign-In only                           |
| -> Only authenticated Admins can provision accounts via the Dashboard  |
+-------------------------------------------------------------------------+
```

---

## 📁 Project Structure

```text
aildata/
├── src/
│   ├── components/     # DetaineeDetailModal and shared UI components
│   ├── database/       # Cloudflare D1 schema (d1_schema.sql) and migrations
│   ├── services/       # Typed API client, storage abstraction, and 401 interceptor (dataService.ts)
│   └── views/          # Core views: DashboardView, SpreadsheetView, ImportFileView, AuthView
├── worker/
│   ├── index.ts        # Cloudflare Worker API gateway (Auth, RBAC, REST endpoints, Cron Trigger)
│   └── src/
│       ├── normalizer.ts # Header alias dictionary & relational batch builder
│       └── retention.ts  # 1-year retention purge & aggregate rollup engine
├── migrations/         # D1 SQL migration scripts (0002_indexes_and_lifecycle.sql)
├── App.tsx             # Main application shell & role-aware navigation
├── wrangler.toml       # Cloudflare Workers, D1 database binding, and Cron triggers
├── GEMINI.md           # Operational guidelines & fast local verification workflows
├── TECHNICAL_ARCHITECTURE.md # Comprehensive technical architectural specification
└── DEPLOYMENT_GUIDE.md # Complete deployment playbook for Workers, D1, and Pages
```

---

## 🔌 API Endpoints Summary

| Method & Path | Minimum Role | Description |
| :--- | :--- | :--- |
| `GET /api/auth/setup-status` | Public | Returns whether the system requires initial admin setup |
| `POST /api/auth/login` | Public | Authenticates credentials and returns JWT session token |
| `POST /api/auth/register` | **Admin** (or First Use) | Provisions a root admin account during initial setup |
| `POST /api/auth/invite` | **Admin** | Generates a 7-day secure one-click invitation link for a team member |
| `GET /api/auth/invite/:token` | Public | Validates an invitation token and returns pre-filled email and role |
| `POST /api/auth/activate` | Public | Allows invited users to choose their own password and activate account |
| `GET /api/records` | Viewer | Returns raw staging dynamic records (supports `?category=`) |
| `GET /api/detainees` | Viewer | Returns normalized detainees joined with latest detention summary |
| `GET /api/detainees/:id` | Viewer | Returns full master-detail relational profile |
| `GET /api/stats` | Viewer | Returns server-side SQL analytics and live entity counts |
| `POST /api/records/batch` | **Analyst** | Validates and atomically ingests rows into raw and relational tables |
| `DELETE /api/records/category/:cat` | **Admin** | Deletes a specific imported spreadsheet category |
| `DELETE /api/records` | **Admin** | Clears all dynamic records and cascades relational tables |
| `POST /api/maintenance/purge` | **Admin** | Triggers 1-year retention rollup and ephemeral purge on demand |

---

## 🚀 Getting Started

### Local Verification & Typechecking
```bash
npx tsc --noEmit          # Fast TypeScript compilation check
npm run build:web         # Production static bundle verification
```

### Local Development Server
```bash
EXPO_PUBLIC_API_BASE_URL="https://your-worker.workers.dev" npm run web
```

---

## ☁️ Cloudflare Deployment

For full deployment instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

1. **Deploy Database Schema:**
   ```bash
   npx wrangler d1 execute aildata-db --remote --file=./src/database/d1_schema.sql
   ```
2. **Deploy API Backend & Cron Trigger:**
   ```bash
   npx wrangler deploy
   ```
3. **Deploy Web Frontend to Cloudflare Pages:**
   ```bash
   npm run build:web
   npx wrangler pages deploy dist --project-name=aildata-web
   ```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
