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

// Track recent local mutations (table:id -> timestamp) to protect records from
// being deleted by stale or lagging backend snapshots during background polling.
const recentLocalMutations = new Map();
const MUTATION_GRACE_PERIOD_MS = 60000; // 60-second protection window

export function clearRecentMutationsFor(table) {
  for (const k of recentLocalMutations.keys()) {
    if (k.startsWith(`${table}:`)) {
      recentLocalMutations.delete(k);
    }
  }
}

export async function pushRecord(name, record) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !record) return;
  const table = remoteName(name);
  const id = name === 'counters' ? record.key : name === 'settings' ? '1' : record.id;
  if (!id && name !== 'settings') return;

  // Record mutation timestamp to protect against stale deletion during in-flight & post-save sync
  recentLocalMutations.set(`${name}:${id}`, Date.now());

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
  recentLocalMutations.delete(`${name}:${id}`);
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

let backoffUntil = 0;
let backoffDelay = 5000;
let lastSyncTimestamp = 0;

export async function syncFromBackend(db) {
  if (!isBrowserRuntime()) return null;
  db.__hydrating = true;
  try {
    const now = Date.now();
    for (const [k, ts] of recentLocalMutations.entries()) {
      if (now - ts > MUTATION_GRACE_PERIOD_MS) recentLocalMutations.delete(k);
    }

    let bundle = null;
    try {
      bundle = await getSyncBundle();
    } catch (err) {
      if (err?.status === 429 || err?.isRateLimit) {
        backoffUntil = Date.now() + 15000;
        console.warn('[remoteSync] Backend busy (429), pausing sync for 15s');
      }
      return null;
    }

    if (bundle && bundle.ok && bundle.data) {
      const data = bundle.data;

      // Settings
      if (Array.isArray(data.clinic_settings) && data.clinic_settings.length > 0) {
        const row = data.clinic_settings[0];
        const entries = Object.entries(row)
          .filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key))
          .map(([key, value]) => ({ key, value }));
        await db.transaction('rw', [db.settings], async () => {
          await (db.settings._rawClear ? db.settings._rawClear() : db.settings.clear());
          await (db.settings._rawBulkPut ? db.settings._rawBulkPut(entries) : db.settings.bulkPut(entries));
        });
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

          // Check if table was cleared intentionally on the server
          const clearedRow = data.counters?.find((c) => c.key === `CLEARED|${remoteKey}` || c.key === `CLEARED|${name}`);
          const isTableCleared = Boolean(clearedRow);

          // Only delete local records if server returned records (protecting against corrupt/empty responses)
          // and the record is not in recentLocalMutations grace window (unless explicitly cleared)
          const toDelete = existingKeys.filter((k) => {
            if (newKeySet.has(k)) {
              return false;
            }
            const mutationTime = recentLocalMutations.get(`${name}:${k}`);
            if (mutationTime && now - mutationTime < MUTATION_GRACE_PERIOD_MS) {
              return false; // Protect locally added/updated record from disappearing
            }
            // Do not wipe out local records if remote rows array is unexpectedly empty but local has records (unless intentionally cleared)
            if (rows.length === 0 && existingKeys.length > 0 && !isTableCleared) {
              return false;
            }
            return true;
          });

          // Apply atomically per table
          await db.transaction('rw', [db[name]], async () => {
            if (rows.length > 0) {
              await (db[name]._rawBulkPut ? db[name]._rawBulkPut(rows) : db[name].bulkPut(rows));
            }
            if (toDelete.length > 0) {
              await (db[name]._rawBulkDelete ? db[name]._rawBulkDelete(toDelete) : db[name].bulkDelete(toDelete));
            }
          });
        }
      }
      currentLocalVersion = bundle.version;
      backoffDelay = 5000;
      lastSyncTimestamp = Date.now();
      return bundle.version;
    }

    return null;
  } finally {
    db.__hydrating = false;
  }
}

let currentLocalVersion = 0;
let isSyncing = false;
let syncQueued = false;

export async function checkAndSync(db) {
  if (!isBrowserRuntime()) return;
  if (Date.now() < backoffUntil) return;
  if (isSyncing) {
    syncQueued = true;
    return;
  }
  isSyncing = true;
  try {
    const status = await getSyncStatus();
    if (status && status.ok) {
      if (status.version !== currentLocalVersion) {
        const newVer = await syncFromBackend(db);
        currentLocalVersion = newVer || status.version;
      }
      backoffDelay = 5000;
    }
  } catch (err) {
    if (err?.status === 429 || err?.isRateLimit) {
      backoffUntil = Date.now() + 15000;
      console.warn('[remoteSync] Rate limit received in status check, backing off for 15s');
    }
  } finally {
    isSyncing = false;
    if (syncQueued) {
      syncQueued = false;
      if (Date.now() >= backoffUntil) {
        checkAndSync(db);
      }
    }
  }
}

export function startRealtimeSync(db, intervalMs = 12000) {
  if (!isBrowserRuntime()) return () => {};

  let bc = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      bc = new BroadcastChannel('heeva_sync');
      bc.onmessage = () => {
        if (Date.now() - lastSyncTimestamp > 1500) {
          checkAndSync(db);
        }
      };
    } catch (_) {}
  }

  // Periodic poll of central database version (safe 12s default)
  const timer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      checkAndSync(db);
    }
  }, intervalMs);

  const onVisible = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      if (Date.now() - lastSyncTimestamp > 3000) {
        checkAndSync(db);
      }
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
