import { download, toCSV } from '../utils.js';

export const CSV_TEMPLATES = {
  patients: {
    title: 'Patients',
    filename: 'heeva-patients-template.csv',
    description: 'Bulk register patients. Mandatory columns: name, dob (YYYY-MM-DD), gender (Male/Female/Other), mobile (10 digits). Permanent UHID is assigned automatically.',
    headers: [
      'name', 'dob', 'gender', 'mobile', 'alt_mobile', 'email',
      'address', 'city', 'state', 'pin',
      'blood_group', 'allergies', 'conditions', 'current_meds', 'notes',
      'ec_name', 'ec_number', 'ec_relation'
    ],
    sampleRows: [
      [
        'Ramesh Sharma', '1988-05-14', 'Male', '9825012345', '9825098765', 'ramesh@example.com',
        'Flat 402, Shivalik Residency, Pal Gam', 'Surat', 'Gujarat', '395009',
        'B+', 'Penicillin', 'Hypertension', 'Amlodipine 5mg', 'Regular follow up',
        'Sunita Sharma', '9825011122', 'Spouse'
      ],
      [
        'Priya Patel', '1995-11-20', 'Female', '9724012345', '', 'priya.patel@example.com',
        'B-12, Green City, Adajan', 'Surat', 'Gujarat', '395009',
        'O+', 'None', 'None', '', 'New patient',
        'Ketan Patel', '9724099887', 'Brother'
      ]
    ],
    columns: [
      { key: 'name', label: 'Full Name', required: true },
      { key: 'dob', label: 'Date of Birth (YYYY-MM-DD)', required: true },
      { key: 'gender', label: 'Gender (Male/Female/Other)', required: true },
      { key: 'mobile', label: 'Mobile (10 digits)', required: true },
      { key: 'alt_mobile', label: 'Alt Mobile', required: false },
      { key: 'email', label: 'Email Address', required: false },
      { key: 'address', label: 'Address', required: false },
      { key: 'city', label: 'City', required: false },
      { key: 'state', label: 'State', required: false },
      { key: 'pin', label: 'Pincode', required: false },
      { key: 'blood_group', label: 'Blood Group', required: false },
      { key: 'allergies', label: 'Allergies', required: false },
      { key: 'conditions', label: 'Known Conditions', required: false },
      { key: 'current_meds', label: 'Current Medications', required: false },
      { key: 'notes', label: 'Notes', required: false },
      { key: 'ec_name', label: 'Emergency Contact Name', required: false },
      { key: 'ec_number', label: 'Emergency Contact Number', required: false },
      { key: 'ec_relation', label: 'Emergency Contact Relation', required: false },
    ]
  },

  medicines: {
    title: 'Medicines',
    filename: 'heeva-medicines-template.csv',
    description: 'Bulk catalog pharmaceutical products. Mandatory columns: name, selling_price. Medicine codes (MD-XXXX) are assigned automatically if omitted.',
    headers: [
      'name', 'generic', 'category', 'type', 'strength', 'unit',
      'purchase_price', 'selling_price', 'min_stock', 'barcode',
      'location', 'description'
    ],
    sampleRows: [
      [
        'Paracetamol 650', 'Paracetamol', 'Analgesic', 'Tablet', '650 mg', 'strip',
        '8.50', '15.00', '20', '8901234567890',
        'Shelf A-1', 'Anti-pyretic and pain reliever'
      ],
      [
        'Amoxicillin 500', 'Amoxicillin', 'Antibiotic', 'Capsule', '500 mg', 'strip',
        '45.00', '72.00', '10', '8901234567891',
        'Shelf B-2', 'Broad spectrum antibiotic'
      ]
    ],
    columns: [
      { key: 'name', label: 'Medicine Name (Brand)', required: true },
      { key: 'generic', label: 'Generic Name', required: false },
      { key: 'category', label: 'Category', required: false },
      { key: 'type', label: 'Type (Tablet/Capsule/Syrup/etc)', required: false },
      { key: 'strength', label: 'Strength', required: false },
      { key: 'unit', label: 'Unit (strip/bottle/vial)', required: false },
      { key: 'purchase_price', label: 'Purchase Price (₹)', required: false },
      { key: 'selling_price', label: 'Selling Price (₹)', required: true },
      { key: 'min_stock', label: 'Minimum Stock Level', required: false },
      { key: 'barcode', label: 'Barcode', required: false },
      { key: 'location', label: 'Storage Location', required: false },
      { key: 'description', label: 'Description', required: false },
    ]
  },

  medicine_categories: {
    title: 'Medicine Categories',
    filename: 'heeva-categories-template.csv',
    description: 'Bulk create pharmacological / therapeutic categories. Mandatory: name (must be unique).',
    headers: ['name'],
    sampleRows: [
      ['Pediatric'],
      ['Orthopedic'],
      ['Ophthalmic']
    ],
    columns: [
      { key: 'name', label: 'Category Name', required: true }
    ]
  },

  doctors: {
    title: 'Doctors',
    filename: 'heeva-doctors-template.csv',
    description: 'Bulk add consulting physicians and specialists. Mandatory: name.',
    headers: ['name', 'qualification', 'specialization', 'phone', 'email'],
    sampleRows: [
      ['Dr. Rajesh Verma', 'MBBS, MD (Medicine)', 'Consulting Physician', '9898012345', 'dr.verma@example.com'],
      ['Dr. Anjali Mehta', 'MBBS, DGO', 'Gynecologist & Obstetrician', '9898098765', 'dr.mehta@example.com']
    ],
    columns: [
      { key: 'name', label: 'Doctor Full Name', required: true },
      { key: 'qualification', label: 'Qualification', required: false },
      { key: 'specialization', label: 'Specialization', required: false },
      { key: 'phone', label: 'Phone / Mobile', required: false },
      { key: 'email', label: 'Email Address', required: false }
    ]
  },

  inventory_batches: {
    title: 'Inventory Batches',
    filename: 'heeva-inventory-batches-template.csv',
    description: 'Bulk intake stock batches. Mandatory: medicine_name, batch_no, expiry (YYYY-MM-DD), quantity. Generates audit stock ledger entries.',
    headers: ['medicine_name', 'batch_no', 'mfg_date', 'expiry', 'quantity', 'purchase_price'],
    sampleRows: [
      ['Paracetamol 650', 'B-2026-01', '2026-01-01', '2028-12-31', '100', '8.50'],
      ['Amoxicillin 500', 'B-2026-02', '2026-02-15', '2027-08-31', '50', '45.00']
    ],
    columns: [
      { key: 'medicine_name', label: 'Medicine Name (Existing)', required: true },
      { key: 'batch_no', label: 'Batch Number', required: true },
      { key: 'mfg_date', label: 'Mfg Date (YYYY-MM-DD)', required: false },
      { key: 'expiry', label: 'Expiry Date (YYYY-MM-DD)', required: true },
      { key: 'quantity', label: 'Received Quantity', required: true },
      { key: 'purchase_price', label: 'Purchase Price (₹)', required: false }
    ]
  }
};

export function downloadTemplate(type) {
  const template = CSV_TEMPLATES[type];
  if (!template) {
    throw new Error(`Unknown template type: ${type}`);
  }
  const csvContent = toCSV(template.headers, template.sampleRows);
  download(template.filename, csvContent, 'text/csv');
}
