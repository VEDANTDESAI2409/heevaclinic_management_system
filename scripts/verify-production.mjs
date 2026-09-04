import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function runVerification() {
  console.log('=== HEEVA CLINIC PRODUCTION VERIFICATION ===\n');

  const BASE = 'http://localhost:3001';

  // 1. Root & HTML
  console.log('--- 1. Testing Frontend Production Build Serving ---');
  const rootRes = await fetch(`${BASE}/`);
  assert(rootRes.ok, `GET / returned 200 OK (status: ${rootRes.status})`);
  assert(rootRes.headers.get('content-type')?.includes('text/html'), 'GET / returned Content-Type text/html');
  const rootHtml = await rootRes.text();
  assert(rootHtml.includes('<div id="root"></div>'), 'Contains root mount element');
  assert(rootHtml.includes('src="/assets/index-'), 'Contains root-relative JS bundle path (/assets/index-...)');
  assert(rootHtml.includes('href="/assets/index-'), 'Contains root-relative CSS bundle path (/assets/index-...)');
  assert(rootHtml.includes('href="/icons/favicon.png"'), 'Contains root-relative favicon path (/icons/favicon.png)');

  // 2. Static Asset Delivery
  console.log('\n--- 2. Testing Static Asset Delivery ---');
  const match = rootHtml.match(/src="(\/assets\/index-[^"]+\.js)"/);
  if (match) {
    const assetPath = match[1];
    const assetRes = await fetch(`${BASE}${assetPath}`);
    assert(assetRes.ok, `GET ${assetPath} returned 200 OK`);
    assert(
      assetRes.headers.get('content-type')?.includes('javascript'),
      `Asset served with javascript content type (got: ${assetRes.headers.get('content-type')})`
    );
  } else {
    assert(false, 'Could not find JS asset link in root HTML');
  }

  // 3. React Router SPA Fallback (Deep Links)
  console.log('\n--- 3. Testing React Router SPA Fallback Routes ---');
  const routesToTest = [
    '/patients',
    '/patients/4dce1f2b-e050-4a4c-b741-a9b44373b0b0',
    '/medicines',
    '/inventory',
    '/billing',
    '/staff',
    '/settings',
    '/reports',
  ];

  for (const route of routesToTest) {
    const rRes = await fetch(`${BASE}${route}`);
    assert(rRes.ok, `SPA route ${route} returned 200 OK`);
    assert(rRes.headers.get('content-type')?.includes('text/html'), `${route} served index.html fallback`);
    const rHtml = await rRes.text();
    assert(rHtml.includes('<div id="root"></div>'), `${route} contains root mount element`);
  }

  // 4. API Endpoints
  console.log('\n--- 4. Testing REST API Routes ---');
  const healthRes = await fetch(`${BASE}/api/health`);
  assert(healthRes.ok, `GET /api/health returned 200 OK`);
  const healthData = await healthRes.json();
  assert(healthData.status === 'ok' && healthData.storage === 'json', 'Healthcheck returned JSON storage ok');

  const patientsRes = await fetch(`${BASE}/api/patients`);
  assert(patientsRes.ok, `GET /api/patients returned 200 OK`);
  const patients = await patientsRes.json();
  assert(Array.isArray(patients) && patients.length > 0, `GET /api/patients returned ${patients.length} existing patient(s)`);

  const medicinesRes = await fetch(`${BASE}/api/medicines`);
  assert(medicinesRes.ok, `GET /api/medicines returned 200 OK`);
  const meds = await medicinesRes.json();
  assert(Array.isArray(meds) && meds.length > 0, `GET /api/medicines returned ${meds.length} existing medicine(s)`);

  const doctorsRes = await fetch(`${BASE}/api/doctors`);
  assert(doctorsRes.ok, `GET /api/doctors returned 200 OK`);
  const docs = await doctorsRes.json();
  assert(Array.isArray(docs), 'GET /api/doctors returned array');

  const batchesRes = await fetch(`${BASE}/api/batches`);
  assert(batchesRes.ok, `GET /api/batches returned 200 OK`);
  const batches = await batchesRes.json();
  assert(Array.isArray(batches), 'GET /api/batches returned array');

  // 5. Unhandled API 404s (Must return JSON, not HTML)
  console.log('\n--- 5. Testing API 404 Isolation ---');
  const unknownApiRes = await fetch(`${BASE}/api/unknown_collection_xyz`);
  assert(unknownApiRes.status === 404, `Unhandled API endpoint returned 404 (got ${unknownApiRes.status})`);
  assert(unknownApiRes.headers.get('content-type')?.includes('application/json'), 'Unhandled API returned JSON error (NOT HTML)');
  const unknownApiData = await unknownApiRes.json();
  assert(!!unknownApiData.error, 'Error message present in JSON 404');

  // 6. Data Persistence & CRUD Cycle
  console.log('\n--- 6. Testing Data Persistence & CRUD Operations ---');
  const createPatientRes = await fetch(`${BASE}/api/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Production Verification Patient',
      dob: '1985-05-15',
      gender: 'Female',
      mobile: '9898989898',
      city: 'Surat',
      state: 'Gujarat',
    }),
  });
  assert(createPatientRes.status === 201, `POST /api/patients created record (status ${createPatientRes.status})`);
  const createdPatient = await createPatientRes.json();
  assert(createdPatient.name === 'Production Verification Patient', 'Patient created with correct name');
  assert(!!createdPatient.id, 'Patient assigned unique ID');

  const getPatientRes = await fetch(`${BASE}/api/patients/${createdPatient.id}`);
  assert(getPatientRes.ok, `GET /api/patients/:id fetched created patient`);
  const fetchedPatient = await getPatientRes.json();
  assert(fetchedPatient.id === createdPatient.id, 'Fetched patient matches created ID');

  const deletePatientRes = await fetch(`${BASE}/api/patients/${createdPatient.id}`, { method: 'DELETE' });
  assert(deletePatientRes.status === 204, `DELETE /api/patients/:id returned 204 No Content`);

  const getDeletedRes = await fetch(`${BASE}/api/patients/${createdPatient.id}`);
  assert(getDeletedRes.status === 404, `GET deleted patient returned 404`);

  // 7. Custom DATA_DIR bootstrapping test
  console.log('\n--- 7. Testing DATA_DIR Custom Directory Bootstrapping ---');
  const tempTestDir = path.resolve(__dirname, '../server/data_test_bootstrap');
  if (fs.existsSync(tempTestDir)) {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
  }

  // Dynamically import dataService with DATA_DIR set
  process.env.DATA_DIR = tempTestDir;
  const { dataService } = await import(`../server/services/dataService.js?t=${Date.now()}`);
  assert(fs.existsSync(tempTestDir), 'Custom DATA_DIR was automatically created if missing');
  assert(fs.existsSync(path.join(tempTestDir, 'clinic_settings.json')), 'Baseline clinic_settings.json bootstrapped into custom DATA_DIR');
  assert(fs.existsSync(path.join(tempTestDir, 'medicines.json')), 'Baseline medicines.json bootstrapped into custom DATA_DIR');

  // Clean up test directory
  try {
    fs.rmSync(tempTestDir, { recursive: true, force: true });
    assert(!fs.existsSync(tempTestDir), 'Cleaned up temporary test DATA_DIR');
  } catch (_) {}

  console.log(`\n========================================`);
  console.log(`TOTAL CHECKS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error('Fatal verification error:', err);
  process.exit(1);
});
