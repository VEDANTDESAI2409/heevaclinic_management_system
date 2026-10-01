var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/services/api.js
async function executeFetch(url, fetchOptions, attempt = 0) {
  let response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    if (typeof window !== "undefined" && !(typeof process !== "undefined" && process.versions?.node)) {
      console.error("[API] network error", error);
    }
    throw new Error("Unable to connect to the clinic server. Please check your internet connection.");
  }
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("heeva:unauthorized", { detail: { url } }));
    }
  }
  if (response.status === 429) {
    const isIdempotent = !fetchOptions.method || ["GET", "PUT", "DELETE"].includes(fetchOptions.method);
    if (isIdempotent && attempt < 2) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const waitMs = retryAfterHeader ? Math.min(5e3, Math.max(1e3, parseInt(retryAfterHeader, 10) * 1e3)) : Math.min(4e3, (attempt + 1) * 1200 + Math.random() * 500);
      await delay(waitMs);
      return executeFetch(url, fetchOptions, attempt + 1);
    }
    const body = await response.json().catch(() => ({}));
    const message = body.error || "Server is currently handling high traffic. Please wait a moment.";
    const err = new Error(message);
    err.status = 429;
    err.isRateLimit = true;
    throw err;
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    let message = body.error;
    if (!message) {
      if (response.status === 500) {
        message = "Server error. Please try again.";
      } else if (response.status === 502 || response.status === 503 || response.status === 504) {
        message = "Database temporarily unavailable.";
      } else {
        message = `Request failed (${response.status})`;
      }
    }
    if (response.status !== 404) {
      console.error("[API]", url, message);
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response;
}
async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const base = getBaseUrl();
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...token ? { Authorization: `Bearer ${token}` } : {},
    ...options.headers || {}
  };
  const fetchOptions = {
    ...options,
    method,
    headers,
    cache: "no-store"
    // Always bypass HTTP disk/memory cache for dynamic clinic data
  };
  const url = `${base}${path}`;
  if (isGet) {
    if (inFlightGets.has(url)) {
      return inFlightGets.get(url);
    }
    const promise = (async () => {
      try {
        const response2 = await executeFetch(url, fetchOptions);
        return response2.status === 204 ? null : response2.json();
      } finally {
        inFlightGets.delete(url);
      }
    })();
    inFlightGets.set(url, promise);
    return promise;
  }
  const response = await executeFetch(url, fetchOptions);
  return response.status === 204 ? null : response.json();
}
var TOKEN_KEY, getAuthToken, getBaseUrl, inFlightGets, delay, createRecord, updateRecord, deleteRecord, createPatient, clearPatients, getSyncBundle;
var init_api = __esm({
  "src/services/api.js"() {
    TOKEN_KEY = "heeva_auth_token";
    getAuthToken = () => {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(TOKEN_KEY);
      }
      return null;
    };
    getBaseUrl = () => {
      if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) {
        return import.meta.env.VITE_API_URL.replace(/\/+$/, "") + "/api";
      }
      if (typeof process !== "undefined" && process.versions?.node) {
        const port = process.env?.WORKER_PORT || process.env?.PORT || 8787;
        return `http://127.0.0.1:${port}/api`;
      }
      if (typeof window !== "undefined" && window.location?.origin) {
        return "/api";
      }
      return "http://127.0.0.1:8787/api";
    };
    if (typeof window !== "undefined" && "caches" in window) {
      window.caches.keys().then((keys) => {
        keys.forEach((k) => {
          window.caches.open(k).then((cache) => {
            cache.keys().then((requests) => {
              requests.forEach((req) => {
                try {
                  if (new URL(req.url).pathname.startsWith("/api")) {
                    cache.delete(req);
                  }
                } catch (_) {
                }
              });
            });
          });
        });
      }).catch(() => {
      });
    }
    inFlightGets = /* @__PURE__ */ new Map();
    delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    createRecord = (table, record) => request(`/${table}`, { method: "POST", body: JSON.stringify(record) });
    updateRecord = (table, id, patch) => request(`/${table}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
    deleteRecord = (table, id) => request(`/${table}/${encodeURIComponent(id)}`, { method: "DELETE" });
    createPatient = (patient) => createRecord("patients", patient);
    clearPatients = (confirmation = "DELETE PATIENTS") => request("/patients/clear", { method: "POST", body: JSON.stringify({ confirmation }) });
    getSyncBundle = () => request("/sync/bundle");
  }
});

// src/lib/remoteSync.js
function clearRecentMutationsFor(table) {
  for (const k of recentLocalMutations.keys()) {
    if (k.startsWith(`${table}:`)) {
      recentLocalMutations.delete(k);
    }
  }
}
async function pushRecord(name, record) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !record) return;
  const table = remoteName(name);
  const id = name === "counters" ? record.key : name === "settings" ? "1" : record.id;
  if (!id && name !== "settings") return;
  recentLocalMutations.set(`${name}:${id}`, Date.now());
  try {
    await updateRecord(table, id, record);
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const bc = new BroadcastChannel("heeva_sync");
        bc.postMessage({ type: "DATA_CHANGED", table: name, id });
        bc.close();
      } catch (_) {
      }
    }
  } catch (error) {
    console.error(`[remoteSync] Failed to persist ${name}:`, error.message);
    throw new Error("Unable to connect to the clinic server. Please check your internet connection.");
  }
}
async function deleteRecord2(name, id) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !id) return;
  recentLocalMutations.delete(`${name}:${id}`);
  try {
    await deleteRecord(remoteName(name), id);
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const bc = new BroadcastChannel("heeva_sync");
        bc.postMessage({ type: "DATA_DELETED", table: name, id });
        bc.close();
      } catch (_) {
      }
    }
  } catch (error) {
    if (!/404|not found/i.test(error.message)) {
      console.error(`[remoteSync] Failed to delete ${name}:`, error.message);
      throw new Error("Unable to connect to the clinic server. Please check your internet connection.");
    }
  }
}
async function syncFromBackend(db3) {
  if (!isBrowserRuntime()) return null;
  db3.__hydrating = true;
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
        backoffUntil = Date.now() + 15e3;
        console.warn("[remoteSync] Backend busy (429), pausing sync for 15s");
      }
      return null;
    }
    if (bundle && bundle.ok && bundle.data) {
      const data = bundle.data;
      if (Array.isArray(data.clinic_settings) && data.clinic_settings.length > 0) {
        const row = data.clinic_settings[0];
        const entries = Object.entries(row).filter(([key]) => !["id", "created_at", "updated_at"].includes(key)).map(([key, value]) => ({ key, value }));
        await db3.transaction("rw", [db3.settings], async () => {
          await (db3.settings._rawClear ? db3.settings._rawClear() : db3.settings.clear());
          await (db3.settings._rawBulkPut ? db3.settings._rawBulkPut(entries) : db3.settings.bulkPut(entries));
        });
      }
      for (const name of syncOrder) {
        if (name === "settings") continue;
        const remoteKey = remoteName(name);
        const rows = data[remoteKey] || data[name];
        if (db3[name] && Array.isArray(rows)) {
          const keyField = name === "counters" ? "key" : "id";
          const newKeySet = new Set(rows.map((r) => r[keyField]));
          const existingKeys = await db3[name].toCollection().primaryKeys();
          const clearedRow = data.counters?.find((c) => c.key === `CLEARED|${remoteKey}` || c.key === `CLEARED|${name}`);
          const isTableCleared = Boolean(clearedRow);
          const toDelete = existingKeys.filter((k) => {
            if (newKeySet.has(k)) {
              return false;
            }
            const mutationTime = recentLocalMutations.get(`${name}:${k}`);
            if (mutationTime && now - mutationTime < MUTATION_GRACE_PERIOD_MS) {
              return false;
            }
            if (rows.length === 0 && existingKeys.length > 0 && !isTableCleared) {
              return false;
            }
            return true;
          });
          await db3.transaction("rw", [db3[name]], async () => {
            if (rows.length > 0) {
              await (db3[name]._rawBulkPut ? db3[name]._rawBulkPut(rows) : db3[name].bulkPut(rows));
            }
            if (toDelete.length > 0) {
              await (db3[name]._rawBulkDelete ? db3[name]._rawBulkDelete(toDelete) : db3[name].bulkDelete(toDelete));
            }
          });
        }
      }
      currentLocalVersion = bundle.version;
      backoffDelay = 5e3;
      lastSyncTimestamp = Date.now();
      return bundle.version;
    }
    return null;
  } finally {
    db3.__hydrating = false;
  }
}
var syncOrder, syncedTables, remoteNames, remoteName, isBrowserRuntime, recentLocalMutations, MUTATION_GRACE_PERIOD_MS, backoffUntil, backoffDelay, lastSyncTimestamp, currentLocalVersion, syncFromSqlite;
var init_remoteSync = __esm({
  "src/lib/remoteSync.js"() {
    init_api();
    syncOrder = [
      "settings",
      "counters",
      "doctors",
      "patients",
      "patient_vitals",
      "medicine_categories",
      "medicines",
      "batches",
      "inventory_txns",
      "services",
      "consultations",
      "prescriptions",
      "prescription_items",
      "appointments",
      "bills",
      "bill_items",
      "payments",
      "returns",
      "expenses",
      "notifications",
      "activity_logs"
    ];
    syncedTables = new Set(syncOrder);
    remoteNames = {
      settings: "clinic_settings",
      batches: "medicine_batches",
      inventory_txns: "inventory_transactions"
    };
    remoteName = (name) => remoteNames[name] || name;
    isBrowserRuntime = () => typeof window !== "undefined" && (Boolean(globalThis.__FORCE_SYNC__) || !(typeof process !== "undefined" && process.versions?.node));
    recentLocalMutations = /* @__PURE__ */ new Map();
    MUTATION_GRACE_PERIOD_MS = 6e4;
    backoffUntil = 0;
    backoffDelay = 5e3;
    lastSyncTimestamp = 0;
    currentLocalVersion = 0;
    syncFromSqlite = syncFromBackend;
  }
});

// src/db.js
var db_exports = {};
__export(db_exports, {
  db: () => db,
  default: () => db_default,
  syncFromBackend: () => syncFromBackend,
  syncFromSqlite: () => syncFromSqlite
});
import Dexie from "dexie";
var db, syncedTables2, db_default;
var init_db = __esm({
  "src/db.js"() {
    init_remoteSync();
    db = new Dexie("heeva_clinic");
    db.version(1).stores({
      settings: "key",
      counters: "key",
      roles: "id, &key",
      users: "id, &username, role",
      doctors: "id, name",
      patients: "id, &uhid, name, mobile, created_at, [name+dob]",
      patient_vitals: "id, patient_id, recorded_at",
      consultations: "id, &consultation_no, patient_id, doctor_id, date",
      prescriptions: "id, &prescription_no, patient_id, consultation_id, doctor_id, date",
      prescription_items: "id, prescription_id, medicine_id",
      appointments: "id, &appointment_no, patient_id, doctor_id, date, status",
      medicines: "id, &medicine_code, name, generic, category, active",
      medicine_categories: "id, name",
      batches: "id, medicine_id",
      inventory_txns: "id, batch_id, medicine_id, type, at",
      services: "id, &service_code, name, type, active",
      bills: "id, &bill_no, patient_id, date, status, payment_status, uhid",
      bill_items: "id, bill_id, item_type, ref_id",
      payments: "id, bill_id, patient_id, at",
      returns: "id, &return_no, bill_id, at",
      expenses: "id, &expense_no, category, date",
      notifications: "id, type, read, at, ref",
      activity_logs: "id, user_id, action, at"
    });
    db.version(2).stores({
      bills: "id, &bill_no, patient_id, date, time, status, payment_status, uhid"
    });
    db.version(3).stores({
      batches: "id, medicine_id",
      suppliers: null,
      purchases: null,
      purchase_items: null
    });
    db.version(4).stores({
      suppliers: "id, &supplier_code, name, phone, email, active",
      purchases: "id, &purchase_no, supplier_id, date, status",
      purchase_items: "id, purchase_id, medicine_id, batch_id",
      doctors: "id, name, active"
    });
    db.version(5).stores({
      patients: "id, &uhid, name, mobile, created_at, [name+age]",
      medicines: "id, &medicine_code, name, generic, category, active"
    });
    db.version(6).stores({
      appointments: "id, &appointment_no, patient_id, doctor_id, date, status",
      prescriptions: "id, &prescription_no, patient_id, consultation_id, doctor_id, date"
    });
    db.version(7).stores({
      patients: "id, uhid, name, mobile, created_at, [name+age]",
      medicines: "id, medicine_code, name, generic, category, active",
      services: "id, service_code, name, type, active",
      consultations: "id, consultation_no, patient_id, doctor_id, date",
      prescriptions: "id, prescription_no, patient_id, consultation_id, doctor_id, date",
      appointments: "id, appointment_no, patient_id, doctor_id, date, status",
      bills: "id, bill_no, patient_id, date, time, status, payment_status, uhid",
      returns: "id, return_no, bill_id, at",
      expenses: "id, expense_no, category, date",
      suppliers: "id, supplier_code, name, phone, email, active",
      purchases: "id, purchase_no, supplier_id, date, status",
      roles: "id, key",
      users: "id, username, role"
    });
    if (typeof window !== "undefined") {
      db.on("versionchange", () => {
        try {
          db.close();
        } catch (_) {
        }
      });
    }
    db.transaction = async (_mode, _tables, scope) => scope();
    db.__hydrating = false;
    syncedTables2 = [
      "settings",
      "counters",
      "patients",
      "patient_vitals",
      "consultations",
      "prescriptions",
      "prescription_items",
      "appointments",
      "doctors",
      "medicines",
      "medicine_categories",
      "batches",
      "inventory_txns",
      "services",
      "bills",
      "bill_items",
      "payments",
      "returns",
      "expenses",
      "notifications",
      "activity_logs"
    ];
    for (const name of syncedTables2) {
      const table = db[name];
      const put = table.put.bind(table);
      const update = table.update.bind(table);
      const remove = table.delete.bind(table);
      const bulkPut = table.bulkPut.bind(table);
      const clear = table.clear.bind(table);
      const bulkDelete = table.bulkDelete ? table.bulkDelete.bind(table) : null;
      const safePut = async (record, key) => {
        try {
          return await put(record, key);
        } catch (err) {
          if (err?.name === "ConstraintError" || /key already exists/i.test(err?.message || "")) {
            return record.id || key;
          }
          throw err;
        }
      };
      const safeBulkPut = async (records, options) => {
        try {
          return await bulkPut(records, options);
        } catch (err) {
          if (err?.name === "ConstraintError" || err?.name === "BulkError" || /key already exists/i.test(err?.message || "")) {
            for (const record of records) {
              try {
                await put(record);
              } catch (_) {
              }
            }
            return records.length;
          }
          throw err;
        }
      };
      table._rawAdd = safePut;
      table._rawPut = safePut;
      table._rawUpdate = update;
      table._rawDelete = remove;
      table._rawBulkPut = safeBulkPut;
      table._rawClear = clear;
      if (bulkDelete) table._rawBulkDelete = bulkDelete;
      table.add = async (record, key) => {
        if (db.__hydrating) return safePut(record, key);
        await pushRecord(name, record);
        return safePut(record, key);
      };
      table.put = async (record, key) => {
        if (db.__hydrating) return safePut(record, key);
        await pushRecord(name, record);
        return safePut(record, key);
      };
      table.update = async (key, changes) => {
        if (db.__hydrating) return update(key, changes);
        const existing = await table.get(key);
        if (!existing) return 0;
        const updated = { ...existing, ...changes };
        await pushRecord(name, updated);
        return update(key, changes);
      };
      table.delete = async (key) => {
        if (db.__hydrating) return remove(key);
        await deleteRecord2(name, key);
        return remove(key);
      };
      table.bulkPut = async (records, options) => {
        if (db.__hydrating) return safeBulkPut(records, options);
        for (const record of records) await pushRecord(name, record);
        return safeBulkPut(records, options);
      };
      table.clear = async () => {
        if (db.__hydrating) return clear();
        const records = await table.toArray();
        for (const record of records) await deleteRecord2(name, record.id ?? record.key);
        return clear();
      };
      if (bulkDelete) {
        table.bulkDelete = async (keys) => {
          if (db.__hydrating) return bulkDelete(keys);
          for (const key of keys) await deleteRecord2(name, key);
          return bulkDelete(keys);
        };
      }
    }
    db_default = db;
  }
});

// src/utils.js
function uid() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) {
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}
function dkey(d = /* @__PURE__ */ new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = /* @__PURE__ */ new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || m === 0 && now.getDate() < d.getDate()) age--;
  return age < 0 ? null : age;
}
var p2, nowISO;
var init_utils = __esm({
  "src/utils.js"() {
    p2 = (n) => String(n).padStart(2, "0");
    nowISO = () => (/* @__PURE__ */ new Date()).toISOString();
  }
});

// src/services/core.js
var core_exports = {};
__export(core_exports, {
  DEFAULT_PERMISSIONS: () => DEFAULT_PERMISSIONS,
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  SECTIONS: () => SECTIONS,
  audit: () => audit,
  getSettings: () => getSettings,
  makeCode: () => makeCode,
  makeNo: () => makeNo,
  makeUHID: () => makeUHID,
  nextCounter: () => nextCounter,
  round2: () => round2,
  saveSettings: () => saveSettings
});
async function getSettings() {
  const rows = await db_default.settings.toArray();
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}
async function saveSettings(patch, userId) {
  await db_default.transaction("rw", [db_default.settings, db_default.activity_logs], async () => {
    for (const [k, v] of Object.entries(patch)) await db_default.settings.put({ key: k, value: v });
    if (userId) await audit(userId, "SETTINGS_UPDATE", "settings", null, Object.keys(patch).join(", "));
  });
}
function audit(userId, action, entity, entityId, detail = "") {
  return db_default.activity_logs.add({
    id: uid(),
    user_id: userId || null,
    user_name: globalThis.__heevaUser && globalThis.__heevaUser.name || "system",
    action,
    entity,
    entity_id: entityId || null,
    at: nowISO(),
    detail
  });
}
async function nextCounter(key, start = 1) {
  const row = await db_default.counters.get(key);
  const current = row && row.value != null ? Number(row.value) : 0;
  const next = Math.max(current + 1, start);
  await db_default.counters.put({ key, value: next });
  return next;
}
async function makeUHID(settings) {
  const s = settings || await getSettings();
  const prefix = (s.uhid_prefix || "HC").trim().toUpperCase();
  const key = "UHID|SEQUENCE";
  let start = 1001;
  try {
    if (db_default.patients) {
      const records = await db_default.patients.toArray();
      let maxSuffix = 0;
      for (const p of records) {
        const uhid = String(p.uhid || "");
        const match = uhid.match(/^[A-Za-z]+-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
        }
      }
      if (maxSuffix >= start) start = maxSuffix + 1;
    }
  } catch (_) {
  }
  const n = await nextCounter(key, start);
  try {
    await db_default.counters.put({ key: "UHID|ALL", value: n });
  } catch (_) {
  }
  return `${prefix}-${n}`;
}
async function makeNo(kind, prefix, year = (/* @__PURE__ */ new Date()).getFullYear(), padding = 6, start = 1) {
  let effectiveStart = start;
  try {
    let tbl = null;
    let field = null;
    if (kind === "BILL") {
      tbl = db_default.bills;
      field = "bill_no";
    } else if (kind === "APT") {
      tbl = db_default.appointments;
      field = "appointment_no";
    } else if (kind === "CNS") {
      tbl = db_default.consultations;
      field = "consultation_no";
    } else if (kind === "RX") {
      tbl = db_default.prescriptions;
      field = "prescription_no";
    } else if (kind === "RET") {
      tbl = db_default.returns;
      field = "return_no";
    } else if (kind === "EXP") {
      tbl = db_default.expenses;
      field = "expense_no";
    }
    if (tbl && field) {
      const records = await tbl.toArray();
      let maxSuffix = 0;
      for (const r of records) {
        const val = String(r[field] || "");
        if (val.includes(String(year))) {
          const m = val.match(/(\d+)$/);
          if (m) {
            const num = parseInt(m[1], 10);
            if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
          }
        }
      }
      if (maxSuffix >= effectiveStart) effectiveStart = maxSuffix + 1;
    }
  } catch (_) {
  }
  const n = await nextCounter(`${kind}|${year}`, effectiveStart);
  return `${prefix}-${year}-${String(n).padStart(padding, "0")}`;
}
async function makeCode(kind, prefix, padding = 4, start = 1) {
  let effectiveStart = start;
  try {
    if (kind === "MED" && db_default.medicines) {
      const records = await db_default.medicines.toArray();
      let maxSuffix = 0;
      for (const r of records) {
        const m = String(r.medicine_code || "").match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
        }
      }
      if (maxSuffix >= effectiveStart) effectiveStart = maxSuffix + 1;
    } else if (kind === "SVC" && db_default.services) {
      const records = await db_default.services.toArray();
      let maxSuffix = 0;
      for (const r of records) {
        const m = String(r.service_code || "").match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
        }
      }
      if (maxSuffix >= effectiveStart) effectiveStart = maxSuffix + 1;
    }
  } catch (_) {
  }
  const n = await nextCounter(`${kind}|ALL`, effectiveStart);
  return `${prefix}-${String(n).padStart(padding, "0")}`;
}
var SECTIONS, DEFAULT_PERMISSIONS, DEFAULT_SETTINGS, round2;
var init_core = __esm({
  "src/services/core.js"() {
    init_db();
    init_utils();
    SECTIONS = [
      { key: "dashboard", label: "Dashboard" },
      { key: "patients", label: "Patients" },
      { key: "consultations", label: "Consultations" },
      { key: "appointments", label: "Appointments" },
      { key: "prescriptions", label: "Prescriptions" },
      { key: "billing", label: "Billing" },
      { key: "payments", label: "Payments" },
      { key: "medicines", label: "Medicines" },
      { key: "inventory", label: "Inventory" },
      { key: "returns", label: "Returns" },
      { key: "expenses", label: "Expenses" },
      { key: "reports", label: "Reports" },
      { key: "alerts", label: "Alerts" },
      { key: "staff", label: "Staff & Users" },
      { key: "settings", label: "Settings" }
    ];
    DEFAULT_PERMISSIONS = { admin: SECTIONS.map((s) => s.key) };
    DEFAULT_SETTINGS = {
      clinic_name: "HEEVA CLINIC",
      tagline: "Trusted care, every time.",
      doctor_name: "Dr. Mit Nayak",
      doctor_phone: "9913974000",
      doctor_qual: "M.B.B.S., M.D.",
      doctor_role: "Consulting Physician",
      address: "A/8, MONARCH, Pal Gam, Surat, Gujarat \u2013 394510",
      phone: "9913974000",
      email: "",
      logo: "/icons/heeva-logo.png",
      receipt_footer: "Thank you for choosing Heeva Clinic.",
      currency: "\u20B9",
      bill_prefix: "HC-BILL",
      bill_padding: 6,
      default_payment: "Cash",
      uhid_prefix: "HC",
      uhid_include_year: false,
      uhid_padding: 4,
      uhid_start: 1001,
      low_stock_default: 10,
      expiry_30: 30,
      expiry_60: 60,
      expiry_90: 90,
      fefo: true,
      theme: "light",
      lang: "en",
      seeded: ""
    };
    round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  }
});

// src/services/patients.js
var patients_exports = {};
__export(patients_exports, {
  VITAL_FIELDS: () => VITAL_FIELDS,
  addVitals: () => addVitals,
  ageOf: () => ageOf,
  archivePatient: () => archivePatient,
  clearAllPatients: () => clearAllPatients,
  deletePatient: () => deletePatient,
  patientVisits: () => patientVisits,
  reactivatePatient: () => reactivatePatient,
  registerPatient: () => registerPatient,
  updatePatient: () => updatePatient
});
async function registerPatient(data, userId, { temp = false } = {}) {
  const settings = await getSettings();
  const name = String(data.name || "").trim();
  const mobile = digits(data.mobile);
  const age = data.age != null && data.age !== "" ? Number(data.age) : data.dob ? ageFromDob(data.dob) : null;
  if (!name || name.length < 3) throw new Error("Full name is required");
  if (age == null || isNaN(age) || age < 0 || age > 125) throw new Error("Valid age (0\u2013125) is required");
  if (!data.gender) throw new Error("Gender is required");
  if (mobile.length !== 10) throw new Error("Enter a valid 10-digit mobile number");
  const gender = data.gender === "Male" ? "M" : data.gender === "Female" ? "F" : data.gender;
  const now = nowISO();
  const createdAt = data.created_at || now;
  const regDate = data.reg_date || dkey(new Date(createdAt));
  const patientPayload = {
    id: data.id || uid(),
    name,
    age,
    gender,
    marital_status: data.marital_status || "Single",
    mobile,
    address: data.address || "",
    pin: String(data.pin || ""),
    blood_group: data.blood_group || "",
    allergies: data.allergies || "",
    conditions: data.conditions || "",
    current_meds: data.current_meds || "",
    notes: data.notes || "",
    active: 1,
    reg_date: regDate,
    created_at: createdAt,
    created_by: userId || null
  };
  if (isBrowserRuntime()) {
    try {
      const serverPatient = await createPatient(patientPayload);
      if (serverPatient && serverPatient.uhid) {
        const prevHydrating = db_default.__hydrating;
        db_default.__hydrating = true;
        try {
          await db_default.patients.put(serverPatient);
          const match = serverPatient.uhid.match(/^[A-Za-z]+-(\d+)$/);
          if (match) {
            const val = Number(match[1]);
            await db_default.counters.put({ key: "UHID|SEQUENCE", value: val });
            await db_default.counters.put({ key: "UHID|ALL", value: val });
          }
        } finally {
          db_default.__hydrating = prevHydrating;
        }
        await audit(userId, "PATIENT_CREATE", "patient", serverPatient.id, `${serverPatient.name} \xB7 ${serverPatient.uhid}`);
        return serverPatient;
      }
    } catch (err) {
      console.error("[registerPatient] Server allocation failed or offline:", err.message);
      throw new Error(err.message || "Unable to connect to the clinic server. Please check your internet connection.");
    }
  }
  return db_default.transaction("rw", [db_default.patients, db_default.counters, db_default.activity_logs], async () => {
    const uhid = await makeUHID(settings);
    if (await db_default.patients.where("uhid").equals(uhid).count()) throw new Error("UHID collision detected \u2014 please retry");
    const p = {
      ...patientPayload,
      uhid
    };
    await db_default.patients.add(p);
    await audit(userId, "PATIENT_CREATE", "patient", p.id, `${p.name} \xB7 ${p.uhid}`);
    return p;
  });
}
async function updatePatient(id, patch, userId) {
  return db_default.transaction("rw", [db_default.patients, db_default.activity_logs], async () => {
    const p = await db_default.patients.get(id);
    if (!p) throw new Error("Patient not found");
    const { uhid: _uhid, id: _id, ...safe } = patch;
    const updated = { ...p, ...safe, id: p.id, uhid: p.uhid };
    await db_default.patients.put(updated);
    await audit(userId, "PATIENT_UPDATE", "patient", id, Object.keys(safe).join(", "));
    return updated;
  });
}
async function archivePatient(id, userId) {
  return db_default.transaction("rw", [db_default.patients, db_default.activity_logs], async () => {
    const p = await db_default.patients.get(id);
    if (!p) throw new Error("Patient not found");
    const newActive = p.active === 0 ? 1 : 0;
    const updated = { ...p, active: newActive };
    await db_default.patients.put(updated);
    await audit(userId, newActive ? "PATIENT_REACTIVATE" : "PATIENT_ARCHIVE", "patient", id, `${p.name} \xB7 ${p.uhid}`);
    return updated;
  });
}
async function reactivatePatient(id, userId) {
  return db_default.transaction("rw", [db_default.patients, db_default.activity_logs], async () => {
    const p = await db_default.patients.get(id);
    if (!p) throw new Error("Patient not found");
    const updated = { ...p, active: 1 };
    await db_default.patients.put(updated);
    await audit(userId, "PATIENT_REACTIVATE", "patient", id, `${p.name} \xB7 ${p.uhid}`);
    return updated;
  });
}
async function deletePatient(id, userId) {
  return db_default.transaction("rw", [db_default.patients, db_default.counters, db_default.consultations, db_default.bills, db_default.prescriptions, db_default.appointments, db_default.patient_vitals, db_default.activity_logs], async () => {
    const p = await db_default.patients.get(id);
    if (!p) throw new Error("Patient not found");
    const [cCount, bCount, prCount, aCount, vCount] = await Promise.all([
      db_default.consultations.where("patient_id").equals(id).count(),
      db_default.bills.where("patient_id").equals(id).count(),
      db_default.prescriptions.where("patient_id").equals(id).count(),
      db_default.appointments.where("patient_id").equals(id).count(),
      db_default.patient_vitals.where("patient_id").equals(id).count()
    ]);
    if (cCount > 0 || bCount > 0 || prCount > 0 || aCount > 0 || vCount > 0) {
      throw new Error("This patient has clinical, billing or appointment history and cannot be permanently deleted. Archive the patient instead.");
    }
    await db_default.patients.delete(id);
    await audit(userId, "PATIENT_DELETE", "patient", id, `${p.name} \xB7 ${p.uhid}`);
  });
}
async function clearAllPatients(userId) {
  if (isBrowserRuntime()) {
    try {
      await clearPatients("DELETE PATIENTS");
    } catch (err) {
      console.error("[clearAllPatients] Server clear failed:", err.message);
      throw new Error(err.message || "Unable to connect to the clinic server. Please check your internet connection.");
    }
  }
  return db_default.transaction("rw", [db_default.patients, db_default.patient_vitals, db_default.counters, db_default.activity_logs], async () => {
    await db_default.counters.put({ key: "UHID|SEQUENCE", value: 1e3 });
    await db_default.counters.put({ key: "UHID|ALL", value: 1e3 });
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    await db_default.counters.put({ key: `UHID|${year}`, value: 0 });
    clearRecentMutationsFor("patients");
    clearRecentMutationsFor("patient_vitals");
    await db_default.patient_vitals.clear();
    await db_default.patients.clear();
    await audit(userId, "PATIENT_CLEAR_ALL", "patient", "all", "Permanently cleared all patient records");
    if (typeof BroadcastChannel !== "undefined") {
      try {
        const bc = new BroadcastChannel("heeva_sync");
        bc.postMessage({ type: "DATA_CLEARED", table: "patients" });
        bc.close();
      } catch (_) {
      }
    }
    return { ok: true, reset: true };
  });
}
async function addVitals(patientId, v, userId) {
  return db_default.transaction("rw", [db_default.patient_vitals, db_default.activity_logs], async () => {
    const rec = {
      id: uid(),
      patient_id: patientId,
      temp: v.temp ?? null,
      sbp: v.sbp ?? null,
      dbp: v.dbp ?? null,
      pulse: v.pulse ?? null,
      spo2: v.spo2 ?? null,
      rr: v.rr ?? null,
      weight: v.weight ?? null,
      height: v.height ?? null,
      sugar: v.sugar ?? null,
      recorded_at: nowISO(),
      recorded_by: userId || null
    };
    await db_default.patient_vitals.add(rec);
    await audit(userId, "VITALS_RECORD", "vitals", rec.id, `Patient ${patientId}`);
    return rec;
  });
}
async function patientVisits(patientId) {
  return db_default.consultations.where("patient_id").equals(patientId).toArray();
}
function ageOf(p) {
  return p.age ?? p.approx_age ?? ageFromDob(p.dob) ?? null;
}
var digits, VITAL_FIELDS;
var init_patients = __esm({
  "src/services/patients.js"() {
    init_db();
    init_utils();
    init_core();
    init_api();
    init_remoteSync();
    digits = (s) => String(s || "").replace(/\D/g, "");
    VITAL_FIELDS = ["temp", "sbp", "dbp", "pulse", "spo2", "rr", "weight", "height", "sugar"];
  }
});

// worker/db/tables.js
var tableAliases, resolveCollection, allowedCollections, tableColumns;
var init_tables = __esm({
  "worker/db/tables.js"() {
    tableAliases = {
      settings: "clinic_settings",
      batches: "medicine_batches",
      inventory_txns: "inventory_transactions"
    };
    resolveCollection = (name) => tableAliases[name] || name;
    allowedCollections = /* @__PURE__ */ new Set([
      "clinic_settings",
      "settings",
      "counters",
      "patients",
      "patient_vitals",
      "doctors",
      "consultations",
      "appointments",
      "medicines",
      "medicine_categories",
      "medicine_batches",
      "batches",
      "inventory_transactions",
      "inventory_txns",
      "medicine_stock_history",
      "services",
      "prescriptions",
      "prescription_items",
      "bills",
      "bill_items",
      "payments",
      "expenses",
      "returns",
      "return_items",
      "notifications",
      "activity_logs"
    ]);
    tableColumns = {
      clinic_settings: [
        "id",
        "clinic_name",
        "tagline",
        "doctor_name",
        "doctor_phone",
        "doctor_qual",
        "doctor_role",
        "address",
        "phone",
        "email",
        "logo",
        "receipt_footer",
        "currency",
        "bill_prefix",
        "bill_padding",
        "default_payment",
        "uhid_prefix",
        "uhid_include_year",
        "uhid_padding",
        "uhid_start",
        "low_stock_default",
        "expiry_30",
        "expiry_60",
        "expiry_90",
        "fefo",
        "theme",
        "lang",
        "seeded",
        "created_at",
        "updated_at"
      ],
      counters: ["id", "key", "value", "created_at", "updated_at"],
      patients: [
        "id",
        "uhid",
        "name",
        "age",
        "gender",
        "mobile",
        "address",
        "pin",
        "marital_status",
        "blood_group",
        "allergies",
        "conditions",
        "current_meds",
        "notes",
        "active",
        "reg_date",
        "created_by",
        "created_at",
        "updated_at"
      ],
      patient_vitals: [
        "id",
        "patient_id",
        "temp",
        "sbp",
        "dbp",
        "pulse",
        "spo2",
        "rr",
        "weight",
        "height",
        "sugar",
        "recorded_at",
        "recorded_by",
        "created_at",
        "updated_at"
      ],
      doctors: [
        "id",
        "name",
        "qualification",
        "specialization",
        "phone",
        "email",
        "active",
        "created_at",
        "updated_at"
      ],
      consultations: [
        "id",
        "consultation_no",
        "patient_id",
        "uhid",
        "doctor_id",
        "doctor_name",
        "date",
        "time",
        "chief",
        "symptoms",
        "diagnosis",
        "notes",
        "advice",
        "follow_up",
        "status",
        "created_by",
        "created_at",
        "updated_at"
      ],
      appointments: [
        "id",
        "appointment_no",
        "patient_id",
        "uhid",
        "doctor_id",
        "date",
        "time",
        "reason",
        "status",
        "created_by",
        "created_at",
        "updated_at"
      ],
      prescriptions: [
        "id",
        "prescription_no",
        "patient_id",
        "uhid",
        "consultation_id",
        "doctor_id",
        "doctor_name",
        "date",
        "time",
        "diagnosis",
        "notes",
        "advice",
        "created_by",
        "created_at",
        "updated_at"
      ],
      prescription_items: [
        "id",
        "prescription_id",
        "medicine_id",
        "seq",
        "name",
        "dosage",
        "timing",
        "frequency",
        "duration",
        "quantity",
        "instruction",
        "created_at",
        "updated_at"
      ],
      medicines: [
        "id",
        "medicine_code",
        "name",
        "generic",
        "brand",
        "category",
        "type",
        "strength",
        "unit",
        "purchase_price",
        "selling_price",
        "min_stock",
        "location",
        "description",
        "active",
        "created_at",
        "updated_at"
      ],
      medicine_categories: ["id", "name", "created_at", "updated_at"],
      medicine_batches: [
        "id",
        "medicine_id",
        "batch_no",
        "mfg_date",
        "expiry",
        "quantity",
        "available",
        "purchase_price",
        "status",
        "created_at",
        "updated_at"
      ],
      inventory_transactions: [
        "id",
        "medicine_id",
        "batch_id",
        "type",
        "qty",
        "ref_id",
        "at",
        "by",
        "note",
        "created_at",
        "updated_at"
      ],
      medicine_stock_history: [
        "id",
        "medicine_id",
        "date",
        "opening",
        "inward",
        "outward",
        "closing",
        "created_at",
        "updated_at"
      ],
      services: [
        "id",
        "service_code",
        "name",
        "type",
        "price",
        "description",
        "active",
        "created_at",
        "updated_at"
      ],
      bills: [
        "id",
        "bill_no",
        "patient_id",
        "uhid",
        "patient_name",
        "patient_mobile",
        "patient_age",
        "patient_gender",
        "date",
        "time",
        "doctor_name",
        "doctor_phone",
        "diagnosis",
        "advice",
        "next_visit",
        "item_count",
        "subtotal",
        "discount",
        "total",
        "paid",
        "status",
        "payment_status",
        "bill_type",
        "created_by",
        "cancel_reason",
        "cancelled_at",
        "cancelled_by",
        "created_at",
        "updated_at"
      ],
      bill_items: [
        "id",
        "bill_id",
        "item_type",
        "ref_id",
        "name",
        "qty",
        "price",
        "amount",
        "batch_id",
        "batch_no",
        "dosage",
        "timing",
        "frequency",
        "duration",
        "composition",
        "notes",
        "returned",
        "created_at",
        "updated_at"
      ],
      payments: [
        "id",
        "bill_id",
        "patient_id",
        "kind",
        "amount",
        "method",
        "note",
        "by",
        "at",
        "created_at",
        "updated_at"
      ],
      expenses: [
        "id",
        "expense_no",
        "category",
        "amount",
        "date",
        "description",
        "method",
        "status",
        "void_reason",
        "added_by",
        "created_at",
        "updated_at"
      ],
      returns: [
        "id",
        "return_no",
        "bill_id",
        "bill_no",
        "patient_id",
        "uhid",
        "patient_name",
        "reason",
        "note",
        "refund",
        "refund_method",
        "at",
        "created_by",
        "created_at",
        "updated_at"
      ],
      return_items: [
        "id",
        "return_id",
        "bill_item_id",
        "name",
        "qty",
        "batch_no",
        "amount",
        "created_at",
        "updated_at"
      ],
      notifications: [
        "id",
        "type",
        "ref",
        "severity",
        "title",
        "message",
        "read",
        "at",
        "created_at",
        "updated_at"
      ],
      activity_logs: [
        "id",
        "user_id",
        "user_name",
        "action",
        "entity",
        "entity_id",
        "at",
        "detail",
        "created_at",
        "updated_at"
      ]
    };
  }
});

// worker/db/d1Client.js
var d1Client_exports = {};
__export(d1Client_exports, {
  d1Client: () => d1Client,
  default: () => d1Client_default
});
function nowISO2() {
  return (/* @__PURE__ */ new Date()).toISOString();
}
function parseHistoricalDateTime(val, fallbackISO = (/* @__PURE__ */ new Date()).toISOString()) {
  if (!val) return fallbackISO;
  if (typeof val !== "string") return fallbackISO;
  const s = val.trim();
  if (!s) return fallbackISO;
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    let hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const ampm = dmyMatch[7] ? dmyMatch[7].toUpperCase() : null;
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    let hours = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const minutes = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const seconds = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    const ampm = ymdMatch[7] ? ymdMatch[7].toUpperCase() : null;
    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;
    const d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return fallbackISO;
}
function filterFields(table, obj) {
  const allowed = tableColumns[table];
  if (!allowed) return obj;
  const filtered = {};
  for (const col of allowed) {
    if (obj[col] !== void 0) {
      filtered[col] = obj[col];
    }
  }
  return filtered;
}
var d1Client, d1Client_default;
var init_d1Client = __esm({
  "worker/db/d1Client.js"() {
    init_tables();
    d1Client = {
      async ensureSchemaIntegrity(db3) {
        if (!db3) return;
        const migrations = [
          "ALTER TABLE patients ADD COLUMN age INTEGER",
          "ALTER TABLE patients ADD COLUMN marital_status TEXT DEFAULT 'Single'",
          "ALTER TABLE prescription_items ADD COLUMN timing TEXT",
          "ALTER TABLE prescription_items ADD COLUMN quantity TEXT",
          "ALTER TABLE bills ADD COLUMN doctor_phone TEXT",
          "ALTER TABLE bills ADD COLUMN diagnosis TEXT",
          "ALTER TABLE bills ADD COLUMN advice TEXT",
          "ALTER TABLE bills ADD COLUMN next_visit TEXT",
          "ALTER TABLE bill_items ADD COLUMN timing TEXT",
          "ALTER TABLE bill_items ADD COLUMN frequency TEXT",
          "ALTER TABLE bill_items ADD COLUMN duration TEXT",
          "ALTER TABLE bill_items ADD COLUMN composition TEXT",
          "ALTER TABLE bill_items ADD COLUMN notes TEXT",
          "ALTER TABLE bill_items ADD COLUMN returned INTEGER DEFAULT 0",
          "CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id)",
          "CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON prescriptions(doctor_id)"
        ];
        for (const sql of migrations) {
          try {
            await db3.prepare(sql).run();
          } catch (_) {
          }
        }
      },
      async getAll(db3, collection) {
        const actual = resolveCollection(collection);
        const query = `SELECT * FROM "${actual}" ORDER BY CASE WHEN updated_at IS NOT NULL THEN updated_at WHEN created_at IS NOT NULL THEN created_at ELSE id END DESC`;
        const { results } = await db3.prepare(query).all();
        const rows = results || [];
        if (actual === "returns") {
          const { results: itemResults } = await db3.prepare("SELECT * FROM return_items").all();
          const returnItems = itemResults || [];
          return rows.map((r) => ({
            ...r,
            items: returnItems.filter((it) => it.return_id === r.id)
          }));
        }
        return rows;
      },
      async getById(db3, collection, id) {
        if (id == null) return null;
        const strId = String(id);
        const actual = resolveCollection(collection);
        let query;
        let stmt;
        if (actual === "counters") {
          query = "SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1";
          stmt = db3.prepare(query).bind(strId, strId);
        } else {
          query = `SELECT * FROM "${actual}" WHERE id = ? LIMIT 1`;
          stmt = db3.prepare(query).bind(strId);
        }
        const row = await stmt.first();
        if (!row) return null;
        if (actual === "returns") {
          const { results: itemResults } = await db3.prepare("SELECT * FROM return_items WHERE return_id = ?").bind(row.id).all();
          return {
            ...row,
            items: itemResults || []
          };
        }
        return row;
      },
      async getDbVersion(db3) {
        try {
          const row = await db3.prepare("SELECT value, updated_at FROM counters WHERE key = ? OR id = ? LIMIT 1").bind("DB_VERSION", "DB_VERSION").first();
          return {
            version: row && row.value != null ? Number(row.value) : 1,
            updatedAt: row?.updated_at || nowISO2()
          };
        } catch (_) {
          return { version: 1, updatedAt: nowISO2() };
        }
      },
      async incrementDbVersion(db3, now = nowISO2()) {
        try {
          await db3.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('DB_VERSION', 'DB_VERSION', 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          value = counters.value + 1,
          updated_at = excluded.updated_at
      `).bind(now, now).run();
        } catch (e) {
          console.warn("[incrementDbVersion] Failed to bump version:", e?.message || e);
        }
      },
      async getSyncBundle(db3) {
        const versionStatus = await this.getDbVersion(db3);
        const queries = [
          db3.prepare("SELECT * FROM clinic_settings"),
          db3.prepare("SELECT * FROM counters"),
          db3.prepare("SELECT * FROM doctors ORDER BY name ASC"),
          db3.prepare("SELECT * FROM patients ORDER BY updated_at DESC, created_at DESC"),
          db3.prepare("SELECT * FROM patient_vitals ORDER BY recorded_at DESC"),
          db3.prepare("SELECT * FROM medicine_categories ORDER BY name ASC"),
          db3.prepare("SELECT * FROM medicines ORDER BY name ASC"),
          db3.prepare("SELECT * FROM medicine_batches ORDER BY expiry ASC"),
          db3.prepare("SELECT * FROM inventory_transactions ORDER BY at DESC"),
          db3.prepare("SELECT * FROM services ORDER BY name ASC"),
          db3.prepare("SELECT * FROM consultations ORDER BY date DESC, time DESC"),
          db3.prepare("SELECT * FROM prescriptions ORDER BY date DESC, time DESC"),
          db3.prepare("SELECT * FROM prescription_items ORDER BY seq ASC"),
          db3.prepare("SELECT * FROM appointments ORDER BY date DESC, time DESC"),
          db3.prepare("SELECT * FROM bills ORDER BY date DESC, time DESC"),
          db3.prepare("SELECT * FROM bill_items"),
          db3.prepare("SELECT * FROM payments ORDER BY at DESC"),
          db3.prepare("SELECT * FROM returns ORDER BY at DESC"),
          db3.prepare("SELECT * FROM return_items"),
          db3.prepare("SELECT * FROM expenses ORDER BY date DESC"),
          db3.prepare("SELECT * FROM notifications ORDER BY at DESC"),
          db3.prepare("SELECT * FROM activity_logs ORDER BY at DESC LIMIT 150")
        ];
        const results = await db3.batch(queries);
        const data = {
          clinic_settings: results[0]?.results || [],
          counters: results[1]?.results || [],
          doctors: results[2]?.results || [],
          patients: results[3]?.results || [],
          patient_vitals: results[4]?.results || [],
          medicine_categories: results[5]?.results || [],
          medicines: results[6]?.results || [],
          medicine_batches: results[7]?.results || [],
          inventory_transactions: results[8]?.results || [],
          services: results[9]?.results || [],
          consultations: results[10]?.results || [],
          prescriptions: results[11]?.results || [],
          prescription_items: results[12]?.results || [],
          appointments: results[13]?.results || [],
          bills: results[14]?.results || [],
          bill_items: results[15]?.results || [],
          payments: results[16]?.results || [],
          returns: results[17]?.results || [],
          return_items: results[18]?.results || [],
          expenses: results[19]?.results || [],
          notifications: results[20]?.results || [],
          activity_logs: results[21]?.results || []
        };
        return {
          ok: true,
          version: versionStatus.version,
          updatedAt: versionStatus.updatedAt,
          data
        };
      },
      async getNextUhidPreview(db3) {
        const settingsRow = await db3.prepare("SELECT * FROM clinic_settings LIMIT 1").first() || {};
        const prefix = (settingsRow.uhid_prefix || "HC").trim().toUpperCase();
        const countRow = await db3.prepare("SELECT COUNT(*) as count FROM patients").first();
        const patientCount = countRow ? Number(countRow.count) : 0;
        const counterRow = await db3.prepare("SELECT * FROM counters WHERE key = ? OR id = ? OR key = ? OR id = ? LIMIT 1").bind("UHID|SEQUENCE", "UHID|SEQUENCE", "UHID|ALL", "UHID|ALL").first();
        let maxExisting = 0;
        try {
          const existingRows = await db3.prepare("SELECT uhid FROM patients WHERE uhid LIKE ?").bind(`${prefix}-%`).all();
          if (existingRows && existingRows.results) {
            for (const r of existingRows.results) {
              const uhidStr = String(r.uhid || "");
              const m = uhidStr.match(/^[A-Za-z]+-(\d+)$/);
              if (m) {
                const val = parseInt(m[1], 10);
                if (!isNaN(val) && val > maxExisting) maxExisting = val;
              }
            }
          }
        } catch (_) {
        }
        const counterVal = counterRow && counterRow.value != null ? Number(counterRow.value) : 1e3;
        const base = Math.max(counterVal, maxExisting, 1e3);
        const nextNumber = base + 1;
        const nextUhid = `${prefix}-${nextNumber}`;
        return {
          ok: true,
          nextUhid,
          nextNumber,
          prefix,
          patientCount
        };
      },
      async allocatePatient(db3, item, options = {}) {
        const now = nowISO2();
        const today = now.slice(0, 10);
        const userId = options.userId || item.created_by || null;
        const id = String(item.id || crypto.randomUUID());
        const existing = await this.getById(db3, "patients", id);
        if (existing) {
          return this.update(db3, "patients", id, item);
        }
        const settingsRow = await db3.prepare("SELECT * FROM clinic_settings LIMIT 1").first() || {};
        const prefix = (settingsRow.uhid_prefix || "HC").trim().toUpperCase();
        const itemAge = item.age !== void 0 && item.age !== null && item.age !== "" ? Number(item.age) : item.dob ? Math.max(0, Math.floor((Date.now() - new Date(item.dob).getTime()) / (365.25 * 24 * 3600 * 1e3))) : null;
        const itemCreatedAt = item.created_at || now;
        const itemRegDate = item.reg_date || itemCreatedAt.slice(0, 10) || today;
        for (let attempt = 0; attempt < 5; attempt++) {
          const counterRow = await db3.prepare("SELECT * FROM counters WHERE key = ? OR id = ? OR key = ? OR id = ? LIMIT 1").bind("UHID|SEQUENCE", "UHID|SEQUENCE", "UHID|ALL", "UHID|ALL").first();
          let maxExisting = 0;
          try {
            const existingRows = await db3.prepare("SELECT uhid FROM patients WHERE uhid LIKE ?").bind(`${prefix}-%`).all();
            if (existingRows && existingRows.results) {
              for (const r of existingRows.results) {
                const uhidStr = String(r.uhid || "");
                const m = uhidStr.match(/^[A-Za-z]+-(\d+)$/);
                if (m) {
                  const val = parseInt(m[1], 10);
                  if (!isNaN(val) && val > maxExisting) maxExisting = val;
                }
              }
            }
          } catch (_) {
          }
          const counterVal = counterRow && counterRow.value != null ? Number(counterRow.value) : 1e3;
          const base = Math.max(counterVal, maxExisting, 1e3);
          let nextVal = base + 1;
          if (attempt > 0) nextVal += attempt;
          let uhid = item.uhid ? String(item.uhid).trim() : null;
          if (!uhid) {
            uhid = `${prefix}-${nextVal}`;
          } else {
            const match = uhid.match(/^[A-Za-z]+-(\d+)$/);
            if (match) {
              const numInUhid = Number(match[1]);
              if (!isNaN(numInUhid) && numInUhid > nextVal) {
                nextVal = numInUhid;
              }
            }
          }
          const patientRecord = {
            id,
            uhid,
            name: String(item.name || "").trim(),
            age: itemAge,
            gender: item.gender || "",
            mobile: String(item.mobile || ""),
            marital_status: item.marital_status || "Single",
            address: item.address || "",
            pin: item.pin ? String(item.pin) : "",
            blood_group: item.blood_group || "",
            allergies: item.allergies || "",
            conditions: item.conditions || "",
            current_meds: item.current_meds || "",
            notes: item.notes || "",
            active: item.active !== void 0 ? item.active : 1,
            reg_date: itemRegDate,
            created_by: userId,
            created_at: itemCreatedAt,
            updated_at: now
          };
          const filtered = filterFields("patients", patientRecord);
          const cols = Object.keys(filtered);
          const placeholders = cols.map(() => "?");
          const values = cols.map((c) => filtered[c]);
          const batchStmts = [
            // 1. Atomically update UHID sequence counter (both UHID|SEQUENCE and legacy UHID|ALL)
            db3.prepare(`
          INSERT INTO counters (id, key, value, created_at, updated_at)
          VALUES ('UHID|SEQUENCE', 'UHID|SEQUENCE', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            value = CASE WHEN excluded.value > counters.value THEN excluded.value ELSE counters.value END,
            updated_at = excluded.updated_at
        `).bind(nextVal, now, now),
            db3.prepare(`
          INSERT INTO counters (id, key, value, created_at, updated_at)
          VALUES ('UHID|ALL', 'UHID|ALL', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            value = CASE WHEN excluded.value > counters.value THEN excluded.value ELSE counters.value END,
            updated_at = excluded.updated_at
        `).bind(nextVal, now, now),
            // 2. Insert patient record
            db3.prepare(`INSERT INTO patients ("${cols.join('", "')}") VALUES (${placeholders.join(", ")})`).bind(...values),
            // 3. Atomically increment DB_VERSION for instant multi-device sync
            db3.prepare(`
          INSERT INTO counters (id, key, value, created_at, updated_at)
          VALUES ('DB_VERSION', 'DB_VERSION', 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            value = counters.value + 1,
            updated_at = excluded.updated_at
        `).bind(now, now)
          ];
          try {
            await db3.batch(batchStmts);
            return this.getById(db3, "patients", id);
          } catch (err) {
            if (/UNIQUE constraint failed.*patients\.uhid/i.test(err?.message || "") && !item.uhid) {
              continue;
            }
            throw err;
          }
        }
        throw new Error("Could not allocate unique UHID after multiple attempts.");
      },
      async create(db3, collection, item, options = {}) {
        const actual = resolveCollection(collection);
        if (actual === "patients") {
          return this.allocatePatient(db3, item, options);
        }
        const now = nowISO2();
        const id = actual === "counters" ? String(item.key || item.id || crypto.randomUUID()) : String(item.id || crypto.randomUUID());
        const existing = await this.getById(db3, actual, id);
        if (existing) {
          return this.update(db3, actual, id, item);
        }
        if (actual === "medicine_categories" && item.name) {
          const catCheck = await db3.prepare("SELECT * FROM medicine_categories WHERE LOWER(name) = LOWER(?) LIMIT 1").bind(String(item.name).trim()).first();
          if (catCheck) {
            return catCheck;
          }
        }
        const record = {
          ...item,
          id,
          created_at: item.created_at || now,
          updated_at: item.updated_at || now
        };
        if (actual === "counters") {
          record.key = String(item.key || id);
        }
        if (actual === "services") {
          if (!record.service_code) {
            const countRow = await db3.prepare("SELECT COUNT(*) as count FROM services").first();
            const nextNum2 = (countRow ? Number(countRow.count) : 0) + 1;
            record.service_code = `SRV-${String(nextNum2).padStart(4, "0")}`;
          }
          const existingSvc = await db3.prepare("SELECT id FROM services WHERE service_code = ?").bind(record.service_code).first();
          if (existingSvc && existingSvc.id !== id) {
            const countRow = await db3.prepare("SELECT COUNT(*) as count FROM services").first();
            record.service_code = `SRV-${String(nextNum).padStart(4, "0")}-${Date.now().toString().slice(-4)}`;
          }
        }
        if (actual === "medicines") {
          if (record.active === void 0 || record.active === null) record.active = 1;
          else record.active = record.active === 1 || record.active === true || record.active === "1" ? 1 : 0;
        }
        const filtered = filterFields(actual, record);
        const cols = Object.keys(filtered);
        const placeholders = cols.map(() => "?");
        const values = cols.map((c) => filtered[c]);
        const insertSql = `INSERT INTO "${actual}" ("${cols.join('", "')}") VALUES (${placeholders.join(", ")})`;
        const stmts = [db3.prepare(insertSql).bind(...values)];
        if (actual === "returns" && Array.isArray(item.items)) {
          for (const it of item.items) {
            const retItem = {
              id: crypto.randomUUID(),
              return_id: id,
              bill_item_id: it.bill_item_id || null,
              name: it.name || "",
              qty: Number(it.qty) || 0,
              batch_no: it.batch_no || "",
              amount: Number(it.amount) || 0,
              created_at: now,
              updated_at: now
            };
            const retFiltered = filterFields("return_items", retItem);
            const rCols = Object.keys(retFiltered);
            const rPlaceholders = rCols.map(() => "?");
            const rValues = rCols.map((c) => retFiltered[c]);
            stmts.push(
              db3.prepare(`INSERT INTO return_items ("${rCols.join('", "')}") VALUES (${rPlaceholders.join(", ")})`).bind(...rValues)
            );
          }
        }
        await db3.batch(stmts);
        await this.incrementDbVersion(db3, now);
        return this.getById(db3, actual, id);
      },
      async update(db3, collection, id, patch) {
        const actual = resolveCollection(collection);
        const strId = String(id);
        const existing = await this.getById(db3, actual, strId);
        if (!existing) {
          return this.create(db3, actual, { ...patch, id: strId });
        }
        const now = nowISO2();
        const updated = {
          ...existing,
          ...patch,
          id: existing.id,
          updated_at: now
        };
        if (actual === "counters" && patch.key) {
          updated.key = String(patch.key);
        }
        if (actual === "services" && patch.service_code) {
          const existingSvc = await db3.prepare("SELECT id FROM services WHERE service_code = ? AND id != ?").bind(patch.service_code, strId).first();
          if (existingSvc) {
            delete updated.service_code;
          }
        }
        if (actual === "medicines" && patch.active !== void 0) {
          updated.active = patch.active === 1 || patch.active === true || patch.active === "1" ? 1 : 0;
        }
        const filtered = filterFields(actual, updated);
        const cols = Object.keys(filtered).filter((c) => c !== "id");
        const setClauses = cols.map((c) => `"${c}" = ?`);
        const values = cols.map((c) => filtered[c]);
        let updateSql;
        if (actual === "counters") {
          updateSql = `UPDATE counters SET ${setClauses.join(", ")} WHERE key = ? OR id = ?`;
          values.push(existing.key || strId, strId);
        } else {
          updateSql = `UPDATE "${actual}" SET ${setClauses.join(", ")} WHERE id = ?`;
          values.push(strId);
        }
        await db3.prepare(updateSql).bind(...values).run();
        await this.incrementDbVersion(db3, now);
        return this.getById(db3, actual, strId);
      },
      async remove(db3, collection, id) {
        const actual = resolveCollection(collection);
        const strId = String(id);
        const now = nowISO2();
        let deleteSql;
        if (actual === "counters") {
          deleteSql = "DELETE FROM counters WHERE key = ? OR id = ?";
          await db3.prepare(deleteSql).bind(strId, strId).run();
        } else {
          deleteSql = `DELETE FROM "${actual}" WHERE id = ?`;
          await db3.prepare(deleteSql).bind(strId).run();
        }
        if (actual === "returns") {
          await db3.prepare("DELETE FROM return_items WHERE return_id = ?").bind(strId).run();
        }
        if (actual === "prescriptions") {
          await db3.prepare("DELETE FROM prescription_items WHERE prescription_id = ?").bind(strId).run();
        }
        if (actual === "bills") {
          await db3.prepare("DELETE FROM bill_items WHERE bill_id = ?").bind(strId).run();
          await db3.prepare("DELETE FROM payments WHERE bill_id = ?").bind(strId).run();
        }
        await this.incrementDbVersion(db3, now);
        return true;
      },
      async updateClinicSetting(db3, key, value) {
        const settingsRow = await db3.prepare("SELECT * FROM clinic_settings LIMIT 1").first();
        const now = nowISO2();
        const settingId = settingsRow ? settingsRow.id : "1";
        if (settingsRow && key in settingsRow) {
          await db3.prepare(`UPDATE clinic_settings SET "${key}" = ?, updated_at = ? WHERE id = ?`).bind(value, now, settingId).run();
        } else if (!settingsRow) {
          await db3.prepare(`INSERT INTO clinic_settings (id, "${key}", created_at, updated_at) VALUES ('1', ?, ?, ?)`).bind(value, now, now).run();
        }
        await this.incrementDbVersion(db3, now);
        return { key, value };
      },
      async bulkImport(db3, collection, items, options = {}) {
        const actual = resolveCollection(collection);
        const now = nowISO2();
        const today = now.slice(0, 10);
        const userId = options.userId || null;
        if (!Array.isArray(items) || items.length === 0) {
          return { success: true, count: 0, skipped: 0, records: [] };
        }
        if (actual === "patients") {
          const settingsRow = await db3.prepare("SELECT * FROM clinic_settings LIMIT 1").first() || {};
          const prefix = (settingsRow.uhid_prefix || "HC").trim().toUpperCase();
          const counterRow = await db3.prepare("SELECT * FROM counters WHERE key = ? OR id = ? OR key = ? OR id = ? LIMIT 1").bind("UHID|SEQUENCE", "UHID|SEQUENCE", "UHID|ALL", "UHID|ALL").first();
          let counterVal = counterRow && counterRow.value != null ? Number(counterRow.value) : 1e3;
          let maxExistingSuffix = 0;
          try {
            const existingUhids = await db3.prepare("SELECT uhid FROM patients WHERE uhid LIKE ?").bind(`${prefix}-%`).all();
            if (existingUhids && existingUhids.results) {
              for (const row of existingUhids.results) {
                const match = String(row.uhid || "").match(/^[A-Za-z]+-(\d+)$/);
                if (match) {
                  const num = parseInt(match[1], 10);
                  if (!isNaN(num) && num > maxExistingSuffix) {
                    maxExistingSuffix = num;
                  }
                }
              }
            }
          } catch (_) {
          }
          counterVal = Math.max(counterVal, maxExistingSuffix, 1e3);
          const newPatients = [];
          const skipped = [];
          const batchStmts = [];
          for (const item of items) {
            const itemAge = item.age !== void 0 && item.age !== null && item.age !== "" ? Number(item.age) : item.dob ? Math.max(0, Math.floor((Date.now() - new Date(item.dob).getTime()) / (365.25 * 24 * 3600 * 1e3))) : null;
            if (!item.name || !item.gender) {
              skipped.push({ item, reason: "Missing required field (name or gender)" });
              continue;
            }
            counterVal++;
            const uhid = item.uhid || `${prefix}-${counterVal}`;
            const itemCreatedAt = parseHistoricalDateTime(item.created_at || item.date_time, now);
            const itemRegDate = item.reg_date || (itemCreatedAt ? itemCreatedAt.slice(0, 10) : today);
            const p = {
              id: item.id || crypto.randomUUID(),
              uhid,
              name: String(item.name).trim(),
              age: itemAge != null && !isNaN(itemAge) ? itemAge : null,
              gender: item.gender,
              mobile: item.mobile ? String(item.mobile) : "",
              marital_status: item.marital_status || "Single",
              address: item.address || "",
              pin: item.pin ? String(item.pin) : "",
              blood_group: item.blood_group || "",
              allergies: item.allergies || "",
              conditions: item.conditions || "",
              current_meds: item.current_meds || "",
              notes: item.notes || "",
              active: 1,
              reg_date: itemRegDate,
              created_by: userId,
              created_at: itemCreatedAt,
              updated_at: now
            };
            newPatients.push(p);
            const filtered = filterFields("patients", p);
            const cols = Object.keys(filtered);
            const placeholders = cols.map(() => "?");
            batchStmts.push(
              db3.prepare(`INSERT OR REPLACE INTO patients ("${cols.join('", "')}") VALUES (${placeholders.join(", ")})`).bind(...cols.map((c) => filtered[c]))
            );
          }
          const updatedCounter = {
            id: "UHID|SEQUENCE",
            key: "UHID|SEQUENCE",
            value: counterVal,
            updated_at: now
          };
          batchStmts.push(
            db3.prepare("INSERT OR REPLACE INTO counters (id, key, value, updated_at) VALUES (?, ?, ?, ?)").bind("UHID|SEQUENCE", "UHID|SEQUENCE", counterVal, now),
            db3.prepare("INSERT OR REPLACE INTO counters (id, key, value, updated_at) VALUES (?, ?, ?, ?)").bind("UHID|ALL", "UHID|ALL", counterVal, now)
          );
          if (batchStmts.length > 0) {
            await db3.batch(batchStmts);
            await this.incrementDbVersion(db3, now);
          }
          return {
            success: true,
            count: newPatients.length,
            skipped: skipped.length,
            skippedDetails: skipped,
            records: newPatients,
            extraTables: {
              counters: [updatedCounter]
            }
          };
        }
        if (actual === "medicines") {
          const counterRow = await db3.prepare("SELECT * FROM counters WHERE key = 'MED|ALL' OR id = 'MED|ALL' LIMIT 1").first();
          let counterVal = counterRow ? Number(counterRow.value) : 0;
          const { results: existingCodes } = await db3.prepare("SELECT medicine_code FROM medicines").all();
          let maxMedCodeSuffix = 0;
          if (existingCodes) {
            for (const row of existingCodes) {
              const m = String(row.medicine_code || "").match(/MD-(\d+)$/i);
              if (m) {
                const n = parseInt(m[1], 10);
                if (!isNaN(n) && n > maxMedCodeSuffix) maxMedCodeSuffix = n;
              }
            }
          }
          counterVal = Math.max(counterVal, maxMedCodeSuffix);
          const { results: existingMeds } = await db3.prepare("SELECT id, name FROM medicines").all();
          const { results: existingCats } = await db3.prepare("SELECT id, name FROM medicine_categories").all();
          const existingMedNames = new Set((existingMeds || []).map((m) => String(m.name).trim().toLowerCase()));
          const existingCatNames = new Set((existingCats || []).map((c) => String(c.name).trim().toLowerCase()));
          const newMedicines = [];
          const newCategories = [];
          const skipped = [];
          const batchStmts = [];
          for (const item of items) {
            const name = String(item.name || "").trim();
            if (!name) {
              skipped.push({ item, reason: "Missing medicine name" });
              continue;
            }
            if (existingMedNames.has(name.toLowerCase())) {
              skipped.push({ item, reason: `Medicine "${name}" already exists` });
              continue;
            }
            const catName = String(item.category || "Other").trim();
            if (catName && !existingCatNames.has(catName.toLowerCase())) {
              const newCat = {
                id: crypto.randomUUID(),
                name: catName,
                created_at: now,
                updated_at: now
              };
              existingCatNames.add(catName.toLowerCase());
              newCategories.push(newCat);
              batchStmts.push(
                db3.prepare("INSERT OR REPLACE INTO medicine_categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(newCat.id, newCat.name, now, now)
              );
            }
            counterVal++;
            const medicine_code = item.medicine_code || `MD-${String(counterVal).padStart(4, "0")}`;
            const med = {
              id: item.id || crypto.randomUUID(),
              medicine_code,
              name,
              generic: item.generic || "",
              brand: item.brand || name,
              category: catName,
              type: item.type || "Tablet",
              strength: item.strength || "",
              unit: item.unit || "strip",
              purchase_price: Number(item.purchase_price) || 0,
              selling_price: Number(item.selling_price) || 0,
              min_stock: Number(item.min_stock) || 0,
              location: item.location || "",
              description: item.description || "",
              active: 1,
              created_at: now,
              updated_at: now
            };
            existingMedNames.add(name.toLowerCase());
            newMedicines.push(med);
            const filtered = filterFields("medicines", med);
            const cols = Object.keys(filtered);
            const placeholders = cols.map(() => "?");
            batchStmts.push(
              db3.prepare(`INSERT OR REPLACE INTO medicines ("${cols.join('", "')}") VALUES (${placeholders.join(", ")})`).bind(...cols.map((c) => filtered[c]))
            );
          }
          const updatedCounter = {
            id: "MED|ALL",
            key: "MED|ALL",
            value: counterVal,
            updated_at: now
          };
          batchStmts.push(
            db3.prepare("INSERT OR REPLACE INTO counters (id, key, value, updated_at) VALUES (?, ?, ?, ?)").bind("MED|ALL", "MED|ALL", counterVal, now)
          );
          if (batchStmts.length > 0) {
            await db3.batch(batchStmts);
            await this.incrementDbVersion(db3, now);
          }
          return {
            success: true,
            count: newMedicines.length,
            skipped: skipped.length,
            skippedDetails: skipped,
            records: newMedicines,
            extraTables: {
              counters: [updatedCounter],
              ...newCategories.length > 0 ? { medicine_categories: newCategories } : {}
            }
          };
        }
        if (actual === "medicine_categories") {
          const { results: existingCats } = await db3.prepare("SELECT id, name FROM medicine_categories").all();
          const existingCatNames = new Set((existingCats || []).map((c) => String(c.name).trim().toLowerCase()));
          const newCategories = [];
          const skipped = [];
          const batchStmts = [];
          for (const item of items) {
            const name = String(item.name || "").trim();
            if (!name) {
              skipped.push({ item, reason: "Missing category name" });
              continue;
            }
            if (existingCatNames.has(name.toLowerCase())) {
              skipped.push({ item, reason: `Category "${name}" already exists` });
              continue;
            }
            const cat = {
              id: item.id || crypto.randomUUID(),
              name,
              created_at: now,
              updated_at: now
            };
            existingCatNames.add(name.toLowerCase());
            newCategories.push(cat);
            batchStmts.push(
              db3.prepare("INSERT OR REPLACE INTO medicine_categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)").bind(cat.id, cat.name, now, now)
            );
          }
          if (batchStmts.length > 0) {
            await db3.batch(batchStmts);
            await this.incrementDbVersion(db3, now);
          }
          return {
            success: true,
            count: newCategories.length,
            skipped: skipped.length,
            skippedDetails: skipped,
            records: newCategories
          };
        }
        if (actual === "doctors") {
          const { results: existingDocs } = await db3.prepare("SELECT id, name FROM doctors").all();
          const existingDocNames = new Set((existingDocs || []).map((d) => String(d.name).trim().toLowerCase()));
          const newDoctors = [];
          const skipped = [];
          const batchStmts = [];
          for (const item of items) {
            const name = String(item.name || "").trim();
            if (!name) {
              skipped.push({ item, reason: "Missing doctor name" });
              continue;
            }
            if (existingDocNames.has(name.toLowerCase())) {
              skipped.push({ item, reason: `Doctor "${name}" already exists` });
              continue;
            }
            const doc = {
              id: item.id || crypto.randomUUID(),
              name,
              qualification: item.qualification || "",
              specialization: item.specialization || "",
              phone: item.phone ? String(item.phone) : "",
              email: item.email || "",
              active: 1,
              created_at: now,
              updated_at: now
            };
            existingDocNames.add(name.toLowerCase());
            newDoctors.push(doc);
            const filtered = filterFields("doctors", doc);
            const cols = Object.keys(filtered);
            const placeholders = cols.map(() => "?");
            batchStmts.push(
              db3.prepare(`INSERT OR REPLACE INTO doctors ("${cols.join('", "')}") VALUES (${placeholders.join(", ")})`).bind(...cols.map((c) => filtered[c]))
            );
          }
          if (batchStmts.length > 0) {
            await db3.batch(batchStmts);
            await this.incrementDbVersion(db3, now);
          }
          return {
            success: true,
            count: newDoctors.length,
            skipped: skipped.length,
            skippedDetails: skipped,
            records: newDoctors
          };
        }
        if (actual === "medicine_batches") {
          const { results: meds } = await db3.prepare("SELECT id, name, purchase_price FROM medicines").all();
          const medMapById = new Map((meds || []).map((m) => [m.id, m]));
          const medMapByName = new Map((meds || []).map((m) => [String(m.name).trim().toLowerCase(), m]));
          const newBatches = [];
          const newTxns = [];
          const skipped = [];
          const batchStmts = [];
          for (const item of items) {
            let med = null;
            if (item.medicine_id && medMapById.has(item.medicine_id)) {
              med = medMapById.get(item.medicine_id);
            } else if (item.medicine_name && medMapByName.has(String(item.medicine_name).trim().toLowerCase())) {
              med = medMapByName.get(String(item.medicine_name).trim().toLowerCase());
            }
            if (!med) {
              skipped.push({ item, reason: `Medicine "${item.medicine_name || item.medicine_id}" not found` });
              continue;
            }
            const batchNo = String(item.batch_no || "").trim().toUpperCase();
            if (!batchNo) {
              skipped.push({ item, reason: "Missing batch number" });
              continue;
            }
            const qty = Number(item.quantity);
            if (!(qty > 0)) {
              skipped.push({ item, reason: "Quantity must be positive" });
              continue;
            }
            const normalizeToIsoDate = (val, fallback) => {
              if (!val) return fallback;
              const s = String(val).trim();
              const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
              if (dmy) {
                const p22 = (n) => String(n).padStart(2, "0");
                return `${dmy[3]}-${p22(dmy[2])}-${p22(dmy[1])}`;
              }
              return s;
            };
            const batchId = item.id || crypto.randomUUID();
            const batch = {
              id: batchId,
              medicine_id: med.id,
              batch_no: batchNo,
              mfg_date: normalizeToIsoDate(item.mfg_date, today),
              expiry: normalizeToIsoDate(item.expiry, "9999-12-31"),
              quantity: qty,
              available: qty,
              purchase_price: Number(item.purchase_price) || med.purchase_price || 0,
              status: "active",
              created_at: now,
              updated_at: now
            };
            const txn = {
              id: crypto.randomUUID(),
              medicine_id: med.id,
              batch_id: batchId,
              type: "ADJUSTMENT",
              qty,
              ref_id: null,
              at: now,
              by: userId,
              note: `Batch ${batchNo} imported via CSV`,
              created_at: now,
              updated_at: now
            };
            newBatches.push(batch);
            newTxns.push(txn);
            const bFiltered = filterFields("medicine_batches", batch);
            const bCols = Object.keys(bFiltered);
            const bPlaceholders = bCols.map(() => "?");
            batchStmts.push(
              db3.prepare(`INSERT OR REPLACE INTO medicine_batches ("${bCols.join('", "')}") VALUES (${bPlaceholders.join(", ")})`).bind(...bCols.map((c) => bFiltered[c]))
            );
            const tFiltered = filterFields("inventory_transactions", txn);
            const tCols = Object.keys(tFiltered);
            const tPlaceholders = tCols.map(() => "?");
            batchStmts.push(
              db3.prepare(`INSERT OR REPLACE INTO inventory_transactions ("${tCols.join('", "')}") VALUES (${tPlaceholders.join(", ")})`).bind(...tCols.map((c) => tFiltered[c]))
            );
          }
          if (batchStmts.length > 0) {
            await db3.batch(batchStmts);
            await this.incrementDbVersion(db3, now);
          }
          return {
            success: true,
            count: newBatches.length,
            skipped: skipped.length,
            skippedDetails: skipped,
            records: newBatches,
            extraTables: {
              inventory_txns: newTxns
            }
          };
        }
        if (actual === "services") {
          const newServices = [];
          const skipped = [];
          const batchStmts = [];
          for (const item of items) {
            const name = String(item.name || "").trim();
            if (!name) {
              skipped.push({ item, reason: "Missing service name" });
              continue;
            }
            const price = Number(item.price);
            if (isNaN(price) || price < 0) {
              skipped.push({ item, reason: "Price must be a valid positive number" });
              continue;
            }
            const svc = {
              id: item.id || crypto.randomUUID(),
              service_code: item.service_code || `SVC-${Date.now().toString(36).toUpperCase()}`,
              name,
              type: item.type || "Consultation",
              price,
              description: item.description || "",
              active: 1,
              created_at: now,
              updated_at: now
            };
            newServices.push(svc);
            const filtered = filterFields("services", svc);
            const cols = Object.keys(filtered);
            const placeholders = cols.map(() => "?");
            batchStmts.push(
              db3.prepare(`INSERT OR REPLACE INTO services ("${cols.join('", "')}") VALUES (${placeholders.join(", ")})`).bind(...cols.map((c) => filtered[c]))
            );
          }
          if (batchStmts.length > 0) {
            await db3.batch(batchStmts);
            await this.incrementDbVersion(db3, now);
          }
          return {
            success: true,
            count: newServices.length,
            skipped: skipped.length,
            skippedDetails: skipped,
            records: newServices
          };
        }
        const createdList = [];
        for (const item of items) {
          const rec = await this.create(db3, actual, item);
          createdList.push(rec);
        }
        return {
          success: true,
          count: createdList.length,
          skipped: 0,
          records: createdList
        };
      }
    };
    d1Client_default = d1Client;
  }
});

// worker/routes/genericCrud.js
var genericCrud_exports = {};
__export(genericCrud_exports, {
  handleClearPatients: () => handleClearPatients,
  handleCreate: () => handleCreate,
  handleDelete: () => handleDelete,
  handleGetAll: () => handleGetAll,
  handleGetById: () => handleGetById,
  handleGetNextUhid: () => handleGetNextUhid,
  handleUpdate: () => handleUpdate
});
async function handleGetAll(table, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const rows = await d1Client.getAll(env.DB, table);
    return Response.json(rows, { status: 200, headers: noCacheHeaders });
  } catch (error) {
    console.error(`[Worker D1 API] Error reading ${table}:`, error);
    return Response.json({ error: error.message || "Operation failed" }, { status: 500, headers: noCacheHeaders });
  }
}
async function handleGetById(table, id, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const row = await d1Client.getById(env.DB, table, id);
    if (!row) {
      return Response.json({ error: "Record not found" }, { status: 404, headers: noCacheHeaders });
    }
    return Response.json(row, { status: 200, headers: noCacheHeaders });
  } catch (error) {
    console.error(`[Worker D1 API] Error reading ${table}/${id}:`, error);
    return Response.json({ error: error.message || "Operation failed" }, { status: 500, headers: noCacheHeaders });
  }
}
async function handleCreate(table, body, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const actual = resolveCollection(table);
    if (actual === "clinic_settings" && body?.key) {
      const result = await d1Client.updateClinicSetting(env.DB, body.key, body.value);
      return Response.json(result, { status: 201 });
    }
    const created = await d1Client.create(env.DB, actual, body || {});
    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error(`[Worker D1 API] Error creating in ${table}:`, error);
    return Response.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
async function handleUpdate(table, id, body, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const actual = resolveCollection(table);
    if (actual === "clinic_settings" && body?.key) {
      const result = await d1Client.updateClinicSetting(env.DB, body.key, body.value);
      return Response.json(result, { status: 200 });
    }
    const updated = await d1Client.update(env.DB, actual, id, body || {});
    return Response.json(updated, { status: 200 });
  } catch (error) {
    console.error(`[Worker D1 API] Error updating ${table}/${id}:`, error);
    return Response.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
async function handleDelete(table, id, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    await d1Client.remove(env.DB, table, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`[Worker D1 API] Error deleting ${table}/${id}:`, error);
    return Response.json({ error: error.message || "Operation failed" }, { status: 500 });
  }
}
async function handleGetNextUhid(env) {
  try {
    const preview = await d1Client.getNextUhidPreview(env.DB);
    return Response.json(preview, { status: 200, headers: noCacheHeaders });
  } catch (error) {
    console.error("[Worker D1 API] Error getting next UHID preview:", error);
    return Response.json({ error: error.message || "Operation failed" }, { status: 500, headers: noCacheHeaders });
  }
}
async function handleClearPatients(body, env) {
  const confirmation = String(body?.confirmation || "").trim();
  if (confirmation !== "DELETE PATIENTS") {
    return Response.json(
      { error: 'Confirmation phrase "DELETE PATIENTS" is required.' },
      { status: 400, headers: noCacheHeaders }
    );
  }
  const db3 = env.DB;
  if (!db3) {
    return Response.json({ error: "Database binding (DB) is unavailable." }, { status: 500, headers: noCacheHeaders });
  }
  try {
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const countRow = await db3.prepare("SELECT COUNT(*) as cnt FROM patients").first();
    const deletedCount = countRow ? Number(countRow.cnt) : 0;
    const clearKey = "CLEARED|patients";
    const clearTime = Date.now();
    const stmts = [
      db3.prepare("DELETE FROM patient_vitals"),
      db3.prepare("DELETE FROM patients"),
      db3.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('UHID|SEQUENCE', 'UHID|SEQUENCE', 1000, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = 1000, updated_at = excluded.updated_at
      `).bind(now, now),
      db3.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('UHID|ALL', 'UHID|ALL', 1000, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = 1000, updated_at = excluded.updated_at
      `).bind(now, now),
      db3.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('UHID|2026', 'UHID|2026', 0, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = 0, updated_at = excluded.updated_at
      `).bind(now, now),
      db3.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(clearKey, clearKey, clearTime, now, now)
    ];
    await db3.batch(stmts);
    const verifyRow = await db3.prepare("SELECT COUNT(*) as cnt FROM patients").first();
    const remainingCount = verifyRow ? Number(verifyRow.cnt) : 0;
    if (remainingCount !== 0) {
      throw new Error(`Deletion verification failed: ${remainingCount} patients still remain.`);
    }
    await d1Client.incrementDbVersion(db3, now);
    return Response.json(
      {
        ok: true,
        message: "All patient records have been permanently cleared. UHID sequence reset to HC-1001.",
        deletedCount,
        nextUhid: "HC-1001"
      },
      { status: 200, headers: noCacheHeaders }
    );
  } catch (error) {
    console.error("[Worker D1 API] Error clearing patients:", error);
    return Response.json({ error: error.message || "Failed to clear patients" }, { status: 500, headers: noCacheHeaders });
  }
}
var noCacheHeaders;
var init_genericCrud = __esm({
  "worker/routes/genericCrud.js"() {
    init_d1Client();
    init_tables();
    noCacheHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0"
    };
  }
});

// scripts/test-uhid-sequence.mjs
import "fake-indexeddb/auto";
import assert from "node:assert";
var { default: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
var core = await Promise.resolve().then(() => (init_core(), core_exports));
var patients = await Promise.resolve().then(() => (init_patients(), patients_exports));
var { d1Client: d1Client2 } = await Promise.resolve().then(() => (init_d1Client(), d1Client_exports));
var { handleClearPatients: handleClearPatients2 } = await Promise.resolve().then(() => (init_genericCrud(), genericCrud_exports));
var passed = 0;
var failed = 0;
function ok(name) {
  console.log(`  \u2713 PASS: ${name}`);
  passed++;
}
function fail(name, err) {
  console.error(`  \u2717 FAIL: ${name} ->`, err?.message || err);
  failed++;
}
console.log("================================================================");
console.log("TEST SUITE: UHID GENERATION \u2014 FIX SEQUENCE & PREVENT REUSE");
console.log("================================================================\n");
console.log("--- PART 1: Dexie & Service Layer Invariants ---");
try {
  await db2.patients.clear();
  await db2.counters.clear();
  const p1 = await patients.registerPatient(
    { name: "Patient One", age: 30, gender: "M", mobile: "9111111111" },
    "admin"
  );
  assert.strictEqual(p1.uhid, "HC-1001", `Expected HC-1001, got ${p1.uhid}`);
  ok("TEST 1: Zero patients in DB -> First patient receives HC-1001");
  const p22 = await patients.registerPatient(
    { name: "Patient Two", age: 25, gender: "F", mobile: "9222222222" },
    "admin"
  );
  const p3 = await patients.registerPatient(
    { name: "Patient Three", age: 40, gender: "M", mobile: "9333333333" },
    "admin"
  );
  assert.strictEqual(p22.uhid, "HC-1002", `Expected HC-1002, got ${p22.uhid}`);
  assert.strictEqual(p3.uhid, "HC-1003", `Expected HC-1003, got ${p3.uhid}`);
  ok("TEST 2: Three patients created sequentially: HC-1001, HC-1002, HC-1003");
  await patients.deletePatient(p22.id, "admin");
  const remainingAfterDelete2 = await db2.patients.toArray();
  assert.strictEqual(remainingAfterDelete2.length, 2, "Two patients should remain (1001 and 1003)");
  assert(!remainingAfterDelete2.some((p) => p.uhid === "HC-1002"), "1002 must be deleted");
  const p4 = await patients.registerPatient(
    { name: "Patient Four", age: 35, gender: "F", mobile: "9444444444" },
    "admin"
  );
  assert.strictEqual(p4.uhid, "HC-1004", `Expected HC-1004, got ${p4.uhid}`);
  ok("TEST 3: Deleted patient 1002; next patient receives HC-1004 (no reuse of 1002)");
  await patients.deletePatient(p1.id, "admin");
  await patients.deletePatient(p3.id, "admin");
  const remainingAfterDelete1and3 = await db2.patients.toArray();
  assert.strictEqual(remainingAfterDelete1and3.length, 1, "Patient 1004 must still exist in DB");
  assert.strictEqual(remainingAfterDelete1and3[0].uhid, "HC-1004");
  const p5 = await patients.registerPatient(
    { name: "Patient Five", age: 50, gender: "M", mobile: "9555555555" },
    "admin"
  );
  assert.strictEqual(p5.uhid, "HC-1005", `Expected HC-1005, got ${p5.uhid}`);
  ok("TEST 4: Deleted patients 1001 and 1003 (1004 remains); next patient receives HC-1005");
  await patients.deletePatient(p4.id, "admin");
  await patients.deletePatient(p5.id, "admin");
  const remainingZero = await db2.patients.count();
  assert.strictEqual(remainingZero, 0, "Database must now contain zero patients");
  const pNew = await patients.registerPatient(
    { name: "Patient After Individual Deletions", age: 22, gender: "F", mobile: "9666666666" },
    "admin"
  );
  assert.strictEqual(pNew.uhid, "HC-1006", `Expected HC-1006 after individual deletions, got ${pNew.uhid}`);
  ok("TEST 5: Individual deletes resulting in zero patients -> Sequence NOT reset, next receives HC-1006");
  await patients.clearAllPatients("admin");
  const afterClearCount = await db2.patients.count();
  assert.strictEqual(afterClearCount, 0, "Patients must be 0 after Delete All Patients");
  const pReset1 = await patients.registerPatient(
    { name: "Patient After Delete All", age: 29, gender: "M", mobile: "9777777777" },
    "admin"
  );
  assert.strictEqual(pReset1.uhid, "HC-1001", `Expected HC-1001 after Delete All Patients reset, got ${pReset1.uhid}`);
  const pReset2 = await patients.registerPatient(
    { name: "Second Patient After Delete All", age: 31, gender: "F", mobile: "9888888888" },
    "admin"
  );
  assert.strictEqual(pReset2.uhid, "HC-1002", `Expected HC-1002 after Delete All Patients reset, got ${pReset2.uhid}`);
  ok('TEST 6: "Delete All Patients" explicitly resets sequence -> Next patients receive HC-1001, then HC-1002');
} catch (err) {
  fail("Part 1 failure", err);
}
console.log("\n--- PART 2: Cloudflare D1 Backend Engine Verification ---");
{
  const tables = {
    clinic_settings: [
      {
        id: "1",
        clinic_name: "HEEVA CLINIC",
        uhid_prefix: "HC",
        uhid_include_year: 0,
        uhid_padding: 4,
        uhid_start: 1001
      }
    ],
    counters: [],
    patients: []
  };
  const mockD1 = {
    prepare(sql) {
      const trimmed = sql.trim();
      let bound = [];
      const stmt = {
        sql: trimmed,
        bind(...args) {
          bound = args;
          stmt.bound = args;
          return stmt;
        },
        async first() {
          if (/SELECT \* FROM clinic_settings/i.test(trimmed)) {
            return tables.clinic_settings[0] || null;
          }
          if (/SELECT COUNT\(\*\) as count FROM patients/i.test(trimmed)) {
            return { count: tables.patients.length };
          }
          if (/SELECT \* FROM counters/i.test(trimmed)) {
            return tables.counters.find((c) => bound.includes(c.key) || bound.includes(c.id)) || null;
          }
          if (/SELECT \* FROM "?patients"? WHERE id = \?/i.test(trimmed)) {
            const id = bound[0];
            return tables.patients.find((p) => p.id === id) || null;
          }
          return null;
        },
        async run() {
          if (/DELETE FROM "?patients"? WHERE id = \?/i.test(trimmed)) {
            const id = bound[0];
            tables.patients = tables.patients.filter((p) => p.id !== id);
            return { success: true };
          }
          if (/UPDATE counters SET value = 0/i.test(trimmed)) {
            tables.counters.forEach((c) => {
              if (String(c.key).startsWith("UHID|")) c.value = 0;
            });
            return { success: true };
          }
          return { success: true };
        }
      };
      stmt.all = async () => {
        if (/SELECT uhid FROM patients/i.test(trimmed)) {
          return { results: tables.patients.map((p) => ({ uhid: p.uhid })) };
        }
        return { results: [] };
      };
      return stmt;
    },
    async batch(stmts) {
      for (const stmt of stmts) {
        const sql = stmt.sql;
        const bound = stmt.bound || [];
        if (/INSERT INTO counters/i.test(sql)) {
          let id, key, val, created_at, updated_at;
          const matchLiteral = sql.match(/VALUES\s*\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(?:(\d+)|\?)\s*,\s*(?:\?|'[^']*')\s*,\s*(?:\?|'[^']*')\s*\)/i);
          if (matchLiteral) {
            id = matchLiteral[1];
            key = matchLiteral[2];
            val = matchLiteral[3] !== void 0 ? Number(matchLiteral[3]) : bound[0];
            created_at = bound[1] || (/* @__PURE__ */ new Date()).toISOString();
            updated_at = bound[2] || created_at;
          } else {
            [id, key, val, created_at, updated_at] = bound;
          }
          const idx = tables.counters.findIndex((c) => c.id === id || c.key === key);
          if (idx >= 0) {
            tables.counters[idx].value = val;
            tables.counters[idx].updated_at = updated_at;
          } else {
            tables.counters.push({ id, key, value: val, created_at, updated_at });
          }
        } else if (/INSERT INTO patients/i.test(sql)) {
          const match = sql.match(/INSERT INTO patients \((.*?)\)/i);
          if (match) {
            const cols = match[1].split(",").map((c) => c.replace(/["\s]/g, ""));
            const record = {};
            cols.forEach((col, i) => {
              record[col] = bound[i];
            });
            tables.patients.push(record);
          }
        } else if (/DELETE FROM patient_vitals/i.test(sql)) {
        } else if (/DELETE FROM patients/i.test(sql)) {
          tables.patients = [];
        }
      }
      return { success: true };
    }
  };
  const prev1 = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(prev1.nextUhid, "HC-1001", "Preview for 0 patients must be HC-1001");
  const d1p1 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 1", age: 30, gender: "M", mobile: "9111111111" });
  assert.strictEqual(d1p1.uhid, "HC-1001");
  ok("D1 TEST 1: Zero patients in D1 -> preview and allocated UHID are HC-1001");
  const d1p2 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 2", age: 25, gender: "F", mobile: "9222222222" });
  const d1p3 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 3", age: 40, gender: "M", mobile: "9333333333" });
  assert.strictEqual(d1p2.uhid, "HC-1002");
  assert.strictEqual(d1p3.uhid, "HC-1003");
  ok("D1 TEST 2: Sequential allocation produces HC-1002 and HC-1003");
  await d1Client2.remove(mockD1, "patients", d1p2.id);
  assert.strictEqual(tables.patients.length, 2, "2 patients remain in D1");
  const prevAfterDelete2 = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterDelete2.nextUhid, "HC-1004", "Preview must be HC-1004");
  const d1p4 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 4", age: 35, gender: "F", mobile: "9444444444" });
  assert.strictEqual(d1p4.uhid, "HC-1004", `Expected HC-1004, got ${d1p4.uhid}`);
  ok("D1 TEST 3: Deleting 1002 individually does NOT reset or reuse counter; next patient is HC-1004");
  await d1Client2.remove(mockD1, "patients", d1p1.id);
  await d1Client2.remove(mockD1, "patients", d1p3.id);
  assert.strictEqual(tables.patients.length, 1, "Patient 1004 remains in D1");
  const d1p5 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 5", age: 50, gender: "M", mobile: "9555555555" });
  assert.strictEqual(d1p5.uhid, "HC-1005", `Expected HC-1005, got ${d1p5.uhid}`);
  ok("D1 TEST 4: Deleting 1001 and 1003 leaves 1004 in DB; next patient is HC-1005");
  await d1Client2.remove(mockD1, "patients", d1p4.id);
  await d1Client2.remove(mockD1, "patients", d1p5.id);
  assert.strictEqual(tables.patients.length, 0, "D1 now has genuinely 0 patients via individual deletes");
  const prevAfterZero = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterZero.nextUhid, "HC-1006", "Preview after individual deletions to 0 must be HC-1006 (counter preserved)");
  const d1Fresh = await d1Client2.allocatePatient(mockD1, { name: "D1 Fresh", age: 28, gender: "F", mobile: "9777777777" });
  assert.strictEqual(d1Fresh.uhid, "HC-1006", `Expected HC-1006, got ${d1Fresh.uhid}`);
  ok("D1 TEST 5: Individual deletes resulting in 0 patients preserves counter -> HC-1006 allocated");
  const clearRes = await handleClearPatients2({ confirmation: "DELETE PATIENTS" }, { DB: mockD1 });
  assert.strictEqual(clearRes.status, 200);
  assert.strictEqual(tables.patients.length, 0, "Patients table must be 0 after Delete All Patients");
  const prevAfterClear = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterClear.nextUhid, "HC-1001", "Preview after Delete All Patients must be HC-1001");
  const pAfterClear1 = await d1Client2.allocatePatient(mockD1, { name: "Patient After D1 Clear", age: 24, gender: "M", mobile: "9888888880" });
  assert.strictEqual(pAfterClear1.uhid, "HC-1001", `Expected HC-1001, got ${pAfterClear1.uhid}`);
  ok('D1 TEST 6: "Delete All Patients" resets UHID sequence -> next patient receives HC-1001');
  const laptop1Patient = await d1Client2.allocatePatient(mockD1, { name: "Laptop 1 Patient", age: 45, gender: "M", mobile: "9888888881" });
  const laptop2Patient = await d1Client2.allocatePatient(mockD1, { name: "Laptop 2 Patient", age: 32, gender: "F", mobile: "9888888882" });
  assert.strictEqual(laptop1Patient.uhid, "HC-1002");
  assert.strictEqual(laptop2Patient.uhid, "HC-1003");
  assert.notStrictEqual(laptop1Patient.uhid, laptop2Patient.uhid, "Multi-laptop UHIDs must be strictly distinct");
  ok("D1 TEST 7: Multi-laptop simulation: Laptop 1 (HC-1002) & Laptop 2 (HC-1003) receive unique sequential UHIDs");
  const previewAfterReload = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(previewAfterReload.nextUhid, "HC-1004");
  const nextReloadPatient = await d1Client2.allocatePatient(mockD1, { name: "Post-Reload Patient", age: 29, gender: "M", mobile: "9888888889" });
  assert.strictEqual(nextReloadPatient.uhid, "HC-1004");
  ok("D1 TEST 8: State persistence: preview and subsequent patient continue sequence to HC-1004");
}
console.log("\n================================================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed.`);
console.log("================================================================");
if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
