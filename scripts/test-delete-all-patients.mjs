import assert from 'node:assert';
import { d1Client } from '../worker/db/d1Client.js';
import { handleClearPatients } from '../worker/routes/genericCrud.js';

console.log('=== TEST SUITE: MODULE-SPECIFIC DATA RESET (PATIENTS) ===\n');

// 1. Set up simulated mock D1 database with multiple tables
const tables = {
  clinic_settings: [
    {
      id: '1',
      clinic_name: 'HEEVA CLINIC',
      uhid_prefix: 'HC',
      uhid_include_year: 0,
      uhid_padding: 4,
      uhid_start: 1001,
    },
  ],
  counters: [],
  patients: [],
  patient_vitals: [],
  medicines: [
    { id: 'med-1', name: 'Paracetamol 500mg', active: 1 },
    { id: 'med-2', name: 'Amoxicillin 250mg', active: 1 },
  ],
  appointments: [
    { id: 'apt-1', patient_id: 'p-1', uhid: 'HC-1001', date: '2026-10-02', time: '10:00' },
  ],
  bills: [
    { id: 'bill-1', bill_no: 'HC-BILL-2026-000001', patient_id: 'p-1', uhid: 'HC-1001', patient_name: 'Patient One', total: 500 },
  ],
  bill_items: [
    { id: 'bi-1', bill_id: 'bill-1', name: 'Consultation Fee', amount: 500 },
  ],
  doctors: [
    { id: 'doc-1', name: 'Dr. Vedant Desai', specialization: 'Physician' },
  ],
};

const mockD1 = {
  prepare(sql) {
    const trimmed = sql.trim();
    let bound = [];
    const stmt = {
      sql: trimmed,
      bind(...args) {
        bound = args;
        stmt.bound = args;
        return stmt;
      },
      async first() {
        if (/SELECT \* FROM clinic_settings/i.test(trimmed)) {
          return tables.clinic_settings[0] || null;
        }
        if (/COUNT\(\*\) as (count|cnt) FROM patients/i.test(trimmed)) {
          return { count: tables.patients.length, cnt: tables.patients.length };
        }
        if (/SELECT \* FROM counters/i.test(trimmed)) {
          const key = bound[0];
          return tables.counters.find((c) => c.key === key || c.id === key) || null;
        }
        if (/SELECT \* FROM "?patients"? WHERE id = \?/i.test(trimmed)) {
          const id = bound[0];
          return tables.patients.find((p) => p.id === id) || null;
        }
        return null;
      },
      async all() {
        if (/SELECT uhid FROM patients WHERE uhid LIKE/i.test(trimmed)) {
          const prefix = bound[0].replace('%', '');
          return { results: tables.patients.filter((p) => p.uhid.startsWith(prefix)) };
        }
        if (/SELECT uhid FROM patients/i.test(trimmed)) {
          return { results: tables.patients.map((p) => ({ uhid: p.uhid })) };
        }
        return { results: [] };
      },
      async run() {
        if (/DELETE FROM patient_vitals/i.test(trimmed)) {
          tables.patient_vitals = [];
          return { success: true };
        }
        if (/DELETE FROM patients WHERE id = \?/i.test(trimmed)) {
          const id = bound[0];
          tables.patients = tables.patients.filter((p) => p.id !== id);
          return { success: true };
        }
        if (/DELETE FROM patients/i.test(trimmed)) {
          tables.patients = [];
          return { success: true };
        }
        return { success: true };
      },
    };
    return stmt;
  },
  async batch(stmts) {
    for (const stmt of stmts) {
      const sql = stmt.sql;
      const bound = stmt.bound || [];
      if (/INSERT INTO counters/i.test(sql)) {
        const [id, key, val, created_at, updated_at] = bound;
        const idx = tables.counters.findIndex((c) => c.id === id || c.key === key);
        if (idx >= 0) {
          tables.counters[idx].value = val;
          tables.counters[idx].updated_at = updated_at;
        } else {
          tables.counters.push({ id, key, value: val, created_at, updated_at });
        }
      } else if (/INSERT INTO patients/i.test(sql)) {
        const match = sql.match(/INSERT INTO patients \((.*?)\)/i);
        if (match) {
          const cols = match[1].split(',').map((c) => c.replace(/["\s]/g, ''));
          const record = {};
          cols.forEach((col, i) => { record[col] = bound[i]; });
          tables.patients.push(record);
        }
      } else if (/DELETE FROM patient_vitals/i.test(sql)) {
        tables.patient_vitals = [];
      } else if (/DELETE FROM patients/i.test(sql)) {
        tables.patients = [];
      }
    }
    return [];
  },
};

async function runTests() {
  console.log('--- TEST 1: Allocate 3 patients in D1 backend ---');
  const p1 = await d1Client.allocatePatient(mockD1, { name: 'Patient One', age: 30, gender: 'M', mobile: '9111111111' });
  const p2 = await d1Client.allocatePatient(mockD1, { name: 'Patient Two', age: 25, gender: 'F', mobile: '9222222222' });
  const p3 = await d1Client.allocatePatient(mockD1, { name: 'Patient Three', age: 40, gender: 'M', mobile: '9333333333' });

  assert(p1 && p1.uhid, 'p1 must exist');
  assert(p2 && p2.uhid, 'p2 must exist');
  assert(p3 && p3.uhid, 'p3 must exist');
  assert.strictEqual(p1.uhid, 'HC-1001');
  assert.strictEqual(p2.uhid, 'HC-1002');
  assert.strictEqual(p3.uhid, 'HC-1003');
  console.log(`  ✓ Successfully allocated: ${p1.uhid}, ${p2.uhid}, ${p3.uhid}`);

  // Add child vitals
  tables.patient_vitals.push(
    { id: 'v-1', patient_id: p1.id, temp: 98.6, pulse: 72 },
    { id: 'v-2', patient_id: p2.id, temp: 99.1, pulse: 80 }
  );

  console.log('\n--- TEST 2: Security check - confirmation phrase required ---');
  const badReq1 = await handleClearPatients({}, { DB: mockD1 });
  assert.strictEqual(badReq1.status, 400, 'Empty confirmation must return 400');
  const badReq2 = await handleClearPatients({ confirmation: 'delete patients' }, { DB: mockD1 });
  assert.strictEqual(badReq2.status, 400, 'Lower-case or invalid confirmation must return 400');
  console.log('  ✓ Verified: Invalid or missing confirmation phrase is securely rejected with HTTP 400.');

  console.log('\n--- TEST 3: Execute "Delete All Patients" with DELETE PATIENTS ---');
  const clearRes = await handleClearPatients({ confirmation: 'DELETE PATIENTS' }, { DB: mockD1 });
  assert.strictEqual(clearRes.status, 200, 'Clear must succeed with HTTP 200');
  const clearBody = await clearRes.json();
  assert.strictEqual(clearBody.ok, true);
  assert.strictEqual(clearBody.counterPreserved, 1003, 'UHID counter must be preserved at 1003');
  console.log('  ✓ Verified: Clear operation completed with counter preserved at 1003.');

  console.log('\n--- TEST 4: Data Isolation Verification ---');
  assert.strictEqual(tables.patients.length, 0, 'Patients table must be empty (0 records)');
  assert.strictEqual(tables.patient_vitals.length, 0, 'Patient vitals table must be empty (0 records)');
  console.log('  ✓ Confirmed: Patients and dependent vitals are 0.');

  assert.strictEqual(tables.medicines.length, 2, 'Medicines must NOT be deleted');
  assert.strictEqual(tables.appointments.length, 1, 'Appointments must NOT be deleted');
  assert.strictEqual(tables.bills.length, 1, 'Bills must NOT be deleted');
  assert.strictEqual(tables.bill_items.length, 1, 'Bill items must NOT be deleted');
  assert.strictEqual(tables.doctors.length, 1, 'Doctors must NOT be deleted');
  assert.strictEqual(tables.clinic_settings.length, 1, 'Clinic settings must NOT be deleted');
  console.log('  ✓ Confirmed: All unrelated module data (Medicines, Appointments, Bills, Staff, Settings) remains completely untouched.');

  console.log('\n--- TEST 5: UHID sequence continues monotonically from 1004 (no reuse of 1001-1003) ---');
  const preview = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(preview.nextUhid, 'HC-1004', `Expected HC-1004 preview, got ${preview.nextUhid}`);
  console.log(`  ✓ Preview for next patient is: ${preview.nextUhid}`);

  const pNew1 = await d1Client.allocatePatient(mockD1, { name: 'New Patient After Reset', age: 28, gender: 'F', mobile: '9444444444' });
  assert.strictEqual(pNew1.uhid, 'HC-1004', `Expected HC-1004, got ${pNew1.uhid}`);
  console.log(`  ✓ First newly created patient receives: ${pNew1.uhid}`);

  const pNew2 = await d1Client.allocatePatient(mockD1, { name: 'Second New Patient', age: 35, gender: 'M', mobile: '9555555555' });
  assert.strictEqual(pNew2.uhid, 'HC-1005', `Expected HC-1005, got ${pNew2.uhid}`);
  console.log(`  ✓ Second newly created patient receives: ${pNew2.uhid}`);

  console.log('\n======================================================');
  console.log('ALL MODULE-SPECIFIC DATA RESET TESTS PASSED (5 / 5)!');
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
