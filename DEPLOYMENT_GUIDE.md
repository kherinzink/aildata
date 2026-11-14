# Aildata Framework - Deployment Guide

This guide provides step-by-step instructions for deploying the **Aildata** framework to Cloudflare, including the **Cloudflare D1 Database**, **Cloudflare Worker API Backend**, and **Cloudflare Pages Web App Frontend**.

---

## Part 1: Cloudflare D1 & Worker Backend Deployment

### Step 1: Update `wrangler.toml` with your D1 Database ID
Ensure your `wrangler.toml` in the project root has the correct database ID (generated via `npx wrangler d1 create aildata-db`):

```toml
[[d1_databases]]
binding = "DB"
database_name = "aildata-db"
database_id = "your-actual-database-id-uuid"
```

### Step 2: Execute the Database Schema Remotely
Deploy the production schema to your live Cloudflare D1 database:
```bash
npx wrangler d1 execute aildata-db --remote --file=./src/database/d1_schema.sql
```

### Step 3: Deploy the Worker API Live
Publish your serverless API backend to Cloudflare Workers:
```bash
npx wrangler deploy
```
*Note your live Worker URL (e.g., `https://aildata.<your-subdomain>.workers.dev`).*

---

## Part 2: Web App Frontend Deployment (Cloudflare Pages)

### Step 1: Build the Static Web Bundle
Compile the React Native Web application with your Worker API URL explicitly configured:
```bash
EXPO_PUBLIC_API_BASE_URL="https://your-worker.workers.dev" npm run build:web
```
*(This generates the production static files inside the `dist/` directory).*

### Step 2: Deploy to Cloudflare Pages
Deploy the static bundle using Wrangler:
```bash
npx wrangler pages deploy dist --project-name=aildata-web
```

---

## Part 3: Security Configuration

### Initial Admin Registration
Once deployed, you must register your first admin account. You can do this via the web UI or using `curl`:

```bash
curl -X POST "https://your-worker.workers.dev/api/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.org", "password": "secure-password", "role": "admin"}'
```

*Subsequent admin or analyst accounts can only be created by an existing admin passing a valid JWT token.*
