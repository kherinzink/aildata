-- ============================================================================
-- Migration: 0005_security_hardening.sql
-- Adds per-user salt column and failed login rate limiting table
-- ============================================================================

-- 1. Add per-user random cryptographic salt to users table
ALTER TABLE users ADD COLUMN salt TEXT;

-- 2. Brute-force protection tracking table
CREATE TABLE IF NOT EXISTS failed_logins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    identifier TEXT NOT NULL UNIQUE,
    attempt_count INTEGER NOT NULL DEFAULT 1,
    locked_until DATETIME,
    last_attempt DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_failed_logins_identifier ON failed_logins(identifier);
