-- ==============================================================================
-- HEEVA CLINIC MANAGEMENT SYSTEM
-- Cloudflare D1 Baseline Data Seed Migration
-- Migration: 0002_seed_data.sql
-- ==============================================================================

-- 1. Clinic Settings Seed
INSERT OR REPLACE INTO clinic_settings (
  id, clinic_name, tagline, doctor_name, doctor_qual, doctor_role,
  address, phone, email, logo, receipt_footer, currency, bill_prefix,
  bill_padding, default_payment, uhid_prefix, uhid_include_year,
  uhid_padding, uhid_start, low_stock_default, expiry_30, expiry_60,
  expiry_90, fefo, theme, lang, seeded, created_at, updated_at
) VALUES (
  '1', 'HEEVA CLINIC', 'Trusted care, every time.', NULL, NULL, NULL,
  'A/8, MONARCH, Pal Gam, Surat, Gujarat - 394510', NULL, NULL,
  '/icons/heeva-logo.png', 'Thank you for choosing Heeva Clinic.',
  '₹', 'HC-BILL', 6, 'Cash', 'HC', 1, 6, 1, 10, 30, 60, 90, 1,
  'light', 'en', '', '2026-09-04T08:16:40.848Z', '2026-09-04T08:16:40.848Z'
);

-- 2. Numbering Counters Seed
INSERT OR REPLACE INTO counters (id, key, value, created_at, updated_at) VALUES
  ('UHID|2026', 'UHID|2026', 6, '2026-09-04T14:50:36.247Z', '2026-09-04T14:50:36.247Z'),
  ('MED|ALL', 'MED|ALL', 3, '2026-09-04T14:50:36.256Z', '2026-09-04T14:50:36.256Z'),
  ('BILL|2026', 'BILL|2026', 2, '2026-09-04T09:57:50.744Z', '2026-09-04T11:00:22.962Z');

-- 3. Medicine Categories Seed
INSERT OR REPLACE INTO medicine_categories (id, name, created_at, updated_at) VALUES
  ('cat-analgesic', 'Analgesic', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-antibiotic', 'Antibiotic', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-antacid', 'Antacid', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-antiseptic', 'Antiseptic', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-vitamin', 'Vitamin', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-antihistamine', 'Antihistamine', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-respiratory', 'Respiratory', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-cardiovascular', 'Cardiovascular', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-diabetes', 'Diabetes', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-dermatology', 'Dermatology', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-supplement', 'Supplement', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-injection', 'Injection', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-iv-fluid', 'IV Fluid', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('cat-other', 'Other', '2026-09-04T09:43:44.630Z', '2026-09-04T09:43:44.630Z'),
  ('c58b6379-d75e-4169-88f7-6b7c2127e525', 'Test Category', '2026-09-04T14:50:36.256Z', '2026-09-04T14:50:36.256Z');

-- 4. Patients Seed
INSERT OR REPLACE INTO patients (
  id, uhid, name, dob, approx_age, gender, mobile, alt_mobile, email,
  address, city, state, pin, ec_name, ec_number, ec_relation,
  blood_group, allergies, conditions, current_meds, notes, active,
  reg_date, created_by, created_at, updated_at
) VALUES
  (
    '4dce1f2b-e050-4a4c-b741-a9b44373b0b0', 'HC-2026-000002', 'werwe',
    '2022-02-03', NULL, 'Male', '8200207429', '', '',
    '201, 2 Floor, Tower 9F-2, Green City, Batha', 'Surat', 'Gujarat', '',
    '', '', '', 'AB−', '', '', '', '', 1, '2026-09-04',
    'local-admin', '2026-09-04T07:59:18.231Z', '2026-09-04T07:59:18.246Z'
  ),
  (
    '24fe9f3f-5a1a-419d-8db8-b7223c7816b7', 'HC-2026-000003', 'Vedant Desai',
    '2026-09-03', NULL, 'Male', '7861978787', '', '',
    '201, 2 Floor, Tower 9F-2, Green City, Batha', 'Surat', 'Gujarat', '',
    '', '', '', '', '', '', '', '', 1, '2026-09-04',
    'local-admin', '2026-09-04T14:34:46.439Z', '2026-09-04T14:34:46.448Z'
  ),
  (
    '8b1a2f85-d8bf-43dc-9bc0-80777a80eb61', 'HC-2026-000004', 'Vedant Desai',
    '2023-06-10', NULL, 'Male', '7861978787', '', '',
    '201, 2 Floor, Tower 9F-2, Green City, Batha', 'Surat', 'Gujarat', '',
    '', '', '', '', '', '', '', '', 1, '2026-09-04',
    'local-admin', '2026-09-04T14:35:20.327Z', '2026-09-04T14:35:20.339Z'
  );

-- 5. Medicines Seed
INSERT OR REPLACE INTO medicines (
  id, medicine_code, name, generic, brand, category, manufacturer,
  type, strength, unit, barcode, purchase_price, selling_price,
  min_stock, location, description, active, created_at, updated_at
) VALUES
  (
    'e5ddae7d-df4b-487b-81b0-ccd13f3ed1eb', 'MD-0001', 'fdsfds',
    'fsfs', 'fdsfds', 'Analgesic', '', 'Tablet', '4343', 'strip', '',
    434, 434, 0, '', '', 1, '2026-09-04T09:57:09.625Z', '2026-09-04T09:57:09.628Z'
  ),
  (
    '61c3b459-0c13-4cc1-a55b-6b0c87bfc3d1', 'MD-0002', 'Amoxicillin 500',
    'Amoxicillin', 'Amoxicillin 500', 'Antibiotic', '', 'Capsule', '',
    'strip', '', 12, 15, 0, '', '', 1, '2026-09-04T10:18:51.954Z', '2026-09-04T14:59:24.013Z'
  );

-- 6. Batches Seed
INSERT OR REPLACE INTO medicine_batches (
  id, medicine_id, batch_no, mfg_date, expiry, quantity, available,
  purchase_price, status, created_at, updated_at
) VALUES
  (
    '7c89cd29-0330-4b21-9c99-49efe1484527', 'e5ddae7d-df4b-487b-81b0-ccd13f3ed1eb',
    'ADJ-1788515858600', '2026-09-04', '9999-12-31', 100, 98, 434, 'active',
    '2026-09-04T09:57:38.606Z', '2026-09-04T11:00:22.941Z'
  ),
  (
    '0f4e2aec-b1b1-4ffc-a6d6-5b58fd46bf78', '61c3b459-0c13-4cc1-a55b-6b0c87bfc3d1',
    'ADJ-1788533930673', '2026-09-04', '9999-12-31', 100, 100, 0, 'active',
    '2026-09-04T14:58:50.681Z', '2026-09-04T14:58:50.681Z'
  );

-- 7. Bills Seed
INSERT OR REPLACE INTO bills (
  id, bill_no, patient_id, uhid, patient_name, patient_mobile, patient_age,
  patient_gender, date, time, item_count, subtotal, discount, total, paid,
  status, payment_status, bill_type, created_by, cancel_reason, cancelled_at,
  cancelled_by, created_at, updated_at
) VALUES
  (
    'f69c3a97-19c3-4e3b-bc84-5d1b4af1b0b4', 'HC-BILL-2026-000001',
    '4dce1f2b-e050-4a4c-b741-a9b44373b0b0', 'HC-2026-000002', 'werwe',
    '8200207429', '4 yrs', 'Male', '2026-09-04', '2026-09-04T09:57:50.741Z',
    1, 434, 0, 434, 434, 'completed', 'PAID', 'MEDICINES', 'local-admin',
    NULL, NULL, NULL, '2026-09-04T09:57:50.741Z', '2026-09-04T09:57:50.846Z'
  ),
  (
    'ebc59be5-c4f8-4320-9f76-89e68cf9a27f', 'HC-BILL-2026-000002',
    '4dce1f2b-e050-4a4c-b741-a9b44373b0b0', 'HC-2026-000002', 'werwe',
    '8200207429', '4 yrs', 'Male', '2026-09-04', '2026-09-04T11:00:22.962Z',
    1, 434, 0, 434, 434, 'completed', 'PAID', 'MEDICINES', 'local-admin',
    NULL, NULL, NULL, '2026-09-04T11:00:22.962Z', '2026-09-04T11:00:23.024Z'
  );

-- 8. Bill Items Seed
INSERT OR REPLACE INTO bill_items (
  id, bill_id, item_type, ref_id, name, qty, price, amount,
  batch_id, batch_no, returned, created_at, updated_at
) VALUES
  (
    '61d6bf05-1f29-46ed-9e6a-c2d02a5d80f3', 'f69c3a97-19c3-4e3b-bc84-5d1b4af1b0b4',
    'medicine', 'e5ddae7d-df4b-487b-81b0-ccd13f3ed1eb', 'fdsfds', 1, 434, 434,
    '7c89cd29-0330-4b21-9c99-49efe1484527', 'ADJ-1788515858600', 0,
    '2026-09-04T09:57:50.782Z', '2026-09-04T09:57:50.782Z'
  ),
  (
    '7e18a1c5-bae6-45b1-8850-b1869ecf3b5f', 'ebc59be5-c4f8-4320-9f76-89e68cf9a27f',
    'medicine', 'e5ddae7d-df4b-487b-81b0-ccd13f3ed1eb', 'fdsfds', 1, 434, 434,
    '7c89cd29-0330-4b21-9c99-49efe1484527', 'ADJ-1788515858600', 0,
    '2026-09-04T11:00:22.990Z', '2026-09-04T11:00:22.990Z'
  );

-- 9. Payments Seed
INSERT OR REPLACE INTO payments (
  id, bill_id, patient_id, kind, amount, method, note, by, at, created_at, updated_at
) VALUES
  (
    '590ef4a0-32e4-4f0e-b0d2-11740ba1242a', 'f69c3a97-19c3-4e3b-bc84-5d1b4af1b0b4',
    '4dce1f2b-e050-4a4c-b741-a9b44373b0b0', 'payment', 434, 'Cash', '',
    'local-admin', '2026-09-04T09:57:50.741Z', '2026-09-04T09:57:50.833Z', '2026-09-04T09:57:50.833Z'
  ),
  (
    '8de2ffb4-9b54-4558-883a-20dd12adf6a4', 'ebc59be5-c4f8-4320-9f76-89e68cf9a27f',
    '4dce1f2b-e050-4a4c-b741-a9b44373b0b0', 'payment', 434, 'Cash', '',
    'local-admin', '2026-09-04T11:00:22.962Z', '2026-09-04T11:00:23.013Z', '2026-09-04T11:00:23.013Z'
  );

-- 10. Inventory Transactions Seed
INSERT OR REPLACE INTO inventory_transactions (
  id, medicine_id, batch_id, type, qty, ref_id, at, by, note, created_at, updated_at
) VALUES
  (
    'e72183db-023d-45be-8766-382731b7ed7a', 'e5ddae7d-df4b-487b-81b0-ccd13f3ed1eb',
    '7c89cd29-0330-4b21-9c99-49efe1484527', 'ADJUSTMENT', 100, NULL,
    '2026-09-04T09:57:38.662Z', 'local-admin', '', '2026-09-04T09:57:38.669Z', '2026-09-04T09:57:38.669Z'
  ),
  (
    '57ca57da-a83a-4dc4-a37c-4421f7d4406d', 'e5ddae7d-df4b-487b-81b0-ccd13f3ed1eb',
    '7c89cd29-0330-4b21-9c99-49efe1484527', 'SALE', -1, 'f69c3a97-19c3-4e3b-bc84-5d1b4af1b0b4',
    '2026-09-04T09:57:50.741Z', 'local-admin', 'HC-BILL-2026-000001', '2026-09-04T09:57:50.802Z', '2026-09-04T09:57:50.802Z'
  ),
  (
    'a3349b90-f028-455c-8a67-034e3d9c48d4', 'e5ddae7d-df4b-487b-81b0-ccd13f3ed1eb',
    '7c89cd29-0330-4b21-9c99-49efe1484527', 'SALE', -1, 'ebc59be5-c4f8-4320-9f76-89e68cf9a27f',
    '2026-09-04T11:00:22.962Z', 'local-admin', 'HC-BILL-2026-000002', '2026-09-04T11:00:23.001Z', '2026-09-04T11:00:23.001Z'
  ),
  (
    'b2905dc3-e684-4f13-aa60-3818df741eb0', '61c3b459-0c13-4cc1-a55b-6b0c87bfc3d1',
    '0f4e2aec-b1b1-4ffc-a6d6-5b58fd46bf78', 'ADJUSTMENT', 100, NULL,
    '2026-09-04T14:58:50.703Z', 'local-admin', '', '2026-09-04T14:58:50.708Z', '2026-09-04T14:58:50.708Z'
  );
