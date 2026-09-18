import assert from 'node:assert';
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
const { authApi, setAuthToken, getRecords } = await import('../src/services/api.js');
const { createService, deleteService } = await import('../src/services/billing.js');
const { createDoctor, deleteDoctor } = await import('../src/services/clinical.js');

async function testFlow() {
  console.log('1. Authenticating...');
  const loginRes = await authApi.login('heeva@26');
  assert(loginRes?.token, 'Login failed');
  setAuthToken(loginRes.token);
  console.log('  ✓ Authenticated');

  console.log('2. Syncing from D1...');
  await syncFromBackend(db);
  console.log('  ✓ Initial sync complete');

  console.log('3. Testing Service Creation...');
  const testServiceName = `Test Service ${Date.now()}`;
  const svc = await createService({
    name: testServiceName,
    type: 'service',
    price: 350,
    description: 'Automated test service',
  }, 'u_admin');
  console.log('  ✓ createService resolved:', svc.id, svc.service_code, svc.name);

  // Check if it exists in local Dexie
  const localSvc = await db.services.get(svc.id);
  assert(localSvc, 'Service missing in local Dexie');
  console.log('  ✓ Found in local Dexie');

  // Check if it exists in D1
  const d1Services = await getRecords('services');
  const inD1 = d1Services.find(s => s.id === svc.id);
  console.log('  In D1 immediately after createService?', !!inD1);

  // Sync from backend to simulate 2-second background sync
  console.log('4. Simulating background sync...');
  await syncFromBackend(db);
  const localSvcAfterSync = await db.services.get(svc.id);
  console.log('  After background sync, service exists in local Dexie?', !!localSvcAfterSync);
  assert(localSvcAfterSync, 'BUG REPRODUCED: Service disappeared after sync!');

  console.log('5. Testing Doctor Deletion...');
  const testDoctor = await createDoctor({
    name: `Dr. Delete Test ${Date.now()}`,
    qualification: 'MD',
    specialization: 'Cardiology',
    phone: '9988776655',
    email: 'test@doctor.com',
  }, 'u_admin');
  console.log('  ✓ Doctor created:', testDoctor.id, testDoctor.name);

  // Verify in Dexie and D1
  assert(await db.doctors.get(testDoctor.id), 'Doctor not in local Dexie');
  let d1Doctors = await getRecords('doctors');
  assert(d1Doctors.find(d => d.id === testDoctor.id), 'Doctor not in D1');
  console.log('  ✓ Doctor confirmed in local Dexie and D1');

  // Delete doctor
  console.log('6. Deleting Doctor...');
  await deleteDoctor(testDoctor.id, 'u_admin');
  console.log('  ✓ deleteDoctor executed');

  // Verify removed from Dexie
  const localDocAfterDelete = await db.doctors.get(testDoctor.id);
  assert(!localDocAfterDelete, 'Doctor still exists in local Dexie after delete');
  console.log('  ✓ Doctor removed from local Dexie');

  // Verify removed from D1
  d1Doctors = await getRecords('doctors');
  assert(!d1Doctors.find(d => d.id === testDoctor.id), 'Doctor still exists in D1 after delete');
  console.log('  ✓ Doctor removed from D1');

  // Background sync should keep it deleted
  await syncFromBackend(db);
  assert(!await db.doctors.get(testDoctor.id), 'Doctor reappeared after sync');
  console.log('  ✓ Doctor permanently deleted');

  // Clean up test service
  await deleteService(svc.id, 'u_admin');
  console.log('7. Cleaned up test service');

  console.log('\n ALL TESTS PASSED!');
}

testFlow().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
