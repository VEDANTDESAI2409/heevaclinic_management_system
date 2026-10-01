// ─── HEEVA CLINIC — UHID sequence, reuse prevention & zero-patient reset test ─
import 'fake-indexeddb/auto';
import assert from 'node:assert';

const { default: db } = await import('../src/db.js');
const core = await import('../src/services/core.js');
const patients = await import('../src/services/patients.js');
const { d1Client } = await import('../worker/db/d1Client.js');
const { handleClearPatients } = await import('../worker/routes/genericCrud.js');

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

  // TEST 1: Database contains zero patients -> Create patient -> Expected: HC-1001
  const p1 = await patients.registerPatient(
    { name: 'Patient One', age: 30, gender: 'M', mobile: '9111111111' },
    'admin'
  );
  assert.strictEqual(p1.uhid, 'HC-1001', `Expected HC-1001, got ${p1.uhid}`);
  ok('TEST 1: Zero patients in DB -> First patient receives HC-1001');

  // TEST 2: Create three patients -> Expected HC-1001, HC-1002, HC-1003
  const p2 = await patients.registerPatient(
    { name: 'Patient Two', age: 25, gender: 'F', mobile: '9222222222' },
    'admin'
  );
  const p3 = await patients.registerPatient(
    { name: 'Patient Three', age: 40, gender: 'M', mobile: '9333333333' },
    'admin'
  );
  assert.strictEqual(p2.uhid, 'HC-1002', `Expected HC-1002, got ${p2.uhid}`);
  assert.strictEqual(p3.uhid, 'HC-1003', `Expected HC-1003, got ${p3.uhid}`);
  ok('TEST 2: Three patients created sequentially: HC-1001, HC-1002, HC-1003');

  // TEST 3: Delete patient 1002 -> Create another patient -> Expected: HC-1004 (NEVER reuse 1002)
  await patients.deletePatient(p2.id, 'admin');
  const remainingAfterDelete2 = await db.patients.toArray();
  assert.strictEqual(remainingAfterDelete2.length, 2, 'Two patients should remain (1001 and 1003)');
  assert(!remainingAfterDelete2.some((p) => p.uhid === 'HC-1002'), '1002 must be deleted');

  const p4 = await patients.registerPatient(
    { name: 'Patient Four', age: 35, gender: 'F', mobile: '9444444444' },
    'admin'
  );
  assert.strictEqual(p4.uhid, 'HC-1004', `Expected HC-1004, got ${p4.uhid}`);
  ok('TEST 3: Deleted patient 1002; next patient receives HC-1004 (no reuse of 1002)');

  // TEST 4: Delete patient 1001 and 1003 -> Create another patient -> Expected: HC-1005
  // (Patient 1004 is still in the database!)
  await patients.deletePatient(p1.id, 'admin');
  await patients.deletePatient(p3.id, 'admin');
  const remainingAfterDelete1and3 = await db.patients.toArray();
  assert.strictEqual(remainingAfterDelete1and3.length, 1, 'Patient 1004 must still exist in DB');
  assert.strictEqual(remainingAfterDelete1and3[0].uhid, 'HC-1004');

  const p5 = await patients.registerPatient(
    { name: 'Patient Five', age: 50, gender: 'M', mobile: '9555555555' },
    'admin'
  );
  assert.strictEqual(p5.uhid, 'HC-1005', `Expected HC-1005, got ${p5.uhid}`);
  ok('TEST 4: Deleted patients 1001 and 1003 (1004 remains); next patient receives HC-1005');

  // TEST 5: Individual deletion of remaining patients (zero remain) -> Monotonic sequence preserved, NOT reset
  await patients.deletePatient(p4.id, 'admin');
  await patients.deletePatient(p5.id, 'admin');
  const remainingZero = await db.patients.count();
  assert.strictEqual(remainingZero, 0, 'Database must now contain zero patients');

  const pNew = await patients.registerPatient(
    { name: 'Patient After Individual Deletions', age: 22, gender: 'F', mobile: '9666666666' },
    'admin'
  );
  assert.strictEqual(pNew.uhid, 'HC-1006', `Expected HC-1006 after individual deletions, got ${pNew.uhid}`);
  ok('TEST 5: Individual deletes resulting in zero patients -> Sequence NOT reset, next receives HC-1006');

  // TEST 6: "Delete All Patients" operation -> UHID sequence RESETS to HC-1001
  await patients.clearAllPatients('admin');
  const afterClearCount = await db.patients.count();
  assert.strictEqual(afterClearCount, 0, 'Patients must be 0 after Delete All Patients');
  const pReset1 = await patients.registerPatient(
    { name: 'Patient After Delete All', age: 29, gender: 'M', mobile: '9777777777' },
    'admin'
  );
  assert.strictEqual(pReset1.uhid, 'HC-1001', `Expected HC-1001 after Delete All Patients reset, got ${pReset1.uhid}`);
  const pReset2 = await patients.registerPatient(
    { name: 'Second Patient After Delete All', age: 31, gender: 'F', mobile: '9888888888' },
    'admin'
  );
  assert.strictEqual(pReset2.uhid, 'HC-1002', `Expected HC-1002 after Delete All Patients reset, got ${pReset2.uhid}`);
  ok('TEST 6: "Delete All Patients" explicitly resets sequence -> Next patients receive HC-1001, then HC-1002');

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
        uhid_include_year: 0,
        uhid_padding: 4,
        uhid_start: 1001,
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
            return tables.counters.find((c) => bound.includes(c.key) || bound.includes(c.id)) || null;
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
      stmt.all = async () => {
        if (/SELECT uhid FROM patients/i.test(trimmed)) {
          return { results: tables.patients.map((p) => ({ uhid: p.uhid })) };
        }
        return { results: [] };
      };
      return stmt;
    },
    async batch(stmts) {
      for (const stmt of stmts) {
        const sql = stmt.sql;
        const bound = stmt.bound || [];
        if (/INSERT INTO counters/i.test(sql)) {
          let id, key, val, created_at, updated_at;
          const matchLiteral = sql.match(/VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(?:(\d+)|\?)\s*,\s*(?:\?|'[^']*')\s*,\s*(?:\?|'[^']*')\s*\)/i);
          if (matchLiteral) {
            id = matchLiteral[1];
            key = matchLiteral[2];
            val = matchLiteral[3] !== undefined ? Number(matchLiteral[3]) : bound[0];
            created_at = bound[1] || new Date().toISOString();
            updated_at = bound[2] || created_at;
          } else {
            [id, key, val, created_at, updated_at] = bound;
          }
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
          // cleared vitals
        } else if (/DELETE FROM patients/i.test(sql)) {
          tables.patients = [];
        }
      }
      return { success: true };
    },
  };

  // TEST 1 (D1): DB has 0 patients -> allocatePatient -> Expected HC-1001
  const prev1 = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(prev1.nextUhid, 'HC-1001', 'Preview for 0 patients must be HC-1001');
  const d1p1 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 1', age: 30, gender: 'M', mobile: '9111111111' });
  assert.strictEqual(d1p1.uhid, 'HC-1001');
  ok('D1 TEST 1: Zero patients in D1 -> preview and allocated UHID are HC-1001');

  // TEST 2 (D1): Create 2 more patients -> HC-1002, HC-1003
  const d1p2 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 2', age: 25, gender: 'F', mobile: '9222222222' });
  const d1p3 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 3', age: 40, gender: 'M', mobile: '9333333333' });
  assert.strictEqual(d1p2.uhid, 'HC-1002');
  assert.strictEqual(d1p3.uhid, 'HC-1003');
  ok('D1 TEST 2: Sequential allocation produces HC-1002 and HC-1003');

  // TEST 3 (D1): Delete 1002 individually -> create another patient -> Expected HC-1004 (no reuse)
  await d1Client.remove(mockD1, 'patients', d1p2.id);
  assert.strictEqual(tables.patients.length, 2, '2 patients remain in D1');
  const prevAfterDelete2 = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterDelete2.nextUhid, 'HC-1004', 'Preview must be HC-1004');
  const d1p4 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 4', age: 35, gender: 'F', mobile: '9444444444' });
  assert.strictEqual(d1p4.uhid, 'HC-1004', `Expected HC-1004, got ${d1p4.uhid}`);
  ok('D1 TEST 3: Deleting 1002 individually does NOT reset or reuse counter; next patient is HC-1004');

  // TEST 4 (D1): Delete 1001 and 1003 individually -> create another patient -> Expected HC-1005
  await d1Client.remove(mockD1, 'patients', d1p1.id);
  await d1Client.remove(mockD1, 'patients', d1p3.id);
  assert.strictEqual(tables.patients.length, 1, 'Patient 1004 remains in D1');
  const d1p5 = await d1Client.allocatePatient(mockD1, { name: 'D1 Patient 5', age: 50, gender: 'M', mobile: '9555555555' });
  assert.strictEqual(d1p5.uhid, 'HC-1005', `Expected HC-1005, got ${d1p5.uhid}`);
  ok('D1 TEST 4: Deleting 1001 and 1003 leaves 1004 in DB; next patient is HC-1005');

  // TEST 5 (D1): Delete remaining patients individually -> next patient continues monotonically to HC-1006
  await d1Client.remove(mockD1, 'patients', d1p4.id);
  await d1Client.remove(mockD1, 'patients', d1p5.id);
  assert.strictEqual(tables.patients.length, 0, 'D1 now has genuinely 0 patients via individual deletes');
  const prevAfterZero = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterZero.nextUhid, 'HC-1006', 'Preview after individual deletions to 0 must be HC-1006 (counter preserved)');
  const d1Fresh = await d1Client.allocatePatient(mockD1, { name: 'D1 Fresh', age: 28, gender: 'F', mobile: '9777777777' });
  assert.strictEqual(d1Fresh.uhid, 'HC-1006', `Expected HC-1006, got ${d1Fresh.uhid}`);
  ok('D1 TEST 5: Individual deletes resulting in 0 patients preserves counter -> HC-1006 allocated');

  // TEST 6 (D1): "Delete All Patients" operation -> UHID sequence RESETS to HC-1001!
  const clearRes = await handleClearPatients({ confirmation: 'DELETE PATIENTS' }, { DB: mockD1 });
  assert.strictEqual(clearRes.status, 200);
  assert.strictEqual(tables.patients.length, 0, 'Patients table must be 0 after Delete All Patients');
  const prevAfterClear = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterClear.nextUhid, 'HC-1001', 'Preview after Delete All Patients must be HC-1001');

  const pAfterClear1 = await d1Client.allocatePatient(mockD1, { name: 'Patient After D1 Clear', age: 24, gender: 'M', mobile: '9888888880' });
  assert.strictEqual(pAfterClear1.uhid, 'HC-1001', `Expected HC-1001, got ${pAfterClear1.uhid}`);
  ok('D1 TEST 6: "Delete All Patients" resets UHID sequence -> next patient receives HC-1001');

  // TEST 7 (D1): Multi-laptop safety (two laptops allocate sequentially without collision after reset)
  const laptop1Patient = await d1Client.allocatePatient(mockD1, { name: 'Laptop 1 Patient', age: 45, gender: 'M', mobile: '9888888881' });
  const laptop2Patient = await d1Client.allocatePatient(mockD1, { name: 'Laptop 2 Patient', age: 32, gender: 'F', mobile: '9888888882' });
  assert.strictEqual(laptop1Patient.uhid, 'HC-1002');
  assert.strictEqual(laptop2Patient.uhid, 'HC-1003');
  assert.notStrictEqual(laptop1Patient.uhid, laptop2Patient.uhid, 'Multi-laptop UHIDs must be strictly distinct');
  ok('D1 TEST 7: Multi-laptop simulation: Laptop 1 (HC-1002) & Laptop 2 (HC-1003) receive unique sequential UHIDs');

  // TEST 8 (D1): Refresh / persistence: counter state persists and advances correctly
  const previewAfterReload = await d1Client.getNextUhidPreview(mockD1);
  assert.strictEqual(previewAfterReload.nextUhid, 'HC-1004');
  const nextReloadPatient = await d1Client.allocatePatient(mockD1, { name: 'Post-Reload Patient', age: 29, gender: 'M', mobile: '9888888889' });
  assert.strictEqual(nextReloadPatient.uhid, 'HC-1004');
  ok('D1 TEST 8: State persistence: preview and subsequent patient continue sequence to HC-1004');
}

console.log('\n================================================================');
console.log(`RESULTS: ${passed} passed, ${failed} failed.`);
console.log('================================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
