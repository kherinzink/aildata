# Aildata Framework

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![React Native / Expo](https://img.shields.io/badge/Expo-SDK%2058-black.svg)](https://expo.dev/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1%20%2F%20Workers-orange.svg)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Aildata** is a high-performance, cloud-native database and spreadsheet management framework built for React Native Web and serverless edge deployment on **Cloudflare D1** and **Cloudflare Workers**. It provides real-time spreadsheet parsing (XLSX, ODS, CSV), relational data modeling, email authentication, and hardened Role-Based Access Control (RBAC).

---

## 🌟 Key Features

- **🌐 Cloud-Native Edge Architecture:** Fully consolidated to **Cloudflare D1** serverless SQLite at the edge. The application communicates exclusively with a Cloudflare Worker API, ensuring high availability and low latency across all platforms.
- **🔐 Security & Hardened Auth:** Email-based authentication with Web Crypto PBKDF2 password hashing and secure JWT session tokens. 
- **🛡️ Hardened RBAC:** Robust Role-Based Access Control enforcing strict permissions for `admin`, `analyst`, and `viewer` roles, with server-side verification to prevent unauthorized account escalation.
- **📊 High-Speed Spreadsheet Parsing:** Client-side parsing of Excel (`.xlsx`), OpenDocument (`.ods`), and CSV files using SheetJS with custom header range skipping and lightning-fast batch inserts directly to D1.
- **📈 Real-Time Analytics Dashboard:** Instant metrics tracking active custody status, country of origin distribution, delivering agencies, and demographic splits.

---

## 👥 Security Roles (RBAC)

Aildata enforces a strict security model based on user roles:

- **Admin:** Full system access. Can manage users, clear databases, and perform all data operations.
- **Analyst:** Data mutation privileges. Can import files and add/modify records. Cannot delete databases or manage users.
- **Viewer:** Read-only access. Can view spreadsheet grids and dashboards. Cannot modify any data.

*Note: Privileged roles (Admin/Analyst) can only be created by an existing Admin via an authenticated request.*

---

## 📁 Project Structure

```text
aildata/
├── src/
│   ├── database/       # Cloudflare D1 schema (d1_schema.sql) and web-safe DB wrappers
│   ├── services/       # Data service abstraction and Cloudflare API client (dataService.ts)
│   └── views/          # Core application views (Dashboard, Spreadsheet, Import, Auth)
├── worker/
│   └── index.ts        # Cloudflare Worker API backend (Auth, RBAC, D1 Integration)
├── scripts/            # Generation and utility scripts (e.g., 10k record generator)
├── App.tsx             # Main application entry point & RBAC navigation
├── wrangler.toml       # Cloudflare Workers & D1 configuration
├── TECHNICAL_ARCHITECTURE.md # Detailed technical design document
└── DEPLOYMENT_GUIDE.md       # Complete Cloudflare deployment playbook
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v22+)
- npm
- Cloudflare Account (Wrangler CLI)

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
   EXPO_PUBLIC_API_BASE_URL="https://your-worker.workers.dev" npm run web
   ```

---

## ☁️ Cloudflare Deployment

For full deployment instructions, see [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md).

1. **Deploy Database Schema:** 
   `npx wrangler d1 execute aildata-db --remote --file=./src/database/d1_schema.sql`
2. **Deploy API Backend:** 
   `npx wrangler deploy`
3. **Deploy Web Frontend:** 
   `npm run build:web && npx wrangler pages deploy dist --project-name=aildata-web`

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
