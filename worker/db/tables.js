// Allowed collections and table mappings for HEEVA CLINIC Cloudflare D1 Backend

export const tableAliases = {
  settings: 'clinic_settings',
  batches: 'medicine_batches',
  inventory_txns: 'inventory_transactions',
};

export const resolveCollection = (name) => tableAliases[name] || name;

export const allowedCollections = new Set([
  'clinic_settings', 'settings',
  'counters',
  'patients',
  'patient_vitals',
  'doctors',
  'consultations',
  'appointments',
  'medicines',
  'medicine_categories',
  'medicine_batches', 'batches',
  'inventory_transactions', 'inventory_txns',
  'medicine_stock_history',
  'services',
  'prescriptions',
  'prescription_items',
  'bills',
  'bill_items',
  'payments',
  'expenses',
  'returns',
  'return_items',
  'notifications',
  'activity_logs',
]);

// Table schema column definitions to ensure safe D1 parameterized SQL insertion
export const tableColumns = {
  clinic_settings: [
    'id', 'clinic_name', 'tagline', 'doctor_name', 'doctor_qual', 'doctor_role',
    'address', 'phone', 'email', 'logo', 'receipt_footer', 'currency', 'bill_prefix',
    'bill_padding', 'default_payment', 'uhid_prefix', 'uhid_include_year',
    'uhid_padding', 'uhid_start', 'low_stock_default', 'expiry_30', 'expiry_60',
    'expiry_90', 'fefo', 'theme', 'lang', 'seeded', 'created_at', 'updated_at'
  ],
  counters: ['id', 'key', 'value', 'created_at', 'updated_at'],
  patients: [
    'id', 'uhid', 'name', 'dob', 'approx_age', 'gender', 'mobile', 'alt_mobile',
    'email', 'address', 'city', 'state', 'pin', 'ec_name', 'ec_number', 'ec_relation',
    'blood_group', 'allergies', 'conditions', 'current_meds', 'notes', 'active',
    'reg_date', 'created_by', 'created_at', 'updated_at'
  ],
  patient_vitals: [
    'id', 'patient_id', 'temp', 'sbp', 'dbp', 'pulse', 'spo2', 'rr', 'weight',
    'height', 'sugar', 'recorded_at', 'recorded_by', 'created_at', 'updated_at'
  ],
  doctors: [
    'id', 'name', 'qualification', 'specialization', 'phone', 'email', 'active',
    'created_at', 'updated_at'
  ],
  consultations: [
    'id', 'consultation_no', 'patient_id', 'uhid', 'doctor_id', 'doctor_name',
    'date', 'time', 'chief', 'symptoms', 'diagnosis', 'notes', 'advice',
    'follow_up', 'status', 'created_by', 'created_at', 'updated_at'
  ],
  appointments: [
    'id', 'appointment_no', 'patient_id', 'uhid', 'doctor_id', 'date', 'time',
    'reason', 'status', 'created_by', 'created_at', 'updated_at'
  ],
  prescriptions: [
    'id', 'prescription_no', 'patient_id', 'uhid', 'consultation_id', 'doctor_id',
    'doctor_name', 'date', 'time', 'diagnosis', 'notes', 'advice',
    'created_by', 'created_at', 'updated_at'
  ],
  prescription_items: [
    'id', 'prescription_id', 'medicine_id', 'seq', 'name', 'dosage',
    'frequency', 'duration', 'instruction', 'created_at', 'updated_at'
  ],
  medicines: [
    'id', 'medicine_code', 'name', 'generic', 'brand', 'category', 'manufacturer',
    'type', 'strength', 'unit', 'barcode', 'purchase_price', 'selling_price',
    'min_stock', 'location', 'description', 'active', 'created_at', 'updated_at'
  ],
  medicine_categories: ['id', 'name', 'created_at', 'updated_at'],
  medicine_batches: [
    'id', 'medicine_id', 'batch_no', 'mfg_date', 'expiry', 'quantity', 'available',
    'purchase_price', 'status', 'created_at', 'updated_at'
  ],
  inventory_transactions: [
    'id', 'medicine_id', 'batch_id', 'type', 'qty', 'ref_id', 'at', 'by',
    'note', 'created_at', 'updated_at'
  ],
  medicine_stock_history: [
    'id', 'medicine_id', 'date', 'opening', 'inward', 'outward', 'closing',
    'created_at', 'updated_at'
  ],
  services: [
    'id', 'service_code', 'name', 'type', 'price', 'description', 'active',
    'created_at', 'updated_at'
  ],
  bills: [
    'id', 'bill_no', 'patient_id', 'uhid', 'patient_name', 'patient_mobile',
    'patient_age', 'patient_gender', 'date', 'time', 'item_count', 'subtotal',
    'discount', 'total', 'paid', 'status', 'payment_status', 'bill_type',
    'created_by', 'cancel_reason', 'cancelled_at', 'cancelled_by', 'created_at', 'updated_at'
  ],
  bill_items: [
    'id', 'bill_id', 'item_type', 'ref_id', 'name', 'qty', 'price', 'amount',
    'batch_id', 'batch_no', 'returned', 'created_at', 'updated_at'
  ],
  payments: [
    'id', 'bill_id', 'patient_id', 'kind', 'amount', 'method', 'note', 'by',
    'at', 'created_at', 'updated_at'
  ],
  expenses: [
    'id', 'expense_no', 'category', 'amount', 'date', 'description', 'method',
    'status', 'void_reason', 'added_by', 'created_at', 'updated_at'
  ],
  returns: [
    'id', 'return_no', 'bill_id', 'bill_no', 'patient_id', 'uhid', 'patient_name',
    'reason', 'note', 'refund', 'refund_method', 'at', 'created_by', 'created_at', 'updated_at'
  ],
  return_items: [
    'id', 'return_id', 'bill_item_id', 'name', 'qty', 'batch_no', 'amount',
    'created_at', 'updated_at'
  ],
  notifications: [
    'id', 'type', 'ref', 'severity', 'title', 'message', 'read', 'at',
    'created_at', 'updated_at'
  ],
  activity_logs: [
    'id', 'user_id', 'user_name', 'action', 'entity', 'entity_id', 'at',
    'detail', 'created_at', 'updated_at'
  ],
};
