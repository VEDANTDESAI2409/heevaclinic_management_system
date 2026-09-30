import { download, toCSV } from '../utils.js';

export const CSV_TEMPLATES = {
  patients: {
    title: 'Patients',
    filename: 'heeva-patients-template.csv',
    description: 'Bulk register patients. Mandatory columns: Full Name, Age, Gender (M/F/Other), Mobile Number (10 digits). Historical Date & Time is optional in DD-MM-YYYY HH:mm format.',
    headers: [
      'name', 'date_time', 'age', 'gender', 'marital_status', 'mobile',
      'blood_group', 'address'
    ],
    sampleRows: [
      [
        'Ramesh Sharma', '05-09-2026 10:45', '36', 'M', 'Married', '9825012345',
        'B+', 'Flat 402, Shivalik Residency, Pal Gam, Surat'
      ],
      [
        'Priya Patel', '06-09-2026 14:20', '28', 'F', 'Single', '9724012345',
        'O+', 'B-12, Green City, Adajan, Surat'
      ]
    ],
    columns: [
      { key: 'name', label: 'Full Name', required: true },
      { key: 'date_time', label: 'Date & Time (DD-MM-YYYY HH:mm)', required: false },
      { key: 'age', label: 'Age (Years)', required: true },
      { key: 'gender', label: 'Gender (M/F/Other)', required: true },
      { key: 'marital_status', label: 'Marital Status (Single/Married/etc)', required: false },
      { key: 'mobile', label: 'Mobile (10 digits)', required: true },
      { key: 'blood_group', label: 'Blood Group', required: false },
      { key: 'address', label: 'Address', required: false },
    ]
  },

  medicines: {
    title: 'Medicines',
    filename: 'heeva-medicines-template.csv',
    description: 'Bulk catalog pharmaceutical products. Mandatory columns: Medicine Name, Selling Price. Medicine codes (MD-XXXX) are assigned automatically if omitted.',
    headers: [
      'name', 'generic', 'category', 'type', 'strength', 'unit',
      'purchase_price', 'selling_price', 'min_stock',
      'location', 'description'
    ],
    sampleRows: [
      [
        'Paracetamol 650', 'Paracetamol', 'Analgesic', 'Tablet', '650 mg', 'strip',
        '8.50', '15.00', '20',
        'Shelf A-1', 'Anti-pyretic and pain reliever'
      ],
      [
        'Amoxicillin 500', 'Amoxicillin', 'Antibiotic', 'Capsule', '500 mg', 'strip',
        '45.00', '72.00', '10',
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
      { key: 'location', label: 'Storage Location', required: false },
      { key: 'description', label: 'Description', required: false },
    ]
  },

  medicine_categories: {
    title: 'Medicine Categories',
    filename: 'heeva-categories-template.csv',
    description: 'Bulk create pharmacological / therapeutic categories. Mandatory: Category Name (must be unique).',
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
    description: 'Bulk add consulting physicians and specialists. Mandatory: Doctor Full Name.',
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
    description: 'Bulk intake stock batches. Mandatory: Medicine Name, Batch Number, Expiry Date (DD-MM-YYYY or YYYY-MM-DD), Received Quantity. Generates audit stock ledger entries.',
    headers: ['medicine_name', 'batch_no', 'mfg_date', 'expiry', 'quantity', 'purchase_price'],
    sampleRows: [
      ['Paracetamol 650', 'B-2026-01', '01-01-2026', '31-12-2028', '100', '8.50'],
      ['Amoxicillin 500', 'B-2026-02', '15-02-2026', '31-08-2027', '50', '45.00']
    ],
    columns: [
      { key: 'medicine_name', label: 'Medicine Name (Existing)', required: true },
      { key: 'batch_no', label: 'Batch Number', required: true },
      { key: 'mfg_date', label: 'Mfg Date (DD-MM-YYYY or YYYY-MM-DD)', required: false },
      { key: 'expiry', label: 'Expiry Date (DD-MM-YYYY or YYYY-MM-DD)', required: true },
      { key: 'quantity', label: 'Received Quantity', required: true },
      { key: 'purchase_price', label: 'Purchase Price (₹)', required: false }
    ]
  },

  services: {
    title: 'Services',
    filename: 'heeva-services-template.csv',
    description: 'Bulk catalog clinical services, procedures, and test fees. Mandatory: Service Name, Price.',
    headers: ['name', 'price', 'type', 'description'],
    sampleRows: [
      ['General Consultation', '500.00', 'Consultation', 'Standard physician consultation'],
      ['Blood Sugar Test', '150.00', 'Investigation', 'Fasting blood glucose check']
    ],
    columns: [
      { key: 'name', label: 'Service Name', required: true },
      { key: 'price', label: 'Fee / Price (₹)', required: true },
      { key: 'type', label: 'Service Type', required: false },
      { key: 'description', label: 'Description', required: false }
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
