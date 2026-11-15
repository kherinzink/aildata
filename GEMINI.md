# Project Instructions & AI Efficiencies: Aildata

## 1. Fast Local Validation & Tooling Workflows
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

## 3. Codebase Architecture Boundaries
- **Frontend Code:** Lives in `App.tsx`, `src/views/`, `src/components/`, and `src/services/dataService.ts`.
- **Worker / API Code:** Lives in `worker/` (`worker/index.ts` and modular helpers `worker/src/*.ts`).
- **Database Schemas & Migrations:** SQL definitions live in `src/database/` and `migrations/`.
- **Session & Storage Abstraction:** All auth/token interactions in the frontend MUST pass through `src/services/dataService.ts` to maintain cross-platform compatibility (web `localStorage` vs native secure store).
- **Relational vs. Dynamic Separation:**
  - Raw imports are stored as category snapshots in `dynamic_records`.
  - Normalized records belong to `detainees` -> `detentions` -> `charges`, `legal_proceedings`, `correspondence`.
