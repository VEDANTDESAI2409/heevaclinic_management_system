// ─── HEEVA CLINIC — UHID sequence, reuse prevention & zero-patient reset test ─
import 'fake-indexeddb/auto';
import assert from 'node:assert';

const { default: db } = await import('../src/db.js');
const core = await import('../src/services/core.js');
const patients = await import('../src/services/patients.js');
const { d1Client } = await import('../worker/db/d1Client.js');

let passed = 0;
let failed = 0;

function ok(name) {
  console.log(`  ✓ PASS: ${name}`);
  passed++;
}

function fail(name, err) {
  console.error(`  ✗ FAIL: ${name} ->`, err?.message || err);
  failed++;
}

console.log('================================================================');
console.log('TEST SUITE: UHID GENERATION — FIX SEQUENCE & PREVENT REUSE');
console.log('================================================================\n');

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: Service Layer & Client Dexie Store (Offline/Local Verification)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 1: Dexie & Service Layer Invariants ---');

try {
  // Setup: clear all patients and counters for a clean slate
  await db.patients.clear();
  await db.counters.clear();

  // TEST 1: Database contains zero patients -> Create patient -> Expected: HC-2026-000001
  const p1 = await patients.registerPatient(
    { name: 'Patient One', age: 30, gender: 'M', mobile: '9111111111' },
    'admin'
  );
  assert.strictEqual(p1.uhid, 'HC-2026-000001', `Expected HC-2026-000001, got ${p1.uhid}`);
  ok('TEST 1: Zero patients in DB -> First patient receives HC-2026-000001');

  // TEST 2: Create three patients -> Expected 000001, 000002, 000003
  // (p1 was 000001, now create p2 and p3)
  const p2 = await patients.registerPatient(
    { name: 'Patient Two', age: 25, gender: 'F', mobile: '9222222222' },
    'admin'
  );
  const p3 = await patients.registerPatient(
    { name: 'Patient Three', age: 40, gender: 'M', mobile: '9333333333' },
    'admin'
  );
  assert.strictEqual(p2.uhid, 'HC-2026-000002', `Expected HC-2026-000002, got ${p2.uhid}`);
  assert.strictEqual(p3.uhid, 'HC-2026-000003', `Expected HC-2026-000003, got ${p3.uhid}`);
  ok('TEST 2: Three patients created sequentially: 000001, 000002, 000003');

  // TEST 3: Delete patient 002 -> Create another patient -> Expected: HC-2026-000004 (NEVER reuse 002)
  await patients.deletePatient(p2.id, 'admin');
  const remainingAfterDelete2 = await db.patients.toArray();
  assert.strictEqual(remainingAfterDelete2.length, 2, 'Two patients should remain (001 and 003)');
  assert(!remainingAfterDelete2.some((p) => p.uhid === 'HC-2026-000002'), '002 must be deleted');

  const p4 = await patients.registerPatient(
    { name: 'Patient Four', age: 35, gender: 'F', mobile: '9444444444' },
    'admin'
  );
  assert.strictEqual(p4.uhid, 'HC-2026-000004', `Expected HC-2026-000004, got ${p4.uhid}`);
  ok('TEST 3: Deleted patient 002; next patient receives HC-2026-000004 (no reuse of 002)');

  // TEST 4: Delete patient 001 and 003 -> Create another patient -> Expected: HC-2026-000005
  // (Patient 004 is still in the database!)
  await patients.deletePatient(p1.id, 'admin');
  await patients.deletePatient(p3.id, 'admin');
  const remainingAfterDelete1and3 = await db.patients.toArray();
  assert.strictEqual(remainingAfterDelete1and3.length, 1, 'Patient 004 must still exist in DB');
  assert.strictEqual(remainingAfterDelete1and3[0].uhid, 'HC-2026-000004');

  const p5 = await patients.registerPatient(
    { name: 'Patient Five', age: 50, gender: 'M', mobile: '9555555555' },
    'admin'
  );
  assert.strictEqual(p5.uhid, 'HC-2026-000005', `Expected HC-2026-000005, got ${p5.uhid}`);
  ok('TEST 4: Deleted patients 001 and 003 (004 remains); next patient receives HC-2026-000005');

  // TEST 5: Delete ALL remaining patients (now database contains zero patients) -> Create new patient -> Expected: HC-2026-000001
  await patients.deletePatient(p4.id, 'admin');
  await patients.deletePatient(p5.id, 'admin');
  const remainingZero = await db.patients.count();
  assert.strictEqual(remainingZero, 0, 'Database must now contain zero patients');

  const pNew = await patients.registerPatient(
    { name: 'Patient Fresh Start', age: 22, gender: 'F', mobile: '9666666666' },
    'admin'
  );
  assert.strictEqual(pNew.uhid, 'HC-2026-000001', `Expected HC-2026-000001 after full clear, got ${pNew.uhid}`);
  ok('TEST 5: All patients deleted (zero remaining) -> Next patient restarts from HC-2026-000001');

} catch (err) {
  fail('Part 1 failure', err);
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: D1 Database Engine Mock Verification (Worker Atomic Batch & Sequence)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n--- PART 2: Cloudflare D1 Backend Engine Verification ---');

{
  const tables = {
    clinic_settings: [
      {
        id: '1',
        clinic_name: 'HEEVA CLINIC',
        uhid_prefix: 'HC',
        uhid_include_year: 1,
        uhid_padding: 6,
        uhid_start: 1,
      },
    ],
    counters: [],
    patients: [],
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
          if (/SELECT COUNT\(\*\) as count FROM patients/i.test(trimmed)) {
            return { count: tables.patients.length };
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
        async run() {
          if (/DELETE FROM "?patients"? WHERE id = \?/i.test(trimmed)) {
            const id = bound[0];
            tables.patients = tables.patients.filter((p) => p.id !== id);
            return { success: true };
          }
          if (/UPDATE counters SET value = 0/i.test(trimmed)) {
            tables.counters.forEach((c) => {
              if (String(c.key).startsWith('UHID|')) c.value = 0;
            });
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
        }
      }
      return { success: true };
    },
  };

  // TEST 1 (D1): DB has 0 patients -> allocatePatient -> Expected HC-2026-000001
  const prev1 = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(prev1.nextUhid, 'HC-2026-000001', 'Preview for 0 patients must be HC-2026-000001');
  const d1p1 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 1', age: 30, gender: 'M', mobile: '9111111111' });
  assert.strictEqual(d1p1.uhid, 'HC-2026-000001');
  ok('D1 TEST 1: Zero patients in D1 -> preview and allocated UHID are HC-2026-000001');

  // TEST 2 (D1): Create 2 more patients -> 000002, 000003
  const d1p2 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 2', age: 25, gender: 'F', mobile: '9222222222' });
  const d1p3 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 3', age: 40, gender: 'M', mobile: '9333333333' });
  assert.strictEqual(d1p2.uhid, 'HC-2026-000002');
  assert.strictEqual(d1p3.uhid, 'HC-2026-000003');
  ok('D1 TEST 2: Sequential allocation produces HC-2026-000002 and HC-2026-000003');

  // TEST 3 (D1): Delete 002 -> create another patient -> Expected HC-2026-000004
  await d1Client.remove(mockD1, 'patients', d1p2.id);
  assert.strictEqual(tables.patients.length, 2, '2 patients remain in D1');
  const prevAfterDelete2 = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterDelete2.nextUhid, 'HC-2026-000004', 'Preview must be HC-2026-000004');
  const d1p4 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 4', age: 35, gender: 'F', mobile: '9444444444' });
  assert.strictEqual(d1p4.uhid, 'HC-2026-000004', `Expected HC-2026-000004, got ${d1p4.uhid}`);
  ok('D1 TEST 3: Deleting 002 does NOT reset or reuse counter; next patient is HC-2026-000004');

  // TEST 4 (D1): Delete 001 and 003 -> create another patient -> Expected HC-2026-000005
  await d1Client.remove(mockD1, 'patients', d1p1.id);
  await d1Client.remove(mockD1, 'patients', d1p3.id);
  assert.strictEqual(tables.patients.length, 1, 'Patient 004 remains in D1');
  const d1p5 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 5', age: 50, gender: 'M', mobile: '9555555555' });
  assert.strictEqual(d1p5.uhid, 'HC-2026-000005', `Expected HC-2026-000005, got ${d1p5.uhid}`);
  ok('D1 TEST 4: Deleting 001 and 003 leaves 004 in DB; next patient is HC-2026-000005');

  // TEST 5 (D1): Delete ALL remaining patients -> create new patient -> Expected HC-2026-000001
  await d1Client.remove(mockD1, 'patients', d1p4.id);
  await d1Client.remove(mockD1, 'patients', d1p5.id);
  assert.strictEqual(tables.patients.length, 0, 'D1 now has genuinely 0 patients');
  const prevAfterZero = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterZero.nextUhid, 'HC-2026-000001', 'Preview after zero patients must be HC-2026-000001');
  const d1Fresh = await d1Client.allocatePatient(mockD1, { name: 'D1 Fresh', age: 28, gender: 'F', mobile: '9777777777' });
  assert.strictEqual(d1Fresh.uhid, 'HC-2026-000001', `Expected HC-2026-000001, got ${d1Fresh.uhid}`);
  ok('D1 TEST 5: All patients deleted in D1 -> sequence restarts cleanly from HC-2026-000001');

  // TEST 6 (D1): Multi-laptop safety (two laptops allocate sequentially without collision)
  const laptop1Patient = await d1Client.allocatePatient(mockD1, { name: 'Laptop 1 Patient', age: 45, gender: 'M', mobile: '9888888881' });
  const laptop2Patient = await d1Client.allocatePatient(mockD1, { name: 'Laptop 2 Patient', age: 32, gender: 'F', mobile: '9888888882' });
  assert.strictEqual(laptop1Patient.uhid, 'HC-2026-000002');
  assert.strictEqual(laptop2Patient.uhid, 'HC-2026-000003');
  assert.notStrictEqual(laptop1Patient.uhid, laptop2Patient.uhid, 'Multi-laptop UHIDs must be strictly distinct');
  ok('D1 TEST 6: Multi-laptop simulation: Laptop 1 (000002) & Laptop 2 (000003) receive unique sequential UHIDs');

  // TEST 7 (D1): Refresh / persistence: counter state persists and advances correctly
  const previewAfterReload = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(previewAfterReload.nextUhid, 'HC-2026-000004');
  const nextReloadPatient = await d1Client.allocatePatient(mockD1, { name: 'Post-Reload Patient', age: 29, gender: 'M', mobile: '9888888883' });
  assert.strictEqual(nextReloadPatient.uhid, 'HC-2026-000004');
  ok('D1 TEST 7: State persistence: preview and subsequent patient continue sequence to HC-2026-000004');
}

console.log('\n================================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed.`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
