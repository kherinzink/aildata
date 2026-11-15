-- ============================================================================
-- Migration: 0004_query_performance_indexes.sql
-- Optimizes relational subqueries and eliminates full-table scans
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_charges_detention_id ON charges(detention_id);
CREATE INDEX IF NOT EXISTS idx_correspondence_detainee_id ON correspondence(detainee_id);
CREATE INDEX IF NOT EXISTS idx_detainees_created_at ON detainees(created_at);
CREATE INDEX IF NOT EXISTS idx_detentions_book_date ON detentions(book_date_gcj);
