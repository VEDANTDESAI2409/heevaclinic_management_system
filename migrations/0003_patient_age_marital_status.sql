-- ==============================================================================
-- HEEVA CLINIC MANAGEMENT SYSTEM
-- Schema Migration: 0003_patient_age_marital_status.sql
-- Adds age and marital_status to patients table, backfilling age from dob
-- ==============================================================================

-- 1. Add age column if not exists
ALTER TABLE patients ADD COLUMN age INTEGER;

-- 2. Add marital_status column if not exists
ALTER TABLE patients ADD COLUMN marital_status TEXT DEFAULT 'Single';

-- 3. Backfill age from existing dob records where dob is set and age is NULL
UPDATE patients
SET age = CAST((strftime('%Y', 'now') - strftime('%Y', dob)) - (strftime('%m-%d', 'now') < strftime('%m-%d', dob)) AS INTEGER)
WHERE age IS NULL AND dob IS NOT NULL AND trim(dob) != '';
