-- ============================================================================
-- Migration: 0003_category_cascade_and_indexing.sql
-- Adds category tagging to detentions table to support clean cascading deletions
-- ============================================================================

-- 1. Add category column to detentions table
ALTER TABLE detentions ADD COLUMN category TEXT;

-- 2. Index category for fast sheet-level cascading deletions and joins
CREATE INDEX IF NOT EXISTS idx_detentions_category ON detentions(category);
