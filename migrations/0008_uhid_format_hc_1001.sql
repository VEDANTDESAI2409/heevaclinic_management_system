-- ==============================================================================
-- HEEVA CLINIC MANAGEMENT SYSTEM
-- Schema Migration: 0008_uhid_format_hc_1001.sql
-- Updates UHID format to HC-1001, HC-1002... without modifying existing records
-- ==============================================================================

UPDATE clinic_settings
SET uhid_prefix = 'HC',
    uhid_include_year = 0,
    uhid_padding = 4,
    uhid_start = 1001
WHERE id = '1';
