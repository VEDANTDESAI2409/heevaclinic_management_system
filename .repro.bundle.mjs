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
var api_exports = {};
__export(api_exports, {
  adminApi: () => adminApi,
  authApi: () => authApi,
  bulkImportRecords: () => bulkImportRecords,
  clearAuthToken: () => clearAuthToken,
  createAppointment: () => createAppointment,
  createMedicine: () => createMedicine2,
  createPatient: () => createPatient,
  createRecord: () => createRecord,
  deleteAppointment: () => deleteAppointment,
  deleteMedicine: () => deleteMedicine,
  deletePatient: () => deletePatient,
  deleteRecord: () => deleteRecord,
  getAppointments: () => getAppointments,
  getAuthToken: () => getAuthToken,
  getHealth: () => getHealth,
  getMedicines: () => getMedicines,
  getPatients: () => getPatients,
  getRecord: () => getRecord,
  getRecords: () => getRecords,
  setAuthToken: () => setAuthToken,
  updateAppointment: () => updateAppointment,
  updateMedicine: () => updateMedicine,
  updatePatient: () => updatePatient,
  updateRecord: () => updateRecord
});
async function request(path, options = {}) {
  const base = getBaseUrl();
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...token ? { Authorization: `Bearer ${token}` } : {},
    ...options.headers || {}
  };
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      ...options,
      headers,
      cache: "no-store"
      // Always bypass HTTP disk/memory cache for dynamic clinic data
    });
  } catch (error) {
    if (typeof window !== "undefined" && !(typeof process !== "undefined" && process.versions?.node)) {
      console.error("[API] network error", error);
    }
    throw new Error("Unable to reach the server. Start the backend with npm run dev.");
  }
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("heeva:unauthorized", { detail: { path } }));
    }
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.error || `Request failed (${response.status})`;
    if (response.status !== 404) {
      console.error("[API]", path, message);
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }
  return response.status === 204 ? null : response.json();
}
var TOKEN_KEY, getAuthToken, setAuthToken, clearAuthToken, getBaseUrl, authApi, adminApi, getHealth, getRecords, getRecord, createRecord, updateRecord, deleteRecord, bulkImportRecords, getPatients, createPatient, updatePatient, deletePatient, getMedicines, createMedicine2, updateMedicine, deleteMedicine, getAppointments, createAppointment, updateAppointment, deleteAppointment;
var init_api = __esm({
  "src/services/api.js"() {
    TOKEN_KEY = "heeva_auth_token";
    getAuthToken = () => {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(TOKEN_KEY);
      }
      return null;
    };
    setAuthToken = (token) => {
      if (typeof window !== "undefined" && window.localStorage) {
        if (token) {
          window.localStorage.setItem(TOKEN_KEY, token);
        } else {
          window.localStorage.removeItem(TOKEN_KEY);
        }
      }
    };
    clearAuthToken = () => setAuthToken(null);
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
    authApi = {
      async login(password) {
        const res = await request("/auth/login", {
          method: "POST",
          body: JSON.stringify({ password })
        });
        if (res && res.token) {
          setAuthToken(res.token);
        }
        return res;
      },
      async verify() {
        const token = getAuthToken();
        if (!token) return false;
        try {
          const res = await request("/auth/verify", { method: "POST" });
          return !!(res && res.ok);
        } catch (err) {
          if (err.status === 401) {
            clearAuthToken();
          }
          return false;
        }
      },
      async logout() {
        try {
          await request("/auth/logout", { method: "POST" });
        } catch (_) {
        } finally {
          clearAuthToken();
        }
      },
      getToken: getAuthToken,
      clearToken: clearAuthToken
    };
    adminApi = {
      async resetDatabase(password) {
        return request("/admin/reset", {
          method: "POST",
          body: JSON.stringify({ password })
        });
      }
    };
    getHealth = () => request("/health");
    getRecords = (table) => request(`/${table}`);
    getRecord = async (table, id) => {
      if (!id) return null;
      try {
        return await request(`/${table}/${encodeURIComponent(id)}`);
      } catch (error) {
        if (error.status === 404 || /404|Record not found|not found/i.test(error.message)) {
          return null;
        }
        throw error;
      }
    };
    createRecord = (table, record) => request(`/${table}`, { method: "POST", body: JSON.stringify(record) });
    updateRecord = (table, id, patch) => request(`/${table}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
    deleteRecord = (table, id) => request(`/${table}/${encodeURIComponent(id)}`, { method: "DELETE" });
    bulkImportRecords = (table, records, userId = null) => request(`/${table}/import`, { method: "POST", body: JSON.stringify({ records, userId }) });
    getPatients = () => getRecords("patients");
    createPatient = (patient) => createRecord("patients", patient);
    updatePatient = (id, patch) => updateRecord("patients", id, patch);
    deletePatient = (id) => deleteRecord("patients", id);
    getMedicines = () => getRecords("medicines");
    createMedicine2 = (medicine) => createRecord("medicines", medicine);
    updateMedicine = (id, patch) => updateRecord("medicines", id, patch);
    deleteMedicine = (id) => deleteRecord("medicines", id);
    getAppointments = () => getRecords("appointments");
    createAppointment = (appointment) => createRecord("appointments", appointment);
    updateAppointment = (id, patch) => updateRecord("appointments", id, patch);
    deleteAppointment = (id) => deleteRecord("appointments", id);
  }
});

// src/lib/remoteSync.js
var remoteSync_exports = {};
__export(remoteSync_exports, {
  deleteRecord: () => deleteRecord2,
  isBrowserRuntime: () => isBrowserRuntime,
  pushRecord: () => pushRecord,
  syncFromBackend: () => syncFromBackend,
  syncFromSqlite: () => syncFromSqlite
});
async function pushRecord(name, record) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !record) return;
  const table = remoteName(name);
  const id = name === "counters" ? record.key : name === "settings" ? "1" : record.id;
  if (!id && name !== "settings") return;
  try {
    await updateRecord(table, id, record);
  } catch (error) {
    console.error(`[remoteSync] Failed to persist ${name}:`, error.message);
  }
}
async function deleteRecord2(name, id) {
  if (!isBrowserRuntime() || !syncedTables.has(name) || !id) return;
  try {
    await deleteRecord(remoteName(name), id);
  } catch (error) {
    if (!/404|not found/i.test(error.message)) {
      console.error(`[remoteSync] Failed to delete ${name}:`, error.message);
    }
  }
}
async function syncFromBackend(db3) {
  if (!isBrowserRuntime()) return;
  db3.__hydrating = true;
  try {
    for (const name of syncOrder) {
      try {
        const rows = await getRecords(remoteName(name));
        if (name === "settings") {
          await db3.settings.clear();
          const row = rows?.[0];
          if (row) {
            await db3.settings.bulkPut(
              Object.entries(row).filter(([key]) => !["id", "created_at", "updated_at"].includes(key)).map(([key, value]) => ({ key, value }))
            );
          }
          continue;
        }
        if (db3[name] && Array.isArray(rows)) {
          const keyField = name === "counters" ? "key" : "id";
          const newKeySet = new Set(rows.map((r) => r[keyField]));
          const existingKeys = await db3[name].toCollection().primaryKeys();
          const toDelete = existingKeys.filter((k) => !newKeySet.has(k));
          if (rows.length > 0) {
            await db3[name].bulkPut(rows);
          }
          if (toDelete.length > 0) {
            await db3[name].bulkDelete(toDelete);
          }
        }
      } catch (tableErr) {
        console.error(`[remoteSync] Error syncing ${name} from D1:`, tableErr?.message || tableErr);
      }
    }
  } finally {
    db3.__hydrating = false;
  }
}
var syncOrder, syncedTables, remoteNames, remoteName, isBrowserRuntime, syncFromSqlite;
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
      prescriptions: "id, &prescription_no, patient_id, consultation_id, date",
      prescription_items: "id, prescription_id, medicine_id",
      appointments: "id, &appointment_no, patient_id, date, status",
      medicines: "id, &medicine_code, name, generic, barcode, category, active",
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
        if (!db.__hydrating) await deleteRecord2(name, key);
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
          for (const record of records) await deleteRecord2(name, record.id ?? record.key);
        }
        return clear();
      };
      if (bulkDelete) {
        table.bulkDelete = async (keys) => {
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
function ageLabel(p) {
  if (!p) return "\u2014";
  if (typeof p === "number") return `${p} yrs`;
  if (p.age != null && p.age !== "") return `${p.age} yrs`;
  if (p.approx_age != null && p.approx_age !== "") return `${p.approx_age} yrs`;
  if (p.dob) {
    const a = ageFromDob(p.dob);
    if (a != null) return `${a} yrs`;
  }
  return "\u2014";
}
function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const t = /* @__PURE__ */ new Date();
  t.setHours(0, 0, 0, 0);
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  return Math.round((d - t) / 864e5);
}
var p2, nowISO, isExpired;
var init_utils = __esm({
  "src/utils.js"() {
    p2 = (n) => String(n).padStart(2, "0");
    nowISO = () => (/* @__PURE__ */ new Date()).toISOString();
    isExpired = (dateStr) => daysUntil(dateStr) < 0;
  }
});

// src/services/core.js
async function getSettings() {
  const rows = await db_default.settings.toArray();
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
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
  const next = row ? row.value + 1 : start;
  await db_default.counters.put({ key, value: next });
  return next;
}
async function makeNo(kind, prefix, year = (/* @__PURE__ */ new Date()).getFullYear(), padding = 6, start = 1) {
  const n = await nextCounter(`${kind}|${year}`, start);
  return `${prefix}-${year}-${String(n).padStart(padding, "0")}`;
}
async function makeCode(kind, prefix, padding = 4, start = 1) {
  const n = await nextCounter(`${kind}|ALL`, start);
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
      uhid_include_year: true,
      uhid_padding: 6,
      uhid_start: 1,
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

// src/services/inventory.js
async function allocateFEFO(medicineId, qty, settings) {
  const s = settings || await getSettings();
  const need = Number(qty);
  if (!(need > 0)) throw new Error("Quantity must be positive");
  const batches = await db_default.batches.where("medicine_id").equals(medicineId).toArray();
  const usable = batches.filter((b) => (b.available || 0) > 0 && b.status !== "expired" && !isExpired(b.expiry));
  if (s.fefo !== false) {
    usable.sort((a, b) => (a.expiry || "9999") < (b.expiry || "9999") ? -1 : (a.expiry || "9999") > (b.expiry || "9999") ? 1 : 0);
  } else {
    usable.sort((a, b) => (a.mfg_date || "0000") < (b.mfg_date || "0000") ? -1 : 1);
  }
  let remaining = need;
  const alloc = [];
  for (const b of usable) {
    if (remaining <= 0) break;
    const take = Math.min(b.available, remaining);
    if (take > 0) {
      b.available = round2(b.available - take);
      alloc.push({ batch_id: b.id, batch_no: b.batch_no, expiry: b.expiry, qty: take });
      remaining = round2(remaining - take);
    }
  }
  if (remaining > 1e-3) {
    const expiredOnly = batches.some((b) => (b.available || 0) > 0 && isExpired(b.expiry));
    throw new Error(
      expiredOnly ? "Only expired stock remains for this medicine \u2014 expired medicines cannot be sold" : `Insufficient stock: ${need} requested, ${need - remaining} available`
    );
  }
  for (const a of alloc) await db_default.batches.put(batches.find((x) => x.id === a.batch_id));
  return alloc;
}
function txn(type, medicineId, batchId, qty, refId = null, note = "", by = null, at = null) {
  return db_default.inventory_txns.add({
    id: uid(),
    medicine_id: medicineId,
    batch_id: batchId || null,
    type,
    qty: round2(qty),
    ref_id: refId,
    at: at || nowISO(),
    by,
    note
  });
}
async function restoreBillStock(billItems, bill, userId) {
  for (const it of billItems) {
    if (it.item_type !== "medicine" || !it.batch_id) continue;
    const b = await db_default.batches.get(it.batch_id);
    const med = await db_default.medicines.get(it.ref_id);
    if (b) {
      await db_default.batches.put({ ...b, available: round2((b.available || 0) + it.qty), status: b.status === "expired" && isExpired(b.expiry) ? "expired" : b.status });
      await txn("CANCELLED_BILL", it.ref_id, b.id, it.qty, bill.id, `Bill ${bill.bill_no} cancelled`, userId);
    } else {
      await txn("CANCELLED_BILL", it.ref_id, null, it.qty, bill.id, `Bill ${bill.bill_no} cancelled \u2014 batch unavailable`, userId);
    }
    if (!med) continue;
  }
}
var init_inventory = __esm({
  "src/services/inventory.js"() {
    init_db();
    init_utils();
    init_core();
  }
});

// src/services/billing.js
var billing_exports = {};
__export(billing_exports, {
  PAY_METHODS: () => PAY_METHODS,
  archiveService: () => archiveService,
  cancelBill: () => cancelBill,
  createBill: () => createBill,
  createReturn: () => createReturn,
  createService: () => createService,
  deleteService: () => deleteService,
  getBill: () => getBill,
  importMedicinesCSV: () => importMedicinesCSV,
  recordPayment: () => recordPayment,
  updateService: () => updateService
});
function billTypeLabel(items) {
  const types = new Set(items.map((i) => i.item_type));
  if (types.size === 1) {
    const t = [...types][0];
    if (t === "consultation") return "CONSULTATION";
    if (t === "medicine") return "MEDICINES";
    if (t === "service") return "SERVICES";
  }
  return "COMBINED";
}
async function createBill({ patient_id, items, discount_mode = "amt", discount_value = 0, payments = [], when = null, doctor_id = null, doctor_name = null, doctor_phone = null, diagnosis = null, advice = null, next_visit = null }, userId) {
  const settings = await getSettings();
  return db_default.transaction("rw", [db_default.bills, db_default.bill_items, db_default.payments, db_default.batches, db_default.inventory_txns, db_default.counters, db_default.activity_logs, db_default.patients, db_default.medicines, db_default.services], async () => {
    const patient = await db_default.patients.get(patient_id);
    if (!patient) throw new Error("Patient not found");
    if (!Array.isArray(items) || !items.length) throw new Error("Bill has no items");
    const resolved = [];
    for (const it of items) {
      const qty = round2(it.qty);
      if (!(qty > 0)) continue;
      if (it.item_type === "medicine") {
        const med = await db_default.medicines.get(it.ref_id);
        if (!med || !med.active) throw new Error(`Medicine not available: ${it.name || it.ref_id}`);
        const alloc = await allocateFEFO(med.id, qty, settings);
        const price = it.price != null && it.price !== "" ? Number(it.price) : med.selling_price;
        for (const a of alloc) {
          resolved.push({
            item_type: "medicine",
            ref_id: med.id,
            name: med.name,
            qty: a.qty,
            price,
            batch_id: a.batch_id,
            batch_no: a.batch_no,
            dosage: it.dosage || null,
            timing: it.timing || null,
            frequency: it.frequency || null,
            duration: it.duration || null,
            composition: it.composition || null,
            notes: it.notes || null
          });
        }
      } else if (it.item_type === "service" || it.item_type === "consultation") {
        const svc = await db_default.services.get(it.ref_id);
        if (!svc || !svc.active) throw new Error(`Service not available: ${it.name || it.ref_id}`);
        resolved.push({
          item_type: it.item_type,
          ref_id: svc.id,
          name: svc.name,
          qty,
          price: it.price != null && it.price !== "" ? Number(it.price) : svc.price,
          dosage: it.dosage || null,
          timing: it.timing || null,
          frequency: it.frequency || null,
          duration: it.duration || null,
          composition: it.composition || null,
          notes: it.notes || null
        });
      } else throw new Error("Invalid item type");
    }
    if (!resolved.length) throw new Error("Bill has no valid items");
    const subtotal = round2(resolved.reduce((s, i) => s + i.qty * (Number(i.price) || 0), 0));
    const discRaw = discount_mode === "pct" ? subtotal * (Math.min(Number(discount_value) || 0, 100) / 100) : Number(discount_value) || 0;
    const discount = round2(Math.min(Math.max(discRaw, 0), subtotal));
    const total = round2(Math.max(0, subtotal - discount));
    const now = when || nowISO();
    const bill_no = await makeNo("BILL", settings.bill_prefix || "HC-BILL", new Date(now).getFullYear(), Number(settings.bill_padding) || 6);
    const bill = {
      id: uid(),
      bill_no,
      patient_id,
      uhid: patient.uhid,
      patient_name: patient.name,
      patient_mobile: patient.mobile || "",
      patient_age: ageLabel(patient),
      patient_gender: patient.gender || "",
      date: dkey(new Date(now)),
      time: now,
      doctor_name: doctor_name || settings.doctor_name || "Dr. Mit Nayak",
      doctor_phone: doctor_phone || settings.doctor_phone || "9913974000",
      diagnosis: diagnosis ? diagnosis.trim() : null,
      advice: advice ? advice.trim() : null,
      next_visit: next_visit ? next_visit.trim() : null,
      item_count: resolved.length,
      subtotal,
      discount,
      total,
      paid: 0,
      status: "completed",
      payment_status: "PENDING",
      bill_type: billTypeLabel(resolved),
      created_by: userId || null,
      created_at: now,
      cancel_reason: null,
      cancelled_at: null
    };
    await db_default.bills.add(bill);
    for (const it of resolved) {
      const amount = round2(it.qty * (Number(it.price) || 0));
      await db_default.bill_items.add({
        id: uid(),
        bill_id: bill.id,
        item_type: it.item_type,
        ref_id: it.ref_id,
        name: it.name,
        qty: it.qty,
        price: Number(it.price) || 0,
        amount,
        batch_id: it.batch_id || null,
        batch_no: it.batch_no || null,
        dosage: it.dosage || null,
        timing: it.timing || null,
        frequency: it.frequency || null,
        duration: it.duration || null,
        composition: it.composition || null,
        notes: it.notes || null,
        returned: 0
      });
    }
    for (const it of resolved.filter((i) => i.item_type === "medicine")) {
      await txn("SALE", it.ref_id, it.batch_id, -it.qty, bill.id, bill_no, userId, now);
    }
    let paid = 0;
    for (const pay of payments) {
      const amt = round2(pay.amount);
      if (!(amt > 0)) continue;
      paid = round2(paid + amt);
      await db_default.payments.add({
        id: uid(),
        bill_id: bill.id,
        patient_id,
        kind: "payment",
        amount: amt,
        method: PAY_METHODS.includes(pay.method) ? pay.method : "Other",
        note: pay.note || "",
        by: userId || null,
        at: now
      });
    }
    paid = Math.min(paid, total);
    bill.paid = paid;
    bill.payment_status = total - paid < 5e-3 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
    await db_default.bills.put(bill);
    await audit(userId, "BILL_CREATE", "bill", bill.id, `${bill_no} \xB7 ${patient.name} (${patient.uhid}) \xB7 total ${bill.total} \xB7 ${bill.payment_status}`);
    return {
      bill: await db_default.bills.get(bill.id),
      items: await db_default.bill_items.where("bill_id").equals(bill.id).toArray(),
      payments: await db_default.payments.where("bill_id").equals(bill.id).toArray()
    };
  });
}
async function getBill(billId) {
  const bill = await db_default.bills.get(billId);
  if (!bill) return null;
  const [items, payments] = await Promise.all([
    db_default.bill_items.where("bill_id").equals(billId).toArray(),
    db_default.payments.where("bill_id").equals(billId).toArray()
  ]);
  items.sort((a, b) => a.item_type.localeCompare(b.item_type));
  return { bill, items, payments: payments.sort((a, b) => a.at.localeCompare(b.at)) };
}
async function recordPayment(billId, { amount, method, note }, userId) {
  return db_default.transaction("rw", [db_default.bills, db_default.bill_items, db_default.payments, db_default.activity_logs], async () => {
    const bill = await db_default.bills.get(billId);
    if (!bill) throw new Error("Bill not found");
    if (bill.status !== "completed") throw new Error("Cannot record payment on a cancelled bill");
    const amt = round2(amount);
    if (!(amt > 0)) throw new Error("Amount must be positive");
    const balance = round2(bill.total - bill.paid);
    if (amt > balance + 5e-3) throw new Error(`Amount exceeds outstanding balance of ${balance}`);
    await db_default.payments.add({
      id: uid(),
      bill_id: billId,
      patient_id: bill.patient_id,
      kind: "payment",
      amount: amt,
      method: PAY_METHODS.includes(method) ? method : "Other",
      note: note || "",
      by: userId || null,
      at: nowISO()
    });
    const updated = { ...bill, paid: round2(bill.paid + amt) };
    updated.payment_status = updated.total - updated.paid < 5e-3 ? "PAID" : updated.paid > 0 ? "PARTIAL" : "PENDING";
    await db_default.bills.put(updated);
    await audit(userId, "PAYMENT_RECORD", "bill", billId, `${bill.bill_no} \xB7 +${amt} via ${method}`);
    return getBill(billId);
  });
}
async function cancelBill(billId, reason, userId) {
  if (!String(reason || "").trim()) throw new Error("Cancellation reason is required");
  return db_default.transaction("rw", [db_default.bills, db_default.bill_items, db_default.batches, db_default.inventory_txns, db_default.activity_logs, db_default.medicines, db_default.payments], async () => {
    const bill = await db_default.bills.get(billId);
    if (!bill) throw new Error("Bill not found");
    if (bill.status === "CANCELLED") throw new Error("Bill is already cancelled");
    if (bill.status !== "completed") throw new Error("Bill cannot be cancelled");
    const items = await db_default.bill_items.where("bill_id").equals(billId).toArray();
    await restoreBillStock(items, bill, userId);
    const updated = {
      ...bill,
      status: "CANCELLED",
      cancel_reason: String(reason).trim(),
      cancelled_at: nowISO(),
      cancelled_by: userId || null
    };
    await db_default.bills.put(updated);
    await audit(userId, "BILL_CANCEL", "bill", billId, `${bill.bill_no} \xB7 ${bill.patient_name} \xB7 reason: ${reason}`);
    return getBill(billId);
  });
}
async function createReturn({ bill_id, items, reason, refund_method = "Cash", refund_amount = 0, note = "" }, userId) {
  return db_default.transaction("rw", [db_default.returns, db_default.bill_items, db_default.batches, db_default.inventory_txns, db_default.payments, db_default.counters, db_default.activity_logs, db_default.bills, db_default.medicines], async () => {
    const full = await getBill(bill_id);
    if (!full) throw new Error("Bill not found");
    const bill = full.bill;
    if (bill.status !== "completed") throw new Error("Only completed bills can be returned against");
    if (!String(reason || "").trim()) throw new Error("Return reason is required");
    if (!Array.isArray(items) || !items.length) throw new Error("Select items to return");
    const return_no = await makeNo("RET", "HC-RET");
    const lines = [];
    for (const r of items) {
      const bi = full.items.find((i) => i.id === r.bill_item_id);
      if (!bi) throw new Error("Bill item not found");
      if (bi.item_type !== "medicine") throw new Error(`Only medicine items can be returned: ${bi.name}`);
      const qty = round2(r.qty);
      const already = bi.returned || 0;
      if (!(qty > 0)) throw new Error("Return quantity must be positive");
      if (qty > bi.qty - already + 1e-3) throw new Error(`Only ${round2(bi.qty - already)} of ${bi.name} can be returned`);
      const batch = bi.batch_id ? await db_default.batches.get(bi.batch_id) : null;
      if (!batch) throw new Error(`Batch for ${bi.name} is missing \u2014 contact administrator`);
      await db_default.batches.put({ ...batch, available: round2((batch.available || 0) + qty) });
      await txn("RETURN", bi.ref_id, batch.id, qty, bill.id, `Return \xB7 ${reason}`, userId);
      await db_default.bill_items.put({ ...bi, returned: round2(already + qty) });
      lines.push({ bill_item_id: bi.id, name: bi.name, qty, batch_no: bi.batch_no, amount: round2(qty * bi.price) });
    }
    const refund = round2(refund_amount);
    if (refund > 0) {
      if (refund > bill.paid + 5e-3) throw new Error("Refund cannot exceed amount paid");
      await db_default.payments.add({
        id: uid(),
        bill_id,
        patient_id: bill.patient_id,
        kind: "refund",
        amount: refund,
        method: PAY_METHODS.includes(refund_method) ? refund_method : "Other",
        note: `Return ${return_no}`,
        by: userId || null,
        at: nowISO()
      });
    }
    const ret = {
      id: uid(),
      return_no,
      bill_id,
      bill_no: bill.bill_no,
      patient_id: bill.patient_id,
      uhid: bill.uhid,
      patient_name: bill.patient_name,
      reason: String(reason).trim(),
      note,
      items: lines,
      refund,
      refund_method: refund > 0 ? refund_method : null,
      at: nowISO(),
      created_by: userId || null
    };
    await db_default.returns.add(ret);
    await audit(userId, "RETURN_CREATE", "return", ret.id, `${return_no} \xB7 bill ${bill.bill_no} \xB7 refund ${refund}`);
    return ret;
  });
}
async function importMedicinesCSV(rows, userId) {
  const results = { created: 0, skipped: 0, errors: [] };
  for (const r of rows) {
    const name = String(r.name || "").trim();
    if (!name) continue;
    const existing = (await db_default.medicines.filter((m) => m.name.toLowerCase() === name.toLowerCase()).toArray())[0];
    if (existing) {
      results.skipped++;
      continue;
    }
    try {
      await createMedicine({
        name,
        generic: r.generic || "",
        category: r.category || "Other",
        type: r.type || "Tablet",
        strength: r.strength || "",
        unit: r.unit || "strip",
        purchase_price: Number(r.purchase_price) || 0,
        selling_price: Number(r.selling_price) || 0,
        min_stock: Number(r.min_stock) || 0
      }, userId);
      results.created++;
    } catch (e) {
      results.errors.push(`${name}: ${e.message}`);
    }
  }
  return results;
}
async function createService(data, userId) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("Service name is required");
  const price = Number(data.price);
  if (isNaN(price) || price < 0) throw new Error("Valid service price is required");
  const code = await makeCode("SVC", "SRV");
  const svc = {
    id: uid(),
    service_code: code,
    name,
    type: data.type || "service",
    // 'consultation' | 'service'
    price: round2(price),
    description: data.description || "",
    active: 1,
    created_at: nowISO(),
    updated_at: nowISO()
  };
  await db_default.services.add(svc);
  await audit(userId, "SERVICE_CREATE", "service", svc.id, `${svc.name} (${svc.service_code}) \xB7 \u20B9${svc.price}`);
  return svc;
}
async function updateService(id, patch, userId) {
  const existing = await db_default.services.get(id);
  if (!existing) throw new Error("Service not found");
  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    service_code: existing.service_code,
    price: patch.price != null ? round2(Number(patch.price) || 0) : existing.price,
    updated_at: nowISO()
  };
  await db_default.services.put(updated);
  await audit(userId, "SERVICE_UPDATE", "service", id, Object.keys(patch).join(", "));
  return updated;
}
async function archiveService(id, userId) {
  const existing = await db_default.services.get(id);
  if (!existing) throw new Error("Service not found");
  const active = existing.active ? 0 : 1;
  const updated = { ...existing, active, updated_at: nowISO() };
  await db_default.services.put(updated);
  await audit(userId, active ? "SERVICE_REACTIVATE" : "SERVICE_ARCHIVE", "service", id, existing.name);
  return updated;
}
async function deleteService(id, userId) {
  const existing = await db_default.services.get(id);
  if (!existing) throw new Error("Service not found");
  const billItemCount = await db_default.bill_items.where("ref_id").equals(id).count();
  if (billItemCount > 0) {
    throw new Error("This service has billing history and cannot be permanently deleted. Deactivate or archive it instead.");
  }
  await db_default.services.delete(id);
  await audit(userId, "SERVICE_DELETE", "service", id, existing.name);
}
var PAY_METHODS;
var init_billing = __esm({
  "src/services/billing.js"() {
    init_db();
    init_utils();
    init_core();
    init_inventory();
    PAY_METHODS = ["Cash", "UPI", "Card", "Bank Transfer", "Other"];
  }
});

// scripts/repro-service.mjs
import { JSDOM } from "jsdom";
var dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
global.localStorage = dom.window.localStorage;
global.HTMLElement = dom.window.HTMLElement;
globalThis.__FORCE_SYNC__ = true;
var { db: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
var { syncFromBackend: syncFromBackend2 } = await Promise.resolve().then(() => (init_remoteSync(), remoteSync_exports));
var { authApi: authApi2, setAuthToken: setAuthToken2, getRecords: getRecords2 } = await Promise.resolve().then(() => (init_api(), api_exports));
var { createService: createService2, updateService: updateService2, deleteService: deleteService2 } = await Promise.resolve().then(() => (init_billing(), billing_exports));
async function testServices() {
  console.log("--- Authenticating ---");
  const login = await authApi2.login("heeva@26");
  setAuthToken2(login.token);
  console.log("Authenticated.");
  console.log("--- Initial Sync ---");
  await syncFromBackend2(db2);
  console.log("--- Creating Service ---");
  const svc = await createService2({
    name: "Consultation Fee",
    type: "consultation",
    price: 300,
    description: "General doctor consultation"
  }, "admin-user");
  console.log("Created local service:", svc);
  const localSvc = await db2.services.get(svc.id);
  console.log("Local svc in Dexie immediately:", localSvc ? "EXISTS" : "MISSING");
  const remoteRows = await getRecords2("services");
  console.log("Remote services in D1 count:", remoteRows.length, remoteRows);
  const foundRemote = remoteRows.find((r) => r.id === svc.id);
  console.log("Found in D1?:", foundRemote ? "YES" : "NO");
  console.log("--- Triggering syncFromBackend (simulating 2s / 8s timer) ---");
  await syncFromBackend2(db2);
  const localAfterSync = await db2.services.get(svc.id);
  console.log("Local svc in Dexie AFTER sync:", localAfterSync ? "STILL EXISTS" : "DISAPPEARED!");
}
testServices().catch(console.error);
