import assert from 'node:assert';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8787';

let DEV_PASSWORD = 'heeva@26';
try {
  const devVars = fs.readFileSync('.dev.vars', 'utf8');
  const match = devVars.match(/APP_PASSWORD\s*=\s*(.*)/);
  if (match) DEV_PASSWORD = match[1].trim();
} catch (_) {}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name} ->`, err.message);
    failed++;
  }
}

async function runTests() {
  console.log('=== TESTING CLOUDFLARE WORKER + D1 DATABASE API (WITH AUTH & CASCADE DELETES) ===\n');

  // 1. Healthcheck (Public endpoint)
  console.log('--- 1. Healthcheck ---');
  const healthRes = await fetch(`${BASE}/api/health`);
  test('GET /api/health returns 200 (public)', () => assert.strictEqual(healthRes.status, 200));
  const health = await healthRes.json();
  test('Health payload reports storage: d1, backend: connected', () => {
    assert.strictEqual(health.status, 'ok');
    assert.strictEqual(health.storage, 'd1');
    assert.strictEqual(health.backend, 'connected');
  });

  // 2. Auth Security Verification
  console.log('\n--- 2. Auth & Protected Endpoints Security ---');
  const unauthRes = await fetch(`${BASE}/api/patients`);
  test('GET /api/patients without token returns 401 Unauthorized', () => {
    assert.strictEqual(unauthRes.status, 401);
  });

  const badTokenRes = await fetch(`${BASE}/api/patients`, {
    headers: { Authorization: 'Bearer invalid.token.value' },
  });
  test('GET /api/patients with fake token returns 401 Unauthorized', () => {
    assert.strictEqual(badTokenRes.status, 401);
  });

  const badLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'wrong-password-xyz' }),
  });
  test('POST /api/auth/login with invalid password returns 401', () => {
    assert.strictEqual(badLoginRes.status, 401);
  });

  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: DEV_PASSWORD }),
  });
  test('POST /api/auth/login with correct password returns 200', () => {
    assert.strictEqual(loginRes.status, 200);
  });
  const loginData = await loginRes.json();
  test('Login response contains valid HMAC token and expiresAt', () => {
    assert(loginData.token && loginData.token.includes('.'));
    assert(typeof loginData.expiresAt === 'number');
  });

  const token = loginData.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  const verifyRes = await fetch(`${BASE}/api/auth/verify`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  test('GET /api/auth/verify with Bearer token returns 200 and valid: true', async () => {
    assert.strictEqual(verifyRes.status, 200);
    const v = await verifyRes.json();
    assert.strictEqual(v.valid, true);
  });

  // 3. Fetch Collections with Auth
  console.log('\n--- 3. Fetch Existing Collections (Authenticated) ---');
  const tables = [
    'clinic_settings', 'settings',
    'counters',
    'patients',
    'medicines',
    'medicine_categories',
    'medicine_batches', 'batches',
    'inventory_transactions', 'inventory_txns',
    'bills',
    'bill_items',
    'payments',
  ];

  for (const table of tables) {
    const res = await fetch(`${BASE}/api/${table}`, { headers: authHeaders });
    test(`GET /api/${table} with Bearer token returns 200`, () => assert.strictEqual(res.status, 200));
    const data = await res.json();
    test(`GET /api/${table} returns Array`, () => assert(Array.isArray(data)));
  }

  // Verify settings alias
  const settingsRes = await fetch(`${BASE}/api/settings`, { headers: authHeaders });
  const settingsData = await settingsRes.json();
  test('GET /api/settings returns seeded clinic_settings row', () => {
    assert(settingsData.length > 0);
    assert.strictEqual(settingsData[0].clinic_name, 'HEEVA CLINIC');
  });

  // 4. CRUD: Patient Lifecycle
  console.log('\n--- 4. Patient CRUD Lifecycle ---');
  const testMobile = `99${Math.floor(10000000 + Math.random() * 90000000)}`;
  const newPatientRes = await fetch(`${BASE}/api/patients`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      uhid: `HC-TEST-${Date.now()}`,
      name: 'D1 Test Patient',
      dob: '1995-08-15',
      gender: 'Female',
      mobile: testMobile,
      city: 'Surat',
      state: 'Gujarat',
    }),
  });
  test('POST /api/patients returns 201 Created', () => assert.strictEqual(newPatientRes.status, 201));
  const createdPatient = await newPatientRes.json();
  test('Created patient has assigned ID and correct name', () => {
    assert(!!createdPatient.id);
    assert.strictEqual(createdPatient.name, 'D1 Test Patient');
  });

  // Read single patient by ID
  const getPatientRes = await fetch(`${BASE}/api/patients/${createdPatient.id}`, { headers: authHeaders });
  test('GET /api/patients/:id returns 200', () => assert.strictEqual(getPatientRes.status, 200));
  const fetchedPatient = await getPatientRes.json();
  test('Fetched patient matches created ID', () => assert.strictEqual(fetchedPatient.id, createdPatient.id));

  // Update patient (PUT upsert)
  const updatePatientRes = await fetch(`${BASE}/api/patients/${createdPatient.id}`, {
    method: 'PUT',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'D1 Test Patient Updated',
      address: 'Navsari Station Road',
    }),
  });
  test('PUT /api/patients/:id returns 200', () => assert.strictEqual(updatePatientRes.status, 200));
  const updatedPatient = await updatePatientRes.json();
  test('Updated patient has new name and address', () => {
    assert.strictEqual(updatedPatient.name, 'D1 Test Patient Updated');
    assert.strictEqual(updatedPatient.address, 'Navsari Station Road');
  });

  // Delete patient
  const deletePatientRes = await fetch(`${BASE}/api/patients/${createdPatient.id}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  test('DELETE /api/patients/:id returns 204 No Content', () => assert.strictEqual(deletePatientRes.status, 204));

  // Verify deletion returns 404
  const verifyDeleteRes = await fetch(`${BASE}/api/patients/${createdPatient.id}`, { headers: authHeaders });
  test('GET deleted patient returns 404', () => assert.strictEqual(verifyDeleteRes.status, 404));

  // 5. Cascade Deletion Testing
  console.log('\n--- 5. Cascade Deletion (Bills -> Bill Items, Payments & Prescriptions -> Items) ---');
  // Create a patient for the bill
  const billPatientRes = await fetch(`${BASE}/api/patients`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      uhid: `HC-CASCADE-${Date.now()}`,
      name: 'Cascade Safety Patient',
      mobile: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      gender: 'Male',
    }),
  });
  const billPatient = await billPatientRes.json();

  // Create Bill
  const billId = `bill-test-${Date.now()}`;
  const createBillRes = await fetch(`${BASE}/api/bills`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      id: billId,
      bill_no: `INV-TEST-${Date.now()}`,
      patient_id: billPatient.id,
      patient_name: billPatient.name,
      patient_uhid: billPatient.uhid,
      date: '2026-09-05',
      time: '12:00:00',
      total: 500,
      paid: 500,
      status: 'completed',
      payment_status: 'PAID',
    }),
  });
  test('POST /api/bills returns 201', () => assert.strictEqual(createBillRes.status, 201));

  // Create Bill Item
  const itemId = `item-test-${Date.now()}`;
  const createItemRes = await fetch(`${BASE}/api/bill_items`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      id: itemId,
      bill_id: billId,
      item_type: 'service',
      name: 'Consultation Fee',
      qty: 1,
      price: 500,
      amount: 500,
    }),
  });
  test('POST /api/bill_items returns 201', () => assert.strictEqual(createItemRes.status, 201));

  // Create Payment
  const paymentId = `pay-test-${Date.now()}`;
  const createPaymentRes = await fetch(`${BASE}/api/payments`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      id: paymentId,
      bill_id: billId,
      patient_id: billPatient.id,
      amount: 500,
      method: 'Cash',
      at: '2026-09-05 12:00:00',
    }),
  });
  test('POST /api/payments returns 201', () => assert.strictEqual(createPaymentRes.status, 201));

  // Delete Bill directly and verify cascade cleanup
  const deleteBillRes = await fetch(`${BASE}/api/bills/${billId}`, {
    method: 'DELETE',
    headers: authHeaders,
  });
  test('DELETE /api/bills/:id returns 204', () => assert.strictEqual(deleteBillRes.status, 204));

  // Verify bill items and payments were cascade-deleted
  const checkBillRes = await fetch(`${BASE}/api/bills/${billId}`, { headers: authHeaders });
  test('Deleted bill returns 404', () => assert.strictEqual(checkBillRes.status, 404));

  const checkItemRes = await fetch(`${BASE}/api/bill_items/${itemId}`, { headers: authHeaders });
  test('Linked bill item was cascade deleted (returns 404)', () => assert.strictEqual(checkItemRes.status, 404));

  const checkPayRes = await fetch(`${BASE}/api/payments/${paymentId}`, { headers: authHeaders });
  test('Linked payment was cascade deleted (returns 404)', () => assert.strictEqual(checkPayRes.status, 404));

  // Clean up cascade test patient
  await fetch(`${BASE}/api/patients/${billPatient.id}`, { method: 'DELETE', headers: authHeaders });

  // 6. Bulk CSV Import Endpoints
  console.log('\n--- 6. Bulk CSV Import API ---');

  // A. Import Patient with sequential UHID from D1 counter
  const pImportRes = await fetch(`${BASE}/api/patients/import`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      records: [{
        name: 'Bulk Imported Patient',
        dob: '2000-01-01',
        gender: 'Male',
        mobile: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
        city: 'Surat',
      }],
      userId: 'test-admin',
    }),
  });
  test('POST /api/patients/import returns 200', () => assert.strictEqual(pImportRes.status, 200));
  const pImportData = await pImportRes.json();
  test('Patient bulk import returns success and count = 1', () => {
    assert.strictEqual(pImportData.success, true);
    assert.strictEqual(pImportData.count, 1);
    assert(pImportData.records[0].uhid.startsWith('HC-'));
  });

  // B. Import Medicine with sequential MD code from D1 counter
  const testMedName = `D1Med-${Date.now()}`;
  const mImportRes = await fetch(`${BASE}/api/medicines/import`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      records: [{
        name: testMedName,
        generic: 'Paracetamol',
        category: 'Analgesic',
        type: 'Tablet',
        purchase_price: 10,
        selling_price: 20,
      }],
      userId: 'test-admin',
    }),
  });
  test('POST /api/medicines/import returns 200', () => assert.strictEqual(mImportRes.status, 200));
  const mImportData = await mImportRes.json();
  test('Medicine bulk import returns success and MD code', () => {
    assert.strictEqual(mImportData.success, true);
    assert.strictEqual(mImportData.count, 1);
    assert(mImportData.records[0].medicine_code.startsWith('MD-'));
  });
  const createdMed = mImportData.records[0];

  // C. Import Batch with auto-created ADJUSTMENT transaction in D1
  const testBatchNo = `D1BAT-${Date.now()}`;
  const bImportRes = await fetch(`${BASE}/api/medicine_batches/import`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      records: [{
        medicine_id: createdMed.id,
        batch_no: testBatchNo,
        quantity: 50,
        expiry: '2029-12-31',
        purchase_price: 10,
      }],
      userId: 'test-admin',
    }),
  });
  test('POST /api/medicine_batches/import returns 200', () => assert.strictEqual(bImportRes.status, 200));
  const bImportData = await bImportRes.json();
  test('Batch bulk import auto-creates ADJUSTMENT inventory transaction', () => {
    assert.strictEqual(bImportData.success, true);
    assert.strictEqual(bImportData.count, 1);
    assert.strictEqual(bImportData.extraTables?.inventory_txns?.length, 1);
    assert.strictEqual(bImportData.extraTables.inventory_txns[0].type, 'ADJUSTMENT');
    assert.strictEqual(bImportData.extraTables.inventory_txns[0].qty, 50);
  });

  // Clean up bulk import items
  if (pImportData.records[0]?.id) {
    await fetch(`${BASE}/api/patients/${pImportData.records[0].id}`, { method: 'DELETE', headers: authHeaders });
  }
  if (createdMed?.id) {
    await fetch(`${BASE}/api/medicines/${createdMed.id}`, { method: 'DELETE', headers: authHeaders });
  }
  if (bImportData.records[0]?.id) {
    await fetch(`${BASE}/api/medicine_batches/${bImportData.records[0].id}`, { method: 'DELETE', headers: authHeaders });
  }

  // 7. Reset All Clinic Data Endpoint
  console.log('\n--- 7. Reset All Clinic Data (/api/admin/reset) ---');
  const badResetRes = await fetch(`${BASE}/api/admin/reset`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ password: 'wrong-admin-pass' }),
  });
  test('POST /api/admin/reset with incorrect password returns 401', () => {
    assert.strictEqual(badResetRes.status, 401);
  });

  const goodResetRes = await fetch(`${BASE}/api/admin/reset`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ password: DEV_PASSWORD }),
  });
  test('POST /api/admin/reset with correct password returns 200', () => {
    assert.strictEqual(goodResetRes.status, 200);
  });
  const resetResult = await goodResetRes.json();
  test('Reset response confirms database wipe and default clinic settings restored', () => {
    assert.strictEqual(resetResult.ok, true);
    assert(resetResult.message.includes('reset'));
  });

  // Verify that clinic_settings is intact after reset
  const postResetSettings = await fetch(`${BASE}/api/settings`, { headers: authHeaders });
  const postResetSettingsData = await postResetSettings.json();
  test('After reset, clinic_settings contains default HEEVA CLINIC configuration', () => {
    assert(postResetSettingsData.length > 0);
    assert.strictEqual(postResetSettingsData[0].clinic_name, 'HEEVA CLINIC');
  });

  // 8. 404 Isolation
  console.log('\n--- 8. 404 Isolation ---');
  const unknownRes = await fetch(`${BASE}/api/unknown_collection_12345`, { headers: authHeaders });
  test('Unknown /api endpoint returns 404 status', () => assert.strictEqual(unknownRes.status, 404));
  test('Unknown /api endpoint returns application/json Content-Type', () => {
    assert(unknownRes.headers.get('content-type')?.includes('application/json'));
  });

  console.log('\n========================================');
  console.log(`TOTAL TESTS: ${passed + failed}`);
  console.log(`PASSED: ${passed}`);
  console.log(`FAILED: ${failed}`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
