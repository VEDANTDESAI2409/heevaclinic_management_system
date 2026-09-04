// ─── HEEVA CLINIC — reactive client store (Dexie / IndexedDB) ────────────────
// Fast reactive cache for UI components (useLiveQuery hooks).
// All persistent operations are automatically synced to the backend JSON storage.
import Dexie from 'dexie';
import { deleteRecord, pushRecord, syncFromBackend, syncFromSqlite } from './lib/remoteSync';

export const db = new Dexie('heeva_clinic');

db.version(1).stores({
  settings: 'key',
  counters: 'key',
  roles: 'id, &key',
  users: 'id, &username, role',
  doctors: 'id, name',
  patients: 'id, &uhid, name, mobile, created_at, [name+dob]',
  patient_vitals: 'id, patient_id, recorded_at',
  consultations: 'id, &consultation_no, patient_id, doctor_id, date',
  prescriptions: 'id, &prescription_no, patient_id, consultation_id, date',
  prescription_items: 'id, prescription_id, medicine_id',
  appointments: 'id, &appointment_no, patient_id, date, status',
  medicines: 'id, &medicine_code, name, generic, barcode, category, active',
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

// v2: add `time` index on bills (dashboard recent-bills ordering).
db.version(2).stores({
  bills: 'id, &bill_no, patient_id, date, time, status, payment_status, uhid',
});

db.version(3).stores({
  batches: 'id, medicine_id',
  suppliers: null,
  purchases: null,
  purchase_items: null,
});

// v4: re-enable suppliers and purchases tables, index active doctors
db.version(4).stores({
  suppliers: 'id, &supplier_code, name, phone, email, active',
  purchases: 'id, &purchase_no, supplier_id, date, status',
  purchase_items: 'id, purchase_id, medicine_id, batch_id',
  doctors: 'id, name, active',
});

// Keep the existing Dexie API used by the UI while making backend JSON storage persistent.
// The local tables remain a reactive cache for the existing useLiveQuery hooks.
db.transaction = async (_mode, _tables, scope) => scope();
db.__hydrating = false;

const syncedTables = [
  'settings', 'counters', 'patients', 'patient_vitals', 'consultations', 'prescriptions',
  'prescription_items', 'appointments', 'doctors', 'medicines', 'medicine_categories',
  'batches', 'inventory_txns', 'services', 'bills', 'bill_items', 'payments', 'returns',
  'expenses', 'notifications', 'activity_logs',
];

for (const name of syncedTables) {
  const table = db[name];
  const add = table.add.bind(table);
  const put = table.put.bind(table);
  const update = table.update.bind(table);
  const remove = table.delete.bind(table);
  const bulkPut = table.bulkPut.bind(table);
  const clear = table.clear.bind(table);
  const bulkDelete = table.bulkDelete ? table.bulkDelete.bind(table) : null;

  table.add = async (record, key) => {
    if (!db.__hydrating) await pushRecord(name, record);
    return add(record, key);
  };
  table.put = async (record, key) => {
    if (!db.__hydrating) await pushRecord(name, record);
    return put(record, key);
  };
  table.update = async (key, changes) => {
    const existing = await table.get(key);
    if (!existing) return 0;
    const updated = { ...existing, ...changes };
    if (!db.__hydrating) await pushRecord(name, updated);
    return update(key, changes);
  };
  table.delete = async (key) => {
    if (!db.__hydrating) await deleteRecord(name, key);
    return remove(key);
  };
  table.bulkPut = async (records, options) => {
    if (!db.__hydrating) {
      for (const record of records) await pushRecord(name, record);
    }
    return bulkPut(records, options);
  };
  table.clear = async () => {
    const records = await table.toArray();
    if (!db.__hydrating) {
      for (const record of records) await deleteRecord(name, record.id ?? record.key);
    }
    return clear();
  };
  if (bulkDelete) {
    table.bulkDelete = async (keys) => {
      for (const key of keys) await deleteRecord(name, key);
      return bulkDelete(keys);
    };
  }
}

export default db;
export { syncFromBackend, syncFromSqlite };
