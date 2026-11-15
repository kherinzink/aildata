-- ============================================================================
-- Migration: 0002_indexes_and_lifecycle.sql
-- Optimizes query performance and sets up retention lifecycle & aggregate rollups
-- ============================================================================

-- 1. Natural key & search indexes for high-speed deduplication
CREATE INDEX IF NOT EXISTS idx_detainees_jacket ON detainees(jacket_number);
CREATE INDEX IF NOT EXISTS idx_detainees_ice_case ON detainees(ice_case_number);
CREATE INDEX IF NOT EXISTS idx_detainees_name ON detainees(name);
CREATE INDEX IF NOT EXISTS idx_detentions_detainee_id ON detentions(detainee_id);
CREATE INDEX IF NOT EXISTS idx_detentions_departure ON detentions(departure_date);
CREATE INDEX IF NOT EXISTS idx_dynamic_records_category ON dynamic_records(category);
CREATE INDEX IF NOT EXISTS idx_users_invite_token ON users(invite_token);

-- 2. Permanent Roll-up Snapshots (for historical metrics across retention sweeps)
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
