import assert from 'node:assert';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;
globalThis.__FORCE_SYNC__ = true;

const { db } = await import('../src/db.js');
const { syncFromBackend } = await import('../src/lib/remoteSync.js');
const { authApi, setAuthToken, getRecords } = await import('../src/services/api.js');
const { createService, updateService, deleteService } = await import('../src/services/billing.js');

async function testServices() {
  console.log('--- Authenticating ---');
  const login = await authApi.login('heeva@26');
  setAuthToken(login.token);
  console.log('Authenticated.');

  console.log('--- Initial Sync ---');
  await syncFromBackend(db);

  console.log('--- Creating Service ---');
  const svc = await createService({
    name: 'Consultation Fee',
    type: 'consultation',
    price: 300,
    description: 'General doctor consultation',
  }, 'admin-user');
  console.log('Created local service:', svc);

  const localSvc = await db.services.get(svc.id);
  console.log('Local svc in Dexie immediately:', localSvc ? 'EXISTS' : 'MISSING');

  // Check remote D1 directly
  const remoteRows = await getRecords('services');
  console.log('Remote services in D1 count:', remoteRows.length, remoteRows);

  const foundRemote = remoteRows.find(r => r.id === svc.id);
  console.log('Found in D1?:', foundRemote ? 'YES' : 'NO');

  console.log('--- Triggering syncFromBackend (simulating 2s / 8s timer) ---');
  await syncFromBackend(db);

  const localAfterSync = await db.services.get(svc.id);
  console.log('Local svc in Dexie AFTER sync:', localAfterSync ? 'STILL EXISTS' : 'DISAPPEARED!');
}

testServices().catch(console.error);
