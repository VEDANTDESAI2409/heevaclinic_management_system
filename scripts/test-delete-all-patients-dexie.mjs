import assert from 'node:assert';
import 'fake-indexeddb/auto';
import { db } from '../src/db.js';
import { registerPatient, clearAllPatients } from '../src/services/patients.js';
import { DEFAULT_SETTINGS } from '../src/services/core.js';

console.log('=== TEST SUITE: DEXIE LOCAL & UHID INTEGRITY ON CLEAR ALL PATIENTS ===\n');

async function testDexie() {
  await db.open();

  // Populate default settings
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await db.settings.put({ key: k, value: v });
  }

  console.log('Step 1: Register 3 patients locally...');
  const p1 = await registerPatient({ name: 'Dexie Patient 1', age: 30, gender: 'M', mobile: '9111111111' }, 'admin');
  const p2 = await registerPatient({ name: 'Dexie Patient 2', age: 25, gender: 'F', mobile: '9222222222' }, 'admin');
  const p3 = await registerPatient({ name: 'Dexie Patient 3', age: 40, gender: 'M', mobile: '9333333333' }, 'admin');

  assert.strictEqual(p1.uhid, 'HC-1001');
  assert.strictEqual(p2.uhid, 'HC-1002');
  assert.strictEqual(p3.uhid, 'HC-1003');
  console.log(`  ✓ Registered: ${p1.uhid}, ${p2.uhid}, ${p3.uhid}`);

  // Create an appointment and a bill to test data isolation
  await db.appointments.add({ id: 'apt-local-1', patient_id: p1.id, uhid: p1.uhid, date: '2026-10-02', time: '11:00' });
  await db.bills.add({ id: 'bill-local-1', bill_no: 'HC-BILL-2026-000001', patient_id: p1.id, uhid: p1.uhid, patient_name: p1.name, total: 200 });
  await db.medicines.add({ id: 'med-local-1', name: 'Aspirin', active: 1 });

  console.log('\nStep 2: Execute clearAllPatients()...');
  const res = await clearAllPatients('admin');
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.counterPreserved, 1003);
  console.log(`  ✓ clearAllPatients executed. Preserved counter: ${res.counterPreserved}`);

  console.log('\nStep 3: Verify patients table is 0, other modules untouched...');
  const patientCount = await db.patients.count();
  const vitalsCount = await db.patient_vitals.count();
  const aptCount = await db.appointments.count();
  const billCount = await db.bills.count();
  const medCount = await db.medicines.count();

  assert.strictEqual(patientCount, 0, 'Patients count must be 0');
  assert.strictEqual(vitalsCount, 0, 'Vitals count must be 0');
  assert.strictEqual(aptCount, 1, 'Appointments must remain 1');
  assert.strictEqual(billCount, 1, 'Bills must remain 1');
  assert.strictEqual(medCount, 1, 'Medicines must remain 1');
  console.log('  ✓ Patients: 0, Vitals: 0');
  console.log('  ✓ Appointments: 1, Bills: 1, Medicines: 1 (Untouched)');

  console.log('\nStep 4: Register next patient after clearing all patients...');
  const pNext = await registerPatient({ name: 'Dexie Patient After Reset', age: 29, gender: 'F', mobile: '9444444444' }, 'admin');
  assert.strictEqual(pNext.uhid, 'HC-1004', `Expected HC-1004, got ${pNext.uhid}`);
  console.log(`  ✓ Newly registered patient received: ${pNext.uhid} (Monotonic sequence preserved!)`);

  const pNext2 = await registerPatient({ name: 'Dexie Second Patient', age: 33, gender: 'M', mobile: '9555555555' }, 'admin');
  assert.strictEqual(pNext2.uhid, 'HC-1005', `Expected HC-1005, got ${pNext2.uhid}`);
  console.log(`  ✓ Subsequent patient received: ${pNext2.uhid}`);

  console.log('\n======================================================');
  console.log('ALL LOCAL DEXIE & UHID TESTS PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

testDexie().catch((err) => {
  console.error('Dexie test failed:', err);
  process.exit(1);
});
