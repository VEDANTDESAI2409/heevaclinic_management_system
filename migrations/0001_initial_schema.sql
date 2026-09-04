-- ==============================================================================
-- HEEVA CLINIC MANAGEMENT SYSTEM
-- Cloudflare D1 Initial Database Schema Migration
-- Migration: 0001_initial_schema.sql
-- ==============================================================================

-- 1. Clinic Settings
CREATE TABLE IF NOT EXISTS clinic_settings (
  id TEXT PRIMARY KEY DEFAULT '1',
  clinic_name TEXT DEFAULT 'HEEVA CLINIC',
  tagline TEXT DEFAULT 'Trusted care, every time.',
  doctor_name TEXT,
  doctor_qual TEXT,
  doctor_role TEXT,
  address TEXT DEFAULT 'A/8, MONARCH, Pal Gam, Surat, Gujarat - 394510',
  phone TEXT,
  email TEXT,
  logo TEXT DEFAULT '/icons/heeva-logo.png',
  receipt_footer TEXT DEFAULT 'Thank you for choosing Heeva Clinic.',
  currency TEXT DEFAULT '₹',
  bill_prefix TEXT DEFAULT 'HC-BILL',
  bill_padding INTEGER DEFAULT 6,
  default_payment TEXT DEFAULT 'Cash',
  uhid_prefix TEXT DEFAULT 'HC',
  uhid_include_year INTEGER DEFAULT 1,
  uhid_padding INTEGER DEFAULT 6,
  uhid_start INTEGER DEFAULT 1,
  low_stock_default INTEGER DEFAULT 10,
  expiry_30 INTEGER DEFAULT 30,
  expiry_60 INTEGER DEFAULT 60,
  expiry_90 INTEGER DEFAULT 90,
  fefo INTEGER DEFAULT 1,
  theme TEXT DEFAULT 'light',
  lang TEXT DEFAULT 'en',
  seeded TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Counters (Atomic Monotonic Sequence Store)
CREATE TABLE IF NOT EXISTS counters (
  id TEXT PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_counters_key ON counters(key);

-- 3. Patients
CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  uhid TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  dob TEXT,
  approx_age INTEGER,
  gender TEXT,
  mobile TEXT NOT NULL,
  alt_mobile TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  state TEXT DEFAULT 'Gujarat',
  pin TEXT,
  ec_name TEXT,
  ec_number TEXT,
  ec_relation TEXT,
  blood_group TEXT,
  allergies TEXT,
  conditions TEXT,
  current_meds TEXT,
  notes TEXT,
  active INTEGER DEFAULT 1,
  reg_date TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_patients_uhid ON patients(uhid);
CREATE INDEX IF NOT EXISTS idx_patients_mobile ON patients(mobile);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(name);

-- 4. Patient Vitals
CREATE TABLE IF NOT EXISTS patient_vitals (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  temp REAL,
  sbp REAL,
  dbp REAL,
  pulse REAL,
  spo2 REAL,
  rr REAL,
  weight REAL,
  height REAL,
  sugar REAL,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  recorded_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vitals_patient_id ON patient_vitals(patient_id);

-- 5. Doctors
CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  qualification TEXT,
  specialization TEXT,
  phone TEXT,
  email TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_doctors_active ON doctors(active);

-- 6. Consultations
CREATE TABLE IF NOT EXISTS consultations (
  id TEXT PRIMARY KEY,
  consultation_no TEXT UNIQUE,
  patient_id TEXT NOT NULL,
  uhid TEXT,
  doctor_id TEXT,
  doctor_name TEXT,
  date TEXT,
  time TEXT,
  chief TEXT,
  symptoms TEXT,
  diagnosis TEXT,
  notes TEXT,
  advice TEXT,
  follow_up TEXT,
  status TEXT DEFAULT 'completed',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consultations_patient_id ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(date);

-- 7. Appointments
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  appointment_no TEXT UNIQUE,
  patient_id TEXT NOT NULL,
  uhid TEXT,
  doctor_id TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  reason TEXT,
  status TEXT DEFAULT 'scheduled',
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(date);
CREATE INDEX IF NOT EXISTS idx_appointments_patient_id ON appointments(patient_id);

-- 8. Prescriptions
CREATE TABLE IF NOT EXISTS prescriptions (
  id TEXT PRIMARY KEY,
  prescription_no TEXT UNIQUE,
  patient_id TEXT NOT NULL,
  uhid TEXT,
  consultation_id TEXT,
  doctor_id TEXT,
  doctor_name TEXT,
  date TEXT,
  time TEXT,
  diagnosis TEXT,
  notes TEXT,
  advice TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_id ON prescriptions(patient_id);

-- 9. Prescription Items
CREATE TABLE IF NOT EXISTS prescription_items (
  id TEXT PRIMARY KEY,
  prescription_id TEXT NOT NULL,
  medicine_id TEXT,
  seq INTEGER,
  name TEXT,
  dosage TEXT,
  frequency TEXT,
  duration TEXT,
  instruction TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prescription_items_pid ON prescription_items(prescription_id);

-- 10. Medicines
CREATE TABLE IF NOT EXISTS medicines (
  id TEXT PRIMARY KEY,
  medicine_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  generic TEXT,
  brand TEXT,
  category TEXT,
  manufacturer TEXT,
  type TEXT DEFAULT 'Tablet',
  strength TEXT,
  unit TEXT DEFAULT 'strip',
  barcode TEXT,
  purchase_price REAL DEFAULT 0,
  selling_price REAL DEFAULT 0,
  min_stock REAL DEFAULT 0,
  location TEXT,
  description TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_medicines_code ON medicines(medicine_code);
CREATE INDEX IF NOT EXISTS idx_medicines_name ON medicines(name);
CREATE INDEX IF NOT EXISTS idx_medicines_category ON medicines(category);

-- 11. Medicine Categories
CREATE TABLE IF NOT EXISTS medicine_categories (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_categories_name ON medicine_categories(name);

-- 12. Medicine Batches
CREATE TABLE IF NOT EXISTS medicine_batches (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL,
  batch_no TEXT NOT NULL,
  mfg_date TEXT,
  expiry TEXT NOT NULL,
  quantity REAL DEFAULT 0,
  available REAL DEFAULT 0,
  purchase_price REAL DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_batches_medicine_id ON medicine_batches(medicine_id);
CREATE INDEX IF NOT EXISTS idx_batches_expiry ON medicine_batches(expiry);

-- 13. Inventory Transactions (Immutable Stock Ledger)
CREATE TABLE IF NOT EXISTS inventory_transactions (
  id TEXT PRIMARY KEY,
  medicine_id TEXT NOT NULL,
  batch_id TEXT,
  type TEXT NOT NULL,
  qty REAL NOT NULL,
  ref_id TEXT,
  at TEXT NOT NULL,
  by TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_inv_txns_medicine_id ON inventory_transactions(medicine_id);
CREATE INDEX IF NOT EXISTS idx_inv_txns_batch_id ON inventory_transactions(batch_id);

-- 14. Medicine Stock History
CREATE TABLE IF NOT EXISTS medicine_stock_history (
  id TEXT PRIMARY KEY,
  medicine_id TEXT,
  date TEXT,
  opening REAL DEFAULT 0,
  inward REAL DEFAULT 0,
  outward REAL DEFAULT 0,
  closing REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- 15. Clinic Services
CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  service_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'service',
  price REAL DEFAULT 0,
  description TEXT,
  active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 16. Bills
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  bill_no TEXT UNIQUE NOT NULL,
  patient_id TEXT NOT NULL,
  uhid TEXT,
  patient_name TEXT,
  patient_mobile TEXT,
  patient_age TEXT,
  patient_gender TEXT,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  item_count INTEGER DEFAULT 0,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  paid REAL DEFAULT 0,
  status TEXT DEFAULT 'completed',
  payment_status TEXT DEFAULT 'PENDING',
  bill_type TEXT,
  created_by TEXT,
  cancel_reason TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bills_patient_id ON bills(patient_id);
CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(date);
CREATE INDEX IF NOT EXISTS idx_bills_bill_no ON bills(bill_no);

-- 17. Bill Items
CREATE TABLE IF NOT EXISTS bill_items (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  item_type TEXT NOT NULL,
  ref_id TEXT,
  name TEXT NOT NULL,
  qty REAL DEFAULT 1,
  price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  batch_id TEXT,
  batch_no TEXT,
  returned REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON bill_items(bill_id);

-- 18. Payments
CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  bill_id TEXT NOT NULL,
  patient_id TEXT,
  kind TEXT DEFAULT 'payment',
  amount REAL NOT NULL,
  method TEXT DEFAULT 'Cash',
  note TEXT,
  by TEXT,
  at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON payments(bill_id);

-- 19. Expenses
CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  expense_no TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  description TEXT,
  method TEXT DEFAULT 'Cash',
  status TEXT DEFAULT 'active',
  void_reason TEXT,
  added_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);

-- 20. Returns
CREATE TABLE IF NOT EXISTS returns (
  id TEXT PRIMARY KEY,
  return_no TEXT UNIQUE NOT NULL,
  bill_id TEXT NOT NULL,
  bill_no TEXT,
  patient_id TEXT,
  uhid TEXT,
  patient_name TEXT,
  reason TEXT NOT NULL,
  note TEXT,
  refund REAL DEFAULT 0,
  refund_method TEXT,
  at TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_returns_bill_id ON returns(bill_id);

-- 21. Return Items
CREATE TABLE IF NOT EXISTS return_items (
  id TEXT PRIMARY KEY,
  return_id TEXT NOT NULL,
  bill_item_id TEXT,
  name TEXT NOT NULL,
  qty REAL NOT NULL,
  batch_no TEXT,
  amount REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);

-- 22. Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  ref TEXT,
  severity TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read INTEGER DEFAULT 0,
  at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 23. Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  at TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_at ON activity_logs(at);
