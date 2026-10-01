// ─── HEEVA CLINIC — core: settings, counters, audit, numbering ─────────────
import db from '../db';
import { uid, nowISO } from '../utils';

export const SECTIONS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'patients', label: 'Patients' },
  { key: 'consultations', label: 'Consultations' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'prescriptions', label: 'Prescriptions' },
  { key: 'billing', label: 'Billing' },
  { key: 'payments', label: 'Payments' },
  { key: 'medicines', label: 'Medicines' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'returns', label: 'Returns' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'reports', label: 'Reports' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'staff', label: 'Staff & Users' },
  { key: 'settings', label: 'Settings' },
];

export const DEFAULT_PERMISSIONS = { admin: SECTIONS.map((s) => s.key) };

export const DEFAULT_SETTINGS = {
  clinic_name: 'HEEVA CLINIC',
  tagline: 'Trusted care, every time.',
  doctor_name: 'Dr. Mit Nayak', doctor_phone: '9913974000', doctor_qual: 'M.B.B.S., M.D.', doctor_role: 'Consulting Physician',
  address: 'A/8, MONARCH, Pal Gam, Surat, Gujarat – 394510',
  phone: '9913974000', email: '',
  logo: '/icons/heeva-logo.png',
  receipt_footer: 'Thank you for choosing Heeva Clinic.',
  currency: '₹',
  bill_prefix: 'HC-BILL',
  bill_padding: 6,
  default_payment: 'Cash',
  uhid_prefix: 'HC',
  uhid_include_year: false,
  uhid_padding: 4,
  uhid_start: 1001,
  low_stock_default: 10,
  expiry_30: 30,
  expiry_60: 60,
  expiry_90: 90,
  fefo: true,
  theme: 'light',
  lang: 'en',
  seeded: '',
};

export async function getSettings() {
  const rows = await db.settings.toArray();
  return { ...DEFAULT_SETTINGS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

export async function saveSettings(patch, userId) {
  await db.transaction('rw', [db.settings, db.activity_logs], async () => {
    for (const [k, v] of Object.entries(patch)) await db.settings.put({ key: k, value: v });
    if (userId) await audit(userId, 'SETTINGS_UPDATE', 'settings', null, Object.keys(patch).join(', '));
  });
}

/** Immutable audit log (ambient transaction aware) */
export function audit(userId, action, entity, entityId, detail = '') {
  return db.activity_logs.add({
    id: uid(),
    user_id: userId || null,
    user_name: (globalThis.__heevaUser && globalThis.__heevaUser.name) || 'system',
    action,
    entity,
    entity_id: entityId || null,
    at: nowISO(),
    detail,
  });
}

/** Monotonic counter — must run inside a caller transaction */
export async function nextCounter(key, start = 1) {
  const row = await db.counters.get(key);
  const current = row && row.value != null ? Number(row.value) : 0;
  const next = Math.max(current + 1, start);
  await db.counters.put({ key, value: next });
  return next;
}

/** UHID generation — strictly HC-1001, HC-1002 ... permanent & unique */
export async function makeUHID(settings) {
  const s = settings || (await getSettings());
  const prefix = (s.uhid_prefix || 'HC').trim().toUpperCase();
  const key = 'UHID|SEQUENCE';
  let start = 1001;
  try {
    if (db.patients) {
      const records = await db.patients.toArray();
      let maxSuffix = 0;
      for (const p of records) {
        const uhid = String(p.uhid || '');
        const match = uhid.match(/^[A-Za-z]+-(\d+)$/);
        if (match) {
          const num = parseInt(match[1], 10);
          if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
        }
      }
      if (maxSuffix >= start) start = maxSuffix + 1;
    }
  } catch (_) {}
  const n = await nextCounter(key, start);
  try {
    await db.counters.put({ key: 'UHID|ALL', value: n });
  } catch (_) {}
  return `${prefix}-${n}`;
}

/** Year-scoped numbered reference: KIND → PREFIX, e.g. makeNo('BILL','HC-BILL',2026) → HC-BILL-2026-000001 */
export async function makeNo(kind, prefix, year = new Date().getFullYear(), padding = 6, start = 1) {
  let effectiveStart = start;
  try {
    let tbl = null;
    let field = null;
    if (kind === 'BILL') { tbl = db.bills; field = 'bill_no'; }
    else if (kind === 'APT') { tbl = db.appointments; field = 'appointment_no'; }
    else if (kind === 'CNS') { tbl = db.consultations; field = 'consultation_no'; }
    else if (kind === 'RX') { tbl = db.prescriptions; field = 'prescription_no'; }
    else if (kind === 'RET') { tbl = db.returns; field = 'return_no'; }
    else if (kind === 'EXP') { tbl = db.expenses; field = 'expense_no'; }

    if (tbl && field) {
      const records = await tbl.toArray();
      let maxSuffix = 0;
      for (const r of records) {
        const val = String(r[field] || '');
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
  } catch (_) {}
  const n = await nextCounter(`${kind}|${year}`, effectiveStart);
  return `${prefix}-${year}-${String(n).padStart(padding, '0')}`;
}

/** Un-scoped code: MD-0001, SUP-0001 … */
export async function makeCode(kind, prefix, padding = 4, start = 1) {
  let effectiveStart = start;
  try {
    if (kind === 'MED' && db.medicines) {
      const records = await db.medicines.toArray();
      let maxSuffix = 0;
      for (const r of records) {
        const m = String(r.medicine_code || '').match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
        }
      }
      if (maxSuffix >= effectiveStart) effectiveStart = maxSuffix + 1;
    } else if (kind === 'SVC' && db.services) {
      const records = await db.services.toArray();
      let maxSuffix = 0;
      for (const r of records) {
        const m = String(r.service_code || '').match(/(\d+)$/);
        if (m) {
          const num = parseInt(m[1], 10);
          if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
        }
      }
      if (maxSuffix >= effectiveStart) effectiveStart = maxSuffix + 1;
    }
  } catch (_) {}
  const n = await nextCounter(`${kind}|ALL`, effectiveStart);
  return `${prefix}-${String(n).padStart(padding, '0')}`;
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
