-- ============================================================================
-- Aildata Framework - Cloudflare D1 Compatible Schema Definition
-- ============================================================================

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
    is_uncharged INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
    role TEXT NOT NULL DEFAULT 'viewer',
    invite_token TEXT,
    invite_expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Permanent Roll-up Snapshots (for historical metrics across retention sweeps)
CREATE TABLE IF NOT EXISTS aggregate_rollups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_date DATE NOT NULL UNIQUE,
    total_active INTEGER NOT NULL,
    total_released INTEGER NOT NULL,
    with_penpal INTEGER NOT NULL,
    by_country_json TEXT NOT NULL,
    by_agency_json TEXT NOT NULL,
    by_sex_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 6. Indexes for Deduplication and Fast Lookups
CREATE INDEX IF NOT EXISTS idx_detainees_jacket ON detainees(jacket_number);
CREATE INDEX IF NOT EXISTS idx_detainees_ice_case ON detainees(ice_case_number);
CREATE INDEX IF NOT EXISTS idx_detainees_name ON detainees(name);
CREATE INDEX IF NOT EXISTS idx_detentions_detainee_id ON detentions(detainee_id);
CREATE INDEX IF NOT EXISTS idx_detentions_departure ON detentions(departure_date);
CREATE INDEX IF NOT EXISTS idx_dynamic_records_category ON dynamic_records(category);
CREATE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token);
