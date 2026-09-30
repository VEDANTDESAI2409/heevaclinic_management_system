import { updateRecord, deleteRecord as deleteRemote, getRecords, getSyncStatus, getSyncBundle } from '../services/api.js';

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
  typeof window !== 'undefined' && (Boolean(globalThis.__FORCE_SYNC__) || !(typeof process !== 'undefined' && process.versions?.node));

export async function pushRecord(name, record) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !record) return;
  const table = remoteName(name);
  const id = name === 'counters' ? record.key : name === 'settings' ? '1' : record.id;
  if (!id && name !== 'settings') return;

  try {
    // Atomic HTTP PUT upsert to central Cloudflare D1 database
    await updateRecord(table, id, record);

    // Broadcast instant sync event to any open tabs on this device
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('heeva_sync');
        bc.postMessage({ type: 'DATA_CHANGED', table: name, id });
        bc.close();
      } catch (_) {}
    }
  } catch (error) {
    console.error(`[remoteSync] Failed to persist ${name}:`, error.message);
    throw new Error('Unable to connect to the clinic server. Please check your internet connection.');
  }
}

export async function deleteRecord(name, id) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !id) return;
  try {
    await deleteRemote(remoteName(name), id);

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('heeva_sync');
        bc.postMessage({ type: 'DATA_DELETED', table: name, id });
        bc.close();
      } catch (_) {}
    }
  } catch (error) {
    // Failsafe: if record was already removed or absent, do not throw
    if (!/404|not found/i.test(error.message)) {
      console.error(`[remoteSync] Failed to delete ${name}:`, error.message);
      throw new Error('Unable to connect to the clinic server. Please check your internet connection.');
    }
  }
}

export async function syncFromBackend(db) {
  if (!isBrowserRuntime()) return null;
  db.__hydrating = true;
  try {
    // 1. Try atomic bundle sync for single round-trip full sync
    let bundle = null;
    try {
      bundle = await getSyncBundle();
    } catch (_) {
      // Fallback to table-by-table sync below
    }

    if (bundle && bundle.ok && bundle.data) {
      const data = bundle.data;

      // Settings
      if (Array.isArray(data.clinic_settings) && data.clinic_settings.length > 0) {
        await db.settings.clear();
        const row = data.clinic_settings[0];
        await db.settings.bulkPut(
          Object.entries(row)
            .filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key))
            .map(([key, value]) => ({ key, value }))
        );
      }

      // Synced tables
      for (const name of syncOrder) {
        if (name === 'settings') continue;
        const remoteKey = remoteName(name);
        const rows = data[remoteKey] || data[name];
        if (db[name] && Array.isArray(rows)) {
          const keyField = name === 'counters' ? 'key' : 'id';
          const newKeySet = new Set(rows.map((r) => r[keyField]));
          const existingKeys = await db[name].toCollection().primaryKeys();
          const toDelete = existingKeys.filter((k) => !newKeySet.has(k));
          if (rows.length > 0) {
            await db[name].bulkPut(rows);
          }
          if (toDelete.length > 0) {
            await db[name].bulkDelete(toDelete);
          }
        }
      }
      return bundle.version;
    }

    // 2. Fallback: table-by-table sync
    for (const name of syncOrder) {
      try {
        const rows = await getRecords(remoteName(name));
        if (name === 'settings') {
          await db.settings.clear();
          const row = rows?.[0];
          if (row) {
            await db.settings.bulkPut(
              Object.entries(row)
                .filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key))
                .map(([key, value]) => ({ key, value }))
            );
          }
          continue;
        }
        if (db[name] && Array.isArray(rows)) {
          const keyField = name === 'counters' ? 'key' : 'id';
          const newKeySet = new Set(rows.map((r) => r[keyField]));
          const existingKeys = await db[name].toCollection().primaryKeys();
          const toDelete = existingKeys.filter((k) => !newKeySet.has(k));
          if (rows.length > 0) {
            await db[name].bulkPut(rows);
          }
          if (toDelete.length > 0) {
            await db[name].bulkDelete(toDelete);
          }
        }
      } catch (tableErr) {
        console.error(`[remoteSync] Error syncing ${name} from D1:`, tableErr?.message || tableErr);
      }
    }
    return null;
  } finally {
    db.__hydrating = false;
  }
}

let currentLocalVersion = 0;
let isSyncing = false;

export async function checkAndSync(db) {
  if (!isBrowserRuntime() || isSyncing) return;
  try {
    const status = await getSyncStatus();
    if (status && status.ok) {
      if (status.version !== currentLocalVersion) {
        isSyncing = true;
        try {
          const newVer = await syncFromBackend(db);
          currentLocalVersion = newVer || status.version;
        } finally {
          isSyncing = false;
        }
      }
    }
  } catch (_) {
    // Network hiccup - ignore in poller
  }
}

export function startRealtimeSync(db, intervalMs = 2500) {
  if (!isBrowserRuntime()) return () => {};

  let bc = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('heeva_sync');
      bc.onmessage = () => {
        checkAndSync(db);
      };
    } catch (_) {}
  }

  // Periodic poll of central database version
  const timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      checkAndSync(db);
    }
  }, intervalMs);

  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      checkAndSync(db);
    }
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisible);
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onVisible);
  }

  return () => {
    clearInterval(timer);
    if (bc) bc.close();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisible);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onVisible);
    }
  };
}

// Backward-compatibility alias
export const syncFromSqlite = syncFromBackend;
