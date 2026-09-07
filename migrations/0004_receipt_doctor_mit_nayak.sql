-- Migration 0004: Consulting clinician Dr. Mit Nayak and receipt doctor information
ALTER TABLE bills ADD COLUMN doctor_name TEXT DEFAULT 'Dr. Mit Nayak';
ALTER TABLE bills ADD COLUMN doctor_phone TEXT DEFAULT '9913974000';
ALTER TABLE clinic_settings ADD COLUMN doctor_phone TEXT DEFAULT '9913974000';

-- Update existing clinic_settings with Dr. Mit Nayak
UPDATE clinic_settings SET
  doctor_name = 'Dr. Mit Nayak',
  doctor_phone = '9913974000',
  doctor_qual = COALESCE(doctor_qual, 'M.B.B.S., M.D.'),
  doctor_role = COALESCE(doctor_role, 'Consulting Physician')
WHERE id = '1';

-- Ensure doctor Dr. Mit Nayak is seeded in doctors table if not exists
INSERT OR REPLACE INTO doctors (
  id, name, qualification, specialization, phone, email, active, created_at, updated_at
) VALUES (
  'doc-mit-nayak', 'Dr. Mit Nayak', 'M.B.B.S., M.D.', 'Consulting Physician', '9913974000', 'mitnayak@heevaclinic.com', 1, datetime('now'), datetime('now')
);
