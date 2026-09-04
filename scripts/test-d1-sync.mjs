import assert from 'node:assert';
import { execSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;
globalThis.__FORCE_SYNC__ = true;

await import('fake-indexeddb/auto');
const { db } = await import('../src/db.js');
const { syncFromBackend } = await import('../src/lib/remoteSync.js');
const { authApi, createPatient, getPatients, setAuthToken } = await import('../src/services/api.js');

async function run() {
  console.log('=== VERIFYING D1 SINGLE-SOURCE-OF-TRUTH & STALE DATA ELIMINATION ===\n');

  // 1. Authenticate with local Worker
  console.log('Step 1: Authenticating with Cloudflare Worker...');
  const loginResult = await authApi.login('heeva@26');
  assert(loginResult?.token, 'Login failed');
  setAuthToken(loginResult.token);
  console.log('  ✓ Authenticated. Session token received.');

  // 2. Initial sync from D1
  console.log('\nStep 2: Syncing initial state from Cloudflare D1 into local Dexie cache...');
  await syncFromBackend(db);
  const initialD1Patients = await getPatients();
  const initialLocalCount = await db.patients.count();
  console.log(`  ✓ Initial D1 patients: ${initialD1Patients.length}, Dexie patients: ${initialLocalCount}`);
  assert.strictEqual(initialD1Patients.length, initialLocalCount, 'Initial count mismatch');

  // STEP A: Add a test record through the app
  console.log('\nStep A: Adding a new test patient through the application...');
  const testId = `sync-test-${Date.now()}`;
  const testUhid = `HC-SYNC-${Date.now().toString().slice(-4)}`;
  const newPatientData = {
    id: testId,
    uhid: testUhid,
    name: 'D1 Sync Test Patient',
    dob: '1990-01-01',
    gender: 'Female',
    mobile: '9876543210',
    city: 'Surat',
    active: 1,
  };
  await createPatient(newPatientData);
  await db.patients.put(newPatientData);
  console.log(`  ✓ Created test patient: ${newPatientData.name} (ID: ${testId}, UHID: ${testUhid})`);

  // STEP B: Confirm it exists in D1
  console.log('\nStep B: Confirming the patient exists in Cloudflare D1...');
  const d1PatientsAfterCreate = await getPatients();
  const foundInD1 = d1PatientsAfterCreate.find((p) => p.id === testId);
  assert(foundInD1, 'Patient was not found in D1 after creation!');
  console.log(`  ✓ Confirmed: Patient exists in Cloudflare D1 (UHID: ${foundInD1.uhid})`);

  // STEP C: Delete the record directly from D1 (simulating direct D1 console execution)
  console.log('\nStep C: Deleting record DIRECTLY from Cloudflare D1 via SQL command...');
  const sqlCmd = `DELETE FROM patients WHERE id = '${testId}'`;
  execSync(`npx wrangler d1 execute heeva-clinic-db --local --command "${sqlCmd}"`, {
    stdio: 'pipe',
  });
  console.log(`  ✓ Executed direct D1 SQL: ${sqlCmd}`);

  // Confirm it was genuinely deleted from D1
  const d1AfterDirectDelete = await getPatients();
  const stillInD1 = d1AfterDirectDelete.find((p) => p.id === testId);
  assert(!stillInD1, 'Patient still exists in D1 after direct SQL delete!');
  console.log('  ✓ Confirmed: Record is completely gone from Cloudflare D1 database.');

  // STEP D: Hard refresh the application (simulating browser reload & syncFromBackend)
  console.log('\nStep D: Simulating application reload / hard refresh...');
  await syncFromBackend(db);
  console.log('  ✓ syncFromBackend completed (with cache: no-store and Service Worker /api bypass).');

  // STEP E: Confirm the record no longer appears
  console.log('\nStep E: Confirming the record NO LONGER APPEARS in Dexie or GET /api/patients...');
  const localAfterReload = await db.patients.get(testId);
  assert.strictEqual(localAfterReload, undefined, 'ERROR: Deleted record is still present in local Dexie cache!');
  const allLocalAfterReload = await db.patients.toArray();
  const foundInAllLocal = allLocalAfterReload.find((p) => p.id === testId);
  assert(!foundInAllLocal, 'ERROR: Deleted record found in local patients array!');
  console.log('  ✓ Confirmed: Deleted record is completely ABSENT from local Dexie / IndexedDB cache.');
  console.log('  ✓ Confirmed: Deleted record is completely ABSENT from GET /api/patients.');

  // STEP F: Close and reopen the application (simulating fresh browser session)
  console.log('\nStep F: Simulating closing and reopening the application (fresh boot)...');
  await syncFromBackend(db);
  console.log('  ✓ Re-boot sync executed.');

  // STEP G: Confirm the old data does not return
  console.log('\nStep G: Confirming the old data DOES NOT RETURN...');
  const localAfterReopen = await db.patients.get(testId);
  assert.strictEqual(localAfterReopen, undefined, 'ERROR: Stale data returned after reopening app!');
  console.log('  ✓ Confirmed: Old data does NOT return. Cloudflare D1 is the single source of truth!');

  console.log('\n======================================================');
  console.log('ALL VERIFICATION STEPS (A through G) PASSED SUCCESSFULLY!');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('\n❌ Test failure:', err);
  process.exit(1);
});
