import assert from 'node:assert';
import 'fake-indexeddb/auto';

const { default: db } = await import('../src/db.js');

console.log('================================================================');
console.log('TEST SUITE: PATIENTS LIST NUMERICAL ASCENDING UHID SORTING');
console.log('================================================================\n');

// Replicate parseUhidNumber as implemented in Patients.jsx
const parseUhidNumber = (uhid) => {
  const m = String(uhid || '').match(/(\d+)/g);
  return m ? parseInt(m[m.length - 1], 10) : Number.MAX_SAFE_INTEGER;
};

// 1. Test numeric parser
console.log('--- TEST 1: parseUhidNumber unit testing ---');
assert.strictEqual(parseUhidNumber('HC-1001'), 1001);
assert.strictEqual(parseUhidNumber('HC-1002'), 1002);
assert.strictEqual(parseUhidNumber('HC-1010'), 1010);
assert.strictEqual(parseUhidNumber('HC-10010'), 10010);
assert.strictEqual(parseUhidNumber('HC-2026-000046'), 46);
assert.strictEqual(parseUhidNumber(null), Number.MAX_SAFE_INTEGER);
console.log('  ✓ parseUhidNumber correctly extracts numeric portion.');

// 2. Test sorting mixed unsorted UHIDs
console.log('\n--- TEST 2: Numerical ascending sorting vs Alphabetical ---');
const rawUhids = [
  'HC-1007',
  'HC-10010',
  'HC-1001',
  'HC-1011',
  'HC-1004',
  'HC-1002',
  'HC-1006',
  'HC-1003',
  'HC-1010',
];

const sorted = [...rawUhids].sort((a, b) => {
  const numA = parseUhidNumber(a);
  const numB = parseUhidNumber(b);
  if (numA !== numB) return numA - numB;
  return String(a).localeCompare(String(b));
});

const expectedOrder = [
  'HC-1001',
  'HC-1002',
  'HC-1003',
  'HC-1004',
  'HC-1006',
  'HC-1007',
  'HC-1010',
  'HC-1011',
  'HC-10010',
];

console.log('  Actual sorted result:  ', sorted);
console.log('  Expected sorted result:', expectedOrder);
assert.deepStrictEqual(sorted, expectedOrder, 'UHIDs must be in exact ascending numerical order');
assert(sorted.indexOf('HC-1002') < sorted.indexOf('HC-10010'), 'HC-1002 must appear BEFORE HC-10010');
console.log('  ✓ Confirmed: HC-1002 appears before HC-10010 (not alphabetical order).');

// 3. Test with Dexie database integration
console.log('\n--- TEST 3: Database & LiveQuery rendering logic simulation ---');
await db.patients.clear();

const testPatients = [
  { id: 'p-7', uhid: 'HC-1007', name: 'Patient Seven', gender: 'F', created_at: '2026-10-01T12:00:00Z' },
  { id: 'p-1', uhid: 'HC-1001', name: 'Patient One', gender: 'M', created_at: '2026-10-01T15:00:00Z' }, // More recent created_at
  { id: 'p-4', uhid: 'HC-1004', name: 'Patient Four', gender: 'F', created_at: '2026-10-01T10:00:00Z' },
  { id: 'p-2', uhid: 'HC-1002', name: 'Patient Two', gender: 'M', created_at: '2026-10-01T14:00:00Z' },
  { id: 'p-3', uhid: 'HC-1003', name: 'Patient Three', gender: 'M', created_at: '2026-10-01T09:00:00Z' },
  { id: 'p-10', uhid: 'HC-1010', name: 'Patient Ten', gender: 'M', created_at: '2026-10-01T08:00:00Z' },
  { id: 'p-10010', uhid: 'HC-10010', name: 'Patient Ten Thousand', gender: 'F', created_at: '2026-10-01T07:00:00Z' },
];

await db.patients.bulkPut(testPatients);

// Verify DB records were NOT modified
const dbCheck = await db.patients.toArray();
assert.strictEqual(dbCheck.length, 7);
console.log('  ✓ 7 patients inserted into database.');

// Simulate Patients.jsx useLiveQuery logic
function queryPatients(q = '', gender = '') {
  let list = dbCheck.map((p) => ({ ...p }));
  const s = q.trim().toLowerCase();
  if (s) {
    list = list.filter((p) =>
      (p.name || '').toLowerCase().includes(s) ||
      (p.uhid || '').toLowerCase().includes(s)
    );
  }
  if (gender) list = list.filter((p) => p.gender === gender);
  return list.sort((a, b) => {
    const numA = parseUhidNumber(a.uhid);
    const numB = parseUhidNumber(b.uhid);
    if (numA !== numB) return numA - numB;
    return String(a.uhid || '').localeCompare(String(b.uhid || ''));
  });
}

// Initial display order
const initialRender = queryPatients();
const initialUhids = initialRender.map((p) => p.uhid);
console.log('\n  Initial rendered UHID order:', initialUhids);
assert.deepStrictEqual(
  initialUhids,
  ['HC-1001', 'HC-1002', 'HC-1003', 'HC-1004', 'HC-1007', 'HC-1010', 'HC-10010'],
  'Initial render must be in ascending numerical UHID sequence'
);
console.log('  ✓ Initial render is strictly in ascending numerical UHID sequence.');

// Verify it did NOT sort by created_at
assert.notStrictEqual(initialUhids[0], 'HC-10010'); // earliest created_at
assert.notStrictEqual(initialUhids[0], 'HC-1007'); // random order
assert.strictEqual(initialUhids[0], 'HC-1001');

// After adding a new patient (e.g. HC-1005 with most recent created_at)
console.log('\n--- TEST 4: Adding a new patient (HC-1005) ---');
const newPatient = { id: 'p-5', uhid: 'HC-1005', name: 'Patient Five', gender: 'F', created_at: '2026-10-01T16:00:00Z' };
await db.patients.put(newPatient);
const dbCheckAfterAdd = await db.patients.toArray();
const renderAfterAdd = dbCheckAfterAdd.sort((a, b) => {
  const numA = parseUhidNumber(a.uhid);
  const numB = parseUhidNumber(b.uhid);
  if (numA !== numB) return numA - numB;
  return String(a.uhid || '').localeCompare(String(b.uhid || ''));
});
const uhidsAfterAdd = renderAfterAdd.map((p) => p.uhid);
console.log('  Rendered UHIDs after adding HC-1005:', uhidsAfterAdd);
assert.deepStrictEqual(
  uhidsAfterAdd,
  ['HC-1001', 'HC-1002', 'HC-1003', 'HC-1004', 'HC-1005', 'HC-1007', 'HC-1010', 'HC-10010']
);
console.log('  ✓ Newly added HC-1005 appears in exact numerical slot between HC-1004 and HC-1007.');

// After deleting a patient (e.g. delete HC-1002)
console.log('\n--- TEST 5: Deleting a patient (HC-1002) ---');
await db.patients.delete('p-2');
const dbCheckAfterDel = await db.patients.toArray();
const renderAfterDel = dbCheckAfterDel.sort((a, b) => {
  const numA = parseUhidNumber(a.uhid);
  const numB = parseUhidNumber(b.uhid);
  if (numA !== numB) return numA - numB;
  return String(a.uhid || '').localeCompare(String(b.uhid || ''));
});
const uhidsAfterDel = renderAfterDel.map((p) => p.uhid);
console.log('  Rendered UHIDs after deleting HC-1002:', uhidsAfterDel);
assert.deepStrictEqual(
  uhidsAfterDel,
  ['HC-1001', 'HC-1003', 'HC-1004', 'HC-1005', 'HC-1007', 'HC-1010', 'HC-10010']
);
console.log('  ✓ Deleting HC-1002 preserves numerical ascending order.');

// After search filter
console.log('\n--- TEST 6: Searching / filtering patients ---');
const searchResults = dbCheckAfterDel
  .filter((p) => p.uhid.includes('10'))
  .sort((a, b) => {
    const numA = parseUhidNumber(a.uhid);
    const numB = parseUhidNumber(b.uhid);
    if (numA !== numB) return numA - numB;
    return String(a.uhid || '').localeCompare(String(b.uhid || ''));
  });
const searchUhids = searchResults.map((p) => p.uhid);
console.log('  Search results for "10":', searchUhids);
assert.deepStrictEqual(searchUhids, ['HC-1001', 'HC-1003', 'HC-1004', 'HC-1005', 'HC-1007', 'HC-1010', 'HC-10010']);
console.log('  ✓ Filtered search results remain in numerical ascending order.');

// After gender filter
console.log('\n--- TEST 7: Gender filter (F) ---');
const femaleResults = dbCheckAfterDel
  .filter((p) => p.gender === 'F')
  .sort((a, b) => {
    const numA = parseUhidNumber(a.uhid);
    const numB = parseUhidNumber(b.uhid);
    if (numA !== numB) return numA - numB;
    return String(a.uhid || '').localeCompare(String(b.uhid || ''));
  });
const femaleUhids = femaleResults.map((p) => p.uhid);
console.log('  Female patient UHIDs:', femaleUhids);
assert.deepStrictEqual(femaleUhids, ['HC-1004', 'HC-1005', 'HC-1007', 'HC-10010']);
console.log('  ✓ Gender filter results remain in numerical ascending order.');

console.log('\n================================================================');
console.log('ALL PATIENTS SORTING TESTS PASSED (7 / 7)!');
console.log('================================================================\n');
