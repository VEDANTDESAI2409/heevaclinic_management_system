-- ==============================================================================
-- HEEVA CLINIC MANAGEMENT SYSTEM
-- Schema Migration: 0005_bill_items_instructions.sql
-- Adds dosage, timing, frequency, and duration columns to bill_items table
-- ==============================================================================

ALTER TABLE bill_items ADD COLUMN dosage TEXT DEFAULT '';
ALTER TABLE bill_items ADD COLUMN timing TEXT DEFAULT '';
ALTER TABLE bill_items ADD COLUMN frequency TEXT DEFAULT '';
ALTER TABLE bill_items ADD COLUMN duration TEXT DEFAULT '';
