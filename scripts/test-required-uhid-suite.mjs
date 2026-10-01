import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { d1Client } from '../worker/db/d1Client.js';
import { handleClearPatients } from '../worker/routes/genericCrud.js';

console.log('================================================================');
console.log('REQUIRED TESTING SUITE: TESTS 1 THROUGH 7 (ACTUAL DATABASE EXECUTION)');
console.log('================================================================\n');

// Locate active miniflare D1 sqlite file
const d1Dir = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject';
const files = fs.readdirSync(d1Dir).filter((f) => f.endsWith('.sqlite'));
const activeDbFile = files.find((f) => f.startsWith('42d1a039')) || files[0];
const dbPath = path.join(d1Dir, activeDbFile);
console.log(`Using live D1 SQLite database: ${activeDbFile}\n`);

const sqlite = new DatabaseSync(dbPath);

// Wrap SQLite to provide Cloudflare D1-compatible interface
const d1Wrapper = {
  prepare(sql) {
    const trimmed = sql.trim();
    let bound = [];
    return {
      bind(...args) {
        bound = args;
        return this;
      },
      async first() {
        const stmt = sqlite.prepare(trimmed);
        const res = stmt.get(...bound);
        return res || null;
      },
      async all() {
        const stmt = sqlite.prepare(trimmed);
        const res = stmt.all(...bound);
        return { results: res || [] };
      },
      async run() {
        const stmt = sqlite.prepare(trimmed);
        const info = stmt.run(...bound);
        return { success: true, meta: { changes: info.changes } };
      },
    };
  },
  async batch(stmts) {
    sqlite.exec('BEGIN TRANSACTION');
    try {
      const results = [];
      for (const s of stmts) {
        const stmt = sqlite.prepare(s.sql);
        const info = stmt.run(...(s.bound || []));
        results.push({ success: true, meta: { changes: info.changes } });
      }
      sqlite.exec('COMMIT');
      return results;
    } catch (e) {
      sqlite.exec('ROLLBACK');
      throw e;
    }
  },
};

// Also attach sql and bound on prepare
const origPrepare = d1Wrapper.prepare;
d1Wrapper.prepare = function (sql) {
  const p = origPrepare.call(this, sql);
  p.sql = sql;
  const origBind = p.bind;
  p.bind = function (...args) {
    p.bound = args;
    return origBind.apply(this, args);
  };
  return p;
};

async function runRequiredTests() {
  // TEST 1:
  // Delete all patients.
  // Expected: 0 patients.
  // Create patient.
  // Expected: HC-1001
  console.log('--- TEST 1: Delete all patients -> Create patient -> Expected: HC-1001 ---');
  const clear1 = await handleClearPatients({ confirmation: 'DELETE PATIENTS' }, { DB: d1Wrapper });
  assert.strictEqual(clear1.status, 200, 'Clear must succeed');
  const patientCount1 = sqlite.prepare('SELECT COUNT(*) as cnt FROM patients').get().cnt;
  assert.strictEqual(Number(patientCount1), 0, 'Expected 0 patients in DB');
  console.log(`  ✓ Confirmed: ${patientCount1} patients in DB.`);

  const p1 = await d1Client.allocatePatient(d1Wrapper, {
    name: 'Test Patient 1',
    age: 30,
    gender: 'M',
    mobile: '9876543210',
  });
  console.log(`  ✓ Allocated patient 1: UHID = ${p1.uhid}`);
  assert.strictEqual(p1.uhid, 'HC-1001', `Expected HC-1001, got ${p1.uhid}`);

  // TEST 2:
  // Create another patient.
  // Expected: HC-1002
  console.log('\n--- TEST 2: Create another patient -> Expected: HC-1002 ---');
  const p2 = await d1Client.allocatePatient(d1Wrapper, {
    name: 'Test Patient 2',
    age: 25,
    gender: 'F',
    mobile: '9876543211',
  });
  console.log(`  ✓ Allocated patient 2: UHID = ${p2.uhid}`);
  assert.strictEqual(p2.uhid, 'HC-1002', `Expected HC-1002, got ${p2.uhid}`);

  // TEST 3:
  // Create another patient.
  // Expected: HC-1003
  console.log('\n--- TEST 3: Create another patient -> Expected: HC-1003 ---');
  const p3 = await d1Client.allocatePatient(d1Wrapper, {
    name: 'Test Patient 3',
    age: 45,
    gender: 'M',
    mobile: '9876543212',
  });
  console.log(`  ✓ Allocated patient 3: UHID = ${p3.uhid}`);
  assert.strictEqual(p3.uhid, 'HC-1003', `Expected HC-1003, got ${p3.uhid}`);

  // TEST 4:
  // Delete HC-1002 individually.
  // Create another patient.
  // Expected: HC-1004, NOT HC-1002.
  console.log('\n--- TEST 4: Delete HC-1002 individually -> Create patient -> Expected: HC-1004 (NOT HC-1002) ---');
  await d1Client.remove(d1Wrapper, 'patients', p2.id);
  const remainingAfterDelete2 = sqlite.prepare('SELECT uhid FROM patients').all().map((r) => r.uhid);
  console.log('  Remaining patients:', remainingAfterDelete2);
  assert(!remainingAfterDelete2.includes('HC-1002'), 'HC-1002 must be removed');

  const p4 = await d1Client.allocatePatient(d1Wrapper, {
    name: 'Test Patient 4',
    age: 50,
    gender: 'F',
    mobile: '9876543213',
  });
  console.log(`  ✓ Allocated patient 4: UHID = ${p4.uhid}`);
  assert.strictEqual(p4.uhid, 'HC-1004', `Expected HC-1004, got ${p4.uhid}`);
  assert.notStrictEqual(p4.uhid, 'HC-1002', 'HC-1002 must NOT be reused');

  // TEST 5:
  // Delete all remaining patients using "Delete All Patients".
  // Create new patient.
  // Expected: HC-1001
  console.log('\n--- TEST 5: Delete all remaining patients using "Delete All Patients" -> Create new patient -> Expected: HC-1001 ---');
  const clear2 = await handleClearPatients({ confirmation: 'DELETE PATIENTS' }, { DB: d1Wrapper });
  assert.strictEqual(clear2.status, 200, 'Clear must succeed');
  const patientCount2 = sqlite.prepare('SELECT COUNT(*) as cnt FROM patients').get().cnt;
  assert.strictEqual(Number(patientCount2), 0, 'Expected 0 patients in DB');
  console.log(`  ✓ Confirmed: ${patientCount2} patients in DB.`);

  const p5 = await d1Client.allocatePatient(d1Wrapper, {
    name: 'Test Patient 5 (Post Reset)',
    age: 28,
    gender: 'M',
    mobile: '9876543214',
  });
  console.log(`  ✓ Allocated patient 5: UHID = ${p5.uhid}`);
  assert.strictEqual(p5.uhid, 'HC-1001', `Expected HC-1001 after Delete All Patients, got ${p5.uhid}`);

  // TEST 6:
  // Refresh the browser (re-read backend preview & state).
  // Create another patient.
  // Expected: HC-1002
  console.log('\n--- TEST 6: Refresh simulation (re-read state from DB) -> Create another patient -> Expected: HC-1002 ---');
  const previewReload = await d1Client.getNextUhidPreview(d1Wrapper);
  console.log(`  ✓ Reload preview UHID = ${previewReload.nextUhid}`);
  assert.strictEqual(previewReload.nextUhid, 'HC-1002', `Expected HC-1002 preview, got ${previewReload.nextUhid}`);

  const p6 = await d1Client.allocatePatient(d1Wrapper, {
    name: 'Test Patient 6 (Post Reload)',
    age: 33,
    gender: 'F',
    mobile: '9876543215',
  });
  console.log(`  ✓ Allocated patient 6: UHID = ${p6.uhid}`);
  assert.strictEqual(p6.uhid, 'HC-1002', `Expected HC-1002, got ${p6.uhid}`);

  // TEST 7:
  // Open another computer/browser connected to the same backend/database.
  // Create patient.
  // Expected: Next shared UHID in the same sequence (HC-1003).
  console.log('\n--- TEST 7: Open another computer/browser connected to same backend/DB -> Create patient -> Expected: HC-1003 ---');
  const previewComputer2 = await d1Client.getNextUhidPreview(d1Wrapper);
  console.log(`  ✓ Computer 2 preview UHID = ${previewComputer2.nextUhid}`);
  assert.strictEqual(previewComputer2.nextUhid, 'HC-1003', `Expected HC-1003 preview, got ${previewComputer2.nextUhid}`);

  const p7Computer2 = await d1Client.allocatePatient(d1Wrapper, {
    name: 'Test Patient 7 (Computer 2)',
    age: 62,
    gender: 'M',
    mobile: '9876543216',
  });
  console.log(`  ✓ Allocated patient 7 from Computer 2: UHID = ${p7Computer2.uhid}`);
  assert.strictEqual(p7Computer2.uhid, 'HC-1003', `Expected HC-1003, got ${p7Computer2.uhid}`);

  // Clean up: delete all test patients so the database remains clean
  console.log('\n--- Clean up test data via Delete All Patients ---');
  await handleClearPatients({ confirmation: 'DELETE PATIENTS' }, { DB: d1Wrapper });
  const finalCount = sqlite.prepare('SELECT COUNT(*) as cnt FROM patients').get().cnt;
  assert.strictEqual(Number(finalCount), 0);
  const finalPreview = await d1Client.getNextUhidPreview(d1Wrapper);
  assert.strictEqual(finalPreview.nextUhid, 'HC-1001');
  console.log(`  ✓ Final database status: 0 patients, next preview = ${finalPreview.nextUhid}`);

  console.log('\n================================================================');
  console.log('ALL 7 REQUIRED TESTS PASSED FLAWLESSLY ON THE LIVE DATABASE!');
  console.log('================================================================\n');
}

runRequiredTests().catch((err) => {
  console.error('\n✗ TEST RUN FAILED:', err);
  process.exit(1);
});
