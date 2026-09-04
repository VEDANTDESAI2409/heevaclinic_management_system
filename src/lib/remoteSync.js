import { updateRecord, deleteRecord as deleteRemote, getRecords } from '../services/api';

// Ordered logically: settings/counters first, categories before medicines, medicines before batches
const syncOrder = [
  'settings',
  'counters',
  'doctors',
  'patients',
  'patient_vitals',
  'medicine_categories',
  'medicines',
  'batches',
  'inventory_txns',
  'services',
  'consultations',
  'prescriptions',
  'prescription_items',
  'appointments',
  'bills',
  'bill_items',
  'payments',
  'returns',
  'expenses',
  'notifications',
  'activity_logs',
];

const syncedTables = new Set(syncOrder);

const remoteNames = {
  settings: 'clinic_settings',
  batches: 'medicine_batches',
  inventory_txns: 'inventory_transactions',
};

const remoteName = (name) => remoteNames[name] || name;

export const isBrowserRuntime = () =>
  typeof window !== 'undefined' && !(typeof process !== 'undefined' && process.versions?.node);

export async function pushRecord(name, record) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !record) return;
  const table = remoteName(name);
  const id = name === 'counters' ? record.key : name === 'settings' ? '1' : record.id;
  if (!id && name !== 'settings') return;

  try {
    // Atomic HTTP PUT upsert: creates if new, updates if exists. No preliminary 404-inducing GET request.
    await updateRecord(table, id, record);
  } catch (error) {
    console.error(`[remoteSync] Failed to persist ${name}:`, error.message);
  }
}

export async function deleteRecord(name, id) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !id) return;
  try {
    await deleteRemote(remoteName(name), id);
  } catch (error) {
    // Failsafe: if record was already removed or absent, do not throw
    if (!/404|not found/i.test(error.message)) {
      console.error(`[remoteSync] Failed to delete ${name}:`, error.message);
    }
  }
}

export async function syncFromBackend(db) {
  if (!isBrowserRuntime()) return;
  db.__hydrating = true;
  try {
    for (const name of syncOrder) {
      const rows = await getRecords(remoteName(name));
      if (name === 'settings') {
        await db.settings.clear();
        const row = rows[0];
        if (row) {
          await db.settings.bulkPut(
            Object.entries(row)
              .filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key))
              .map(([key, value]) => ({ key, value }))
          );
        }
        continue;
      }
      if (db[name]) {
        await db[name].clear();
        if (rows.length) {
          await db[name].bulkPut(rows);
        }
      }
    }
  } finally {
    db.__hydrating = false;
  }
}

// Backward-compatibility alias
export const syncFromSqlite = syncFromBackend;
