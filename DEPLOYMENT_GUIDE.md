# Aildata Framework - Deployment Playbook

This guide provides step-by-step instructions for deploying the **Aildata** framework to Cloudflare, including the **Cloudflare D1 Database**, **Cloudflare Worker API Gateway**, and **Cloudflare Pages Web App Frontend**.

---

## Part 1: Cloudflare D1 Database & Worker Backend Deployment

### Step 1: Create or Confirm your D1 Database ID
Ensure your `wrangler.toml` in the project root has the correct database binding and cron triggers:

```toml
name = "aildata"
main = "worker/index.ts"
compatibility_date = "2026-11-07"

[[d1_databases]]
binding = "DB"
database_name = "aildata-db"
database_id = "your-actual-database-id-uuid"

[triggers]
crons = ["0 3 * * *"]
```

### Step 2: Execute the Database Schema Remotely
Deploy the production relational schema and indexes to your live Cloudflare D1 database:
```bash
npx wrangler d1 execute aildata-db --remote --file=./src/database/d1_schema.sql
```

### Step 3: Deploy the Worker API Live
Publish your serverless API gateway to Cloudflare Workers:
```bash
npx wrangler deploy
```
*Note your live Worker URL (e.g., `https://aildata.<your-subdomain>.workers.dev`).*

---

## Part 2: Web App Frontend Deployment (Cloudflare Pages)

### Step 1: Build the Static Web Bundle
Compile the React Native Web application with your live Worker API URL explicitly configured:
```bash
EXPO_PUBLIC_API_BASE_URL="https://your-worker.workers.dev" npm run build:web
```
*(This creates the optimized static production files inside the `dist/` directory).*

### Step 2: Deploy to Cloudflare Pages
Deploy the static bundle directly using Wrangler:
```bash
npx wrangler pages deploy dist --project-name=aildata-web
```

---

## Part 3: Initial Administrator Onboarding & Security Model

### First-Time Web Setup
1. Open your live Cloudflare Pages web application in a browser.
2. Because the `users` table is freshly initialized with 0 users, the Web UI automatically displays the **"First-Time Setup: Create Initial Administrator Account"** interface.
3. Enter your administrator email and a strong password, then click **Create Administrator Account**.
4. The backend securely provisions your account with root `admin` permissions, generates an authenticated session token, and logs you into the workspace immediately.

### Permanent Self-Registration Lockout & One-Click Team Invites
- As soon as the first administrator account is created, `/api/auth/setup-status` returns `needsSetup: false`.
- The Web UI automatically reverts to **Sign-In Only**.
- Public self-registration is permanently disabled.
- **Other users cannot create accounts or gain access without your involvement.**
- **No Manual Passwords:** Administrators do not need to create or manage passwords for other users. From the **Admin: Invite Team Member** card on the **Dashboard**, enter the colleague's email and role to generate a secure 7-day activation link (e.g. `https://your-pages-url/?invite=inv_...`).
- When the colleague clicks their link, they are prompted to set their own password to activate their account.

---

## Part 4: Automated 1-Year Retention Policy

- **Daily Snapshot:** A Cloudflare Worker Cron Trigger executes daily at 03:00 UTC (`crons = ["0 3 * * *"]`), saving a longitudinal metrics snapshot into `aggregate_rollups`.
- **1-Year Purge Window:** Detention records with a departure date older than 365 days (1 year) are automatically deleted, cascading to associated charges, legal proceedings, and correspondence, and pruning orphaned subject profiles.
- **On-Demand Maintenance:** An administrator can also run the 1-year retention sweep at any time using the **🧹 Run 1-Year Retention Purge & Rollup** button in the Dashboard view.
