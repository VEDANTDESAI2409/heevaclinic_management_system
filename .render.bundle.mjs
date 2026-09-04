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
  let response;
  try {
    response = await fetch(`${base}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options
    });
  } catch (error) {
    if (typeof window !== "undefined" && !(typeof process !== "undefined" && process.versions?.node)) {
      console.error("[API] network error", error);
    }
    throw new Error("Unable to reach the server. Start the backend with npm run dev.");
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
var getBaseUrl, getHealth, getRecords, updateRecord, deleteRecord, bulkImportRecords;
var init_api = __esm({
  "src/services/api.js"() {
    getBaseUrl = () => {
      if (typeof window !== "undefined" && window.location?.origin) {
        return "/api";
      }
      return "http://localhost:3001/api";
    };
    getHealth = () => request("/health");
    getRecords = (table) => request(`/${table}`);
    updateRecord = (table, id, patch) => request(`/${table}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(patch) });
    deleteRecord = (table, id) => request(`/${table}/${encodeURIComponent(id)}`, { method: "DELETE" });
    bulkImportRecords = (table, records, userId = null) => request(`/${table}/import`, { method: "POST", body: JSON.stringify({ records, userId }) });
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
      const rows = await getRecords(remoteName(name));
      if (name === "settings") {
        await db3.settings.clear();
        const row = rows[0];
        if (row) {
          await db3.settings.bulkPut(
            Object.entries(row).filter(([key]) => !["id", "created_at", "updated_at"].includes(key)).map(([key, value]) => ({ key, value }))
          );
        }
        continue;
      }
      if (db3[name]) {
        await db3[name].clear();
        if (rows.length) {
          await db3[name].bulkPut(rows);
        }
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
    isBrowserRuntime = () => typeof window !== "undefined" && !(typeof process !== "undefined" && process.versions?.node);
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
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function fmtDate(s, opts = {}) {
  if (!s) return "\u2014";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: opts.month || "short", year: "numeric", ...opts });
}
function fmtDateTime(s) {
  if (!s) return "\u2014";
  const d = new Date(s);
  if (isNaN(d)) return s;
  return `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
}
function fmtTime(s) {
  if (!s) return "\u2014";
  const d = new Date(s);
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
  const a = ageFromDob(p.dob);
  if (a != null) return `${a} yrs`;
  if (p.approx_age) return `~${p.approx_age} yrs`;
  return "\u2014";
}
function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const t = /* @__PURE__ */ new Date();
  t.setHours(0, 0, 0, 0);
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00");
  return Math.round((d - t) / 864e5);
}
function fmtMoney(n, sym = "\u20B9") {
  const v = Number(n) || 0;
  const hasPaise = Math.round(v * 100) % 100 !== 0;
  return sym + v.toLocaleString("en-IN", { minimumFractionDigits: hasPaise ? 2 : 0, maximumFractionDigits: 2 });
}
function fmtQty(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function validMobile(m) {
  const s = String(m || "").replace(/[\s()-]/g, "");
  return /^(\+?91)?[6-9]\d{9}$/.test(s);
}
function download(filename, content, mime = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4e3);
}
function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function weekStart(d = /* @__PURE__ */ new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function initials(name = "") {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
}
var cx, p2, todayStr, nowISO, isExpired;
var init_utils = __esm({
  "src/utils.js"() {
    cx = (...a) => a.filter(Boolean).join(" ");
    p2 = (n) => String(n).padStart(2, "0");
    todayStr = () => dkey();
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
  const next2 = row ? row.value + 1 : start;
  await db_default.counters.put({ key, value: next2 });
  return next2;
}
async function makeUHID(settings, year = (/* @__PURE__ */ new Date()).getFullYear()) {
  const s = settings || await getSettings();
  const key = s.uhid_include_year ? `UHID|${year}` : "UHID|ALL";
  const n = await nextCounter(key, Number(s.uhid_start) || 1);
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
      doctor_name: "",
      doctor_qual: "",
      doctor_role: "",
      address: "A/8, MONARCH, Pal Gam, Surat, Gujarat \u2013 394510",
      phone: "",
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
var inventory_exports = {};
__export(inventory_exports, {
  MEDICINE_TYPES: () => MEDICINE_TYPES,
  TXN_TYPES: () => TXN_TYPES,
  adjustStock: () => adjustStock,
  allocateFEFO: () => allocateFEFO,
  archiveMedicine: () => archiveMedicine,
  categoryList: () => categoryList,
  createBatch: () => createBatch,
  createCategory: () => createCategory,
  createMedicine: () => createMedicine2,
  deleteBatch: () => deleteBatch,
  deleteCategory: () => deleteCategory,
  deleteMedicine: () => deleteMedicine,
  ensureMedicineCategories: () => ensureMedicineCategories,
  expiryBuckets: () => expiryBuckets,
  lowStockList: () => lowStockList,
  markBatchExpired: () => markBatchExpired,
  medicineStock: () => medicineStock,
  restoreBillStock: () => restoreBillStock,
  stockMap: () => stockMap,
  txn: () => txn,
  updateBatch: () => updateBatch,
  updateCategory: () => updateCategory,
  updateMedicine: () => updateMedicine
});
async function createMedicine2(data, userId) {
  return db_default.transaction("rw", [db_default.medicines, db_default.counters, db_default.activity_logs], async () => {
    const medicine_code = await makeCode("MED", "MD");
    const med = {
      id: uid(),
      medicine_code,
      name: String(data.name || "").trim(),
      generic: data.generic || "",
      brand: data.brand || data.name || "",
      category: data.category || "Other",
      manufacturer: data.manufacturer || "",
      type: data.type || "Tablet",
      strength: data.strength || "",
      unit: data.unit || "strip",
      barcode: data.barcode || "",
      purchase_price: round2(data.purchase_price || 0),
      selling_price: round2(data.selling_price || 0),
      min_stock: Number(data.min_stock) || 0,
      location: data.location || "",
      description: data.description || "",
      active: 1,
      created_at: nowISO(),
      updated_at: nowISO()
    };
    await db_default.medicines.add(med);
    await audit(userId, "MEDICINE_CREATE", "medicine", med.id, `${med.name} \xB7 ${med.medicine_code}`);
    return med;
  });
}
async function updateMedicine(id, patch, userId) {
  return db_default.transaction("rw", [db_default.medicines, db_default.activity_logs], async () => {
    const med = await db_default.medicines.get(id);
    if (!med) throw new Error("Medicine not found");
    const updated = { ...med, ...patch, id: med.id, medicine_code: med.medicine_code, updated_at: nowISO() };
    await db_default.medicines.put(updated);
    await audit(userId, "MEDICINE_UPDATE", "medicine", id, Object.keys(patch).join(", "));
    return updated;
  });
}
async function archiveMedicine(id, userId) {
  return db_default.transaction("rw", [db_default.medicines, db_default.activity_logs], async () => {
    const med = await db_default.medicines.get(id);
    if (!med) throw new Error("Medicine not found");
    const updated = { ...med, active: med.active ? 0 : 1 };
    await db_default.medicines.put(updated);
    await audit(userId, updated.active ? "MEDICINE_REACTIVATE" : "MEDICINE_ARCHIVE", "medicine", id, med.name);
    return updated;
  });
}
async function deleteMedicine(id, userId) {
  return db_default.transaction("rw", [db_default.medicines, db_default.batches, db_default.bill_items, db_default.prescription_items, db_default.activity_logs], async () => {
    const med = await db_default.medicines.get(id);
    if (!med) throw new Error("Medicine not found");
    const [batches, billItems, prescriptionItems] = await Promise.all([
      db_default.batches.where("medicine_id").equals(id).count(),
      db_default.bill_items.where("ref_id").equals(id).count(),
      db_default.prescription_items.where("medicine_id").equals(id).count()
    ]);
    if (batches || billItems || prescriptionItems) {
      throw new Error("This medicine has clinical or inventory history and must be archived instead of deleted");
    }
    await db_default.medicines.delete(id);
    await audit(userId, "MEDICINE_DELETE", "medicine", id, med.name);
  });
}
async function stockMap() {
  const [meds, batches] = await Promise.all([db_default.medicines.toArray(), db_default.batches.toArray()]);
  const map = /* @__PURE__ */ new Map();
  for (const m of meds) map.set(m.id, { medicine: m, available: 0, total: 0, next_expiry: null });
  for (const b of batches) {
    const e = map.get(b.medicine_id);
    if (!e) continue;
    e.available += b.available || 0;
    e.total += b.quantity || 0;
    if (!isExpired(b.expiry) && (!e.next_expiry || b.expiry < e.next_expiry)) e.next_expiry = b.expiry;
  }
  return map;
}
async function medicineStock(medicineId) {
  const bs = await db_default.batches.where("medicine_id").equals(medicineId).toArray();
  return {
    available: bs.reduce((s, b) => s + (b.available || 0), 0),
    total: bs.reduce((s, b) => s + (b.quantity || 0), 0)
  };
}
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
async function markBatchExpired(batchId, userId) {
  return db_default.transaction("rw", [db_default.batches, db_default.inventory_txns, db_default.activity_logs, db_default.medicines], async () => {
    const b = await db_default.batches.get(batchId);
    if (!b) throw new Error("Batch not found");
    if (b.status === "expired") throw new Error("Batch already marked expired");
    const med = await db_default.medicines.get(b.medicine_id);
    const updated = { ...b, status: "expired" };
    const avail = b.available || 0;
    updated.available = 0;
    await db_default.batches.put(updated);
    if (avail > 0) await txn("EXPIRED", b.medicine_id, b.id, -avail, null, `Batch ${b.batch_no} expired`, userId);
    await audit(userId, "BATCH_EXPIRED", "batch", b.id, `${med ? med.name : b.medicine_id} \xB7 ${b.batch_no} \xB7 qty ${avail}`);
    return updated;
  });
}
async function adjustStock({ medicine_id, batch_id, type, qty, note }, userId) {
  if (!["ADJUSTMENT", "DAMAGE", "EXPIRED"].includes(type)) throw new Error("Invalid adjustment type");
  return db_default.transaction("rw", [db_default.batches, db_default.inventory_txns, db_default.activity_logs, db_default.medicines], async () => {
    const med = await db_default.medicines.get(medicine_id);
    if (!med) throw new Error("Medicine not found");
    let batch = batch_id ? await db_default.batches.get(batch_id) : null;
    if (!batch) {
      const bs = await db_default.batches.where("medicine_id").equals(medicine_id).toArray();
      batch = bs[0] || null;
    }
    const q = Number(qty);
    if (!(q > 0)) throw new Error("Quantity must be positive");
    if (!batch && type === "ADJUSTMENT") {
      batch = {
        id: uid(),
        medicine_id,
        batch_no: `ADJ-${Date.now()}`,
        mfg_date: dkey(/* @__PURE__ */ new Date()),
        expiry: "9999-12-31",
        quantity: 0,
        available: 0,
        purchase_price: med.purchase_price || 0,
        status: "active"
      };
    }
    if (!batch) throw new Error("No batch exists for this medicine");
    let delta;
    if (type === "ADJUSTMENT") delta = q;
    else delta = -q;
    const newAvail = round2((batch.available || 0) + delta);
    if (newAvail < 0) throw new Error(`Cannot reduce below zero: only ${batch.available} available in batch ${batch.batch_no}`);
    const updated = { ...batch, available: newAvail, quantity: Math.max(batch.quantity || 0, newAvail) };
    if (type === "EXPIRED" && newAvail === 0) updated.status = "expired";
    await db_default.batches.put(updated);
    await txn(type, medicine_id, batch.id, delta, null, note || "", userId);
    await audit(userId, "STOCK_ADJUST", "batch", batch.id, `${med.name} \xB7 batch ${batch.batch_no} \xB7 ${type} ${delta > 0 ? "+" : ""}${delta} \xB7 ${note || ""}`);
    return updated;
  });
}
async function restoreBillStock(billItems, bill2, userId) {
  for (const it of billItems) {
    if (it.item_type !== "medicine" || !it.batch_id) continue;
    const b = await db_default.batches.get(it.batch_id);
    const med = await db_default.medicines.get(it.ref_id);
    if (b) {
      await db_default.batches.put({ ...b, available: round2((b.available || 0) + it.qty), status: b.status === "expired" && isExpired(b.expiry) ? "expired" : b.status });
      await txn("CANCELLED_BILL", it.ref_id, b.id, it.qty, bill2.id, `Bill ${bill2.bill_no} cancelled`, userId);
    } else {
      await txn("CANCELLED_BILL", it.ref_id, null, it.qty, bill2.id, `Bill ${bill2.bill_no} cancelled \u2014 batch unavailable`, userId);
    }
    if (!med) continue;
  }
}
async function expiryBuckets(settings) {
  const s = settings || await getSettings();
  const [batches, meds] = await Promise.all([db_default.batches.toArray(), db_default.medicines.toArray()]);
  const medMap = new Map(meds.map((m) => [m.id, m]));
  const out = { expired: [], d30: [], d60: [], d90: [] };
  for (const b of batches) {
    const med = medMap.get(b.medicine_id);
    if (!med || !med.active) continue;
    const onHand = b.available || 0;
    const base = { batch: b, medicine: med, med_name: med.name, on_hand: onHand, days: daysUntil(b.expiry), expiry: b.expiry };
    if (b.status === "expired" || isExpired(b.expiry)) {
      out.expired.push(base);
    } else if (onHand > 0) {
      const d = daysUntil(b.expiry);
      if (d <= Number(s.expiry_30)) out.d30.push(base);
      else if (d <= Number(s.expiry_60)) out.d60.push(base);
      else if (d <= Number(s.expiry_90)) out.d90.push(base);
    }
  }
  const byDate = (a, b) => a.expiry < b.expiry ? -1 : 1;
  out.expired.sort(byDate);
  out.d30.sort(byDate);
  out.d60.sort(byDate);
  out.d90.sort(byDate);
  return out;
}
async function lowStockList(settings) {
  const s = settings || await getSettings();
  const map = await stockMap();
  const low = [];
  const out = [];
  for (const e of map.values()) {
    if (!e.medicine.active) continue;
    const min = e.medicine.min_stock || Number(s.low_stock_default) || 0;
    if (e.available <= 0) out.push({ medicine: e.medicine, available: 0, min, next_expiry: e.next_expiry });
    else if (e.available <= min) low.push({ medicine: e.medicine, available: e.available, min, next_expiry: e.next_expiry });
  }
  low.sort((a, b) => a.available - b.available);
  out.sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
  return { low, out };
}
async function ensureMedicineCategories() {
  const cats = await db_default.medicine_categories.toArray();
  const known = new Set(cats.map((c) => c.name));
  for (const def of ["Analgesic", "Antibiotic", "Antacid", "Antiseptic", "Vitamin", "Antihistamine", "Respiratory", "Cardiovascular", "Diabetes", "Dermatology", "Supplement", "Injection", "IV Fluid", "Other"]) {
    if (!known.has(def)) await db_default.medicine_categories.add({ id: uid(), name: def });
  }
}
async function categoryList() {
  return db_default.medicine_categories.orderBy("name").toArray();
}
async function createCategory(name, userId) {
  const trimmed = String(name || "").trim();
  if (!trimmed) throw new Error("Category name is required");
  const existing = await db_default.medicine_categories.where("name").equalsIgnoreCase(trimmed).first();
  if (existing) throw new Error("A category with this name already exists");
  const cat = { id: uid(), name: trimmed };
  await db_default.medicine_categories.add(cat);
  await audit(userId, "CATEGORY_CREATE", "category", cat.id, cat.name);
  return cat;
}
async function updateCategory(id, newName, userId) {
  const trimmed = String(newName || "").trim();
  if (!trimmed) throw new Error("Category name is required");
  const cat = await db_default.medicine_categories.get(id);
  if (!cat) throw new Error("Category not found");
  const oldName = cat.name;
  await db_default.transaction("rw", [db_default.medicine_categories, db_default.medicines, db_default.activity_logs], async () => {
    await db_default.medicine_categories.update(id, { name: trimmed });
    const meds = await db_default.medicines.where("category").equals(oldName).toArray();
    for (const m of meds) {
      await db_default.medicines.update(m.id, { category: trimmed, updated_at: nowISO() });
    }
    await audit(userId, "CATEGORY_UPDATE", "category", id, `${oldName} \u2192 ${trimmed}`);
  });
  return { id, name: trimmed };
}
async function deleteCategory(id, userId) {
  const cat = await db_default.medicine_categories.get(id);
  if (!cat) throw new Error("Category not found");
  const count = await db_default.medicines.where("category").equals(cat.name).count();
  if (count > 0) {
    throw new Error("This category cannot be deleted because it is currently being used by existing medicines.");
  }
  await db_default.medicine_categories.delete(id);
  await audit(userId, "CATEGORY_DELETE", "category", id, cat.name);
}
async function createBatch(data, userId) {
  return db_default.transaction("rw", [db_default.batches, db_default.medicines, db_default.inventory_txns, db_default.activity_logs], async () => {
    const med = await db_default.medicines.get(data.medicine_id);
    if (!med) throw new Error("Medicine not found");
    const batchNo = String(data.batch_no || "").trim().toUpperCase();
    if (!batchNo) throw new Error("Batch number is required");
    const qty = Number(data.quantity);
    if (!(qty > 0)) throw new Error("Quantity must be positive");
    const batch = {
      id: uid(),
      medicine_id: med.id,
      batch_no: batchNo,
      mfg_date: data.mfg_date || dkey(/* @__PURE__ */ new Date()),
      expiry: data.expiry || "9999-12-31",
      quantity: qty,
      available: qty,
      purchase_price: round2(data.purchase_price != null ? data.purchase_price : med.purchase_price),
      status: "active"
    };
    await db_default.batches.add(batch);
    await txn("ADJUSTMENT", med.id, batch.id, qty, null, `Batch ${batch.batch_no} created manually`, userId);
    await audit(userId, "BATCH_CREATE", "batch", batch.id, `${med.name} \xB7 batch ${batch.batch_no} \xB7 qty ${qty}`);
    return batch;
  });
}
async function updateBatch(id, patch, userId) {
  return db_default.transaction("rw", [db_default.batches, db_default.activity_logs], async () => {
    const existing = await db_default.batches.get(id);
    if (!existing) throw new Error("Batch not found");
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      medicine_id: existing.medicine_id
    };
    await db_default.batches.put(updated);
    await audit(userId, "BATCH_UPDATE", "batch", id, Object.keys(patch).join(", "));
    return updated;
  });
}
async function deleteBatch(id, userId) {
  return db_default.transaction("rw", [db_default.batches, db_default.bill_items, db_default.purchase_items, db_default.inventory_txns, db_default.activity_logs], async () => {
    const batch = await db_default.batches.get(id);
    if (!batch) throw new Error("Batch not found");
    const billLineCount = await db_default.bill_items.where("batch_id").equals(id).count();
    if (billLineCount > 0) {
      throw new Error("This batch has sales history and cannot be deleted. Use Mark Expired instead.");
    }
    await db_default.batches.delete(id);
    await audit(userId, "BATCH_DELETE", "batch", id, `Batch ${batch.batch_no}`);
  });
}
var MEDICINE_TYPES, TXN_TYPES;
var init_inventory = __esm({
  "src/services/inventory.js"() {
    init_db();
    init_utils();
    init_core();
    MEDICINE_TYPES = ["Tablet", "Capsule", "Syrup", "Injection", "Cream", "Drops", "Powder", "Inhaler", "Other"];
    TXN_TYPES = ["SALE", "RETURN", "ADJUSTMENT", "DAMAGE", "EXPIRED", "CANCELLED_BILL"];
  }
});

// src/services/notifications.js
async function syncAlerts(userId = null) {
  const active = [];
  const { low, out } = await lowStockList();
  for (const r of out) active.push({ type: "out_of_stock", ref: `out:${r.medicine.id}`, severity: "danger", title: "Out of stock", message: `${r.medicine.name} is out of stock` });
  for (const r of low) active.push({ type: "low_stock", ref: `low:${r.medicine.id}`, severity: "warning", title: "Low stock", message: `${r.medicine.name}: ${r.available} left (minimum ${r.min})` });
  const buckets = await expiryBuckets();
  for (const b of buckets.expired) active.push({ type: "expired", ref: `exp:${b.batch.id}`, severity: "danger", title: "Expired medicine", message: `${b.med_name} (batch ${b.batch.batch_no}) expired on ${b.expiry} \u2014 ${b.on_hand} on hand` });
  for (const b of buckets.d30) active.push({ type: "expiring_30", ref: `e30:${b.batch.id}`, severity: "warning", title: "Expiring within 30 days", message: `${b.med_name} (batch ${b.batch.batch_no}) expires ${b.expiry} \u2014 ${b.on_hand} in stock` });
  for (const b of buckets.d60) active.push({ type: "expiring_60", ref: `e60:${b.batch.id}`, severity: "warning", title: "Expiring within 60 days", message: `${b.med_name} (batch ${b.batch.batch_no}) expires ${b.expiry} \u2014 ${b.on_hand} in stock` });
  for (const b of buckets.d90) active.push({ type: "expiring_90", ref: `e90:${b.batch.id}`, severity: "info", title: "Expiring within 90 days", message: `${b.med_name} (batch ${b.batch.batch_no}) expires ${b.expiry} \u2014 ${b.on_hand} in stock` });
  const bills = await db_default.bills.where("status").equals("completed").toArray();
  for (const b of bills) {
    if (b.payment_status !== "PAID" && b.payment_status !== "PENDING" && b.payment_status !== "PARTIAL") continue;
    if (b.payment_status === "PAID") continue;
    const due = Number(b.total) - Number(b.paid || 0);
    if (due > 5e-3) active.push({ type: "pending_payment", ref: `pend:${b.id}`, severity: "info", title: "Pending payment", message: `${b.bill_no} \xB7 ${b.patient_name} \u2014 \u20B9${due.toLocaleString("en-IN")} pending` });
  }
  const today = dkey(/* @__PURE__ */ new Date());
  const tomorrow = dkey(addDays(/* @__PURE__ */ new Date(), 1));
  const appts = await db_default.appointments.where("status").anyOf(["scheduled", "confirmed", "checked_in", "waiting"]).toArray();
  for (const a of appts) {
    if (a.date === today || a.date === tomorrow) {
      active.push({ type: "appointment", ref: `apt:${a.id}`, severity: "info", title: a.date === today ? "Appointment today" : "Appointment tomorrow", message: `${a.patient_name || ""} ${a.time} \xB7 ${a.reason || "consultation"}` });
    }
  }
  await db_default.transaction("rw", db_default.notifications, async () => {
    const existing = await db_default.notifications.toArray();
    const seen = new Set(active.map((a) => a.type + "|" + a.ref));
    for (const a of active) {
      const existsUnread = existing.some((n) => n.type === a.type && n.ref === a.ref && !n.read);
      if (!existsUnread) {
        await db_default.notifications.add({ id: uid(), ...a, read: false, at: nowISO() });
      }
    }
    for (const n of existing) {
      if (MANAGED_TYPES.includes(n.type) && !n.read && !seen.has(n.type + "|" + n.ref)) {
        await db_default.notifications.delete(n.id);
      }
    }
    const all = await db_default.notifications.orderBy("at").reverse().toArray();
    if (all.length > 500) await db_default.notifications.bulkDelete(all.slice(500).map((n) => n.id));
  });
  void userId;
  return { count: active.length };
}
async function markAllRead() {
  const all = await db_default.notifications.filter((n) => !n.read).toArray();
  for (const n of all) await db_default.notifications.put({ ...n, read: true });
}
async function unreadCount() {
  return db_default.notifications.filter((n) => !n.read).count();
}
var MANAGED_TYPES;
var init_notifications = __esm({
  "src/services/notifications.js"() {
    init_db();
    init_utils();
    init_inventory();
    MANAGED_TYPES = ["low_stock", "out_of_stock", "expired", "expiring_30", "expiring_60", "expiring_90", "pending_payment", "appointment"];
  }
});

// src/i18n.js
function makeT(lang = "en") {
  const dict = STRINGS[lang] || STRINGS.en;
  return (key, fallback) => dict[key] ?? STRINGS.en[key] ?? fallback ?? key;
}
var STRINGS;
var init_i18n = __esm({
  "src/i18n.js"() {
    STRINGS = {
      en: {
        app_name: "HEEVA CLINIC",
        app_full: "HEEVA CLINIC",
        tagline: "Trusted care, every time.",
        dashboard: "Dashboard",
        patients: "Patients",
        consultations: "Consultations",
        appointments: "Appointments",
        prescriptions: "Prescriptions",
        billing: "Billing",
        payments: "Payments",
        medicines: "Medicines",
        inventory: "Inventory",
        returns: "Returns",
        expenses: "Expenses",
        reports: "Reports",
        alerts: "Alerts",
        staff: "Staff & Users",
        settings: "Settings",
        new_patient: "New Patient",
        search: "Search",
        global_search: "Search patient, bill, medicine\u2026",
        save: "Save",
        cancel: "Cancel",
        close: "Close",
        actions: "Actions",
        status: "Status",
        date: "Date",
        total: "Total",
        amount: "Amount",
        patient: "Patient",
        doctor: "Doctor",
        medicine: "Medicine",
        quantity: "Quantity",
        price: "Price",
        paid: "Paid",
        pending: "Pending",
        partial: "Partially Paid",
        print: "Print",
        export: "Export",
        add: "Add",
        edit: "Edit",
        delete: "Delete",
        name: "Name",
        mobile: "Mobile",
        gender: "Gender",
        age: "Age",
        male: "Male",
        female: "Female",
        other: "Other",
        offline: "Offline \u2014 changes are saved on this device",
        install_app: "Install HEEVA Clinic",
        install_hint: "Install this application on Windows for a desktop experience",
        confirm: "Confirm",
        required: "Required",
        no_results: "No results found",
        today: "Today"
      },
      gu: {
        app_name: "\u0AB9\u0AC0\u0AB5\u0ABE \u0A95\u0ACD\u0AB2\u0ABF\u0AA8\u0ABF\u0A95",
        app_full: "\u0AB9\u0AC0\u0AB5\u0ABE \u0A95\u0ACD\u0AB2\u0ABF\u0AA8\u0ABF\u0A95 \u0AAE\u0AC7\u0AA8\u0AC7\u0A9C\u0AAE\u0AC7\u0AA8\u0ACD\u0A9F \u0AB8\u0ABF\u0AB8\u0ACD\u0A9F\u0AAE",
        tagline: "\u0AA6\u0AB0\u0AC7\u0A95 \u0AB5\u0ABE\u0AB0, \u0AB5\u0ABF\u0AB6\u0ACD\u0AB5\u0ABE\u0AB8\u0AA7\u0AB0 \u0AB8\u0A82\u0AAD\u0ABE\u0AB3.",
        dashboard: "\u0AA1\u0AC7\u0AB6\u0AAC\u0ACB\u0AB0\u0ACD\u0AA1",
        patients: "\u0AB0\u0ACB\u0A97\u0AC0\u0A93",
        consultations: "\u0AAA\u0AB0\u0ABE\u0AAE\u0AB0\u0ACD\u0AB6",
        appointments: "\u0A8F\u0AAA\u0ACB\u0A87\u0AA8\u0ACD\u0A9F\u0AAE\u0AC7\u0AA8\u0ACD\u0A9F",
        prescriptions: "\u0AA6\u0AB5\u0ABE \u0AA8\u0ABE\u0AAE\u0AAA\u0AA4\u0ACD\u0AB0",
        billing: "\u0AAC\u0ABF\u0AB2\u0ABF\u0A82\u0A97",
        payments: "\u0AAA\u0AB0\u0ABF\u0AB5\u0AB9",
        medicines: "\u0AA6\u0AB5\u0ABE\u0A93",
        inventory: "\u0AB8\u0ACD\u0A9F\u0ACB\u0A95",
        returns: "\u0AAA\u0ABE\u0A9B\u0ABE \u0AAB\u0AB0\u0ACD\u0AAF\u0ABE",
        expenses: "\u0A96\u0AB0\u0ACD\u0A9A",
        reports: "\u0AB0\u0ABF\u0AAA\u0ACB\u0AB0\u0ACD\u0A9F",
        alerts: "\u0AB5\u0ABE\u0AB0\u0AA3\u0AC0",
        staff: "\u0A95\u0AB0\u0ACD\u0AAE\u0A9A\u0ABE\u0AB0\u0AC0 \u0A85\u0AA8\u0AC7 \u0AAF\u0AC1\u0A9D\u0AB0",
        settings: "\u0AB8\u0AC7\u0A9F\u0ABF\u0A82\u0A97\u0ACD\u0AB8",
        new_patient: "\u0AA8\u0AB5\u0ACB \u0AB0\u0ACB\u0A97\u0AC0",
        search: "\u0AB6\u0ACB\u0AA7\u0ACB",
        global_search: "\u0AB0\u0ACB\u0A97\u0AC0, \u0AAC\u0ABF\u0AB2, \u0AA6\u0AB5\u0ABE \u0AB6\u0ACB\u0AA7\u0ACB\u2026",
        save: "\u0AB8\u0A82\u0A97\u0ACD\u0AB0\u0AB9 \u0A95\u0AB0\u0ACB",
        cancel: "\u0AB0\u0AA6 \u0A95\u0AB0\u0ACB",
        close: "\u0AAC\u0A82\u0AA7 \u0A95\u0AB0\u0ACB",
        actions: "\u0A95\u0ACD\u0AB0\u0ABF\u0AAF\u0ABE\u0A93",
        status: "\u0AB8\u0ACD\u0AA5\u0ABF\u0AA4\u0ABF",
        date: "\u0AA4\u0ABE\u0AB0\u0AC0\u0A96",
        total: "\u0A95\u0AC1\u0AB2",
        amount: "\u0AB0\u0A95\u0AAE",
        patient: "\u0AB0\u0ACB\u0A97\u0AC0",
        doctor: "\u0AA1\u0AC9\u0A95\u0ACD\u0A9F\u0AB0",
        medicine: "\u0AA6\u0AB5\u0ABE",
        quantity: "\u0AAA\u0AB0\u0ABF\u0AAE\u0ABE\u0AA3",
        price: "\u0A95\u0ABF\u0A82\u0AAE\u0AA4",
        paid: "\u0A9A\u0AC2\u0A95\u0AB5\u0AC7\u0AB2\u0AC1\u0A82",
        pending: "\u0AAC\u0ABE\u0A95\u0AC0",
        partial: "\u0AAD\u0ABE\u0A97\u0AC0\u0AAF\u0ABE \u0A9A\u0AC2\u0A95\u0AB5\u0AC7\u0AB2\u0AC1\u0A82",
        print: "\u0AAE\u0AC1\u0AA6\u0ACD\u0AB0\u0ABF\u0AA4 \u0A95\u0AB0\u0ACB",
        export: "\u0A8F\u0A95\u0ACD\u0AB8\u0AAA\u0ACB\u0AB0\u0ACD\u0A9F",
        add: " \u0A89\u0AAE\u0AC7\u0AB0\u0ACB",
        edit: "\u0AB8\u0A82\u0AAA\u0ABE\u0AA6\u0ABF\u0AA4 \u0A95\u0AB0\u0ACB",
        name: "\u0AA8\u0ABE\u0AAE",
        mobile: "\u0AAE\u0ACB\u0AAC\u0ABE\u0A87\u0AB2",
        gender: "\u0AB2\u0ABF\u0A82\u0A97",
        age: "\u0AB5\u0AAF",
        male: "\u0AAA\u0AC1\u0AB0\u0AC1\u0AB7",
        female: "\u0AB8\u0ACD\u0AA4\u0ACD\u0AB0\u0AC0",
        other: "\u0A85\u0AA8\u0ACD\u0AAF",
        offline: "\u0A93\u0AAB\u0AB2\u0ABE\u0A87\u0AA8 \u2014 \u0AAB\u0AC7\u0AB0\u0AAB\u0ABE\u0AB0\u0ACB \u0A86 \u0A89\u0AAA\u0A95\u0AB0\u0AA3 \u0AAA\u0AB0 \u0AB8\u0A82\u0A97\u0ACD\u0AB0\u0AB9 \u0AA5\u0ABE\u0AAF \u0A9B\u0AC7",
        install_app: "\u0AB9\u0AC0\u0AB5\u0ABE \u0A95\u0ACD\u0AB2\u0ABF\u0AA8\u0ABF\u0A95 \u0A87\u0AA8\u0ACD\u0AB8\u0ACD\u0A9F\u0ACB\u0AB2 \u0A95\u0AB0\u0ACB",
        install_hint: "\u0AA1\u0AC7\u0AB8\u0ACD\u0A95\u0A9F\u0ACB\u0AAA \u0A85\u0AA8\u0AC1\u0AAD\u0AB5 \u0AAE\u0ABE\u0A9F\u0AC7 Windows \u0AAA\u0AB0 \u0A86 \u0A8F\u0AAA\u0ACD\u0AB2\u0ABF\u0A95\u0AC7\u0AB6\u0AA8 \u0A87\u0AA8\u0ACD\u0AB8\u0ACD\u0A9F\u0ACB\u0AB2 \u0A95\u0AB0\u0ACB",
        confirm: "\u0AAA\u0AC1\u0AB7\u0ACD\u0A9F\u0ABF \u0A95\u0AB0\u0ACB",
        required: "\u0A9C\u0AB0\u0AC2\u0AB0\u0AC0",
        no_results: "\u0A95\u0ACB\u0A88 \u0AAA\u0AB0\u0ABF\u0AA3\u0ABE\u0AAE \u0AAE\u0AB3\u0ACD\u0AAF\u0ABE \u0AA8\u0AA5\u0AC0",
        today: "\u0A86\u0A9C\u0AC7"
      }
    };
  }
});

// src/context/AppContext.jsx
var AppContext_exports = {};
__export(AppContext_exports, {
  AppProvider: () => AppProvider,
  useApp: () => useApp
});
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
function AppProvider({ children }) {
  const [booting, setBooting] = useState(true);
  const [databaseError, setDatabaseError] = useState(null);
  const [user3] = useState(LOCAL_USER);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [theme, setThemeState] = useState("light");
  const [lang, setLangState] = useState("en");
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [toasts, setToasts] = useState([]);
  const [installEvt, setInstallEvt] = useState(null);
  const [standalone, setStandalone] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const refreshNotifs = useCallback(async () => {
    try {
      setNotifCount(await unreadCount());
    } catch (e) {
    }
  }, []);
  useEffect(() => {
    (async () => {
      try {
        if (isBrowserRuntime()) {
          await getHealth();
          await syncFromBackend(db_default);
          setDatabaseError(null);
        }
        await ensureMedicineCategories();
        const s = await getSettings();
        setSettings(s);
        setThemeState(s.theme || "light");
        setLangState(s.lang || "en");
        globalThis.__heevaUser = LOCAL_USER;
        try {
          await syncAlerts(LOCAL_USER.id);
        } catch (e) {
        }
        refreshNotifs();
      } catch (e) {
        console.error("Backend boot error", e);
        setDatabaseError(e?.message || "Unable to connect to the backend server.");
      } finally {
        setBooting(false);
      }
    })();
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    const bip = (e) => {
      e.preventDefault();
      setInstallEvt(e);
    };
    const ai = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", bip);
    window.addEventListener("appinstalled", ai);
    const mq = window.matchMedia("(display-mode: standalone)");
    setStandalone(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", (e) => setStandalone(e.matches));
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener("beforeinstallprompt", bip);
      window.removeEventListener("appinstalled", ai);
    };
  }, [refreshNotifs]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  const t = useMemo(() => makeT(lang), [lang]);
  const install = useCallback(async () => {
    if (!installEvt) return false;
    installEvt.prompt();
    const choice = await installEvt.userChoice;
    if (choice.outcome === "accepted") setInstallEvt(null);
    return choice.outcome === "accepted";
  }, [installEvt]);
  const pushToast = useCallback((type, msg, ms = 4e3) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((ts) => [...ts.slice(-4), { id, type, msg }]);
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), ms);
  }, []);
  const updateSettings = useCallback(async (patch) => {
    await db_default.transaction("rw", [db_default.settings, db_default.activity_logs], async () => {
      for (const [k, v] of Object.entries(patch)) await db_default.settings.put({ key: k, value: v });
    });
    const fresh = await getSettings();
    setSettings(fresh);
    if (patch.theme) setThemeState(fresh.theme || "light");
    if (patch.lang) setLangState(fresh.lang || "en");
    return fresh;
  }, []);
  const setTheme = useCallback((th) => {
    setThemeState(th);
    db_default.settings.put({ key: "theme", value: th });
  }, []);
  const setLang = useCallback((l) => {
    setLangState(l);
    db_default.settings.put({ key: "lang", value: l });
  }, []);
  const can = useCallback(() => true, []);
  const value = {
    booting,
    databaseError,
    user: user3,
    settings,
    updateSettings,
    theme,
    setTheme,
    lang,
    setLang,
    t,
    online,
    toasts,
    pushToast,
    install,
    installEvt,
    standalone,
    notifCount,
    refreshNotifs,
    can
  };
  return /* @__PURE__ */ React.createElement(Ctx.Provider, { value }, children);
}
var Ctx, useApp, LOCAL_USER;
var init_AppContext = __esm({
  "src/context/AppContext.jsx"() {
    init_db();
    init_api();
    init_remoteSync();
    init_core();
    init_inventory();
    init_notifications();
    init_i18n();
    Ctx = createContext(null);
    useApp = () => useContext(Ctx);
    LOCAL_USER = { id: "local-admin", name: "Administrator", role: "admin", active: 1 };
  }
});

// src/components/ui.jsx
import React2, { useState as useState2, useRef, useEffect as useEffect2, useMemo as useMemo2 } from "react";
import { X, ChevronLeft, ChevronRight, Search, AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
function Logo({ size = 36, className, src }) {
  const logoSrc = src || "/icons/heeva-logo.png";
  return /* @__PURE__ */ React2.createElement(
    "img",
    {
      className: cx("logo", className),
      src: logoSrc,
      width: size,
      height: size,
      alt: "Heeva Clinic",
      style: { objectFit: "contain", borderRadius: "50%", flexShrink: 0 },
      onError: (e) => {
        if (e.target.src !== window.location.origin + "/icons/icon-192.png") {
          e.target.src = "./icons/icon-192.png";
        }
      }
    }
  );
}
function Btn({ variant = "primary", size = "md", icon: Icon, children, className, ...rest }) {
  return /* @__PURE__ */ React2.createElement("button", { className: cx("btn", `btn-${variant}`, size !== "md" && `btn-${size}`, className), ...rest }, Icon && /* @__PURE__ */ React2.createElement(Icon, { size: size === "sm" ? 14 : size === "lg" ? 18 : 16 }), children);
}
function IconBtn({ title, icon: Icon, active, className, size = 18, ...rest }) {
  return /* @__PURE__ */ React2.createElement("button", { className: cx("icon-btn", active && "icon-btn-active", className), title, ...rest }, /* @__PURE__ */ React2.createElement(Icon, { size }));
}
function Card({ title, sub, actions, children, className, pad = true, tone }) {
  return /* @__PURE__ */ React2.createElement("section", { className: cx("card", tone && `card-${tone}`, className) }, (title || actions) && /* @__PURE__ */ React2.createElement("header", { className: "card-head" }, /* @__PURE__ */ React2.createElement("div", null, title && /* @__PURE__ */ React2.createElement("h3", { className: "card-title" }, title), sub && /* @__PURE__ */ React2.createElement("p", { className: "card-sub" }, sub)), actions && /* @__PURE__ */ React2.createElement("div", { className: "card-actions" }, actions)), /* @__PURE__ */ React2.createElement("div", { className: cx("card-body", !pad && "card-body-flush") }, children));
}
function PageHeader({ title, sub, actions }) {
  return /* @__PURE__ */ React2.createElement("div", { className: "page-head" }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("h1", { className: "page-title" }, title), sub && /* @__PURE__ */ React2.createElement("p", { className: "page-sub" }, sub)), actions && /* @__PURE__ */ React2.createElement("div", { className: "page-actions" }, actions));
}
function Modal({ open, onClose, title, sub, children, footer, width = "md" }) {
  useEffect2(() => {
    if (!open) return void 0;
    const h2 = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h2);
    return () => window.removeEventListener("keydown", h2);
  }, [open, onClose]);
  if (!open) return null;
  return /* @__PURE__ */ React2.createElement("div", { className: "modal-overlay", onMouseDown: (e) => e.target === e.currentTarget && onClose && onClose() }, /* @__PURE__ */ React2.createElement("div", { className: cx("modal", `modal-${width}`), role: "dialog", "aria-modal": "true" }, /* @__PURE__ */ React2.createElement("header", { className: "modal-head" }, /* @__PURE__ */ React2.createElement("div", null, /* @__PURE__ */ React2.createElement("h3", null, title), sub && /* @__PURE__ */ React2.createElement("p", null, sub)), onClose && /* @__PURE__ */ React2.createElement("button", { className: "icon-btn", onClick: onClose, "aria-label": "Close" }, /* @__PURE__ */ React2.createElement(X, { size: 18 }))), /* @__PURE__ */ React2.createElement("div", { className: "modal-body" }, children), footer && /* @__PURE__ */ React2.createElement("footer", { className: "modal-foot" }, footer)));
}
function Confirm({ open, onClose, onConfirm, title = "Are you sure?", message, danger, confirmText = "Confirm", busy, reason, requireReason, placeholder }) {
  const [why, setWhy] = useState2("");
  useEffect2(() => {
    if (open) setWhy("");
  }, [open]);
  const blocked = requireReason && !String(why).trim();
  return /* @__PURE__ */ React2.createElement(
    Modal,
    {
      open,
      onClose,
      title,
      width: "sm",
      footer: /* @__PURE__ */ React2.createElement(React2.Fragment, null, /* @__PURE__ */ React2.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React2.createElement(Btn, { variant: danger ? "danger" : "primary", disabled: blocked || busy, onClick: () => onConfirm(why) }, busy ? "Working\u2026" : confirmText))
    },
    message && /* @__PURE__ */ React2.createElement("p", { className: "confirm-msg" }, message),
    requireReason && /* @__PURE__ */ React2.createElement(Field, { label: "Reason", required: true }, /* @__PURE__ */ React2.createElement("textarea", { className: "input", rows: 3, value: why, onChange: (e) => setWhy(e.target.value), placeholder: placeholder || "Required for the audit trail" }))
  );
}
function Field({ label, required, error, hint, children, className }) {
  return /* @__PURE__ */ React2.createElement("label", { className: cx("field", className, error && "field-error") }, label && /* @__PURE__ */ React2.createElement("span", { className: "field-label" }, label, required && /* @__PURE__ */ React2.createElement("em", null, "*")), children, hint && !error && /* @__PURE__ */ React2.createElement("span", { className: "field-hint" }, hint), error && /* @__PURE__ */ React2.createElement("span", { className: "field-err" }, error));
}
function Toggle({ checked, onChange, label }) {
  return /* @__PURE__ */ React2.createElement("button", { type: "button", className: cx("toggle", checked && "toggle-on"), onClick: () => onChange(!checked), role: "switch", "aria-checked": !!checked }, /* @__PURE__ */ React2.createElement("span", { className: "toggle-knob" }), label && /* @__PURE__ */ React2.createElement("span", { className: "toggle-label" }, label));
}
function Seg({ options, value, onChange, size = "md" }) {
  return /* @__PURE__ */ React2.createElement("div", { className: cx("seg", size === "sm" && "seg-sm") }, options.map((o) => /* @__PURE__ */ React2.createElement("button", { key: o.value, type: "button", className: cx("seg-item", value === o.value && "seg-active"), onClick: () => onChange(o.value) }, o.label)));
}
function Badge({ tone = "gray", children, className }) {
  return /* @__PURE__ */ React2.createElement("span", { className: cx("badge", TONES[tone], className) }, children);
}
function PaymentBadge({ status }) {
  const map = { PAID: ["green", "Paid"], PARTIAL: ["amber", "Partially Paid"], PENDING: ["red", "Pending"], CANCELLED: ["gray", "Cancelled"] };
  const [tone, label] = map[status] || ["gray", status];
  return /* @__PURE__ */ React2.createElement(Badge, { tone }, label);
}
function ApptBadge({ status }) {
  const map = {
    scheduled: ["blue", "Scheduled"],
    confirmed: ["teal", "Confirmed"],
    checked_in: ["teal", "Checked In"],
    waiting: ["amber", "Waiting"],
    in_consultation: ["navy", "In Consultation"],
    completed: ["green", "Completed"],
    cancelled: ["gray", "Cancelled"],
    no_show: ["red", "No Show"]
  };
  const [tone, label] = map[status] || ["gray", status];
  return /* @__PURE__ */ React2.createElement(Badge, { tone }, label);
}
function Tabs({ tabs, active, onChange, className }) {
  return /* @__PURE__ */ React2.createElement("div", { className: cx("tabs", className), role: "tablist" }, tabs.map((tb) => /* @__PURE__ */ React2.createElement(
    "button",
    {
      key: tb.key,
      role: "tab",
      "aria-selected": active === tb.key,
      className: cx("tab", active === tb.key && "tab-active"),
      onClick: () => onChange(tb.key)
    },
    tb.label,
    tb.badge != null && /* @__PURE__ */ React2.createElement("span", { className: "tab-badge" }, tb.badge)
  )));
}
function EmptyState({ icon = "\u2014", title = "Nothing here yet", message, action, compact }) {
  return /* @__PURE__ */ React2.createElement("div", { className: cx("empty", compact && "empty-compact") }, /* @__PURE__ */ React2.createElement("div", { className: "empty-icon" }, icon), /* @__PURE__ */ React2.createElement("div", { className: "empty-title" }, title), message && /* @__PURE__ */ React2.createElement("div", { className: "empty-msg" }, message), action && /* @__PURE__ */ React2.createElement("div", { className: "empty-action" }, action));
}
function Stat({ label, value, icon: Icon, tone = "navy", sub, onClick }) {
  return /* @__PURE__ */ React2.createElement("div", { className: cx("stat-card", `stat-${tone}`, onClick && "stat-click"), onClick }, /* @__PURE__ */ React2.createElement("div", { className: "stat-icon" }, Icon && /* @__PURE__ */ React2.createElement(Icon, { size: 20 })), /* @__PURE__ */ React2.createElement("div", { className: "stat-main" }, /* @__PURE__ */ React2.createElement("div", { className: "stat-value" }, value), /* @__PURE__ */ React2.createElement("div", { className: "stat-label" }, label), sub && /* @__PURE__ */ React2.createElement("div", { className: "stat-sub" }, sub)));
}
function Avatar({ name, size = 38, tone = "navy" }) {
  return /* @__PURE__ */ React2.createElement("span", { className: cx("avatar", `avatar-${tone}`), style: { width: size, height: size, fontSize: size * 0.38 } }, initials(name));
}
function UhidChip({ uhid, onCopy, size = "md" }) {
  const [copied, setCopied] = useState2(false);
  return /* @__PURE__ */ React2.createElement(
    "button",
    {
      type: "button",
      className: cx("uhid-chip", `uhid-${size}`),
      title: "Click to copy UHID",
      onClick: (e) => {
        e.stopPropagation();
        try {
          navigator.clipboard.writeText(uhid);
        } catch (err) {
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
        onCopy && onCopy();
      }
    },
    copied ? "\u2713 Copied" : uhid
  );
}
function DataTable({ columns, rows, rowKey = "id", onRow, pageSize = 10, empty = /* @__PURE__ */ React2.createElement(EmptyState, { compact: true }), loading, dense, footerNote }) {
  const [sort, setSort] = useState2(null);
  const [page, setPage] = useState2(0);
  const sorted = useMemo2(() => {
    if (!sort || !rows) return rows || [];
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = (r) => col.sortValue ? col.sortValue(r) : r[sort.key];
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null || va === "") return 1;
      if (vb == null || vb === "") return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return c * sort.dir;
    });
  }, [rows, sort, columns]);
  useEffect2(() => {
    setPage(0);
  }, [rows ? rows.length : -1]);
  if (loading) {
    return /* @__PURE__ */ React2.createElement("div", { className: "table-wrap" }, /* @__PURE__ */ React2.createElement("div", { className: "table-loading" }, /* @__PURE__ */ React2.createElement(Spinner, null), " Loading\u2026"));
  }
  if (!rows || !rows.length) return /* @__PURE__ */ React2.createElement(React2.Fragment, null, empty);
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * pageSize, cur * pageSize + pageSize);
  return /* @__PURE__ */ React2.createElement("div", { className: "table-wrap" }, /* @__PURE__ */ React2.createElement("div", { className: "table-scroll" }, /* @__PURE__ */ React2.createElement("table", { className: cx("table", dense && "table-dense") }, /* @__PURE__ */ React2.createElement("thead", null, /* @__PURE__ */ React2.createElement("tr", null, columns.map((c) => /* @__PURE__ */ React2.createElement(
    "th",
    {
      key: c.key,
      className: cx(c.sortable && "th-sortable", sort && sort.key === c.key && "th-sorted", c.align === "right" && "th-right"),
      onClick: c.sortable ? () => setSort((s) => s && s.key === c.key ? s.dir === 1 ? { key: c.key, dir: -1 } : null : { key: c.key, dir: 1 }) : void 0
    },
    c.label,
    sort && sort.key === c.key && /* @__PURE__ */ React2.createElement("span", { className: "th-arrow" }, sort.dir === 1 ? "\u2191" : "\u2193")
  )))), /* @__PURE__ */ React2.createElement("tbody", null, slice.map((r, i) => /* @__PURE__ */ React2.createElement("tr", { key: r[rowKey] ?? i, className: cx(onRow && "tr-click"), onClick: () => onRow && onRow(r) }, columns.map((c) => /* @__PURE__ */ React2.createElement("td", { key: c.key, className: cx(c.align === "right" && "td-right") }, c.render ? c.render(r) : r[c.key] ?? "\u2014"))))))), /* @__PURE__ */ React2.createElement("div", { className: "table-foot" }, /* @__PURE__ */ React2.createElement("span", { className: "table-count" }, sorted.length, " record", sorted.length === 1 ? "" : "s", footerNote ? ` \xB7 ${footerNote}` : ""), pages > 1 && /* @__PURE__ */ React2.createElement("div", { className: "table-pager" }, /* @__PURE__ */ React2.createElement(IconBtn, { title: "Previous page", icon: ChevronLeft, disabled: cur === 0, onClick: () => setPage(cur - 1) }), /* @__PURE__ */ React2.createElement("span", { className: "table-page" }, "Page ", cur + 1, " of ", pages), /* @__PURE__ */ React2.createElement(IconBtn, { title: "Next page", icon: ChevronRight, disabled: cur >= pages - 1, onClick: () => setPage(cur + 1) }))));
}
function SearchSelect({ value, onChange, options, getLabel, getSearch, placeholder = "Search\u2026", error, disabled }) {
  const [q, setQ] = useState2("");
  const [open, setOpen] = useState2(false);
  const [hi, setHi] = useState2(-1);
  const boxRef = useRef(null);
  useEffect2(() => {
    const h2 = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h2);
    return () => document.removeEventListener("mousedown", h2);
  }, []);
  const filtered = useMemo2(() => {
    const list = options || [];
    if (!q) return list;
    const s = q.toLowerCase();
    return list.filter((o) => (getSearch ? getSearch(o) : getLabel(o)).toLowerCase().includes(s));
  }, [options, q, getLabel, getSearch]);
  const pick = (o) => {
    onChange(o);
    setQ("");
    setOpen(false);
    setHi(-1);
  };
  const onKey = (e) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) setOpen(true);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h2) => Math.min(h2 + 1, filtered.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h2) => Math.max(h2 - 1, 0));
    }
    if (e.key === "Enter" && open && hi >= 0 && filtered[hi]) {
      e.preventDefault();
      pick(filtered[hi]);
    }
    if (e.key === "Escape") setOpen(false);
  };
  return /* @__PURE__ */ React2.createElement("div", { className: cx("search-select", error && "field-error"), ref: boxRef }, /* @__PURE__ */ React2.createElement("div", { className: "search-select-box" }, /* @__PURE__ */ React2.createElement(Search, { size: 15, className: "ss-icon" }), /* @__PURE__ */ React2.createElement(
    "input",
    {
      className: "ss-input",
      disabled,
      value: open ? q : value ? getLabel(value) : "",
      placeholder,
      onChange: (e) => {
        setQ(e.target.value);
        setOpen(true);
        setHi(-1);
        if (e.target.value === "" && value) onChange(null);
      },
      onFocus: () => setOpen(true),
      onKeyDown: onKey
    }
  ), value && !open && /* @__PURE__ */ React2.createElement("button", { type: "button", className: "ss-clear", onClick: () => {
    onChange(null);
    setQ("");
  } }, /* @__PURE__ */ React2.createElement(X, { size: 14 }))), open && /* @__PURE__ */ React2.createElement("div", { className: "ss-drop" }, filtered.length === 0 && /* @__PURE__ */ React2.createElement("div", { className: "ss-none" }, "No matches"), filtered.map((o, i) => /* @__PURE__ */ React2.createElement(
    "div",
    {
      key: o.id,
      className: cx("ss-item", hi === i && "ss-hi"),
      onMouseEnter: () => setHi(i),
      onMouseDown: (e) => {
        e.preventDefault();
        pick(o);
      }
    },
    getLabel(o)
  ))));
}
function ToastStack({ toasts }) {
  const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
  return /* @__PURE__ */ React2.createElement("div", { className: "toast-stack" }, toasts.map((tst) => {
    const I = icons[tst.type] || Info;
    return /* @__PURE__ */ React2.createElement("div", { key: tst.id, className: cx("toast", `toast-${tst.type}`) }, /* @__PURE__ */ React2.createElement(I, { size: 17 }), /* @__PURE__ */ React2.createElement("span", null, tst.msg));
  }));
}
var Input, Select, Textarea, TONES, Spinner;
var init_ui = __esm({
  "src/components/ui.jsx"() {
    init_utils();
    Input = (props) => /* @__PURE__ */ React2.createElement("input", { className: "input", ...props });
    Select = ({ children, ...props }) => /* @__PURE__ */ React2.createElement("select", { className: "input select", ...props }, children);
    Textarea = (props) => /* @__PURE__ */ React2.createElement("textarea", { className: "input", rows: 3, ...props });
    TONES = {
      green: "badge-green",
      amber: "badge-amber",
      red: "badge-red",
      blue: "badge-blue",
      gray: "badge-gray",
      teal: "badge-teal",
      navy: "badge-navy"
    };
    Spinner = ({ size = 20 }) => /* @__PURE__ */ React2.createElement("svg", { className: "spinner", width: size, height: size, viewBox: "0 0 24 24", fill: "none" }, /* @__PURE__ */ React2.createElement("circle", { cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "3", opacity: "0.25" }), /* @__PURE__ */ React2.createElement("path", { d: "M12 2a10 10 0 0 1 10 10", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round" }));
  }
});

// src/print/printers.jsx
var printers_exports = {};
__export(printers_exports, {
  printInvoiceA4: () => printInvoiceA4,
  printPatientCard: () => printPatientCard,
  printPrescription: () => printPrescription,
  printReport: () => printReport,
  registerPrinter: () => registerPrinter
});
import React3 from "react";
function registerPrinter(fn) {
  _printFn = fn;
}
function printInvoiceA4(bill2, items, payments, s) {
  const paidRows = payments.filter((p) => p.kind === "payment");
  const paymentStatus = { PAID: "Paid", PARTIAL: "Partially Paid", PENDING: "Pending", CANCELLED: "Cancelled" }[bill2.payment_status] || bill2.payment_status;
  printNode(
    /* @__PURE__ */ React3.createElement("div", { className: "print-job a4" }, /* @__PURE__ */ React3.createElement("style", null, `@page { size: A4 landscape; margin: 0; } .a4-sheet { width: 297mm; height: 210mm; display: flex; flex-direction: row; font-family: Inter, system-ui, sans-serif; color: #16232f; } .a4-copy { width: 50%; height: 210mm; padding: 10mm 8mm; overflow: hidden; position: relative; } .a4-copy + .a4-copy { border-left: 0.3mm dashed #8994a3; } .a4-copy + .a4-copy::before { content: 'CUT HERE'; position: absolute; top: 50%; left: -3.5mm; transform: translate(-50%, -50%) rotate(-90deg); background: #fff; padding: 0 4mm; color: #8994a3; font-size: 8px; letter-spacing: 1px; } .a4-doc { width: 100%; font-size: 8px; line-height: 1.15; } .a4-head { margin-bottom: 3mm; } .a4-brand img { width: 12mm; height: 12mm; } .a4-clinic { font-size: 14px; } .a4-doctype { font-size: 8px; } .a4-parties { margin: 2mm 0; } .a4-pbox { padding: 5px 6px; font-size: 8px; } .a4-pname { font-size: 10px; } .a4-table { margin-top: 2mm; font-size: 8px; } .a4-table th { padding: 4px 5px; font-size: 7px; } .a4-table td { padding: 4px 5px; } .a4-totals { width: 135px; padding: 6px 8px; } .a4-totals .kv { font-size: 8px; } .a4-totals .kv-total b { font-size: 11px; } .a4-sign { margin-top: 12mm; font-size: 8px; }`), /* @__PURE__ */ React3.createElement("div", { className: "a4-sheet" }, [["CLINIC COPY"], ["PATIENT COPY"]].map(([copyLabel]) => /* @__PURE__ */ React3.createElement("div", { className: "a4-copy", key: copyLabel }, /* @__PURE__ */ React3.createElement("div", { className: "a4-doc" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-head" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-brand" }, /* @__PURE__ */ React3.createElement(Logo, { size: 52, src: s.logo }), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("div", { className: "a4-clinic" }, s.clinic_name), /* @__PURE__ */ React3.createElement("div", { className: "a4-tag" }, s.tagline), /* @__PURE__ */ React3.createElement("div", { className: "a4-addr" }, s.address), /* @__PURE__ */ React3.createElement("div", { className: "a4-phone" }, "Ph: ", s.phone, " ", s.email ? ` \xB7 ${s.email}` : ""))), /* @__PURE__ */ React3.createElement("div", { className: "a4-billbox" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-doctype" }, "PAYMENT RECEIPT \xB7 ", copyLabel), /* @__PURE__ */ React3.createElement("div", { className: "a4-docno" }, bill2.bill_no), /* @__PURE__ */ React3.createElement("div", null, fmtDateTime(bill2.time)), bill2.status === "CANCELLED" && /* @__PURE__ */ React3.createElement("div", { className: "a4-cancelstamp" }, "CANCELLED"))), /* @__PURE__ */ React3.createElement("div", { className: "a4-parties" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-pbox" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-plabel" }, "Billed To"), /* @__PURE__ */ React3.createElement("div", { className: "a4-pname" }, bill2.patient_name), /* @__PURE__ */ React3.createElement("div", null, "UHID: ", /* @__PURE__ */ React3.createElement("b", null, bill2.uhid)), (bill2.patient_age || bill2.patient_gender) && /* @__PURE__ */ React3.createElement("div", null, "Age / Gender: ", /* @__PURE__ */ React3.createElement("b", null, [bill2.patient_age, bill2.patient_gender].filter(Boolean).join(" / "))), bill2.patient_mobile && /* @__PURE__ */ React3.createElement("div", null, "Mobile: ", /* @__PURE__ */ React3.createElement("b", null, bill2.patient_mobile))), /* @__PURE__ */ React3.createElement("div", { className: "a4-pbox" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-plabel" }, "Clinician"), /* @__PURE__ */ React3.createElement("div", { className: "a4-pname" }, s.doctor_name), /* @__PURE__ */ React3.createElement("div", null, s.doctor_qual), /* @__PURE__ */ React3.createElement("div", null, s.doctor_role)), /* @__PURE__ */ React3.createElement("div", { className: "a4-pbox" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-plabel" }, "Payment Status"), /* @__PURE__ */ React3.createElement("div", { className: "a4-pname" }, paymentStatus), /* @__PURE__ */ React3.createElement("div", null, "Paid: ", /* @__PURE__ */ React3.createElement("b", null, money(bill2.paid, s.currency)), " \xB7 Balance: ", /* @__PURE__ */ React3.createElement("b", null, money(bill2.total - (bill2.paid || 0), s.currency))))), /* @__PURE__ */ React3.createElement("table", { className: "a4-table" }, /* @__PURE__ */ React3.createElement("thead", null, /* @__PURE__ */ React3.createElement("tr", null, /* @__PURE__ */ React3.createElement("th", { style: { width: "6%" } }, "Sr."), /* @__PURE__ */ React3.createElement("th", { style: { width: "42%" } }, "Item Name"), /* @__PURE__ */ React3.createElement("th", null, "Type"), /* @__PURE__ */ React3.createElement("th", { className: "th-right" }, "Qty"), /* @__PURE__ */ React3.createElement("th", { className: "th-right" }, "Unit Price"), /* @__PURE__ */ React3.createElement("th", { className: "th-right" }, "Total"))), /* @__PURE__ */ React3.createElement("tbody", null, items.map((it, index) => /* @__PURE__ */ React3.createElement("tr", { key: it.id }, /* @__PURE__ */ React3.createElement("td", null, index + 1), /* @__PURE__ */ React3.createElement("td", null, it.name, it.batch_no ? /* @__PURE__ */ React3.createElement("span", { className: "a4-sub" }, " \u2014 batch ", it.batch_no) : ""), /* @__PURE__ */ React3.createElement("td", { className: "a4-cap" }, it.item_type), /* @__PURE__ */ React3.createElement("td", { className: "th-right" }, fmtQty(it.qty)), /* @__PURE__ */ React3.createElement("td", { className: "th-right" }, money(it.price, s.currency)), /* @__PURE__ */ React3.createElement("td", { className: "th-right" }, money(it.amount, s.currency)))))), /* @__PURE__ */ React3.createElement("div", { className: "a4-totalrow" }, /* @__PURE__ */ React3.createElement("div", { className: "a4-note" }, bill2.cancel_reason && /* @__PURE__ */ React3.createElement("p", { className: "a4-cancel" }, "Reason for cancellation: ", bill2.cancel_reason), /* @__PURE__ */ React3.createElement("p", { className: "a4-thanks" }, s.receipt_footer || "Thank you. Get well soon!"), /* @__PURE__ */ React3.createElement("p", { className: "a4-contact" }, "For enquiries contact ", s.phone)), /* @__PURE__ */ React3.createElement("div", { className: "a4-totals" }, /* @__PURE__ */ React3.createElement("div", { className: "kv" }, /* @__PURE__ */ React3.createElement("span", null, "Subtotal"), /* @__PURE__ */ React3.createElement("b", null, money(bill2.subtotal, s.currency))), /* @__PURE__ */ React3.createElement("div", { className: "kv" }, /* @__PURE__ */ React3.createElement("span", null, "Discount"), /* @__PURE__ */ React3.createElement("b", null, "\u2212 ", money(bill2.discount, s.currency))), /* @__PURE__ */ React3.createElement("div", { className: "kv kv-total" }, /* @__PURE__ */ React3.createElement("span", null, "Total Amount"), /* @__PURE__ */ React3.createElement("b", null, money(bill2.total, s.currency))))), paidRows.length > 0 && /* @__PURE__ */ React3.createElement("div", { className: "a4-payrow" }, paidRows.map((p) => /* @__PURE__ */ React3.createElement("span", { key: p.id }, p.method, ": ", money(p.amount, s.currency), " \xB7 ", fmtDate(p.at)))), /* @__PURE__ */ React3.createElement("div", { className: "a4-sign" }, /* @__PURE__ */ React3.createElement("div", null, "Payment Method: ", paidRows.map((p) => p.method).join(", ") || "Pending"), /* @__PURE__ */ React3.createElement("div", null, "Thank You")))))))
  );
}
function printPrescription(pr, patient2) {
  const s = pr.settings;
  const age = patient2 ? ageLabel(patient2) : "";
  const sex = patient2 ? patient2.gender || "" : "";
  printNode(
    /* @__PURE__ */ React3.createElement("div", { className: "print-job a4" }, /* @__PURE__ */ React3.createElement("style", null, `@page { size: A4; margin: 10mm; } .prx { font-family: Inter, system-ui, sans-serif; color: #111; font-size: 12.5px; }`), /* @__PURE__ */ React3.createElement("div", { className: "prx" }, /* @__PURE__ */ React3.createElement("div", { className: "prx-head" }, /* @__PURE__ */ React3.createElement("div", { className: "prx-brand" }, /* @__PURE__ */ React3.createElement(Logo, { size: 54, src: s.logo }), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("div", { className: "prx-clinic" }, s.clinic_name), /* @__PURE__ */ React3.createElement("div", { className: "prx-addr" }, s.address), /* @__PURE__ */ React3.createElement("div", { className: "prx-phone" }, "Ph: ", s.phone))), /* @__PURE__ */ React3.createElement("div", { className: "prx-doc" }, /* @__PURE__ */ React3.createElement("div", { className: "prx-dname" }, s.doctor_name), /* @__PURE__ */ React3.createElement("div", { className: "prx-dqual" }, s.doctor_qual), /* @__PURE__ */ React3.createElement("div", { className: "prx-drole" }, s.doctor_role))), /* @__PURE__ */ React3.createElement("div", { className: "prx-pat" }, /* @__PURE__ */ React3.createElement("span", null, /* @__PURE__ */ React3.createElement("b", null, "Patient:"), " ", patient2?.name || "\u2014", " \xA0 ", /* @__PURE__ */ React3.createElement("b", null, "Age/Sex:"), " ", age, " / ", sex), /* @__PURE__ */ React3.createElement("span", null, /* @__PURE__ */ React3.createElement("b", null, "UHID:"), " ", pr.uhid), /* @__PURE__ */ React3.createElement("span", null, /* @__PURE__ */ React3.createElement("b", null, "Date:"), " ", fmtDate(pr.time))), pr.diagnosis && /* @__PURE__ */ React3.createElement("div", { className: "prx-diag" }, /* @__PURE__ */ React3.createElement("b", null, "Diagnosis:"), " ", pr.diagnosis), /* @__PURE__ */ React3.createElement("div", { className: "prx-rx" }, "\u211E"), /* @__PURE__ */ React3.createElement("table", { className: "prx-table" }, /* @__PURE__ */ React3.createElement("thead", null, /* @__PURE__ */ React3.createElement("tr", null, /* @__PURE__ */ React3.createElement("th", { style: { width: "30%" } }, "Medicine"), /* @__PURE__ */ React3.createElement("th", { style: { width: "16%" } }, "Dosage"), /* @__PURE__ */ React3.createElement("th", { style: { width: "20%" } }, "Frequency"), /* @__PURE__ */ React3.createElement("th", { style: { width: "14%" } }, "Duration"), /* @__PURE__ */ React3.createElement("th", null, "Instructions"))), /* @__PURE__ */ React3.createElement("tbody", null, (pr.items || []).map((it, i) => /* @__PURE__ */ React3.createElement("tr", { key: it.id }, /* @__PURE__ */ React3.createElement("td", null, /* @__PURE__ */ React3.createElement("b", null, i + 1, "."), " ", it.name), /* @__PURE__ */ React3.createElement("td", null, it.dosage || "\u2014"), /* @__PURE__ */ React3.createElement("td", null, it.frequency || "\u2014"), /* @__PURE__ */ React3.createElement("td", null, it.duration || "\u2014"), /* @__PURE__ */ React3.createElement("td", null, it.instruction || "\u2014"))))), pr.advice && /* @__PURE__ */ React3.createElement("div", { className: "prx-advice" }, /* @__PURE__ */ React3.createElement("b", null, "Advice:"), " ", pr.advice), pr.notes && /* @__PURE__ */ React3.createElement("div", { className: "prx-notes" }, /* @__PURE__ */ React3.createElement("b", null, "Notes:"), " ", pr.notes), /* @__PURE__ */ React3.createElement("div", { className: "prx-sign" }, /* @__PURE__ */ React3.createElement("div", { className: "prx-signline" }), /* @__PURE__ */ React3.createElement("div", null, s.doctor_name, /* @__PURE__ */ React3.createElement("br", null), /* @__PURE__ */ React3.createElement("span", { className: "prx-signqual" }, s.doctor_qual))), /* @__PURE__ */ React3.createElement("div", { className: "prx-foot" }, s.receipt_footer || "", " \xB7 ", s.phone)))
  );
}
function printReport({ title, subtitle, columns, rows, totals, s }) {
  printNode(
    /* @__PURE__ */ React3.createElement("div", { className: "print-job a4" }, /* @__PURE__ */ React3.createElement("style", null, `@page { size: A4 landscape; margin: 10mm; } .rpt { font-family: Inter, system-ui, sans-serif; color: #111; font-size: 11px; }`), /* @__PURE__ */ React3.createElement("div", { className: "rpt" }, /* @__PURE__ */ React3.createElement("div", { className: "rpt-head" }, /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("div", { className: "rpt-clinic" }, s?.clinic_name || "HEEVA CLINIC"), /* @__PURE__ */ React3.createElement("div", { className: "rpt-title" }, title), subtitle && /* @__PURE__ */ React3.createElement("div", { className: "rpt-sub" }, subtitle)), /* @__PURE__ */ React3.createElement("div", { className: "rpt-date" }, "Generated ", fmtDateTime((/* @__PURE__ */ new Date()).toISOString()))), /* @__PURE__ */ React3.createElement("table", { className: "rpt-table" }, /* @__PURE__ */ React3.createElement("thead", null, /* @__PURE__ */ React3.createElement("tr", null, columns.map((c) => /* @__PURE__ */ React3.createElement("th", { key: c.key, className: c.align === "right" ? "th-right" : "" }, c.label)))), /* @__PURE__ */ React3.createElement("tbody", null, (rows || []).map((r, i) => /* @__PURE__ */ React3.createElement("tr", { key: i }, columns.map((c) => /* @__PURE__ */ React3.createElement("td", { key: c.key, className: c.align === "right" ? "th-right" : "" }, c.render ? c.render(r) : r[c.key] ?? "\u2014")))), totals && /* @__PURE__ */ React3.createElement("tr", { className: "rpt-total" }, columns.map((c, i) => /* @__PURE__ */ React3.createElement("td", { key: c.key, className: c.align === "right" ? "th-right" : "" }, i === 0 ? "TOTAL" : totals[c.key] != null ? totals[c.key] : ""))))), /* @__PURE__ */ React3.createElement("div", { className: "rpt-foot" }, s?.receipt_footer || "", " \xB7 ", s?.phone || "")))
  );
}
function printPatientCard(p, s) {
  return printNode(
    /* @__PURE__ */ React3.createElement("div", { className: "print-job a4" }, /* @__PURE__ */ React3.createElement("style", null, `@page { size: A4; margin: 15mm; } .pcc { font-family: Inter, system-ui, sans-serif; color: #111; }`), /* @__PURE__ */ React3.createElement("div", { className: "pcc" }, /* @__PURE__ */ React3.createElement("div", { className: "pcc-card" }, /* @__PURE__ */ React3.createElement("div", { className: "pcc-top" }, /* @__PURE__ */ React3.createElement("div", { className: "pcc-brand" }, /* @__PURE__ */ React3.createElement(Logo, { size: 40, src: s.logo }), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("div", { className: "pcc-clinic" }, s.clinic_name), /* @__PURE__ */ React3.createElement("div", { className: "pcc-tag" }, s.tagline))), /* @__PURE__ */ React3.createElement("div", { className: "pcc-doctor" }, s.doctor_name, /* @__PURE__ */ React3.createElement("br", null), /* @__PURE__ */ React3.createElement("span", { className: "pcc-qual" }, s.doctor_qual))), /* @__PURE__ */ React3.createElement("div", { className: "pcc-body" }, /* @__PURE__ */ React3.createElement("div", { className: "pcc-name" }, p.name), /* @__PURE__ */ React3.createElement("div", { className: "pcc-uhid" }, p.uhid), /* @__PURE__ */ React3.createElement("div", { className: "pcc-grid" }, /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("span", null, "Age / Sex"), /* @__PURE__ */ React3.createElement("b", null, ageLabel(p), " / ", p.gender || "\u2014")), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("span", null, "DOB"), /* @__PURE__ */ React3.createElement("b", null, fmtDate(p.dob))), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("span", null, "Blood Group"), /* @__PURE__ */ React3.createElement("b", null, p.blood_group || "\u2014")), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("span", null, "Mobile"), /* @__PURE__ */ React3.createElement("b", null, p.mobile || "\u2014")), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("span", null, "Allergies"), /* @__PURE__ */ React3.createElement("b", null, p.allergies || "None recorded")), /* @__PURE__ */ React3.createElement("div", null, /* @__PURE__ */ React3.createElement("span", null, "Registered"), /* @__PURE__ */ React3.createElement("b", null, fmtDate(p.reg_date))))), /* @__PURE__ */ React3.createElement("div", { className: "pcc-foot" }, /* @__PURE__ */ React3.createElement("span", { className: "pcc-barcode", "aria-hidden": "true" }), /* @__PURE__ */ React3.createElement("div", { className: "pcc-contact" }, s.address, /* @__PURE__ */ React3.createElement("br", null), "Phone: ", s.phone)))))
  );
}
var _printFn, printNode, money;
var init_printers = __esm({
  "src/print/printers.jsx"() {
    init_ui();
    init_utils();
    _printFn = null;
    printNode = (node) => {
      if (_printFn) _printFn(node);
    };
    money = (v, sym = "\u20B9") => fmtMoney(v, sym);
  }
});

// src/context/PrintContext.jsx
var PrintContext_exports = {};
__export(PrintContext_exports, {
  PrintProvider: () => PrintProvider,
  usePrint: () => usePrint
});
import React4, { createContext as createContext2, useContext as useContext2, useEffect as useEffect3, useState as useState3, useCallback as useCallback2 } from "react";
function PrintProvider({ children }) {
  const [job, setJob] = useState3(null);
  const print = useCallback2((node) => setJob({ node, id: Date.now() }), []);
  useEffect3(() => {
    registerPrinter(print);
    return () => registerPrinter(null);
  }, [print]);
  useEffect3(() => {
    if (!job) return void 0;
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch (e) {
      }
    }, 200);
    const after = () => setJob(null);
    window.addEventListener("afterprint", after);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("afterprint", after);
    };
  }, [job]);
  return /* @__PURE__ */ React4.createElement(Ctx2.Provider, { value: { print, printing: !!job } }, children, /* @__PURE__ */ React4.createElement("div", { id: "print-root" }, job ? job.node : null));
}
var Ctx2, usePrint;
var init_PrintContext = __esm({
  "src/context/PrintContext.jsx"() {
    init_printers();
    Ctx2 = createContext2(null);
    usePrint = () => useContext2(Ctx2);
  }
});

// src/layout/AppShell.jsx
import React5, { useState as useState4, useEffect as useEffect4, useMemo as useMemo3 } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Home,
  Users,
  Stethoscope,
  CalendarDays,
  FileText,
  ReceiptText,
  CreditCard,
  Pill,
  Boxes,
  Undo2,
  Wallet,
  BarChart3,
  Bell,
  UserCog,
  Settings as SettingsIcon,
  Search as Search2,
  Plus,
  Moon,
  Sun,
  Download,
  WifiOff,
  ChevronRight as ChevronRight2
} from "lucide-react";
function GlobalSearch() {
  const [q, setQ] = useState4("");
  const [res, setRes] = useState4(null);
  const [open, setOpen] = useState4(false);
  const navigate = useNavigate();
  useEffect4(() => {
    if (q.trim().length < 2) {
      setRes(null);
      return void 0;
    }
    let on = true;
    (async () => {
      const s = q.trim().toLowerCase();
      const sDigits = s.replace(/\D/g, "");
      const [patients, bills, meds] = await Promise.all([
        db_default.patients.filter((p) => (p.name || "").toLowerCase().includes(s) || (p.uhid || "").toLowerCase().includes(s) || (p.mobile || "").includes(sDigits)).limit(5).toArray(),
        db_default.bills.filter((b) => (b.bill_no || "").toLowerCase().includes(s) || (b.patient_name || "").toLowerCase().includes(s)).limit(5).toArray(),
        db_default.medicines.filter((m) => m.active && ((m.name || "").toLowerCase().includes(s) || (m.generic || "").toLowerCase().includes(s) || (m.barcode || "").includes(sDigits))).limit(5).toArray()
      ]);
      if (on) setRes({ patients, bills, meds });
    })();
    return () => {
      on = false;
    };
  }, [q]);
  const go = (path) => {
    navigate(path);
    setQ("");
    setOpen(false);
  };
  const empty = res && !res.patients.length && !res.bills.length && !res.meds.length;
  return /* @__PURE__ */ React5.createElement("div", { className: "gsearch" }, /* @__PURE__ */ React5.createElement("div", { className: "gsearch-box" }, /* @__PURE__ */ React5.createElement(Search2, { size: 16, className: "gsearch-icon" }), /* @__PURE__ */ React5.createElement(
    "input",
    {
      className: "gsearch-input",
      placeholder: "Search patients, UHID, medicines...",
      value: q,
      onChange: (e) => {
        setQ(e.target.value);
        setOpen(true);
      },
      onFocus: () => setOpen(true),
      onBlur: () => setTimeout(() => setOpen(false), 180)
    }
  )), open && q.trim().length >= 2 && /* @__PURE__ */ React5.createElement("div", { className: "gsearch-drop" }, empty && /* @__PURE__ */ React5.createElement("div", { className: "gsearch-none" }, "No results for \u201C", q, "\u201D"), res?.patients.length > 0 && /* @__PURE__ */ React5.createElement("div", { className: "gs-group" }, /* @__PURE__ */ React5.createElement("div", { className: "gs-title" }, "Patients"), res.patients.map((p) => /* @__PURE__ */ React5.createElement("button", { key: p.id, className: "gs-item", onMouseDown: () => go(`/patients/${p.id}`) }, /* @__PURE__ */ React5.createElement(Users, { size: 14 }), /* @__PURE__ */ React5.createElement("span", { className: "gs-main" }, p.name), /* @__PURE__ */ React5.createElement("span", { className: "gs-sub" }, p.uhid, " \xB7 ", p.mobile || "")))), res?.bills.length > 0 && /* @__PURE__ */ React5.createElement("div", { className: "gs-group" }, /* @__PURE__ */ React5.createElement("div", { className: "gs-title" }, "Bills"), res.bills.map((b) => /* @__PURE__ */ React5.createElement("button", { key: b.id, className: "gs-item", onMouseDown: () => go(`/billing?bill=${b.id}`) }, /* @__PURE__ */ React5.createElement(ReceiptText, { size: 14 }), /* @__PURE__ */ React5.createElement("span", { className: "gs-main" }, b.bill_no), /* @__PURE__ */ React5.createElement("span", { className: "gs-sub" }, b.patient_name, " \xB7 \u20B9", (b.total || 0).toLocaleString("en-IN"))))), res?.meds.length > 0 && /* @__PURE__ */ React5.createElement("div", { className: "gs-group" }, /* @__PURE__ */ React5.createElement("div", { className: "gs-title" }, "Medicines"), res.meds.map((m) => /* @__PURE__ */ React5.createElement("button", { key: m.id, className: "gs-item", onMouseDown: () => go(`/medicines?q=${encodeURIComponent(m.name)}`) }, /* @__PURE__ */ React5.createElement(Pill, { size: 14 }), /* @__PURE__ */ React5.createElement("span", { className: "gs-main" }, m.name), /* @__PURE__ */ React5.createElement("span", { className: "gs-sub" }, m.generic || m.category))))));
}
function NotificationBell() {
  const { notifCount, refreshNotifs, t } = useApp();
  const [open, setOpen] = useState4(false);
  const navigate = useNavigate();
  const notifs = useLiveQuery(() => db_default.notifications.orderBy("at").reverse().limit(8).toArray(), [], []);
  return /* @__PURE__ */ React5.createElement("div", { className: "bell-wrap" }, /* @__PURE__ */ React5.createElement(IconBtn, { title: "Notifications", icon: Bell, onClick: () => setOpen((o) => !o), active: open }), notifCount > 0 && /* @__PURE__ */ React5.createElement("span", { className: "bell-count" }, notifCount > 99 ? "99+" : notifCount), open && /* @__PURE__ */ React5.createElement(React5.Fragment, null, /* @__PURE__ */ React5.createElement("div", { className: "drop-backdrop", onClick: () => setOpen(false) }), /* @__PURE__ */ React5.createElement("div", { className: "notif-drop" }, /* @__PURE__ */ React5.createElement("div", { className: "notif-drop-head" }, /* @__PURE__ */ React5.createElement("strong", null, "Notifications"), /* @__PURE__ */ React5.createElement(Link, { to: "/alerts", onClick: () => setOpen(false), className: "notif-all" }, "View all ", /* @__PURE__ */ React5.createElement(ChevronRight2, { size: 13 }))), (!notifs || !notifs.length) && /* @__PURE__ */ React5.createElement("div", { className: "notif-empty" }, "You are all caught up."), (notifs || []).map((n) => /* @__PURE__ */ React5.createElement(
    "button",
    {
      key: n.id,
      className: cx("notif-item", !n.read && "notif-unread"),
      onClick: async () => {
        await db_default.notifications.put({ ...n, read: true });
        refreshNotifs();
        setOpen(false);
        navigate("/alerts");
      }
    },
    /* @__PURE__ */ React5.createElement("span", { className: cx("notif-dot", `nd-${n.severity}`) }),
    /* @__PURE__ */ React5.createElement("span", { className: "notif-body" }, /* @__PURE__ */ React5.createElement("span", { className: "notif-title" }, n.title), /* @__PURE__ */ React5.createElement("span", { className: "notif-msg" }, n.message)),
    /* @__PURE__ */ React5.createElement("span", { className: "notif-time" }, fmtDateTime(n.at).split(", ")[1] || fmtDate(n.at))
  )))));
}
function AppShell() {
  const { user: user3, t, settings, theme, setTheme, online, toasts, install, installEvt, standalone, can } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const today = todayStr();
  const dateLabel = useMemo3(() => (/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }), []);
  return /* @__PURE__ */ React5.createElement("div", { className: "app-shell" }, /* @__PURE__ */ React5.createElement("aside", { className: "sidebar" }, /* @__PURE__ */ React5.createElement("div", { className: "side-brand" }, /* @__PURE__ */ React5.createElement(Logo, { size: 38, src: settings.logo }), /* @__PURE__ */ React5.createElement("div", { className: "side-brand-text" }, /* @__PURE__ */ React5.createElement("div", { className: "side-brand-name" }, settings.clinic_name))), /* @__PURE__ */ React5.createElement("nav", { className: "side-nav" }, NAV.map((g) => {
    const items = g.items.filter((i) => can(i.key));
    if (!items.length) return null;
    return /* @__PURE__ */ React5.createElement("div", { className: "side-group", key: g.group }, /* @__PURE__ */ React5.createElement("div", { className: "side-group-label" }, g.group), items.map((i) => {
      const active = i.to === "/" ? location.pathname === "/" : location.pathname.startsWith(i.to);
      return /* @__PURE__ */ React5.createElement(
        "button",
        {
          key: i.key,
          className: cx("side-item", active && "side-active", i.hot && "side-hot"),
          onClick: () => navigate(i.to),
          title: i.label,
          "aria-label": i.label
        },
        /* @__PURE__ */ React5.createElement(i.icon, { size: 18, className: "side-icon" }),
        /* @__PURE__ */ React5.createElement("span", { className: "side-label" }, i.label),
        i.hot && /* @__PURE__ */ React5.createElement("span", { className: "side-hot-dot" })
      );
    }));
  })), /* @__PURE__ */ React5.createElement("div", { className: "side-foot" }, /* @__PURE__ */ React5.createElement("div", { className: "side-foot-card" }, /* @__PURE__ */ React5.createElement("div", { className: "sfc-name" }, user3?.name || settings.clinic_name), /* @__PURE__ */ React5.createElement("div", { className: "sfc-qual" }, "Administrator")))), /* @__PURE__ */ React5.createElement("div", { className: "main-col" }, /* @__PURE__ */ React5.createElement("header", { className: "topbar" }, /* @__PURE__ */ React5.createElement("div", { className: "topbar-left" }, /* @__PURE__ */ React5.createElement(GlobalSearch, null)), /* @__PURE__ */ React5.createElement("div", { className: "topbar-center" }, /* @__PURE__ */ React5.createElement(Btn, { variant: "accent", icon: Plus, size: "sm", onClick: () => navigate("/patients?new=1"), title: "Register a new patient" }, t("new_patient", "New Patient"))), /* @__PURE__ */ React5.createElement("div", { className: "topbar-right" }, !online && /* @__PURE__ */ React5.createElement("span", { className: "offline-pill", title: t("offline") }, /* @__PURE__ */ React5.createElement(WifiOff, { size: 13 }), " Offline"), /* @__PURE__ */ React5.createElement("span", { className: "topbar-date" }, dateLabel), installEvt && !standalone && /* @__PURE__ */ React5.createElement(Btn, { variant: "ghost", size: "sm", icon: Download, onClick: install, title: "Install HEEVA Clinic as a desktop app" }, t("install_app", "Install")), /* @__PURE__ */ React5.createElement(NotificationBell, null), /* @__PURE__ */ React5.createElement(IconBtn, { title: theme === "light" ? "Switch to dark mode" : "Switch to light mode", icon: theme === "light" ? Moon : Sun, onClick: () => setTheme(theme === "light" ? "dark" : "light") }))), !online && /* @__PURE__ */ React5.createElement("div", { className: "offline-banner" }, /* @__PURE__ */ React5.createElement(WifiOff, { size: 14 }), " ", t("offline", "Offline \u2014 changes are saved on this device")), /* @__PURE__ */ React5.createElement("main", { className: "content" }, /* @__PURE__ */ React5.createElement(Outlet, null))), /* @__PURE__ */ React5.createElement(ToastStack, { toasts }));
}
var NAV;
var init_AppShell = __esm({
  "src/layout/AppShell.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_utils();
    NAV = [
      { group: "Clinic", items: [
        { key: "dashboard", to: "/", label: "Dashboard", icon: Home },
        { key: "patients", to: "/patients", label: "Patients", icon: Users },
        { key: "consultations", to: "/consultations", label: "Consultations", icon: Stethoscope },
        { key: "appointments", to: "/appointments", label: "Appointments", icon: CalendarDays }
      ] },
      { group: "Clinical", items: [
        { key: "prescriptions", to: "/prescriptions", label: "Prescriptions", icon: FileText }
      ] },
      { group: "Operations", items: [
        { key: "billing", to: "/billing", label: "Billing", icon: ReceiptText },
        { key: "payments", to: "/payments", label: "Payments", icon: CreditCard }
      ] },
      { group: "Pharmacy & Stock", items: [
        { key: "medicines", to: "/medicines", label: "Medicines", icon: Pill },
        { key: "inventory", to: "/inventory", label: "Inventory", icon: Boxes },
        { key: "returns", to: "/returns", label: "Returns", icon: Undo2 }
      ] },
      { group: "Finance", items: [
        { key: "expenses", to: "/expenses", label: "Expenses", icon: Wallet },
        { key: "reports", to: "/reports", label: "Reports", icon: BarChart3 }
      ] },
      { group: "Administration", items: [
        { key: "alerts", to: "/alerts", label: "Alerts", icon: Bell },
        { key: "staff", to: "/staff", label: "Staff & Users", icon: UserCog },
        { key: "settings", to: "/settings", label: "Settings", icon: SettingsIcon }
      ] }
    ];
  }
});

// src/components/charts.jsx
import React6, { useMemo as useMemo4 } from "react";
function niceMax(v) {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}
function LineChart({ data, height = 180, color = "var(--teal-600)", area = true, money: money2 = false, unit = "" }) {
  const W = 560;
  const H = height;
  const padL = 46;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const values = data.map((d) => d.value);
  const max = niceMax(Math.max(...values, 1));
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const x = (i) => padL + (data.length <= 1 ? iw / 2 : i * iw / (data.length - 1));
  const y = (v) => padT + ih - v / max * ih;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const areaPath = data.length > 1 ? `M ${x(0)},${y(0) + 0} L ${pts.split(" ").join(" L ")} L ${x(data.length - 1)},${padT + ih} L ${x(0)},${padT + ih} Z` : "";
  const fmt = (v) => money2 ? "\u20B9" + Math.round(v).toLocaleString("en-IN") : v + unit;
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  return /* @__PURE__ */ React6.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: "chart", role: "img" }, gridVals.map((gv, i) => /* @__PURE__ */ React6.createElement("g", { key: i }, /* @__PURE__ */ React6.createElement("line", { x1: padL, x2: W - padR, y1: y(gv), y2: y(gv), className: "chart-grid" }), /* @__PURE__ */ React6.createElement("text", { x: padL - 6, y: y(gv) + 3.5, textAnchor: "end", className: "chart-tick" }, fmt(gv)))), area && data.length > 1 && /* @__PURE__ */ React6.createElement("path", { d: areaPath, className: "chart-area", fill: color, opacity: "0.12" }), data.length > 1 && /* @__PURE__ */ React6.createElement("polyline", { points: pts, fill: "none", stroke: color, strokeWidth: "2.5", strokeLinejoin: "round", strokeLinecap: "round" }), data.map((d, i) => /* @__PURE__ */ React6.createElement("g", { key: i }, /* @__PURE__ */ React6.createElement("circle", { cx: x(i), cy: y(d.value), r: data.length > 16 ? 2.4 : 3.4, fill: color }, /* @__PURE__ */ React6.createElement("title", null, `${d.label}: ${fmt(d.value)}`)), (data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && /* @__PURE__ */ React6.createElement("text", { x: x(i), y: H - 8, textAnchor: "middle", className: "chart-tick" }, d.label))));
}
function BarChart({ series, labels, height = 180, money: money2 = false }) {
  const W = 560;
  const H = height;
  const padL = 46;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const max = niceMax(Math.max(...series.flatMap((s) => s.data), 1));
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const groupW = iw / Math.max(labels.length, 1);
  const barW = Math.min(22, groupW * 0.7 / Math.max(series.length, 1));
  const y = (v) => padT + ih - v / max * ih;
  const fmt = (v) => money2 ? "\u20B9" + Math.round(v).toLocaleString("en-IN") : String(v);
  return /* @__PURE__ */ React6.createElement("svg", { viewBox: `0 0 ${W} ${H}`, className: "chart", role: "img" }, [0, 0.25, 0.5, 0.75, 1].map((f, i) => /* @__PURE__ */ React6.createElement("g", { key: i }, /* @__PURE__ */ React6.createElement("line", { x1: padL, x2: W - padR, y1: y(max * f), y2: y(max * f), className: "chart-grid" }), /* @__PURE__ */ React6.createElement("text", { x: padL - 6, y: y(max * f) + 3.5, textAnchor: "end", className: "chart-tick" }, fmt(max * f)))), labels.map((lb, i) => {
    const cx0 = padL + groupW * i + groupW / 2;
    const total = series.length * barW + (series.length - 1) * 3;
    return /* @__PURE__ */ React6.createElement("g", { key: i }, series.map((s, si) => {
      const v = s.data[i] || 0;
      const bx = cx0 - total / 2 + si * (barW + 3);
      return /* @__PURE__ */ React6.createElement("rect", { key: si, x: bx, y: y(v), width: barW, height: Math.max(0, padT + ih - y(v)), rx: "3", fill: s.color }, /* @__PURE__ */ React6.createElement("title", null, `${lb} \u2014 ${s.name}: ${fmt(v)}`));
    }), /* @__PURE__ */ React6.createElement("text", { x: cx0, y: H - 8, textAnchor: "middle", className: "chart-tick" }, lb));
  }), /* @__PURE__ */ React6.createElement("g", { className: "chart-legend" }, series.map((s, i) => /* @__PURE__ */ React6.createElement("g", { key: i, transform: `translate(${padL + i * 110}, ${H - 2})` }, /* @__PURE__ */ React6.createElement("rect", { x: "0", y: "-9", width: "10", height: "10", rx: "2", fill: s.color }), /* @__PURE__ */ React6.createElement("text", { x: "15", y: "0", className: "chart-tick" }, s.name)))));
}
function HBarList({ items, color = "var(--teal-600)", money: money2 = false, unit = "" }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = (v) => money2 ? "\u20B9" + Math.round(v).toLocaleString("en-IN") : v.toLocaleString("en-IN") + unit;
  if (!items.length) return /* @__PURE__ */ React6.createElement("div", { className: "hbars-empty" }, "No data in range");
  return /* @__PURE__ */ React6.createElement("div", { className: "hbars" }, items.map((it, i) => /* @__PURE__ */ React6.createElement("div", { className: "hbar-row", key: i }, /* @__PURE__ */ React6.createElement("div", { className: "hbar-label", title: it.label }, it.label), /* @__PURE__ */ React6.createElement("div", { className: "hbar-track" }, /* @__PURE__ */ React6.createElement("div", { className: "hbar-fill", style: { width: `${it.value / max * 100}%`, background: color } })), /* @__PURE__ */ React6.createElement("div", { className: "hbar-value" }, fmt(it.value)))));
}
var init_charts = __esm({
  "src/components/charts.jsx"() {
  }
});

// src/services/reports.js
function bucketKey(dateStr, group) {
  if (group === "day") return dateStr;
  if (group === "month") return dateStr.slice(0, 7);
  return dkey(weekStart(/* @__PURE__ */ new Date(dateStr + "T00:00:00")));
}
async function salesReport(from, to, group = "day") {
  const [bills, expenses] = await Promise.all([db_default.bills.toArray(), db_default.expenses.toArray()]);
  const valid = bills.filter((b) => b.status === "completed" && b.date >= from && b.date <= to);
  const expIn = expenses.filter((e) => e.status === "active" && e.date >= from && e.date <= to);
  const buckets = /* @__PURE__ */ new Map();
  const get = (k) => {
    if (!buckets.has(k)) buckets.set(k, { key: k, bills: 0, revenue: 0, paid: 0, pending: 0, expenses: 0 });
    return buckets.get(k);
  };
  for (const b of valid) {
    const o = get(bucketKey(b.date, group));
    o.bills++;
    o.revenue = round2(o.revenue + b.total);
    o.paid = round2(o.paid + (b.paid || 0));
    o.pending = round2(o.pending + (b.total - (b.paid || 0)));
  }
  for (const e of expIn) get(bucketKey(e.date, group)).expenses = round2(get(bucketKey(e.date, group)).expenses + e.amount);
  const rows = [...buckets.values()].sort((a, b) => a.key < b.key ? -1 : 1).map((o) => ({ ...o, profit: round2(o.revenue - o.expenses) }));
  const totals = rows.reduce(
    (t, r) => ({
      bills: t.bills + r.bills,
      revenue: round2(t.revenue + r.revenue),
      paid: round2(t.paid + r.paid),
      pending: round2(t.pending + r.pending),
      expenses: round2(t.expenses + r.expenses),
      profit: round2(t.profit + r.profit)
    }),
    { bills: 0, revenue: 0, paid: 0, pending: 0, expenses: 0, profit: 0 }
  );
  return { rows, totals };
}
async function revenueSeries(days = 14) {
  const bills = await db_default.bills.where("status").equals("completed").toArray();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dkey(addDays(/* @__PURE__ */ new Date(), -i));
    const dayBills = bills.filter((b) => b.date === d);
    out.push({
      label: (/* @__PURE__ */ new Date(d + "T00:00:00")).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      key: d,
      revenue: round2(dayBills.reduce((s, b) => s + b.total, 0)),
      visits: await db_default.consultations.where("date").equals(d).count(),
      bills: dayBills.length
    });
  }
  return out;
}
async function visitsSeries(days = 7) {
  const consultations = await db_default.consultations.toArray();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dkey(addDays(/* @__PURE__ */ new Date(), -i));
    out.push({
      label: (/* @__PURE__ */ new Date(d + "T00:00:00")).toLocaleDateString("en-GB", { weekday: "short" }),
      value: consultations.filter((c) => c.date === d).length
    });
  }
  return out;
}
async function topMedicines(from, to, limit = 5) {
  const [items, bills] = await Promise.all([db_default.bill_items.toArray(), db_default.bills.toArray()]);
  const billIds = new Map(bills.filter((b) => b.status === "completed" && b.date >= from && b.date <= to).map((b) => [b.id, b]));
  const map = /* @__PURE__ */ new Map();
  for (const it of items) {
    if (it.item_type !== "medicine" || !billIds.has(it.bill_id)) continue;
    const e = map.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
    e.qty = round2(e.qty + it.qty);
    e.revenue = round2(e.revenue + it.amount);
    map.set(it.name, e);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}
async function patientReport(from, to) {
  const [patients, consults] = await Promise.all([db_default.patients.toArray(), db_default.consultations.toArray()]);
  const newPatients = patients.filter((p) => p.reg_date >= from && p.reg_date <= to);
  const visitsByPatient = /* @__PURE__ */ new Map();
  for (const c of consults) {
    if (c.date < from || c.date > to) continue;
    visitsByPatient.set(c.patient_id, (visitsByPatient.get(c.patient_id) || 0) + 1);
  }
  const firstVisit = /* @__PURE__ */ new Map();
  for (const p of patients) firstVisit.set(p.id, p.reg_date);
  const returning = [];
  const totalVisits = /* @__PURE__ */ new Map();
  for (const c of consults) totalVisits.set(c.patient_id, (totalVisits.get(c.patient_id) || 0) + 1);
  for (const [pid2, count] of visitsByPatient) {
    const p = patients.find((x) => x.id === pid2);
    if (!p) continue;
    const prev = (totalVisits.get(pid2) || 0) - count;
    if (prev > 0) returning.push({ patient: p, visits: count, total_visits: totalVisits.get(pid2) });
  }
  returning.sort((a, b) => b.visits - a.visits);
  return {
    new_patients: newPatients,
    unique_visits: visitsByPatient.size,
    total_visits: [...visitsByPatient.values()].reduce((s, n) => s + n, 0),
    returning: returning.slice(0, 50)
  };
}
async function financialReport(from, to) {
  const [bills, expenses, payments] = await Promise.all([db_default.bills.toArray(), db_default.expenses.toArray(), db_default.payments.toArray()]);
  const valid = bills.filter((b) => b.status === "completed" && b.date >= from && b.date <= to);
  const revenueByMethod = {};
  for (const p of payments) {
    if (p.kind !== "payment") continue;
    const b = valid.find((x) => x.id === p.bill_id);
    if (!b) continue;
    revenueByMethod[p.method] = round2((revenueByMethod[p.method] || 0) + p.amount);
  }
  const expIn = expenses.filter((e) => e.status === "active" && e.date >= from && e.date <= to);
  const expensesByCategory = {};
  for (const e of expIn) expensesByCategory[e.category] = round2((expensesByCategory[e.category] || 0) + e.amount);
  const revenue = round2(valid.reduce((s, b) => s + b.total, 0));
  const expensesTotal = round2(expIn.reduce((s, e) => s + e.amount, 0));
  const pending = bills.filter((b) => b.status === "completed" && b.payment_status !== "PAID").map((b) => ({ bill: b, due: round2(b.total - (b.paid || 0)), days: daysUntil(b.date) })).filter((x) => x.due > 5e-3).sort((a, b) => a.days - b.days);
  return {
    revenue,
    expenses: expensesTotal,
    profit: round2(revenue - expensesTotal),
    revenue_by_method: revenueByMethod,
    expenses_by_category: expensesByCategory,
    pending_payments: pending
  };
}
async function dashboardStats() {
  const today = dkey(/* @__PURE__ */ new Date());
  const [bills, consults, patients, expenses, map] = await Promise.all([
    db_default.bills.toArray(),
    db_default.consultations.toArray(),
    db_default.patients.toArray(),
    db_default.expenses.toArray(),
    stockMap()
  ]);
  const todayBills = bills.filter((b) => b.date === today && b.status === "completed");
  const todayConsults = consults.filter((c) => c.date === today);
  const todayPatientIds = /* @__PURE__ */ new Set([...todayConsults.map((c) => c.patient_id), ...todayBills.map((b) => b.patient_id)]);
  const todayExpenses = expenses.filter((e) => e.date === today && e.status === "active").reduce((s, e) => s + e.amount, 0);
  const monthStart = today.slice(0, 8) + "01";
  const mtdBills = bills.filter((b) => b.date >= monthStart && b.status === "completed");
  const mtdExpenses = expenses.filter((e) => e.date >= monthStart && e.status === "active").reduce((s, e) => s + e.amount, 0);
  const pending = bills.filter((b) => b.status === "completed" && b.payment_status !== "PAID");
  const activeMeds = [...map.values()].filter((e) => e.medicine.active);
  const stock = await lowStockList();
  const buckets = await expiryBuckets();
  return {
    today: {
      patients: todayPatientIds.size,
      consultations: todayConsults.length,
      bills: todayBills.length,
      revenue: round2(todayBills.reduce((s, b) => s + b.total, 0)),
      expenses: round2(todayExpenses),
      profit: round2(todayBills.reduce((s, b) => s + b.total, 0) - todayExpenses)
    },
    month: {
      revenue: round2(mtdBills.reduce((s, b) => s + b.total, 0)),
      expenses: round2(mtdExpenses),
      profit: round2(mtdBills.reduce((s, b) => s + b.total, 0) - mtdExpenses)
    },
    medicines: { total: activeMeds.length, low: stock.low.length, out: stock.out.length },
    expiring: { expired: buckets.expired.length, d30: buckets.d30.length, d60: buckets.d60.length, d90: buckets.d90.length },
    pending_payments: { count: pending.length, amount: round2(pending.reduce((s, b) => s + (b.total - (b.paid || 0)), 0)) }
  };
}
var init_reports = __esm({
  "src/services/reports.js"() {
    init_db();
    init_utils();
    init_core();
    init_inventory();
  }
});

// src/pages/Dashboard.jsx
import React7 from "react";
import { useNavigate as useNavigate2 } from "react-router-dom";
import { useLiveQuery as useLiveQuery2 } from "dexie-react-hooks";
import {
  Users as Users2,
  Stethoscope as Stethoscope2,
  ReceiptText as ReceiptText2,
  Wallet as Wallet2,
  TrendingUp,
  Pill as Pill2,
  AlertTriangle as AlertTriangle2,
  Hourglass,
  CreditCard as CreditCard2,
  Plus as Plus2,
  UserPlus,
  FilePlus2,
  PackagePlus,
  CalendarDays as CalendarDays2,
  Clock
} from "lucide-react";
function SectionCard({ title, icon: Icon, children, action, to }) {
  const navigate = useNavigate2();
  return /* @__PURE__ */ React7.createElement(
    Card,
    {
      title,
      actions: action || (to ? /* @__PURE__ */ React7.createElement(Btn, { variant: "ghost", size: "sm", onClick: () => navigate(to) }, "View all") : null),
      className: "dash-section"
    },
    children
  );
}
function Dashboard() {
  const { t, settings, can, user: user3 } = useApp();
  const navigate = useNavigate2();
  const stats = useLiveQuery2(() => dashboardStats(), []);
  const rev14 = useLiveQuery2(() => revenueSeries(14), []);
  const visits7 = useLiveQuery2(() => visitsSeries(7), []);
  const topMeds = useLiveQuery2(() => topMedicines(dkey(addDays(/* @__PURE__ */ new Date(), -29)), todayStr(), 5), []);
  const rev7 = useLiveQuery2(async () => {
    const r = await salesReport(dkey(addDays(/* @__PURE__ */ new Date(), -6)), todayStr(), "day");
    return r.rows.map((x) => ({ label: x.key.slice(8) + "/" + x.key.slice(5, 7), revenue: x.revenue, expenses: x.expenses }));
  }, []);
  const recentPatients = useLiveQuery2(() => db_default.patients.orderBy("created_at").reverse().limit(5).toArray(), []);
  const recentBills = useLiveQuery2(() => db_default.bills.orderBy("time").reverse().limit(5).toArray(), []);
  const upAppts = useLiveQuery2(async () => {
    const t0 = todayStr();
    const t1 = dkey(addDays(/* @__PURE__ */ new Date(), 1));
    const all = await db_default.appointments.filter((a) => (a.date === t0 || a.date === t1) && !["cancelled", "completed"].includes(a.status)).toArray();
    return all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
  }, []);
  const low = useLiveQuery2(async () => (await lowStockList()).low.slice(0, 5), []);
  const expiring = useLiveQuery2(async () => {
    const b = await expiryBuckets();
    return [...b.d30, ...b.d60].slice(0, 5);
  }, []);
  const pending = useLiveQuery2(async () => db_default.bills.filter((b) => b.status === "completed" && b.payment_status !== "PAID").limit(5).toArray(), []);
  const money2 = (v) => fmtMoney(v, settings.currency);
  return /* @__PURE__ */ React7.createElement("div", { className: "page" }, /* @__PURE__ */ React7.createElement(
    PageHeader,
    {
      title: `${t("dashboard")} \u2014 ${(/* @__PURE__ */ new Date()).toLocaleDateString("en-GB", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}`,
      sub: `Good ${(/* @__PURE__ */ new Date()).getHours() < 12 ? "morning" : (/* @__PURE__ */ new Date()).getHours() < 17 ? "afternoon" : "evening"}, ${user3?.name?.split(" ")[0] || ""} \xB7 ${settings.clinic_name}`
    }
  ), /* @__PURE__ */ React7.createElement("div", { className: "quick-actions" }, can("patients") && /* @__PURE__ */ React7.createElement(Btn, { variant: "accent", icon: UserPlus, size: "sm", onClick: () => navigate("/patients?new=1") }, "+ New Patient"), can("consultations") && /* @__PURE__ */ React7.createElement(Btn, { variant: "primary", icon: Stethoscope2, size: "sm", onClick: () => navigate("/consultations?new=1") }, "+ New Consultation"), can("billing") && /* @__PURE__ */ React7.createElement(Btn, { variant: "outline", icon: ReceiptText2, size: "sm", onClick: () => navigate("/billing?new=1") }, "+ Create Bill"), can("medicines") && /* @__PURE__ */ React7.createElement(Btn, { variant: "outline", icon: Pill2, size: "sm", onClick: () => navigate("/medicines?new=1") }, "+ Add Medicine"), can("inventory") && /* @__PURE__ */ React7.createElement(Btn, { variant: "outline", icon: PackagePlus, size: "sm", onClick: () => navigate("/inventory") }, "+ Add Stock")), /* @__PURE__ */ React7.createElement("div", { className: "stat-grid" }, /* @__PURE__ */ React7.createElement(Stat, { label: "Today's Patients", value: stats?.today.patients ?? "\u2014", icon: Users2, tone: "navy", onClick: () => navigate("/patients") }), /* @__PURE__ */ React7.createElement(Stat, { label: "Today's Consultations", value: stats?.today.consultations ?? "\u2014", icon: Stethoscope2, tone: "teal", onClick: () => navigate("/consultations") }), /* @__PURE__ */ React7.createElement(Stat, { label: "Today's Bills", value: stats?.today.bills ?? "\u2014", icon: ReceiptText2, tone: "teal", onClick: () => navigate("/billing") }), /* @__PURE__ */ React7.createElement(Stat, { label: "Today's Revenue", value: stats ? money2(stats.today.revenue) : "\u2014", icon: Wallet2, tone: "green", onClick: () => navigate("/reports") }), /* @__PURE__ */ React7.createElement(Stat, { label: "Today's Expenses", value: stats ? money2(stats.today.expenses) : "\u2014", icon: Wallet2, tone: "red", onClick: () => can("expenses") ? navigate("/expenses") : void 0 }), /* @__PURE__ */ React7.createElement(Stat, { label: "Estimated Profit (MTD)", value: stats ? money2(stats.month.profit) : "\u2014", icon: TrendingUp, tone: "green", sub: `Revenue ${money2(stats?.month.revenue ?? 0)} \u2212 Expenses ${money2(stats?.month.expenses ?? 0)}` }), /* @__PURE__ */ React7.createElement(Stat, { label: "Total Medicines", value: stats?.medicines.total ?? "\u2014", icon: Pill2, tone: "navy", onClick: () => can("medicines") && navigate("/medicines") }), /* @__PURE__ */ React7.createElement(Stat, { label: "Low Stock Medicines", value: stats?.medicines.low ?? "\u2014", icon: AlertTriangle2, tone: "amber", sub: `${stats?.medicines.out ?? 0} out of stock`, onClick: () => can("inventory") && navigate("/inventory") }), /* @__PURE__ */ React7.createElement(Stat, { label: "Expiring Medicines", value: stats ? stats.expiring.d30 : "\u2014", icon: Hourglass, tone: "amber", sub: `${stats?.expiring.expired ?? 0} expired \xB7 30/60/90d: ${stats?.expiring.d60 ?? 0}/${stats?.expiring.d90 ?? 0}`, onClick: () => can("inventory") && navigate("/inventory") }), /* @__PURE__ */ React7.createElement(Stat, { label: "Pending Payments", value: stats ? money2(stats.pending_payments.amount) : "\u2014", icon: CreditCard2, tone: "red", sub: `${stats?.pending_payments.count ?? 0} bill(s) outstanding`, onClick: () => can("payments") && navigate("/payments") })), /* @__PURE__ */ React7.createElement("div", { className: "chart-grid" }, /* @__PURE__ */ React7.createElement(Card, { title: "Daily Revenue \u2014 last 14 days", sub: "Completed bills only" }, rev14 ? /* @__PURE__ */ React7.createElement(LineChart, { data: rev14.map((r) => ({ label: r.label, value: r.revenue })), money: true, color: "var(--teal-600)" }) : /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" })), /* @__PURE__ */ React7.createElement(Card, { title: "Revenue vs Expenses \u2014 last 7 days" }, rev7 ? /* @__PURE__ */ React7.createElement(
    BarChart,
    {
      labels: rev7.map((r) => r.label),
      series: [
        { name: "Revenue", color: "var(--teal-600)", data: rev7.map((r) => r.revenue) },
        { name: "Expenses", color: "var(--red)", data: rev7.map((r) => r.expenses) }
      ],
      money: true
    }
  ) : /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" })), /* @__PURE__ */ React7.createElement(Card, { title: "Patient Visits \u2014 last 7 days" }, visits7 ? /* @__PURE__ */ React7.createElement(BarChart, { labels: visits7.map((v) => v.label), series: [{ name: "Visits", color: "var(--navy-700)", data: visits7.map((v) => v.value) }] }) : /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" })), /* @__PURE__ */ React7.createElement(Card, { title: "Top Selling Medicines \u2014 last 30 days", sub: "By quantity dispensed" }, topMeds && topMeds.length ? /* @__PURE__ */ React7.createElement(HBarList, { items: topMeds.map((m) => ({ label: m.name, value: m.qty })) }) : /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "No sales in range" }))), /* @__PURE__ */ React7.createElement("div", { className: "dash-grid" }, /* @__PURE__ */ React7.createElement(SectionCard, { title: "Recent Patients", icon: Users2, to: can("patients") ? "/patients" : void 0 }, !recentPatients ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : recentPatients.length === 0 ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "No patients yet", action: /* @__PURE__ */ React7.createElement(Btn, { size: "sm", variant: "accent", onClick: () => navigate("/patients?new=1") }, "Register first patient") }) : /* @__PURE__ */ React7.createElement(React7.Fragment, null, recentPatients.map((p) => /* @__PURE__ */ React7.createElement(Row, { key: p.id, onClick: () => navigate(`/patients/${p.id}`) }, /* @__PURE__ */ React7.createElement("span", { className: "dr-name" }, p.name), /* @__PURE__ */ React7.createElement("span", { className: "dr-sub" }, /* @__PURE__ */ React7.createElement(UhidChip, { uhid: p.uhid, size: "sm" })), /* @__PURE__ */ React7.createElement("span", { className: "dr-right" }, fmtDate(p.reg_date)))))), /* @__PURE__ */ React7.createElement(SectionCard, { title: "Recent Bills", to: can("billing") ? "/billing" : void 0 }, !recentBills ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : recentBills.length === 0 ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "No bills yet" }) : /* @__PURE__ */ React7.createElement(React7.Fragment, null, recentBills.map((b) => /* @__PURE__ */ React7.createElement(Row, { key: b.id, onClick: () => navigate(`/billing?bill=${b.id}`) }, /* @__PURE__ */ React7.createElement("span", { className: "dr-name" }, b.bill_no), /* @__PURE__ */ React7.createElement("span", { className: "dr-sub" }, b.patient_name, " \xB7 ", fmtTime(b.time)), /* @__PURE__ */ React7.createElement("span", { className: "dr-right" }, money2(b.total), " ", /* @__PURE__ */ React7.createElement(Badge, { tone: b.status === "CANCELLED" ? "gray" : b.payment_status === "PAID" ? "green" : b.payment_status === "PARTIAL" ? "amber" : "red" }, b.status === "CANCELLED" ? "Cancelled" : b.payment_status)))))), /* @__PURE__ */ React7.createElement(SectionCard, { title: "Upcoming Appointments", to: can("appointments") ? "/appointments" : void 0 }, !upAppts ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : upAppts.length === 0 ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Nothing scheduled", action: can("appointments") ? /* @__PURE__ */ React7.createElement(Btn, { size: "sm", variant: "outline", onClick: () => navigate("/appointments") }, "Schedule") : null }) : /* @__PURE__ */ React7.createElement(React7.Fragment, null, upAppts.map((a) => /* @__PURE__ */ React7.createElement(Row, { key: a.id, onClick: () => navigate("/appointments") }, /* @__PURE__ */ React7.createElement("span", { className: "dr-name" }, a.patient_name || "\u2014"), /* @__PURE__ */ React7.createElement("span", { className: "dr-sub" }, /* @__PURE__ */ React7.createElement(Badge, { tone: a.date === todayStr() ? "teal" : "blue" }, a.date === todayStr() ? "Today" : "Tomorrow"), " ", fmtTime(a.time + ":00")), /* @__PURE__ */ React7.createElement("span", { className: "dr-right" }, a.reason || ""))))), /* @__PURE__ */ React7.createElement(SectionCard, { title: "Low Stock Medicines", to: can("inventory") ? "/inventory" : void 0 }, !low ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : low.length === 0 ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "All stocks healthy" }) : /* @__PURE__ */ React7.createElement(React7.Fragment, null, low.map((r) => /* @__PURE__ */ React7.createElement(Row, { key: r.medicine.id, onClick: () => navigate("/inventory") }, /* @__PURE__ */ React7.createElement("span", { className: "dr-name" }, r.medicine.name), /* @__PURE__ */ React7.createElement("span", { className: "dr-sub" }, /* @__PURE__ */ React7.createElement(Badge, { tone: "amber" }, r.available, " left"), " min ", r.min), /* @__PURE__ */ React7.createElement("span", { className: "dr-right" }))))), /* @__PURE__ */ React7.createElement(SectionCard, { title: "Expiring Medicines", to: can("inventory") ? "/inventory" : void 0 }, !expiring ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : expiring.length === 0 ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Nothing expiring soon" }) : /* @__PURE__ */ React7.createElement(React7.Fragment, null, expiring.map((b) => /* @__PURE__ */ React7.createElement(Row, { key: b.batch.id, onClick: () => navigate("/inventory") }, /* @__PURE__ */ React7.createElement("span", { className: "dr-name" }, b.med_name), /* @__PURE__ */ React7.createElement("span", { className: "dr-sub" }, "Batch ", b.batch.batch_no, " \xB7 ", /* @__PURE__ */ React7.createElement(Badge, { tone: b.days <= 30 ? "red" : "amber" }, b.days, "d")), /* @__PURE__ */ React7.createElement("span", { className: "dr-right" }, b.on_hand, " pcs"))))), /* @__PURE__ */ React7.createElement(SectionCard, { title: "Pending Payments", to: can("payments") ? "/payments" : void 0 }, !pending ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : pending.length === 0 ? /* @__PURE__ */ React7.createElement(EmptyState, { compact: true, title: "All bills settled" }) : /* @__PURE__ */ React7.createElement(React7.Fragment, null, pending.map((b) => /* @__PURE__ */ React7.createElement(Row, { key: b.id, onClick: () => navigate("/payments") }, /* @__PURE__ */ React7.createElement("span", { className: "dr-name" }, b.bill_no), /* @__PURE__ */ React7.createElement("span", { className: "dr-sub" }, b.patient_name, " \xB7 ", fmtDate(b.date)), /* @__PURE__ */ React7.createElement("span", { className: "dr-right" }, /* @__PURE__ */ React7.createElement(Badge, { tone: "red" }, money2(b.total - (b.paid || 0))))))))));
}
var Row;
var init_Dashboard = __esm({
  "src/pages/Dashboard.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_charts();
    init_reports();
    init_inventory();
    init_utils();
    Row = ({ children, onClick }) => /* @__PURE__ */ React7.createElement("button", { className: "dash-row", onClick, type: "button" }, children);
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
  if (!name || name.length < 3) throw new Error("Full name is required");
  if (!data.gender) throw new Error("Gender is required");
  if (mobile.length !== 10) throw new Error("Enter a valid 10-digit mobile number");
  if (!data.dob) throw new Error("Date of birth is required");
  if (data.dob > dkey(/* @__PURE__ */ new Date())) throw new Error("Date of birth cannot be in the future");
  return db_default.transaction("rw", [db_default.patients, db_default.counters, db_default.activity_logs], async () => {
    const uhid = await makeUHID(settings);
    if (await db_default.patients.where("uhid").equals(uhid).count()) throw new Error("UHID collision detected \u2014 please retry");
    const p = {
      id: uid(),
      uhid,
      name,
      dob: data.dob || "",
      approx_age: null,
      gender: data.gender || "",
      mobile,
      alt_mobile: digits(data.alt_mobile),
      email: data.email || "",
      address: data.address || "",
      city: data.city || "",
      state: data.state || "Gujarat",
      pin: String(data.pin || ""),
      ec_name: data.ec_name || "",
      ec_number: digits(data.ec_number),
      ec_relation: data.ec_relation || "",
      blood_group: data.blood_group || "",
      allergies: data.allergies || "",
      conditions: data.conditions || "",
      current_meds: data.current_meds || "",
      notes: data.notes || "",
      active: 1,
      reg_date: dkey(/* @__PURE__ */ new Date()),
      created_at: nowISO(),
      created_by: userId || null
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
  return db_default.transaction("rw", [db_default.patients, db_default.consultations, db_default.bills, db_default.prescriptions, db_default.appointments, db_default.patient_vitals, db_default.activity_logs], async () => {
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
  return ageFromDob(p.dob) ?? p.approx_age ?? null;
}
var digits, VITAL_FIELDS;
var init_patients = __esm({
  "src/services/patients.js"() {
    init_db();
    init_utils();
    init_core();
    digits = (s) => String(s || "").replace(/\D/g, "");
    VITAL_FIELDS = ["temp", "sbp", "dbp", "pulse", "spo2", "rr", "weight", "height", "sugar"];
  }
});

// src/utils/csvParser.js
function parseCSV(text) {
  if (!text || typeof text !== "string") {
    return { headers: [], rows: [], rawRows: [], errors: ["File is empty"] };
  }
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 65279) {
    cleanText = cleanText.slice(1);
  }
  const rawRows = [];
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;
  while (i < len) {
    const char = cleanText[i];
    const nextChar = i + 1 < len ? cleanText[i + 1] : "";
    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (char === ",") {
        currentRow.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      }
      if (char === "\r") {
        if (nextChar === "\n") {
          i++;
        }
        currentRow.push(currentField.trim());
        rawRows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      }
      if (char === "\n") {
        currentRow.push(currentField.trim());
        rawRows.push(currentRow);
        currentRow = [];
        currentField = "";
        i++;
        continue;
      }
      currentField += char;
      i++;
    }
  }
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    rawRows.push(currentRow);
  }
  const nonEmptyRows = rawRows.filter((row) => row.some((cell) => cell.trim() !== ""));
  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [], rawRows: [], errors: ["No data rows found in CSV file"] };
  }
  const rawHeaders = nonEmptyRows[0];
  const headers = rawHeaders.map(
    (h2) => h2.toLowerCase().trim().replace(/[\s\-\/]+/g, "_").replace(/[^a-z0-9_]/g, "")
  );
  const rows = [];
  for (let r = 1; r < nonEmptyRows.length; r++) {
    const rawRow = nonEmptyRows[r];
    const rowObj = { __rowNum: r + 1 };
    headers.forEach((header, colIdx) => {
      if (header) {
        rowObj[header] = rawRow[colIdx] !== void 0 ? rawRow[colIdx].trim() : "";
      }
    });
    rows.push(rowObj);
  }
  return {
    headers,
    rawHeaders,
    rows,
    rawRows: nonEmptyRows,
    errors: []
  };
}
var init_csvParser = __esm({
  "src/utils/csvParser.js"() {
  }
});

// src/utils/csvTemplates.js
function downloadTemplate(type) {
  const template = CSV_TEMPLATES[type];
  if (!template) {
    throw new Error(`Unknown template type: ${type}`);
  }
  const csvContent = toCSV(template.headers, template.sampleRows);
  download(template.filename, csvContent, "text/csv");
}
var CSV_TEMPLATES;
var init_csvTemplates = __esm({
  "src/utils/csvTemplates.js"() {
    init_utils();
    CSV_TEMPLATES = {
      patients: {
        title: "Patients",
        filename: "heeva-patients-template.csv",
        description: "Bulk register patients. Mandatory columns: name, dob (YYYY-MM-DD), gender (Male/Female/Other), mobile (10 digits). Permanent UHID is assigned automatically.",
        headers: [
          "name",
          "dob",
          "gender",
          "mobile",
          "alt_mobile",
          "email",
          "address",
          "city",
          "state",
          "pin",
          "blood_group",
          "allergies",
          "conditions",
          "current_meds",
          "notes",
          "ec_name",
          "ec_number",
          "ec_relation"
        ],
        sampleRows: [
          [
            "Ramesh Sharma",
            "1988-05-14",
            "Male",
            "9825012345",
            "9825098765",
            "ramesh@example.com",
            "Flat 402, Shivalik Residency, Pal Gam",
            "Surat",
            "Gujarat",
            "395009",
            "B+",
            "Penicillin",
            "Hypertension",
            "Amlodipine 5mg",
            "Regular follow up",
            "Sunita Sharma",
            "9825011122",
            "Spouse"
          ],
          [
            "Priya Patel",
            "1995-11-20",
            "Female",
            "9724012345",
            "",
            "priya.patel@example.com",
            "B-12, Green City, Adajan",
            "Surat",
            "Gujarat",
            "395009",
            "O+",
            "None",
            "None",
            "",
            "New patient",
            "Ketan Patel",
            "9724099887",
            "Brother"
          ]
        ],
        columns: [
          { key: "name", label: "Full Name", required: true },
          { key: "dob", label: "Date of Birth (YYYY-MM-DD)", required: true },
          { key: "gender", label: "Gender (Male/Female/Other)", required: true },
          { key: "mobile", label: "Mobile (10 digits)", required: true },
          { key: "alt_mobile", label: "Alt Mobile", required: false },
          { key: "email", label: "Email Address", required: false },
          { key: "address", label: "Address", required: false },
          { key: "city", label: "City", required: false },
          { key: "state", label: "State", required: false },
          { key: "pin", label: "Pincode", required: false },
          { key: "blood_group", label: "Blood Group", required: false },
          { key: "allergies", label: "Allergies", required: false },
          { key: "conditions", label: "Known Conditions", required: false },
          { key: "current_meds", label: "Current Medications", required: false },
          { key: "notes", label: "Notes", required: false },
          { key: "ec_name", label: "Emergency Contact Name", required: false },
          { key: "ec_number", label: "Emergency Contact Number", required: false },
          { key: "ec_relation", label: "Emergency Contact Relation", required: false }
        ]
      },
      medicines: {
        title: "Medicines",
        filename: "heeva-medicines-template.csv",
        description: "Bulk catalog pharmaceutical products. Mandatory columns: name, selling_price. Medicine codes (MD-XXXX) are assigned automatically if omitted.",
        headers: [
          "name",
          "generic",
          "category",
          "type",
          "strength",
          "unit",
          "purchase_price",
          "selling_price",
          "min_stock",
          "barcode",
          "location",
          "description"
        ],
        sampleRows: [
          [
            "Paracetamol 650",
            "Paracetamol",
            "Analgesic",
            "Tablet",
            "650 mg",
            "strip",
            "8.50",
            "15.00",
            "20",
            "8901234567890",
            "Shelf A-1",
            "Anti-pyretic and pain reliever"
          ],
          [
            "Amoxicillin 500",
            "Amoxicillin",
            "Antibiotic",
            "Capsule",
            "500 mg",
            "strip",
            "45.00",
            "72.00",
            "10",
            "8901234567891",
            "Shelf B-2",
            "Broad spectrum antibiotic"
          ]
        ],
        columns: [
          { key: "name", label: "Medicine Name (Brand)", required: true },
          { key: "generic", label: "Generic Name", required: false },
          { key: "category", label: "Category", required: false },
          { key: "type", label: "Type (Tablet/Capsule/Syrup/etc)", required: false },
          { key: "strength", label: "Strength", required: false },
          { key: "unit", label: "Unit (strip/bottle/vial)", required: false },
          { key: "purchase_price", label: "Purchase Price (\u20B9)", required: false },
          { key: "selling_price", label: "Selling Price (\u20B9)", required: true },
          { key: "min_stock", label: "Minimum Stock Level", required: false },
          { key: "barcode", label: "Barcode", required: false },
          { key: "location", label: "Storage Location", required: false },
          { key: "description", label: "Description", required: false }
        ]
      },
      medicine_categories: {
        title: "Medicine Categories",
        filename: "heeva-categories-template.csv",
        description: "Bulk create pharmacological / therapeutic categories. Mandatory: name (must be unique).",
        headers: ["name"],
        sampleRows: [
          ["Pediatric"],
          ["Orthopedic"],
          ["Ophthalmic"]
        ],
        columns: [
          { key: "name", label: "Category Name", required: true }
        ]
      },
      doctors: {
        title: "Doctors",
        filename: "heeva-doctors-template.csv",
        description: "Bulk add consulting physicians and specialists. Mandatory: name.",
        headers: ["name", "qualification", "specialization", "phone", "email"],
        sampleRows: [
          ["Dr. Rajesh Verma", "MBBS, MD (Medicine)", "Consulting Physician", "9898012345", "dr.verma@example.com"],
          ["Dr. Anjali Mehta", "MBBS, DGO", "Gynecologist & Obstetrician", "9898098765", "dr.mehta@example.com"]
        ],
        columns: [
          { key: "name", label: "Doctor Full Name", required: true },
          { key: "qualification", label: "Qualification", required: false },
          { key: "specialization", label: "Specialization", required: false },
          { key: "phone", label: "Phone / Mobile", required: false },
          { key: "email", label: "Email Address", required: false }
        ]
      },
      inventory_batches: {
        title: "Inventory Batches",
        filename: "heeva-inventory-batches-template.csv",
        description: "Bulk intake stock batches. Mandatory: medicine_name, batch_no, expiry (YYYY-MM-DD), quantity. Generates audit stock ledger entries.",
        headers: ["medicine_name", "batch_no", "mfg_date", "expiry", "quantity", "purchase_price"],
        sampleRows: [
          ["Paracetamol 650", "B-2026-01", "2026-01-01", "2028-12-31", "100", "8.50"],
          ["Amoxicillin 500", "B-2026-02", "2026-02-15", "2027-08-31", "50", "45.00"]
        ],
        columns: [
          { key: "medicine_name", label: "Medicine Name (Existing)", required: true },
          { key: "batch_no", label: "Batch Number", required: true },
          { key: "mfg_date", label: "Mfg Date (YYYY-MM-DD)", required: false },
          { key: "expiry", label: "Expiry Date (YYYY-MM-DD)", required: true },
          { key: "quantity", label: "Received Quantity", required: true },
          { key: "purchase_price", label: "Purchase Price (\u20B9)", required: false }
        ]
      }
    };
  }
});

// src/utils/csvValidation.js
function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00Z");
  return !isNaN(d.getTime()) && dateStr === d.toISOString().slice(0, 10);
}
function cleanDigits(val) {
  let s = String(val || "").replace(/[\s()-]/g, "");
  if (s.startsWith("+91")) s = s.slice(3);
  else if (s.startsWith("91") && s.length === 12) s = s.slice(2);
  else if (s.startsWith("0") && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, "");
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function validateCSVRows(type, rows, context = {}) {
  const validRows = [];
  const invalidRows = [];
  const today = dkey(/* @__PURE__ */ new Date());
  switch (type) {
    case "patients": {
      const seenMobileName = /* @__PURE__ */ new Set();
      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors2 = [];
        const name = String(row.name || "").trim();
        if (!name) {
          errors2.push("Full name is required");
        } else if (name.length < 3) {
          errors2.push("Full name must be at least 3 characters");
        }
        const dob = String(row.dob || "").trim();
        if (!dob) {
          errors2.push("Date of birth is required");
        } else if (!isValidDate(dob)) {
          errors2.push("Date of birth must be valid YYYY-MM-DD format");
        } else if (dob > today) {
          errors2.push("Date of birth cannot be in the future");
        }
        const rawGender = String(row.gender || "").trim().toLowerCase();
        let gender = "";
        if (!rawGender) {
          errors2.push("Gender is required");
        } else if (!GENDERS.has(rawGender)) {
          errors2.push("Gender must be Male, Female, or Other");
        } else {
          gender = rawGender.charAt(0).toUpperCase() + rawGender.slice(1);
        }
        const rawMobile = String(row.mobile || "").trim();
        const mobile = cleanDigits(rawMobile);
        if (!rawMobile) {
          errors2.push("Mobile number is required");
        } else if (!validMobile(mobile) || mobile.length !== 10) {
          errors2.push("Mobile must be a valid 10-digit number");
        }
        let altMobile = "";
        if (row.alt_mobile) {
          altMobile = cleanDigits(row.alt_mobile);
          if (!validMobile(altMobile) || altMobile.length !== 10) {
            errors2.push("Alt mobile must be a valid 10-digit number");
          }
        }
        let email = String(row.email || "").trim();
        if (email && !isValidEmail(email)) {
          errors2.push("Invalid email address format");
        }
        let bloodGroup = String(row.blood_group || "").trim().toUpperCase();
        if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) {
          errors2.push("Blood group must be one of A+, A-, B+, B-, AB+, AB-, O+, O-");
        }
        let ecNumber = "";
        if (row.ec_number) {
          ecNumber = cleanDigits(row.ec_number);
          if (ecNumber.length !== 10) {
            errors2.push("Emergency contact number must be 10 digits");
          }
        }
        const dedupKey = `${name.toLowerCase()}||${mobile}`;
        if (seenMobileName.has(dedupKey)) {
          errors2.push("Duplicate patient entry in this CSV file (same name & mobile)");
        } else if (name && mobile) {
          seenMobileName.add(dedupKey);
        }
        if (errors2.length > 0) {
          invalidRows.push({ rowNum, row, errors: errors2 });
        } else {
          validRows.push({
            __rowNum: rowNum,
            name,
            dob,
            gender,
            mobile,
            alt_mobile: altMobile,
            email,
            address: String(row.address || "").trim(),
            city: String(row.city || "").trim(),
            state: String(row.state || "Gujarat").trim(),
            pin: String(row.pin || "").trim(),
            blood_group: bloodGroup,
            allergies: String(row.allergies || "").trim(),
            conditions: String(row.conditions || "").trim(),
            current_meds: String(row.current_meds || "").trim(),
            notes: String(row.notes || "").trim(),
            ec_name: String(row.ec_name || "").trim(),
            ec_number: ecNumber,
            ec_relation: String(row.ec_relation || "").trim()
          });
        }
      }
      break;
    }
    case "medicines": {
      const existingNames = new Set(
        (context.existingMedicines || []).map((m) => String(m.name || "").trim().toLowerCase())
      );
      const seenNames = /* @__PURE__ */ new Set();
      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors2 = [];
        const name = String(row.name || "").trim();
        if (!name) {
          errors2.push("Medicine name is required");
        } else if (name.length < 2) {
          errors2.push("Medicine name must be at least 2 characters");
        }
        const nameKey = name.toLowerCase();
        if (seenNames.has(nameKey)) {
          errors2.push(`Duplicate medicine name "${name}" in this CSV file`);
        } else if (existingNames.has(nameKey)) {
          errors2.push(`Medicine "${name}" already exists in clinic catalog`);
        } else if (name) {
          seenNames.add(nameKey);
        }
        const sellingPriceStr = String(row.selling_price || "").trim();
        const sellingPrice = Number(sellingPriceStr);
        if (!sellingPriceStr) {
          errors2.push("Selling price is required");
        } else if (isNaN(sellingPrice) || sellingPrice < 0) {
          errors2.push("Selling price must be a valid positive number");
        }
        let purchasePrice = 0;
        if (row.purchase_price !== void 0 && String(row.purchase_price).trim() !== "") {
          purchasePrice = Number(row.purchase_price);
          if (isNaN(purchasePrice) || purchasePrice < 0) {
            errors2.push("Purchase price must be a valid positive number");
          }
        }
        let minStock = 0;
        if (row.min_stock !== void 0 && String(row.min_stock).trim() !== "") {
          minStock = parseInt(row.min_stock, 10);
          if (isNaN(minStock) || minStock < 0) {
            errors2.push("Min stock must be a non-negative integer");
          }
        }
        if (errors2.length > 0) {
          invalidRows.push({ rowNum, row, errors: errors2 });
        } else {
          validRows.push({
            __rowNum: rowNum,
            name,
            generic: String(row.generic || "").trim(),
            category: String(row.category || "Other").trim(),
            type: String(row.type || "Tablet").trim(),
            strength: String(row.strength || "").trim(),
            unit: String(row.unit || "strip").trim(),
            purchase_price: Math.round(purchasePrice * 100) / 100,
            selling_price: Math.round(sellingPrice * 100) / 100,
            min_stock: minStock,
            barcode: String(row.barcode || "").trim(),
            location: String(row.location || "").trim(),
            description: String(row.description || "").trim()
          });
        }
      }
      break;
    }
    case "medicine_categories": {
      const existingNames = new Set(
        (context.existingCategories || []).map((c) => String(c.name || "").trim().toLowerCase())
      );
      const seenNames = /* @__PURE__ */ new Set();
      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors2 = [];
        const name = String(row.name || "").trim();
        if (!name) {
          errors2.push("Category name is required");
        } else if (name.length < 2) {
          errors2.push("Category name must be at least 2 characters");
        }
        const nameKey = name.toLowerCase();
        if (seenNames.has(nameKey)) {
          errors2.push(`Duplicate category "${name}" in this CSV file`);
        } else if (existingNames.has(nameKey)) {
          errors2.push(`Category "${name}" already exists`);
        } else if (name) {
          seenNames.add(nameKey);
        }
        if (errors2.length > 0) {
          invalidRows.push({ rowNum, row, errors: errors2 });
        } else {
          validRows.push({
            __rowNum: rowNum,
            name
          });
        }
      }
      break;
    }
    case "doctors": {
      const existingNames = new Set(
        (context.existingDoctors || []).map((d) => String(d.name || "").trim().toLowerCase())
      );
      const seenNames = /* @__PURE__ */ new Set();
      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors2 = [];
        const name = String(row.name || "").trim();
        if (!name) {
          errors2.push("Doctor name is required");
        } else if (name.length < 2) {
          errors2.push("Doctor name must be at least 2 characters");
        }
        const nameKey = name.toLowerCase();
        if (seenNames.has(nameKey)) {
          errors2.push(`Duplicate doctor name "${name}" in this CSV file`);
        } else if (existingNames.has(nameKey)) {
          errors2.push(`Doctor "${name}" already exists in directory`);
        } else if (name) {
          seenNames.add(nameKey);
        }
        let phone = "";
        if (row.phone) {
          phone = cleanDigits(row.phone);
          if (phone && phone.length !== 10) {
            errors2.push("Phone must be a valid 10-digit number");
          }
        }
        let email = String(row.email || "").trim();
        if (email && !isValidEmail(email)) {
          errors2.push("Invalid email address format");
        }
        if (errors2.length > 0) {
          invalidRows.push({ rowNum, row, errors: errors2 });
        } else {
          validRows.push({
            __rowNum: rowNum,
            name,
            qualification: String(row.qualification || "").trim(),
            specialization: String(row.specialization || "").trim(),
            phone,
            email
          });
        }
      }
      break;
    }
    case "inventory_batches": {
      const medicines = context.existingMedicines || [];
      const medMap = /* @__PURE__ */ new Map();
      medicines.forEach((m) => {
        medMap.set(String(m.name || "").trim().toLowerCase(), m);
      });
      const seenBatchKey = /* @__PURE__ */ new Set();
      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors2 = [];
        const medName = String(row.medicine_name || "").trim();
        let matchedMed = null;
        if (!medName) {
          errors2.push("Medicine name is required");
        } else {
          matchedMed = medMap.get(medName.toLowerCase());
          if (!matchedMed) {
            errors2.push(`Medicine "${medName}" not found in catalog. Create the medicine first.`);
          }
        }
        const batchNo = String(row.batch_no || "").trim().toUpperCase();
        if (!batchNo) {
          errors2.push("Batch number is required");
        }
        const expiry = String(row.expiry || "").trim();
        if (!expiry) {
          errors2.push("Expiry date is required");
        } else if (!isValidDate(expiry)) {
          errors2.push("Expiry must be valid YYYY-MM-DD format");
        }
        let mfgDate = String(row.mfg_date || "").trim();
        if (mfgDate) {
          if (!isValidDate(mfgDate)) {
            errors2.push("Mfg date must be valid YYYY-MM-DD format");
          } else if (expiry && mfgDate > expiry) {
            errors2.push("Mfg date cannot be after expiry date");
          }
        } else {
          mfgDate = today;
        }
        const qtyStr = String(row.quantity || "").trim();
        const quantity = parseInt(qtyStr, 10);
        if (!qtyStr) {
          errors2.push("Quantity is required");
        } else if (isNaN(quantity) || quantity <= 0) {
          errors2.push("Quantity must be a positive integer");
        }
        let purchasePrice = matchedMed?.purchase_price || 0;
        if (row.purchase_price !== void 0 && String(row.purchase_price).trim() !== "") {
          const p = Number(row.purchase_price);
          if (isNaN(p) || p < 0) {
            errors2.push("Purchase price must be a valid positive number");
          } else {
            purchasePrice = Math.round(p * 100) / 100;
          }
        }
        if (matchedMed && batchNo) {
          const bKey = `${matchedMed.id}||${batchNo}`;
          if (seenBatchKey.has(bKey)) {
            errors2.push(`Duplicate batch "${batchNo}" for medicine "${medName}" in this CSV`);
          } else {
            seenBatchKey.add(bKey);
          }
        }
        if (errors2.length > 0) {
          invalidRows.push({ rowNum, row, errors: errors2 });
        } else {
          validRows.push({
            __rowNum: rowNum,
            medicine_id: matchedMed.id,
            medicine_name: matchedMed.name,
            batch_no: batchNo,
            mfg_date: mfgDate,
            expiry,
            quantity,
            purchase_price: purchasePrice
          });
        }
      }
      break;
    }
    default:
      throw new Error(`Unsupported validation type: ${type}`);
  }
  return {
    total: rows.length,
    validRows,
    invalidRows,
    summary: {
      total: rows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length
    }
  };
}
var BLOOD_GROUPS, GENDERS;
var init_csvValidation = __esm({
  "src/utils/csvValidation.js"() {
    init_utils();
    BLOOD_GROUPS = /* @__PURE__ */ new Set(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]);
    GENDERS = /* @__PURE__ */ new Set(["male", "female", "other"]);
  }
});

// src/components/csv/CsvImportModal.jsx
import React8, { useState as useState5, useRef as useRef2, useEffect as useEffect5 } from "react";
import { Upload, Download as Download2, FileSpreadsheet, AlertTriangle as AlertTriangle3, CheckCircle2 as CheckCircle22, XCircle as XCircle2, RefreshCw } from "lucide-react";
function CsvImportModal({
  open,
  onClose,
  type = "patients",
  context = {},
  onSuccess
}) {
  const { user: user3, pushToast } = useApp();
  const template = CSV_TEMPLATES[type] || CSV_TEMPLATES.patients;
  const fileInputRef = useRef2(null);
  const [dragActive, setDragActive] = useState5(false);
  const [file, setFile] = useState5(null);
  const [parseError, setParseError] = useState5(null);
  const [validationResult, setValidationResult] = useState5(null);
  const [activeTab, setActiveTab] = useState5("all");
  const [busy, setBusy] = useState5(false);
  const [serverError, setServerError] = useState5(null);
  useEffect5(() => {
    if (open) {
      setFile(null);
      setParseError(null);
      setValidationResult(null);
      setActiveTab("all");
      setBusy(false);
      setServerError(null);
      setDragActive(false);
    }
  }, [open, type]);
  const handleFileProcess = async (selectedFile) => {
    if (!selectedFile) return;
    if (!selectedFile.name.toLowerCase().endsWith(".csv") && selectedFile.type !== "text/csv") {
      setParseError("Please upload a valid CSV (.csv) file.");
      return;
    }
    setFile(selectedFile);
    setParseError(null);
    setServerError(null);
    setValidationResult(null);
    try {
      const text = await selectedFile.text();
      const parsed = parseCSV(text);
      if (parsed.errors && parsed.errors.length > 0) {
        setParseError(parsed.errors.join("; "));
        return;
      }
      if (!parsed.rows || parsed.rows.length === 0) {
        setParseError("No data rows found in CSV file.");
        return;
      }
      const res = validateCSVRows(type, parsed.rows, context);
      setValidationResult(res);
      if (res.summary.validCount === 0 && res.summary.invalidCount > 0) {
        setActiveTab("errors");
      } else {
        setActiveTab("all");
      }
    } catch (err) {
      console.error("[CSV Import] parse error:", err);
      setParseError(err.message || "Failed to process CSV file.");
    }
  };
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileProcess(e.dataTransfer.files[0]);
    }
  };
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileProcess(e.target.files[0]);
    }
  };
  const resetFile = () => {
    setFile(null);
    setParseError(null);
    setValidationResult(null);
    setServerError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const handleImport = async () => {
    if (!validationResult || validationResult.summary.validCount === 0) return;
    setBusy(true);
    setServerError(null);
    const mapping = TABLE_MAP[type] || { endpoint: type, dexie: type };
    try {
      const result = await bulkImportRecords(mapping.endpoint, validationResult.validRows, user3?.id);
      db_default.__hydrating = true;
      try {
        if (db_default[mapping.dexie] && Array.isArray(result.records)) {
          await db_default[mapping.dexie].bulkPut(result.records);
        }
        if (result.extraTables) {
          for (const [t, items] of Object.entries(result.extraTables)) {
            if (db_default[t] && Array.isArray(items)) {
              await db_default[t].bulkPut(items);
            }
          }
        }
      } finally {
        db_default.__hydrating = false;
      }
      const importedMsg = `Imported ${result.count} ${template.title.toLowerCase()}${result.skipped ? ` (${result.skipped} row(s) skipped)` : ""}`;
      pushToast("success", importedMsg);
      if (onSuccess) {
        onSuccess(result);
      }
      onClose();
    } catch (err) {
      console.error("[CSV Import] execution error:", err);
      setServerError(err.message || "Failed to complete import.");
    } finally {
      setBusy(false);
    }
  };
  const previewColumns = [
    {
      key: "__rowNum",
      label: "Row",
      render: (r) => /* @__PURE__ */ React8.createElement("span", { style: { fontFamily: "monospace", color: "var(--text-3)" } }, "#", r.__rowNum)
    },
    ...template.columns.map((col) => ({
      key: col.key,
      label: col.label,
      render: (r) => {
        const val = r[col.key];
        return val != null && val !== "" ? String(val) : /* @__PURE__ */ React8.createElement("span", { style: { color: "var(--text-3)" } }, "\u2014");
      }
    })),
    {
      key: "__status",
      label: "Status",
      render: (r) => {
        const errObj = validationResult?.invalidRows.find((x) => x.rowNum === r.__rowNum);
        if (errObj) {
          return /* @__PURE__ */ React8.createElement(Badge, { tone: "red", title: errObj.errors.join("; ") }, /* @__PURE__ */ React8.createElement(XCircle2, { size: 12 }), " ", errObj.errors[0]);
        }
        return /* @__PURE__ */ React8.createElement(Badge, { tone: "green" }, /* @__PURE__ */ React8.createElement(CheckCircle22, { size: 12 }), " Ready");
      }
    }
  ];
  const allRowsCombined = React8.useMemo(() => {
    if (!validationResult) return [];
    const valid = validationResult.validRows || [];
    const invalid = (validationResult.invalidRows || []).map((x) => ({ ...x.row, __rowNum: x.rowNum }));
    return [...valid, ...invalid].sort((a, b) => a.__rowNum - b.__rowNum);
  }, [validationResult]);
  return /* @__PURE__ */ React8.createElement(
    Modal,
    {
      open,
      onClose: busy ? void 0 : onClose,
      title: `Import ${template.title} from CSV`,
      sub: "Upload RFC-4180 compliant CSV files with live preview, row validation, and error reporting.",
      width: "xl",
      footer: /* @__PURE__ */ React8.createElement(React8.Fragment, null, file && /* @__PURE__ */ React8.createElement(Btn, { variant: "ghost", onClick: resetFile, disabled: busy, style: { marginRight: "auto" } }, /* @__PURE__ */ React8.createElement(RefreshCw, { size: 14 }), " Select Different File"), /* @__PURE__ */ React8.createElement(Btn, { variant: "ghost", onClick: onClose, disabled: busy }, "Cancel"), /* @__PURE__ */ React8.createElement(
        Btn,
        {
          variant: "accent",
          onClick: handleImport,
          disabled: !validationResult || validationResult.summary.validCount === 0 || busy
        },
        busy ? "Importing\u2026" : validationResult ? `Import ${validationResult.summary.validCount} Valid Record${validationResult.summary.validCount === 1 ? "" : "s"}` : "Import Records"
      ))
    },
    /* @__PURE__ */ React8.createElement(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "12px",
          background: "var(--surface-2)",
          padding: "12px 16px",
          borderRadius: "10px",
          marginBottom: "16px",
          border: "1px solid var(--border)"
        }
      },
      /* @__PURE__ */ React8.createElement("div", { style: { flex: 1, minWidth: "220px" } }, /* @__PURE__ */ React8.createElement("div", { style: { fontSize: "13px", fontWeight: 600, color: "var(--text)" } }, "Need the correct spreadsheet format?"), /* @__PURE__ */ React8.createElement("div", { style: { fontSize: "12px", color: "var(--text-2)", marginTop: "2px" } }, "Download the official CSV template with example data and field headers.")),
      /* @__PURE__ */ React8.createElement(
        Btn,
        {
          size: "sm",
          variant: "outline",
          icon: Download2,
          onClick: () => downloadTemplate(type)
        },
        "Download ",
        template.title,
        " Template"
      )
    ),
    serverError && /* @__PURE__ */ React8.createElement("div", { className: "form-alert", style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React8.createElement(AlertTriangle3, { size: 16 }), " ", serverError),
    !file && /* @__PURE__ */ React8.createElement("div", null, /* @__PURE__ */ React8.createElement(
      "input",
      {
        ref: fileInputRef,
        type: "file",
        accept: ".csv,text/csv",
        style: { display: "none" },
        onChange: handleFileChange
      }
    ), /* @__PURE__ */ React8.createElement(
      "div",
      {
        className: "import-drop",
        style: {
          borderColor: dragActive ? "var(--teal-500)" : void 0,
          backgroundColor: dragActive ? "var(--teal-50)" : void 0,
          cursor: "pointer",
          padding: "40px 20px",
          textAlign: "center"
        },
        onDragEnter: handleDrag,
        onDragLeave: handleDrag,
        onDragOver: handleDrag,
        onDrop: handleDrop,
        onClick: () => fileInputRef.current?.click()
      },
      /* @__PURE__ */ React8.createElement(Upload, { size: 36, style: { color: "var(--teal-600)", marginBottom: "4px" } }),
      /* @__PURE__ */ React8.createElement("div", { style: { fontSize: "15px", fontWeight: 700, color: "var(--text)" } }, "Click to select or drag and drop your CSV file here"),
      /* @__PURE__ */ React8.createElement("div", { style: { fontSize: "12.5px", color: "var(--text-3)" } }, "Standard UTF-8 or ANSI encoded .csv files are supported.")
    ), /* @__PURE__ */ React8.createElement("div", { style: { marginTop: "16px" } }, /* @__PURE__ */ React8.createElement("div", { style: { fontSize: "12px", fontWeight: 700, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" } }, "Expected CSV Columns:"), /* @__PURE__ */ React8.createElement("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } }, template.columns.map((col) => /* @__PURE__ */ React8.createElement(
      Badge,
      {
        key: col.key,
        tone: col.required ? "teal" : "gray",
        title: col.required ? "Mandatory column" : "Optional column"
      },
      col.key,
      " ",
      col.required ? "*(required)" : ""
    ))))),
    file && parseError && /* @__PURE__ */ React8.createElement("div", { style: { textAlign: "center", padding: "24px 16px" } }, /* @__PURE__ */ React8.createElement("div", { className: "form-alert", style: { display: "inline-flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React8.createElement(AlertTriangle3, { size: 16 }), " ", parseError), /* @__PURE__ */ React8.createElement("div", { style: { marginTop: "12px" } }, /* @__PURE__ */ React8.createElement(Btn, { variant: "outline", size: "sm", onClick: resetFile }, "Choose Another CSV File"))),
    file && validationResult && /* @__PURE__ */ React8.createElement("div", null, /* @__PURE__ */ React8.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "10px",
          padding: "10px 14px",
          background: "var(--surface-2)",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          marginBottom: "14px"
        }
      },
      /* @__PURE__ */ React8.createElement("div", { style: { display: "flex", alignItems: "center", gap: "8px" } }, /* @__PURE__ */ React8.createElement(FileSpreadsheet, { size: 18, style: { color: "var(--teal-600)" } }), /* @__PURE__ */ React8.createElement("div", null, /* @__PURE__ */ React8.createElement("span", { style: { fontWeight: 650, fontSize: "13.5px" } }, file.name), /* @__PURE__ */ React8.createElement("span", { style: { fontSize: "11.5px", color: "var(--text-3)", marginLeft: "8px" } }, "(", Math.round(file.size / 1024), " KB)"))),
      /* @__PURE__ */ React8.createElement("div", { style: { display: "flex", gap: "8px" } }, /* @__PURE__ */ React8.createElement(Badge, { tone: "gray" }, "Total: ", validationResult.summary.total), /* @__PURE__ */ React8.createElement(Badge, { tone: "green" }, "Ready: ", validationResult.summary.validCount), validationResult.summary.invalidCount > 0 && /* @__PURE__ */ React8.createElement(Badge, { tone: "red" }, "Errors: ", validationResult.summary.invalidCount))
    ), validationResult.summary.invalidCount > 0 && validationResult.summary.validCount > 0 && /* @__PURE__ */ React8.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--amber-bg)",
          color: "var(--amber)",
          border: "1px solid #d9770633",
          borderRadius: "8px",
          padding: "9px 12px",
          fontSize: "12.5px",
          fontWeight: 600,
          marginBottom: "14px"
        }
      },
      /* @__PURE__ */ React8.createElement(AlertTriangle3, { size: 16, style: { flexShrink: 0 } }),
      /* @__PURE__ */ React8.createElement("span", null, "Partial import enabled: ", /* @__PURE__ */ React8.createElement("strong", null, validationResult.summary.validCount, " valid record(s)"), " will be imported, while", " ", /* @__PURE__ */ React8.createElement("strong", null, validationResult.summary.invalidCount, " invalid row(s)"), " will be safely skipped.")
    ), validationResult.summary.validCount === 0 && /* @__PURE__ */ React8.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--red-bg)",
          color: "var(--red)",
          borderRadius: "8px",
          padding: "9px 12px",
          fontSize: "12.5px",
          fontWeight: 600,
          marginBottom: "14px"
        }
      },
      /* @__PURE__ */ React8.createElement(XCircle2, { size: 16, style: { flexShrink: 0 } }),
      /* @__PURE__ */ React8.createElement("span", null, "All ", validationResult.summary.invalidCount, " row(s) contain validation errors. Please review the errors tab below, fix your CSV file, and try again.")
    ), /* @__PURE__ */ React8.createElement(
      Tabs,
      {
        active: activeTab,
        onChange: setActiveTab,
        tabs: [
          { key: "all", label: "All Rows", badge: validationResult.summary.total },
          { key: "ready", label: "Ready to Import", badge: validationResult.summary.validCount },
          { key: "errors", label: "Errors to Fix", badge: validationResult.summary.invalidCount }
        ]
      }
    ), activeTab === "all" && /* @__PURE__ */ React8.createElement("div", { style: { maxHeight: "360px", overflowY: "auto" } }, /* @__PURE__ */ React8.createElement(
      DataTable,
      {
        dense: true,
        columns: previewColumns,
        rows: allRowsCombined,
        pageSize: 10,
        rowKey: "__rowNum"
      }
    )), activeTab === "ready" && /* @__PURE__ */ React8.createElement("div", { style: { maxHeight: "360px", overflowY: "auto" } }, /* @__PURE__ */ React8.createElement(
      DataTable,
      {
        dense: true,
        columns: previewColumns.filter((c) => c.key !== "__status"),
        rows: validationResult.validRows,
        pageSize: 10,
        rowKey: "__rowNum",
        empty: /* @__PURE__ */ React8.createElement("div", { style: { textAlign: "center", padding: "24px", color: "var(--text-3)" } }, "No valid rows ready for import.")
      }
    )), activeTab === "errors" && /* @__PURE__ */ React8.createElement("div", { style: { maxHeight: "360px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" } }, validationResult.invalidRows.length === 0 ? /* @__PURE__ */ React8.createElement("div", { style: { textAlign: "center", padding: "30px", color: "var(--green)", fontWeight: 600 } }, /* @__PURE__ */ React8.createElement(CheckCircle22, { size: 24, style: { display: "inline-block", marginBottom: "6px" } }), /* @__PURE__ */ React8.createElement("div", null, "All rows passed validation! Zero errors found.")) : validationResult.invalidRows.map(({ rowNum, errors: errors2, row }) => /* @__PURE__ */ React8.createElement(
      "div",
      {
        key: rowNum,
        style: {
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--red)",
          background: "var(--surface-2)",
          borderRadius: "8px",
          padding: "10px 14px"
        }
      },
      /* @__PURE__ */ React8.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } }, /* @__PURE__ */ React8.createElement("span", { style: { fontWeight: 700, fontSize: "13px", color: "var(--red)" } }, "CSV Line #", rowNum), /* @__PURE__ */ React8.createElement("span", { style: { fontSize: "11.5px", color: "var(--text-3)" } }, row.name ? `"${row.name}"` : row.medicine_name ? `"${row.medicine_name}"` : "")),
      /* @__PURE__ */ React8.createElement("ul", { style: { margin: "6px 0 0", paddingLeft: "18px", fontSize: "12px", color: "var(--text)" } }, errors2.map((err, i) => /* @__PURE__ */ React8.createElement("li", { key: i, style: { color: "var(--red)", marginBottom: "2px" } }, err)))
    ))))
  );
}
var TABLE_MAP;
var init_CsvImportModal = __esm({
  "src/components/csv/CsvImportModal.jsx"() {
    init_ui();
    init_AppContext();
    init_db();
    init_csvParser();
    init_csvTemplates();
    init_csvValidation();
    init_api();
    TABLE_MAP = {
      patients: { endpoint: "patients", dexie: "patients" },
      medicines: { endpoint: "medicines", dexie: "medicines" },
      medicine_categories: { endpoint: "medicine_categories", dexie: "medicine_categories" },
      doctors: { endpoint: "doctors", dexie: "doctors" },
      inventory_batches: { endpoint: "medicine_batches", dexie: "batches" }
    };
  }
});

// src/pages/Patients.jsx
import React9, { useState as useState6, useEffect as useEffect6, useMemo as useMemo5 } from "react";
import { useNavigate as useNavigate3, useSearchParams } from "react-router-dom";
import { useLiveQuery as useLiveQuery3 } from "dexie-react-hooks";
import { UserPlus as UserPlus2, Download as Download3, Upload as Upload2, Search as Search3, CheckCircle2 as CheckCircle23, Phone, Droplets } from "lucide-react";
function emptyForm() {
  return {
    name: "",
    dob: "",
    gender: "",
    mobile: "",
    alt_mobile: "",
    email: "",
    address: "",
    city: "Surat",
    state: "Gujarat",
    pin: "",
    ec_name: "",
    ec_number: "",
    ec_relation: "",
    blood_group: "",
    allergies: "",
    conditions: "",
    current_meds: "",
    notes: ""
  };
}
function RegisterModal({ open, onClose, prefill = {} }) {
  const { t, settings, user: user3, pushToast } = useApp();
  const navigate = useNavigate3();
  const [step, setStep] = useState6(3);
  const [f, setF] = useState6({ ...emptyForm(), ...prefill });
  const [errs, setErrs] = useState6({});
  const [busy, setBusy] = useState6(false);
  useEffect6(() => {
    if (open) {
      setF({ ...emptyForm(), ...prefill });
      setStep(3);
      setErrs({});
    }
  }, [open]);
  const uhidPreview = useLiveQuery3(async () => {
    if (!open) return null;
    const s = await getSettings();
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    const key = s.uhid_include_year ? `UHID|${year}` : "UHID|ALL";
    const row = await db_default.counters.get(key);
    const n = row ? row.value + 1 : Number(s.uhid_start) || 1;
    const pad = 3;
    return `${(s.uhid_prefix || "HC").toUpperCase()}${s.uhid_include_year ? `-${year}` : ""}-${String(n).padStart(pad, "0")}`;
  }, [open]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const validateStep = (s) => {
    const e = {};
    if (s === 1) {
      if (f.name.trim().length < 3) e.name = "Full name is required (min 3 characters)";
      if (!f.gender) e.gender = "Select gender";
      if (!f.mobile.trim()) e.mobile = "Mobile number is required";
      else if (!validMobile(f.mobile)) e.mobile = "Enter a valid 10-digit mobile number";
      if (f.dob && f.dob > dkey(/* @__PURE__ */ new Date())) e.dob = "Date of birth cannot be in the future";
      if (!f.dob) e.dob = "Date of birth is required";
      if (f.alt_mobile && !validMobile(f.alt_mobile)) e.alt_mobile = "Invalid mobile number";
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };
  const save = async () => {
    if (!validateStep(1)) return;
    setBusy(true);
    try {
      const p = await registerPatient(f, user3.id);
      pushToast("success", `Patient registered with UHID ${p.uhid}`);
      onClose();
      navigate(`/patients/${p.id}`);
    } catch (e) {
      pushToast("error", e.message);
    } finally {
      setBusy(false);
    }
  };
  const stepDots = /* @__PURE__ */ React9.createElement("div", { className: "wizard-dots" }, [1, 2, 3].map((s) => /* @__PURE__ */ React9.createElement("span", { key: s, className: `wiz-dot ${step >= s ? "wiz-on" : ""}` })), /* @__PURE__ */ React9.createElement("span", { className: "wiz-step-label" }, "Step ", step, " of 3 \xB7 ", ["Identity", "Contact", "Medical History"][step - 1]));
  return /* @__PURE__ */ React9.createElement(
    Modal,
    {
      open,
      onClose,
      width: "lg",
      title: "Register New Patient",
      sub: /* @__PURE__ */ React9.createElement("span", { className: "uhid-preview" }, "UHID will be assigned: ", /* @__PURE__ */ React9.createElement(UhidChip, { uhid: uhidPreview || "\u2026", size: "sm" }), " \u2014 permanent, unique, never changes"),
      footer: /* @__PURE__ */ React9.createElement(React9.Fragment, null, /* @__PURE__ */ React9.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), step < 3 && /* @__PURE__ */ React9.createElement(Btn, { onClick: next }, step === 1 ? "Continue \u2192" : "Continue \u2192"), step === 3 && /* @__PURE__ */ React9.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Registering\u2026" : "Register patient"))
    },
    step === 3 && /* @__PURE__ */ React9.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React9.createElement(Field, { label: "Full Name", required: true, error: errs.name, className: "fg-2" }, /* @__PURE__ */ React9.createElement(Input, { value: f.name, onChange: set("name"), placeholder: "Enter full name", autoFocus: true })), /* @__PURE__ */ React9.createElement(Field, { label: "Date of Birth", error: errs.dob, hint: f.dob ? `Age: ${ageLabel({ dob: f.dob })}` : "" }, /* @__PURE__ */ React9.createElement(Input, { type: "date", value: f.dob, onChange: set("dob"), max: dkey(/* @__PURE__ */ new Date()) })), /* @__PURE__ */ React9.createElement(Field, { label: "Gender", required: true, error: errs.gender }, /* @__PURE__ */ React9.createElement(Select, { value: f.gender, onChange: set("gender") }, /* @__PURE__ */ React9.createElement("option", { value: "" }, "Select\u2026"), /* @__PURE__ */ React9.createElement("option", null, "Male"), /* @__PURE__ */ React9.createElement("option", null, "Female"), /* @__PURE__ */ React9.createElement("option", null, "Other"))), /* @__PURE__ */ React9.createElement(Field, { label: "Mobile Number", required: true, error: errs.mobile }, /* @__PURE__ */ React9.createElement(Input, { value: f.mobile, onChange: set("mobile"), placeholder: "10-digit mobile", inputMode: "numeric" })), /* @__PURE__ */ React9.createElement(Field, { label: "Alternative Mobile", error: errs.alt_mobile }, /* @__PURE__ */ React9.createElement(Input, { value: f.alt_mobile, onChange: set("alt_mobile"), inputMode: "numeric" })), /* @__PURE__ */ React9.createElement(Field, { label: "Blood Group" }, /* @__PURE__ */ React9.createElement(Select, { value: f.blood_group, onChange: set("blood_group") }, BLOOD_GROUPS2.map((b) => /* @__PURE__ */ React9.createElement("option", { key: b, value: b }, b || "Unknown")))), /* @__PURE__ */ React9.createElement("div", { className: "fg-sep" }, /* @__PURE__ */ React9.createElement("strong", null, "Address Information")), /* @__PURE__ */ React9.createElement(Field, { label: "Address", className: "fg-2" }, /* @__PURE__ */ React9.createElement(Input, { value: f.address, onChange: set("address") })), /* @__PURE__ */ React9.createElement(Field, { label: "City" }, /* @__PURE__ */ React9.createElement(Input, { value: f.city, onChange: set("city") })), /* @__PURE__ */ React9.createElement(Field, { label: "State" }, /* @__PURE__ */ React9.createElement(Input, { value: f.state, onChange: set("state") }))),
    step === 2 && /* @__PURE__ */ React9.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React9.createElement(Field, { label: "Address", className: "fg-2" }, /* @__PURE__ */ React9.createElement(Input, { value: f.address, onChange: set("address") })), /* @__PURE__ */ React9.createElement(Field, { label: "City" }, /* @__PURE__ */ React9.createElement(Input, { value: f.city, onChange: set("city") })), /* @__PURE__ */ React9.createElement(Field, { label: "State" }, /* @__PURE__ */ React9.createElement(Input, { value: f.state, onChange: set("state") })), /* @__PURE__ */ React9.createElement(Field, { label: "PIN Code", error: errs.pin }, /* @__PURE__ */ React9.createElement(Input, { value: f.pin, onChange: set("pin"), inputMode: "numeric" }))),
    false
  );
}
function Patients() {
  const { t, settings } = useApp();
  const navigate = useNavigate3();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState6("");
  const [gender, setGender] = useState6("");
  const [reg, setReg] = useState6(params.get("new") === "1");
  const [importOpen, setImportOpen] = useState6(false);
  const [qMobile, setQMobile] = useState6("");
  const patients = useLiveQuery3(async () => {
    const all = await db_default.patients.toArray();
    const consults = await db_default.consultations.toArray();
    const lastVisit = {};
    for (const c of consults) if (!lastVisit[c.patient_id] || c.time > lastVisit[c.patient_id]) lastVisit[c.patient_id] = c.time;
    let list = all.map((p) => ({ ...p, last_visit: lastVisit[p.id] || null }));
    const s = q.trim().toLowerCase();
    if (s) {
      const digits2 = s.replace(/\D/g, "");
      list = list.filter(
        (p) => (p.name || "").toLowerCase().includes(s) || (p.uhid || "").toLowerCase().includes(s) || digits2 && (p.mobile || "").includes(digits2) || (p.dob || "") === s
      );
    }
    if (gender) list = list.filter((p) => p.gender === gender);
    return list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }, [q, gender]);
  const exportCSV = () => {
    const rows = (patients || []).map((p) => [p.uhid, p.name, p.gender, ageLabel(p), p.mobile, p.dob, p.address, p.city, p.reg_date, p.blood_group]);
    download(`heeva-patients-${dkey()}.csv`, toCSV(["UHID", "Name", "Gender", "Age", "Mobile", "DOB", "Address", "City", "Registered", "Blood Group"], rows), "text/csv");
  };
  if (params.get("new") === "1") {
    params.delete("new");
    setParams(params, { replace: true });
  }
  return /* @__PURE__ */ React9.createElement("div", { className: "page" }, /* @__PURE__ */ React9.createElement(
    PageHeader,
    {
      title: "Patients",
      sub: `${(patients || []).length} patient(s) \xB7 UHID-linked permanent records`,
      actions: /* @__PURE__ */ React9.createElement(React9.Fragment, null, /* @__PURE__ */ React9.createElement(Btn, { variant: "ghost", icon: Upload2, onClick: () => setImportOpen(true) }, "Import CSV"), /* @__PURE__ */ React9.createElement(Btn, { variant: "ghost", icon: Download3, onClick: exportCSV }, "Export CSV"), /* @__PURE__ */ React9.createElement(Btn, { variant: "accent", icon: UserPlus2, onClick: () => setReg(true) }, "+ ", t("new_patient", "New Patient")))
    }
  ), /* @__PURE__ */ React9.createElement(Card, null, /* @__PURE__ */ React9.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React9.createElement("div", { className: "toolbar-search" }, /* @__PURE__ */ React9.createElement(Search3, { size: 15 }), /* @__PURE__ */ React9.createElement("input", { className: "input", placeholder: "Search by name, UHID, mobile, or date of birth\u2026", value: q, onChange: (e) => setQ(e.target.value) })), /* @__PURE__ */ React9.createElement(Select, { value: gender, onChange: (e) => setGender(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React9.createElement("option", { value: "" }, "All genders"), /* @__PURE__ */ React9.createElement("option", null, "Male"), /* @__PURE__ */ React9.createElement("option", null, "Female"), /* @__PURE__ */ React9.createElement("option", null, "Other"))), /* @__PURE__ */ React9.createElement(
    DataTable,
    {
      columns: [
        { key: "uhid", label: "UHID", sortable: true, render: (p) => /* @__PURE__ */ React9.createElement(UhidChip, { uhid: p.uhid, size: "sm" }) },
        {
          key: "name",
          label: "Patient",
          sortable: true,
          render: (p) => /* @__PURE__ */ React9.createElement("span", { className: "cell-person" }, /* @__PURE__ */ React9.createElement(Avatar, { name: p.name, size: 30, tone: p.gender === "Female" ? "teal" : "navy" }), /* @__PURE__ */ React9.createElement("span", null, /* @__PURE__ */ React9.createElement("span", { className: "cell-main" }, p.name, " ", p.needs_completion && /* @__PURE__ */ React9.createElement(Badge, { tone: "red" }, "Complete profile")), /* @__PURE__ */ React9.createElement("span", { className: "cell-sub" }, p.blood_group && /* @__PURE__ */ React9.createElement("span", { title: "Blood group" }, /* @__PURE__ */ React9.createElement(Droplets, { size: 11 }), " ", p.blood_group), " \xB7 ", p.city || "")))
        },
        { key: "age", label: "Age / Gender", sortable: true, sortValue: (p) => ageLabel(p), render: (p) => `${ageLabel(p)} \xB7 ${p.gender || "\u2014"}` },
        { key: "mobile", label: "Mobile", sortable: true, render: (p) => /* @__PURE__ */ React9.createElement("span", { className: "cell-mono" }, p.mobile || "\u2014") },
        { key: "reg_date", label: "Registered", sortable: true, render: (p) => fmtDate(p.reg_date) },
        { key: "last_visit", label: "Last Visit", sortable: true, sortValue: (p) => p.last_visit || "", render: (p) => p.last_visit ? fmtDate(p.last_visit) : /* @__PURE__ */ React9.createElement(Badge, { tone: "gray" }, "First visit") }
      ],
      rows: patients,
      pageSize: 12,
      onRow: (p) => navigate(`/patients/${p.id}`),
      empty: /* @__PURE__ */ React9.createElement(
        EmptyState,
        {
          icon: "\u{1F465}",
          title: q ? "No matching patients" : "No patients registered yet",
          message: q ? "Try a different name, UHID or mobile number." : "Register your first patient to generate a UHID.",
          action: !q ? /* @__PURE__ */ React9.createElement(Btn, { variant: "accent", icon: UserPlus2, onClick: () => setReg(true) }, "Register patient") : null
        }
      ),
      loading: !patients
    }
  )), /* @__PURE__ */ React9.createElement(RegisterModal, { open: reg, onClose: () => setReg(false) }), /* @__PURE__ */ React9.createElement(CsvImportModal, { open: importOpen, onClose: () => setImportOpen(false), type: "patients" }));
}
var BLOOD_GROUPS2;
var init_Patients = __esm({
  "src/pages/Patients.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_patients();
    init_core();
    init_utils();
    init_CsvImportModal();
    BLOOD_GROUPS2 = ["", "A+", "A\u2212", "B+", "B\u2212", "AB+", "AB\u2212", "O+", "O\u2212"];
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
async function createBill({ patient_id, items, discount_mode = "amt", discount_value = 0, payments = [], when = null }, userId) {
  const settings = await getSettings();
  return db_default.transaction("rw", [db_default.bills, db_default.bill_items, db_default.payments, db_default.batches, db_default.inventory_txns, db_default.counters, db_default.activity_logs, db_default.patients, db_default.medicines, db_default.services], async () => {
    const patient2 = await db_default.patients.get(patient_id);
    if (!patient2) throw new Error("Patient not found");
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
          resolved.push({ item_type: "medicine", ref_id: med.id, name: med.name, qty: a.qty, price, batch_id: a.batch_id, batch_no: a.batch_no });
        }
      } else if (it.item_type === "service" || it.item_type === "consultation") {
        const svc = await db_default.services.get(it.ref_id);
        if (!svc || !svc.active) throw new Error(`Service not available: ${it.name || it.ref_id}`);
        resolved.push({
          item_type: it.item_type,
          ref_id: svc.id,
          name: svc.name,
          qty,
          price: it.price != null && it.price !== "" ? Number(it.price) : svc.price
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
    const bill2 = {
      id: uid(),
      bill_no,
      patient_id,
      uhid: patient2.uhid,
      patient_name: patient2.name,
      patient_mobile: patient2.mobile || "",
      patient_age: ageLabel(patient2),
      patient_gender: patient2.gender || "",
      date: dkey(new Date(now)),
      time: now,
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
    await db_default.bills.add(bill2);
    for (const it of resolved) {
      const amount = round2(it.qty * (Number(it.price) || 0));
      await db_default.bill_items.add({
        id: uid(),
        bill_id: bill2.id,
        item_type: it.item_type,
        ref_id: it.ref_id,
        name: it.name,
        qty: it.qty,
        price: Number(it.price) || 0,
        amount,
        batch_id: it.batch_id || null,
        batch_no: it.batch_no || null,
        returned: 0
      });
    }
    for (const it of resolved.filter((i) => i.item_type === "medicine")) {
      await txn("SALE", it.ref_id, it.batch_id, -it.qty, bill2.id, bill_no, userId, now);
    }
    let paid = 0;
    for (const pay of payments) {
      const amt = round2(pay.amount);
      if (!(amt > 0)) continue;
      paid = round2(paid + amt);
      await db_default.payments.add({
        id: uid(),
        bill_id: bill2.id,
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
    bill2.paid = paid;
    bill2.payment_status = total - paid < 5e-3 ? "PAID" : paid > 0 ? "PARTIAL" : "PENDING";
    await db_default.bills.put(bill2);
    await audit(userId, "BILL_CREATE", "bill", bill2.id, `${bill_no} \xB7 ${patient2.name} (${patient2.uhid}) \xB7 total ${bill2.total} \xB7 ${bill2.payment_status}`);
    return {
      bill: await db_default.bills.get(bill2.id),
      items: await db_default.bill_items.where("bill_id").equals(bill2.id).toArray()
    };
  });
}
async function getBill(billId) {
  const bill2 = await db_default.bills.get(billId);
  if (!bill2) return null;
  const [items, payments] = await Promise.all([
    db_default.bill_items.where("bill_id").equals(billId).toArray(),
    db_default.payments.where("bill_id").equals(billId).toArray()
  ]);
  items.sort((a, b) => a.item_type.localeCompare(b.item_type));
  return { bill: bill2, items, payments: payments.sort((a, b) => a.at.localeCompare(b.at)) };
}
async function recordPayment(billId, { amount, method, note }, userId) {
  return db_default.transaction("rw", [db_default.bills, db_default.bill_items, db_default.payments, db_default.activity_logs], async () => {
    const bill2 = await db_default.bills.get(billId);
    if (!bill2) throw new Error("Bill not found");
    if (bill2.status !== "completed") throw new Error("Cannot record payment on a cancelled bill");
    const amt = round2(amount);
    if (!(amt > 0)) throw new Error("Amount must be positive");
    const balance = round2(bill2.total - bill2.paid);
    if (amt > balance + 5e-3) throw new Error(`Amount exceeds outstanding balance of ${balance}`);
    await db_default.payments.add({
      id: uid(),
      bill_id: billId,
      patient_id: bill2.patient_id,
      kind: "payment",
      amount: amt,
      method: PAY_METHODS.includes(method) ? method : "Other",
      note: note || "",
      by: userId || null,
      at: nowISO()
    });
    const updated = { ...bill2, paid: round2(bill2.paid + amt) };
    updated.payment_status = updated.total - updated.paid < 5e-3 ? "PAID" : updated.paid > 0 ? "PARTIAL" : "PENDING";
    await db_default.bills.put(updated);
    await audit(userId, "PAYMENT_RECORD", "bill", billId, `${bill2.bill_no} \xB7 +${amt} via ${method}`);
    return getBill(billId);
  });
}
async function cancelBill(billId, reason, userId) {
  if (!String(reason || "").trim()) throw new Error("Cancellation reason is required");
  return db_default.transaction("rw", [db_default.bills, db_default.bill_items, db_default.batches, db_default.inventory_txns, db_default.activity_logs, db_default.medicines, db_default.payments], async () => {
    const bill2 = await db_default.bills.get(billId);
    if (!bill2) throw new Error("Bill not found");
    if (bill2.status === "CANCELLED") throw new Error("Bill is already cancelled");
    if (bill2.status !== "completed") throw new Error("Bill cannot be cancelled");
    const items = await db_default.bill_items.where("bill_id").equals(billId).toArray();
    await restoreBillStock(items, bill2, userId);
    const updated = {
      ...bill2,
      status: "CANCELLED",
      cancel_reason: String(reason).trim(),
      cancelled_at: nowISO(),
      cancelled_by: userId || null
    };
    await db_default.bills.put(updated);
    await audit(userId, "BILL_CANCEL", "bill", billId, `${bill2.bill_no} \xB7 ${bill2.patient_name} \xB7 reason: ${reason}`);
    return getBill(billId);
  });
}
async function createReturn({ bill_id, items, reason, refund_method = "Cash", refund_amount = 0, note = "" }, userId) {
  return db_default.transaction("rw", [db_default.returns, db_default.bill_items, db_default.batches, db_default.inventory_txns, db_default.payments, db_default.counters, db_default.activity_logs, db_default.bills, db_default.medicines], async () => {
    const full = await getBill(bill_id);
    if (!full) throw new Error("Bill not found");
    const bill2 = full.bill;
    if (bill2.status !== "completed") throw new Error("Only completed bills can be returned against");
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
      await txn("RETURN", bi.ref_id, batch.id, qty, bill2.id, `Return \xB7 ${reason}`, userId);
      await db_default.bill_items.put({ ...bi, returned: round2(already + qty) });
      lines.push({ bill_item_id: bi.id, name: bi.name, qty, batch_no: bi.batch_no, amount: round2(qty * bi.price) });
    }
    const refund = round2(refund_amount);
    if (refund > 0) {
      if (refund > bill2.paid + 5e-3) throw new Error("Refund cannot exceed amount paid");
      await db_default.payments.add({
        id: uid(),
        bill_id,
        patient_id: bill2.patient_id,
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
      bill_no: bill2.bill_no,
      patient_id: bill2.patient_id,
      uhid: bill2.uhid,
      patient_name: bill2.patient_name,
      reason: String(reason).trim(),
      note,
      items: lines,
      refund,
      refund_method: refund > 0 ? refund_method : null,
      at: nowISO(),
      created_by: userId || null
    };
    await db_default.returns.add(ret);
    await audit(userId, "RETURN_CREATE", "return", ret.id, `${return_no} \xB7 bill ${bill2.bill_no} \xB7 refund ${refund}`);
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
        barcode: r.barcode || "",
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

// src/pages/PatientProfile.jsx
import React10, { useState as useState7 } from "react";
import { useParams, useNavigate as useNavigate4 } from "react-router-dom";
import { useLiveQuery as useLiveQuery4 } from "dexie-react-hooks";
import {
  Phone as Phone2,
  MapPin,
  Mail,
  Droplets as Droplets2,
  Stethoscope as Stethoscope3,
  FileText as FileText2,
  ReceiptText as ReceiptText3,
  CreditCard as CreditCard3,
  Activity,
  NotebookPen,
  Pencil,
  Printer,
  Plus as Plus3
} from "lucide-react";
function trend(v, prev) {
  if (v == null || prev == null || v === prev) return null;
  return v > prev ? "\u2191" : "\u2193";
}
function VitalsTable({ rows }) {
  if (!rows.length) return /* @__PURE__ */ React10.createElement(EmptyState, { compact: true, icon: "\u2764\uFE0F", title: "No vital signs recorded yet" });
  const chrono = [...rows].reverse();
  return /* @__PURE__ */ React10.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "recorded_at", label: "Date & Time", sortable: true, sortValue: (v) => v.recorded_at, render: (v) => fmtDateTime(v.recorded_at) },
        ...VITAL_DEFS.map((d, i) => ({
          key: d.key,
          label: d.label,
          align: "right",
          render: (v) => {
            const val = v[d.key];
            if (val == null || val === "") return /* @__PURE__ */ React10.createElement("span", { className: "cell-muted" }, "\u2014");
            const prev = chrono[chrono.indexOf(v) - 1]?.[d.key];
            const tr = trend(val, prev);
            return /* @__PURE__ */ React10.createElement("span", null, val, tr && /* @__PURE__ */ React10.createElement("span", { className: tr === "\u2191" ? "trend-up" : "trend-down" }, " ", tr));
          }
        })),
        { key: "recorded_by", label: "By", render: (v) => v.recorded_by || "\u2014" }
      ],
      rows,
      pageSize: 10
    }
  );
}
function AddVitalsModal({ open, onClose, patient: patient2, user: user3 }) {
  const { pushToast } = useApp();
  const [f, setF] = useState7({});
  const [busy, setBusy] = useState7(false);
  const [err, setErr] = useState7("");
  const save = async () => {
    setErr("");
    if (!Object.values(f).some((v) => v != null && v !== "")) {
      setErr("Enter at least one vital sign");
      return;
    }
    setBusy(true);
    try {
      await addVitals(patient2.id, f, user3.id);
      pushToast("success", "Vital signs saved");
      onClose();
      setF({});
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React10.createElement(
    Modal,
    {
      open,
      onClose,
      title: "Record Vital Signs",
      sub: `${patient2.name} \xB7 ${patient2.uhid}`,
      width: "lg",
      footer: /* @__PURE__ */ React10.createElement(React10.Fragment, null, /* @__PURE__ */ React10.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React10.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Save vitals"))
    },
    err && /* @__PURE__ */ React10.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React10.createElement("div", { className: "form-grid" }, VITAL_DEFS.map((d) => /* @__PURE__ */ React10.createElement(Field, { key: d.key, label: d.label }, /* @__PURE__ */ React10.createElement(Input, { type: "number", step: d.step || 1, value: f[d.key] ?? "", onChange: (e) => setF((x) => ({ ...x, [d.key]: e.target.value === "" ? "" : Number(e.target.value) })) }))), /* @__PURE__ */ React10.createElement("p", { className: "vitals-note" }, "Date & time are recorded automatically. \u2191\u2193 arrows in the table show the trend vs. the previous reading."))
  );
}
function EditPatientModal({ open, onClose, patient: patient2, user: user3 }) {
  const { pushToast } = useApp();
  const [f, setF] = useState7({});
  const [busy, setBusy] = useState7(false);
  const [err, setErr] = useState7("");
  React10.useEffect(() => {
    if (open && patient2) setF({
      name: patient2.name,
      dob: patient2.dob,
      gender: patient2.gender,
      mobile: patient2.mobile,
      alt_mobile: patient2.alt_mobile,
      email: patient2.email,
      address: patient2.address,
      city: patient2.city,
      state: patient2.state,
      pin: patient2.pin,
      ec_name: patient2.ec_name,
      ec_number: patient2.ec_number,
      ec_relation: patient2.ec_relation,
      blood_group: patient2.blood_group,
      allergies: patient2.allergies,
      conditions: patient2.conditions,
      current_meds: patient2.current_meds,
      notes: patient2.notes
    });
  }, [open, patient2]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setErr("");
    if (!f.name || f.name.trim().length < 3) {
      setErr("Name is required");
      return;
    }
    if (!f.dob) {
      setErr("Date of birth is required");
      return;
    }
    if (f.dob > (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
      setErr("Date of birth cannot be in the future");
      return;
    }
    setBusy(true);
    try {
      await updatePatient(patient2.id, f, user3.id);
      pushToast("success", "Patient updated");
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React10.createElement(
    Modal,
    {
      open,
      onClose,
      title: "Edit Patient",
      sub: /* @__PURE__ */ React10.createElement("span", null, "UHID ", /* @__PURE__ */ React10.createElement(UhidChip, { uhid: patient2?.uhid, size: "sm" }), " is permanent and cannot be changed"),
      width: "lg",
      footer: /* @__PURE__ */ React10.createElement(React10.Fragment, null, /* @__PURE__ */ React10.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React10.createElement(Btn, { onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Save changes"))
    },
    err && /* @__PURE__ */ React10.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React10.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React10.createElement(Field, { label: "Full Name", required: true, className: "fg-2" }, /* @__PURE__ */ React10.createElement(Input, { value: f.name || "", onChange: set("name") })), /* @__PURE__ */ React10.createElement(Field, { label: "Date of Birth", required: true, hint: f.dob ? `Age: ${ageLabel({ dob: f.dob })}` : "Required for automatic age calculation" }, /* @__PURE__ */ React10.createElement(Input, { type: "date", max: (/* @__PURE__ */ new Date()).toISOString().slice(0, 10), value: f.dob || "", onChange: set("dob") })), /* @__PURE__ */ React10.createElement(Field, { label: "Gender" }, /* @__PURE__ */ React10.createElement(Select, { value: f.gender || "", onChange: set("gender") }, /* @__PURE__ */ React10.createElement("option", { value: "" }, "\u2014"), /* @__PURE__ */ React10.createElement("option", null, "Male"), /* @__PURE__ */ React10.createElement("option", null, "Female"), /* @__PURE__ */ React10.createElement("option", null, "Other"))), /* @__PURE__ */ React10.createElement(Field, { label: "Mobile" }, /* @__PURE__ */ React10.createElement(Input, { value: f.mobile || "", onChange: set("mobile") })), /* @__PURE__ */ React10.createElement(Field, { label: "Alternative Mobile" }, /* @__PURE__ */ React10.createElement(Input, { value: f.alt_mobile || "", onChange: set("alt_mobile") })), /* @__PURE__ */ React10.createElement(Field, { label: "Address", className: "fg-2" }, /* @__PURE__ */ React10.createElement(Input, { value: f.address || "", onChange: set("address") })), /* @__PURE__ */ React10.createElement(Field, { label: "City" }, /* @__PURE__ */ React10.createElement(Input, { value: f.city || "", onChange: set("city") })), /* @__PURE__ */ React10.createElement(Field, { label: "State" }, /* @__PURE__ */ React10.createElement(Input, { value: f.state || "", onChange: set("state") })), /* @__PURE__ */ React10.createElement(Field, { label: "Blood Group" }, /* @__PURE__ */ React10.createElement(Select, { value: f.blood_group || "", onChange: set("blood_group") }, ["", "A+", "A\u2212", "B+", "B\u2212", "AB+", "AB\u2212", "O+", "O\u2212"].map((b) => /* @__PURE__ */ React10.createElement("option", { key: b, value: b }, b || "Unknown")))), /* @__PURE__ */ React10.createElement(Field, { label: "Allergies", className: "fg-2" }, /* @__PURE__ */ React10.createElement(Textarea, { rows: 2, value: f.allergies || "", onChange: set("allergies") })), /* @__PURE__ */ React10.createElement(Field, { label: "Conditions", className: "fg-2" }, /* @__PURE__ */ React10.createElement(Textarea, { rows: 2, value: f.conditions || "", onChange: set("conditions") })), /* @__PURE__ */ React10.createElement(Field, { label: "Current Medications", className: "fg-2" }, /* @__PURE__ */ React10.createElement(Textarea, { rows: 2, value: f.current_meds || "", onChange: set("current_meds") })), /* @__PURE__ */ React10.createElement(Field, { label: "Notes", className: "fg-2" }, /* @__PURE__ */ React10.createElement(Textarea, { rows: 2, value: f.notes || "", onChange: set("notes") })))
  );
}
function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate4();
  const { user: user3, settings, t, can } = useApp();
  const [tab, setTab] = useState7("overview");
  const [vitalsOpen, setVitalsOpen] = useState7(false);
  const [editOpen, setEditOpen] = useState7(false);
  const [billView, setBillView] = useState7(null);
  const patient2 = useLiveQuery4(() => db_default.patients.get(id), [id]);
  const vitals = useLiveQuery4(() => db_default.patient_vitals.where("patient_id").equals(id).reverse().sortBy("recorded_at"), [id]);
  const consults = useLiveQuery4(() => db_default.consultations.where("patient_id").equals(id).reverse().sortBy("time"), [id]);
  const presc = useLiveQuery4(() => db_default.prescriptions.where("patient_id").equals(id).reverse().sortBy("time"), [id]);
  const bills = useLiveQuery4(() => db_default.bills.where("patient_id").equals(id).reverse().sortBy("time"), [id]);
  const payments = useLiveQuery4(() => db_default.payments.where("patient_id").equals(id).reverse().sortBy("at"), [id]);
  if (!patient2) return /* @__PURE__ */ React10.createElement("div", { className: "page" }, /* @__PURE__ */ React10.createElement(EmptyState, { icon: "\u{1F50D}", title: "Loading patient\u2026" }));
  if (!patient2.id) return /* @__PURE__ */ React10.createElement("div", { className: "page" }, /* @__PURE__ */ React10.createElement(EmptyState, { title: "Patient not found", action: /* @__PURE__ */ React10.createElement(Btn, { onClick: () => navigate("/patients") }, "Back to patients") }));
  const money2 = (v) => fmtMoney(v, settings.currency);
  const totalSpent = (bills || []).filter((b) => b.status === "completed").reduce((s, b) => s + (b.paid || 0), 0);
  const p = patient2;
  const viewBill = async (b) => {
    const full = await getBill(b.id);
    if (full) setBillView(full);
  };
  return /* @__PURE__ */ React10.createElement("div", { className: "page" }, /* @__PURE__ */ React10.createElement("div", { className: "pt-head" }, /* @__PURE__ */ React10.createElement(Avatar, { name: p.name, size: 64, tone: p.gender === "Female" ? "teal" : "navy" }), /* @__PURE__ */ React10.createElement("div", { className: "pt-id" }, /* @__PURE__ */ React10.createElement("div", { className: "pt-name-row" }, /* @__PURE__ */ React10.createElement("h1", null, p.name), p.needs_completion && /* @__PURE__ */ React10.createElement(Badge, { tone: "red" }, "Profile incomplete \u2014 complete details"), p.blood_group && /* @__PURE__ */ React10.createElement(Badge, { tone: "red" }, "Blood group: ", p.blood_group), p.allergies && /* @__PURE__ */ React10.createElement(Badge, { tone: "amber" }, "\u26A0 ", p.allergies.split(",")[0])), /* @__PURE__ */ React10.createElement("div", { className: "pt-meta" }, /* @__PURE__ */ React10.createElement(UhidChip, { uhid: p.uhid }), /* @__PURE__ */ React10.createElement("span", null, ageLabel(p), " \xB7 ", p.gender || "\u2014"), p.mobile && /* @__PURE__ */ React10.createElement("span", { className: "pt-meta-item" }, /* @__PURE__ */ React10.createElement(Phone2, { size: 13 }), " ", p.mobile), /* @__PURE__ */ React10.createElement("span", { className: "pt-meta-item" }, /* @__PURE__ */ React10.createElement(MapPin, { size: 13 }), " ", p.city || "\u2014", p.pin ? ` ${p.pin}` : ""), /* @__PURE__ */ React10.createElement("span", { className: "pt-meta-item" }, "Registered ", fmtDate(p.reg_date)))), /* @__PURE__ */ React10.createElement("div", { className: "pt-actions" }, can("consultations") && /* @__PURE__ */ React10.createElement(Btn, { variant: "primary", icon: Stethoscope3, size: "sm", onClick: () => navigate(`/consultations?new=1&patient=${p.id}`) }, "New Consultation"), can("billing") && /* @__PURE__ */ React10.createElement(Btn, { variant: "accent", icon: ReceiptText3, size: "sm", onClick: () => navigate(`/billing?new=1&patient=${p.id}`) }, "New Bill"), can("prescriptions") && /* @__PURE__ */ React10.createElement(Btn, { variant: "outline", icon: FileText2, size: "sm", onClick: () => navigate(`/prescriptions?new=1&patient=${p.id}`) }, "Prescription"), /* @__PURE__ */ React10.createElement(Btn, { variant: "outline", icon: Activity, size: "sm", onClick: () => setVitalsOpen(true) }, "Add Vitals"), can("patients") && /* @__PURE__ */ React10.createElement(Btn, { variant: "ghost", icon: Pencil, size: "sm", onClick: () => setEditOpen(true) }, "Edit"), /* @__PURE__ */ React10.createElement(Btn, { variant: "ghost", icon: Printer, size: "sm", onClick: () => printPatientCard(p, settings) }, "ID Card"))), (p.allergies || p.conditions) && /* @__PURE__ */ React10.createElement("div", { className: "pt-medstrip" }, p.allergies && /* @__PURE__ */ React10.createElement("span", { className: "medstrip-item warn" }, "\u26A0 Allergies: ", p.allergies), p.conditions && /* @__PURE__ */ React10.createElement("span", { className: "medstrip-item info" }, "\u{1F4CB} Conditions: ", p.conditions), p.current_meds && /* @__PURE__ */ React10.createElement("span", { className: "medstrip-item" }, "\u{1F48A} Current meds: ", p.current_meds)), /* @__PURE__ */ React10.createElement(
    Tabs,
    {
      className: "pt-tabs",
      active: tab,
      onChange: setTab,
      tabs: [
        { key: "overview", label: "Overview" },
        { key: "visits", label: "Visits", badge: consults?.length },
        { key: "consults", label: "Consultations", badge: consults?.length },
        { key: "prescriptions", label: "Prescriptions", badge: presc?.length },
        { key: "bills", label: "Bills", badge: bills?.length },
        { key: "payments", label: "Payments", badge: payments?.length },
        { key: "vitals", label: "Vital Signs", badge: vitals?.length },
        { key: "notes", label: "Medical Notes" }
      ]
    }
  ), tab === "overview" && /* @__PURE__ */ React10.createElement("div", { className: "ov-grid" }, /* @__PURE__ */ React10.createElement(Card, { title: "Contact", className: "ov-card" }, /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Mobile"), /* @__PURE__ */ React10.createElement("b", null, p.mobile || "\u2014")), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Alt. mobile"), /* @__PURE__ */ React10.createElement("b", null, p.alt_mobile || "\u2014")), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Email"), /* @__PURE__ */ React10.createElement("b", null, p.email || "\u2014")), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Address"), /* @__PURE__ */ React10.createElement("b", null, p.address || "\u2014", p.city ? `, ${p.city}` : "", " ", p.pin))), /* @__PURE__ */ React10.createElement(Card, { title: "Medical Summary", className: "ov-card" }, /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Blood group"), /* @__PURE__ */ React10.createElement("b", null, p.blood_group || "Unknown")), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Allergies"), /* @__PURE__ */ React10.createElement("b", null, p.allergies || "None recorded")), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Conditions"), /* @__PURE__ */ React10.createElement("b", null, p.conditions || "None recorded")), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Current meds"), /* @__PURE__ */ React10.createElement("b", null, p.current_meds || "\u2014")), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Total visits"), /* @__PURE__ */ React10.createElement("b", null, consults?.length || 0)), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Total paid to date"), /* @__PURE__ */ React10.createElement("b", null, money2(totalSpent)))), /* @__PURE__ */ React10.createElement(Card, { title: "Latest Vitals", className: "ov-card" }, !vitals?.length ? /* @__PURE__ */ React10.createElement(EmptyState, { compact: true, icon: "\u2764\uFE0F", title: "No vitals yet", action: /* @__PURE__ */ React10.createElement(Btn, { size: "sm", variant: "outline", onClick: () => setVitalsOpen(true) }, "Record now") }) : /* @__PURE__ */ React10.createElement("div", { className: "vitals-chips" }, vitals.slice(0, 1).map((v) => /* @__PURE__ */ React10.createElement(React10.Fragment, { key: v.id }, v.temp != null && /* @__PURE__ */ React10.createElement("div", { className: "vchip" }, /* @__PURE__ */ React10.createElement("span", null, "Temp"), /* @__PURE__ */ React10.createElement("b", null, v.temp, "\xB0F")), v.sbp != null && /* @__PURE__ */ React10.createElement("div", { className: "vchip" }, /* @__PURE__ */ React10.createElement("span", null, "BP"), /* @__PURE__ */ React10.createElement("b", null, v.sbp, "/", v.dbp)), v.pulse != null && /* @__PURE__ */ React10.createElement("div", { className: "vchip" }, /* @__PURE__ */ React10.createElement("span", null, "Pulse"), /* @__PURE__ */ React10.createElement("b", null, v.pulse, " bpm")), v.spo2 != null && /* @__PURE__ */ React10.createElement("div", { className: "vchip" }, /* @__PURE__ */ React10.createElement("span", null, "SpO\u2082"), /* @__PURE__ */ React10.createElement("b", null, v.spo2, "%")), v.weight != null && /* @__PURE__ */ React10.createElement("div", { className: "vchip" }, /* @__PURE__ */ React10.createElement("span", null, "Weight"), /* @__PURE__ */ React10.createElement("b", null, v.weight, " kg")), v.sugar != null && /* @__PURE__ */ React10.createElement("div", { className: "vchip" }, /* @__PURE__ */ React10.createElement("span", null, "Sugar"), /* @__PURE__ */ React10.createElement("b", null, v.sugar)), /* @__PURE__ */ React10.createElement("div", { className: "vchip when" }, fmtDateTime(v.recorded_at)))))), vitals && vitals.length >= 2 && /* @__PURE__ */ React10.createElement(Card, { title: "Weight Trend", sub: "All recorded weights" }, /* @__PURE__ */ React10.createElement(LineChart, { height: 160, data: [...vitals].reverse().filter((v) => v.weight != null).slice(-12).map((v, i, a) => ({ label: fmtDate(v.recorded_at).slice(0, 6), value: v.weight })), color: "var(--navy-700)", unit: "" }))), tab === "visits" && /* @__PURE__ */ React10.createElement(Card, null, /* @__PURE__ */ React10.createElement(
    DataTable,
    {
      columns: [
        { key: "date", label: "Date", sortable: true, sortValue: (c) => c.time, render: (c) => fmtDateTime(c.time) },
        { key: "doctor_name", label: "Doctor", render: (c) => c.doctor_name || "\u2014" },
        { key: "diagnosis", label: "Diagnosis", render: (c) => c.diagnosis || "\u2014" },
        { key: "status", label: "Status", render: (c) => /* @__PURE__ */ React10.createElement(Badge, { tone: "blue" }, c.status || "Completed") },
        { key: "follow_up", label: "Follow-up", render: (c) => c.follow_up || "\u2014" }
      ],
      rows: consults,
      pageSize: 10,
      onRow: (c) => setTab("consults"),
      empty: /* @__PURE__ */ React10.createElement(EmptyState, { title: "No visits yet", action: can("consultations") ? /* @__PURE__ */ React10.createElement(Btn, { size: "sm", onClick: () => navigate(`/consultations?new=1&patient=${p.id}`) }, "Start consultation") : null })
    }
  )), tab === "consults" && /* @__PURE__ */ React10.createElement(Card, null, !consults ? /* @__PURE__ */ React10.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : consults.length === 0 ? /* @__PURE__ */ React10.createElement(EmptyState, { title: "No consultations recorded" }) : /* @__PURE__ */ React10.createElement("div", { className: "consult-list" }, consults.map((c) => /* @__PURE__ */ React10.createElement("div", { className: "consult-card", key: c.id }, /* @__PURE__ */ React10.createElement("div", { className: "cc-head" }, /* @__PURE__ */ React10.createElement("span", { className: "cc-no" }, c.consultation_no), /* @__PURE__ */ React10.createElement("span", { className: "cc-date" }, fmtDateTime(c.time)), /* @__PURE__ */ React10.createElement("span", { className: "cc-doctor" }, c.doctor_name)), /* @__PURE__ */ React10.createElement("div", { className: "cc-grid" }, /* @__PURE__ */ React10.createElement("div", null, /* @__PURE__ */ React10.createElement("span", null, "Chief Complaint"), c.chief || "\u2014"), /* @__PURE__ */ React10.createElement("div", null, /* @__PURE__ */ React10.createElement("span", null, "Diagnosis"), c.diagnosis || "\u2014"), c.symptoms && /* @__PURE__ */ React10.createElement("div", null, /* @__PURE__ */ React10.createElement("span", null, "Symptoms"), c.symptoms), c.notes && /* @__PURE__ */ React10.createElement("div", null, /* @__PURE__ */ React10.createElement("span", null, "Clinical Notes"), c.notes), c.advice && /* @__PURE__ */ React10.createElement("div", null, /* @__PURE__ */ React10.createElement("span", null, "Advice"), c.advice), c.follow_up && /* @__PURE__ */ React10.createElement("div", null, /* @__PURE__ */ React10.createElement("span", null, "Follow-up"), fmtDate(c.follow_up))))))), tab === "prescriptions" && /* @__PURE__ */ React10.createElement(Card, null, /* @__PURE__ */ React10.createElement(
    DataTable,
    {
      columns: [
        { key: "prescription_no", label: "Prescription", render: (x) => /* @__PURE__ */ React10.createElement("span", { className: "cell-mono" }, x.prescription_no) },
        { key: "time", label: "Date", sortable: true, sortValue: (x) => x.time, render: (x) => fmtDate(x.time) },
        { key: "doctor_name", label: "Doctor", render: (x) => x.doctor_name || "\u2014" },
        { key: "diagnosis", label: "Diagnosis", render: (x) => x.diagnosis || "\u2014" }
      ],
      rows: presc,
      pageSize: 10,
      onRow: async (x) => {
        const items = await db_default.prescription_items.where("prescription_id").equals(x.id).toArray();
        const doc = await db_default.doctors.get(x.doctor_id) || null;
        Promise.resolve().then(() => (init_printers(), printers_exports)).then(({ printPrescription: printPrescription2 }) => printPrescription2({ ...x, items, settings }, p));
      },
      empty: /* @__PURE__ */ React10.createElement(EmptyState, { icon: "\u{1F4CB}", title: "No prescriptions yet", action: can("prescriptions") ? /* @__PURE__ */ React10.createElement(Btn, { size: "sm", variant: "outline", onClick: () => navigate(`/prescriptions?new=1&patient=${p.id}`) }, "Create prescription") : null })
    }
  )), tab === "bills" && /* @__PURE__ */ React10.createElement(Card, null, /* @__PURE__ */ React10.createElement(
    DataTable,
    {
      columns: [
        { key: "bill_no", label: "Bill #", render: (b) => /* @__PURE__ */ React10.createElement("span", { className: "cell-mono" }, b.bill_no) },
        { key: "time", label: "Date", sortable: true, sortValue: (b) => b.time, render: (b) => fmtDateTime(b.time) },
        { key: "bill_type", label: "Type", render: (b) => /* @__PURE__ */ React10.createElement(Badge, { tone: "navy" }, b.bill_type) },
        { key: "total", label: "Total", align: "right", sortable: true, render: (b) => money2(b.total) },
        { key: "payment_status", label: "Payment", render: (b) => /* @__PURE__ */ React10.createElement(PaymentBadge, { status: b.status === "CANCELLED" ? "CANCELLED" : b.payment_status }) }
      ],
      rows: bills,
      pageSize: 10,
      onRow: viewBill,
      empty: /* @__PURE__ */ React10.createElement(EmptyState, { title: "No bills yet", action: can("billing") ? /* @__PURE__ */ React10.createElement(Btn, { size: "sm", variant: "accent", onClick: () => navigate(`/billing?new=1&patient=${p.id}`) }, "Create bill") : null })
    }
  )), tab === "payments" && /* @__PURE__ */ React10.createElement(Card, null, /* @__PURE__ */ React10.createElement(
    DataTable,
    {
      columns: [
        { key: "at", label: "Date", sortable: true, render: (x) => fmtDateTime(x.at) },
        { key: "kind", label: "Type", render: (x) => x.kind === "refund" ? /* @__PURE__ */ React10.createElement(Badge, { tone: "red" }, "Refund") : /* @__PURE__ */ React10.createElement(Badge, { tone: "green" }, "Payment") },
        { key: "method", label: "Method", render: (x) => x.method },
        { key: "amount", label: "Amount", align: "right", sortable: true, render: (x) => (x.kind === "refund" ? "\u2212 " : "") + money2(x.amount) },
        { key: "note", label: "Note", render: (x) => x.note || "\u2014" }
      ],
      rows: payments,
      pageSize: 10,
      empty: /* @__PURE__ */ React10.createElement(EmptyState, { icon: "\u{1F4B3}", title: "No payments recorded" })
    }
  )), tab === "vitals" && /* @__PURE__ */ React10.createElement(
    Card,
    {
      title: "Vital Signs History",
      sub: "Most recent first \u2014 arrows show trend vs previous reading",
      actions: /* @__PURE__ */ React10.createElement(Btn, { size: "sm", variant: "accent", icon: Plus3, onClick: () => setVitalsOpen(true) }, "Record vitals")
    },
    /* @__PURE__ */ React10.createElement(VitalsTable, { rows: vitals || [] })
  ), tab === "notes" && /* @__PURE__ */ React10.createElement(Card, { title: "Medical Notes" }, /* @__PURE__ */ React10.createElement("div", { className: "notes-box" }, p.notes ? /* @__PURE__ */ React10.createElement("p", null, p.notes) : /* @__PURE__ */ React10.createElement(EmptyState, { compact: true, icon: "\u{1F5D2}\uFE0F", title: "No general notes", action: can("patients") ? /* @__PURE__ */ React10.createElement(Btn, { size: "sm", variant: "outline", onClick: () => setEditOpen(true) }, "Add notes") : null })), (consults || []).filter((c) => c.notes).length > 0 && /* @__PURE__ */ React10.createElement(React10.Fragment, null, /* @__PURE__ */ React10.createElement("h4", { className: "sub-head" }, "Notes from consultations"), (consults || []).filter((c) => c.notes).map((c) => /* @__PURE__ */ React10.createElement("div", { className: "note-item", key: c.id }, /* @__PURE__ */ React10.createElement("span", { className: "note-when" }, fmtDateTime(c.time), " \xB7 ", c.consultation_no), /* @__PURE__ */ React10.createElement("p", null, c.notes))))), /* @__PURE__ */ React10.createElement(AddVitalsModal, { open: vitalsOpen, onClose: () => setVitalsOpen(false), patient: p, user: user3 }), /* @__PURE__ */ React10.createElement(EditPatientModal, { open: editOpen, onClose: () => setEditOpen(false), patient: p, user: user3 }), billView && /* @__PURE__ */ React10.createElement(BillViewer, { full: billView, onClose: () => setBillView(null), patient: p }));
}
function BillViewer({ full, onClose, patient: patient2 }) {
  const { settings } = useApp();
  const { bill: bill2, items, payments } = full;
  const money2 = (v) => fmtMoney(v, settings.currency);
  return /* @__PURE__ */ React10.createElement(
    Modal,
    {
      open: true,
      onClose,
      title: /* @__PURE__ */ React10.createElement("span", { className: "cell-mono" }, bill2.bill_no),
      sub: `${patient2.name} \xB7 ${patient2.uhid}`,
      width: "lg",
      footer: /* @__PURE__ */ React10.createElement(React10.Fragment, null, /* @__PURE__ */ React10.createElement(Btn, { variant: "ghost", onClick: onClose }, "Close"), /* @__PURE__ */ React10.createElement(Btn, { variant: "primary", icon: Printer, onClick: () => printInvoiceA4(bill2, items, payments, settings) }, "A4 Payment Receipt"))
    },
    /* @__PURE__ */ React10.createElement("div", { className: "bv-body" }, /* @__PURE__ */ React10.createElement("div", { className: "bv-meta" }, /* @__PURE__ */ React10.createElement("span", null, /* @__PURE__ */ React10.createElement(PaymentBadge, { status: bill2.status === "CANCELLED" ? "CANCELLED" : bill2.payment_status })), /* @__PURE__ */ React10.createElement(Badge, { tone: "navy" }, bill2.bill_type), /* @__PURE__ */ React10.createElement("span", null, fmtDateTime(bill2.time)), bill2.cancel_reason && /* @__PURE__ */ React10.createElement(Badge, { tone: "red" }, "Cancelled: ", bill2.cancel_reason)), /* @__PURE__ */ React10.createElement("table", { className: "table bv-table" }, /* @__PURE__ */ React10.createElement("thead", null, /* @__PURE__ */ React10.createElement("tr", null, /* @__PURE__ */ React10.createElement("th", null, "Item"), /* @__PURE__ */ React10.createElement("th", null, "Category"), /* @__PURE__ */ React10.createElement("th", { className: "th-right" }, "Qty"), /* @__PURE__ */ React10.createElement("th", { className: "th-right" }, "Price"), /* @__PURE__ */ React10.createElement("th", { className: "th-right" }, "Amount"))), /* @__PURE__ */ React10.createElement("tbody", null, items.map((it) => /* @__PURE__ */ React10.createElement("tr", { key: it.id }, /* @__PURE__ */ React10.createElement("td", null, it.name, it.batch_no && /* @__PURE__ */ React10.createElement("span", { className: "cell-sub" }, " \xB7 batch ", it.batch_no)), /* @__PURE__ */ React10.createElement("td", null, /* @__PURE__ */ React10.createElement(Badge, { tone: it.item_type === "medicine" ? "teal" : it.item_type === "consultation" ? "navy" : "blue" }, it.item_type)), /* @__PURE__ */ React10.createElement("td", { className: "td-right" }, fmtQty(it.qty)), /* @__PURE__ */ React10.createElement("td", { className: "td-right" }, money2(it.price)), /* @__PURE__ */ React10.createElement("td", { className: "td-right" }, money2(it.amount)))))), /* @__PURE__ */ React10.createElement("div", { className: "bv-totals" }, /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Subtotal"), /* @__PURE__ */ React10.createElement("b", null, money2(bill2.subtotal))), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Discount"), /* @__PURE__ */ React10.createElement("b", null, "\u2212 ", money2(bill2.discount))), /* @__PURE__ */ React10.createElement("div", { className: "kv kv-total" }, /* @__PURE__ */ React10.createElement("span", null, "Total Amount"), /* @__PURE__ */ React10.createElement("b", null, money2(bill2.total))), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Paid"), /* @__PURE__ */ React10.createElement("b", null, money2(bill2.paid))), /* @__PURE__ */ React10.createElement("div", { className: "kv" }, /* @__PURE__ */ React10.createElement("span", null, "Balance"), /* @__PURE__ */ React10.createElement("b", null, money2(bill2.total - (bill2.paid || 0))))), payments.length > 0 && /* @__PURE__ */ React10.createElement("div", { className: "bv-pay" }, payments.map((x) => /* @__PURE__ */ React10.createElement("span", { key: x.id, className: "bpay-item" }, /* @__PURE__ */ React10.createElement(Badge, { tone: x.kind === "refund" ? "red" : "green" }, x.kind === "refund" ? "Refund" : x.method), " ", money2(x.amount), " \xB7 ", fmtDate(x.at)))))
  );
}
var VITAL_DEFS;
var init_PatientProfile = __esm({
  "src/pages/PatientProfile.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_charts();
    init_patients();
    init_billing();
    init_printers();
    init_utils();
    VITAL_DEFS = [
      { key: "temp", label: "Temperature (\xB0F)", step: 0.1 },
      { key: "sbp", label: "BP Systolic (mmHg)" },
      { key: "dbp", label: "BP Diastolic (mmHg)" },
      { key: "pulse", label: "Heart Rate (bpm)" },
      { key: "spo2", label: "SpO\u2082 (%)" },
      { key: "rr", label: "Respiratory Rate" },
      { key: "weight", label: "Weight (kg)", step: 0.1 },
      { key: "height", label: "Height (cm)", step: 0.1 },
      { key: "sugar", label: "Blood Sugar (mg/dL)" }
    ];
  }
});

// src/services/clinical.js
async function createConsultation(data, userId) {
  const settings = await getSettings();
  return db_default.transaction("rw", [db_default.consultations, db_default.counters, db_default.activity_logs, db_default.patient_vitals, db_default.patients, db_default.doctors], async () => {
    const patient2 = await db_default.patients.get(data.patient_id);
    if (!patient2) throw new Error("Patient not found");
    const doctor = await db_default.doctors.get(data.doctor_id);
    const now = data.when || nowISO();
    const consultation_no = await makeNo("CONS", "HC-C", new Date(now).getFullYear());
    const c = {
      id: uid(),
      consultation_no,
      patient_id: patient2.id,
      uhid: patient2.uhid,
      doctor_id: doctor ? doctor.id : null,
      doctor_name: doctor ? doctor.name : "",
      date: dkey(new Date(now)),
      time: now,
      chief: data.chief || "",
      symptoms: data.symptoms || "",
      diagnosis: data.diagnosis || "",
      notes: data.notes || "",
      advice: data.advice || "",
      follow_up: data.follow_up || "",
      status: "completed",
      created_by: userId || null,
      created_at: now
    };
    await db_default.consultations.add(c);
    if (data.vitals && Object.values(data.vitals).some((v) => v != null && v !== "")) {
      await addVitals(patient2.id, data.vitals, userId);
    }
    await audit(userId, "CONSULTATION_CREATE", "consultation", c.id, `${consultation_no} \xB7 ${patient2.name} (${patient2.uhid})`);
    return c;
  });
}
async function createPrescription(data, userId) {
  const settings = await getSettings();
  return db_default.transaction("rw", [db_default.prescriptions, db_default.prescription_items, db_default.counters, db_default.activity_logs, db_default.patients, db_default.medicines], async () => {
    const patient2 = await db_default.patients.get(data.patient_id);
    if (!patient2) throw new Error("Patient not found");
    const now = data.when || nowISO();
    const prescription_no = await makeNo("PR", "HC-PR", new Date(now).getFullYear());
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error("Add at least one item to the prescription");
    const pr = {
      id: uid(),
      prescription_no,
      patient_id: patient2.id,
      uhid: patient2.uhid,
      consultation_id: data.consultation_id || null,
      doctor_id: data.doctor_id || null,
      doctor_name: data.doctor_name || "",
      date: dkey(new Date(now)),
      time: now,
      diagnosis: data.diagnosis || "",
      notes: data.notes || "",
      advice: data.advice || "",
      created_by: userId || null,
      created_at: now
    };
    await db_default.prescriptions.add(pr);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let name = it.name || "";
      if (!name && it.medicine_id) {
        const med = await db_default.medicines.get(it.medicine_id);
        name = med ? med.name : "Medicine";
      }
      await db_default.prescription_items.add({
        id: uid(),
        prescription_id: pr.id,
        medicine_id: it.medicine_id || null,
        seq: i + 1,
        name,
        dosage: it.dosage || "",
        frequency: it.frequency || "",
        duration: it.duration || "",
        instruction: it.instruction || ""
      });
    }
    await audit(userId, "PRESCRIPTION_CREATE", "prescription", pr.id, `${prescription_no} \xB7 ${patient2.name} (${patient2.uhid})`);
    return pr;
  });
}
async function createAppointment(data, userId) {
  const settings = await getSettings();
  return db_default.transaction("rw", [db_default.appointments, db_default.counters, db_default.activity_logs, db_default.patients], async () => {
    const patient2 = await db_default.patients.get(data.patient_id);
    if (!patient2) throw new Error("Patient not found");
    if (!data.date || !data.time) throw new Error("Date and time are required");
    const now = nowISO();
    const appointment_no = await makeNo("APT", "HC-APT", (/* @__PURE__ */ new Date(data.date + "T00:00:00")).getFullYear());
    const a = {
      id: uid(),
      appointment_no,
      patient_id: patient2.id,
      uhid: patient2.uhid,
      doctor_id: data.doctor_id || null,
      date: data.date,
      time: data.time,
      reason: data.reason || "",
      status: "scheduled",
      created_by: userId || null,
      created_at: now,
      updated_at: now
    };
    await db_default.appointments.add(a);
    await audit(userId, "APPOINTMENT_CREATE", "appointment", a.id, `${appointment_no} \xB7 ${patient2.name} \xB7 ${data.date} ${data.time}`);
    return a;
  });
}
async function updateAppointment(id, data, userId) {
  return db_default.transaction("rw", [db_default.appointments, db_default.activity_logs, db_default.patients], async () => {
    const current = await db_default.appointments.get(id);
    if (!current) throw new Error("Appointment not found");
    const patient2 = await db_default.patients.get(data.patient_id || current.patient_id);
    if (!patient2) throw new Error("Patient not found");
    if (!data.date || !data.time) throw new Error("Date and time are required");
    const updated = {
      ...current,
      patient_id: patient2.id,
      uhid: patient2.uhid,
      doctor_id: data.doctor_id || null,
      date: data.date,
      time: data.time,
      reason: data.reason || "",
      updated_at: nowISO()
    };
    await db_default.appointments.put(updated);
    await audit(userId, "APPOINTMENT_UPDATE", "appointment", id, `${current.appointment_no} \xB7 ${data.date} ${data.time}`);
    return updated;
  });
}
async function setAppointmentStatus(id, status, userId) {
  if (!APPT_STATUSES.includes(status)) throw new Error("Invalid status");
  return db_default.transaction("rw", [db_default.appointments, db_default.activity_logs], async () => {
    const a = await db_default.appointments.get(id);
    if (!a) throw new Error("Appointment not found");
    const updated = { ...a, status, updated_at: nowISO() };
    await db_default.appointments.put(updated);
    await audit(userId, "APPOINTMENT_STATUS", "appointment", id, `${a.status} \u2192 ${status}`);
    return updated;
  });
}
async function createDoctor(data, userId) {
  const name = String(data.name || "").trim();
  if (!name) throw new Error("Doctor name is required");
  const doc = {
    id: uid(),
    name,
    qualification: data.qualification || "",
    specialization: data.specialization || "",
    phone: data.phone || "",
    email: data.email || "",
    active: 1,
    created_at: nowISO(),
    updated_at: nowISO()
  };
  await db_default.doctors.add(doc);
  await audit(userId, "DOCTOR_CREATE", "doctor", doc.id, doc.name);
  return doc;
}
async function updateDoctor(id, patch, userId) {
  const existing = await db_default.doctors.get(id);
  if (!existing) throw new Error("Doctor not found");
  const updated = { ...existing, ...patch, id: existing.id, updated_at: nowISO() };
  await db_default.doctors.put(updated);
  await audit(userId, "DOCTOR_UPDATE", "doctor", id, Object.keys(patch).join(", "));
  return updated;
}
async function archiveDoctor(id, userId) {
  const existing = await db_default.doctors.get(id);
  if (!existing) throw new Error("Doctor not found");
  const active = existing.active ? 0 : 1;
  const updated = { ...existing, active, updated_at: nowISO() };
  await db_default.doctors.put(updated);
  await audit(userId, active ? "DOCTOR_REACTIVATE" : "DOCTOR_ARCHIVE", "doctor", id, existing.name);
  return updated;
}
async function deleteDoctor(id, userId) {
  const existing = await db_default.doctors.get(id);
  if (!existing) throw new Error("Doctor not found");
  const [consultCount, apptCount, presCount] = await Promise.all([
    db_default.consultations.where("doctor_id").equals(id).count(),
    db_default.appointments.where("doctor_id").equals(id).count(),
    db_default.prescriptions.where("doctor_id").equals(id).count()
  ]);
  if (consultCount > 0 || apptCount > 0 || presCount > 0) {
    throw new Error("This doctor has clinical history (consultations or appointments) and cannot be deleted. Archive the doctor instead.");
  }
  await db_default.doctors.delete(id);
  await audit(userId, "DOCTOR_DELETE", "doctor", id, existing.name);
}
var APPT_STATUSES;
var init_clinical = __esm({
  "src/services/clinical.js"() {
    init_db();
    init_utils();
    init_core();
    init_patients();
    APPT_STATUSES = ["scheduled", "confirmed", "checked_in", "waiting", "in_consultation", "completed", "cancelled", "no_show"];
  }
});

// src/pages/Consultations.jsx
import React11, { useState as useState8, useEffect as useEffect7 } from "react";
import { useNavigate as useNavigate5, useSearchParams as useSearchParams2 } from "react-router-dom";
import { useLiveQuery as useLiveQuery5 } from "dexie-react-hooks";
import { Stethoscope as Stethoscope4, Siren, Clock as Clock2, CheckCircle2 as CheckCircle24, FileText as FileText3, ReceiptText as ReceiptText4 } from "lucide-react";
function NewConsultModal({ open, onClose, prefillPatient, onDone }) {
  const { user: user3, settings, pushToast } = useApp();
  const patients = useLiveQuery5(async () => (await db_default.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const doctors = useLiveQuery5(() => db_default.doctors.filter((d) => d.active).toArray(), []);
  const [f, setF] = useState8({});
  const [patient2, setPatient] = useState8(null);
  const [vitals, setVitals] = useState8(null);
  const [showVitals, setShowVitals] = useState8(true);
  const [busy, setBusy] = useState8(false);
  const [err, setErr] = useState8("");
  useEffect7(() => {
    if (open) {
      setPatient(prefillPatient || null);
      setF({ doctor_id: doctors?.[0]?.id || "", date: todayStr(), time: (/* @__PURE__ */ new Date()).toTimeString().slice(0, 5), chief: "", symptoms: "", diagnosis: "", notes: "", advice: "", follow_up: "" });
      setVitals(null);
      setErr("");
    }
  }, [open]);
  const save = async () => {
    setErr("");
    if (!patient2) {
      setErr("Select a patient");
      return;
    }
    if (!f.doctor_id) {
      setErr("Select a doctor");
      return;
    }
    if (!f.chief.trim()) {
      setErr("Chief complaint is required");
      return;
    }
    setBusy(true);
    try {
      const when = `${f.date || todayStr()}T${f.time || "09:00"}:00`;
      const c = await createConsultation({
        patient_id: patient2.id,
        doctor_id: f.doctor_id,
        when: new Date(when).toISOString(),
        chief: f.chief,
        symptoms: f.symptoms,
        diagnosis: f.diagnosis,
        notes: f.notes,
        advice: f.advice,
        follow_up: f.follow_up,
        vitals
      }, user3.id);
      pushToast("success", `Consultation ${c.consultation_no} saved`);
      onDone && onDone(c, patient2);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React11.createElement(
    Modal,
    {
      open,
      onClose,
      title: "New Consultation",
      width: "lg",
      sub: patient2 ? /* @__PURE__ */ React11.createElement("span", null, patient2.name, " \xB7 ", /* @__PURE__ */ React11.createElement(UhidChip, { uhid: patient2.uhid, size: "sm" }), " ", patient2.allergies && /* @__PURE__ */ React11.createElement(Badge, { tone: "amber" }, "\u26A0 ", patient2.allergies)) : "Select the patient being seen",
      footer: /* @__PURE__ */ React11.createElement(React11.Fragment, null, /* @__PURE__ */ React11.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React11.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Save consultation"))
    },
    err && /* @__PURE__ */ React11.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React11.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React11.createElement(Field, { label: "Patient", required: true, className: "fg-3" }, /* @__PURE__ */ React11.createElement(Select, { value: patient2?.id || "", onChange: (e) => setPatient((patients || []).find((p) => p.id === e.target.value) || null) }, /* @__PURE__ */ React11.createElement("option", { value: "" }, "Search patient\u2026"), (patients || []).map((p) => /* @__PURE__ */ React11.createElement("option", { key: p.id, value: p.id }, p.name, " \u2014 ", p.uhid, p.mobile ? ` \xB7 ${p.mobile}` : "")))), /* @__PURE__ */ React11.createElement(Field, { label: "Doctor", required: true }, /* @__PURE__ */ React11.createElement(Select, { value: f.doctor_id || "", onChange: (e) => setF((x) => ({ ...x, doctor_id: e.target.value })) }, /* @__PURE__ */ React11.createElement("option", { value: "" }, "Select\u2026"), (doctors || []).map((d) => /* @__PURE__ */ React11.createElement("option", { key: d.id, value: d.id }, d.name)))), /* @__PURE__ */ React11.createElement("div", { className: "fg-row" }, /* @__PURE__ */ React11.createElement(Field, { label: "Date" }, /* @__PURE__ */ React11.createElement(Input, { type: "date", value: f.date || "", onChange: (e) => setF((x) => ({ ...x, date: e.target.value })) })), /* @__PURE__ */ React11.createElement(Field, { label: "Time" }, /* @__PURE__ */ React11.createElement(Input, { type: "time", value: f.time || "", onChange: (e) => setF((x) => ({ ...x, time: e.target.value })) }))), /* @__PURE__ */ React11.createElement(Field, { label: "Chief Complaint", required: true, className: "fg-2" }, /* @__PURE__ */ React11.createElement(Input, { value: f.chief || "", onChange: (e) => setF((x) => ({ ...x, chief: e.target.value })), placeholder: "e.g. Fever since 2 days" })), /* @__PURE__ */ React11.createElement(Field, { label: "Symptoms", className: "fg-2" }, /* @__PURE__ */ React11.createElement(Textarea, { rows: 2, value: f.symptoms || "", onChange: (e) => setF((x) => ({ ...x, symptoms: e.target.value })) })), /* @__PURE__ */ React11.createElement(Field, { label: "Diagnosis", className: "fg-2" }, /* @__PURE__ */ React11.createElement(Input, { value: f.diagnosis || "", onChange: (e) => setF((x) => ({ ...x, diagnosis: e.target.value })), placeholder: "Provisional / final diagnosis" })), /* @__PURE__ */ React11.createElement(Field, { label: "Clinical Notes", className: "fg-2" }, /* @__PURE__ */ React11.createElement(Textarea, { rows: 2, value: f.notes || "", onChange: (e) => setF((x) => ({ ...x, notes: e.target.value })) })), /* @__PURE__ */ React11.createElement(Field, { label: "Advice", className: "fg-2" }, /* @__PURE__ */ React11.createElement(Textarea, { rows: 2, value: f.advice || "", onChange: (e) => setF((x) => ({ ...x, advice: e.target.value })) })), /* @__PURE__ */ React11.createElement(Field, { label: "Follow-up Date", hint: "Optional" }, /* @__PURE__ */ React11.createElement(Input, { type: "date", value: f.follow_up || "", onChange: (e) => setF((x) => ({ ...x, follow_up: e.target.value })) }))),
    /* @__PURE__ */ React11.createElement("div", { className: "vitals-toggle-row" }, /* @__PURE__ */ React11.createElement("button", { type: "button", className: "vt-btn", onClick: () => setShowVitals((s) => !s) }, showVitals ? "\u25BE" : "\u25B8", " Vital signs ", vitals && Object.values(vitals).some((v) => v != null && v !== "") && /* @__PURE__ */ React11.createElement(Badge, { tone: "teal" }, "recorded"))),
    showVitals && /* @__PURE__ */ React11.createElement("div", { className: "vitals-grid" }, VITAL_INPUTS.map((v) => /* @__PURE__ */ React11.createElement("label", { key: v.key, className: "field" }, /* @__PURE__ */ React11.createElement("span", { className: "field-label" }, v.label), /* @__PURE__ */ React11.createElement(
      Input,
      {
        type: "number",
        step: v.step,
        value: vitals?.[v.key] ?? "",
        onChange: (e) => setVitals((x) => ({ ...x || {}, [v.key]: e.target.value === "" ? null : Number(e.target.value) }))
      }
    ))))
  );
}
function Consultations() {
  const { t } = useApp();
  const navigate = useNavigate5();
  const [params, setParams] = useSearchParams2();
  const [modal, setModal] = useState8(false);
  const [pre, setPre] = useState8(null);
  const [done, setDone] = useState8(null);
  const [from, setFrom] = useState8(dkey(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState8(todayStr());
  const [doctorF, setDoctorF] = useState8("");
  const doctors = useLiveQuery5(() => db_default.doctors.toArray(), []);
  const rows = useLiveQuery5(async () => {
    const all = await db_default.consultations.toArray();
    const pmap = new Map((await db_default.patients.toArray()).map((p) => [p.id, p]));
    let list = all.filter((c) => c.date >= from && c.date <= to).map((c) => ({ ...c, patient: pmap.get(c.patient_id) })).filter((c) => c.patient);
    if (doctorF) list = list.filter((c) => c.doctor_id === doctorF);
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }, [from, to, doctorF]);
  useEffect7(() => {
    if (params.get("new") === "1") {
      const pid2 = params.get("patient");
      const p = db_default.patients.get(pid2).then((x) => {
        setPre(x || null);
        setModal(true);
        params.delete("new");
        params.delete("patient");
        setParams(params, { replace: true });
      });
      return () => {
        p && p.cancel?.();
      };
    }
    return void 0;
  }, [params]);
  const onDone = (c, patient2) => {
    setModal(false);
    setDone({ c, patient: patient2 });
  };
  return /* @__PURE__ */ React11.createElement("div", { className: "page" }, /* @__PURE__ */ React11.createElement(
    PageHeader,
    {
      title: "Consultations",
      sub: "Every consultation is permanently linked to the patient's UHID",
      actions: /* @__PURE__ */ React11.createElement(Btn, { variant: "accent", icon: Stethoscope4, onClick: () => {
        setPre(null);
        setModal(true);
      } }, "+ New Consultation")
    }
  ), /* @__PURE__ */ React11.createElement(Card, null, /* @__PURE__ */ React11.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React11.createElement(Field, { label: "", className: "tb-field" }, /* @__PURE__ */ React11.createElement(Input, { type: "date", value: from, onChange: (e) => setFrom(e.target.value) })), /* @__PURE__ */ React11.createElement(Field, { label: "", className: "tb-field" }, /* @__PURE__ */ React11.createElement(Input, { type: "date", value: to, onChange: (e) => setTo(e.target.value) })), /* @__PURE__ */ React11.createElement(Select, { value: doctorF, onChange: (e) => setDoctorF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React11.createElement("option", { value: "" }, "All doctors"), (doctors || []).map((d) => /* @__PURE__ */ React11.createElement("option", { key: d.id, value: d.id }, d.name)))), /* @__PURE__ */ React11.createElement(
    DataTable,
    {
      columns: [
        { key: "time", label: "Date & Time", sortable: true, render: (c) => /* @__PURE__ */ React11.createElement("span", { className: "cell-person" }, /* @__PURE__ */ React11.createElement("span", { className: "cell-main" }, fmtDateTime(c.time)), /* @__PURE__ */ React11.createElement("span", { className: "cell-sub" }, c.consultation_no)) },
        { key: "patient", label: "Patient", sortable: true, sortValue: (c) => c.patient.name, render: (c) => /* @__PURE__ */ React11.createElement("span", { className: "cell-person" }, /* @__PURE__ */ React11.createElement("span", { className: "cell-main" }, c.patient.name), /* @__PURE__ */ React11.createElement("span", { className: "cell-sub" }, /* @__PURE__ */ React11.createElement(UhidChip, { uhid: c.patient.uhid, size: "sm" }))) },
        { key: "doctor_name", label: "Doctor", render: (c) => c.doctor_name || "\u2014" },
        { key: "chief", label: "Chief Complaint", render: (c) => /* @__PURE__ */ React11.createElement("span", { className: "cell-ellip", title: c.chief }, c.chief || "\u2014") },
        { key: "diagnosis", label: "Diagnosis", render: (c) => /* @__PURE__ */ React11.createElement("span", { className: "cell-ellip", title: c.diagnosis }, c.diagnosis || "\u2014") },
        { key: "follow_up", label: "Follow-up", render: (c) => c.follow_up ? /* @__PURE__ */ React11.createElement("span", { className: "follow-chip" }, /* @__PURE__ */ React11.createElement(Clock2, { size: 12 }), " ", fmtDate(c.follow_up)) : "\u2014" }
      ],
      rows,
      pageSize: 12,
      onRow: (c) => navigate(`/patients/${c.patient_id}`),
      empty: /* @__PURE__ */ React11.createElement(EmptyState, { title: "No consultations in this range", action: /* @__PURE__ */ React11.createElement(Btn, { size: "sm", variant: "accent", onClick: () => setModal(true) }, "New consultation") }),
      loading: !rows
    }
  )), /* @__PURE__ */ React11.createElement(NewConsultModal, { open: modal, onClose: () => setModal(false), prefillPatient: pre, onDone }), done && /* @__PURE__ */ React11.createElement(
    Modal,
    {
      open: true,
      onClose: () => setDone(null),
      title: "Consultation saved",
      width: "sm",
      footer: /* @__PURE__ */ React11.createElement(Btn, { variant: "ghost", onClick: () => setDone(null) }, "Close")
    },
    /* @__PURE__ */ React11.createElement("div", { className: "done-panel" }, /* @__PURE__ */ React11.createElement(CheckCircle24, { size: 34, className: "done-ic" }), /* @__PURE__ */ React11.createElement("p", null, /* @__PURE__ */ React11.createElement("b", null, done.c.consultation_no), " \xB7 ", done.patient.name), /* @__PURE__ */ React11.createElement("div", { className: "done-actions" }, /* @__PURE__ */ React11.createElement(Btn, { size: "sm", variant: "accent", icon: FileText3, onClick: () => {
      const d = done;
      setDone(null);
      navigate(`/prescriptions?new=1&patient=${d.patient.id}`);
    } }, "Create Prescription"), /* @__PURE__ */ React11.createElement(Btn, { size: "sm", variant: "primary", icon: ReceiptText4, onClick: () => {
      const d = done;
      setDone(null);
      navigate(`/billing?new=1&patient=${d.patient.id}`);
    } }, "Create Bill"), /* @__PURE__ */ React11.createElement(Btn, { size: "sm", variant: "outline", onClick: () => {
      const d = done;
      setDone(null);
      navigate(`/patients/${d.patient.id}`);
    } }, "View Patient")))
  ));
}
var VITAL_INPUTS;
var init_Consultations = __esm({
  "src/pages/Consultations.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_clinical();
    init_utils();
    VITAL_INPUTS = [
      { key: "temp", label: "Temp (\xB0F)", step: 0.1 },
      { key: "sbp", label: "BP Systolic", step: 1 },
      { key: "dbp", label: "BP Diastolic", step: 1 },
      { key: "pulse", label: "Pulse (bpm)", step: 1 },
      { key: "spo2", label: "SpO\u2082 (%)", step: 1 },
      { key: "rr", label: "Resp. Rate", step: 1 },
      { key: "weight", label: "Weight (kg)", step: 0.1 },
      { key: "height", label: "Height (cm)", step: 0.1 },
      { key: "sugar", label: "Sugar (mg/dL)", step: 1 }
    ];
  }
});

// src/pages/Appointments.jsx
import React12, { useState as useState9, useEffect as useEffect8 } from "react";
import { useNavigate as useNavigate6 } from "react-router-dom";
import { useLiveQuery as useLiveQuery6 } from "dexie-react-hooks";
import { CalendarDays as CalendarDays3, ChevronLeft as ChevronLeft2, ChevronRight as ChevronRight3, UserPlus as UserPlus3, Pencil as Pencil2, Search as Search4 } from "lucide-react";
function NewApptModal({ open, onClose, editing }) {
  const { user: user3, pushToast } = useApp();
  const patients = useLiveQuery6(async () => (await db_default.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) || [];
  const doctors = useLiveQuery6(() => db_default.doctors.filter((d) => d.active).toArray(), []) || [];
  const [f, setF] = useState9({});
  const [patient2, setPatient] = useState9(null);
  const [busy, setBusy] = useState9(false);
  const [err, setErr] = useState9("");
  useEffect8(() => {
    if (open) {
      setF(editing ? { doctor_id: editing.doctor_id || "", date: editing.date, time: editing.time, reason: editing.reason || "" } : { doctor_id: doctors?.[0]?.id || "", date: dkey(/* @__PURE__ */ new Date()), time: "10:00", reason: "" });
      setPatient(editing?.patient || null);
      setErr("");
    }
  }, [open, editing, doctors]);
  const save = async () => {
    setErr("");
    if (!patient2) {
      setErr("Select a patient");
      return;
    }
    if (!f.date || !f.time) {
      setErr("Date and time are required");
      return;
    }
    setBusy(true);
    try {
      const a = editing ? await updateAppointment(editing.id, { patient_id: patient2.id, doctor_id: f.doctor_id, date: f.date, time: f.time, reason: f.reason }, user3.id) : await createAppointment({ patient_id: patient2.id, doctor_id: f.doctor_id, date: f.date, time: f.time, reason: f.reason }, user3.id);
      pushToast("success", editing ? `Appointment ${a.appointment_no} updated` : `Appointment ${a.appointment_no} scheduled`);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React12.createElement(
    Modal,
    {
      open,
      onClose,
      title: editing ? "Edit Appointment" : "Schedule Appointment",
      width: "md",
      footer: /* @__PURE__ */ React12.createElement(React12.Fragment, null, /* @__PURE__ */ React12.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React12.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Schedule"))
    },
    err && /* @__PURE__ */ React12.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React12.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React12.createElement(Field, { label: "Patient", required: true, className: "fg-2" }, /* @__PURE__ */ React12.createElement(Select, { value: patient2?.id || "", onChange: (e) => setPatient((patients || []).find((p) => p.id === e.target.value) || null) }, /* @__PURE__ */ React12.createElement("option", { value: "" }, "Search patient\u2026"), patients.map((p) => /* @__PURE__ */ React12.createElement("option", { key: p.id, value: p.id }, p.name, " \u2014 ", p.uhid, p.mobile ? ` \xB7 ${p.mobile}` : "")))), /* @__PURE__ */ React12.createElement(Field, { label: "Doctor" }, /* @__PURE__ */ React12.createElement(Select, { value: f.doctor_id || "", onChange: (e) => setF((x) => ({ ...x, doctor_id: e.target.value })) }, (doctors || []).map((d) => /* @__PURE__ */ React12.createElement("option", { key: d.id, value: d.id }, d.name)))), /* @__PURE__ */ React12.createElement(Field, { label: "Date", required: true }, /* @__PURE__ */ React12.createElement(Input, { type: "date", value: f.date || "", onChange: (e) => setF((x) => ({ ...x, date: e.target.value })), min: dkey(/* @__PURE__ */ new Date()) })), /* @__PURE__ */ React12.createElement(Field, { label: "Time", required: true }, /* @__PURE__ */ React12.createElement(Input, { type: "time", value: f.time || "", onChange: (e) => setF((x) => ({ ...x, time: e.target.value })) })), /* @__PURE__ */ React12.createElement(Field, { label: "Reason", className: "fg-2" }, /* @__PURE__ */ React12.createElement(Textarea, { rows: 2, value: f.reason || "", onChange: (e) => setF((x) => ({ ...x, reason: e.target.value })), placeholder: "e.g. Diabetes review" })))
  );
}
function Appointments() {
  const { user: user3, pushToast } = useApp();
  const navigate = useNavigate6();
  const [day, setDay] = useState9(dkey(/* @__PURE__ */ new Date()));
  const [modal, setModal] = useState9(false);
  const [editing, setEditing] = useState9(null);
  const [q, setQ] = useState9("");
  const [statusFilter, setStatusFilter] = useState9("");
  const [cancelTarget, setCancelTarget] = useState9(null);
  const [busyId, setBusyId] = useState9(null);
  const doctors = useLiveQuery6(() => db_default.doctors.toArray(), []);
  const dayAppts = useLiveQuery6(async () => {
    const list = await db_default.appointments.where("date").equals(day).toArray();
    const pmap = new Map((await db_default.patients.toArray()).map((p) => [p.id, p]));
    const needle = q.trim().toLowerCase();
    return list.map((a) => ({ ...a, patient: pmap.get(a.patient_id), doctor: doctors?.find((d) => d.id === a.doctor_id) })).filter((a) => !statusFilter || a.status === statusFilter).filter((a) => !needle || [a.appointment_no, a.uhid, a.reason, a.patient?.name, a.patient?.mobile].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle))).sort((a, b) => a.time.localeCompare(b.time));
  }, [day, q, statusFilter, doctors]);
  const counts = (dayAppts || []).reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});
  const advance = async (a, status) => {
    if (status === "cancelled") {
      setCancelTarget(a);
      return;
    }
    setBusyId(a.id);
    try {
      await setAppointmentStatus(a.id, status, user3.id);
      pushToast("success", `Marked ${NEXT_LABEL[status]}`);
      if (status === "completed") {
        pushToast("info", "Consider creating a consultation & bill for this visit");
      }
    } catch (e) {
      pushToast("error", e.message);
    } finally {
      setBusyId(null);
    }
  };
  const shift = (n) => setDay(dkey(addDays(/* @__PURE__ */ new Date(day + "T00:00:00"), n)));
  const isToday = day === dkey(/* @__PURE__ */ new Date());
  return /* @__PURE__ */ React12.createElement("div", { className: "page" }, /* @__PURE__ */ React12.createElement(
    PageHeader,
    {
      title: "Appointments",
      sub: "Daily patient queue with status tracking",
      actions: /* @__PURE__ */ React12.createElement(Btn, { variant: "accent", icon: UserPlus3, onClick: () => {
        setEditing(null);
        setModal(true);
      } }, "+ Schedule Appointment")
    }
  ), /* @__PURE__ */ React12.createElement("div", { className: "appt-daybar" }, /* @__PURE__ */ React12.createElement(IconBtn, { icon: ChevronLeft2, title: "Previous day", onClick: () => shift(-1) }), /* @__PURE__ */ React12.createElement("input", { type: "date", className: "input appt-date", value: day, onChange: (e) => setDay(e.target.value) }), /* @__PURE__ */ React12.createElement(IconBtn, { icon: ChevronRight3, title: "Next day", onClick: () => shift(1) }), /* @__PURE__ */ React12.createElement(Btn, { variant: "ghost", size: "sm", onClick: () => setDay(dkey(/* @__PURE__ */ new Date())) }, "Today"), /* @__PURE__ */ React12.createElement("span", { className: "appt-daylabel" }, isToday ? "Today" : fmtDate(day, { weekday: "long" }), " \xB7 ", dayAppts?.length ?? 0, " appointment(s)"), /* @__PURE__ */ React12.createElement("div", { className: "appt-counts" }, APPT_STATUSES.map((s) => counts[s] ? /* @__PURE__ */ React12.createElement(Badge, { key: s, tone: s === "completed" ? "green" : s === "cancelled" ? "gray" : s === "in_consultation" ? "navy" : s === "waiting" ? "amber" : "blue" }, NEXT_LABEL[s] || s, ": ", counts[s]) : null))), /* @__PURE__ */ React12.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React12.createElement("div", { className: "toolbar-search" }, /* @__PURE__ */ React12.createElement(Search4, { size: 15 }), /* @__PURE__ */ React12.createElement("input", { className: "input", value: q, onChange: (e) => setQ(e.target.value), placeholder: "Search patient, UHID, mobile or appointment number" })), /* @__PURE__ */ React12.createElement(Select, { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React12.createElement("option", { value: "" }, "All statuses"), APPT_STATUSES.map((status) => /* @__PURE__ */ React12.createElement("option", { key: status, value: status }, status.replace("_", " "))))), /* @__PURE__ */ React12.createElement(Card, null, !dayAppts ? /* @__PURE__ */ React12.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : dayAppts.length === 0 ? /* @__PURE__ */ React12.createElement(EmptyState, { title: "No Appointments Found", message: "No appointments have been scheduled yet.", action: /* @__PURE__ */ React12.createElement(Btn, { size: "sm", variant: "accent", onClick: () => {
    setEditing(null);
    setModal(true);
  } }, "+ Schedule Appointment") }) : /* @__PURE__ */ React12.createElement("div", { className: "queue" }, dayAppts.map((a, i) => /* @__PURE__ */ React12.createElement("div", { key: a.id, className: `queue-item q-${a.status}` }, /* @__PURE__ */ React12.createElement("div", { className: "q-time" }, /* @__PURE__ */ React12.createElement("span", { className: "q-slotslot" }, i + 1), /* @__PURE__ */ React12.createElement("span", { className: "q-t" }, fmtTime(a.time + ":00"))), /* @__PURE__ */ React12.createElement("div", { className: "q-main" }, /* @__PURE__ */ React12.createElement("span", { className: "q-name" }, a.patient?.name || "Unknown", a.status === "scheduled" && /* @__PURE__ */ React12.createElement("span", { className: "q-dot", title: "Scheduled" })), /* @__PURE__ */ React12.createElement("span", { className: "q-sub" }, /* @__PURE__ */ React12.createElement(UhidChip, { uhid: a.uhid, size: "sm" }), a.reason && /* @__PURE__ */ React12.createElement("span", null, "\xB7 ", a.reason), a.doctor && /* @__PURE__ */ React12.createElement("span", null, "\xB7 ", a.doctor.name))), /* @__PURE__ */ React12.createElement(ApptBadge, { status: a.status }), /* @__PURE__ */ React12.createElement("div", { className: "q-actions" }, !["completed", "cancelled", "no_show"].includes(a.status) && /* @__PURE__ */ React12.createElement(Btn, { size: "sm", variant: "ghost", icon: Pencil2, onClick: () => {
    setEditing(a);
    setModal(true);
  } }, "Edit"), (NEXT[a.status] || []).map((s) => /* @__PURE__ */ React12.createElement(Btn, { key: s, size: "sm", variant: s === "cancelled" ? "ghost" : s === "completed" ? "accent" : "outline", disabled: busyId === a.id, onClick: () => advance(a, s) }, NEXT_LABEL[s])), a.status === "completed" && a.patient && /* @__PURE__ */ React12.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => navigate(`/patients/${a.patient.id}`) }, "Open")))))), /* @__PURE__ */ React12.createElement(NewApptModal, { open: modal, editing, onClose: () => {
    setModal(false);
    setEditing(null);
  } }), /* @__PURE__ */ React12.createElement(
    Confirm,
    {
      open: !!cancelTarget,
      onClose: () => setCancelTarget(null),
      title: "Cancel appointment?",
      message: cancelTarget ? `${cancelTarget.patient?.name || ""} \u2014 ${cancelTarget.appointment_no}` : "",
      requireReason: true,
      placeholder: "e.g. Patient rescheduled",
      danger: true,
      confirmText: "Cancel appointment",
      onConfirm: async (reason) => {
        await setAppointmentStatus(cancelTarget.id, "cancelled", user3.id);
        pushToast("success", "Appointment cancelled");
        setCancelTarget(null);
      }
    }
  ));
}
var NEXT, NEXT_LABEL;
var init_Appointments = __esm({
  "src/pages/Appointments.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_clinical();
    init_utils();
    NEXT = {
      scheduled: ["confirmed", "checked_in", "cancelled", "no_show"],
      confirmed: ["checked_in", "cancelled", "no_show"],
      checked_in: ["waiting", "in_consultation", "cancelled"],
      waiting: ["in_consultation", "cancelled"],
      in_consultation: ["completed"],
      completed: [],
      cancelled: []
    };
    NEXT_LABEL = { confirmed: "Confirm", checked_in: "Check In", waiting: "To Waiting", in_consultation: "Start Consultation", completed: "Complete", cancelled: "Cancel", no_show: "No Show" };
  }
});

// src/pages/Prescriptions.jsx
import React13, { useState as useState10, useEffect as useEffect9 } from "react";
import { useNavigate as useNavigate7, useSearchParams as useSearchParams3 } from "react-router-dom";
import { useLiveQuery as useLiveQuery7 } from "dexie-react-hooks";
import { FileText as FileText4, Printer as Printer2, Plus as Plus4, Trash2, CheckCircle2 as CheckCircle25 } from "lucide-react";
function NewPrescriptionModal({ open, onClose, prefillPatient, onDone }) {
  const { user: user3, settings, pushToast } = useApp();
  const patients = useLiveQuery7(async () => (await db_default.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) || [];
  const meds = useLiveQuery7(async () => (await db_default.medicines.where("active").equals(1).toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) || [];
  const doctors = useLiveQuery7(() => db_default.doctors.filter((d) => d.active).toArray(), []) || [];
  const [patient2, setPatient] = useState10(null);
  const [consult, setConsult] = useState10("");
  const [diagnosis, setDiagnosis] = useState10("");
  const [advice, setAdvice] = useState10("");
  const [notes, setNotes] = useState10("");
  const [items, setItems] = useState10([]);
  const [pickMed, setPickMed] = useState10(null);
  const [busy, setBusy] = useState10(false);
  const [err, setErr] = useState10("");
  const consults = useLiveQuery7(async () => {
    if (!patient2) return [];
    const list = await db_default.consultations.where("patient_id").equals(patient2.id).reverse().sortBy("time");
    return list.slice(0, 10);
  }, [patient2]);
  useEffect9(() => {
    if (open) {
      setPatient(prefillPatient || null);
      setConsult("");
      setDiagnosis("");
      setAdvice("");
      setNotes("");
      setItems([]);
      setPickMed(null);
      setErr("");
      if (prefillPatient) {
        db_default.consultations.where("patient_id").equals(prefillPatient.id).reverse().sortBy("time").then((list) => {
          if (list[0]) {
            setConsult(list[0].id);
            setDiagnosis(list[0].diagnosis || "");
            setAdvice(list[0].advice || "");
          }
        });
      }
    }
  }, [open]);
  const addMed = () => {
    if (!pickMed) return;
    if (items.some((i) => i.medicine_id === pickMed.id)) {
      pushToast("warning", "Medicine already in the list");
      return;
    }
    setItems((x) => [...x, { medicine_id: pickMed.id, name: pickMed.name, dosage: "", frequency: "Once daily", duration: "", instruction: "" }]);
    setPickMed(null);
  };
  const setItem = (idx, k, v) => setItems((x) => x.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  const save = async () => {
    setErr("");
    if (!patient2) {
      setErr("Select a patient");
      return;
    }
    if (!items.length) {
      setErr("Add at least one medicine");
      return;
    }
    setBusy(true);
    try {
      const pr = await createPrescription({
        patient_id: patient2.id,
        consultation_id: consult || null,
        doctor_id: doctors?.[0]?.id || null,
        doctor_name: doctors?.[0]?.name || settings.doctor_name,
        diagnosis,
        advice,
        notes,
        items
      }, user3.id);
      pushToast("success", `Prescription ${pr.prescription_no} saved`);
      onDone && onDone(pr, patient2);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React13.createElement(
    Modal,
    {
      open,
      onClose,
      title: "New Prescription",
      width: "lg",
      sub: patient2 ? /* @__PURE__ */ React13.createElement("span", null, patient2.name, " \xB7 ", /* @__PURE__ */ React13.createElement(UhidChip, { uhid: patient2.uhid, size: "sm" }), " \xB7 ", patient2.gender, " ", patient2.dob && `\xB7 DOB ${fmtDate(patient2.dob)}`) : "Select the patient",
      footer: /* @__PURE__ */ React13.createElement(React13.Fragment, null, /* @__PURE__ */ React13.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React13.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Save prescription"))
    },
    err && /* @__PURE__ */ React13.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React13.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React13.createElement(Field, { label: "Patient", required: true, className: "fg-2" }, /* @__PURE__ */ React13.createElement(Select, { value: patient2?.id || "", onChange: (e) => setPatient(patients.find((p) => p.id === e.target.value) || null) }, /* @__PURE__ */ React13.createElement("option", { value: "" }, "Search patient\u2026"), patients.map((p) => /* @__PURE__ */ React13.createElement("option", { key: p.id, value: p.id }, p.name, " \u2014 ", p.uhid)))), /* @__PURE__ */ React13.createElement(Field, { label: "Linked Consultation", hint: "Optional \u2014 prefills diagnosis" }, /* @__PURE__ */ React13.createElement(Select, { value: consult, onChange: (e) => setConsult(e.target.value) }, /* @__PURE__ */ React13.createElement("option", { value: "" }, "None"), (consults || []).map((c) => /* @__PURE__ */ React13.createElement("option", { key: c.id, value: c.id }, c.consultation_no, " \xB7 ", fmtDate(c.time), " \xB7 ", c.diagnosis || c.chief)))), /* @__PURE__ */ React13.createElement(Field, { label: "Diagnosis", className: "fg-2" }, /* @__PURE__ */ React13.createElement(Input, { value: diagnosis, onChange: (e) => setDiagnosis(e.target.value) })), /* @__PURE__ */ React13.createElement(Field, { label: "Advice / Counselling", className: "fg-2" }, /* @__PURE__ */ React13.createElement(Input, { value: advice, onChange: (e) => setAdvice(e.target.value), placeholder: "e.g. Complete full course, avoid driving" }))),
    /* @__PURE__ */ React13.createElement("div", { className: "prx-builder" }, /* @__PURE__ */ React13.createElement("div", { className: "prx-add" }, /* @__PURE__ */ React13.createElement(
      SearchSelect,
      {
        value: pickMed,
        onChange: setPickMed,
        options: meds || [],
        getLabel: (m) => `${m.name}${m.strength ? " (" + m.strength + ")" : ""}`,
        getSearch: (m) => `${m.name} ${m.generic} ${m.barcode}`,
        placeholder: "Search medicine by name, generic or barcode\u2026"
      }
    ), /* @__PURE__ */ React13.createElement(Btn, { variant: "primary", icon: Plus4, onClick: addMed, disabled: !pickMed }, "Add")), !items.length && /* @__PURE__ */ React13.createElement(EmptyState, { compact: true, icon: "\u{1F48A}", title: "No medicines added yet", message: "Search and add medicines above." }), items.map((it, i) => /* @__PURE__ */ React13.createElement("div", { className: "prx-line", key: it.medicine_id }, /* @__PURE__ */ React13.createElement("div", { className: "prx-line-name" }, /* @__PURE__ */ React13.createElement("b", null, i + 1, "."), " ", it.name, /* @__PURE__ */ React13.createElement("button", { type: "button", className: "prx-rm", title: "Remove", onClick: () => setItems((x) => x.filter((_, j) => j !== i)) }, /* @__PURE__ */ React13.createElement(Trash2, { size: 13 }))), /* @__PURE__ */ React13.createElement("div", { className: "prx-line-grid" }, /* @__PURE__ */ React13.createElement(Field, { label: "Dosage" }, /* @__PURE__ */ React13.createElement(Input, { value: it.dosage, onChange: (e) => setItem(i, "dosage", e.target.value), placeholder: "1 tablet" })), /* @__PURE__ */ React13.createElement(Field, { label: "Frequency" }, /* @__PURE__ */ React13.createElement(Select, { value: it.frequency, onChange: (e) => setItem(i, "frequency", e.target.value) }, FREQS.map((fr) => /* @__PURE__ */ React13.createElement("option", { key: fr }, fr)))), /* @__PURE__ */ React13.createElement(Field, { label: "Duration" }, /* @__PURE__ */ React13.createElement(Input, { value: it.duration, onChange: (e) => setItem(i, "duration", e.target.value), placeholder: "5 days" })), /* @__PURE__ */ React13.createElement(Field, { label: "Instructions" }, /* @__PURE__ */ React13.createElement(Input, { value: it.instruction, onChange: (e) => setItem(i, "instruction", e.target.value), placeholder: "After food" }))))), /* @__PURE__ */ React13.createElement(Field, { label: "Additional notes", className: "prx-notes-field" }, /* @__PURE__ */ React13.createElement(Textarea, { rows: 2, value: notes, onChange: (e) => setNotes(e.target.value) })))
  );
}
function Prescriptions() {
  const { settings } = useApp();
  const navigate = useNavigate7();
  const [params, setParams] = useSearchParams3();
  const [modal, setModal] = useState10(false);
  const [pre, setPre] = useState10(null);
  const [done, setDone] = useState10(null);
  const [q, setQ] = useState10("");
  const rows = useLiveQuery7(async () => {
    const list = await db_default.prescriptions.toArray();
    const pmap = new Map((await db_default.patients.toArray()).map((p) => [p.id, p]));
    return list.map((x) => ({ ...x, patient: pmap.get(x.patient_id) })).filter((x) => x.patient).filter((x) => !q || (x.patient.name + " " + x.patient.uhid + " " + x.prescription_no).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.time.localeCompare(a.time));
  }, [q]);
  const withItems = async (x) => {
    const items = await db_default.prescription_items.where("prescription_id").equals(x.id).toArray();
    items.sort((a, b) => a.seq - b.seq);
    return { ...x, items };
  };
  useEffect9(() => {
    if (params.get("new") === "1") {
      const pid2 = params.get("patient");
      db_default.patients.get(pid2).then((p) => {
        setPre(p || null);
        setModal(true);
        params.delete("new");
        params.delete("patient");
        setParams(params, { replace: true });
      });
    }
  }, [params]);
  return /* @__PURE__ */ React13.createElement("div", { className: "page" }, /* @__PURE__ */ React13.createElement(
    PageHeader,
    {
      title: "Prescriptions",
      sub: "Printable prescriptions with clinic letterhead and doctor signature",
      actions: /* @__PURE__ */ React13.createElement(Btn, { variant: "accent", icon: FileText4, onClick: () => {
        setPre(null);
        setModal(true);
      } }, "+ New Prescription")
    }
  ), /* @__PURE__ */ React13.createElement(Card, null, /* @__PURE__ */ React13.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React13.createElement("div", { className: "toolbar-search grow" }, /* @__PURE__ */ React13.createElement("input", { className: "input", placeholder: "Search patient, UHID or prescription no\u2026", value: q, onChange: (e) => setQ(e.target.value) }))), /* @__PURE__ */ React13.createElement(
    DataTable,
    {
      columns: [
        { key: "prescription_no", label: "Prescription #", render: (x) => /* @__PURE__ */ React13.createElement("span", { className: "cell-mono" }, x.prescription_no) },
        { key: "time", label: "Date", sortable: true, sortValue: (x) => x.time, render: (x) => fmtDate(x.time) },
        { key: "patient", label: "Patient", sortable: true, sortValue: (x) => x.patient.name, render: (x) => /* @__PURE__ */ React13.createElement("span", { className: "cell-person" }, /* @__PURE__ */ React13.createElement("span", { className: "cell-main" }, x.patient.name), /* @__PURE__ */ React13.createElement("span", { className: "cell-sub" }, /* @__PURE__ */ React13.createElement(UhidChip, { uhid: x.patient.uhid, size: "sm" }))) },
        { key: "doctor_name", label: "Doctor", render: (x) => x.doctor_name || "\u2014" },
        { key: "diagnosis", label: "Diagnosis", render: (x) => /* @__PURE__ */ React13.createElement("span", { className: "cell-ellip" }, x.diagnosis || "\u2014") },
        { key: "print", label: "", render: async (x) => null, align: "right" }
      ],
      rows,
      pageSize: 12,
      onRow: async (x) => {
        const full = await withItems(x);
        printPrescription({ ...full, settings }, full.patient);
      },
      empty: /* @__PURE__ */ React13.createElement(EmptyState, { icon: "\u{1F4CB}", title: "No prescriptions found", action: /* @__PURE__ */ React13.createElement(Btn, { size: "sm", variant: "accent", onClick: () => setModal(true) }, "Create prescription") }),
      loading: !rows
    }
  )), /* @__PURE__ */ React13.createElement(NewPrescriptionModal, { open: modal, onClose: () => setModal(false), prefillPatient: pre, onDone: (pr, patient2) => {
    setModal(false);
    setDone({ pr, patient: patient2 });
  } }), done && /* @__PURE__ */ React13.createElement(
    Modal,
    {
      open: true,
      onClose: () => setDone(null),
      title: "Prescription saved",
      width: "sm",
      footer: /* @__PURE__ */ React13.createElement(Btn, { variant: "ghost", onClick: () => setDone(null) }, "Close")
    },
    /* @__PURE__ */ React13.createElement("div", { className: "done-panel" }, /* @__PURE__ */ React13.createElement(CheckCircle25, { size: 34, className: "done-ic" }), /* @__PURE__ */ React13.createElement("p", null, /* @__PURE__ */ React13.createElement("b", null, done.pr.prescription_no), " \xB7 ", done.patient.name), /* @__PURE__ */ React13.createElement("div", { className: "done-actions" }, /* @__PURE__ */ React13.createElement(Btn, { size: "sm", variant: "primary", icon: Printer2, onClick: async () => {
      const full = await withItems(done.pr);
      printPrescription({ ...full, settings }, done.patient);
      setDone(null);
    } }, "Print Prescription"), /* @__PURE__ */ React13.createElement(Btn, { size: "sm", variant: "outline", onClick: () => {
      const d = done;
      setDone(null);
      navigate(`/patients/${d.patient.id}`);
    } }, "View Patient")))
  ));
}
var FREQS;
var init_Prescriptions = __esm({
  "src/pages/Prescriptions.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_clinical();
    init_printers();
    init_utils();
    FREQS = ["Once daily", "Twice daily", "Thrice daily", "Four times daily", "Every 6 hours", "Every 8 hours", "At night", "In the morning", "Before food", "After food", "At bedtime", "As needed"];
  }
});

// src/components/BillViewer.jsx
import React14, { useState as useState11 } from "react";
import { Printer as Printer3, CreditCard as CreditCard4, XCircle as XCircle3 } from "lucide-react";
function BillViewer2({ full, onClose, allowCancel = true, allowPayment = true }) {
  const { settings, user: user3, pushToast, can } = useApp();
  const { bill: bill2, items, payments } = full;
  const money2 = (v) => fmtMoney(v, settings.currency);
  const [payOpen, setPayOpen] = useState11(false);
  const [cancelOpen, setCancelOpen] = useState11(false);
  const [method, setMethod] = useState11(settings.default_payment || "Cash");
  const [amount, setAmount] = useState11("");
  const [busy, setBusy] = useState11(false);
  const balance = bill2.total - (bill2.paid || 0);
  const open = bill2.status === "completed";
  const doPay = async () => {
    setBusy(true);
    try {
      await recordPayment(bill2.id, { amount: Number(amount), method }, user3.id);
      pushToast("success", `Payment of ${money2(Number(amount))} recorded`);
      await syncAlerts(user3.id).catch(() => {
      });
      onClose();
    } catch (e) {
      pushToast("error", e.message);
    } finally {
      setBusy(false);
    }
  };
  const doCancel = async (reason) => {
    setBusy(true);
    try {
      await cancelBill(bill2.id, reason, user3.id);
      pushToast("success", "Bill cancelled \u2014 medicine stock restored to original batches");
      setCancelOpen(false);
      await syncAlerts(user3.id).catch(() => {
      });
      onClose();
    } catch (e) {
      pushToast("error", e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React14.createElement(React14.Fragment, null, /* @__PURE__ */ React14.createElement(
    Modal,
    {
      open: true,
      onClose,
      title: /* @__PURE__ */ React14.createElement("span", { className: "cell-mono" }, bill2.bill_no),
      sub: `${bill2.patient_name} \xB7 ${bill2.uhid}`,
      width: "lg",
      footer: /* @__PURE__ */ React14.createElement(React14.Fragment, null, /* @__PURE__ */ React14.createElement(Btn, { variant: "ghost", onClick: onClose }, "Close"), allowPayment && open && balance > 5e-3 && can("payments") && /* @__PURE__ */ React14.createElement(Btn, { variant: "accent", icon: CreditCard4, onClick: () => {
        setAmount(String(balance));
        setPayOpen(true);
      } }, "Record Payment"), allowCancel && open && can("billing") && /* @__PURE__ */ React14.createElement(Btn, { variant: "danger", icon: XCircle3, onClick: () => setCancelOpen(true) }, "Cancel Bill"), /* @__PURE__ */ React14.createElement(Btn, { variant: "primary", icon: Printer3, onClick: () => printInvoiceA4(bill2, items, payments, settings) }, "A4 Payment Receipt"))
    },
    /* @__PURE__ */ React14.createElement("div", { className: "bv-body" }, /* @__PURE__ */ React14.createElement("div", { className: "bv-meta" }, /* @__PURE__ */ React14.createElement(PaymentBadge, { status: bill2.status === "CANCELLED" ? "CANCELLED" : bill2.payment_status }), /* @__PURE__ */ React14.createElement(Badge, { tone: "navy" }, bill2.bill_type), /* @__PURE__ */ React14.createElement("span", null, fmtDateTime(bill2.time)), bill2.cancel_reason && /* @__PURE__ */ React14.createElement(Badge, { tone: "red" }, "Cancelled: ", bill2.cancel_reason)), /* @__PURE__ */ React14.createElement("table", { className: "table bv-table" }, /* @__PURE__ */ React14.createElement("thead", null, /* @__PURE__ */ React14.createElement("tr", null, /* @__PURE__ */ React14.createElement("th", null, "Item"), /* @__PURE__ */ React14.createElement("th", null, "Category"), /* @__PURE__ */ React14.createElement("th", { className: "th-right" }, "Qty"), /* @__PURE__ */ React14.createElement("th", { className: "th-right" }, "Price"), /* @__PURE__ */ React14.createElement("th", { className: "th-right" }, "Amount"))), /* @__PURE__ */ React14.createElement("tbody", null, items.map((it) => /* @__PURE__ */ React14.createElement("tr", { key: it.id }, /* @__PURE__ */ React14.createElement("td", null, it.name, it.batch_no && /* @__PURE__ */ React14.createElement("span", { className: "cell-sub" }, " \xB7 batch ", it.batch_no), it.returned > 0 && /* @__PURE__ */ React14.createElement(Badge, { tone: "amber" }, " ", fmtQty(it.returned), " returned")), /* @__PURE__ */ React14.createElement("td", null, /* @__PURE__ */ React14.createElement(Badge, { tone: it.item_type === "medicine" ? "teal" : it.item_type === "consultation" ? "navy" : "blue" }, it.item_type)), /* @__PURE__ */ React14.createElement("td", { className: "td-right" }, fmtQty(it.qty)), /* @__PURE__ */ React14.createElement("td", { className: "td-right" }, money2(it.price)), /* @__PURE__ */ React14.createElement("td", { className: "td-right" }, money2(it.amount)))))), /* @__PURE__ */ React14.createElement("div", { className: "bv-totals" }, /* @__PURE__ */ React14.createElement("div", { className: "kv" }, /* @__PURE__ */ React14.createElement("span", null, "Subtotal"), /* @__PURE__ */ React14.createElement("b", null, money2(bill2.subtotal))), /* @__PURE__ */ React14.createElement("div", { className: "kv" }, /* @__PURE__ */ React14.createElement("span", null, "Discount"), /* @__PURE__ */ React14.createElement("b", null, "\u2212 ", money2(bill2.discount))), /* @__PURE__ */ React14.createElement("div", { className: "kv kv-total" }, /* @__PURE__ */ React14.createElement("span", null, "Total Amount"), /* @__PURE__ */ React14.createElement("b", null, money2(bill2.total))), /* @__PURE__ */ React14.createElement("div", { className: "kv" }, /* @__PURE__ */ React14.createElement("span", null, "Paid"), /* @__PURE__ */ React14.createElement("b", null, money2(bill2.paid))), /* @__PURE__ */ React14.createElement("div", { className: "kv" }, /* @__PURE__ */ React14.createElement("span", null, "Balance"), /* @__PURE__ */ React14.createElement("b", null, money2(balance)))), payments.length > 0 && /* @__PURE__ */ React14.createElement("div", { className: "bv-pay" }, payments.map((x) => /* @__PURE__ */ React14.createElement("span", { key: x.id, className: "bpay-item" }, /* @__PURE__ */ React14.createElement(Badge, { tone: x.kind === "refund" ? "red" : "green" }, x.kind === "refund" ? "Refund" : x.method), " ", money2(x.amount), " \xB7 ", fmtDate(x.at)))))
  ), /* @__PURE__ */ React14.createElement(
    Modal,
    {
      open: payOpen,
      onClose: () => setPayOpen(false),
      title: "Record payment",
      sub: `${bill2.bill_no} \xB7 balance ${money2(balance)}`,
      width: "sm",
      footer: /* @__PURE__ */ React14.createElement(React14.Fragment, null, /* @__PURE__ */ React14.createElement(Btn, { variant: "ghost", onClick: () => setPayOpen(false) }, "Cancel"), /* @__PURE__ */ React14.createElement(Btn, { variant: "accent", onClick: doPay, disabled: busy || !(Number(amount) > 0) }, busy ? "Saving\u2026" : "Record"))
    },
    /* @__PURE__ */ React14.createElement("div", { className: "stack" }, /* @__PURE__ */ React14.createElement(Field, { label: "Method" }, /* @__PURE__ */ React14.createElement(Select, { value: method, onChange: (e) => setMethod(e.target.value) }, PAY_METHODS.map((m) => /* @__PURE__ */ React14.createElement("option", { key: m }, m)))), /* @__PURE__ */ React14.createElement(Field, { label: `Amount (max ${money2(balance)})` }, /* @__PURE__ */ React14.createElement(Input, { type: "number", min: "0", step: "0.01", value: amount, onChange: (e) => setAmount(e.target.value) })), /* @__PURE__ */ React14.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setAmount(String(balance)) }, "Full balance ", money2(balance)))
  ), /* @__PURE__ */ React14.createElement(
    Confirm,
    {
      open: cancelOpen,
      onClose: () => setCancelOpen(false),
      title: `Cancel bill ${bill2.bill_no}?`,
      message: "Medicine items will be restored to their original batches (FEFO ledger). The bill is never deleted \u2014 it stays as CANCELLED with full audit trail.",
      requireReason: true,
      danger: true,
      confirmText: "Cancel bill",
      busy,
      onConfirm: doCancel
    }
  ));
}
var init_BillViewer = __esm({
  "src/components/BillViewer.jsx"() {
    init_AppContext();
    init_ui();
    init_printers();
    init_billing();
    init_notifications();
    init_utils();
    init_billing();
    init_ui();
  }
});

// src/pages/Billing.jsx
import React15, { useState as useState12, useEffect as useEffect10, useMemo as useMemo6 } from "react";
import { useSearchParams as useSearchParams4, useNavigate as useNavigate8 } from "react-router-dom";
import { useLiveQuery as useLiveQuery8 } from "dexie-react-hooks";
import {
  Pill as Pill3,
  Stethoscope as Stethoscope5,
  Sparkles,
  Trash2 as Trash22,
  Minus,
  Plus as Plus5,
  UserPlus as UserPlus4,
  ReceiptText as ReceiptText5,
  Printer as Printer4,
  CheckCircle2 as CheckCircle26,
  AlertTriangle as AlertTriangle4,
  Search as Search5
} from "lucide-react";
function PaymentModal({ open, onClose, total, onComplete, defaultMethod }) {
  const { pushToast } = useApp();
  const [rows, setRows] = useState12([{ method: defaultMethod || "Cash", amount: "" }]);
  const [busy, setBusy] = useState12(false);
  const [savePending, setSavePending] = useState12(false);
  useEffect10(() => {
    if (open) setRows([{ method: defaultMethod || "Cash", amount: String(total) }]);
  }, [open]);
  const paid = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const remaining = round2(total - paid);
  const setRow = (i, k, v) => setRows((x) => x.map((r, j) => j === i ? { ...r, [k]: v } : r));
  const complete = async () => {
    if (paid > total + 5e-3) {
      pushToast("warning", "Payments exceed bill total \u2014 remove excess");
      return;
    }
    setBusy(true);
    try {
      await onComplete(rows.filter((r) => Number(r.amount) > 0));
    } catch (e) {
      pushToast("error", e.message);
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React15.createElement(
    Modal,
    {
      open,
      onClose,
      title: "Payment",
      sub: `Bill total ${fmtMoney(total)} \xB7 ${paid > 0 ? `collected ${fmtMoney(paid)}` : "no payment yet"}`,
      width: "md",
      footer: /* @__PURE__ */ React15.createElement(React15.Fragment, null, /* @__PURE__ */ React15.createElement(Btn, { variant: "ghost", onClick: onClose }, "Back"), remaining > 5e-3 && /* @__PURE__ */ React15.createElement(Btn, { variant: "outline", disabled: busy, onClick: async () => {
        setBusy(true);
        try {
          await onComplete([]);
        } catch (e) {
          pushToast("error", e.message);
          setBusy(false);
        }
      } }, "Save as Pending"), /* @__PURE__ */ React15.createElement(Btn, { variant: "accent", size: "lg", disabled: busy || paid <= 0, onClick: complete }, busy ? "Completing\u2026" : `Complete \xB7 ${fmtMoney(paid)}`))
    },
    /* @__PURE__ */ React15.createElement("div", { className: "pay-rows" }, rows.map((r, i) => /* @__PURE__ */ React15.createElement("div", { className: "pay-row", key: i }, /* @__PURE__ */ React15.createElement(Select, { value: r.method, onChange: (e) => setRow(i, "method", e.target.value) }, PAY_METHODS.map((m) => /* @__PURE__ */ React15.createElement("option", { key: m }, m))), /* @__PURE__ */ React15.createElement(Input, { type: "number", min: "0", step: "0.01", value: r.amount, onChange: (e) => setRow(i, "amount", e.target.value), placeholder: "Amount" }), /* @__PURE__ */ React15.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setRow(i, "amount", String(Math.max(0, remaining))) }, "Rest"), rows.length > 1 && /* @__PURE__ */ React15.createElement(Btn, { size: "sm", variant: "ghost", icon: Trash22, onClick: () => setRows((x) => x.filter((_, j) => j !== i)), title: "Remove payment" })))),
    /* @__PURE__ */ React15.createElement("div", { className: "pay-summary" }, /* @__PURE__ */ React15.createElement("span", null, "Collected: ", /* @__PURE__ */ React15.createElement("b", null, fmtMoney(paid))), /* @__PURE__ */ React15.createElement("span", null, "Remaining: ", /* @__PURE__ */ React15.createElement("b", { className: remaining > 5e-3 ? "pay-due" : "pay-ok" }, fmtMoney(remaining))), paid < total && /* @__PURE__ */ React15.createElement("span", { className: "pay-status" }, /* @__PURE__ */ React15.createElement(Badge, { tone: "amber" }, "Bill will be marked PARTIALLY PAID"))),
    /* @__PURE__ */ React15.createElement("div", { className: "pay-actions" }, /* @__PURE__ */ React15.createElement(Btn, { size: "sm", variant: "outline", icon: Plus5, onClick: () => setRows((x) => [...x, { method: "Cash", amount: "" }]) }, "Add payment method"), /* @__PURE__ */ React15.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setRows([{ method: defaultMethod || "Cash", amount: String(total) }]) }, "Full amount"))
  );
}
function Billing() {
  const { user: user3, settings, pushToast, can } = useApp();
  const navigate = useNavigate8();
  const [params, setParams] = useSearchParams4();
  const patients = useLiveQuery8(async () => (await db_default.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [patient2, setPatient] = useState12(null);
  const stock = useLiveQuery8(() => stockMap(), []);
  const services = useLiveQuery8(() => db_default.services.where("active").equals(1).toArray(), []);
  const [tab, setTab] = useState12("medicines");
  const [medQ, setMedQ] = useState12("");
  const [cart, setCart] = useState12([]);
  const [discMode, setDiscMode] = useState12("amt");
  const [discVal, setDiscVal] = useState12("");
  const [payOpen, setPayOpen] = useState12(false);
  const [done, setDone] = useState12(null);
  const [viewBill, setViewBill] = useState12(null);
  const [busy, setBusy] = useState12(false);
  const money2 = (v) => fmtMoney(v, settings.currency);
  const cartQty = (medId) => cart.filter((i) => i.item_type === "medicine" && i.ref_id === medId).reduce((s, i) => s + i.qty, 0);
  const addMedicine = (m) => {
    const avail = stock?.get(m.id)?.available || 0;
    const inCart = cartQty(m.id);
    if (inCart + 1 > avail) {
      pushToast("error", `Only ${fmtQty(avail)} of ${m.name} available in stock`);
      return;
    }
    setCart((x) => {
      const found = x.find((i) => i.item_type === "medicine" && i.ref_id === m.id);
      if (found) return x.map((i) => i === found ? { ...i, qty: i.qty + 1 } : i);
      return [...x, { item_type: "medicine", ref_id: m.id, name: m.name, qty: 1, price: m.selling_price, unit: m.unit }];
    });
  };
  const addService = (s, type) => {
    setCart((x) => {
      const found = x.find((i) => i.item_type === type && i.ref_id === s.id);
      if (found) return x.map((i) => i === found ? { ...i, qty: i.qty + 1 } : i);
      return [...x, { item_type: type, ref_id: s.id, name: s.name, qty: 1, price: s.price, unit: "service" }];
    });
  };
  const setQty = (idx, qty) => {
    setCart((x) => x.map((it, i) => {
      if (i !== idx) return it;
      const n = Math.max(0, Math.round(qty));
      if (it.item_type === "medicine") {
        const others = cartQty(it.ref_id) - it.qty;
        const avail = stock?.get(it.ref_id)?.available || 0;
        if (n > avail - others) {
          pushToast("warning", `Max available: ${fmtQty(avail - others)}`);
          return { ...it, qty: Math.max(0, avail - others) };
        }
      }
      return { ...it, qty: n };
    }));
  };
  const setPrice = (idx, price) => setCart((x) => x.map((it, i) => i === idx ? { ...it, price } : it));
  const removeItem = (idx) => setCart((x) => x.filter((_, i) => i !== idx));
  const subtotal = round2(cart.reduce((s, i) => s + i.qty * (Number(i.price) || 0), 0));
  const disc = discMode === "pct" ? round2(subtotal * (Math.min(Number(discVal) || 0, 100) / 100)) : Math.min(Number(discVal) || 0, subtotal);
  const total = round2(Math.max(0, subtotal - disc));
  useEffect10(() => {
    const pid2 = params.get("patient");
    const billId = params.get("bill");
    if (billId) {
      getBill(billId).then((full) => {
        if (full) {
          setViewBill(full);
          setParams({}, { replace: true });
        }
      });
      return;
    }
    if (params.get("new") === "1" && pid2) {
      const p = patients?.find((x) => x.id === pid2);
      if (p) setPatient(p);
      setParams({}, { replace: true });
    }
  }, [params, patients, services]);
  const complete = async (payments) => {
    if (!patient2) throw new Error("Select a patient first");
    if (!cart.length) throw new Error("Bill has no items");
    setBusy(true);
    setPayOpen(false);
    try {
      const { bill: bill2, items } = await createBill({
        patient_id: patient2.id,
        items: cart,
        discount_mode: discMode,
        discount_value: Number(discVal) || 0,
        payments
      }, user3.id);
      pushToast("success", `Bill ${bill2.bill_no} completed \u2014 inventory updated automatically`);
      await syncAlerts(user3.id).catch(() => {
      });
      setDone({ bill: bill2, items });
      setCart([]);
      setDiscVal("");
      setPatient(null);
    } finally {
      setBusy(false);
    }
  };
  const medsList = useMemo6(() => {
    const list = [...stock ? [...stock.values()] : []].filter((e) => e.medicine.active);
    const s = medQ.trim().toLowerCase();
    if (s) {
      const digits2 = s.replace(/\D/g, "");
      return list.filter(
        (e) => e.medicine.name.toLowerCase().includes(s) || (e.medicine.generic || "").toLowerCase().includes(s) || digits2 && (e.medicine.barcode || "").includes(digits2)
      );
    }
    return list.slice(0, 60);
  }, [stock, medQ]);
  const consultationSvcs = (services || []).filter((s) => s.type === "consultation");
  const serviceSvcs = (services || []).filter((s) => s.type === "service");
  if (done) {
    return /* @__PURE__ */ React15.createElement("div", { className: "page" }, /* @__PURE__ */ React15.createElement(PageHeader, { title: "Bill Completed", sub: "Inventory updated \xB7 stock ledger recorded \xB7 receipt ready" }), /* @__PURE__ */ React15.createElement(Card, { className: "bill-done-card" }, /* @__PURE__ */ React15.createElement("div", { className: "done-panel" }, /* @__PURE__ */ React15.createElement(CheckCircle26, { size: 46, className: "done-ic" }), /* @__PURE__ */ React15.createElement("h2", { className: "done-no" }, done.bill.bill_no), /* @__PURE__ */ React15.createElement("p", null, done.bill.patient_name, " \xB7 ", /* @__PURE__ */ React15.createElement(UhidChip, { uhid: done.bill.uhid, size: "sm" })), /* @__PURE__ */ React15.createElement("p", { className: "done-amount" }, "Total ", /* @__PURE__ */ React15.createElement("b", null, money2(done.bill.total)), " \xB7 Paid ", /* @__PURE__ */ React15.createElement("b", null, money2(done.bill.paid)), " ", /* @__PURE__ */ React15.createElement(Badge, { tone: done.bill.payment_status === "PAID" ? "green" : "amber" }, done.bill.payment_status)), /* @__PURE__ */ React15.createElement("div", { className: "done-actions" }, /* @__PURE__ */ React15.createElement(Btn, { variant: "primary", icon: Printer4, onClick: () => printInvoiceA4(done.bill, done.items, [], settings) }, "A4 Payment Receipt"), /* @__PURE__ */ React15.createElement(Btn, { variant: "accent", icon: ReceiptText5, onClick: () => setDone(null) }, "New Bill")), /* @__PURE__ */ React15.createElement("p", { className: "done-note" }, "Tip: full payment history is attached to the bill \u2014 reopen it anytime from the bills list."))));
  }
  return /* @__PURE__ */ React15.createElement("div", { className: "page" }, /* @__PURE__ */ React15.createElement(PageHeader, { title: "Billing", sub: "POS counter \u2014 consultation, services & medicines in one invoice" }), /* @__PURE__ */ React15.createElement("div", { className: "pos-grid" }, /* @__PURE__ */ React15.createElement("div", { className: "pos-left" }, /* @__PURE__ */ React15.createElement(Card, { title: "1 \xB7 Patient", pad: true }, /* @__PURE__ */ React15.createElement("div", { className: "pos-patient-row" }, /* @__PURE__ */ React15.createElement(
    SearchSelect,
    {
      value: patient2,
      onChange: setPatient,
      options: patients || [],
      getLabel: (p) => `${p.name} \u2014 ${p.uhid}${p.mobile ? " \xB7 " + p.mobile : ""}`,
      getSearch: (p) => `${p.name} ${p.uhid} ${p.mobile}`,
      placeholder: "Search by UHID, name or mobile\u2026"
    }
  ), /* @__PURE__ */ React15.createElement(Btn, { variant: "ghost", size: "sm", icon: UserPlus4, onClick: () => navigate("/patients?new=1") }, "New")), patient2 && /* @__PURE__ */ React15.createElement("div", { className: "pos-patient-info" }, /* @__PURE__ */ React15.createElement("span", { className: "ppi-name" }, patient2.name), /* @__PURE__ */ React15.createElement(UhidChip, { uhid: patient2.uhid, size: "sm" }), /* @__PURE__ */ React15.createElement("span", null, patient2.gender, patient2.dob ? ` \xB7 DOB ${fmtDate(patient2.dob)}` : "", patient2.blood_group ? ` \xB7 ${patient2.blood_group}` : ""), patient2.allergies && /* @__PURE__ */ React15.createElement("span", { className: "allergy-warn" }, /* @__PURE__ */ React15.createElement(AlertTriangle4, { size: 13 }), " ", patient2.allergies))), /* @__PURE__ */ React15.createElement(Card, { pad: true, className: "pos-catalog" }, /* @__PURE__ */ React15.createElement("div", { className: "pos-tabs" }, /* @__PURE__ */ React15.createElement("button", { className: `pos-tab ${tab === "medicines" ? "pos-tab-on" : ""}`, onClick: () => setTab("medicines") }, /* @__PURE__ */ React15.createElement(Pill3, { size: 15 }), " Medicines"), /* @__PURE__ */ React15.createElement("button", { className: `pos-tab ${tab === "consultation" ? "pos-tab-on" : ""}`, onClick: () => setTab("consultation") }, /* @__PURE__ */ React15.createElement(Stethoscope5, { size: 15 }), " Consultation"), /* @__PURE__ */ React15.createElement("button", { className: `pos-tab ${tab === "services" ? "pos-tab-on" : ""}`, onClick: () => setTab("services") }, /* @__PURE__ */ React15.createElement(Sparkles, { size: 15 }), " Services")), tab === "medicines" && /* @__PURE__ */ React15.createElement("div", { className: "pos-medlist-wrap" }, /* @__PURE__ */ React15.createElement("div", { className: "pos-medsearch" }, /* @__PURE__ */ React15.createElement(Search5, { size: 14 }), /* @__PURE__ */ React15.createElement(Input, { value: medQ, onChange: (e) => setMedQ(e.target.value), placeholder: "Search medicine or scan barcode\u2026", autoFocus: true })), /* @__PURE__ */ React15.createElement("div", { className: "pos-medlist" }, medsList.length === 0 && /* @__PURE__ */ React15.createElement("div", { className: "pos-none" }, "No medicines match"), medsList.map(({ medicine: m, available, next_expiry }) => {
    const left = available - cartQty(m.id);
    const exp = next_expiry ? daysUntil(next_expiry) : null;
    return /* @__PURE__ */ React15.createElement("button", { key: m.id, className: "pos-med", onClick: () => addMedicine(m), disabled: left <= 0 }, /* @__PURE__ */ React15.createElement("span", { className: "pos-med-name" }, m.name, m.strength && /* @__PURE__ */ React15.createElement("span", { className: "cell-sub" }, " ", m.strength)), /* @__PURE__ */ React15.createElement("span", { className: "pos-med-right" }, /* @__PURE__ */ React15.createElement(Badge, { tone: left <= 0 ? "red" : left <= (m.min_stock || 0) ? "amber" : "green" }, left <= 0 ? "OUT" : `${left} ${m.unit}`), exp != null && exp <= 90 && /* @__PURE__ */ React15.createElement(Badge, { tone: exp <= 30 ? "red" : "amber" }, "exp ", exp, "d"), /* @__PURE__ */ React15.createElement("b", null, money2(m.selling_price))));
  }))), tab === "consultation" && /* @__PURE__ */ React15.createElement("div", { className: "pos-svc-list" }, consultationSvcs.map((s) => /* @__PURE__ */ React15.createElement("button", { key: s.id, className: "pos-svc", onClick: () => addService(s, "consultation") }, /* @__PURE__ */ React15.createElement("span", null, s.name), /* @__PURE__ */ React15.createElement("span", { className: "pos-svc-price" }, money2(s.price))))), tab === "services" && /* @__PURE__ */ React15.createElement("div", { className: "pos-svc-list" }, serviceSvcs.map((s) => /* @__PURE__ */ React15.createElement("button", { key: s.id, className: "pos-svc", onClick: () => addService(s, "service") }, /* @__PURE__ */ React15.createElement("span", null, s.name), /* @__PURE__ */ React15.createElement("span", { className: "pos-svc-price" }, money2(s.price))))))), /* @__PURE__ */ React15.createElement("div", { className: "pos-right" }, /* @__PURE__ */ React15.createElement(Card, { title: "2 \xB7 Bill Items", sub: cart.length ? `${cart.length} line(s)` : "Add consultation, services or medicines", pad: true, className: "pos-cart-card" }, cart.length === 0 ? /* @__PURE__ */ React15.createElement(EmptyState, { compact: true, title: "Bill is empty", message: "Select a patient on the left and add items." }) : /* @__PURE__ */ React15.createElement("div", { className: "cart-lines" }, cart.map((it, i) => /* @__PURE__ */ React15.createElement("div", { className: `cart-line cl-${it.item_type}`, key: `${it.item_type}-${it.ref_id}` }, /* @__PURE__ */ React15.createElement("div", { className: "cl-top" }, /* @__PURE__ */ React15.createElement(Badge, { tone: it.item_type === "medicine" ? "teal" : it.item_type === "consultation" ? "navy" : "blue" }, it.item_type === "consultation" ? "CONSULT" : it.item_type === "service" ? "SERVICE" : "MED"), /* @__PURE__ */ React15.createElement("span", { className: "cl-name" }, it.name), /* @__PURE__ */ React15.createElement("button", { className: "cl-rm", title: "Remove", onClick: () => removeItem(i) }, /* @__PURE__ */ React15.createElement(Trash22, { size: 13 }))), /* @__PURE__ */ React15.createElement("div", { className: "cl-bottom" }, /* @__PURE__ */ React15.createElement("span", { className: "cl-qty" }, /* @__PURE__ */ React15.createElement("button", { onClick: () => setQty(i, it.qty - 1) }, /* @__PURE__ */ React15.createElement(Minus, { size: 12 })), /* @__PURE__ */ React15.createElement("b", null, fmtQty(it.qty)), /* @__PURE__ */ React15.createElement("button", { onClick: () => setQty(i, it.qty + 1) }, /* @__PURE__ */ React15.createElement(Plus5, { size: 12 }))), /* @__PURE__ */ React15.createElement("span", { className: "cl-price" }, "\xD7 ", /* @__PURE__ */ React15.createElement(Input, { className: "cl-price-input", type: "number", min: "0", step: "0.01", value: it.price, onChange: (e) => setPrice(i, e.target.value) })), /* @__PURE__ */ React15.createElement("b", { className: "cl-amt" }, money2(it.qty * (Number(it.price) || 0))))))), /* @__PURE__ */ React15.createElement("div", { className: "cart-totals" }, /* @__PURE__ */ React15.createElement("div", { className: "kv" }, /* @__PURE__ */ React15.createElement("span", null, "Subtotal"), /* @__PURE__ */ React15.createElement("b", null, money2(subtotal))), /* @__PURE__ */ React15.createElement("div", { className: "cart-disc" }, /* @__PURE__ */ React15.createElement("span", { className: "kv-label" }, "Discount"), /* @__PURE__ */ React15.createElement(Seg, { size: "sm", value: discMode, onChange: setDiscMode, options: [{ value: "amt", label: "\u20B9" }, { value: "pct", label: "%" }] }), /* @__PURE__ */ React15.createElement(Input, { className: "cart-disc-input", type: "number", min: "0", value: discVal, onChange: (e) => setDiscVal(e.target.value), placeholder: "0" }), /* @__PURE__ */ React15.createElement("b", null, "\u2212 ", money2(disc))), /* @__PURE__ */ React15.createElement("div", { className: "kv kv-total" }, /* @__PURE__ */ React15.createElement("span", null, "TOTAL AMOUNT"), /* @__PURE__ */ React15.createElement("b", null, money2(total)))), /* @__PURE__ */ React15.createElement("div", { className: "cart-actions" }, /* @__PURE__ */ React15.createElement(
    Btn,
    {
      variant: "accent",
      size: "lg",
      icon: ReceiptText5,
      disabled: !patient2 || !cart.length || busy,
      onClick: () => setPayOpen(true)
    },
    busy ? "Completing\u2026" : `3 \xB7 Take Payment \xB7 ${money2(total)}`
  ))))), /* @__PURE__ */ React15.createElement(
    PaymentModal,
    {
      open: payOpen,
      onClose: () => setPayOpen(false),
      total,
      defaultMethod: settings.default_payment,
      onComplete: complete
    }
  ), viewBill && /* @__PURE__ */ React15.createElement(BillViewer2, { full: viewBill, onClose: () => setViewBill(null) }));
}
var init_Billing = __esm({
  "src/pages/Billing.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_BillViewer();
    init_billing();
    init_inventory();
    init_notifications();
    init_printers();
    init_utils();
    init_core();
  }
});

// src/pages/Payments.jsx
import React16, { useState as useState13 } from "react";
import { useSearchParams as useSearchParams5 } from "react-router-dom";
import { useLiveQuery as useLiveQuery9 } from "dexie-react-hooks";
import { CreditCard as CreditCard5, Plus as Plus6, Printer as Printer5, Download as Download4, Search as Search6 } from "lucide-react";
function PayModal({ bill: bill2, onClose }) {
  const { user: user3, settings, pushToast } = useApp();
  const [method, setMethod] = useState13(settings.default_payment || "Cash");
  const [amount, setAmount] = useState13(String(bill2.balance));
  const [note, setNote] = useState13("");
  const [busy, setBusy] = useState13(false);
  const [err, setErr] = useState13("");
  const money2 = (v) => fmtMoney(v, settings.currency);
  const doPay = async () => {
    setErr("");
    setBusy(true);
    try {
      await recordPayment(bill2.bill.id, { amount: Number(amount), method, note }, user3.id);
      pushToast("success", `Payment of ${money2(Number(amount))} recorded against ${bill2.bill.bill_no}`);
      await syncAlerts(user3.id).catch(() => {
      });
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React16.createElement(
    Modal,
    {
      open: true,
      onClose,
      title: `Record Payment \u2014 ${bill2.bill.bill_no}`,
      width: "sm",
      sub: `${bill2.bill.patient_name} \xB7 balance ${money2(bill2.balance)}`,
      footer: /* @__PURE__ */ React16.createElement(React16.Fragment, null, /* @__PURE__ */ React16.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React16.createElement(Btn, { variant: "accent", onClick: doPay, disabled: busy || !(Number(amount) > 0) }, busy ? "Saving\u2026" : `Record ${money2(Number(amount) || 0)}`))
    },
    err && /* @__PURE__ */ React16.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React16.createElement("div", { className: "stack" }, /* @__PURE__ */ React16.createElement(Field, { label: "Payment Method", required: true }, /* @__PURE__ */ React16.createElement(Select, { value: method, onChange: (e) => setMethod(e.target.value) }, PAY_METHODS.map((m) => /* @__PURE__ */ React16.createElement("option", { key: m }, m)))), /* @__PURE__ */ React16.createElement(Field, { label: `Amount (max ${money2(bill2.balance)})`, required: true }, /* @__PURE__ */ React16.createElement(Input, { type: "number", min: "0", max: bill2.balance, step: "0.01", value: amount, onChange: (e) => setAmount(e.target.value) })), /* @__PURE__ */ React16.createElement("div", { className: "pay-actions" }, /* @__PURE__ */ React16.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setAmount(String(bill2.balance)) }, "Full balance"), /* @__PURE__ */ React16.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setAmount(String(Math.round(bill2.balance / 2 * 100) / 100)) }, "Half"), /* @__PURE__ */ React16.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setAmount("") }, "Custom\u2026")), /* @__PURE__ */ React16.createElement(Field, { label: "Note (optional)" }, /* @__PURE__ */ React16.createElement(Input, { value: note, onChange: (e) => setNote(e.target.value), placeholder: "e.g. received at counter" })))
  );
}
function Payments() {
  const { settings, pushToast, user: user3 } = useApp();
  const [params] = useSearchParams5();
  const [statusF, setStatusF] = useState13("open");
  const [q, setQ] = useState13("");
  const [from, setFrom] = useState13(dkey(addDays(/* @__PURE__ */ new Date(), -29)));
  const [to, setTo] = useState13(dkey(/* @__PURE__ */ new Date()));
  const [payTarget, setPayTarget] = useState13(null);
  const [viewBill, setViewBill] = useState13(null);
  const [methodH, setMethodH] = useState13("");
  const money2 = (v) => fmtMoney(v, settings.currency);
  const bills = useLiveQuery9(async () => {
    const all = await db_default.bills.where("status").equals("completed").toArray();
    let list = all.filter((b) => b.date >= from && b.date <= to);
    const s = q.trim().toLowerCase();
    const sDigits = s.replace(/\D/g, "");
    if (s) list = list.filter(
      (b) => b.bill_no.toLowerCase().includes(s) || b.patient_name.toLowerCase().includes(s) || b.uhid.toLowerCase().includes(s) || sDigits && b.uhid.includes(sDigits)
    );
    if (statusF === "pending") list = list.filter((b) => b.payment_status === "PENDING");
    else if (statusF === "partial") list = list.filter((b) => b.payment_status === "PARTIAL");
    else if (statusF === "paid") list = list.filter((b) => b.payment_status === "PAID");
    else list = list.filter((b) => b.payment_status !== "PAID");
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }, [statusF, q, from, to]);
  const outstanding = useLiveQuery9(async () => {
    const all = await db_default.bills.where("status").equals("completed").toArray();
    const open = all.filter((b) => b.payment_status !== "PAID");
    return {
      count: open.length,
      amount: open.reduce((s, b) => s + (b.total - (b.paid || 0)), 0),
      pending: open.filter((b) => b.payment_status === "PENDING").length,
      partial: open.filter((b) => b.payment_status === "PARTIAL").length
    };
  }, []);
  const history = useLiveQuery9(async () => {
    const all = await db_default.payments.orderBy("at").reverse().toArray();
    const billsMap = new Map((await db_default.bills.toArray()).map((b) => [b.id, b]));
    let list = all.map((p) => ({ ...p, bill: billsMap.get(p.bill_id) || null }));
    if (methodH) list = list.filter((p) => p.method === methodH);
    return list.slice(0, 200);
  }, [methodH]);
  React16.useEffect(() => {
    const id = params.get("bill");
    if (id) getBill(id).then((full) => {
      if (full) setViewBill(full);
    });
  }, [params]);
  const exportCSV = () => {
    download(`heeva-payments-${from}-${to}.csv`, toCSV(
      ["Bill No", "Date", "Patient", "UHID", "Total", "Paid", "Balance", "Status"],
      (bills || []).map((b) => [b.bill_no, b.date, b.patient_name, b.uhid, b.total, b.paid || 0, b.total - (b.paid || 0), b.payment_status])
    ), "text/csv");
  };
  return /* @__PURE__ */ React16.createElement("div", { className: "page" }, /* @__PURE__ */ React16.createElement(
    PageHeader,
    {
      title: "Payments",
      sub: `Outstanding: ${money2(outstanding?.amount || 0)} across ${outstanding?.count ?? "\u2026"} open bill(s) \xB7 ${outstanding?.pending ?? 0} pending \xB7 ${outstanding?.partial ?? 0} partial`,
      actions: /* @__PURE__ */ React16.createElement(Btn, { variant: "ghost", icon: Download4, onClick: exportCSV }, "Export CSV")
    }
  ), /* @__PURE__ */ React16.createElement(Card, null, /* @__PURE__ */ React16.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React16.createElement(Select, { value: statusF, onChange: (e) => setStatusF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React16.createElement("option", { value: "open" }, "Open (Pending + Partial)"), /* @__PURE__ */ React16.createElement("option", { value: "pending" }, "Pending only"), /* @__PURE__ */ React16.createElement("option", { value: "partial" }, "Partial only"), /* @__PURE__ */ React16.createElement("option", { value: "paid" }, "Paid"), /* @__PURE__ */ React16.createElement("option", { value: "all" }, "All")), /* @__PURE__ */ React16.createElement("div", { className: "toolbar-search" }, /* @__PURE__ */ React16.createElement(Search6, { size: 15 }), /* @__PURE__ */ React16.createElement(Input, { value: q, onChange: (e) => setQ(e.target.value), placeholder: "Bill #, patient, UHID\u2026" })), /* @__PURE__ */ React16.createElement(Input, { type: "date", className: "toolbar-date", value: from, onChange: (e) => setFrom(e.target.value) }), /* @__PURE__ */ React16.createElement("span", { className: "range-dash" }, "\u2192"), /* @__PURE__ */ React16.createElement(Input, { type: "date", className: "toolbar-date", value: to, onChange: (e) => setTo(e.target.value) })), /* @__PURE__ */ React16.createElement(
    DataTable,
    {
      columns: [
        { key: "bill_no", label: "Bill #", render: (b) => /* @__PURE__ */ React16.createElement("span", { className: "cell-mono" }, b.bill_no) },
        {
          key: "patient_name",
          label: "Patient",
          sortable: true,
          render: (b) => /* @__PURE__ */ React16.createElement("span", { className: "cell-person" }, /* @__PURE__ */ React16.createElement("span", null, /* @__PURE__ */ React16.createElement("span", { className: "cell-main" }, b.patient_name), " ", /* @__PURE__ */ React16.createElement(UhidChip, { uhid: b.uhid, size: "sm" })))
        },
        { key: "date", label: "Date", sortable: true, render: (b) => fmtDate(b.date) },
        { key: "total", label: "Total", align: "right", sortable: true, render: (b) => money2(b.total) },
        { key: "paid", label: "Paid", align: "right", render: (b) => money2(b.paid || 0) },
        {
          key: "balance",
          label: "Balance",
          align: "right",
          sortable: true,
          sortValue: (b) => b.total - (b.paid || 0),
          render: (b) => {
            const bal = b.total - (b.paid || 0);
            return bal > 5e-3 ? /* @__PURE__ */ React16.createElement("b", { className: "val-red" }, money2(bal)) : /* @__PURE__ */ React16.createElement("span", { className: "val-green" }, "\u2014");
          }
        },
        { key: "payment_status", label: "Status", render: (b) => /* @__PURE__ */ React16.createElement(PaymentBadge, { status: b.payment_status }) },
        {
          key: "actions",
          label: "",
          align: "right",
          render: (b) => /* @__PURE__ */ React16.createElement("span", { className: "cell-actions", onClick: (e) => e.stopPropagation() }, b.payment_status !== "PAID" && /* @__PURE__ */ React16.createElement(Btn, { size: "sm", variant: "accent", icon: Plus6, onClick: async () => {
            const full = await getBill(b.id);
            if (full) setPayTarget({ bill: full.bill, balance: full.bill.total - (full.bill.paid || 0) });
          } }, "Payment"), /* @__PURE__ */ React16.createElement(Btn, { size: "sm", variant: "ghost", icon: Printer5, onClick: async () => {
            const full = await getBill(b.id);
            if (full) setViewBill(full);
          } }, "View"))
        }
      ],
      rows: bills,
      pageSize: 12,
      empty: /* @__PURE__ */ React16.createElement(EmptyState, { icon: "\u{1F4B3}", title: "No bills match", message: "Adjust filters or date range." }),
      loading: !bills
    }
  )), /* @__PURE__ */ React16.createElement(Card, { title: "Payment History", sub: "Every collection and refund \u2014 financial records are never deleted" }, /* @__PURE__ */ React16.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React16.createElement(Select, { value: methodH, onChange: (e) => setMethodH(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React16.createElement("option", { value: "" }, "All methods"), PAY_METHODS.map((m) => /* @__PURE__ */ React16.createElement("option", { key: m }, m)))), /* @__PURE__ */ React16.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "at", label: "When", sortable: true, render: (p) => /* @__PURE__ */ React16.createElement("span", { className: "cell-sub" }, fmtDateTime(p.at)) },
        { key: "bill_no", label: "Bill #", sortValue: (p) => p.bill?.bill_no || "", render: (p) => /* @__PURE__ */ React16.createElement("span", { className: "cell-mono" }, p.bill?.bill_no || "\u2014") },
        { key: "patient_name", label: "Patient", sortValue: (p) => p.bill?.patient_name || "", render: (p) => p.bill?.patient_name || "\u2014" },
        { key: "method", label: "Method", render: (p) => /* @__PURE__ */ React16.createElement(Badge, { tone: "navy" }, p.method) },
        {
          key: "kind",
          label: "Type",
          render: (p) => p.kind === "refund" ? /* @__PURE__ */ React16.createElement(Badge, { tone: "red" }, "Refund") : /* @__PURE__ */ React16.createElement(Badge, { tone: "green" }, "Payment")
        },
        { key: "amount", label: "Amount", align: "right", sortable: true, render: (p) => /* @__PURE__ */ React16.createElement("b", { className: p.kind === "refund" ? "val-red" : "val-green" }, p.kind === "refund" ? "\u2212 " : "", money2(p.amount)) },
        { key: "note", label: "Note", render: (p) => /* @__PURE__ */ React16.createElement("span", { className: "cell-ellip", title: p.note }, p.note || "\u2014") }
      ],
      rows: history,
      pageSize: 12,
      empty: /* @__PURE__ */ React16.createElement(EmptyState, { title: "No payments recorded yet" }),
      loading: !history
    }
  )), payTarget && /* @__PURE__ */ React16.createElement(PayModal, { bill: payTarget, onClose: () => setPayTarget(null) }), viewBill && /* @__PURE__ */ React16.createElement(BillViewer2, { full: viewBill, onClose: () => setViewBill(null), allowPayment: false }));
}
var init_Payments = __esm({
  "src/pages/Payments.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_BillViewer();
    init_billing();
    init_notifications();
    init_utils();
  }
});

// src/pages/Medicines.jsx
import React17, { useState as useState14, useEffect as useEffect11 } from "react";
import { useSearchParams as useSearchParams6 } from "react-router-dom";
import { useLiveQuery as useLiveQuery10 } from "dexie-react-hooks";
import { Pill as Pill4, Plus as Plus7, Archive, Download as Download5, Upload as Upload3, Pencil as Pencil3, Search as Search7, Trash2 as Trash23, FolderPlus, Tag } from "lucide-react";
function MedFormModal({ open, onClose, editing }) {
  const { user: user3, pushToast, settings } = useApp();
  const cats = useLiveQuery10(() => categoryList(), []);
  const [f, setF] = useState14(EMPTY);
  const [busy, setBusy] = useState14(false);
  const [err, setErr] = useState14("");
  useEffect11(() => {
    if (open) {
      setF(editing ? {
        name: editing.name,
        generic: editing.generic,
        category: editing.category,
        manufacturer: editing.manufacturer,
        type: editing.type,
        strength: editing.strength,
        unit: editing.unit,
        barcode: editing.barcode,
        purchase_price: String(editing.purchase_price ?? ""),
        selling_price: String(editing.selling_price ?? ""),
        min_stock: String(editing.min_stock ?? ""),
        location: editing.location,
        description: editing.description
      } : EMPTY);
      setErr("");
    }
  }, [open, editing]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    setErr("");
    if (!f.name.trim()) {
      setErr("Medicine name is required");
      return;
    }
    if (!f.selling_price || Number(f.selling_price) < 0) {
      setErr("Valid selling price is required");
      return;
    }
    setBusy(true);
    try {
      const data = {
        ...f,
        purchase_price: Number(f.purchase_price) || 0,
        selling_price: Number(f.selling_price) || 0,
        min_stock: Number(f.min_stock) || 0
      };
      if (editing) {
        await updateMedicine(editing.id, data, user3.id);
        pushToast("success", `${f.name} updated`);
      } else {
        await createMedicine2(data, user3.id);
        pushToast("success", `${f.name} added to the medicine master`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React17.createElement(
    Modal,
    {
      open,
      onClose,
      title: editing ? `Edit ${editing.name}` : "Add Medicine",
      width: "lg",
      footer: /* @__PURE__ */ React17.createElement(React17.Fragment, null, /* @__PURE__ */ React17.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React17.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : editing ? "Save changes" : "Add medicine"))
    },
    err && /* @__PURE__ */ React17.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React17.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React17.createElement(Field, { label: "Medicine Name (Brand)", required: true, className: "fg-2" }, /* @__PURE__ */ React17.createElement(Input, { value: f.name, onChange: set("name"), placeholder: "e.g. Dolo 650" })), /* @__PURE__ */ React17.createElement(Field, { label: "Generic Name", className: "fg-2" }, /* @__PURE__ */ React17.createElement(Input, { value: f.generic, onChange: set("generic"), placeholder: "e.g. Paracetamol 650mg" })), /* @__PURE__ */ React17.createElement(Field, { label: "Category" }, /* @__PURE__ */ React17.createElement(Select, { value: f.category || "", onChange: set("category") }, /* @__PURE__ */ React17.createElement("option", { value: "" }, "Select category\u2026"), (cats || []).map((c) => /* @__PURE__ */ React17.createElement("option", { key: c.id, value: c.name }, c.name)))), /* @__PURE__ */ React17.createElement(Field, { label: "Type" }, /* @__PURE__ */ React17.createElement(Select, { value: f.type, onChange: set("type") }, MEDICINE_TYPES.map((t) => /* @__PURE__ */ React17.createElement("option", { key: t }, t)))), /* @__PURE__ */ React17.createElement(Field, { label: "Strength" }, /* @__PURE__ */ React17.createElement(Input, { value: f.strength, onChange: set("strength"), placeholder: "e.g. 650 mg" })), /* @__PURE__ */ React17.createElement(Field, { label: "Unit" }, /* @__PURE__ */ React17.createElement(Input, { value: f.unit, onChange: set("unit"), placeholder: "strip / bottle / vial" })), /* @__PURE__ */ React17.createElement(Field, { label: "Manufacturer", className: "fg-2" }, /* @__PURE__ */ React17.createElement(Input, { value: f.manufacturer, onChange: set("manufacturer") })), /* @__PURE__ */ React17.createElement(Field, { label: "Barcode" }, /* @__PURE__ */ React17.createElement(Input, { value: f.barcode, onChange: set("barcode") })), /* @__PURE__ */ React17.createElement(Field, { label: "Purchase Price (\u20B9)" }, /* @__PURE__ */ React17.createElement(Input, { type: "number", min: "0", step: "0.01", value: f.purchase_price, onChange: set("purchase_price") })), /* @__PURE__ */ React17.createElement(Field, { label: "Selling Price (\u20B9)", required: true }, /* @__PURE__ */ React17.createElement(Input, { type: "number", min: "0", step: "0.01", value: f.selling_price, onChange: set("selling_price") })), /* @__PURE__ */ React17.createElement(Field, { label: "Minimum Stock Level", hint: `Default: ${settings.low_stock_default}` }, /* @__PURE__ */ React17.createElement(Input, { type: "number", min: "0", value: f.min_stock, onChange: set("min_stock") })), /* @__PURE__ */ React17.createElement(Field, { label: "Storage Location" }, /* @__PURE__ */ React17.createElement(Input, { value: f.location, onChange: set("location"), placeholder: "e.g. Shelf A-2 / Fridge" })), /* @__PURE__ */ React17.createElement(Field, { label: "Description", className: "fg-2" }, /* @__PURE__ */ React17.createElement(Textarea, { rows: 2, value: f.description, onChange: set("description") })))
  );
}
function CategoryModal({ open, onClose, editing }) {
  const { user: user3, pushToast } = useApp();
  const [name, setName] = useState14("");
  const [busy, setBusy] = useState14(false);
  const [err, setErr] = useState14("");
  useEffect11(() => {
    if (open) {
      setName(editing ? editing.name : "");
      setErr("");
    }
  }, [open, editing]);
  const save = async () => {
    setErr("");
    if (!name.trim()) {
      setErr("Category name is required");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateCategory(editing.id, name, user3.id);
        pushToast("success", `Category renamed to ${name.trim()}`);
      } else {
        await createCategory(name, user3.id);
        pushToast("success", `Category ${name.trim()} added`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React17.createElement(
    Modal,
    {
      open,
      onClose,
      title: editing ? `Edit Category` : "Add Medicine Category",
      width: "sm",
      footer: /* @__PURE__ */ React17.createElement(React17.Fragment, null, /* @__PURE__ */ React17.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React17.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Save Category"))
    },
    err && /* @__PURE__ */ React17.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React17.createElement(Field, { label: "Category Name", required: true }, /* @__PURE__ */ React17.createElement(Input, { value: name, onChange: (e) => setName(e.target.value), placeholder: "e.g. Antibiotics", autoFocus: true }))
  );
}
function Medicines() {
  const { user: user3, settings, pushToast } = useApp();
  const [params] = useSearchParams6();
  const [activeTab, setActiveTab] = useState14("medicines");
  const [q, setQ] = useState14(params.get("q") || "");
  const [catF, setCatF] = useState14("");
  const [typeF, setTypeF] = useState14("");
  const [statusF, setStatusF] = useState14("active");
  const [formOpen, setFormOpen] = useState14(params.get("new") === "1");
  const [editing, setEditing] = useState14(null);
  const [archiveTarget, setArchiveTarget] = useState14(null);
  const [deleteTarget, setDeleteTarget] = useState14(null);
  const [importOpen, setImportOpen] = useState14(false);
  const [importCatOpen, setImportCatOpen] = useState14(false);
  const [catModalOpen, setCatModalOpen] = useState14(false);
  const [editingCat, setEditingCat] = useState14(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState14(null);
  const cats = useLiveQuery10(() => categoryList(), []);
  const stock = useLiveQuery10(() => stockMap(), []);
  const catUsage = useLiveQuery10(async () => {
    const meds = await db_default.medicines.toArray();
    const map = /* @__PURE__ */ new Map();
    for (const m of meds) {
      if (m.category) map.set(m.category, (map.get(m.category) || 0) + 1);
    }
    return map;
  }, []);
  const rows = useLiveQuery10(async () => {
    const all = await db_default.medicines.toArray();
    let list = all.map((m) => {
      const s2 = stock?.get(m.id);
      return { ...m, available: s2?.available ?? 0, total: s2?.total ?? 0, next_expiry: s2?.next_expiry || null };
    });
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter(
        (m) => (m.name || "").toLowerCase().includes(s) || (m.generic || "").toLowerCase().includes(s) || (m.barcode || "").includes(s) || (m.medicine_code || "").toLowerCase().includes(s)
      );
    }
    if (catF) list = list.filter((m) => m.category === catF);
    if (typeF) list = list.filter((m) => m.type === typeF);
    if (statusF === "active") list = list.filter((m) => m.active);
    else if (statusF === "archived") list = list.filter((m) => !m.active);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [q, catF, typeF, statusF, stock]);
  const exportCSV = () => {
    const list = rows || [];
    download(`heeva-medicines-${dkey()}.csv`, toCSV(
      ["Code", "Name", "Generic", "Category", "Type", "Strength", "Unit", "Buy Price", "Sell Price", "Min Stock", "Available", "Barcode", "Active"],
      list.map((m) => [m.medicine_code, m.name, m.generic, m.category, m.type, m.strength, m.unit, m.purchase_price, m.selling_price, m.min_stock, m.available, m.barcode, m.active ? "yes" : "no"])
    ), "text/csv");
  };
  return /* @__PURE__ */ React17.createElement("div", { className: "page" }, /* @__PURE__ */ React17.createElement(
    PageHeader,
    {
      title: "Medicines & Pharmacy",
      sub: "Master list of pharmaceutical products, pricing, stock thresholds & categories",
      actions: /* @__PURE__ */ React17.createElement(React17.Fragment, null, activeTab === "medicines" && /* @__PURE__ */ React17.createElement(React17.Fragment, null, /* @__PURE__ */ React17.createElement(Btn, { variant: "ghost", icon: Upload3, onClick: () => setImportOpen(true) }, "Import CSV"), /* @__PURE__ */ React17.createElement(Btn, { variant: "ghost", icon: Download5, onClick: exportCSV }, "Export"), /* @__PURE__ */ React17.createElement(Btn, { variant: "accent", icon: Plus7, onClick: () => {
        setEditing(null);
        setFormOpen(true);
      } }, "+ Add Medicine")), activeTab === "categories" && /* @__PURE__ */ React17.createElement("div", { style: { display: "flex", gap: "8px" } }, /* @__PURE__ */ React17.createElement(Btn, { variant: "ghost", icon: Upload3, onClick: () => setImportCatOpen(true) }, "Import CSV"), /* @__PURE__ */ React17.createElement(Btn, { variant: "accent", icon: Plus7, onClick: () => {
        setEditingCat(null);
        setCatModalOpen(true);
      } }, "+ Add Category")))
    }
  ), /* @__PURE__ */ React17.createElement(
    Tabs,
    {
      active: activeTab,
      onChange: setActiveTab,
      tabs: [
        { key: "medicines", label: "Medicines Master", badge: rows?.length },
        { key: "categories", label: "Medicine Categories", badge: cats?.length }
      ]
    }
  ), activeTab === "medicines" && /* @__PURE__ */ React17.createElement(Card, null, /* @__PURE__ */ React17.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React17.createElement("div", { className: "toolbar-search grow" }, /* @__PURE__ */ React17.createElement(Search7, { size: 15 }), /* @__PURE__ */ React17.createElement("input", { className: "input", placeholder: "Search name, generic, barcode or code\u2026", value: q, onChange: (e) => setQ(e.target.value) })), /* @__PURE__ */ React17.createElement(Select, { value: catF, onChange: (e) => setCatF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React17.createElement("option", { value: "" }, "All categories"), (cats || []).map((c) => /* @__PURE__ */ React17.createElement("option", { key: c.id, value: c.name }, c.name))), /* @__PURE__ */ React17.createElement(Select, { value: typeF, onChange: (e) => setTypeF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React17.createElement("option", { value: "" }, "All types"), MEDICINE_TYPES.map((t) => /* @__PURE__ */ React17.createElement("option", { key: t }, t))), /* @__PURE__ */ React17.createElement(Select, { value: statusF, onChange: (e) => setStatusF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React17.createElement("option", { value: "active" }, "Active"), /* @__PURE__ */ React17.createElement("option", { value: "archived" }, "Archived"), /* @__PURE__ */ React17.createElement("option", { value: "all" }, "All"))), /* @__PURE__ */ React17.createElement(
    DataTable,
    {
      columns: [
        { key: "medicine_code", label: "Code", render: (m) => /* @__PURE__ */ React17.createElement("span", { className: "cell-mono" }, m.medicine_code) },
        { key: "name", label: "Medicine", sortable: true, render: (m) => /* @__PURE__ */ React17.createElement("span", { className: "cell-person" }, /* @__PURE__ */ React17.createElement("span", { className: "cell-main" }, m.name, " ", !m.active && /* @__PURE__ */ React17.createElement(Badge, { tone: "gray" }, "Archived")), /* @__PURE__ */ React17.createElement("span", { className: "cell-sub" }, m.generic || "\u2014", m.strength ? ` \xB7 ${m.strength}` : "")) },
        { key: "category", label: "Category", sortable: true, render: (m) => m.category || "\u2014" },
        { key: "type", label: "Type" },
        { key: "selling_price", label: "Sell Price", align: "right", sortable: true, render: (m) => fmtMoney(m.selling_price, settings.currency) },
        {
          key: "available",
          label: "Stock",
          align: "right",
          sortable: true,
          render: (m) => {
            const min = m.min_stock || Number(settings.low_stock_default) || 0;
            const tone = m.available <= 0 ? "red" : m.available <= min ? "amber" : "green";
            return /* @__PURE__ */ React17.createElement(Badge, { tone: m.active ? tone : "gray" }, m.active ? `${fmtQty(m.available)} ${m.unit || ""}` : "archived");
          }
        },
        {
          key: "next_expiry",
          label: "Next Expiry",
          render: (m) => {
            if (!m.active) return "\u2014";
            if (!m.next_expiry) return /* @__PURE__ */ React17.createElement(Badge, { tone: "red" }, "No batches");
            const d = daysUntil(m.next_expiry);
            return /* @__PURE__ */ React17.createElement("span", null, m.next_expiry, " ", d <= 90 && /* @__PURE__ */ React17.createElement(Badge, { tone: d < 0 ? "red" : d <= 30 ? "red" : "amber" }, d < 0 ? "expired" : `${d}d`));
          }
        },
        {
          key: "actions",
          label: "",
          align: "right",
          render: (m) => /* @__PURE__ */ React17.createElement("span", { className: "cell-actions", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "ghost", icon: Pencil3, onClick: () => {
            setEditing(m);
            setFormOpen(true);
          } }, "Edit"), m.active ? /* @__PURE__ */ React17.createElement(React17.Fragment, null, /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "ghost", icon: Archive, onClick: () => setArchiveTarget(m) }, "Archive"), /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "ghost", icon: Trash23, onClick: () => setDeleteTarget(m) }, "Delete")) : /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "ghost", onClick: async () => {
            await updateMedicine(m.id, { active: 1 }, user3.id);
            pushToast("success", "Medicine reactivated");
          } }, "Restore"))
        }
      ],
      rows,
      pageSize: 12,
      onRow: (m) => {
        setEditing(m);
        setFormOpen(true);
      },
      empty: /* @__PURE__ */ React17.createElement(EmptyState, { title: "No Medicines Found", message: "Add medicines to start managing your clinic inventory.", action: /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "accent", onClick: () => {
        setEditing(null);
        setFormOpen(true);
      } }, "+ Add Medicine") }),
      loading: !rows
    }
  )), activeTab === "categories" && /* @__PURE__ */ React17.createElement(Card, { title: "Medicine Categories", sub: "Organize medicines by pharmacological or therapeutic classification" }, /* @__PURE__ */ React17.createElement(
    DataTable,
    {
      columns: [
        { key: "name", label: "Category Name", sortable: true, render: (c) => /* @__PURE__ */ React17.createElement("b", null, c.name) },
        {
          key: "count",
          label: "Connected Medicines",
          align: "right",
          render: (c) => {
            const count = catUsage?.get(c.name) || 0;
            return /* @__PURE__ */ React17.createElement(Badge, { tone: count > 0 ? "teal" : "gray" }, count, " medicine(s)");
          }
        },
        {
          key: "actions",
          label: "",
          align: "right",
          render: (c) => /* @__PURE__ */ React17.createElement("span", { className: "cell-actions" }, /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "ghost", icon: Pencil3, onClick: () => {
            setEditingCat(c);
            setCatModalOpen(true);
          } }, "Edit"), /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "ghost", icon: Trash23, onClick: () => setDeleteCatTarget(c) }, "Delete"))
        }
      ],
      rows: cats,
      pageSize: 12,
      empty: /* @__PURE__ */ React17.createElement(EmptyState, { title: "No categories", action: /* @__PURE__ */ React17.createElement(Btn, { size: "sm", variant: "accent", onClick: () => {
        setEditingCat(null);
        setCatModalOpen(true);
      } }, "+ Add Category") }),
      loading: !cats
    }
  )), /* @__PURE__ */ React17.createElement(MedFormModal, { open: formOpen, onClose: () => {
    setFormOpen(false);
    setEditing(null);
  }, editing }), /* @__PURE__ */ React17.createElement(CategoryModal, { open: catModalOpen, onClose: () => {
    setCatModalOpen(false);
    setEditingCat(null);
  }, editing: editingCat }), /* @__PURE__ */ React17.createElement(
    Confirm,
    {
      open: !!archiveTarget,
      onClose: () => setArchiveTarget(null),
      title: `Archive ${archiveTarget?.name}?`,
      message: "Archived medicines cannot be billed, but all history (stock, bills, transactions) is preserved. You can restore them anytime.",
      danger: true,
      confirmText: "Archive medicine",
      onConfirm: async () => {
        await archiveMedicine(archiveTarget.id, user3.id);
        pushToast("success", `${archiveTarget.name} archived`);
        setArchiveTarget(null);
      }
    }
  ), /* @__PURE__ */ React17.createElement(
    Confirm,
    {
      open: !!deleteTarget,
      onClose: () => setDeleteTarget(null),
      title: `Delete ${deleteTarget?.name}?`,
      message: "This permanently removes an unused medicine. Medicines with stock, bills or prescriptions cannot be deleted and must be archived.",
      danger: true,
      confirmText: "Delete medicine",
      onConfirm: async () => {
        try {
          await deleteMedicine(deleteTarget.id, user3.id);
          pushToast("success", `${deleteTarget.name} deleted`);
          setDeleteTarget(null);
        } catch (e) {
          pushToast("error", e.message);
        }
      }
    }
  ), /* @__PURE__ */ React17.createElement(
    Confirm,
    {
      open: !!deleteCatTarget,
      onClose: () => setDeleteCatTarget(null),
      title: `Delete category ${deleteCatTarget?.name}?`,
      message: "Before deletion, the system will verify whether existing medicines are connected to this category.",
      danger: true,
      confirmText: "Delete category",
      onConfirm: async () => {
        try {
          await deleteCategory(deleteCatTarget.id, user3.id);
          pushToast("success", `Category ${deleteCatTarget.name} deleted`);
          setDeleteCatTarget(null);
        } catch (e) {
          pushToast("error", e.message);
        }
      }
    }
  ), /* @__PURE__ */ React17.createElement(
    CsvImportModal,
    {
      open: importOpen,
      onClose: () => setImportOpen(false),
      type: "medicines",
      context: { existingMedicines: rows }
    }
  ), /* @__PURE__ */ React17.createElement(
    CsvImportModal,
    {
      open: importCatOpen,
      onClose: () => setImportCatOpen(false),
      type: "medicine_categories",
      context: { existingCategories: cats }
    }
  ));
}
var EMPTY;
var init_Medicines = __esm({
  "src/pages/Medicines.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_inventory();
    init_billing();
    init_utils();
    init_CsvImportModal();
    EMPTY = {
      name: "",
      generic: "",
      category: "Analgesic",
      manufacturer: "",
      type: "Tablet",
      strength: "",
      unit: "strip",
      barcode: "",
      purchase_price: "",
      selling_price: "",
      min_stock: "",
      location: "",
      description: ""
    };
  }
});

// src/pages/Inventory.jsx
import React18, { useState as useState15 } from "react";
import { useLiveQuery as useLiveQuery11 } from "dexie-react-hooks";
import { Boxes as Boxes2, PackagePlus as PackagePlus2, AlertTriangle as AlertTriangle5, Hourglass as Hourglass2, ScrollText, Wrench, Plus as Plus8, Pencil as Pencil4, Trash2 as Trash24, Upload as Upload4 } from "lucide-react";
function AdjustModal({ open, onClose }) {
  const { user: user3, pushToast } = useApp();
  const meds = useLiveQuery11(async () => (await db_default.medicines.where("active").equals(1).toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [med, setMed] = useState15(null);
  const [batchId, setBatchId] = useState15("");
  const [type, setType] = useState15("ADJUSTMENT");
  const [qty, setQty] = useState15("");
  const [note, setNote] = useState15("");
  const [busy, setBusy] = useState15(false);
  const [err, setErr] = useState15("");
  const batches = useLiveQuery11(async () => {
    if (!med) return [];
    return db_default.batches.where("medicine_id").equals(med.id).toArray();
  }, [med]);
  React18.useEffect(() => {
    if (open) {
      setMed(null);
      setBatchId("");
      setType("ADJUSTMENT");
      setQty("");
      setNote("");
      setErr("");
    }
  }, [open]);
  const save = async () => {
    setErr("");
    if (!med) {
      setErr("Select a medicine");
      return;
    }
    if (!(Number(qty) > 0)) {
      setErr("Quantity must be positive");
      return;
    }
    setBusy(true);
    try {
      await adjustStock({ medicine_id: med.id, batch_id: batchId || null, type, qty: Number(qty), note }, user3.id);
      pushToast("success", `Stock ${type.toLowerCase()} recorded (${med.name})`);
      await syncAlerts(user3.id).catch(() => {
      });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React18.createElement(
    Modal,
    {
      open,
      onClose,
      title: "Stock Adjustment",
      width: "md",
      sub: "Creates an immutable ledger entry. Stock can never go negative.",
      footer: /* @__PURE__ */ React18.createElement(React18.Fragment, null, /* @__PURE__ */ React18.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React18.createElement(Btn, { variant: "primary", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Record adjustment"))
    },
    err && /* @__PURE__ */ React18.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React18.createElement("div", { className: "stack" }, /* @__PURE__ */ React18.createElement(Field, { label: "Medicine", required: true }, /* @__PURE__ */ React18.createElement(Select, { value: med?.id || "", onChange: (e) => {
      setMed((meds || []).find((m) => m.id === e.target.value) || null);
      setBatchId("");
    } }, /* @__PURE__ */ React18.createElement("option", { value: "" }, "Select\u2026"), (meds || []).map((m) => /* @__PURE__ */ React18.createElement("option", { key: m.id, value: m.id }, m.name)))), /* @__PURE__ */ React18.createElement(Field, { label: "Batch", hint: "Leave empty to auto-pick (FEFO)" }, /* @__PURE__ */ React18.createElement(Select, { value: batchId, onChange: (e) => setBatchId(e.target.value), disabled: !med }, /* @__PURE__ */ React18.createElement("option", { value: "" }, "Auto (earliest expiry first)"), (batches || []).map((b) => /* @__PURE__ */ React18.createElement("option", { key: b.id, value: b.id }, b.batch_no, " \xB7 exp ", b.expiry, " \xB7 ", b.available, " avail")))), /* @__PURE__ */ React18.createElement("div", { className: "fg-row" }, /* @__PURE__ */ React18.createElement(Field, { label: "Type" }, /* @__PURE__ */ React18.createElement(Select, { value: type, onChange: (e) => setType(e.target.value) }, /* @__PURE__ */ React18.createElement("option", { value: "ADJUSTMENT" }, "Adjustment (+ add stock)"), /* @__PURE__ */ React18.createElement("option", { value: "DAMAGE" }, "Damage (\u2212 remove stock)"), /* @__PURE__ */ React18.createElement("option", { value: "EXPIRED" }, "Expired (\u2212 remove stock)"))), /* @__PURE__ */ React18.createElement(Field, { label: "Quantity", required: true }, /* @__PURE__ */ React18.createElement(Input, { type: "number", min: "1", value: qty, onChange: (e) => setQty(e.target.value) }))), /* @__PURE__ */ React18.createElement(Field, { label: "Note / Reason" }, /* @__PURE__ */ React18.createElement(Input, { value: note, onChange: (e) => setNote(e.target.value), placeholder: "e.g. Carton found torn in store" })))
  );
}
function BatchModal({ open, onClose, editing }) {
  const { user: user3, pushToast } = useApp();
  const meds = useLiveQuery11(async () => (await db_default.medicines.where("active").equals(1).toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [medId, setMedId] = useState15("");
  const [batchNo, setBatchNo] = useState15("");
  const [mfgDate, setMfgDate] = useState15("");
  const [expiry, setExpiry] = useState15("");
  const [qty, setQty] = useState15("");
  const [price, setPrice] = useState15("");
  const [busy, setBusy] = useState15(false);
  const [err, setErr] = useState15("");
  React18.useEffect(() => {
    if (open) {
      if (editing) {
        setMedId(editing.medicine_id || "");
        setBatchNo(editing.batch_no || "");
        setMfgDate(editing.mfg_date || "");
        setExpiry(editing.expiry || "");
        setQty(String(editing.quantity || ""));
        setPrice(String(editing.purchase_price ?? ""));
      } else {
        setMedId(meds?.[0]?.id || "");
        setBatchNo(`B-${Date.now().toString().slice(-5)}`);
        setMfgDate(dkey(/* @__PURE__ */ new Date()));
        setExpiry("");
        setQty("");
        setPrice("");
      }
      setErr("");
    }
  }, [open, editing, meds]);
  const save = async () => {
    setErr("");
    if (!medId) {
      setErr("Select a medicine");
      return;
    }
    if (!batchNo.trim()) {
      setErr("Batch number is required");
      return;
    }
    if (!editing && !(Number(qty) > 0)) {
      setErr("Quantity must be greater than zero");
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await updateBatch(editing.id, {
          batch_no: batchNo.trim().toUpperCase(),
          mfg_date: mfgDate || dkey(/* @__PURE__ */ new Date()),
          expiry: expiry || "9999-12-31",
          purchase_price: Number(price) || 0
        }, user3.id);
        pushToast("success", `Batch ${batchNo} updated`);
      } else {
        await createBatch({
          medicine_id: medId,
          batch_no: batchNo.trim().toUpperCase(),
          mfg_date: mfgDate || dkey(/* @__PURE__ */ new Date()),
          expiry: expiry || "9999-12-31",
          quantity: Number(qty),
          purchase_price: Number(price) || 0
        }, user3.id);
        pushToast("success", `Batch ${batchNo} created`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React18.createElement(
    Modal,
    {
      open,
      onClose,
      title: editing ? `Edit Batch ${editing.batch_no}` : "Add Medicine Batch",
      width: "md",
      footer: /* @__PURE__ */ React18.createElement(React18.Fragment, null, /* @__PURE__ */ React18.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React18.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : editing ? "Save changes" : "Add batch"))
    },
    err && /* @__PURE__ */ React18.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React18.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React18.createElement(Field, { label: "Medicine", required: true, className: "fg-2" }, /* @__PURE__ */ React18.createElement(Select, { value: medId, onChange: (e) => setMedId(e.target.value), disabled: !!editing }, (meds || []).map((m) => /* @__PURE__ */ React18.createElement("option", { key: m.id, value: m.id }, m.name, " (", m.type, ")")))), /* @__PURE__ */ React18.createElement(Field, { label: "Batch Number", required: true }, /* @__PURE__ */ React18.createElement(Input, { value: batchNo, onChange: (e) => setBatchNo(e.target.value), placeholder: "BATCH-01" })), !editing && /* @__PURE__ */ React18.createElement(Field, { label: "Quantity (initial stock)", required: true }, /* @__PURE__ */ React18.createElement(Input, { type: "number", min: "1", value: qty, onChange: (e) => setQty(e.target.value) })), /* @__PURE__ */ React18.createElement(Field, { label: "Mfg Date" }, /* @__PURE__ */ React18.createElement(Input, { type: "date", value: mfgDate, onChange: (e) => setMfgDate(e.target.value) })), /* @__PURE__ */ React18.createElement(Field, { label: "Expiry Date", required: true }, /* @__PURE__ */ React18.createElement(Input, { type: "date", value: expiry, onChange: (e) => setExpiry(e.target.value) })), /* @__PURE__ */ React18.createElement(Field, { label: "Purchase Price (\u20B9)" }, /* @__PURE__ */ React18.createElement(Input, { type: "number", min: "0", step: "0.01", value: price, onChange: (e) => setPrice(e.target.value), placeholder: "0.00" })))
  );
}
function Inventory() {
  const { settings, pushToast } = useApp();
  const [tab, setTab] = useState15("stock");
  const [adjustOpen, setAdjustOpen] = useState15(false);
  const [batchModalOpen, setBatchModalOpen] = useState15(false);
  const [importBatchOpen, setImportBatchOpen] = useState15(false);
  const [editingBatch, setEditingBatch] = useState15(null);
  const [deleteBatchTarget, setDeleteBatchTarget] = useState15(null);
  const [expireTarget, setExpireTarget] = useState15(null);
  const [stockF, setStockF] = useState15("all");
  const [txnType, setTxnType] = useState15("");
  const [txnFrom, setTxnFrom] = useState15(dkey(addDays(/* @__PURE__ */ new Date(), -30)));
  const [txnTo, setTxnTo] = useState15(dkey(/* @__PURE__ */ new Date()));
  const stock = useLiveQuery11(() => stockMap(), []);
  const buckets = useLiveQuery11(() => expiryBuckets(), []);
  const lowList = useLiveQuery11(() => lowStockList(), []);
  const users = useLiveQuery11(async () => new Map((await db_default.users.toArray()).map((u) => [u.id, u.name])), []);
  const allMeds = useLiveQuery11(() => db_default.medicines.where("active").equals(1).toArray(), []);
  const stockRows = useLiveQuery11(async () => {
    if (!stock) return null;
    let list = [...stock.values()].filter((e) => e.medicine.active);
    const min = (e) => e.medicine.min_stock || Number(settings.low_stock_default) || 0;
    if (stockF === "low") list = list.filter((e) => e.available > 0 && e.available <= min(e));
    else if (stockF === "out") list = list.filter((e) => e.available <= 0);
    else if (stockF === "expiring") list = list.filter((e) => e.next_expiry && daysUntil(e.next_expiry) <= 90);
    return list.map((e) => ({ ...e, min: min(e) })).sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
  }, [stock, stockF]);
  const batches = useLiveQuery11(async () => {
    const bs = await db_default.batches.toArray();
    const meds = new Map((await db_default.medicines.toArray()).map((m) => [m.id, m]));
    return bs.map((b) => ({ ...b, medicine: meds.get(b.medicine_id) })).filter((b) => b.medicine && b.medicine.active).sort((a, b) => a.medicine.name.localeCompare(b.medicine.name) || a.expiry.localeCompare(b.expiry));
  }, []);
  const txns = useLiveQuery11(async () => {
    let list = await db_default.inventory_txns.orderBy("at").reverse().toArray();
    const meds = new Map((await db_default.medicines.toArray()).map((m) => [m.id, m]));
    const bs = new Map((await db_default.batches.toArray()).map((b) => [b.id, b]));
    list = list.map((t) => ({ ...t, medicine: meds.get(t.medicine_id), batch: bs.get(t.batch_id) })).filter((t) => t.medicine && t.at.slice(0, 10) >= txnFrom && t.at.slice(0, 10) <= txnTo).filter((t) => !txnType || t.type === txnType);
    return list.slice(0, 300);
  }, [txnType, txnFrom, txnTo]);
  const expRows = buckets ? [...buckets.expired, ...buckets.d30, ...buckets.d60, ...buckets.d90] : [];
  return /* @__PURE__ */ React18.createElement("div", { className: "page" }, /* @__PURE__ */ React18.createElement(
    PageHeader,
    {
      title: "Inventory",
      sub: "FEFO batch control \xB7 expiry tracking \xB7 immutable stock ledger",
      actions: /* @__PURE__ */ React18.createElement(Btn, { variant: "accent", icon: Wrench, onClick: () => setAdjustOpen(true) }, "Stock Adjustment")
    }
  ), /* @__PURE__ */ React18.createElement("div", { className: "inv-summary" }, /* @__PURE__ */ React18.createElement("div", { className: "inv-chip green" }, /* @__PURE__ */ React18.createElement(Boxes2, { size: 16 }), " ", stock ? [...stock.values()].filter((e) => e.medicine.active).length : "\u2014", " active medicines"), /* @__PURE__ */ React18.createElement("div", { className: "inv-chip amber" }, /* @__PURE__ */ React18.createElement(AlertTriangle5, { size: 16 }), " ", lowList ? lowList.low.length : "\u2014", " low \xB7 ", lowList ? lowList.out.length : "\u2014", " out of stock"), /* @__PURE__ */ React18.createElement("div", { className: "inv-chip red" }, /* @__PURE__ */ React18.createElement(Hourglass2, { size: 16 }), " ", buckets ? buckets.expired.length : "\u2014", " expired batches \xB7 ", buckets ? buckets.d30.length : "\u2014", " expiring \u226430d"), /* @__PURE__ */ React18.createElement("div", { className: "inv-chip blue" }, /* @__PURE__ */ React18.createElement(ScrollText, { size: 16 }), " Ledger: every change is recorded")), /* @__PURE__ */ React18.createElement(
    Tabs,
    {
      active: tab,
      onChange: setTab,
      tabs: [
        { key: "stock", label: "Stock Levels" },
        { key: "batches", label: "Batches (FEFO)", badge: batches?.length },
        { key: "expiry", label: "Expiry Watch", badge: expRows.length },
        { key: "ledger", label: "Transaction Ledger" }
      ]
    }
  ), tab === "stock" && /* @__PURE__ */ React18.createElement(Card, null, /* @__PURE__ */ React18.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React18.createElement(Select, { value: stockF, onChange: (e) => setStockF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React18.createElement("option", { value: "all" }, "All medicines"), /* @__PURE__ */ React18.createElement("option", { value: "low" }, "Low stock"), /* @__PURE__ */ React18.createElement("option", { value: "out" }, "Out of stock"), /* @__PURE__ */ React18.createElement("option", { value: "expiring" }, "Expiring \u2264 90 days"))), /* @__PURE__ */ React18.createElement(
    DataTable,
    {
      columns: [
        { key: "name", label: "Medicine", sortable: true, sortValue: (r) => r.medicine.name, render: (r) => /* @__PURE__ */ React18.createElement("span", { className: "cell-person" }, /* @__PURE__ */ React18.createElement("span", { className: "cell-main" }, r.medicine.name), /* @__PURE__ */ React18.createElement("span", { className: "cell-sub" }, r.medicine.generic || "", " \xB7 min ", r.min)) },
        { key: "available", label: "Available", align: "right", sortable: true, render: (r) => /* @__PURE__ */ React18.createElement("b", null, fmtQty(r.available), " ", r.medicine.unit) },
        {
          key: "status",
          label: "Status",
          render: (r) => {
            if (r.available <= 0) return /* @__PURE__ */ React18.createElement(Badge, { tone: "red" }, "OUT OF STOCK");
            if (r.available <= r.min) return /* @__PURE__ */ React18.createElement(Badge, { tone: "amber" }, "LOW STOCK");
            return /* @__PURE__ */ React18.createElement(Badge, { tone: "green" }, "OK");
          }
        },
        {
          key: "next_expiry",
          label: "Next Expiry (FEFO first out)",
          render: (r) => !r.next_expiry ? /* @__PURE__ */ React18.createElement(Badge, { tone: "red" }, "No stock") : /* @__PURE__ */ React18.createElement("span", null, r.next_expiry, " ", /* @__PURE__ */ React18.createElement(Badge, { tone: daysUntil(r.next_expiry) < 0 ? "red" : daysUntil(r.next_expiry) <= 30 ? "red" : daysUntil(r.next_expiry) <= 90 ? "amber" : "gray" }, daysUntil(r.next_expiry) < 0 ? "EXPIRED" : `${daysUntil(r.next_expiry)}d`))
        },
        { key: "val", label: "Stock Value (buy)", align: "right", render: (r) => fmtMoney(r.available * (r.medicine.purchase_price || 0), settings.currency) }
      ],
      rows: stockRows,
      pageSize: 12,
      empty: /* @__PURE__ */ React18.createElement(EmptyState, { icon: "\u{1F4E6}", title: "No stock records", message: "Use Stock Adjustment to add stock." }),
      loading: !stockRows
    }
  )), tab === "batches" && /* @__PURE__ */ React18.createElement(
    Card,
    {
      sub: "Batches are selected automatically at billing time \u2014 earliest expiry goes out first (FEFO)",
      actions: /* @__PURE__ */ React18.createElement("div", { style: { display: "flex", gap: "8px" } }, /* @__PURE__ */ React18.createElement(Btn, { size: "sm", variant: "ghost", icon: Upload4, onClick: () => setImportBatchOpen(true) }, "Import Batches"), /* @__PURE__ */ React18.createElement(Btn, { size: "sm", variant: "accent", icon: Plus8, onClick: () => {
        setEditingBatch(null);
        setBatchModalOpen(true);
      } }, "+ Add Batch"))
    },
    /* @__PURE__ */ React18.createElement(
      DataTable,
      {
        columns: [
          { key: "med", label: "Medicine", sortable: true, sortValue: (b) => b.medicine.name, render: (b) => b.medicine.name },
          { key: "batch_no", label: "Batch #", render: (b) => /* @__PURE__ */ React18.createElement("span", { className: "cell-mono" }, b.batch_no) },
          { key: "mfg_date", label: "Mfg", render: (b) => b.mfg_date || "\u2014" },
          {
            key: "expiry",
            label: "Expiry",
            sortable: true,
            render: (b) => {
              if (b.status === "expired") return /* @__PURE__ */ React18.createElement(Badge, { tone: "red" }, "EXPIRED ", b.expiry);
              const d = daysUntil(b.expiry);
              return /* @__PURE__ */ React18.createElement("span", null, b.expiry, " ", /* @__PURE__ */ React18.createElement(Badge, { tone: d < 0 ? "red" : d <= 30 ? "red" : d <= 60 ? "amber" : d <= 90 ? "amber" : "green" }, d, "d"));
            }
          },
          { key: "quantity", label: "Received", align: "right", sortable: true },
          { key: "available", label: "Available", align: "right", sortable: true, render: (b) => /* @__PURE__ */ React18.createElement("b", null, fmtQty(b.available)) },
          {
            key: "act",
            label: "",
            align: "right",
            render: (b) => /* @__PURE__ */ React18.createElement("span", { className: "cell-actions", onClick: (e) => e.stopPropagation() }, /* @__PURE__ */ React18.createElement(Btn, { size: "sm", variant: "ghost", icon: Pencil4, onClick: () => {
              setEditingBatch(b);
              setBatchModalOpen(true);
            } }, "Edit"), b.status !== "expired" && b.available > 0 && /* @__PURE__ */ React18.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setExpireTarget(b) }, "Expire"), /* @__PURE__ */ React18.createElement(Btn, { size: "sm", variant: "ghost", icon: Trash24, onClick: () => setDeleteBatchTarget(b) }, "Delete"))
          }
        ],
        rows: batches,
        pageSize: 15,
        empty: /* @__PURE__ */ React18.createElement(EmptyState, { title: "No batches yet", message: "Use Add Batch or Stock Adjustment to add stock.", action: /* @__PURE__ */ React18.createElement(Btn, { size: "sm", variant: "accent", onClick: () => {
          setEditingBatch(null);
          setBatchModalOpen(true);
        } }, "+ Add Batch") }),
        loading: !batches
      }
    )
  ), tab === "expiry" && /* @__PURE__ */ React18.createElement("div", { className: "expiry-grid" }, [
    { title: "\u{1F534} Expired", rows: buckets?.expired || [], tone: "red", hint: "Cannot be sold \u2014 visible in reports only" },
    { title: "Expiring within 30 days", rows: buckets?.d30 || [], tone: "amber", hint: "Sell first (FEFO applies automatically)" },
    { title: "Expiring within 60 days", rows: buckets?.d60 || [], tone: "amber", hint: "Keep an eye on movement" },
    { title: "\u{1F535} Within 90 days", rows: buckets?.d90 || [], tone: "blue", hint: "Planned movement" }
  ].map((g) => /* @__PURE__ */ React18.createElement(Card, { key: g.title, title: g.title, sub: g.hint, tone: g.tone, className: "exp-card" }, g.rows.length === 0 ? /* @__PURE__ */ React18.createElement(EmptyState, { compact: true, icon: "\u2705", title: "None" }) : /* @__PURE__ */ React18.createElement("div", { className: "exp-list" }, g.rows.map((b) => /* @__PURE__ */ React18.createElement("div", { className: "exp-row", key: b.batch.id }, /* @__PURE__ */ React18.createElement("span", { className: "exp-name" }, b.med_name), /* @__PURE__ */ React18.createElement("span", { className: "exp-sub" }, b.batch.batch_no, " \xB7 ", b.expiry, " \xB7 ", b.on_hand, " pcs"))))))), tab === "ledger" && /* @__PURE__ */ React18.createElement(Card, { sub: "Immutable record of every inventory movement \u2014 sales, returns, adjustments, expiries, cancellations" }, /* @__PURE__ */ React18.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React18.createElement(Select, { value: txnType, onChange: (e) => setTxnType(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React18.createElement("option", { value: "" }, "All types"), TXN_TYPES.map((t) => /* @__PURE__ */ React18.createElement("option", { key: t, value: t }, t.replace("_", " ")))), /* @__PURE__ */ React18.createElement(Input, { type: "date", value: txnFrom, onChange: (e) => setTxnFrom(e.target.value), className: "toolbar-date" }), /* @__PURE__ */ React18.createElement(Input, { type: "date", value: txnTo, onChange: (e) => setTxnTo(e.target.value), className: "toolbar-date" })), /* @__PURE__ */ React18.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "at", label: "When", sortable: true, render: (t) => /* @__PURE__ */ React18.createElement("span", { className: "cell-sub" }, fmtDateTime(t.at)) },
        { key: "type", label: "Type", render: (t) => /* @__PURE__ */ React18.createElement(Badge, { tone: TXN_TONE[t.type] || "gray" }, t.type.replace("_", " ")) },
        { key: "medicine", label: "Medicine", render: (t) => t.medicine?.name || "\u2014" },
        { key: "batch", label: "Batch", render: (t) => t.batch?.batch_no || "\u2014" },
        { key: "qty", label: "Qty", align: "right", render: (t) => /* @__PURE__ */ React18.createElement("b", { className: t.qty > 0 ? "qty-in" : "qty-out" }, t.qty > 0 ? "+" : "", fmtQty(t.qty)) },
        { key: "by", label: "By", render: (t) => users && users.get(t.by) || "\u2014" },
        { key: "note", label: "Note", render: (t) => /* @__PURE__ */ React18.createElement("span", { className: "cell-ellip" }, t.note || "\u2014") }
      ],
      rows: txns,
      pageSize: 15,
      empty: /* @__PURE__ */ React18.createElement(EmptyState, { icon: "\u{1F4DC}", title: "No ledger entries in range" }),
      loading: !txns
    }
  )), /* @__PURE__ */ React18.createElement(AdjustModal, { open: adjustOpen, onClose: () => setAdjustOpen(false) }), /* @__PURE__ */ React18.createElement(BatchModal, { open: batchModalOpen, onClose: () => {
    setBatchModalOpen(false);
    setEditingBatch(null);
  }, editing: editingBatch }), /* @__PURE__ */ React18.createElement(
    Confirm,
    {
      open: !!deleteBatchTarget,
      onClose: () => setDeleteBatchTarget(null),
      title: `Delete batch ${deleteBatchTarget?.batch_no}?`,
      message: "This will delete this batch if no bills reference it. Batches with sales history cannot be deleted and must be marked expired.",
      danger: true,
      confirmText: "Delete batch",
      onConfirm: async () => {
        try {
          await deleteBatch(deleteBatchTarget.id, user.id);
          pushToast("success", `Batch ${deleteBatchTarget.batch_no} deleted`);
          setDeleteBatchTarget(null);
        } catch (e) {
          pushToast("error", e.message);
        }
      }
    }
  ), /* @__PURE__ */ React18.createElement(
    Confirm,
    {
      open: !!expireTarget,
      onClose: () => setExpireTarget(null),
      title: `Mark batch ${expireTarget?.batch_no} expired?`,
      message: `${expireTarget?.medicine?.name} \u2014 ${expireTarget?.available} units will be removed from sellable stock and recorded as EXPIRED in the ledger.`,
      danger: true,
      confirmText: "Mark expired",
      onConfirm: async () => {
        await markBatchExpired(expireTarget.id, user.id);
        await syncAlerts().catch(() => {
        });
        pushToast("success", "Batch marked expired");
        setExpireTarget(null);
      }
    }
  ), /* @__PURE__ */ React18.createElement(
    CsvImportModal,
    {
      open: importBatchOpen,
      onClose: () => setImportBatchOpen(false),
      type: "inventory_batches",
      context: { existingMedicines: allMeds }
    }
  ));
}
var TXN_TONE;
var init_Inventory = __esm({
  "src/pages/Inventory.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_inventory();
    init_notifications();
    init_utils();
    init_CsvImportModal();
    TXN_TONE = {
      SALE: "navy",
      RETURN: "teal",
      ADJUSTMENT: "blue",
      DAMAGE: "amber",
      EXPIRED: "red",
      CANCELLED_BILL: "gray"
    };
  }
});

// src/pages/Returns.jsx
import React19, { useState as useState16, useEffect as useEffect12 } from "react";
import { useLiveQuery as useLiveQuery12 } from "dexie-react-hooks";
import { Undo2 as Undo22, Plus as Plus9 } from "lucide-react";
function ReturnModal({ open, onClose }) {
  const { user: user3, settings, pushToast } = useApp();
  const [billId, setBillId] = useState16("");
  const [bill2, setBill] = useState16(null);
  const [retQty, setRetQty] = useState16({});
  const [reason, setReason] = useState16("");
  const [refundMethod, setRefundMethod] = useState16(settings.default_payment || "Cash");
  const [refundAmt, setRefundAmt] = useState16("");
  const [busy, setBusy] = useState16(false);
  const [err, setErr] = useState16("");
  const returnableBills = useLiveQuery12(async () => {
    const bills = await db_default.bills.where("status").equals("completed").toArray();
    const out = [];
    for (const b of bills) {
      const items = await db_default.bill_items.where("bill_id").equals(b.id).toArray();
      const medLines = items.filter((i) => i.item_type === "medicine" && i.returned < i.qty);
      if (medLines.length) out.push({ bill: b, medLines });
    }
    return out.sort((a, b) => b.bill.time.localeCompare(a.bill.time)).slice(0, 60);
  }, [open]);
  useEffect12(() => {
    if (open) {
      setBillId("");
      setBill(null);
      setRetQty({});
      setReason("");
      setRefundAmt("");
      setErr("");
    }
  }, [open]);
  useEffect12(() => {
    const found = returnableBills?.find((x) => x.bill.id === billId);
    setBill(found || null);
    setRetQty({});
  }, [billId, returnableBills]);
  const save = async () => {
    setErr("");
    if (!bill2) {
      setErr("Select a bill");
      return;
    }
    const items = bill2.medLines.filter((l) => Number(retQty[l.id]) > 0).map((l) => ({ bill_item_id: l.id, qty: Number(retQty[l.id]) }));
    if (!items.length) {
      setErr("Enter quantity for at least one medicine line");
      return;
    }
    setBusy(true);
    try {
      const r = await createReturn({ bill_id: bill2.bill.id, items, reason, refund_method: refundMethod, refund_amount: Number(refundAmt) || 0 }, user3.id);
      pushToast("success", `Return ${r.return_no} processed \u2014 stock restored to batches`);
      await syncAlerts(user3.id).catch(() => {
      });
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React19.createElement(
    Modal,
    {
      open,
      onClose,
      title: "New Return",
      width: "lg",
      sub: "Medicines returned by the patient are restored to their original batches (RETURN ledger entry)",
      footer: /* @__PURE__ */ React19.createElement(React19.Fragment, null, /* @__PURE__ */ React19.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React19.createElement(Btn, { variant: "danger", onClick: save, disabled: busy }, busy ? "Processing\u2026" : "Process Return"))
    },
    err && /* @__PURE__ */ React19.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React19.createElement("div", { className: "stack" }, /* @__PURE__ */ React19.createElement(Field, { label: "Bill", required: true }, /* @__PURE__ */ React19.createElement(Select, { value: billId, onChange: (e) => setBillId(e.target.value) }, /* @__PURE__ */ React19.createElement("option", { value: "" }, "Select bill with medicine items\u2026"), (returnableBills || []).map((x) => /* @__PURE__ */ React19.createElement("option", { key: x.bill.id, value: x.bill.id }, x.bill.bill_no, " \xB7 ", x.bill.patient_name, " \xB7 ", fmtDate(x.bill.date), " \xB7 ", fmtMoney(x.bill.total, settings.currency))))), bill2 && /* @__PURE__ */ React19.createElement("div", { className: "ret-lines" }, bill2.medLines.map((l) => {
      const maxQty = l.qty - (l.returned || 0);
      return /* @__PURE__ */ React19.createElement("div", { className: "ret-line", key: l.id }, /* @__PURE__ */ React19.createElement("span", { className: "ret-name" }, l.name, l.batch_no && /* @__PURE__ */ React19.createElement("span", { className: "cell-sub" }, " \xB7 batch ", l.batch_no)), /* @__PURE__ */ React19.createElement("span", { className: "ret-avail" }, "sold ", l.qty, " \xB7 returnable ", maxQty), /* @__PURE__ */ React19.createElement(Input, { type: "number", min: "0", max: maxQty, value: retQty[l.id] ?? "", onChange: (e) => setRetQty((x) => ({ ...x, [l.id]: e.target.value })), placeholder: "0", className: "ret-qty" }));
    })), /* @__PURE__ */ React19.createElement(Field, { label: "Reason", required: true }, /* @__PURE__ */ React19.createElement(Input, { value: reason, onChange: (e) => setReason(e.target.value), placeholder: "e.g. Medication caused reaction, duplicate dispense" })), /* @__PURE__ */ React19.createElement("div", { className: "fg-row" }, /* @__PURE__ */ React19.createElement(Field, { label: "Refund Method" }, /* @__PURE__ */ React19.createElement(Select, { value: refundMethod, onChange: (e) => setRefundMethod(e.target.value) }, PAY_METHODS.map((m) => /* @__PURE__ */ React19.createElement("option", { key: m }, m)))), /* @__PURE__ */ React19.createElement(Field, { label: "Refund Amount", hint: `Max ${fmtMoney(bill2?.bill.paid || 0, settings.currency)}` }, /* @__PURE__ */ React19.createElement(Input, { type: "number", min: "0", step: "0.01", value: refundAmt, onChange: (e) => setRefundAmt(e.target.value), placeholder: "0 (no refund)" }))))
  );
}
function Returns() {
  const { settings } = useApp();
  const [modal, setModal] = useState16(false);
  const [q, setQ] = useState16("");
  const returns = useLiveQuery12(async () => {
    const all = await db_default.returns.toArray();
    const s = q.trim().toLowerCase();
    const list = s ? all.filter((r) => r.return_no.toLowerCase().includes(s) || (r.bill_no || "").toLowerCase().includes(s) || (r.patient_name || "").toLowerCase().includes(s)) : all;
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [q]);
  return /* @__PURE__ */ React19.createElement("div", { className: "page" }, /* @__PURE__ */ React19.createElement(
    PageHeader,
    {
      title: "Returns",
      sub: "Patient medicine returns \u2014 restock to original batches with optional refund",
      actions: /* @__PURE__ */ React19.createElement(Btn, { variant: "accent", icon: Plus9, onClick: () => setModal(true) }, "+ New Return")
    }
  ), /* @__PURE__ */ React19.createElement(Card, null, /* @__PURE__ */ React19.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React19.createElement("input", { className: "input", placeholder: "Search return #, bill #, patient\u2026", value: q, onChange: (e) => setQ(e.target.value) })), /* @__PURE__ */ React19.createElement(
    DataTable,
    {
      columns: [
        { key: "return_no", label: "Return #", render: (r) => /* @__PURE__ */ React19.createElement("span", { className: "cell-mono" }, r.return_no) },
        { key: "at", label: "When", sortable: true, sortValue: (r) => r.at, render: (r) => fmtDateTime(r.at) },
        { key: "bill_no", label: "Bill", render: (r) => /* @__PURE__ */ React19.createElement("span", { className: "cell-mono" }, r.bill_no) },
        { key: "patient_name", label: "Patient", render: (r) => r.patient_name },
        {
          key: "items",
          label: "Items Returned",
          render: (r) => (r.items || []).map((i) => `${i.name} \xD7${i.qty}`).join(", ")
        },
        { key: "reason", label: "Reason", render: (r) => /* @__PURE__ */ React19.createElement("span", { className: "cell-ellip", title: r.reason }, r.reason) },
        {
          key: "refund",
          label: "Refund",
          align: "right",
          render: (r) => r.refund > 0 ? /* @__PURE__ */ React19.createElement(Badge, { tone: "red" }, "\u2212 ", fmtMoney(r.refund, settings.currency), " (", r.refund_method, ")") : /* @__PURE__ */ React19.createElement(Badge, { tone: "gray" }, "No refund")
        }
      ],
      rows: returns,
      pageSize: 12,
      empty: /* @__PURE__ */ React19.createElement(EmptyState, { icon: "\u21A9", title: "No returns processed", action: /* @__PURE__ */ React19.createElement(Btn, { size: "sm", variant: "accent", onClick: () => setModal(true) }, "Process a return") }),
      loading: !returns
    }
  )), /* @__PURE__ */ React19.createElement(ReturnModal, { open: modal, onClose: () => setModal(false) }));
}
var init_Returns = __esm({
  "src/pages/Returns.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_billing();
    init_notifications();
    init_utils();
  }
});

// src/services/expenses.js
async function addExpense({ category, amount, date, description, method }, userId) {
  return db_default.transaction("rw", [db_default.expenses, db_default.counters, db_default.activity_logs], async () => {
    const amt = round2(amount);
    if (!(amt > 0)) throw new Error("Amount must be positive");
    if (!EXPENSE_CATEGORIES.includes(category)) throw new Error("Invalid category");
    const d = date || dkey(/* @__PURE__ */ new Date());
    const expense_no = await makeNo("EXP", "EXP", (/* @__PURE__ */ new Date(d + "T00:00:00")).getFullYear());
    const e = {
      id: uid(),
      expense_no,
      category,
      amount: amt,
      date: d,
      description: description || "",
      method: method || "Cash",
      status: "active",
      void_reason: null,
      added_by: userId || null,
      created_at: nowISO()
    };
    await db_default.expenses.add(e);
    await audit(userId, "EXPENSE_ADD", "expense", e.id, `${expense_no} \xB7 ${category} \xB7 ${amt}`);
    return e;
  });
}
async function voidExpense(id, reason, userId) {
  return db_default.transaction("rw", [db_default.expenses, db_default.activity_logs], async () => {
    const e = await db_default.expenses.get(id);
    if (!e) throw new Error("Expense not found");
    if (e.status === "void") throw new Error("Expense already voided");
    const updated = { ...e, status: "void", void_reason: String(reason || "no reason").trim() };
    await db_default.expenses.put(updated);
    await audit(userId, "EXPENSE_VOID", "expense", id, `${e.expense_no} \xB7 ${reason}`);
    return updated;
  });
}
async function expenseTotals(from, to) {
  const all = await db_default.expenses.toArray();
  const inRange = all.filter((e) => e.status === "active" && e.date >= from && e.date <= to);
  const byCat = {};
  let total = 0;
  for (const e of inRange) {
    byCat[e.category] = round2((byCat[e.category] || 0) + e.amount);
    total = round2(total + e.amount);
  }
  return { total, byCat };
}
var EXPENSE_CATEGORIES;
var init_expenses = __esm({
  "src/services/expenses.js"() {
    init_db();
    init_utils();
    init_core();
    EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salary", "Equipment", "Maintenance", "Supplies", "Other"];
  }
});

// src/pages/Expenses.jsx
import React20, { useState as useState17 } from "react";
import { useLiveQuery as useLiveQuery13 } from "dexie-react-hooks";
import { Wallet as Wallet3, Plus as Plus10, Download as Download6, CircleSlash } from "lucide-react";
function Expenses() {
  const { user: user3, settings, pushToast } = useApp();
  const [modal, setModal] = useState17(false);
  const [voidTarget, setVoidTarget] = useState17(null);
  const [f, setF] = useState17({ category: "Rent", amount: "", date: dkey(/* @__PURE__ */ new Date()), description: "", method: "Cash" });
  const [err, setErr] = useState17("");
  const [busy, setBusy] = useState17(false);
  const [statusF, setStatusF] = useState17("active");
  const [catF, setCatF] = useState17("");
  const from = dkey(/* @__PURE__ */ new Date(dkey(/* @__PURE__ */ new Date()).slice(0, 8) + "01"));
  const to = dkey(/* @__PURE__ */ new Date());
  const totals = useLiveQuery13(() => expenseTotals(from, to), []);
  const rows = useLiveQuery13(async () => {
    const all = await db_default.expenses.toArray();
    const users = new Map((await db_default.users.toArray()).map((u) => [u.id, u.name]));
    let list = all.map((e) => ({ ...e, by: users.get(e.added_by) || "\u2014" }));
    if (statusF === "active") list = list.filter((e) => e.status === "active");
    else if (statusF === "void") list = list.filter((e) => e.status === "void");
    if (catF) list = list.filter((e) => e.category === catF);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [statusF, catF]);
  const save = async () => {
    setErr("");
    if (!(Number(f.amount) > 0)) {
      setErr("Enter a valid amount");
      return;
    }
    setBusy(true);
    try {
      await addExpense({ ...f, amount: Number(f.amount) }, user3.id);
      pushToast("success", "Expense recorded");
      setModal(false);
      setF({ category: "Rent", amount: "", date: dkey(/* @__PURE__ */ new Date()), description: "", method: "Cash" });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const exportCSV = () => {
    download(`heeva-expenses-${dkey()}.csv`, toCSV(
      ["No", "Date", "Category", "Amount", "Description", "Method", "Status", "Added By"],
      (rows || []).map((e) => [e.expense_no, e.date, e.category, e.amount, e.description, e.method, e.status, e.by])
    ), "text/csv");
  };
  return /* @__PURE__ */ React20.createElement("div", { className: "page" }, /* @__PURE__ */ React20.createElement(
    PageHeader,
    {
      title: "Expenses",
      sub: `This month (MTD): ${fmtMoney(totals?.total || 0, settings.currency)} \xB7 financial records are never deleted, only voided`,
      actions: /* @__PURE__ */ React20.createElement(React20.Fragment, null, /* @__PURE__ */ React20.createElement(Btn, { variant: "ghost", icon: Download6, onClick: exportCSV }, "Export"), /* @__PURE__ */ React20.createElement(Btn, { variant: "accent", icon: Plus10, onClick: () => setModal(true) }, "+ Record Expense"))
    }
  ), totals && Object.keys(totals.byCat).length > 0 && /* @__PURE__ */ React20.createElement("div", { className: "cat-chips" }, Object.entries(totals.byCat).map(([c, v]) => /* @__PURE__ */ React20.createElement("span", { key: c, className: "cat-chip" }, c, ": ", /* @__PURE__ */ React20.createElement("b", null, fmtMoney(v, settings.currency))))), /* @__PURE__ */ React20.createElement(Card, null, /* @__PURE__ */ React20.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React20.createElement(Select, { value: statusF, onChange: (e) => setStatusF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React20.createElement("option", { value: "active" }, "Active"), /* @__PURE__ */ React20.createElement("option", { value: "void" }, "Voided"), /* @__PURE__ */ React20.createElement("option", { value: "all" }, "All")), /* @__PURE__ */ React20.createElement(Select, { value: catF, onChange: (e) => setCatF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React20.createElement("option", { value: "" }, "All categories"), EXPENSE_CATEGORIES.map((c) => /* @__PURE__ */ React20.createElement("option", { key: c }, c)))), /* @__PURE__ */ React20.createElement(
    DataTable,
    {
      columns: [
        { key: "expense_no", label: "Expense #", render: (e) => /* @__PURE__ */ React20.createElement("span", { className: "cell-mono" }, e.expense_no) },
        { key: "date", label: "Date", sortable: true, render: (e) => fmtDate(e.date) },
        { key: "category", label: "Category", sortable: true, render: (e) => /* @__PURE__ */ React20.createElement(Badge, { tone: "navy" }, e.category) },
        { key: "description", label: "Description", render: (e) => e.description || "\u2014" },
        { key: "method", label: "Method" },
        { key: "amount", label: "Amount", align: "right", sortable: true, render: (e) => fmtMoney(e.amount, settings.currency) },
        { key: "by", label: "Added By" },
        {
          key: "status",
          label: "Status",
          render: (e) => e.status === "void" ? /* @__PURE__ */ React20.createElement(Badge, { tone: "gray" }, "VOID \u2014 ", e.void_reason) : /* @__PURE__ */ React20.createElement(Btn, { size: "sm", variant: "ghost", icon: CircleSlash, onClick: () => setVoidTarget(e) }, "Void")
        }
      ],
      rows,
      pageSize: 12,
      empty: /* @__PURE__ */ React20.createElement(EmptyState, { icon: "\u{1F4B0}", title: "No expenses recorded", action: /* @__PURE__ */ React20.createElement(Btn, { size: "sm", variant: "accent", onClick: () => setModal(true) }, "Record expense") }),
      loading: !rows
    }
  )), /* @__PURE__ */ React20.createElement(
    Modal,
    {
      open: modal,
      onClose: () => setModal(false),
      title: "Record Expense",
      width: "md",
      footer: /* @__PURE__ */ React20.createElement(React20.Fragment, null, /* @__PURE__ */ React20.createElement(Btn, { variant: "ghost", onClick: () => setModal(false) }, "Cancel"), /* @__PURE__ */ React20.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Save expense"))
    },
    err && /* @__PURE__ */ React20.createElement("div", { className: "form-alert" }, err),
    /* @__PURE__ */ React20.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React20.createElement(Field, { label: "Category", required: true }, /* @__PURE__ */ React20.createElement(Select, { value: f.category, onChange: (e) => setF((x) => ({ ...x, category: e.target.value })) }, EXPENSE_CATEGORIES.map((c) => /* @__PURE__ */ React20.createElement("option", { key: c }, c)))), /* @__PURE__ */ React20.createElement(Field, { label: "Amount (\u20B9)", required: true }, /* @__PURE__ */ React20.createElement(Input, { type: "number", min: "0", step: "0.01", value: f.amount, onChange: (e) => setF((x) => ({ ...x, amount: e.target.value })) })), /* @__PURE__ */ React20.createElement(Field, { label: "Date" }, /* @__PURE__ */ React20.createElement(Input, { type: "date", value: f.date, onChange: (e) => setF((x) => ({ ...x, date: e.target.value })) })), /* @__PURE__ */ React20.createElement(Field, { label: "Payment Method" }, /* @__PURE__ */ React20.createElement(Select, { value: f.method, onChange: (e) => setF((x) => ({ ...x, method: e.target.value })) }, ["Cash", "UPI", "Card", "Bank Transfer", "Other"].map((m) => /* @__PURE__ */ React20.createElement("option", { key: m }, m)))), /* @__PURE__ */ React20.createElement(Field, { label: "Description", className: "fg-2" }, /* @__PURE__ */ React20.createElement(Textarea, { rows: 2, value: f.description, onChange: (e) => setF((x) => ({ ...x, description: e.target.value })) })))
  ), /* @__PURE__ */ React20.createElement(
    Confirm,
    {
      open: !!voidTarget,
      onClose: () => setVoidTarget(null),
      title: `Void expense ${voidTarget?.expense_no}?`,
      message: `${voidTarget?.category} \xB7 ${fmtMoney(voidTarget?.amount || 0, settings.currency)} \u2014 ${voidTarget?.description || ""}`.trim(),
      requireReason: true,
      danger: true,
      confirmText: "Void expense",
      onConfirm: async (reason) => {
        await voidExpense(voidTarget.id, reason, user3.id);
        pushToast("success", "Expense voided (kept in records)");
        setVoidTarget(null);
      }
    }
  ));
}
var init_Expenses = __esm({
  "src/pages/Expenses.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_expenses();
    init_expenses();
    init_utils();
  }
});

// src/pages/Reports.jsx
import React21, { useState as useState18 } from "react";
import { useLiveQuery as useLiveQuery14 } from "dexie-react-hooks";
import { BarChart3 as BarChart32, Download as Download7, Printer as Printer6, Users as Users3, TrendingUp as TrendingUp2, Pill as Pill5, Wallet as Wallet4, UserPlus as UserPlus5, RotateCcw } from "lucide-react";
function RangeBar({ from, to, setFrom, setTo }) {
  return /* @__PURE__ */ React21.createElement("div", { className: "toolbar" }, PRESETS.map((p) => /* @__PURE__ */ React21.createElement(Btn, { key: p.label, size: "sm", variant: from === p.get()[0] && to === p.get()[1] ? "primary" : "ghost", onClick: () => {
    const [f, t] = p.get();
    setFrom(f);
    setTo(t);
  } }, p.label)), /* @__PURE__ */ React21.createElement("span", { className: "range-sep" }), /* @__PURE__ */ React21.createElement(Input, { type: "date", value: from, onChange: (e) => setFrom(e.target.value), className: "toolbar-date" }), /* @__PURE__ */ React21.createElement("span", { className: "range-dash" }, "\u2192"), /* @__PURE__ */ React21.createElement(Input, { type: "date", value: to, onChange: (e) => setTo(e.target.value), className: "toolbar-date" }));
}
function SalesTab({ from, to, setFrom, setTo, settings }) {
  const [group, setGroup] = useState18("day");
  const money2 = (v) => fmtMoney(v, settings.currency);
  const data = useLiveQuery14(() => salesReport(from, to, group), [from, to, group]);
  const label = (key) => group === "day" ? fmtDate(key) : group === "month" ? monthLabel(key) : "Week of " + fmtDate(key);
  const cols = [
    { key: "label", label: group === "day" ? "Date" : group === "month" ? "Month" : "Week", render: (r) => label(r.key) },
    { key: "bills", label: "Bills", align: "right" },
    { key: "revenue", label: "Revenue", align: "right", render: (r) => money2(r.revenue) },
    { key: "paid", label: "Collected", align: "right", render: (r) => money2(r.paid) },
    { key: "pending", label: "Pending", align: "right", render: (r) => money2(r.pending) },
    { key: "expenses", label: "Expenses", align: "right", render: (r) => money2(r.expenses) },
    { key: "profit", label: "Est. Profit", align: "right", render: (r) => /* @__PURE__ */ React21.createElement("b", { className: r.profit < 0 ? "val-red" : "val-green" }, money2(r.profit)) }
  ];
  return /* @__PURE__ */ React21.createElement(
    Card,
    {
      title: "Sales Report",
      actions: /* @__PURE__ */ React21.createElement(React21.Fragment, null, /* @__PURE__ */ React21.createElement(Seg, { size: "sm", value: group, onChange: setGroup, options: [{ value: "day", label: "Daily" }, { value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }] }), /* @__PURE__ */ React21.createElement(Btn, { size: "sm", variant: "ghost", icon: Download7, onClick: () => download(`heeva-sales-${from}-${to}.csv`, toCSV(cols.map((c) => c.label), data?.rows.map((r) => [label(r.key), r.bills, r.revenue, r.paid, r.pending, r.expenses, r.profit])), "text/csv") }, "Export"), /* @__PURE__ */ React21.createElement(Btn, { size: "sm", variant: "ghost", icon: Printer6, onClick: () => printReport({ title: `Sales Report \u2014 ${group}`, subtitle: `${fmtDate(from)} to ${fmtDate(to)}`, columns: cols, rows: data?.rows, totals: { bills: data?.totals.bills, revenue: money2(data?.totals.revenue), paid: money2(data?.totals.paid), pending: money2(data?.totals.pending), expenses: money2(data?.totals.expenses), profit: money2(data?.totals.profit) }, settings }) }, "Print"))
    },
    /* @__PURE__ */ React21.createElement(RangeBar, { from, to, setFrom, setTo }),
    data && /* @__PURE__ */ React21.createElement("div", { className: "rep-summary" }, /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Bills: ", /* @__PURE__ */ React21.createElement("b", null, data.totals.bills)), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Revenue: ", /* @__PURE__ */ React21.createElement("b", null, money2(data.totals.revenue))), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Collected: ", /* @__PURE__ */ React21.createElement("b", null, money2(data.totals.paid))), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Pending: ", /* @__PURE__ */ React21.createElement("b", null, money2(data.totals.pending))), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Expenses: ", /* @__PURE__ */ React21.createElement("b", null, money2(data.totals.expenses))), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Est. Profit: ", /* @__PURE__ */ React21.createElement("b", { className: data.totals.profit < 0 ? "val-red" : "val-green" }, money2(data.totals.profit)))),
    /* @__PURE__ */ React21.createElement(DataTable, { columns: cols, rows: data?.rows, pageSize: 14, empty: /* @__PURE__ */ React21.createElement(EmptyState, { icon: "\u{1F4CA}", title: "No sales in range" }) })
  );
}
function PatientsTab({ from, to, setFrom, setTo }) {
  const data = useLiveQuery14(() => patientReport(from, to), [from, to]);
  return /* @__PURE__ */ React21.createElement("div", { className: "rep-stacks" }, /* @__PURE__ */ React21.createElement(Card, { title: "Patient Report", sub: `New & returning patients between ${fmtDate(from)} and ${fmtDate(to)}` }, /* @__PURE__ */ React21.createElement(RangeBar, { from, to, setFrom, setTo }), data && /* @__PURE__ */ React21.createElement("div", { className: "rep-summary" }, /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, /* @__PURE__ */ React21.createElement(UserPlus5, { size: 13 }), " New patients: ", /* @__PURE__ */ React21.createElement("b", null, data.new_patients.length)), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, /* @__PURE__ */ React21.createElement(Users3, { size: 13 }), " Unique patients visited: ", /* @__PURE__ */ React21.createElement("b", null, data.unique_visits)), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Total visits: ", /* @__PURE__ */ React21.createElement("b", null, data.total_visits)), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, /* @__PURE__ */ React21.createElement(RotateCcw, { size: 13 }), " Returning: ", /* @__PURE__ */ React21.createElement("b", null, data.returning.length))), /* @__PURE__ */ React21.createElement("h4", { className: "sub-head" }, "New patients in range"), /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "uhid", label: "UHID", render: (p) => /* @__PURE__ */ React21.createElement("span", { className: "cell-mono" }, p.uhid) },
        { key: "name", label: "Name", sortable: true },
        { key: "gender", label: "Gender" },
        { key: "mobile", label: "Mobile" },
        { key: "reg_date", label: "Registered", render: (p) => fmtDate(p.reg_date) },
        { key: "city", label: "City" }
      ],
      rows: data?.new_patients,
      pageSize: 10,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u{1F465}", title: "No new patients in range" })
    }
  ), /* @__PURE__ */ React21.createElement("h4", { className: "sub-head" }, "Returning patients (had earlier visits)"), /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "uhid", label: "UHID", sortValue: (r) => r.patient.uhid, render: (r) => /* @__PURE__ */ React21.createElement("span", { className: "cell-mono" }, r.patient.uhid) },
        { key: "name", label: "Name", sortValue: (r) => r.patient.name, render: (r) => r.patient.name },
        { key: "visits", label: "Visits in range", align: "right", sortable: true },
        { key: "total_visits", label: "All-time visits", align: "right" }
      ],
      rows: data?.returning,
      pageSize: 10,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u21A9", title: "No returning patients in range" })
    }
  )));
}
function MedicinesTab({ from, to, setFrom, setTo, settings }) {
  const top = useLiveQuery14(() => topMedicines(from, to, 10), [from, to]);
  const low = useLiveQuery14(() => lowStockList(), []);
  const exp = useLiveQuery14(() => expiryBuckets(), []);
  const stock = useLiveQuery14(() => stockMap(), []);
  const money2 = (v) => fmtMoney(v, settings.currency);
  return /* @__PURE__ */ React21.createElement("div", { className: "rep-stacks" }, /* @__PURE__ */ React21.createElement(Card, { title: "Top Selling Medicines", sub: `Quantity & revenue \xB7 ${fmtDate(from)} to ${fmtDate(to)}` }, /* @__PURE__ */ React21.createElement(RangeBar, { from, to, setFrom, setTo }), /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "name", label: "Medicine", sortable: true },
        { key: "qty", label: "Qty Sold", align: "right", sortable: true },
        { key: "revenue", label: "Revenue", align: "right", sortable: true, render: (m) => money2(m.revenue) }
      ],
      rows: top,
      pageSize: 10,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u{1F48A}", title: "No medicine sales in range" })
    }
  )), /* @__PURE__ */ React21.createElement(Card, { title: "Low & Out of Stock", sub: `Minimum level per medicine \xB7 default ${settings.low_stock_default}` }, /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "name", label: "Medicine", sortValue: (r) => r.medicine.name, render: (r) => r.medicine.name },
        { key: "available", label: "Available", align: "right", render: (r) => /* @__PURE__ */ React21.createElement("b", null, r.available) },
        { key: "min", label: "Minimum", align: "right" },
        { key: "st", label: "Status", render: (r) => r.available <= 0 ? /* @__PURE__ */ React21.createElement(Badge, { tone: "red" }, "OUT") : /* @__PURE__ */ React21.createElement(Badge, { tone: "amber" }, "LOW") }
      ],
      rows: low ? [...low.out, ...low.low] : null,
      pageSize: 10,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u2705", title: "No low stock items" })
    }
  )), /* @__PURE__ */ React21.createElement(Card, { title: "Expiry Report", sub: "Expired stock and near-expiry batches with on-hand value" }, /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        {
          key: "state",
          label: "Status",
          render: (b) => b.state === "expired" ? /* @__PURE__ */ React21.createElement(Badge, { tone: "red" }, "EXPIRED") : /* @__PURE__ */ React21.createElement(Badge, { tone: b.days <= 30 ? "red" : b.days <= 60 ? "amber" : "blue" }, b.days, "d left")
        },
        { key: "med_name", label: "Medicine", sortable: true },
        { key: "batch", label: "Batch #", render: (b) => b.batch.batch_no },
        { key: "expiry", label: "Expiry", sortable: true },
        { key: "on_hand", label: "On Hand", align: "right" },
        { key: "value", label: "Value (buy)", align: "right", render: (b) => money2(b.on_hand * (b.batch.purchase_price || 0)) }
      ],
      rows: exp ? [
        ...exp.expired.map((b) => ({ ...b, state: "expired", days: b.days })),
        ...exp.d30.map((b) => ({ ...b, state: "n30" })),
        ...exp.d60.map((b) => ({ ...b, state: "n60" })),
        ...exp.d90.map((b) => ({ ...b, state: "n90" }))
      ] : null,
      pageSize: 12,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u2705", title: "Nothing expired or near expiry" })
    }
  )));
}
function FinancialTab({ from, to, setFrom, setTo, settings }) {
  const data = useLiveQuery14(() => financialReport(from, to), [from, to]);
  const money2 = (v) => fmtMoney(v, settings.currency);
  return /* @__PURE__ */ React21.createElement("div", { className: "rep-stacks" }, /* @__PURE__ */ React21.createElement(Card, { title: "Financial Summary" }, /* @__PURE__ */ React21.createElement(RangeBar, { from, to, setFrom, setTo }), data && /* @__PURE__ */ React21.createElement("div", { className: "rep-summary" }, /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, /* @__PURE__ */ React21.createElement(TrendingUp2, { size: 13 }), " Revenue: ", /* @__PURE__ */ React21.createElement("b", null, money2(data.revenue))), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, /* @__PURE__ */ React21.createElement(Wallet4, { size: 13 }), " Expenses: ", /* @__PURE__ */ React21.createElement("b", null, money2(data.expenses))), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Est. Profit: ", /* @__PURE__ */ React21.createElement("b", { className: data.profit < 0 ? "val-red" : "val-green" }, money2(data.profit))), /* @__PURE__ */ React21.createElement("span", { className: "cat-chip" }, "Pending receivables: ", /* @__PURE__ */ React21.createElement("b", null, money2(data.pending_payments.reduce((s, p) => s + p.due, 0))), " (", data.pending_payments.length, " bills)")), data && /* @__PURE__ */ React21.createElement("div", { className: "fin-cols" }, /* @__PURE__ */ React21.createElement("div", null, /* @__PURE__ */ React21.createElement("h4", { className: "sub-head" }, "Revenue by Payment Method"), /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "method", label: "Method" },
        { key: "amount", label: "Amount", align: "right", render: (r) => money2(r.amount) }
      ],
      rows: Object.entries(data.revenue_by_method).map(([method, amount]) => ({ method, amount })),
      pageSize: 6,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u{1F4B3}", title: "No collections in range" })
    }
  )), /* @__PURE__ */ React21.createElement("div", null, /* @__PURE__ */ React21.createElement("h4", { className: "sub-head" }, "Expenses by Category"), /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "cat", label: "Category" },
        { key: "amount", label: "Amount", align: "right", render: (r) => money2(r.amount) }
      ],
      rows: Object.entries(data.expenses_by_category).map(([cat, amount]) => ({ cat, amount })),
      pageSize: 6,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u{1F4B0}", title: "No expenses in range" })
    }
  ))), /* @__PURE__ */ React21.createElement("h4", { className: "sub-head" }, "Pending Payments (all time, oldest first)"), /* @__PURE__ */ React21.createElement(
    DataTable,
    {
      dense: true,
      columns: [
        { key: "bill_no", label: "Bill #", render: (r) => /* @__PURE__ */ React21.createElement("span", { className: "cell-mono" }, r.bill.bill_no) },
        { key: "patient", label: "Patient", sortValue: (r) => r.bill.patient_name, render: (r) => r.bill.patient_name },
        { key: "due", label: "UHID", render: (r) => /* @__PURE__ */ React21.createElement("span", { className: "cell-mono" }, r.bill.uhid) },
        { key: "date", label: "Bill Date", sortValue: (r) => r.bill.date, render: (r) => fmtDate(r.bill.date) },
        { key: "age", label: "Days", align: "right", sortable: true, render: (r) => Math.max(0, -r.days) },
        { key: "amt", label: "Due", align: "right", sortable: true, sortValue: (r) => r.due, render: (r) => /* @__PURE__ */ React21.createElement("b", { className: "val-red" }, money2(r.due)) }
      ],
      rows: data?.pending_payments,
      pageSize: 10,
      empty: /* @__PURE__ */ React21.createElement(EmptyState, { compact: true, icon: "\u2705", title: "All bills settled" })
    }
  )));
}
function Reports() {
  const { settings } = useApp();
  const [tab, setTab] = useState18("sales");
  const [from, setFrom] = useState18(dkey(addDays(/* @__PURE__ */ new Date(), -29)));
  const [to, setTo] = useState18(dkey(/* @__PURE__ */ new Date()));
  const tabs = [
    { key: "sales", label: "Sales" },
    { key: "patients", label: "Patients" },
    { key: "medicines", label: "Medicines" },
    { key: "financial", label: "Financial" }
  ];
  return /* @__PURE__ */ React21.createElement("div", { className: "page" }, /* @__PURE__ */ React21.createElement(PageHeader, { title: "Reports & Analytics", sub: "Date-range reports with CSV export and print" }), /* @__PURE__ */ React21.createElement("div", { className: "tabs rep-tabs" }, tabs.map((t) => /* @__PURE__ */ React21.createElement("button", { key: t.key, className: `tab ${tab === t.key ? "tab-active" : ""}`, onClick: () => setTab(t.key) }, t.label))), tab === "sales" && /* @__PURE__ */ React21.createElement(SalesTab, { from, to, setFrom, setTo, settings }), tab === "patients" && /* @__PURE__ */ React21.createElement(PatientsTab, { from, to, setFrom, setTo }), tab === "medicines" && /* @__PURE__ */ React21.createElement(MedicinesTab, { from, to, setFrom, setTo, settings }), tab === "financial" && /* @__PURE__ */ React21.createElement(FinancialTab, { from, to, setFrom, setTo, settings }));
}
var PRESETS;
var init_Reports = __esm({
  "src/pages/Reports.jsx"() {
    init_AppContext();
    init_ui();
    init_reports();
    init_inventory();
    init_printers();
    init_utils();
    PRESETS = [
      { label: "Today", get: () => [dkey(/* @__PURE__ */ new Date()), dkey(/* @__PURE__ */ new Date())] },
      { label: "7 days", get: () => [dkey(addDays(/* @__PURE__ */ new Date(), -6)), dkey(/* @__PURE__ */ new Date())] },
      { label: "30 days", get: () => [dkey(addDays(/* @__PURE__ */ new Date(), -29)), dkey(/* @__PURE__ */ new Date())] },
      { label: "This month", get: () => [dkey(/* @__PURE__ */ new Date()).slice(0, 8) + "01", dkey(/* @__PURE__ */ new Date())] },
      { label: "This year", get: () => [dkey(/* @__PURE__ */ new Date()).slice(0, 5) + "01-01", dkey(/* @__PURE__ */ new Date())] }
    ];
  }
});

// src/pages/Alerts.jsx
import React22, { useState as useState19 } from "react";
import { useLiveQuery as useLiveQuery15 } from "dexie-react-hooks";
import { Bell as Bell2, CheckCheck, AlertTriangle as AlertTriangle6, Hourglass as Hourglass3, PackageX, Wallet as Wallet5, CalendarDays as CalendarDays4 } from "lucide-react";
function Alerts() {
  const { pushToast, refreshNotifs } = useApp();
  const [sevF, setSevF] = useState19("");
  const [typeF, setTypeF] = useState19("");
  const [unreadOnly, setUnreadOnly] = useState19(true);
  const notifs = useLiveQuery15(async () => {
    let list = await db_default.notifications.orderBy("at").reverse().toArray();
    if (sevF) list = list.filter((n) => n.severity === sevF);
    if (typeF) list = list.filter((n) => n.type === typeF);
    if (unreadOnly) list = list.filter((n) => !n.read);
    return list.slice(0, 100);
  }, [sevF, typeF, unreadOnly]);
  const unreads = useLiveQuery15(() => unreadCount(), []);
  return /* @__PURE__ */ React22.createElement("div", { className: "page" }, /* @__PURE__ */ React22.createElement(
    PageHeader,
    {
      title: "Alerts & Notifications",
      sub: `${unreads ?? 0} unread \xB7 auto-generated from stock, expiry, payments & appointments`,
      actions: /* @__PURE__ */ React22.createElement(Btn, { variant: "ghost", icon: CheckCheck, disabled: !unreads, onClick: async () => {
        await markAllRead();
        refreshNotifs();
        pushToast("success", "All notifications marked read");
      } }, "Mark all read")
    }
  ), /* @__PURE__ */ React22.createElement(Card, null, /* @__PURE__ */ React22.createElement("div", { className: "toolbar" }, /* @__PURE__ */ React22.createElement(Select, { value: sevF, onChange: (e) => setSevF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React22.createElement("option", { value: "" }, "All severities"), /* @__PURE__ */ React22.createElement("option", { value: "danger" }, "Danger"), /* @__PURE__ */ React22.createElement("option", { value: "warning" }, "Warning"), /* @__PURE__ */ React22.createElement("option", { value: "info" }, "Info")), /* @__PURE__ */ React22.createElement(Select, { value: typeF, onChange: (e) => setTypeF(e.target.value), className: "toolbar-select" }, /* @__PURE__ */ React22.createElement("option", { value: "" }, "All types"), Object.entries(TYPE_META).map(([k, v]) => /* @__PURE__ */ React22.createElement("option", { key: k, value: k }, v.label))), /* @__PURE__ */ React22.createElement(Btn, { size: "sm", variant: unreadOnly ? "primary" : "ghost", onClick: () => setUnreadOnly((v) => !v) }, unreadOnly ? "Unread only" : "Show all")), !notifs ? /* @__PURE__ */ React22.createElement(EmptyState, { compact: true, title: "Loading\u2026" }) : notifs.length === 0 ? /* @__PURE__ */ React22.createElement(EmptyState, { icon: "\u{1F514}", title: "No notifications", message: "Stock, expiry, payment and appointment alerts will appear here automatically." }) : /* @__PURE__ */ React22.createElement("div", { className: "alert-list" }, notifs.map((n) => {
    const meta = TYPE_META[n.type] || { icon: Bell2, label: n.type };
    const Icon = meta.icon;
    return /* @__PURE__ */ React22.createElement(
      "button",
      {
        key: n.id,
        className: cx("alert-item", !n.read && "alert-unread", `alert-${n.severity}`),
        onClick: async () => {
          await db_default.notifications.put({ ...n, read: true });
          refreshNotifs();
        }
      },
      /* @__PURE__ */ React22.createElement("span", { className: cx("alert-ic", `ai-${n.severity}`) }, /* @__PURE__ */ React22.createElement(Icon, { size: 16 })),
      /* @__PURE__ */ React22.createElement("span", { className: "alert-body" }, /* @__PURE__ */ React22.createElement("span", { className: "alert-title" }, n.title, " ", /* @__PURE__ */ React22.createElement(Badge, { tone: n.severity === "danger" ? "red" : n.severity === "warning" ? "amber" : "blue" }, meta.label)), /* @__PURE__ */ React22.createElement("span", { className: "alert-msg" }, n.message)),
      /* @__PURE__ */ React22.createElement("span", { className: "alert-when" }, fmtDateTime(n.at)),
      !n.read && /* @__PURE__ */ React22.createElement("span", { className: "alert-unread-dot", title: "Click to mark read" })
    );
  }))));
}
var TYPE_META;
var init_Alerts = __esm({
  "src/pages/Alerts.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_notifications();
    init_utils();
    TYPE_META = {
      low_stock: { icon: AlertTriangle6, label: "Low Stock" },
      out_of_stock: { icon: PackageX, label: "Out of Stock" },
      expired: { icon: Hourglass3, label: "Expired Medicine" },
      expiring_30: { icon: Hourglass3, label: "Expiring \u2264 30d" },
      expiring_60: { icon: Hourglass3, label: "Expiring \u2264 60d" },
      expiring_90: { icon: Hourglass3, label: "Expiring \u2264 90d" },
      pending_payment: { icon: Wallet5, label: "Pending Payment" },
      appointment: { icon: CalendarDays4, label: "Appointment" }
    };
  }
});

// src/pages/Staff.jsx
import React23, { useState as useState20, useEffect as useEffect13 } from "react";
import { useLiveQuery as useLiveQuery16 } from "dexie-react-hooks";
import { Pencil as Pencil5, Archive as Archive2, Trash2 as Trash25, Plus as Plus11, Upload as Upload5 } from "lucide-react";
function DoctorModal({ open, onClose, editing }) {
  const { user: me, pushToast } = useApp();
  const [form, setForm] = useState20({ name: "", qualification: "", specialization: "", phone: "", email: "" });
  const [busy, setBusy] = useState20(false);
  const [error, setError] = useState20("");
  useEffect13(() => {
    if (!open) return;
    setForm(editing ? { name: editing.name || "", qualification: editing.qualification || "", specialization: editing.specialization || "", phone: editing.phone || "", email: editing.email || "" } : { name: "", qualification: "", specialization: "", phone: "", email: "" });
    setError("");
  }, [open, editing]);
  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const save = async () => {
    setError("");
    if (!form.name.trim()) {
      setError("Doctor name is required");
      return;
    }
    setBusy(true);
    try {
      if (editing) await updateDoctor(editing.id, form, me.id);
      else await createDoctor(form, me.id);
      pushToast("success", `${form.name} ${editing ? "updated" : "added to doctors directory"}`);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ React23.createElement(
    Modal,
    {
      open,
      onClose,
      title: editing ? `Edit ${editing.name}` : "Add Doctor",
      width: "md",
      footer: /* @__PURE__ */ React23.createElement(React23.Fragment, null, /* @__PURE__ */ React23.createElement(Btn, { variant: "ghost", onClick: onClose }, "Cancel"), /* @__PURE__ */ React23.createElement(Btn, { variant: "accent", onClick: save, disabled: busy }, busy ? "Saving\u2026" : "Save Doctor"))
    },
    error && /* @__PURE__ */ React23.createElement("div", { className: "form-alert" }, error),
    /* @__PURE__ */ React23.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React23.createElement(Field, { label: "Doctor Full Name", required: true, className: "fg-2" }, /* @__PURE__ */ React23.createElement(Input, { value: form.name, onChange: set("name") })), /* @__PURE__ */ React23.createElement(Field, { label: "Qualification" }, /* @__PURE__ */ React23.createElement(Input, { value: form.qualification, onChange: set("qualification") })), /* @__PURE__ */ React23.createElement(Field, { label: "Specialization" }, /* @__PURE__ */ React23.createElement(Input, { value: form.specialization, onChange: set("specialization") })), /* @__PURE__ */ React23.createElement(Field, { label: "Phone / Mobile" }, /* @__PURE__ */ React23.createElement(Input, { value: form.phone, onChange: set("phone") })), /* @__PURE__ */ React23.createElement(Field, { label: "Email Address" }, /* @__PURE__ */ React23.createElement(Input, { type: "email", value: form.email, onChange: set("email") })))
  );
}
function Staff() {
  const { user: me, pushToast } = useApp();
  const [tab, setTab] = useState20("doctors");
  const [doctorModal, setDoctorModal] = useState20(false);
  const [importModal, setImportModal] = useState20(false);
  const [editingDoctor, setEditingDoctor] = useState20(null);
  const [archiveTarget, setArchiveTarget] = useState20(null);
  const [deleteTarget, setDeleteTarget] = useState20(null);
  const doctors = useLiveQuery16(async () => {
    const list = await db_default.doctors.toArray();
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const logs = useLiveQuery16(() => db_default.activity_logs.orderBy("at").reverse().limit(100).toArray(), []);
  return /* @__PURE__ */ React23.createElement("div", { className: "page" }, /* @__PURE__ */ React23.createElement(PageHeader, { title: "Staff & Users", sub: "Doctors directory \xB7 audit logging", actions: tab === "doctors" && /* @__PURE__ */ React23.createElement("div", { style: { display: "flex", gap: "8px" } }, /* @__PURE__ */ React23.createElement(Btn, { variant: "ghost", icon: Upload5, onClick: () => setImportModal(true) }, "Import CSV"), /* @__PURE__ */ React23.createElement(Btn, { variant: "accent", icon: Plus11, onClick: () => {
    setEditingDoctor(null);
    setDoctorModal(true);
  } }, "+ Add Doctor")) }), /* @__PURE__ */ React23.createElement(Tabs, { active: tab, onChange: setTab, tabs: [{ key: "doctors", label: "Doctors", badge: doctors?.length }, { key: "audit", label: "Activity Log", badge: "recent" }] }), tab === "doctors" && /* @__PURE__ */ React23.createElement(Card, { title: "Doctors Directory", sub: "Consulting doctors, qualifications & specialties" }, /* @__PURE__ */ React23.createElement(DataTable, { columns: [
    { key: "name", label: "Doctor", sortable: true, render: (doctor) => /* @__PURE__ */ React23.createElement("div", null, /* @__PURE__ */ React23.createElement("div", { className: "cell-main" }, doctor.name), /* @__PURE__ */ React23.createElement("div", { className: "cell-sub" }, doctor.qualification, doctor.specialization ? ` \xB7 ${doctor.specialization}` : "")) },
    { key: "phone", label: "Phone", render: (doctor) => doctor.phone || "\u2014" },
    { key: "email", label: "Email", render: (doctor) => doctor.email || "\u2014" },
    { key: "active", label: "Status", render: (doctor) => doctor.active ? /* @__PURE__ */ React23.createElement(Badge, { tone: "green" }, "Active") : /* @__PURE__ */ React23.createElement(Badge, { tone: "gray" }, "Archived") },
    { key: "actions", label: "", align: "right", render: (doctor) => /* @__PURE__ */ React23.createElement("span", { className: "cell-actions", onClick: (event) => event.stopPropagation() }, /* @__PURE__ */ React23.createElement(Btn, { size: "sm", variant: "ghost", icon: Pencil5, onClick: () => {
      setEditingDoctor(doctor);
      setDoctorModal(true);
    } }, "Edit"), /* @__PURE__ */ React23.createElement(Btn, { size: "sm", variant: "ghost", icon: Archive2, onClick: () => setArchiveTarget(doctor) }, doctor.active ? "Archive" : "Reactivate"), /* @__PURE__ */ React23.createElement(Btn, { size: "sm", variant: "ghost", icon: Trash25, onClick: () => setDeleteTarget(doctor) }, "Delete")) }
  ], rows: doctors, pageSize: 10, loading: !doctors, empty: /* @__PURE__ */ React23.createElement(EmptyState, { icon: "\u{1FA7A}", title: "No doctors registered", action: /* @__PURE__ */ React23.createElement(Btn, { size: "sm", variant: "accent", onClick: () => setDoctorModal(true) }, "+ Add Doctor") }) })), tab === "audit" && /* @__PURE__ */ React23.createElement(Card, { title: "Activity Log", sub: "Chronological record of clinic operations" }, /* @__PURE__ */ React23.createElement(DataTable, { dense: true, columns: [{ key: "at", label: "When", sortable: true, render: (log) => /* @__PURE__ */ React23.createElement("span", { className: "cell-sub" }, fmtDateTime(log.at)) }, { key: "user_name", label: "User", render: (log) => /* @__PURE__ */ React23.createElement("b", null, log.user_name || "system") }, { key: "action", label: "Action", render: (log) => /* @__PURE__ */ React23.createElement(Badge, { tone: "navy" }, log.action) }, { key: "entity", label: "Entity", render: (log) => log.entity || "\u2014" }, { key: "detail", label: "Detail", render: (log) => /* @__PURE__ */ React23.createElement("span", { className: "cell-ellip", title: log.detail }, log.detail || "\u2014") }], rows: logs, pageSize: 15, empty: /* @__PURE__ */ React23.createElement(EmptyState, { icon: "\u{1F4DC}", title: "No activity yet" }) })), /* @__PURE__ */ React23.createElement(DoctorModal, { open: doctorModal, onClose: () => {
    setDoctorModal(false);
    setEditingDoctor(null);
  }, editing: editingDoctor }), /* @__PURE__ */ React23.createElement(CsvImportModal, { open: importModal, onClose: () => setImportModal(false), type: "doctors", context: { existingDoctors: doctors } }), /* @__PURE__ */ React23.createElement(Confirm, { open: !!archiveTarget, onClose: () => setArchiveTarget(null), title: `${archiveTarget?.active ? "Archive" : "Reactivate"} ${archiveTarget?.name}?`, message: archiveTarget?.active ? "Archived doctors will not appear in new consultation or appointment dropdowns, but historical records remain connected." : "Reactivate this doctor to allow new consultations and appointments.", confirmText: archiveTarget?.active ? "Archive doctor" : "Reactivate", onConfirm: async () => {
    await archiveDoctor(archiveTarget.id, me.id);
    pushToast("success", `${archiveTarget.name} ${archiveTarget.active ? "archived" : "reactivated"}`);
    setArchiveTarget(null);
  } }), /* @__PURE__ */ React23.createElement(Confirm, { open: !!deleteTarget, onClose: () => setDeleteTarget(null), title: `Delete ${deleteTarget?.name}?`, message: "Doctors with recorded consultations or appointments cannot be deleted and must be archived instead.", danger: true, confirmText: "Delete doctor", onConfirm: async () => {
    try {
      await deleteDoctor(deleteTarget.id, me.id);
      pushToast("success", `${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch (e) {
      pushToast("error", e.message);
    }
  } }));
}
var init_Staff = __esm({
  "src/pages/Staff.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_clinical();
    init_utils();
    init_CsvImportModal();
  }
});

// src/pages/SettingsPage.jsx
import React24, { useState as useState21, useEffect as useEffect14, useRef as useRef3 } from "react";
import { useSearchParams as useSearchParams7 } from "react-router-dom";
import { useLiveQuery as useLiveQuery17 } from "dexie-react-hooks";
import { Building2, ReceiptText as ReceiptText6, Fingerprint, Boxes as Boxes3, Printer as Printer7, Palette, Database, ShieldCheck, Upload as Upload6, Download as Download8, RotateCcw as RotateCcw2, AlertTriangle as AlertTriangle7 } from "lucide-react";
function Section({ icon: Icon, title, sub, children }) {
  return /* @__PURE__ */ React24.createElement(Card, { title, sub, actions: /* @__PURE__ */ React24.createElement("span", { className: "set-ic" }, /* @__PURE__ */ React24.createElement(Icon, { size: 17 })) }, children);
}
function SettingsPage() {
  const { settings, updateSettings, user: user3, pushToast, theme, setTheme, lang, setLang } = useApp();
  const [params, setParams] = useSearchParams7();
  const [tab, setTab] = useState21(params.get("tab") || "clinic");
  const [msg, setMsg] = useState21(params.get("msg") || "");
  const [f, setF] = useState21({});
  const [busy, setBusy] = useState21(false);
  const [resetOpen, setResetOpen] = useState21(false);
  const logoRef = useRef3(null);
  const importRef = useRef3(null);
  useEffect14(() => {
    const t = params.get("tab");
    if (t) setTab(t);
    const m = params.get("msg");
    if (m) setMsg(decodeURIComponent(m));
  }, [params]);
  useEffect14(() => {
    if (!msg) return void 0;
    const h2 = setTimeout(() => {
      setMsg("");
      setParams((p) => {
        p.delete("msg");
        return p;
      }, { replace: true });
    }, 5e3);
    return () => clearTimeout(h2);
  }, [msg, setParams]);
  const logs = useLiveQuery17(async () => db_default.activity_logs.orderBy("at").reverse().limit(10).toArray(), []);
  const counts = useLiveQuery17(async () => {
    const [patients, bills, meds] = await Promise.all([
      db_default.patients.count(),
      db_default.bills.count(),
      db_default.medicines.count()
    ]);
    return { patients, bills, meds };
  }, []);
  useEffect14(() => {
    setF({
      clinic_name: settings.clinic_name,
      tagline: settings.tagline,
      doctor_name: settings.doctor_name,
      doctor_qual: settings.doctor_qual,
      doctor_role: settings.doctor_role,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      receipt_footer: settings.receipt_footer,
      logo: settings.logo,
      currency: settings.currency,
      bill_prefix: settings.bill_prefix,
      bill_padding: settings.bill_padding,
      default_payment: settings.default_payment,
      uhid_prefix: settings.uhid_prefix,
      uhid_include_year: settings.uhid_include_year,
      uhid_padding: settings.uhid_padding,
      uhid_start: settings.uhid_start,
      low_stock_default: settings.low_stock_default,
      expiry_30: settings.expiry_30,
      expiry_60: settings.expiry_60,
      expiry_90: settings.expiry_90,
      fefo: settings.fefo
    });
  }, [settings]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setBool = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const save = async (keys) => {
    setBusy(true);
    try {
      const patch = {};
      for (const k of keys) patch[k] = f[k];
      await updateSettings(patch);
      pushToast("success", "Settings saved");
    } catch (e) {
      pushToast("error", e.message);
    } finally {
      setBusy(false);
    }
  };
  const uploadLogo = (file) => {
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, logo: reader.result }));
    reader.readAsDataURL(file);
  };
  const exportBackup = async () => {
    const tables = {};
    for (const t of db_default.tables) {
      tables[t.name] = await t.toArray();
    }
    const payload = { app: "HEEVA CLINIC", version: 1, exported_at: (/* @__PURE__ */ new Date()).toISOString(), data: tables };
    download(`heeva-backup-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`, JSON.stringify(payload), "application/json");
    pushToast("success", "Backup exported");
  };
  const importBackup = async (file) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.app !== "HEEVA CLINIC" || !payload.data) throw new Error("Not a valid HEEVA CLINIC backup file");
      await db_default.transaction("rw", db_default.tables, async () => {
        for (const t of db_default.tables) {
          const rows = payload.data[t.name];
          if (!Array.isArray(rows)) continue;
          await t.clear();
          await t.bulkPut(rows);
        }
      });
      await updateSettings({});
      pushToast("success", "Backup restored");
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      pushToast("error", `Import failed: ${e.message}`);
    }
  };
  const tabDefs = [
    { key: "clinic", label: "Clinic", icon: Building2 },
    { key: "billing", label: "Billing", icon: ReceiptText6 },
    { key: "uhid", label: "UHID", icon: Fingerprint },
    { key: "inventory", label: "Inventory", icon: Boxes3 },
    { key: "print", label: "Print", icon: Printer7 },
    { key: "appearance", label: "Appearance", icon: Palette },
    { key: "data", label: "Data & Backup", icon: Database }
  ];
  const uhidPreview = (() => {
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    const n = Number(f.uhid_start) || 1;
    const pad = Number(f.uhid_padding) || 6;
    return `${(f.uhid_prefix || "HC").toUpperCase()}${f.uhid_include_year ? `-${year}` : ""}-${String(n).padStart(pad, "0")}`;
  })();
  return /* @__PURE__ */ React24.createElement("div", { className: "page" }, /* @__PURE__ */ React24.createElement(PageHeader, { title: "Settings", sub: "Configure the clinic profile, numbering, inventory rules and app behaviour" }), msg && /* @__PURE__ */ React24.createElement("div", { className: "set-msg" }, "\u2713 ", msg), /* @__PURE__ */ React24.createElement("div", { className: "tabs rep-tabs" }, tabDefs.map((t) => /* @__PURE__ */ React24.createElement("button", { key: t.key, className: `tab ${tab === t.key ? "tab-active" : ""}`, onClick: () => setTab(t.key) }, /* @__PURE__ */ React24.createElement(t.icon, { size: 14 }), " ", t.label))), tab === "clinic" && /* @__PURE__ */ React24.createElement(Section, { icon: Building2, title: "Clinic Profile", sub: "Shown on payment receipts and prescription letterheads" }, /* @__PURE__ */ React24.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React24.createElement(Field, { label: "Clinic Name", className: "fg-2" }, /* @__PURE__ */ React24.createElement(Input, { value: f.clinic_name, onChange: set("clinic_name") })), /* @__PURE__ */ React24.createElement(Field, { label: "Tagline", className: "fg-2" }, /* @__PURE__ */ React24.createElement(Input, { value: f.tagline, onChange: set("tagline") })), /* @__PURE__ */ React24.createElement(Field, { label: "Doctor Name" }, /* @__PURE__ */ React24.createElement(Input, { value: f.doctor_name, onChange: set("doctor_name") })), /* @__PURE__ */ React24.createElement(Field, { label: "Qualifications" }, /* @__PURE__ */ React24.createElement(Input, { value: f.doctor_qual, onChange: set("doctor_qual") })), /* @__PURE__ */ React24.createElement(Field, { label: "Role" }, /* @__PURE__ */ React24.createElement(Input, { value: f.doctor_role, onChange: set("doctor_role") })), /* @__PURE__ */ React24.createElement(Field, { label: "Phone" }, /* @__PURE__ */ React24.createElement(Input, { value: f.phone, onChange: set("phone") })), /* @__PURE__ */ React24.createElement(Field, { label: "Email", className: "fg-2" }, /* @__PURE__ */ React24.createElement(Input, { value: f.email, onChange: set("email") })), /* @__PURE__ */ React24.createElement(Field, { label: "Address", className: "fg-2" }, /* @__PURE__ */ React24.createElement(Textarea, { rows: 2, value: f.address, onChange: set("address") })), /* @__PURE__ */ React24.createElement(Field, { label: "Receipt Footer", className: "fg-2" }, /* @__PURE__ */ React24.createElement(Input, { value: f.receipt_footer, onChange: set("receipt_footer") })), /* @__PURE__ */ React24.createElement(Field, { label: "Logo", hint: "PNG/JPG \u2014 used on A4 documents" }, /* @__PURE__ */ React24.createElement("div", { className: "logo-row" }, f.logo ? /* @__PURE__ */ React24.createElement("img", { src: f.logo, alt: "logo", className: "logo-preview" }) : /* @__PURE__ */ React24.createElement(Logo, { size: 44 }), /* @__PURE__ */ React24.createElement("input", { type: "file", accept: "image/*", hidden: true, ref: logoRef, onChange: (e) => e.target.files?.[0] && uploadLogo(e.target.files[0]) }), /* @__PURE__ */ React24.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => logoRef.current?.click() }, "Upload"), f.logo && /* @__PURE__ */ React24.createElement(Btn, { size: "sm", variant: "ghost", onClick: () => setF((x) => ({ ...x, logo: "" })) }, "Remove")))), /* @__PURE__ */ React24.createElement("div", { className: "set-save" }, /* @__PURE__ */ React24.createElement(Btn, { variant: "accent", disabled: busy, onClick: () => save(["clinic_name", "tagline", "doctor_name", "doctor_qual", "doctor_role", "address", "phone", "email", "receipt_footer", "logo"]) }, busy ? "Saving\u2026" : "Save clinic profile"))), tab === "billing" && /* @__PURE__ */ React24.createElement(Section, { icon: ReceiptText6, title: "Billing Settings", sub: "Currency, bill numbering and default payment method" }, /* @__PURE__ */ React24.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React24.createElement(Field, { label: "Currency Symbol" }, /* @__PURE__ */ React24.createElement(Input, { value: f.currency, onChange: set("currency") })), /* @__PURE__ */ React24.createElement(Field, { label: "Bill Number Prefix" }, /* @__PURE__ */ React24.createElement(Input, { value: f.bill_prefix, onChange: set("bill_prefix") })), /* @__PURE__ */ React24.createElement(Field, { label: "Bill Number Padding" }, /* @__PURE__ */ React24.createElement(Input, { type: "number", min: "3", max: "10", value: f.bill_padding, onChange: set("bill_padding") })), /* @__PURE__ */ React24.createElement(Field, { label: "Default Payment Method" }, /* @__PURE__ */ React24.createElement(Select, { value: f.default_payment, onChange: set("default_payment") }, ["Cash", "UPI", "Card", "Bank Transfer", "Other"].map((m) => /* @__PURE__ */ React24.createElement("option", { key: m }, m)))), /* @__PURE__ */ React24.createElement("div", { className: "set-preview" }, /* @__PURE__ */ React24.createElement("span", { className: "set-preview-label" }, "Next bill number preview"), /* @__PURE__ */ React24.createElement(Badge, { tone: "navy", className: "set-preview-badge" }, f.bill_prefix, "-", (/* @__PURE__ */ new Date()).getFullYear(), "-000001"))), /* @__PURE__ */ React24.createElement("div", { className: "set-save" }, /* @__PURE__ */ React24.createElement(Btn, { variant: "accent", disabled: busy, onClick: () => save(["currency", "bill_prefix", "bill_padding", "default_payment"]) }, busy ? "Saving\u2026" : "Save billing settings"))), tab === "uhid" && /* @__PURE__ */ React24.createElement(Section, { icon: Fingerprint, title: "UHID Configuration", sub: "Unique Health Identification format \u2014 applied to NEW registrations only; existing UHIDs never change" }, /* @__PURE__ */ React24.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React24.createElement(Field, { label: "UHID Prefix" }, /* @__PURE__ */ React24.createElement(Input, { value: f.uhid_prefix, onChange: set("uhid_prefix"), placeholder: "HC" })), /* @__PURE__ */ React24.createElement(Field, { label: "Include Registration Year" }, /* @__PURE__ */ React24.createElement(Toggle, { checked: !!f.uhid_include_year, onChange: setBool("uhid_include_year"), label: f.uhid_include_year ? "Yes \u2014 HC-2026-000001" : "No \u2014 HC-000001" })), /* @__PURE__ */ React24.createElement(Field, { label: "Number Padding (digits)" }, /* @__PURE__ */ React24.createElement(Input, { type: "number", min: "3", max: "10", value: f.uhid_padding, onChange: set("uhid_padding") })), /* @__PURE__ */ React24.createElement(Field, { label: "Starting Number", hint: "Applies to the first UHID of a new year/scope" }, /* @__PURE__ */ React24.createElement(Input, { type: "number", min: "1", value: f.uhid_start, onChange: set("uhid_start") })), /* @__PURE__ */ React24.createElement("div", { className: "set-preview fg-2" }, /* @__PURE__ */ React24.createElement("span", { className: "set-preview-label" }, "Next UHID preview"), /* @__PURE__ */ React24.createElement(Badge, { tone: "teal", className: "set-preview-badge" }, uhidPreview))), /* @__PURE__ */ React24.createElement("div", { className: "uhid-rules" }, /* @__PURE__ */ React24.createElement(ShieldCheck, { size: 16 }), /* @__PURE__ */ React24.createElement("span", null, "UHID is assigned once, permanently linked to the patient, stored with a unique database constraint, and appears on bills, prescriptions, receipts and history.")), /* @__PURE__ */ React24.createElement("div", { className: "set-save" }, /* @__PURE__ */ React24.createElement(Btn, { variant: "accent", disabled: busy, onClick: () => save(["uhid_prefix", "uhid_include_year", "uhid_padding", "uhid_start"]) }, busy ? "Saving\u2026" : "Save UHID settings"))), tab === "inventory" && /* @__PURE__ */ React24.createElement(Section, { icon: Boxes3, title: "Inventory Rules", sub: "Low-stock thresholds, expiry alert windows and batch selection" }, /* @__PURE__ */ React24.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React24.createElement(Field, { label: "Default Low-Stock Level" }, /* @__PURE__ */ React24.createElement(Input, { type: "number", min: "0", value: f.low_stock_default, onChange: set("low_stock_default") })), /* @__PURE__ */ React24.createElement(Field, { label: "Expiry Alert Window 1 (days)" }, /* @__PURE__ */ React24.createElement(Input, { type: "number", min: "1", value: f.expiry_30, onChange: set("expiry_30") })), /* @__PURE__ */ React24.createElement(Field, { label: "Expiry Alert Window 2 (days)" }, /* @__PURE__ */ React24.createElement(Input, { type: "number", min: "1", value: f.expiry_60, onChange: set("expiry_60") })), /* @__PURE__ */ React24.createElement(Field, { label: "Expiry Alert Window 3 (days)" }, /* @__PURE__ */ React24.createElement(Input, { type: "number", min: "1", value: f.expiry_90, onChange: set("expiry_90") })), /* @__PURE__ */ React24.createElement(Field, { label: "FEFO (First Expired First Out)" }, /* @__PURE__ */ React24.createElement(Toggle, { checked: !!f.fefo, onChange: setBool("fefo"), label: f.fefo ? "Enabled \u2014 billing picks earliest-expiry batch" : "Disabled \u2014 FIFO by manufacturing date" }))), /* @__PURE__ */ React24.createElement("div", { className: "set-save" }, /* @__PURE__ */ React24.createElement(Btn, { variant: "accent", disabled: busy, onClick: () => save(["low_stock_default", "expiry_30", "expiry_60", "expiry_90", "fefo"]) }, busy ? "Saving\u2026" : "Save inventory rules"))), tab === "print" && /* @__PURE__ */ React24.createElement(Section, { icon: Printer7, title: "Print Settings", sub: "A4 landscape payment receipt with clinic and patient copies" }, /* @__PURE__ */ React24.createElement("div", { className: "set-preview" }, /* @__PURE__ */ React24.createElement("span", { className: "set-preview-label" }, "Available format"), /* @__PURE__ */ React24.createElement("div", { className: "set-chips" }, /* @__PURE__ */ React24.createElement(Badge, { tone: "teal" }, "A4 landscape \xB7 2 copies"), /* @__PURE__ */ React24.createElement(Badge, { tone: "gray" }, "Clinic copy"), /* @__PURE__ */ React24.createElement(Badge, { tone: "gray" }, "Patient copy")))), tab === "appearance" && /* @__PURE__ */ React24.createElement(Section, { icon: Palette, title: "Appearance", sub: "Theme and language" }, /* @__PURE__ */ React24.createElement("div", { className: "form-grid" }, /* @__PURE__ */ React24.createElement(Field, { label: "Theme" }, /* @__PURE__ */ React24.createElement("div", { className: "theme-opts" }, /* @__PURE__ */ React24.createElement(Btn, { variant: theme === "light" ? "primary" : "ghost", onClick: () => setTheme("light") }, "\u2600\uFE0F Light"), /* @__PURE__ */ React24.createElement(Btn, { variant: theme === "dark" ? "primary" : "ghost", onClick: () => setTheme("dark") }, "\u{1F319} Dark"))), /* @__PURE__ */ React24.createElement(Field, { label: "Language", hint: "Gujarati UI is in progress \u2014 English labels are used as fallback" }, /* @__PURE__ */ React24.createElement(Select, { value: lang, onChange: (e) => setLang(e.target.value) }, /* @__PURE__ */ React24.createElement("option", { value: "en" }, "English"), /* @__PURE__ */ React24.createElement("option", { value: "gu" }, "\u0A97\u0AC1\u0A9C\u0AB0\u0ABE\u0AA4\u0AC0 (Gujarati)"))))), tab === "data" && /* @__PURE__ */ React24.createElement(Section, { icon: Database, title: "Data, Backup & Maintenance", sub: "All data is stored locally on this device (offline-first). Export regular backups." }, /* @__PURE__ */ React24.createElement("div", { className: "data-grid" }, /* @__PURE__ */ React24.createElement("div", { className: "data-tile" }, /* @__PURE__ */ React24.createElement("span", null, "Patients"), /* @__PURE__ */ React24.createElement("b", null, counts?.patients ?? "\u2014")), /* @__PURE__ */ React24.createElement("div", { className: "data-tile" }, /* @__PURE__ */ React24.createElement("span", null, "Bills"), /* @__PURE__ */ React24.createElement("b", null, counts?.bills ?? "\u2014")), /* @__PURE__ */ React24.createElement("div", { className: "data-tile" }, /* @__PURE__ */ React24.createElement("span", null, "Medicines"), /* @__PURE__ */ React24.createElement("b", null, counts?.meds ?? "\u2014"))), /* @__PURE__ */ React24.createElement("div", { className: "data-actions" }, /* @__PURE__ */ React24.createElement(Btn, { variant: "outline", icon: Download8, onClick: exportBackup }, "Export Full Backup (JSON)"), /* @__PURE__ */ React24.createElement(Btn, { variant: "outline", icon: Upload6, onClick: () => importRef.current?.click() }, "Import Backup"), /* @__PURE__ */ React24.createElement("input", { type: "file", accept: "application/json", hidden: true, ref: importRef, onChange: (e) => {
    const f2 = e.target.files?.[0];
    if (f2) importBackup(f2);
    e.target.value = "";
  } }), user3?.role === "admin" && /* @__PURE__ */ React24.createElement(Btn, { variant: "danger", icon: RotateCcw2, onClick: () => setResetOpen(true) }, "Reset All Clinic Data")), /* @__PURE__ */ React24.createElement("div", { className: "data-warn" }, /* @__PURE__ */ React24.createElement(AlertTriangle7, { size: 15 }), " Bills, financial records and medicines with history are never deleted \u2014 they are cancelled/archived/voided with a full audit trail."), logs?.length > 0 && /* @__PURE__ */ React24.createElement(React24.Fragment, null, /* @__PURE__ */ React24.createElement("h4", { className: "sub-head" }, "Recent activity"), /* @__PURE__ */ React24.createElement("div", { className: "audit-mini" }, logs.map((l) => /* @__PURE__ */ React24.createElement("div", { key: l.id, className: "audit-row" }, /* @__PURE__ */ React24.createElement("span", { className: "audit-when" }, fmtDateTime(l.at)), /* @__PURE__ */ React24.createElement(Badge, { tone: "navy" }, l.action), /* @__PURE__ */ React24.createElement("span", { className: "audit-detail" }, l.user_name, " \u2014 ", l.detail)))))), /* @__PURE__ */ React24.createElement(
    Confirm,
    {
      open: resetOpen,
      onClose: () => setResetOpen(false),
      title: "Reset all clinic data?",
      message: "This deletes all local clinic records on this device. The authorized clinic account will be recreated on the next start. Export a backup first if you have real data.",
      danger: true,
      confirmText: "Yes, reset local data",
      onConfirm: async () => {
        await db_default.delete();
        window.location.reload();
      }
    }
  ));
}
var init_SettingsPage = __esm({
  "src/pages/SettingsPage.jsx"() {
    init_db();
    init_AppContext();
    init_ui();
    init_utils();
  }
});

// src/App.jsx
var App_exports = {};
__export(App_exports, {
  default: () => App
});
import React25 from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader } from "lucide-react";
function DatabaseErrorScreen({ message }) {
  return /* @__PURE__ */ React25.createElement("div", { className: "boot-screen" }, /* @__PURE__ */ React25.createElement(Logo, { size: 64 }), /* @__PURE__ */ React25.createElement("div", { className: "boot-name" }, "Database connection required"), /* @__PURE__ */ React25.createElement("div", { className: "boot-sub" }, message), /* @__PURE__ */ React25.createElement("button", { className: "btn btn-primary", onClick: () => window.location.reload() }, "Retry connection"));
}
function BootScreen() {
  return /* @__PURE__ */ React25.createElement("div", { className: "boot-screen" }, /* @__PURE__ */ React25.createElement(Logo, { size: 64 }), /* @__PURE__ */ React25.createElement("div", { className: "boot-name" }, "HEEVA CLINIC"), /* @__PURE__ */ React25.createElement("div", { className: "boot-sub" }, "Trusted care, every time."), /* @__PURE__ */ React25.createElement("div", { className: "boot-spinner" }, /* @__PURE__ */ React25.createElement(Loader, { size: 22, className: "spin" })));
}
function App() {
  const { booting, databaseError } = useApp();
  if (booting) return /* @__PURE__ */ React25.createElement(BootScreen, null);
  if (databaseError) return /* @__PURE__ */ React25.createElement(DatabaseErrorScreen, { message: databaseError });
  return /* @__PURE__ */ React25.createElement(ErrorBoundary, null, /* @__PURE__ */ React25.createElement(Routes, null, /* @__PURE__ */ React25.createElement(Route, { element: /* @__PURE__ */ React25.createElement(AppShell, null) }, /* @__PURE__ */ React25.createElement(Route, { path: "/", element: /* @__PURE__ */ React25.createElement(Dashboard, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/patients", element: /* @__PURE__ */ React25.createElement(Patients, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/patients/:id", element: /* @__PURE__ */ React25.createElement(PatientProfile, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/consultations", element: /* @__PURE__ */ React25.createElement(Consultations, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/appointments", element: /* @__PURE__ */ React25.createElement(Appointments, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/prescriptions", element: /* @__PURE__ */ React25.createElement(Prescriptions, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/billing", element: /* @__PURE__ */ React25.createElement(Billing, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/payments", element: /* @__PURE__ */ React25.createElement(Payments, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/medicines", element: /* @__PURE__ */ React25.createElement(Medicines, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/inventory", element: /* @__PURE__ */ React25.createElement(Inventory, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/returns", element: /* @__PURE__ */ React25.createElement(Returns, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/expenses", element: /* @__PURE__ */ React25.createElement(Expenses, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/reports", element: /* @__PURE__ */ React25.createElement(Reports, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/alerts", element: /* @__PURE__ */ React25.createElement(Alerts, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/staff", element: /* @__PURE__ */ React25.createElement(Staff, null) }), /* @__PURE__ */ React25.createElement(Route, { path: "/settings", element: /* @__PURE__ */ React25.createElement(SettingsPage, null) })), /* @__PURE__ */ React25.createElement(Route, { path: "*", element: /* @__PURE__ */ React25.createElement(Navigate, { to: "/", replace: true }) })));
}
var ErrorBoundary;
var init_App = __esm({
  "src/App.jsx"() {
    init_AppContext();
    init_AppShell();
    init_Dashboard();
    init_Patients();
    init_PatientProfile();
    init_Consultations();
    init_Appointments();
    init_Prescriptions();
    init_Billing();
    init_Payments();
    init_Medicines();
    init_Inventory();
    init_Returns();
    init_Expenses();
    init_Reports();
    init_Alerts();
    init_Staff();
    init_SettingsPage();
    init_ui();
    ErrorBoundary = class extends React25.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }
      static getDerivedStateFromError(error) {
        return { error };
      }
      componentDidCatch(error) {
        console.error("HEEVA CLINIC render error", error);
      }
      render() {
        if (!this.state.error) return this.props.children;
        return /* @__PURE__ */ React25.createElement("div", { className: "error-screen" }, /* @__PURE__ */ React25.createElement(Logo, { size: 56 }), /* @__PURE__ */ React25.createElement("h1", null, "HEEVA CLINIC"), /* @__PURE__ */ React25.createElement("h2", null, "Something went wrong"), /* @__PURE__ */ React25.createElement("p", null, "The application could not display this screen."), /* @__PURE__ */ React25.createElement("div", { className: "error-actions" }, /* @__PURE__ */ React25.createElement("button", { className: "btn btn-primary", onClick: () => this.setState({ error: null }) }, "Try Again"), /* @__PURE__ */ React25.createElement("button", { className: "btn btn-outline", onClick: () => window.location.reload() }, "Reload Application")));
      }
    };
  }
});

// scripts/render-test.mjs
import { createRequire } from "node:module";
var require2 = createRequire(import.meta.url);
var { JSDOM } = require2("jsdom");
var dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: "http://localhost/",
  pretendToBeVisual: true
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.File = dom.window.File;
global.FileReader = dom.window.FileReader;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
global.URL.createObjectURL = () => "blob:fake";
global.URL.revokeObjectURL = () => {
};
global.HTMLElement.prototype.scrollIntoView = () => {
};
global.HTMLElement.prototype.attachEvent = () => {
};
global.HTMLElement.prototype.detachEvent = () => {
};
dom.window.matchMedia = dom.window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener: () => {
}, removeEventListener: () => {
}, addListener: () => {
}, removeListener: () => {
} }));
global.matchMedia = dom.window.matchMedia;
global.IS_REACT_ACT_ENVIRONMENT = true;
await import("fake-indexeddb/auto");
var errors = [];
dom.window.addEventListener("error", (e) => errors.push("window.error: " + (e.error && e.error.stack || e.message)));
process.on("unhandledRejection", (e) => errors.push("unhandledRejection: " + (e && e.stack || e)));
var origConsoleError = console.error.bind(console);
console.error = (...a) => {
  const s = a.join(" ");
  if (!/Warning:|act\(\)|useLayoutEffect|findDOMNode|non-boolean|Each child|validateDOMNesting|deprecated/i.test(s)) errors.push("console.error: " + s.slice(0, 300));
  origConsoleError(...a);
};
var React26 = (await import("react")).default;
var { createRoot } = await import("react-dom/client");
var { MemoryRouter } = await import("react-router-dom");
var { AppProvider: AppProvider2 } = await Promise.resolve().then(() => (init_AppContext(), AppContext_exports));
var { PrintProvider: PrintProvider2 } = await Promise.resolve().then(() => (init_PrintContext(), PrintContext_exports));
var App2 = (await Promise.resolve().then(() => (init_App(), App_exports))).default;
var db2 = (await Promise.resolve().then(() => (init_db(), db_exports))).default;
var patientService = await Promise.resolve().then(() => (init_patients(), patients_exports));
var inventory = await Promise.resolve().then(() => (init_inventory(), inventory_exports));
var billing = await Promise.resolve().then(() => (init_billing(), billing_exports));
var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
var h = React26.createElement;
var passed = 0;
var ok = (m) => {
  console.log("  \u2713", m);
  passed++;
};
var fail = (m) => {
  console.error("  \u2717 FAIL:", m);
  process.exit(1);
};
console.log("HEEVA CLINIC render test\n");
var user2 = { id: "render-test-user" };
ok(`data layer ready \u2014 ${await db2.patients.count()} patients, ${await db2.bills.count()} bills`);
var patient = await patientService.registerPatient({ name: "Render Test Patient", gender: "Other", dob: "1990-01-01", mobile: "9000000002" }, user2.id);
var medicine = await inventory.createMedicine({ name: "Render Test Medicine", selling_price: 10 }, user2.id);
await inventory.createBatch({ medicine_id: medicine.id, batch_no: "RENDER-001", quantity: 20, expiry: "2099-12-31" }, user2.id);
var service = await billing.createService({ name: "Render Test Service", price: 25 }, user2.id);
await billing.createBill({ patient_id: patient.id, items: [{ item_type: "medicine", ref_id: medicine.id, qty: 1 }, { item_type: "service", ref_id: service.id, qty: 1 }], payments: [] }, user2.id);
async function renderRoute(path, expectText, waitMs = 600) {
  const rootEl = document.getElementById("root");
  rootEl.innerHTML = "";
  const before = errors.length;
  const root = createRoot(rootEl);
  root.render(
    h(
      AppProvider2,
      null,
      h(
        PrintProvider2,
        null,
        h(
          MemoryRouter,
          { initialEntries: [path] },
          h(App2, null)
        )
      )
    )
  );
  await sleep(waitMs);
  const text = rootEl.textContent || "";
  const missing = errors.length > before;
  if (missing) {
    errors.slice(before).forEach((e) => console.log("    \u2717 " + e.split("\n")[0]));
  }
  const found = expectText.length ? expectText.every((t) => text.includes(t)) : text.length > 200;
  if (found && !missing) ok(`route ${path.padEnd(28)} \u2192 ${text.length} chars rendered`);
  else if (missing) {
    errors.push(`route ${path}: errors above`);
    throw new Error("route " + path + " threw");
  } else {
    fail(`route ${path}: expected ${JSON.stringify(expectText)}, got "${text.slice(0, 120)}\u2026"`);
  }
  root.unmount();
  return text;
}
var firstPatient = (await db2.patients.toArray())[0];
var pid = firstPatient.id;
var bill = await db2.bills.where("status").equals("completed").first();
await renderRoute("/", ["Dashboard", "Today"], 1200);
await renderRoute("/patients", ["Patients", "UHID"]);
await renderRoute(`/patients/${pid}`, [firstPatient.uhid, firstPatient.name]);
await renderRoute("/consultations", ["Consultations"]);
await renderRoute("/appointments", ["Appointment"]);
await renderRoute("/prescriptions", ["Prescription"]);
await renderRoute("/billing", ["Billing", "Patient"]);
await renderRoute(`/billing?bill=${bill.id}`, ["BILL"], 900);
await renderRoute("/payments", ["Payments", "Outstanding"]);
await renderRoute("/medicines", ["Medicines"]);
await renderRoute("/inventory", ["Inventory"]);
await renderRoute("/returns", ["Return"]);
await renderRoute("/expenses", ["Expense"]);
await renderRoute("/reports", ["Report", "Sales"]);
await renderRoute("/alerts", ["Alerts", "otification".toLowerCase()]);
await renderRoute("/staff", ["Staff", "Doctor"]);
await renderRoute("/settings", ["Settings", "Clinic Profile"]);
console.log(`
${passed} checks passed \u2014 every page renders.`);
process.exit(0);
