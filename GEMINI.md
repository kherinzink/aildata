# Project Instructions & AI Efficiencies: Aildata

## 1. Fast Local Validation & Tooling Workflows
- **Token-Efficient Automation Scripts (`scripts/`):** To avoid burning tokens on manual multi-step commands, always run the dedicated automation scripts:
  - **Local CI & Validation:** `./scripts/test_ci.sh` (runs type checking and static web export).
  - **Production Deployment:** `./scripts/deploy_prod.sh` (runs type check, web export, Cloudflare Worker deploy, and Cloudflare Pages static deploy).
- **Type Checking (Fastest Check):** Always run `npx tsc --noEmit` to validate TypeScript changes across both frontend and worker.
- **Web Export Validation:** Run `npm run build:web` (`npx expo export --platform web`) to verify bundling without launching persistent web servers.
- **Package Installation Rule:** ALWAYS use `npx expo install <package>` instead of `npm install` or `yarn add` to ensure packages match Expo SDK 58 compatibility matrix.
- **Avoid Blocking Dev Servers:** Do NOT execute persistent foreground commands (`npx expo start`, `wrangler dev`) during automated checks. For local testing, use static exports or background processes.
- **Local D1 Emulation:** When testing D1 queries or migrations locally, use `--local` flag:
  `npx wrangler d1 execute aildata-db --local --command="<SQL>"`
  `npx wrangler d1 execute aildata-db --local --file=<path-to-sql>`

## 2. AI Context & Search Efficiencies
- **Ignore High-Noise Directories:** Never search inside or read from:
  - `node_modules/`
  - `.expo/`
  - `dist/`
  - `.wrangler/`
  - `aildata.db` (binary SQLite file)
- **Targeted View Reads:** `src/views/DashboardView.tsx` and `src/views/SpreadsheetView.tsx` are 300-400+ lines. Use surgical `start_line` / `end_line` reads or `grep_search` rather than loading entire files repeatedly.

## 3. Codebase Architecture Boundaries & Reference
- **Frontend Code:** Lives in `App.tsx`, `src/views/`, `src/components/`, and `src/services/dataService.ts`.
- **Worker / API Code:** Lives in `worker/` (`worker/index.ts` and modular helpers `worker/src/*.ts`: `deduplicator.ts`, `normalizer.ts`, `retention.ts`).
- **Database Schemas & Migrations:** SQL definitions live in `src/database/` (`d1_schema.sql`, `schema.sql`) and `migrations/` (`0002_` through `0006_*.sql`).
- **Session & Storage Abstraction:** All auth/token interactions in the frontend MUST pass through `src/services/dataService.ts` to maintain cross-platform compatibility (web `localStorage` vs native secure store).
- **Relational vs. Dynamic Separation:**
  - Raw imports are stored as category snapshots in `dynamic_records`.
  - Normalized records belong to `detainees` -> `detentions` -> `charges`, `legal_proceedings`, `correspondence`.
- **Key Test & Utility Scripts (`scripts/`):**
  - Test suites: `test_admin_suite.js`, `test_datepicker_suite.js`, `test_deduplication_suite.js`, `test_inline_edit.js`, `test_stats_metrics.js`.
  - Data generators & parsers: `generate_10k_xlsx.js`, `generate_comparison_xlsx.js`, `generate_mini_duplicates_xlsx.js`, `parse_test1_ods.py`, `inspect_ods.py`, `migrate_to_relational.py`, `import_test1_to_sqlite.py`.

## 4. API Routing & RBAC Summary
- **Public Routes:** `GET /api/auth/setup-status`, `POST /api/auth/login`, `POST /api/auth/register` (First-Use setup only), `GET /api/auth/invite/:token`, `POST /api/auth/activate`.
- **Viewer Routes (Read-only):** `GET /api/records`, `GET /api/detainees`, `GET /api/detainees/:id`, `GET /api/stats`.
- **Analyst Routes:** `POST /api/records/batch` (spreadsheet ingestion).
- **Admin Routes:** User management (`GET /api/admin/users`, `PATCH /api/admin/users/:id/role`, `PATCH /api/admin/users/:id/status`, `POST /api/admin/users/:id/unlock`, `POST /api/admin/users/:id/reset-invite`, `POST /api/admin/users/:id/password`, `DELETE /api/admin/users/:id`), category deletion (`DELETE /api/records/category/:cat`), database reset (`DELETE /api/records`), and maintenance purge (`POST /api/maintenance/purge`).

## 5. Documentation & Security Enhancement Mandates
- **Documentation Updates:** Any new functionality designed or implemented by Gemini must be followed up by corresponding documentation updates for the repository (e.g., updating `TECHNICAL_ARCHITECTURE.md`, `SECURITY_REVIEW.md`, or relevant documentation guides).
- **Security & Audit Enhancements:** Any code changes or new features that should be enhanced with security hardening, RBAC checks, or immutable audit logging (`audit_logs`) must be proactively brought up and incorporated.


