import assert from 'node:assert';
import { JSDOM } from 'jsdom';

// Initialize DOM environment for Dexie and browser APIs
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;
globalThis.__FORCE_SYNC__ = true;

await import('fake-indexeddb/auto');
const Dexie = (await import('dexie')).default;

const BASE = 'http://127.0.0.1:8787';

function createDevice(name, ip) {
  const db = new Dexie(`heeva_clinic_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`);
  db.version(1).stores({
    settings: 'key',
    counters: 'key',
    roles: 'id, &key',
    users: 'id, &username, role',
    doctors: 'id, name',
    patients: 'id, &uhid, name, mobile, created_at, [name+dob]',
    patient_vitals: 'id, patient_id, recorded_at',
    consultations: 'id, &consultation_no, patient_id, doctor_id, date',
    prescriptions: 'id, &prescription_no, patient_id, consultation_id, doctor_id, date',
    prescription_items: 'id, prescription_id, medicine_id',
    appointments: 'id, &appointment_no, patient_id, doctor_id, date, status',
    medicines: 'id, &medicine_code, name, generic, category, active',
    medicine_categories: 'id, name',
    batches: 'id, medicine_id',
    inventory_txns: 'id, batch_id, medicine_id, type, at',
    services: 'id, &service_code, name, type, active',
    bills: 'id, &bill_no, patient_id, date, status, payment_status, uhid',
    bill_items: 'id, bill_id, item_type, ref_id',
    payments: 'id, bill_id, patient_id, at',
    returns: 'id, &return_no, bill_id, at',
    expenses: 'id, &expense_no, category, date',
    notifications: 'id, type, read, at, ref',
    activity_logs: 'id, user_id, action, at',
  });

  const syncedTables = [
    'settings', 'counters', 'patients', 'patient_vitals', 'consultations', 'prescriptions',
    'prescription_items', 'appointments', 'doctors', 'medicines', 'medicine_categories',
    'batches', 'inventory_txns', 'services', 'bills', 'bill_items', 'payments', 'returns',
    'expenses', 'notifications', 'activity_logs',
  ];

  let token = null;
  const recentLocalMutations = new Map();
  const MUTATION_GRACE_PERIOD_MS = 60000;

  const request = async (path, options = {}) => {
    const headers = {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
      'CF-Connecting-IP': ip,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    };
    const res = await fetch(`${BASE}/api${path}`, { ...options, headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  };

  const login = async (password = 'heeva@26') => {
    const res = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    });
    token = res.token;
    return res;
  };

  const remoteNames = {
    settings: 'clinic_settings',
    batches: 'medicine_batches',
    inventory_txns: 'inventory_transactions',
  };
  const remoteName = (tbl) => remoteNames[tbl] || tbl;

  const pushRecord = async (tbl, record) => {
    const rTable = remoteName(tbl);
    const id = tbl === 'counters' ? record.key : tbl === 'settings' ? '1' : record.id;
    recentLocalMutations.set(`${tbl}:${id}`, Date.now());
    await request(`/${rTable}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(record),
    });
  };

  for (const tName of syncedTables) {
    const table = db[tName];
    const add = table.add.bind(table);
    const put = table.put.bind(table);
    const remove = table.delete.bind(table);
    const bulkPut = table.bulkPut.bind(table);
    const bulkDelete = table.bulkDelete.bind(table);

    table._rawBulkPut = bulkPut;
    table._rawBulkDelete = bulkDelete;

    table.add = async (rec, key) => {
      await pushRecord(tName, rec);
      return add(rec, key);
    };
    table.put = async (rec, key) => {
      await pushRecord(tName, rec);
      return put(rec, key);
    };
    table.delete = async (key) => {
      recentLocalMutations.delete(`${tName}:${key}`);
      await request(`/${remoteName(tName)}/${encodeURIComponent(key)}`, { method: 'DELETE' });
      return remove(key);
    };
  }

  let localVersion = 0;
  const sync = async () => {
    const now = Date.now();
    for (const [k, ts] of recentLocalMutations.entries()) {
      if (now - ts > MUTATION_GRACE_PERIOD_MS) recentLocalMutations.delete(k);
    }

    const bundle = await request('/sync/bundle');
    const data = bundle.data;

    for (const tName of syncedTables) {
      if (tName === 'settings') continue;
      const rKey = remoteName(tName);
      const rows = data[rKey] || data[tName];
      if (db[tName] && Array.isArray(rows)) {
        const keyField = tName === 'counters' ? 'key' : 'id';
        const newKeySet = new Set(rows.map((r) => r[keyField]));
        const existingKeys = await db[tName].toCollection().primaryKeys();

        const toDelete = existingKeys.filter((k) => {
          if (newKeySet.has(k)) {
            recentLocalMutations.delete(`${tName}:${k}`);
            return false;
          }
          const mutationTime = recentLocalMutations.get(`${tName}:${k}`);
          if (mutationTime && now - mutationTime < MUTATION_GRACE_PERIOD_MS) {
            return false; // Protect locally mutated record
          }
          return true;
        });

        await db.transaction('rw', [db[tName]], async () => {
          if (rows.length > 0) await db[tName]._rawBulkPut(rows);
          if (toDelete.length > 0) await db[tName]._rawBulkDelete(toDelete);
        });
      }
    }
    localVersion = bundle.version;
    return bundle.version;
  };

  return { name, db, login, sync, request };
}

async function run() {
  console.log('================================================================');
  console.log('HEEVA CLINIC — FULL MEDICINE SYNC & PERSISTENCE ACCEPTANCE TESTS');
  console.log('================================================================\n');

  // Initialize two simulated devices with distinct IP addresses
  const officePC = createDevice('Office PC', '192.168.1.50');
  const homeLaptop = createDevice('Home Laptop', '103.21.244.75');

  await officePC.login();
  await homeLaptop.login();

  // Initial sync on both devices
  await officePC.sync();
  await homeLaptop.sync();
  console.log('✓ Both Office PC and Home Laptop authenticated and synced.\n');

  // -------------------------------------------------------------
  // TEST 1 — OFFICE: Add Medicine A, verify persistence across sync cycles
  // -------------------------------------------------------------
  console.log('--- TEST 1 — OFFICE: Add Medicine A ---');
  const medAId = `med-a-${Date.now()}`;
  const medA = {
    id: medAId,
    medicine_code: `MD-A-${Date.now().toString().slice(-4)}`,
    name: 'Paracetamol 650mg (Office A)',
    generic: 'Paracetamol',
    brand: 'Dolo 650',
    category: 'Analgesic',
    type: 'Tablet',
    strength: '650mg',
    unit: 'strip',
    purchase_price: 15,
    selling_price: 30,
    min_stock: 20,
    location: 'Shelf 1',
    description: 'Added from Office PC',
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Add via Office PC
  await officePC.db.medicines.add(medA);
  console.log(`1. Added ${medA.name} on Office PC.`);

  let foundOnOffice = await officePC.db.medicines.get(medAId);
  assert(foundOnOffice, 'Medicine A must appear immediately in Office PC table');
  console.log('2. Verified: Medicine A appears immediately on Office PC.');

  // Run 10 consecutive sync cycles on Office PC (simulating 60s of background polling)
  console.log('3. Simulating background synchronization cycles on Office PC...');
  for (let cycle = 1; cycle <= 10; cycle++) {
    await officePC.sync();
    foundOnOffice = await officePC.db.medicines.get(medAId);
    assert(foundOnOffice, `CRITICAL ERROR: Medicine A disappeared during background sync cycle #${cycle}!`);
  }
  console.log('4. Verified: Medicine A remained visible across ALL 10 background sync cycles without disappearing!');

  // -------------------------------------------------------------
  // TEST 2 — HOME: Sync Home Laptop, verify Medicine A appears and remains visible
  // -------------------------------------------------------------
  console.log('\n--- TEST 2 — HOME: Synchronizing Home Laptop ---');
  await homeLaptop.sync();
  let foundOnHome = await homeLaptop.db.medicines.get(medAId);
  assert(foundOnHome, 'Medicine A must exist on Home Laptop after sync');
  assert.strictEqual(foundOnHome.name, medA.name);
  console.log(`1. Verified: Home Laptop sees ${foundOnHome.name} (Code: ${foundOnHome.medicine_code}).`);

  // Run multiple sync cycles on Home Laptop
  for (let cycle = 1; cycle <= 5; cycle++) {
    await homeLaptop.sync();
    foundOnHome = await homeLaptop.db.medicines.get(medAId);
    assert(foundOnHome, `Medicine A disappeared from Home Laptop during sync cycle #${cycle}!`);
  }
  console.log('2. Verified: Medicine A remains persistently visible on Home Laptop across repeated syncs.');

  // -------------------------------------------------------------
  // TEST 3 — HOME → OFFICE: Add Medicine B from Home, confirm appears on Office
  // -------------------------------------------------------------
  console.log('\n--- TEST 3 — HOME -> OFFICE: Add Medicine B from Home ---');
  const medBId = `med-b-${Date.now()}`;
  const medB = {
    id: medBId,
    medicine_code: `MD-B-${Date.now().toString().slice(-4)}`,
    name: 'Amoxicillin 500mg (Home B)',
    generic: 'Amoxicillin',
    brand: 'Mox 500',
    category: 'Antibiotic',
    type: 'Capsule',
    strength: '500mg',
    unit: 'strip',
    purchase_price: 40,
    selling_price: 80,
    min_stock: 15,
    location: 'Shelf 3',
    description: 'Added from Home Laptop',
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await homeLaptop.db.medicines.add(medB);
  console.log(`1. Added ${medB.name} from Home Laptop.`);

  foundOnHome = await homeLaptop.db.medicines.get(medBId);
  assert(foundOnHome, 'Medicine B must appear immediately on Home Laptop');

  // Office PC synchronizes
  await officePC.sync();
  foundOnOffice = await officePC.db.medicines.get(medBId);
  assert(foundOnOffice, 'Medicine B added from Home must appear on Office PC after sync');
  console.log(`2. Verified on Office PC: Medicine B (${foundOnOffice.name}) appeared successfully.`);

  // -------------------------------------------------------------
  // TEST 4 — OFFICE → HOME: Add Medicine C from Office, confirm appears on Home
  // -------------------------------------------------------------
  console.log('\n--- TEST 4 — OFFICE -> HOME: Add Medicine C from Office ---');
  const medCId = `med-c-${Date.now()}`;
  const medC = {
    id: medCId,
    medicine_code: `MD-C-${Date.now().toString().slice(-4)}`,
    name: 'Cetirizine 10mg (Office C)',
    generic: 'Cetirizine',
    brand: 'Cetzine',
    category: 'Antihistamine',
    type: 'Tablet',
    strength: '10mg',
    unit: 'strip',
    purchase_price: 8,
    selling_price: 18,
    min_stock: 25,
    location: 'Shelf 2',
    description: 'Added from Office PC',
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await officePC.db.medicines.add(medC);
  console.log(`1. Added ${medC.name} from Office PC.`);

  // Home Laptop synchronizes
  await homeLaptop.sync();
  foundOnHome = await homeLaptop.db.medicines.get(medCId);
  assert(foundOnHome, 'Medicine C added from Office must appear on Home Laptop after sync');
  console.log(`2. Verified on Home Laptop: Medicine C (${foundOnHome.name}) appeared successfully.`);

  // -------------------------------------------------------------
  // TEST 5 — SIMULTANEOUS UPDATES: Office adds Med D, Home adds Med E close together
  // -------------------------------------------------------------
  console.log('\n--- TEST 5 — SIMULTANEOUS UPDATES: Concurrent additions from both devices ---');
  const medDId = `med-d-${Date.now()}`;
  const medD = {
    id: medDId,
    medicine_code: `MD-D-${Date.now().toString().slice(-4)}`,
    name: 'Omeprazole 20mg (Office D)',
    generic: 'Omeprazole',
    brand: 'Omez',
    category: 'Antacid',
    type: 'Capsule',
    strength: '20mg',
    unit: 'strip',
    purchase_price: 22,
    selling_price: 45,
    min_stock: 10,
    location: 'Shelf 4',
    description: 'Simultaneous write from Office',
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const medEId = `med-e-${Date.now()}`;
  const medE = {
    id: medEId,
    medicine_code: `MD-E-${Date.now().toString().slice(-4)}`,
    name: 'Metformin 500mg (Home E)',
    generic: 'Metformin',
    brand: 'Glycomet 500',
    category: 'Diabetes',
    type: 'Tablet',
    strength: '500mg',
    unit: 'strip',
    purchase_price: 12,
    selling_price: 25,
    min_stock: 30,
    location: 'Shelf 5',
    description: 'Simultaneous write from Home',
    active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Launch both writes concurrently
  await Promise.all([
    officePC.db.medicines.add(medD),
    homeLaptop.db.medicines.add(medE),
  ]);
  console.log('1. Concurrently added Medicine D (Office) and Medicine E (Home).');

  // Both devices synchronize
  await Promise.all([
    officePC.sync(),
    homeLaptop.sync(),
  ]);

  const officeHasD = await officePC.db.medicines.get(medDId);
  const officeHasE = await officePC.db.medicines.get(medEId);
  const homeHasD = await homeLaptop.db.medicines.get(medDId);
  const homeHasE = await homeLaptop.db.medicines.get(medEId);

  assert(officeHasD && officeHasE, 'Office PC must have both Medicine D and Medicine E');
  assert(homeHasD && homeHasE, 'Home Laptop must have both Medicine D and Medicine E');
  console.log('2. Verified: Both devices contain both Medicine D AND Medicine E. Neither record disappeared.');

  // -------------------------------------------------------------
  // TEST 6 — FILTER COMPATIBILITY: Active / Inactive / Category / Type / Search
  // -------------------------------------------------------------
  console.log('\n--- TEST 6 — FILTER COMPATIBILITY & ACTIVE STATUS ---');
  const allMeds = await officePC.db.medicines.toArray();

  // Test active filter (new medicines must be active)
  const activeMeds = allMeds.filter((m) => m.active === 1 || m.active === true || m.active === '1');
  assert(activeMeds.some((m) => m.id === medAId), 'Medicine A must pass the Active filter');
  assert(activeMeds.some((m) => m.id === medBId), 'Medicine B must pass the Active filter');
  assert(activeMeds.some((m) => m.id === medCId), 'Medicine C must pass the Active filter');
  console.log('1. Verified: All newly created medicines pass the default Active filter.');

  // Test category filter
  const analgesicMeds = allMeds.filter((m) => m.category === 'Analgesic');
  assert(analgesicMeds.some((m) => m.id === medAId), 'Medicine A must pass category Analgesic filter');
  console.log('2. Verified: Category filter correctly includes newly created medicine.');

  // Test search filter
  const searchResults = allMeds.filter((m) => (m.name || '').toLowerCase().includes('dolo') || (m.generic || '').toLowerCase().includes('paracetamol'));
  assert(searchResults.some((m) => m.id === medAId), 'Medicine A must be found by name/generic search');
  console.log('3. Verified: Search filter correctly finds newly created medicine.');

  // -------------------------------------------------------------
  // TEST 7 — ARCHIVE AND RESTORE
  // -------------------------------------------------------------
  console.log('\n--- TEST 7 — ARCHIVE AND RESTORE ---');
  // Archive Medicine C from Office PC
  await officePC.db.medicines.put({ ...medC, active: 0, updated_at: new Date().toISOString() });
  await officePC.sync();
  await homeLaptop.sync();

  const homeCArchived = await homeLaptop.db.medicines.get(medCId);
  assert.strictEqual(homeCArchived.active, 0, 'Medicine C must be archived on Home Laptop');
  console.log('1. Verified: Medicine C archived and synchronized to Home Laptop (active: 0).');

  // Reactivate Medicine C from Home Laptop
  await homeLaptop.db.medicines.put({ ...homeCArchived, active: 1, updated_at: new Date().toISOString() });
  await homeLaptop.sync();
  await officePC.sync();

  const officeCRestored = await officePC.db.medicines.get(medCId);
  assert.strictEqual(officeCRestored.active, 1, 'Medicine C must be restored on Office PC');
  console.log('2. Verified: Medicine C restored and synchronized to Office PC (active: 1).');

  // -------------------------------------------------------------
  // TEST 8 — DELETE MEDICINE
  // -------------------------------------------------------------
  console.log('\n--- TEST 8 — DELETE MEDICINE ---');
  // Delete Medicine E from Home Laptop
  await homeLaptop.db.medicines.delete(medEId);
  await homeLaptop.sync();
  await officePC.sync();

  const officeEDeleted = await officePC.db.medicines.get(medEId);
  assert.strictEqual(officeEDeleted, undefined, 'Medicine E must be deleted from Office PC');
  console.log('1. Verified: Medicine deletion synchronized correctly across devices.');

  console.log('\n================================================================');
  console.log('🎉 ALL MEDICINE PERSISTENCE & MULTI-DEVICE TESTS PASSED 100%!');
  console.log('================================================================');
}

run().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
