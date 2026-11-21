-- ============================================================================
-- Aildata Framework - Relational Database Schema Definition (SQLite)
-- ============================================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 1. Schema Migrations Tracker
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    migration_name TEXT NOT NULL UNIQUE,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Core Flexible Dynamic Records (For unstructured or pre-schema import caching)
CREATE TABLE IF NOT EXISTS dynamic_records (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    data_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Normalized Relational Schema

-- Detainees (Core Subject Profiles)
CREATE TABLE IF NOT EXISTS detainees (
    id TEXT PRIMARY KEY,
    jacket_number TEXT,
    name TEXT,
    age TEXT,
    race TEXT,
    sex TEXT,
    country TEXT,
    ice_case_number TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Detentions (Booking & Facility Stays)
CREATE TABLE IF NOT EXISTS detentions (
    id TEXT PRIMARY KEY,
    detainee_id TEXT,
    book_date_gcj TEXT,
    departure_date TEXT,
    cell TEXT,
    days_in_gcj TEXT,
    days_prior_facility TEXT,
    came_from TEXT,
    sent_to_note TEXT,
    delivering_agency TEXT,
    duplicate_jacket_returned TEXT,
    FOREIGN KEY(detainee_id) REFERENCES detainees(id) ON DELETE CASCADE
);

-- Charges (Legal Charges linked to bookings)
CREATE TABLE IF NOT EXISTS charges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detention_id TEXT,
    charge_description TEXT,
    FOREIGN KEY(detention_id) REFERENCES detentions(id) ON DELETE CASCADE
);

-- Legal Proceedings (Judge orders, decision dates, habeas notes)
CREATE TABLE IF NOT EXISTS legal_proceedings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detention_id TEXT,
    judge_ordered TEXT,
    decision_date TEXT,
    day_wait TEXT,
    notes TEXT,
    FOREIGN KEY(detention_id) REFERENCES detentions(id) ON DELETE CASCADE
);

-- Correspondence (Penpals and location notes)
CREATE TABLE IF NOT EXISTS correspondence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detainee_id TEXT,
    penpal TEXT,
    loc_note TEXT,
    FOREIGN KEY(detainee_id) REFERENCES detainees(id) ON DELETE CASCADE
);

-- 4. Users & Authentication (Email-based accounts & RBAC)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    salt TEXT,
    role TEXT NOT NULL DEFAULT 'viewer',
    status TEXT NOT NULL DEFAULT 'active',
    last_login DATETIME,
    invite_token TEXT,
    invite_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS failed_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    locked_until DATETIME,
    last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Immutable Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT,
    actor_email TEXT,
    action TEXT NOT NULL,
    target_id TEXT,
    metadata TEXT,
    ip_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_failed_logins_identifier ON failed_logins(identifier);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
