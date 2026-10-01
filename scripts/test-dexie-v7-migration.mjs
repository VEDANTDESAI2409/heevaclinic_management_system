import assert from 'node:assert';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;

await import('fake-indexeddb/auto');
const Dexie = (await import('dexie')).default;

console.log('Testing Dexie v1-v6 to v7 migration...\n');

// 1. Create a simulated existing user DB with version 6 and older schema with &unique indexes
const dbOld = new Dexie('heeva_migration_test');
dbOld.version(1).stores({
  settings: 'key',
  counters: 'key',
  roles: 'id, &key',
  users: 'id, &username, role',
  doctors: 'id, name',
  patients: 'id, &uhid, name, mobile, created_at, [name+dob]',
  consultations: 'id, &consultation_no, patient_id, doctor_id, date',
  prescriptions: 'id, &prescription_no, patient_id, consultation_id, doctor_id, date',
  appointments: 'id, &appointment_no, patient_id, doctor_id, date, status',
  medicines: 'id, &medicine_code, name, generic, category, active',
  services: 'id, &service_code, name, type, active',
  bills: 'id, &bill_no, patient_id, date, status, payment_status, uhid',
  returns: 'id, &return_no, bill_id, at',
  expenses: 'id, &expense_no, category, date',
});
dbOld.version(2).stores({
  bills: 'id, &bill_no, patient_id, date, time, status, payment_status, uhid',
});
dbOld.version(5).stores({
  patients: 'id, &uhid, name, mobile, created_at, [name+age]',
  medicines: 'id, &medicine_code, name, generic, category, active',
});
dbOld.version(6).stores({
  appointments: 'id, &appointment_no, patient_id, doctor_id, date, status',
  prescriptions: 'id, &prescription_no, patient_id, consultation_id, doctor_id, date',
});

await dbOld.open();
console.log('1. Existing DB opened at v6');

// Populate records into existing database
await dbOld.patients.put({ id: 'p1', uhid: 'HC-2026-000001', name: 'John Doe', age: 30 });
await dbOld.medicines.put({ id: 'm1', medicine_code: 'MD-0001', name: 'Paracetamol' });
await dbOld.services.put({ id: 's1', service_code: 'SRV-0001', name: 'General Consultation' });
await dbOld.bills.put({ id: 'b1', bill_no: 'HC-BILL-2026-000001', uhid: 'HC-2026-000001' });

console.log('2. Records populated in v6 database:');
console.log('   Patients:', await dbOld.patients.count());
console.log('   Medicines:', await dbOld.medicines.count());

// Close old connection
await dbOld.close();

// Now simulate the new application opening with version 7
const dbNew = new Dexie('heeva_migration_test');
dbNew.version(1).stores({
  settings: 'key',
  counters: 'key',
  roles: 'id, &key',
  users: 'id, &username, role',
  doctors: 'id, name',
  patients: 'id, &uhid, name, mobile, created_at, [name+dob]',
  consultations: 'id, &consultation_no, patient_id, doctor_id, date',
  prescriptions: 'id, &prescription_no, patient_id, consultation_id, doctor_id, date',
  appointments: 'id, &appointment_no, patient_id, doctor_id, date, status',
  medicines: 'id, &medicine_code, name, generic, category, active',
  services: 'id, &service_code, name, type, active',
  bills: 'id, &bill_no, patient_id, date, status, payment_status, uhid',
  returns: 'id, &return_no, bill_id, at',
  expenses: 'id, &expense_no, category, date',
});
dbNew.version(2).stores({
  bills: 'id, &bill_no, patient_id, date, time, status, payment_status, uhid',
});
dbNew.version(5).stores({
  patients: 'id, &uhid, name, mobile, created_at, [name+age]',
  medicines: 'id, &medicine_code, name, generic, category, active',
});
dbNew.version(6).stores({
  appointments: 'id, &appointment_no, patient_id, doctor_id, date, status',
  prescriptions: 'id, &prescription_no, patient_id, consultation_id, doctor_id, date',
});

// v7: Convert restrictive cache unique indexes to non-unique indexes
dbNew.version(7).stores({
  patients: 'id, uhid, name, mobile, created_at, [name+age]',
  medicines: 'id, medicine_code, name, generic, category, active',
  services: 'id, service_code, name, type, active',
  consultations: 'id, consultation_no, patient_id, doctor_id, date',
  prescriptions: 'id, prescription_no, patient_id, consultation_id, doctor_id, date',
  appointments: 'id, appointment_no, patient_id, doctor_id, date, status',
  bills: 'id, bill_no, patient_id, date, time, status, payment_status, uhid',
  returns: 'id, return_no, bill_id, at',
  expenses: 'id, expense_no, category, date',
  suppliers: 'id, supplier_code, name, phone, email, active',
  purchases: 'id, purchase_no, supplier_id, date, status',
  roles: 'id, key',
  users: 'id, username, role',
});

await dbNew.open();
console.log('3. Upgraded seamlessly to v7!');

// Verify existing data is completely intact!
const pCount = await dbNew.patients.count();
const mCount = await dbNew.medicines.count();
assert.strictEqual(pCount, 1, 'Patient count should be 1');
assert.strictEqual(mCount, 1, 'Medicine count should be 1');
console.log('   ✓ Zero data lost: all existing records preserved intact.');

// Verify adding/putting records with duplicate or identical codes now succeeds without ConstraintError
console.log('4. Testing adding medicine with duplicate medicine_code (MD-0001)...');
await dbNew.medicines.put({ id: 'm2', medicine_code: 'MD-0001', name: 'Paracetamol 500mg' });
console.log('   ✓ Successfully saved without ConstraintError!');

console.log('5. Testing bulkPut with duplicate codes...');
await dbNew.medicines.bulkPut([
  { id: 'm3', medicine_code: 'MD-DUP', name: 'Duplicate 1' },
  { id: 'm4', medicine_code: 'MD-DUP', name: 'Duplicate 2' },
]);
console.log('   ✓ BulkPut completed without ConstraintError!');

// Verify fast index queries still work perfectly
const queryRes = await dbNew.medicines.where('medicine_code').equals('MD-0001').toArray();
assert.strictEqual(queryRes.length, 2, 'Should find 2 medicines with MD-0001');
console.log('   ✓ Index query returned matching records correctly!');

console.log('\n✓ ALL MIGRATION AND CONSTRAINT TESTS PASSED!');
