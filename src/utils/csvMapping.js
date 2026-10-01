/**
 * Shared CSV Field Mapping & Normalization Engine for HEEVA CLINIC.
 *
 * Provides:
 * - Comprehensive field alias mappings for all modules (Patients, Medicines, Categories, Doctors, Batches, Services)
 * - Safe empty-string and placeholder normalization (e.g. "—", "-", "N/A", "None")
 * - Global header inspection to catch missing mandatory columns before row validation
 * - Row canonicalization so preview, validation, and backend APIs always operate on consistent model property keys
 */

import { stripBOM, normalizeHeader } from './csvParser.js';

export const MODULE_FIELD_ALIASES = {
  patients: {
    name: [
      'name', 'full_name', 'fullname', 'patient_name', 'patient_full_name',
      'patientname', 'first_and_last_name', 'client_name', 'patient',
    ],
    date_time: [
      'date_time', 'date_and_time', 'datetime', 'registered_date_and_time',
      'registered_date_time', 'registered_datetime', 'registration_date_and_time',
      'registration_date_time', 'reg_date_and_time',
      'reg_date_time', 'reg_datetime', 'created_at', 'created_date',
      'created_date_time', 'date_and_time_dd_mm_yyyy_hh_mm', 'date_time_dd_mm_yyyy_hh_mm',
      'registered_at', 'registration_date', 'reg_date', 'registered_date',
    ],
    reg_date: [
      'registration_date', 'reg_date', 'registered_date', 'date_of_registration',
      'regdate', 'date',
    ],
    reg_time: [
      'registration_time', 'reg_time', 'registered_time', 'time_of_registration',
      'regtime', 'time',
    ],
    age: [
      'age', 'age_years', 'age_in_years', 'age_yrs', 'age_year', 'years',
      'patient_age', 'age_yr', 'yrs', 'patient_age_years',
    ],
    gender: [
      'gender', 'sex', 'gender_m_f_other', 'patient_gender', 'gender_mfother',
      'gender_m_f', 'gender_male_female_other',
    ],
    marital_status: [
      'marital_status', 'maritalstatus', 'marital', 'marital_status_singlemarriedetc',
      'marital_status_single_married_etc', 'marriage_status', 'marital_state',
    ],
    mobile: [
      'mobile', 'mobile_number', 'mobilenumber', 'mobile_10_digits', 'mobile_10digits',
      'phone', 'phone_number', 'phonenumber', 'contact', 'contact_number', 'contact_no',
      'cell', 'cell_number', 'cellphone', 'whatsapp', 'patient_mobile', 'mobile_no',
      'primary_mobile', 'phone_no',
    ],
    blood_group: [
      'blood_group', 'bloodgroup', 'blood_type', 'bloodtype', 'blood', 'bg',
    ],
    address: [
      'address', 'residential_address', 'home_address', 'street_address',
      'patient_address', 'full_address', 'addr', 'residence',
    ],
    pin: [
      'pin', 'pin_code', 'pincode', 'postal_code', 'postalcode', 'zip', 'zip_code', 'zipcode',
    ],
    uhid: [
      'uhid', 'uhid_no', 'uhid_number', 'patient_id', 'patient_uhid',
    ],
    allergies: [
      'allergies', 'allergy', 'known_allergies',
    ],
    conditions: [
      'conditions', 'medical_conditions', 'known_conditions', 'important_medical_conditions',
      'history', 'medical_history',
    ],
    current_meds: [
      'current_meds', 'current_medications', 'medications', 'meds', 'active_medications',
    ],
    notes: [
      'notes', 'remarks', 'comments', 'note', 'patient_status', 'status',
    ],
  },

  medicines: {
    name: [
      'name', 'medicine_name', 'brand_name', 'brand', 'medicine', 'product_name',
      'drug_name', 'item_name', 'medicine_name_brand', 'medicine_title',
    ],
    generic: [
      'generic', 'generic_name', 'composition', 'salt', 'salt_name', 'formula',
      'active_ingredient',
    ],
    category: [
      'category', 'category_name', 'med_category', 'group', 'class', 'therapeutic_class',
    ],
    type: [
      'type', 'dosage_form', 'form', 'type_tabletcapsulesyrupetc', 'type_tablet_capsule_syrup_etc',
      'item_type',
    ],
    strength: [
      'strength', 'dosage', 'potency', 'dose', 'concentration',
    ],
    unit: [
      'unit', 'packaging', 'uom', 'pack_unit', 'unit_stripbottlevial', 'unit_strip_bottle_vial',
      'pack', 'package_unit',
    ],
    purchase_price: [
      'purchase_price', 'purchase_price_inr', 'purchase_price_rs', 'buy_price',
      'cost_price', 'cost', 'buy_rate', 'purchase_rate', 'buying_price', 'cp',
      'purchase_price_approx',
    ],
    selling_price: [
      'selling_price', 'selling_price_inr', 'selling_price_rs', 'sell_price',
      'sale_price', 'mrp', 'retail_price', 'price', 'rate', 'selling_rate', 'sp',
      'unit_price',
    ],
    min_stock: [
      'min_stock', 'minimum_stock', 'min_stock_level', 'minimum_stock_level',
      'reorder_level', 'threshold', 'low_stock_threshold', 'alert_stock',
    ],
    location: [
      'location', 'storage_location', 'shelf', 'rack', 'bin', 'box', 'rack_no',
    ],
    description: [
      'description', 'desc', 'notes', 'details', 'instruction',
    ],
    medicine_code: [
      'medicine_code', 'code', 'item_code', 'med_code', 'drug_code',
    ],
  },

  medicine_categories: {
    name: [
      'name', 'category_name', 'category', 'category_title', 'title', 'group_name',
    ],
  },

  doctors: {
    name: [
      'name', 'doctor_name', 'doctor_full_name', 'full_name', 'doctor',
      'physician_name', 'doc_name', 'consultant_name', 'dr_name',
    ],
    qualification: [
      'qualification', 'qualifications', 'degree', 'degrees', 'edu', 'education',
    ],
    specialization: [
      'specialization', 'specialty', 'speciality', 'department', 'dept',
    ],
    phone: [
      'phone', 'phone_mobile', 'phone_number', 'mobile', 'mobile_number',
      'contact', 'contact_number', 'cell', 'cell_number', 'doc_phone',
    ],
    email: [
      'email', 'email_address', 'email_id', 'mail',
    ],
  },

  inventory_batches: {
    medicine_name: [
      'medicine_name', 'medicine_name_existing', 'medicine', 'brand_name',
      'brand', 'drug_name', 'item_name', 'product_name', 'product',
    ],
    medicine_id: [
      'medicine_id', 'med_id',
    ],
    batch_no: [
      'batch_no', 'batch_number', 'batch', 'lot_no', 'lot_number', 'batch_num', 'lot',
      'batch_id',
    ],
    mfg_date: [
      'mfg_date', 'mfg_date_yyyy_mm_dd', 'mfg_date_dd_mm_yyyy_or_yyyy_mm_dd',
      'manufacturing_date', 'mfg', 'mfgdate', 'manufacture_date',
    ],
    expiry: [
      'expiry', 'expiry_date', 'expiry_date_yyyy_mm_dd', 'expiry_date_dd_mm_yyyy_or_yyyy_mm_dd',
      'exp_date', 'exp', 'expiration_date', 'expire_date',
    ],
    quantity: [
      'quantity', 'received_quantity', 'qty', 'units', 'stock', 'count',
      'received_qty', 'amount_received', 'pack_qty',
    ],
    purchase_price: [
      'purchase_price', 'purchase_price_inr', 'purchase_price_rs', 'buy_price',
      'cost_price', 'cost', 'buy_rate', 'rate', 'price',
    ],
  },

  services: {
    name: [
      'name', 'service_name', 'title', 'procedure', 'test_name',
    ],
    service_code: [
      'service_code', 'code', 'id',
    ],
    type: [
      'type', 'category', 'service_type',
    ],
    price: [
      'price', 'cost', 'fee', 'charge', 'amount', 'rate',
    ],
    description: [
      'description', 'notes', 'details',
    ],
  },
};

export const MODULE_REQUIRED_FIELDS = {
  patients: ['name', 'gender'],
  medicines: ['name', 'selling_price'],
  medicine_categories: ['name'],
  doctors: ['name'],
  inventory_batches: ['medicine_name', 'batch_no', 'expiry', 'quantity'],
  services: ['name', 'price'],
};

export const MODULE_FIELD_LABELS = {
  name: 'Full Name / Name',
  date_time: 'Date & Time',
  age: 'Age',
  gender: 'Gender',
  marital_status: 'Marital Status',
  mobile: 'Mobile Number',
  blood_group: 'Blood Group',
  address: 'Address',
  pin: 'PIN Code',
  selling_price: 'Selling Price',
  purchase_price: 'Purchase Price',
  medicine_name: 'Medicine Name',
  batch_no: 'Batch Number',
  expiry: 'Expiry Date',
  quantity: 'Quantity',
  phone: 'Phone / Mobile',
  email: 'Email Address',
  qualification: 'Qualification',
  specialization: 'Specialization',
  price: 'Service Fee / Price',
};

/**
 * Strips zero-width chars and normalizes harmless placeholder representations
 * (e.g., em dash "—", "-", "N/A", "None", "null") to an empty string.
 */
export function normalizeValue(val) {
  if (val === null || val === undefined) return '';
  let s = stripBOM(val).trim();
  const lower = s.toLowerCase();

  if (
    s === '—' || // Em dash (\u2014)
    s === '–' || // En dash (\u2013)
    s === '-' || // Hyphen
    lower === 'n/a' ||
    lower === 'na' ||
    lower === 'null' ||
    lower === 'undefined' ||
    lower === 'none'
  ) {
    return '';
  }
  return s;
}

/**
 * Cleans currency symbols and converts comma decimals if needed.
 */
export function cleanCurrency(val) {
  if (val === null || val === undefined) return '';
  let s = normalizeValue(val);
  if (!s) return '';
  // Remove currency symbols and whitespace
  s = s.replace(/[₹$€£\s]/g, '');
  // If both comma and dot exist (e.g. 1,500.50), comma is thousands separator
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    // If only comma exists (e.g. 15,50), convert to decimal dot
    s = s.replace(',', '.');
  }
  return s;
}

/**
 * Checks whether the uploaded CSV headers map to the module's mandatory required columns.
 * Returns null if valid, or a descriptive error string if mandatory columns are completely missing.
 */
export function inspectHeaders(type, headers) {
  const aliasesMap = MODULE_FIELD_ALIASES[type];
  const requiredFields = MODULE_REQUIRED_FIELDS[type] || [];
  if (!aliasesMap || requiredFields.length === 0) return null;

  const normalizedHeaders = (headers || []).map(normalizeHeader);
  const headerSet = new Set(normalizedHeaders);

  const missingFields = [];
  for (const field of requiredFields) {
    const aliases = aliasesMap[field] || [field];
    const isMapped = aliases.some((alias) => headerSet.has(alias));
    if (!isMapped) {
      const label = MODULE_FIELD_LABELS[field] || field;
      missingFields.push(label);
    }
  }

  if (missingFields.length > 0) {
    return `CSV file is missing mandatory column(s): ${missingFields.join(', ')}. Found headers in uploaded file: [${headers.join(', ')}]. Please verify your column headers or download the official template.`;
  }

  return null;
}

/**
 * Maps a single row from parseCSV into a canonical row with standard property keys.
 */
export function mapParsedRow(type, rawRow) {
  const aliasesMap = MODULE_FIELD_ALIASES[type] || {};
  const canonicalRow = {
    __rowNum: rawRow.__rowNum,
    __raw: rawRow,
  };

  // 1. Populate canonical fields by scanning matching aliases
  for (const [canonicalKey, aliases] of Object.entries(aliasesMap)) {
    let foundValue = '';
    for (const alias of aliases) {
      if (rawRow[alias] !== undefined && rawRow[alias] !== '') {
        foundValue = rawRow[alias];
        break;
      }
    }
    canonicalRow[canonicalKey] = normalizeValue(foundValue);
  }

  // 2. Also keep all original properties so unmapped custom data isn't discarded
  for (const [key, value] of Object.entries(rawRow)) {
    if (key !== '__rowNum' && key !== '__raw' && canonicalRow[key] === undefined) {
      canonicalRow[key] = normalizeValue(value);
    }
  }

  // 3. For patients, if separate Registration Date and Registration Time were provided, combine them
  if (type === 'patients') {
    const rawDate = canonicalRow.reg_date || '';
    const rawTime = canonicalRow.reg_time || '';
    if (rawDate && rawTime) {
      canonicalRow.date_time = `${rawDate} ${rawTime}`.trim();
    } else if (rawDate && !canonicalRow.date_time) {
      canonicalRow.date_time = rawDate;
    }
  }

  return canonicalRow;
}

/**
 * Maps an array of parsed rows into canonical rows.
 */
export function mapCSVRows(type, parsedRows) {
  if (!Array.isArray(parsedRows)) return [];
  return parsedRows.map((r) => mapParsedRow(type, r));
}
