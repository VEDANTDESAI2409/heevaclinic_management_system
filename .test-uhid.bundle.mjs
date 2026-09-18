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
var TOKEN_KEY, getAuthToken, getBaseUrl, getRecords, createRecord, updateRecord, deleteRecord, createPatient;
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
    getRecords = (table) => request(`/${table}`);
    createRecord = (table, record) => request(`/${table}`, { method: "POST", body: JSON.stringify(record) });
    updateRecord = (table, id, patch) => request(`/${table}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
    deleteRecord = (table, id) => request(`/${table}/${encodeURIComponent(id)}`, { method: "DELETE" });
    createPatient = (patient) => createRecord("patients", patient);
  }
});

// src/lib/remoteSync.js
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
  const next = row ? row.value + 1 : start;
  await db_default.counters.put({ key, value: next });
  return next;
}
async function makeUHID(settings, year = (/* @__PURE__ */ new Date()).getFullYear()) {
  const s = settings || await getSettings();
  const key = s.uhid_include_year ? `UHID|${year}` : "UHID|ALL";
  const patientCount = await db_default.patients.count();
  const start = Number(s.uhid_start) || 1;
  let n;
  if (patientCount === 0) {
    n = start;
    await db_default.counters.put({ key, value: n });
  } else {
    n = await nextCounter(key, start);
  }
  const pad = Number(s.uhid_padding) || 6;
  const prefix = (s.uhid_prefix || "HC").trim().toUpperCase();
  return `${prefix}${s.uhid_include_year ? `-${year}` : ""}-${String(n).padStart(pad, "0")}`;
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

// src/services/patients.js
var patients_exports = {};
__export(patients_exports, {
  VITAL_FIELDS: () => VITAL_FIELDS,
  addVitals: () => addVitals,
  ageOf: () => ageOf,
  archivePatient: () => archivePatient,
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
          const year = (/* @__PURE__ */ new Date()).getFullYear();
          const key = settings.uhid_include_year ? `UHID|${year}` : "UHID|ALL";
          const match = serverPatient.uhid.match(/-(\d+)$/);
          if (match) {
            await db_default.counters.put({ key, value: Number(match[1]) });
          }
        } finally {
          db_default.__hydrating = prevHydrating;
        }
        await audit(userId, "PATIENT_CREATE", "patient", serverPatient.id, `${serverPatient.name} \xB7 ${serverPatient.uhid}`);
        return serverPatient;
      }
    } catch (err) {
      console.warn("[registerPatient] Server allocation failed or offline, falling back to local transaction:", err.message);
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
    const remaining = await db_default.patients.count();
    if (remaining === 0) {
      const uhidCounters = await db_default.counters.filter((c) => String(c.key).startsWith("UHID|")).toArray();
      for (const c of uhidCounters) {
        await db_default.counters.put({ ...c, value: 0 });
      }
    }
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
var tableAliases, resolveCollection, tableColumns;
var init_tables = __esm({
  "worker/db/tables.js"() {
    tableAliases = {
      settings: "clinic_settings",
      batches: "medicine_batches",
      inventory_txns: "inventory_transactions"
    };
    resolveCollection = (name) => tableAliases[name] || name;
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
        "frequency",
        "duration",
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
      async getNextUhidPreview(db3) {
        const settingsRow = await db3.prepare("SELECT * FROM clinic_settings LIMIT 1").first() || {};
        const year = (/* @__PURE__ */ new Date()).getFullYear();
        const includeYear = settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false;
        const counterKey = includeYear ? `UHID|${year}` : "UHID|ALL";
        const pad = Number(settingsRow.uhid_padding) || 6;
        const prefix = (settingsRow.uhid_prefix || "HC").trim().toUpperCase();
        const start = Number(settingsRow.uhid_start) || 1;
        const countRow = await db3.prepare("SELECT COUNT(*) as count FROM patients").first();
        const patientCount = countRow ? Number(countRow.count) : 0;
        let nextNumber;
        if (patientCount === 0) {
          nextNumber = start;
        } else {
          const counterRow = await db3.prepare("SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1").bind(counterKey, counterKey).first();
          nextNumber = counterRow ? Number(counterRow.value) + 1 : start;
        }
        const nextUhid = `${prefix}${includeYear ? `-${year}` : ""}-${String(nextNumber).padStart(pad, "0")}`;
        return {
          ok: true,
          nextUhid,
          nextNumber,
          counterKey,
          pad,
          prefix,
          year,
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
        const year = (/* @__PURE__ */ new Date()).getFullYear();
        const includeYear = settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false;
        const counterKey = includeYear ? `UHID|${year}` : "UHID|ALL";
        const pad = Number(settingsRow.uhid_padding) || 6;
        const prefix = (settingsRow.uhid_prefix || "HC").trim().toUpperCase();
        const start = Number(settingsRow.uhid_start) || 1;
        const countRow = await db3.prepare("SELECT COUNT(*) as count FROM patients").first();
        const patientCount = countRow ? Number(countRow.count) : 0;
        let uhid = item.uhid ? String(item.uhid).trim() : null;
        let nextVal;
        if (patientCount === 0) {
          nextVal = start;
          if (!uhid) {
            uhid = `${prefix}${includeYear ? `-${year}` : ""}-${String(nextVal).padStart(pad, "0")}`;
          }
        } else {
          const counterRow = await db3.prepare("SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1").bind(counterKey, counterKey).first();
          nextVal = counterRow ? Number(counterRow.value) + 1 : start;
          if (!uhid) {
            uhid = `${prefix}${includeYear ? `-${year}` : ""}-${String(nextVal).padStart(pad, "0")}`;
          }
        }
        if (uhid) {
          const match = uhid.match(/-(\d+)$/);
          if (match) {
            const numInUhid = Number(match[1]);
            if (!isNaN(numInUhid) && numInUhid > nextVal) {
              nextVal = numInUhid;
            }
          }
        }
        const itemAge = item.age !== void 0 && item.age !== null && item.age !== "" ? Number(item.age) : item.dob ? Math.max(0, Math.floor((Date.now() - new Date(item.dob).getTime()) / (365.25 * 24 * 3600 * 1e3))) : null;
        const itemCreatedAt = item.created_at || now;
        const itemRegDate = item.reg_date || itemCreatedAt.slice(0, 10) || today;
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
          // 1. Atomically update counter
          db3.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).bind(counterKey, counterKey, nextVal, now, now),
          // 2. Insert patient record
          db3.prepare(`INSERT INTO patients ("${cols.join('", "')}") VALUES (${placeholders.join(", ")})`).bind(...values)
        ];
        await db3.batch(batchStmts);
        return this.getById(db3, "patients", id);
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
        return this.getById(db3, actual, strId);
      },
      async remove(db3, collection, id) {
        const actual = resolveCollection(collection);
        const strId = String(id);
        let deleteSql;
        if (actual === "counters") {
          deleteSql = "DELETE FROM counters WHERE key = ? OR id = ?";
          await db3.prepare(deleteSql).bind(strId, strId).run();
        } else {
          deleteSql = `DELETE FROM "${actual}" WHERE id = ?`;
          await db3.prepare(deleteSql).bind(strId).run();
        }
        if (actual === "patients") {
          const countRow = await db3.prepare("SELECT COUNT(*) as count FROM patients").first();
          const remaining = countRow ? Number(countRow.count) : 0;
          if (remaining === 0) {
            const now = nowISO2();
            await db3.prepare("UPDATE counters SET value = 0, updated_at = ? WHERE key LIKE 'UHID|%' OR id LIKE 'UHID|%'").bind(now).run();
          }
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
          const year = (/* @__PURE__ */ new Date()).getFullYear();
          const counterKey = settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false ? `UHID|${year}` : "UHID|ALL";
          const pad = Number(settingsRow.uhid_padding) || 6;
          const prefix = (settingsRow.uhid_prefix || "HC").trim().toUpperCase();
          const countRow = await db3.prepare("SELECT COUNT(*) as count FROM patients").first();
          const patientCount = countRow ? Number(countRow.count) : 0;
          const counterRow = await db3.prepare("SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1").bind(counterKey, counterKey).first();
          let counterVal;
          if (patientCount === 0) {
            counterVal = (Number(settingsRow.uhid_start) || 1) - 1;
          } else {
            counterVal = counterRow ? Number(counterRow.value) : (Number(settingsRow.uhid_start) || 1) - 1;
          }
          const newPatients = [];
          const skipped = [];
          const batchStmts = [];
          for (const item of items) {
            const itemAge = item.age !== void 0 && item.age !== null && item.age !== "" ? Number(item.age) : item.dob ? Math.max(0, Math.floor((Date.now() - new Date(item.dob).getTime()) / (365.25 * 24 * 3600 * 1e3))) : null;
            if (!item.name || itemAge == null || isNaN(itemAge) || !item.gender || !item.mobile) {
              skipped.push({ item, reason: "Missing required field (name, age, gender, or mobile)" });
              continue;
            }
            counterVal++;
            const uhid = item.uhid || `${prefix}${settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false ? `-${year}` : ""}-${String(counterVal).padStart(pad, "0")}`;
            const itemCreatedAt = item.created_at || (item.date_time ? new Date(item.date_time).toISOString() : null) || now;
            const itemRegDate = item.reg_date || (itemCreatedAt ? itemCreatedAt.slice(0, 10) : today);
            const p = {
              id: item.id || crypto.randomUUID(),
              uhid,
              name: String(item.name).trim(),
              age: itemAge,
              gender: item.gender,
              mobile: String(item.mobile),
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
            id: counterKey,
            key: counterKey,
            value: counterVal,
            updated_at: now
          };
          batchStmts.push(
            db3.prepare("INSERT OR REPLACE INTO counters (id, key, value, updated_at) VALUES (?, ?, ?, ?)").bind(counterKey, counterKey, counterVal, now)
          );
          if (batchStmts.length > 0) {
            await db3.batch(batchStmts);
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
            const batchId = item.id || crypto.randomUUID();
            const batch = {
              id: batchId,
              medicine_id: med.id,
              batch_no: batchNo,
              mfg_date: item.mfg_date || today,
              expiry: item.expiry || "9999-12-31",
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

// scripts/test-uhid-sequence.mjs
import "fake-indexeddb/auto";
import assert from "node:assert";
var { default: db2 } = await Promise.resolve().then(() => (init_db(), db_exports));
var core = await Promise.resolve().then(() => (init_core(), core_exports));
var patients = await Promise.resolve().then(() => (init_patients(), patients_exports));
var { d1Client: d1Client2 } = await Promise.resolve().then(() => (init_d1Client(), d1Client_exports));
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
  assert.strictEqual(p1.uhid, "HC-2026-000001", `Expected HC-2026-000001, got ${p1.uhid}`);
  ok("TEST 1: Zero patients in DB -> First patient receives HC-2026-000001");
  const p22 = await patients.registerPatient(
    { name: "Patient Two", age: 25, gender: "F", mobile: "9222222222" },
    "admin"
  );
  const p3 = await patients.registerPatient(
    { name: "Patient Three", age: 40, gender: "M", mobile: "9333333333" },
    "admin"
  );
  assert.strictEqual(p22.uhid, "HC-2026-000002", `Expected HC-2026-000002, got ${p22.uhid}`);
  assert.strictEqual(p3.uhid, "HC-2026-000003", `Expected HC-2026-000003, got ${p3.uhid}`);
  ok("TEST 2: Three patients created sequentially: 000001, 000002, 000003");
  await patients.deletePatient(p22.id, "admin");
  const remainingAfterDelete2 = await db2.patients.toArray();
  assert.strictEqual(remainingAfterDelete2.length, 2, "Two patients should remain (001 and 003)");
  assert(!remainingAfterDelete2.some((p) => p.uhid === "HC-2026-000002"), "002 must be deleted");
  const p4 = await patients.registerPatient(
    { name: "Patient Four", age: 35, gender: "F", mobile: "9444444444" },
    "admin"
  );
  assert.strictEqual(p4.uhid, "HC-2026-000004", `Expected HC-2026-000004, got ${p4.uhid}`);
  ok("TEST 3: Deleted patient 002; next patient receives HC-2026-000004 (no reuse of 002)");
  await patients.deletePatient(p1.id, "admin");
  await patients.deletePatient(p3.id, "admin");
  const remainingAfterDelete1and3 = await db2.patients.toArray();
  assert.strictEqual(remainingAfterDelete1and3.length, 1, "Patient 004 must still exist in DB");
  assert.strictEqual(remainingAfterDelete1and3[0].uhid, "HC-2026-000004");
  const p5 = await patients.registerPatient(
    { name: "Patient Five", age: 50, gender: "M", mobile: "9555555555" },
    "admin"
  );
  assert.strictEqual(p5.uhid, "HC-2026-000005", `Expected HC-2026-000005, got ${p5.uhid}`);
  ok("TEST 4: Deleted patients 001 and 003 (004 remains); next patient receives HC-2026-000005");
  await patients.deletePatient(p4.id, "admin");
  await patients.deletePatient(p5.id, "admin");
  const remainingZero = await db2.patients.count();
  assert.strictEqual(remainingZero, 0, "Database must now contain zero patients");
  const pNew = await patients.registerPatient(
    { name: "Patient Fresh Start", age: 22, gender: "F", mobile: "9666666666" },
    "admin"
  );
  assert.strictEqual(pNew.uhid, "HC-2026-000001", `Expected HC-2026-000001 after full clear, got ${pNew.uhid}`);
  ok("TEST 5: All patients deleted (zero remaining) -> Next patient restarts from HC-2026-000001");
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
        uhid_include_year: 1,
        uhid_padding: 6,
        uhid_start: 1
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
            const key = bound[0];
            return tables.counters.find((c) => c.key === key || c.id === key) || null;
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
      return stmt;
    },
    async batch(stmts) {
      for (const stmt of stmts) {
        const sql = stmt.sql;
        const bound = stmt.bound || [];
        if (/INSERT INTO counters/i.test(sql)) {
          const [id, key, val, created_at, updated_at] = bound;
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
        }
      }
      return { success: true };
    }
  };
  const prev1 = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(prev1.nextUhid, "HC-2026-000001", "Preview for 0 patients must be HC-2026-000001");
  const d1p1 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 1", age: 30, gender: "M", mobile: "9111111111" });
  assert.strictEqual(d1p1.uhid, "HC-2026-000001");
  ok("D1 TEST 1: Zero patients in D1 -> preview and allocated UHID are HC-2026-000001");
  const d1p2 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 2", age: 25, gender: "F", mobile: "9222222222" });
  const d1p3 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 3", age: 40, gender: "M", mobile: "9333333333" });
  assert.strictEqual(d1p2.uhid, "HC-2026-000002");
  assert.strictEqual(d1p3.uhid, "HC-2026-000003");
  ok("D1 TEST 2: Sequential allocation produces HC-2026-000002 and HC-2026-000003");
  await d1Client2.remove(mockD1, "patients", d1p2.id);
  assert.strictEqual(tables.patients.length, 2, "2 patients remain in D1");
  const prevAfterDelete2 = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterDelete2.nextUhid, "HC-2026-000004", "Preview must be HC-2026-000004");
  const d1p4 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 4", age: 35, gender: "F", mobile: "9444444444" });
  assert.strictEqual(d1p4.uhid, "HC-2026-000004", `Expected HC-2026-000004, got ${d1p4.uhid}`);
  ok("D1 TEST 3: Deleting 002 does NOT reset or reuse counter; next patient is HC-2026-000004");
  await d1Client2.remove(mockD1, "patients", d1p1.id);
  await d1Client2.remove(mockD1, "patients", d1p3.id);
  assert.strictEqual(tables.patients.length, 1, "Patient 004 remains in D1");
  const d1p5 = await d1Client2.allocatePatient(mockD1, { name: "D1 Patient 5", age: 50, gender: "M", mobile: "9555555555" });
  assert.strictEqual(d1p5.uhid, "HC-2026-000005", `Expected HC-2026-000005, got ${d1p5.uhid}`);
  ok("D1 TEST 4: Deleting 001 and 003 leaves 004 in DB; next patient is HC-2026-000005");
  await d1Client2.remove(mockD1, "patients", d1p4.id);
  await d1Client2.remove(mockD1, "patients", d1p5.id);
  assert.strictEqual(tables.patients.length, 0, "D1 now has genuinely 0 patients");
  const prevAfterZero = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(prevAfterZero.nextUhid, "HC-2026-000001", "Preview after zero patients must be HC-2026-000001");
  const d1Fresh = await d1Client2.allocatePatient(mockD1, { name: "D1 Fresh", age: 28, gender: "F", mobile: "9777777777" });
  assert.strictEqual(d1Fresh.uhid, "HC-2026-000001", `Expected HC-2026-000001, got ${d1Fresh.uhid}`);
  ok("D1 TEST 5: All patients deleted in D1 -> sequence restarts cleanly from HC-2026-000001");
  const laptop1Patient = await d1Client2.allocatePatient(mockD1, { name: "Laptop 1 Patient", age: 45, gender: "M", mobile: "9888888881" });
  const laptop2Patient = await d1Client2.allocatePatient(mockD1, { name: "Laptop 2 Patient", age: 32, gender: "F", mobile: "9888888882" });
  assert.strictEqual(laptop1Patient.uhid, "HC-2026-000002");
  assert.strictEqual(laptop2Patient.uhid, "HC-2026-000003");
  assert.notStrictEqual(laptop1Patient.uhid, laptop2Patient.uhid, "Multi-laptop UHIDs must be strictly distinct");
  ok("D1 TEST 6: Multi-laptop simulation: Laptop 1 (000002) & Laptop 2 (000003) receive unique sequential UHIDs");
  const previewAfterReload = await d1Client2.getNextUhidPreview(mockD1);
  assert.strictEqual(previewAfterReload.nextUhid, "HC-2026-000004");
  const nextReloadPatient = await d1Client2.allocatePatient(mockD1, { name: "Post-Reload Patient", age: 29, gender: "M", mobile: "9888888883" });
  assert.strictEqual(nextReloadPatient.uhid, "HC-2026-000004");
  ok("D1 TEST 7: State persistence: preview and subsequent patient continue sequence to HC-2026-000004");
}
console.log("\n================================================================");
console.log(`RESULTS: ${passed} passed, ${failed} failed.`);
console.log("================================================================");
if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
