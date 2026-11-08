# Aildata Framework - Deployment Guide

This guide provides step-by-step instructions for deploying the **Aildata** framework to Cloudflare, including the **Cloudflare D1 Database**, **Cloudflare Worker API Backend**, and **Cloudflare Pages Web App Frontend**.

---

## Part 1: Cloudflare D1 & Worker Backend Deployment

### Step 1: Update `wrangler.toml` with your D1 Database ID
Open `wrangler.toml` in your project root and replace `"your-d1-database-id"` with your actual Cloudflare D1 database ID (generated via `npx wrangler d1 create aildata-db`):

```toml
[[d1_databases]]
binding = "DB"
database_name = "aildata-db"
database_id = "abc12345-your-actual-database-id"
```

### Step 2: Execute the Database Schema Remotely
Deploy your tables (`users`, `dynamic_records`, `detainees`, etc.) to your live Cloudflare D1 database:
```bash
npx wrangler d1 execute aildata-db --remote --file=./src/database/d1_schema.sql
```

### Step 3: Test Locally (Optional)
Test your worker and D1 connection locally:
```bash
npx wrangler dev
```

### Step 4: Deploy the Worker Live to Cloudflare
Publish your serverless API backend to Cloudflare Workers:
```bash
npx wrangler deploy
```
*Note your live Worker URL (e.g., `https://aildata.<your-subdomain>.workers.dev`).*

---

## Part 2: Web App Frontend Deployment (Cloudflare Pages)

### Step 1: Build the Static Web Bundle
Compile your React Native Web application with your Worker API URL configured:
```bash
EXPO_PUBLIC_API_BASE_URL="https://aildata.<your-subdomain>.workers.dev" npm run build:web
```
*(This generates the production static files inside the `dist/` directory).*

### Step 2: Deploy to Cloudflare Pages
Deploy the static bundle directly using Wrangler:
```bash
npx wrangler pages deploy dist --project-name=aildata-web
```
*(Alternatively, connect your GitHub repository to Cloudflare Pages with build command `npm run build:web` and output directory `dist`).*
