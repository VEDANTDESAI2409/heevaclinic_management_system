import { parseCSV } from '../src/utils/csvParser.js';
import { CSV_TEMPLATES } from '../src/utils/csvTemplates.js';
import { validateCSVRows } from '../src/utils/csvValidation.js';

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

console.log('--- 1. Testing RFC-4180 CSV Parser ---');

const sampleCsv = `Name,Date of Birth,Gender,Mobile,Address
"Desai, Vedant",1998-07-22,Male,9876543210,"Flat 101, ""Royal Palace"", Adajan"
"Patel, Priya",2001-03-15,Female,9825012345,"B-42, Green Avenue, Surat"
`;

const parsed = parseCSV(sampleCsv);
assert(parsed.headers.length === 5, 'Parsed 5 normalized headers');
assert(parsed.headers[0] === 'name' && parsed.headers[1] === 'date_of_birth', 'Normalized header names');
assert(parsed.rows.length === 2, 'Parsed exactly 2 rows');
assert(parsed.rows[0].name === 'Desai, Vedant', 'Handled comma inside quoted cell');
assert(parsed.rows[0].address === 'Flat 101, "Royal Palace", Adajan', 'Handled escaped quotes ("") inside cell');

console.log('\n--- 2. Testing Entity Validation & Templates ---');

for (const entity of ['patients', 'medicines', 'medicine_categories', 'doctors', 'inventory_batches']) {
  const template = CSV_TEMPLATES[entity];
  assert(!!template, `Template exists for ${entity}`);
  assert(Array.isArray(template.headers) && template.headers.length > 0, `${entity} has valid headers`);
  assert(Array.isArray(template.columns) && template.columns.length > 0, `${entity} has column metadata`);
}

// Test patient validation
const patientRows = [
  { __rowNum: 2, name: 'John Doe', dob: '1990-01-01', gender: 'male', mobile: '9825012345', email: 'john@example.com' },
  { __rowNum: 3, name: 'J', dob: '2099-01-01', gender: 'invalid', mobile: '123' }, // Multiple invalid fields
];

const patientValidation = validateCSVRows('patients', patientRows);
assert(patientValidation.summary.total === 2, 'Patient validation total count is 2');
assert(patientValidation.summary.validCount === 1, '1 valid patient row');
assert(patientValidation.summary.invalidCount === 1, '1 invalid patient row');
assert(patientValidation.invalidRows[0].errors.length >= 3, 'Correctly flagged short name, future DOB, invalid gender, invalid mobile');

// Test batch validation with medicine lookup
const medContext = {
  existingMedicines: [{ id: 'med-123', name: 'Paracetamol 650', purchase_price: 10 }],
};
const batchRows = [
  { __rowNum: 2, medicine_name: 'Paracetamol 650', batch_no: 'B-001', expiry: '2028-12-31', quantity: '50' },
  { __rowNum: 3, medicine_name: 'Unknown Med XYZ', batch_no: 'B-002', expiry: '2028-12-31', quantity: '20' },
];
const batchValidation = validateCSVRows('inventory_batches', batchRows, medContext);
assert(batchValidation.summary.validCount === 1, 'Valid batch with existing medicine');
assert(batchValidation.summary.invalidCount === 1, 'Invalid batch with non-existent medicine');
assert(batchValidation.validRows[0].medicine_id === 'med-123', 'Successfully mapped medicine_name to medicine_id');

console.log('\n--- 3. Testing Backend Bulk Import API ---');

async function testBackend() {
  try {
    const res = await fetch('http://localhost:3001/api/health');
    if (!res.ok) throw new Error(`Healthcheck failed: ${res.status}`);
    const health = await res.json();
    assert(health.status === 'ok' && health.storage === 'json', 'Backend is online and serving JSON storage');

    // Test import categories
    const testCatName = `TestCat-${Date.now()}`;
    const catRes = await fetch('http://localhost:3001/api/medicine_categories/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{ name: testCatName }],
        userId: 'test-admin',
      }),
    });
    assert(catRes.ok, `POST /api/medicine_categories/import returned status ${catRes.status}`);
    const catData = await catRes.json();
    assert(catData.success && catData.count === 1, 'Successfully imported category via backend API');
    assert(catData.records[0].name === testCatName, 'Category record has correct name and generated id');

    // Test import patient
    const testMobile = `98${Math.floor(10000000 + Math.random() * 90000000)}`;
    const patientRes = await fetch('http://localhost:3001/api/patients/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{
          name: 'CSV Test Patient',
          dob: '1992-04-10',
          gender: 'Male',
          mobile: testMobile,
          city: 'Surat',
          state: 'Gujarat',
        }],
        userId: 'test-admin',
      }),
    });
    assert(patientRes.ok, `POST /api/patients/import returned status ${patientRes.status}`);
    const patientData = await patientRes.json();
    assert(patientData.success && patientData.count === 1, 'Successfully imported patient via backend API');
    assert(/^HC(-2026)?-\d+/.test(patientData.records[0].uhid), `Patient auto-assigned sequential UHID: ${patientData.records[0].uhid}`);
    assert(patientData.extraTables?.counters?.length > 0, 'Returned updated counter in extraTables for client sync');

    // Test import medicines
    const testMedName = `TestMed-${Date.now()}`;
    const medRes = await fetch('http://localhost:3001/api/medicines/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{
          name: testMedName,
          generic: 'Test Generic',
          category: 'Test Category',
          selling_price: 25.5,
          purchase_price: 15.0,
        }],
        userId: 'test-admin',
      }),
    });
    assert(medRes.ok, `POST /api/medicines/import returned status ${medRes.status}`);
    const medData = await medRes.json();
    assert(medData.success && medData.count === 1, 'Successfully imported medicine via backend API');
    assert(/^MD-\d+/.test(medData.records[0].medicine_code), `Medicine assigned auto code: ${medData.records[0].medicine_code}`);
    const createdMed = medData.records[0];

    // Test import doctors
    const testDocName = `Dr. Test-${Date.now()}`;
    const docRes = await fetch('http://localhost:3001/api/doctors/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{
          name: testDocName,
          qualification: 'MBBS, MD',
          specialization: 'General Medicine',
          phone: '9876543210',
        }],
        userId: 'test-admin',
      }),
    });
    assert(docRes.ok, `POST /api/doctors/import returned status ${docRes.status}`);
    const docData = await docRes.json();
    assert(docData.success && docData.count === 1, 'Successfully imported doctor via backend API');

    // Test import inventory batches
    const testBatchNo = `BAT-${Date.now()}`;
    const batchRes = await fetch('http://localhost:3001/api/medicine_batches/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        records: [{
          medicine_id: createdMed.id,
          batch_no: testBatchNo,
          expiry: '2028-06-30',
          quantity: 100,
          purchase_price: 15.0,
        }],
        userId: 'test-admin',
      }),
    });
    assert(batchRes.ok, `POST /api/medicine_batches/import returned status ${batchRes.status}`);
    const batchData = await batchRes.json();
    assert(batchData.success && batchData.count === 1, 'Successfully imported inventory batch via backend API');
    assert(batchData.extraTables?.inventory_txns?.length === 1, 'Auto-generated stock ledger transaction for batch');
    assert(batchData.extraTables.inventory_txns[0].type === 'ADJUSTMENT', 'Stock transaction is ADJUSTMENT');

    // Clean up created test records
    if (patientData.records[0]?.id) {
      await fetch(`http://localhost:3001/api/patients/${patientData.records[0].id}`, { method: 'DELETE' });
    }
    if (catData.records[0]?.id) {
      await fetch(`http://localhost:3001/api/medicine_categories/${catData.records[0].id}`, { method: 'DELETE' });
    }
    if (createdMed?.id) {
      await fetch(`http://localhost:3001/api/medicines/${createdMed.id}`, { method: 'DELETE' });
    }
    if (docData.records[0]?.id) {
      await fetch(`http://localhost:3001/api/doctors/${docData.records[0].id}`, { method: 'DELETE' });
    }
    if (batchData.records[0]?.id) {
      await fetch(`http://localhost:3001/api/medicine_batches/${batchData.records[0].id}`, { method: 'DELETE' });
    }

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Backend test error:', err.message);
    process.exit(1);
  }
}

testBackend();

