-- ==============================================================================
-- HEEVA CLINIC MANAGEMENT SYSTEM
-- Schema Migration: 0007_clean_schema_and_indexes.sql
-- Adds missing doctor_id indexes and ensures safe referential integrity
-- ==============================================================================

-- 1. Index doctor_id on appointments for fast doctor lookups and safe deletion
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);

-- 2. Index doctor_id on prescriptions for fast doctor lookups and safe deletion
CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON prescriptions(doctor_id);

-- 3. Add timing and quantity to prescription_items for full clinical prescription details
ALTER TABLE prescription_items ADD COLUMN timing TEXT;
ALTER TABLE prescription_items ADD COLUMN quantity TEXT;

