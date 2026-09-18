-- Migration 0006: Add diagnosis, advice, next_visit to bills and composition, notes to bill_items
ALTER TABLE bills ADD COLUMN diagnosis TEXT;
ALTER TABLE bills ADD COLUMN advice TEXT;
ALTER TABLE bills ADD COLUMN next_visit TEXT;

ALTER TABLE bill_items ADD COLUMN composition TEXT;
ALTER TABLE bill_items ADD COLUMN notes TEXT;
