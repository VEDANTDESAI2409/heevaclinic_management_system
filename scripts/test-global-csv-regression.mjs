import { parseCSV, stripBOM, detectDelimiter, normalizeHeader } from '../src/utils/csvParser.js';
import { CSV_TEMPLATES, downloadTemplate } from '../src/utils/csvTemplates.js';
import { validateCSVRows } from '../src/utils/csvValidation.js';
import { mapCSVRows, inspectHeaders, normalizeValue, cleanCurrency } from '../src/utils/csvMapping.js';
import { toCSV } from '../src/utils.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed++;
  } else {
    console.log(`✅ PASS: ${message}`);
    passed++;
  }
}

console.log('================================================================');
console.log('HEEVA CLINIC — GLOBAL CSV IMPORT & EXPORT VERIFICATION SUITE');
console.log('================================================================');

// ─── 1. SHARED CSV ENGINE UNIT TESTS ───────────────────────────────────────────
console.log('\n--- 1. Shared CSV Parser & BOM Handling ---');

// UTF-8 BOM + Quoted header
const bomCsv = '\uFEFF"Full Name",Age,Gender,"Mobile Number"\r\n"Ramesh Sharma",36,M,"9825012345"\r\n';
const parsedBOM = parseCSV(bomCsv);
assert(parsedBOM.headers[0] === 'full_name', 'BOM stripped correctly from first header');
assert(parsedBOM.rows.length === 1, 'BOM CSV parsed 1 row');
assert(parsedBOM.rows[0].full_name === 'Ramesh Sharma', 'BOM CSV cell parsed cleanly');

// Semicolon delimiter (European / regional Excel)
const semiCsv = 'Full Name;Age;Gender;Mobile Number\r\nPriya Patel;28;Female;9724012345\r\n';
const parsedSemi = parseCSV(semiCsv);
assert(parsedSemi.delimiter === ';', 'Auto-detected semicolon delimiter');
assert(parsedSemi.headers.length === 4, 'Semicolon CSV parsed 4 headers');
assert(parsedSemi.rows[0].age === '28', 'Semicolon CSV cell parsed correctly');

// Tab delimiter (TSV)
const tsv = 'Full Name\tAge\tGender\tMobile Number\r\nAnil Mehta\t45\tMale\t9898012345\r\n';
const parsedTSV = parseCSV(tsv);
assert(parsedTSV.delimiter === '\t', 'Auto-detected tab delimiter');
assert(parsedTSV.rows[0].full_name === 'Anil Mehta', 'Tab delimited cell parsed correctly');

// Quoted cell with commas and escaped quotes
const complexCsv = 'Name,Address\r\n"Desai, Vedant","Flat 402, ""Royal"", Pal Gam"\r\n';
const parsedComplex = parseCSV(complexCsv);
assert(parsedComplex.rows[0].name === 'Desai, Vedant', 'Parsed cell with internal comma');
assert(parsedComplex.rows[0].address === 'Flat 402, "Royal", Pal Gam', 'Parsed cell with escaped quotes');

// Empty-value and placeholder normalization
console.log('\n--- 2. Empty Value & Placeholder Normalization ---');
assert(normalizeValue('—') === '', 'Normalized em-dash to empty string');
assert(normalizeValue('–') === '', 'Normalized en-dash to empty string');
assert(normalizeValue('-') === '', 'Normalized hyphen to empty string');
assert(normalizeValue('N/A') === '', 'Normalized N/A to empty string');
assert(normalizeValue('None') === '', 'Normalized None to empty string');
assert(normalizeValue('  null  ') === '', 'Normalized null to empty string');
assert(normalizeValue('Valid Address') === 'Valid Address', 'Preserved non-placeholder string');

// Currency cleaner
assert(cleanCurrency('₹ 1,500.50') === '1500.50', 'Cleaned Rupee symbol and thousands comma');
assert(cleanCurrency('$25.00') === '25.00', 'Cleaned Dollar symbol');

// ─── 3. GLOBAL HEADER MAPPING & MISCONFIGURATION DETECTION ──────────────────────
console.log('\n--- 3. Global Header Mapping & Configuration Error Reporting ---');

const badHeadersCsv = 'Color,Shape,Texture\r\nRed,Round,Smooth\r\n';
const parsedBad = parseCSV(badHeadersCsv);
const badValidation = validateCSVRows('patients', parsedBad.rows, { headers: parsedBad.rawHeaders });
assert(badValidation.mappingError !== null, 'Correctly detected missing required headers before row validation');
assert(badValidation.mappingError.includes('Full Name'), 'Mapping error clearly identifies missing mandatory columns');
assert(badValidation.summary.mappingError === true, 'Flagged summary.mappingError for UI banner display');

// ─── 4. MODULE VALIDATION: PATIENTS ─────────────────────────────────────────────
console.log('\n--- 4. Patient CSV Import Validation ---');

// Test 50+ realistic patients dataset
const patient50Rows = [];
for (let i = 1; i <= 55; i++) {
  patient50Rows.push([
    `Patient Test ${i}`,
    '05-09-2026 10:45',
    String(20 + (i % 60)),
    i % 2 === 0 ? 'M' : 'F',
    i % 3 === 0 ? 'Married' : 'Single',
    `98250${String(100000 + i).slice(1)}`,
    'B+',
    `Flat ${i}, Surat`,
  ]);
}
const patient50Csv = toCSV(
  ['Full Name', 'Registered Date & Time', 'Age', 'Gender', 'Marital Status', 'Mobile Number', 'Blood Group', 'Address'],
  patient50Rows
);
const parsed50 = parseCSV(patient50Csv);
const val50 = validateCSVRows('patients', parsed50.rows, { headers: parsed50.rawHeaders });
assert(val50.summary.total === 55, 'Parsed 55 patient rows');
assert(val50.summary.validCount === 55, 'All 55 patient rows passed validation');
assert(val50.validRows[0].created_at === '2026-09-05T10:45:00.000Z', 'Historical Date & Time preserved in created_at');
assert(val50.validRows[0].reg_date === '2026-09-05', 'Historical reg_date preserved');

// Patient invalid rows testing
const invalidPatientCsv = `Full Name,Age,Gender,Mobile Number,Blood Group,Date & Time
Jo,25,M,9825012345,B+,05-09-2026 10:45
Valid Patient,150,M,9825012345,B+,05-09-2026 10:45
Valid Patient,30,Alien,9825012345,B+,05-09-2026 10:45
Valid Patient,30,M,12345,B+,05-09-2026 10:45
Valid Patient,30,M,9825012345,InvalidBG,05-09-2026 10:45
Valid Patient,30,M,9825012345,B+,99-99-9999
`;
const parsedInv = parseCSV(invalidPatientCsv);
const valInv = validateCSVRows('patients', parsedInv.rows, { headers: parsedInv.rawHeaders });
assert(valInv.invalidRows.length === 6, 'Caught all 6 invalid patient rows');
assert(valInv.invalidRows[0].errors[0].includes('at least 3 characters'), 'Flagged short name');
assert(valInv.invalidRows[1].errors[0].includes('Age must be a valid number between 0 and 125'), 'Flagged out-of-range age');
assert(valInv.invalidRows[2].errors[0].includes('Gender must be M, F, or Other'), 'Flagged invalid gender');
assert(valInv.invalidRows[3].errors[0].includes('Mobile must be a valid 10-digit number'), 'Flagged short mobile');
assert(valInv.invalidRows[4].errors[0].includes('Blood group must be one of'), 'Flagged invalid blood group');
assert(valInv.invalidRows[5].errors[0].includes('Invalid month in Date & Time') || valInv.invalidRows[5].errors[0].includes('Date & Time must use DD-MM-YYYY'), 'Flagged invalid date format');

// ─── 5. MODULE VALIDATION: MEDICINES ────────────────────────────────────────────
console.log('\n--- 5. Medicine CSV Import Validation ---');

const medCsv = `Medicine Name,Generic Name,Category,Type,Strength,Unit,Buy Price,Sell Price,Min Stock
Paracetamol 650,Paracetamol,Analgesic,Tablet,650 mg,strip,₹ 8.50,₹ 15.00,20
Azithromycin 500,Azithromycin,Antibiotic,Tablet,500 mg,strip,35.00,65.00,15
`;
const parsedMed = parseCSV(medCsv);
const valMed = validateCSVRows('medicines', parsedMed.rows, { headers: parsedMed.rawHeaders });
assert(valMed.summary.validCount === 2, 'Parsed and validated medicines with currency symbols & Buy/Sell Price aliases');
assert(valMed.validRows[0].purchase_price === 8.5, 'Mapped Buy Price to purchase_price: 8.5');
assert(valMed.validRows[0].selling_price === 15, 'Mapped Sell Price to selling_price: 15');

// ─── 6. MODULE VALIDATION: INVENTORY BATCHES ─────────────────────────────────────
console.log('\n--- 6. Inventory Batches CSV Import Validation ---');

const batchCsv = `Medicine Name,Batch Number,Mfg Date,Expiry Date,Received Quantity,Purchase Price
Paracetamol 650,B-PAR-01,01-01-2026,31-12-2028,100,8.50
Paracetamol 650,B-PAR-02,2026-02-01,2028-11-30,50,8.50
`;
const batchContext = {
  existingMedicines: [{ id: 'med-par-650', name: 'Paracetamol 650', purchase_price: 8.5 }],
};
const parsedBatch = parseCSV(batchCsv);
const valBatch = validateCSVRows('inventory_batches', parsedBatch.rows, {
  ...batchContext,
  headers: parsedBatch.rawHeaders,
});
assert(valBatch.summary.validCount === 2, 'Validated inventory batches with both DD-MM-YYYY and YYYY-MM-DD date formats');
assert(valBatch.validRows[0].medicine_id === 'med-par-650', 'Mapped medicine_name to catalog medicine_id');
assert(valBatch.validRows[0].expiry === '2028-12-31', 'Standardized DD-MM-YYYY expiry to ISO YYYY-MM-DD');

// ─── 7. MODULE VALIDATION: DOCTORS ──────────────────────────────────────────────
console.log('\n--- 7. Doctors CSV Import Validation ---');

const docCsv = `Doctor Full Name,Qualification,Specialization,Phone / Mobile,Email Address
Dr. Amit Trivedi,MBBS MD,Consulting Physician,9825123456,dr.amit@example.com
Dr. Neha Shah,MS (Ortho),Orthopedic Surgeon,9825654321,dr.neha@example.com
`;
const parsedDoc = parseCSV(docCsv);
const valDoc = validateCSVRows('doctors', parsedDoc.rows, { headers: parsedDoc.rawHeaders });
assert(valDoc.summary.validCount === 2, 'Validated doctors with full name, qualification, and contact details');
assert(valDoc.validRows[0].name === 'Dr. Amit Trivedi', 'Doctor name mapped cleanly');
assert(valDoc.validRows[0].specialization === 'Consulting Physician', 'Specialization mapped cleanly');

// ─── 8. EXPORT -> IMPORT ROUND TRIP COMPATIBILITY ───────────────────────────────
console.log('\n--- 8. Export -> Import Round Trip Compatibility ---');

// A. Patient export simulation
const exportedPatientCsv = toCSV(
  ['UHID', 'Registered Date & Time', 'Full Name', 'Age', 'Gender', 'Marital Status', 'Mobile Number', 'Blood Group', 'Address', 'PIN Code', 'Allergies', 'Important Medical Conditions', 'Current Medications', 'Notes', 'Patient Status'],
  [
    ['HC-2026-000001', '05-09-2026 10:45', 'Ramesh Sharma', '36', 'M', 'Married', '9825012345', 'B+', 'Flat 402, Shivalik Residency, Pal Gam, Surat', '395009', 'None', 'None', 'None', '—', 'New'],
    ['HC-2026-000002', '06-09-2026 14:20', 'Priya Patel', '28', 'F', 'Single', '9724012345', 'O+', 'B-12, Green City, Adajan, Surat', '395009', 'None', 'None', 'None', '—', 'New'],
  ]
);
const parsedExpPat = parseCSV(exportedPatientCsv);
const valExpPat = validateCSVRows('patients', parsedExpPat.rows, { headers: parsedExpPat.rawHeaders });
assert(valExpPat.summary.validCount === 2, 'Exported Patient CSV seamlessly imported back without mapping or placeholder errors');

// A2. Patient import with separate Registration Date and Registration Time columns
const separateDateTimeCsv = toCSV(
  ['UHID', 'Registration Date', 'Registration Time', 'Full Name', 'Age', 'Gender', 'Mobile Number'],
  [
    ['HC-2026-000003', '15-09-2026', '16:45', 'Kavita Joshi', '32', 'F', '9898012345'],
    ['HC-2026-000004', '16-09-2026', '11:15 AM', 'Suresh Patel', '48', 'M', '9898098765'],
  ]
);
const parsedSep = parseCSV(separateDateTimeCsv);
const valSep = validateCSVRows('patients', parsedSep.rows, { headers: parsedSep.rawHeaders });
assert(valSep.summary.validCount === 2, 'Separate Registration Date & Time (with 12h AM/PM) combined and validated successfully');
assert(valSep.validRows[0].reg_date === '2026-09-15', 'Historical reg_date extracted correctly from separate date column');
assert(valSep.validRows[1].created_at.includes('2026-09-16T11:15'), 'Historical AM/PM time parsed accurately into created_at');

// B. Medicine export simulation
const exportedMedCsv = toCSV(
  ['Code', 'Name', 'Generic', 'Category', 'Type', 'Strength', 'Unit', 'Buy Price', 'Sell Price', 'Min Stock', 'Available', 'Active'],
  [
    ['MD-0001', 'Paracetamol 650', 'Paracetamol', 'Analgesic', 'Tablet', '650 mg', 'strip', 8.5, 15, 20, 100, 'yes'],
    ['MD-0002', 'Amoxicillin 500', 'Amoxicillin', 'Antibiotic', 'Capsule', '500 mg', 'strip', 45, 72, 10, 50, 'yes'],
  ]
);
const parsedExpMed = parseCSV(exportedMedCsv);
const valExpMed = validateCSVRows('medicines', parsedExpMed.rows, { headers: parsedExpMed.rawHeaders });
assert(valExpMed.summary.validCount === 2, 'Exported Medicine CSV seamlessly imported back (Buy Price -> purchase_price, Sell Price -> selling_price)');

// C. Category export simulation
const exportedCatCsv = toCSV(
  ['Category Name'],
  [['Pediatric'], ['Orthopedic'], ['Ophthalmic']]
);
const parsedExpCat = parseCSV(exportedCatCsv);
const valExpCat = validateCSVRows('medicine_categories', parsedExpCat.rows, { headers: parsedExpCat.rawHeaders });
assert(valExpCat.summary.validCount === 3, 'Exported Category CSV seamlessly imported back');

// D. Doctor export simulation
const exportedDocCsv = toCSV(
  ['Doctor Full Name', 'Qualification', 'Specialization', 'Phone / Mobile', 'Email Address', 'Status'],
  [['Dr. Rajesh Verma', 'MBBS, MD', 'Consulting Physician', '9898012345', 'dr.verma@example.com', 'Active']]
);
const parsedExpDoc = parseCSV(exportedDocCsv);
const valExpDoc = validateCSVRows('doctors', parsedExpDoc.rows, { headers: parsedExpDoc.rawHeaders });
assert(valExpDoc.summary.validCount === 1, 'Exported Doctor CSV seamlessly imported back');

// E. Inventory batch export simulation
const exportedBatchCsv = toCSV(
  ['Medicine Name', 'Batch Number', 'Mfg Date', 'Expiry Date', 'Received Quantity', 'Purchase Price'],
  [['Paracetamol 650', 'B-EXP-01', '01-01-2026', '31-12-2028', 100, 8.5]]
);
const parsedExpBatch = parseCSV(exportedBatchCsv);
const valExpBatch = validateCSVRows('inventory_batches', parsedExpBatch.rows, {
  ...batchContext,
  headers: parsedExpBatch.rawHeaders,
});
assert(valExpBatch.summary.validCount === 1, 'Exported Inventory Batches CSV seamlessly imported back');

// ─── 9. LIVE BACKEND & PERSISTENCE ACCEPTANCE ────────────────────────────────────
console.log('\n--- 9. Live Cloudflare D1 Backend & Persistence Acceptance ---');

const API_BASE = process.env.API_BASE || 'http://localhost:8787';

async function testBackendBulk() {
  try {
    const healthRes = await fetch(`${API_BASE}/api/health`);
    if (!healthRes.ok) throw new Error('Backend offline');

    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'heeva@26' }),
    });
    const { token } = await loginRes.json();
    const authHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    // 1. Bulk import patients
    const pRes = await fetch(`${API_BASE}/api/patients/import`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        records: val50.validRows.slice(0, 5),
        userId: 'test-user',
      }),
    });
    assert(pRes.ok, `POST /api/patients/import returned 200`);
    const pData = await pRes.json();
    assert(pData.success && pData.count === 5, 'Persisted 5 patients into central Cloudflare D1');
    const firstUhid = pData.records[0].uhid;
    const lastUhid = pData.records[4].uhid;
    assert(/^HC(-2026)?-\d{6}$/.test(firstUhid), `First patient UHID is canonical sequence: ${firstUhid}`);
    assert(/^HC(-2026)?-\d{6}$/.test(lastUhid), `Last patient UHID is canonical sequence: ${lastUhid}`);

    // 2. UHID Deletion & Monotonicity Test
    // Delete the first imported patient and verify subsequent UHID does NOT recycle or decrement
    await fetch(`${API_BASE}/api/patients/${pData.records[0].id}`, { method: 'DELETE', headers: authHeaders });
    const nextUhidRes = await fetch(`${API_BASE}/api/patients/next-uhid`, { headers: authHeaders });
    const nextUhidData = await nextUhidRes.json();
    const nextUhidNum = parseInt(nextUhidData.nextUhid.match(/-(\d+)$/)[1], 10);
    const lastUhidNum = parseInt(lastUhid.match(/-(\d+)$/)[1], 10);
    assert(nextUhidNum > lastUhidNum, `UHID never resets after deletion (last: ${lastUhidNum}, next: ${nextUhidNum})`);

    // 3. Clean up remaining test patients
    for (let j = 1; j < 5; j++) {
      await fetch(`${API_BASE}/api/patients/${pData.records[j].id}`, { method: 'DELETE', headers: authHeaders });
    }

    console.log(`\n================================================================`);
    console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`================================================================`);
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Backend test failure:', err.message);
    process.exit(1);
  }
}

testBackendBulk();
