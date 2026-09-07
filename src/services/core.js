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
  uhid_include_year: true,
  uhid_padding: 6,
  uhid_start: 1,
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
  const next = row ? row.value + 1 : start;
  await db.counters.put({ key, value: next });
  return next;
}

/** UHID generation — format configurable; UHID is permanent & unique */
export async function makeUHID(settings, year = new Date().getFullYear()) {
  const s = settings || (await getSettings());
  const key = s.uhid_include_year ? `UHID|${year}` : 'UHID|ALL';
  const n = await nextCounter(key, Number(s.uhid_start) || 1);
  const pad = Number(s.uhid_padding) || 6;
  const prefix = (s.uhid_prefix || 'HC').trim().toUpperCase();
  return `${prefix}${s.uhid_include_year ? `-${year}` : ''}-${String(n).padStart(pad, '0')}`;
}

/** Year-scoped numbered reference: KIND → PREFIX, e.g. makeNo('BILL','HC-BILL',2026) → HC-BILL-2026-000001 */
export async function makeNo(kind, prefix, year = new Date().getFullYear(), padding = 6, start = 1) {
  const n = await nextCounter(`${kind}|${year}`, start);
  return `${prefix}-${year}-${String(n).padStart(padding, '0')}`;
}

/** Un-scoped code: MD-0001, SUP-0001 … */
export async function makeCode(kind, prefix, padding = 4, start = 1) {
  const n = await nextCounter(`${kind}|ALL`, start);
  return `${prefix}-${String(n).padStart(padding, '0')}`;
}

export const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
