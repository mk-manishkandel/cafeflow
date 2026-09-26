-- Migration 001: Student ID and remarks on consumers
--
-- Adds two nullable columns used when a consumer's category is 'Student'.
-- Idempotent — safe to run more than once, and a no-op on databases that
-- were created from a schema.sql that already includes these columns.
--
-- Apply:
--   psql -U <app_user> -h localhost -d <db_name> -v ON_ERROR_STOP=1 \
--        -f pos/server/migrations/001_consumer_student_fields.sql

BEGIN;

ALTER TABLE consumers ADD COLUMN IF NOT EXISTS student_id VARCHAR(50);
ALTER TABLE consumers ADD COLUMN IF NOT EXISTS remarks    TEXT;

COMMIT;
