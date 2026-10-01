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

console.log('Testing Dexie / IndexedDB ConstraintError scenarios...\n');

// SCENARIO 1: table.add() with existing primary key
console.log('--- SCENARIO 1: table.add with existing primary key ---');
const db1 = new Dexie('test_db1');
db1.version(1).stores({
  medicines: 'id, &medicine_code, name',
});
await db1.open();

await db1.medicines.add({ id: 'm1', medicine_code: 'MD-0001', name: 'Aspirin' });
console.log('  Added m1');

try {
  await db1.medicines.add({ id: 'm1', medicine_code: 'MD-0002', name: 'Aspirin Duplicate ID' });
  console.log('  UNEXPECTED: add() succeeded with duplicate ID!');
} catch (e) {
  console.log('  CAUGHT ERROR on duplicate ID add():', e.name, '-', e.message);
}

// SCENARIO 2: table.add() or table.put() with duplicate UNIQUE INDEX (&medicine_code)
console.log('\n--- SCENARIO 2: table.put with duplicate unique index ---');
try {
  await db1.medicines.put({ id: 'm2', medicine_code: 'MD-0001', name: 'Paracetamol with same code' });
  console.log('  UNEXPECTED: put() succeeded with duplicate unique index!');
} catch (e) {
  console.log('  CAUGHT ERROR on duplicate unique index put():', e.name, '-', e.message);
}

// SCENARIO 3: bulkPut with duplicate unique index in same batch or existing batch
console.log('\n--- SCENARIO 3: bulkPut with duplicate unique index ---');
try {
  await db1.medicines.bulkPut([
    { id: 'm3', medicine_code: 'MD-0003', name: 'Med 3' },
    { id: 'm4', medicine_code: 'MD-0003', name: 'Med 4 with same code' },
  ]);
  console.log('  UNEXPECTED: bulkPut() succeeded with duplicate unique index!');
} catch (e) {
  console.log('  CAUGHT ERROR on duplicate unique index bulkPut():', e.name, '-', e.message);
}

// SCENARIO 4: What happens if unique index & is removed (just indexed 'medicine_code')?
console.log('\n--- SCENARIO 4: Non-unique index behavior ---');
const db2 = new Dexie('test_db2');
db2.version(1).stores({
  medicines: 'id, medicine_code, name',
});
await db2.open();

await db2.medicines.put({ id: 'm1', medicine_code: 'MD-0001', name: 'Aspirin' });
await db2.medicines.put({ id: 'm2', medicine_code: 'MD-0001', name: 'Paracetamol' });
console.log('  ✓ SUCCESS: Non-unique index allows putting multiple records with same code without ConstraintError!');
const found = await db2.medicines.where('medicine_code').equals('MD-0001').toArray();
console.log(`  ✓ Found ${found.length} records querying by medicine_code index.`);

// SCENARIO 5: Upgrade migration from v1 to v2 removing unique index &
console.log('\n--- SCENARIO 5: Upgrading schema to remove unique index & on existing db ---');
await db1.close();
const db1Upgraded = new Dexie('test_db1');
db1Upgraded.version(1).stores({
  medicines: 'id, &medicine_code, name',
});
db1Upgraded.version(2).stores({
  medicines: 'id, medicine_code, name', // remove &
});
await db1Upgraded.open();
console.log('  ✓ Upgraded db1 to v2');
// Now put duplicate code on upgraded db
await db1Upgraded.medicines.put({ id: 'm2', medicine_code: 'MD-0001', name: 'Now this works!' });
console.log('  ✓ SUCCESS: After removing &, putting record with same code succeeds without error!');

// SCENARIO 6: What happens when an upgrade attempts to add a UNIQUE index & to a table with duplicates?
console.log('\n--- SCENARIO 6: Upgrading to a UNIQUE index & on table with duplicate or null keys ---');
const db3 = new Dexie('test_db3');
db3.version(1).stores({
  patients: 'id, name, uhid',
});
await db3.open();
await db3.patients.put({ id: 'p1', name: 'Patient 1', uhid: 'HC-001' });
await db3.patients.put({ id: 'p2', name: 'Patient 2', uhid: 'HC-001' }); // duplicate
await db3.close();

const db3Upgraded = new Dexie('test_db3');
db3Upgraded.version(1).stores({
  patients: 'id, name, uhid',
});
db3Upgraded.version(2).stores({
  patients: 'id, name, &uhid', // trying to add unique index to existing duplicates
});
try {
  await db3Upgraded.open();
  console.log('  UNEXPECTED: Upgrade succeeded with duplicate unique index!');
} catch (e) {
  console.log('  CAUGHT UPGRADE ERROR:', e.name, '-', e.message);
}

console.log('\nRepro script finished successfully.');

