# Aildata Framework

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![React Native / Expo](https://img.shields.io/badge/Expo-SDK%2058-black.svg)](https://expo.dev/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1%20%2F%20Workers-orange.svg)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Aildata** is a high-performance, cross-platform database and spreadsheet management framework built for React Native, Expo, and serverless edge deployment on **Cloudflare D1** and **Cloudflare Workers**. It provides real-time spreadsheet parsing (XLSX, ODS, CSV), relational data modeling, email authentication, and Role-Based Access Control (RBAC).

---

## 🌟 Key Features

- **🌐 Serverless Edge Architecture:** Seamlessly transition between local SQLite (`expo-sqlite` / browser `localStorage`) and **Cloudflare D1** serverless edge databases.
- **🔐 Security & Authentication:** Email-based user registration and login with Web Crypto PBKDF2 password hashing, secure JWT session tokens, and Role-Based Access Control (`admin`, `analyst`, `viewer`).
- **📊 High-Speed Spreadsheet Parsing:** Client-side parsing of Excel (`.xlsx`), OpenDocument (`.ods`), and CSV files using SheetJS with custom header range skipping and lightning-fast batch inserts.
- **📈 Real-Time Analytics Dashboard:** Instant metrics tracking active custody status, country of origin distribution, delivering agencies, demographic splits, and penpal ratios.
- **🗄️ Hybrid NoSQL & Relational Models:** Flexible dynamic records cache for unstructured spreadsheet imports combined with normalized relational tables (`detainees`, `detentions`, `charges`, `legal_proceedings`, `correspondence`).

---

## 📁 Project Structure

```text
aildata/
├── src/
│   ├── database/       # SQLite schema and migration definitions (schema.sql, d1_schema.sql)
│   ├── services/       # Data service abstraction, API client, and auth state (dataService.ts)
│   └── views/          # Core application views (DashboardView, SpreadsheetView, ImportFileView)
├── worker/
│   └── index.ts        # Cloudflare Worker API backend (AuthN, AuthZ, D1 queries)
├── scripts/            # Python utility scripts for ODS inspection and conversion
├── App.tsx             # Main application entry point & tab navigation
├── wrangler.toml       # Cloudflare Workers & D1 configuration
├── TECHNICAL_ARCHITECTURE.md # Detailed technical design document
└── DEPLOYMENT_GUIDE.md       # Complete Cloudflare deployment playbook
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18+)
- npm or yarn
- Expo CLI

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/kherinzink/aildata.git
   cd aildata
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run start
   ```

---

## ☁️ Cloudflare Deployment

For full deployment instructions covering **Cloudflare D1**, the **Cloudflare Worker API**, and **Cloudflare Pages**, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

Quick summary:
1. **Create D1 Database:** `npx wrangler d1 create aildata-db`
2. **Update `wrangler.toml`** with your `database_id`.
3. **Apply Schema Remotely:** `npx wrangler d1 execute aildata-db --remote --file=./src/database/d1_schema.sql`
4. **Deploy Worker:** `npx wrangler deploy`
5. **Deploy Web App:** `npm run build:web && npx wrangler pages deploy dist --project-name=aildata-web`

---

## 📚 Documentation

- [Technical Architecture](TECHNICAL_ARCHITECTURE.md) - Deep dive into database schemas, worker middleware, and security models.
- [Deployment Guide](DEPLOYMENT_GUIDE.md) - Step-by-step production deployment playbook.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
