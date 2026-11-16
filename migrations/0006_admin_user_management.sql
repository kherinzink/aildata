-- ============================================================================
-- Migration: 0006_admin_user_management.sql
-- Adds status and last_login columns to users for administrative user management
-- ============================================================================

ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE users ADD COLUMN last_login DATETIME;

CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
