// ─── HEEVA CLINIC — notification center (auto-generated clinic alerts) ─────
import db from '../db';
import { uid, nowISO, dkey, addDays } from '../utils';
import { stockMap, expiryBuckets, lowStockList } from './inventory';

const MANAGED_TYPES = ['low_stock', 'out_of_stock', 'expired', 'expiring_30', 'expiring_60', 'expiring_90', 'pending_payment', 'appointment'];

/**
 * Recompute clinic alerts and keep the notification store in sync.
 * Idempotent — safe to call on boot and after any stock/bill/payment change.
 */
export async function syncAlerts(userId = null) {
  const active = []; // { type, ref, severity, title, message }

  const { low, out } = await lowStockList();
  for (const r of out) active.push({ type: 'out_of_stock', ref: `out:${r.medicine.id}`, severity: 'danger', title: 'Out of stock', message: `${r.medicine.name} is out of stock` });
  for (const r of low) active.push({ type: 'low_stock', ref: `low:${r.medicine.id}`, severity: 'warning', title: 'Low stock', message: `${r.medicine.name}: ${r.available} left (minimum ${r.min})` });

  const buckets = await expiryBuckets();
  for (const b of buckets.expired) active.push({ type: 'expired', ref: `exp:${b.batch.id}`, severity: 'danger', title: 'Expired medicine', message: `${b.med_name} (batch ${b.batch.batch_no}) expired on ${b.expiry} — ${b.on_hand} on hand` });
  for (const b of buckets.d30) active.push({ type: 'expiring_30', ref: `e30:${b.batch.id}`, severity: 'warning', title: 'Expiring within 30 days', message: `${b.med_name} (batch ${b.batch.batch_no}) expires ${b.expiry} — ${b.on_hand} in stock` });
  for (const b of buckets.d60) active.push({ type: 'expiring_60', ref: `e60:${b.batch.id}`, severity: 'warning', title: 'Expiring within 60 days', message: `${b.med_name} (batch ${b.batch.batch_no}) expires ${b.expiry} — ${b.on_hand} in stock` });
  for (const b of buckets.d90) active.push({ type: 'expiring_90', ref: `e90:${b.batch.id}`, severity: 'info', title: 'Expiring within 90 days', message: `${b.med_name} (batch ${b.batch.batch_no}) expires ${b.expiry} — ${b.on_hand} in stock` });

  const bills = await db.bills.where('status').equals('completed').toArray();
  for (const b of bills) {
    if (b.payment_status !== 'PAID' && b.payment_status !== 'PENDING' && b.payment_status !== 'PARTIAL') continue;
    if (b.payment_status === 'PAID') continue;
    const due = Number(b.total) - Number(b.paid || 0);
    if (due > 0.005) active.push({ type: 'pending_payment', ref: `pend:${b.id}`, severity: 'info', title: 'Pending payment', message: `${b.bill_no} · ${b.patient_name} — ₹${due.toLocaleString('en-IN')} pending` });
  }

  const today = dkey(new Date());
  const tomorrow = dkey(addDays(new Date(), 1));
  const appts = await db.appointments.where('status').anyOf(['scheduled', 'confirmed', 'checked_in', 'waiting']).toArray();
  for (const a of appts) {
    if (a.date === today || a.date === tomorrow) {
      active.push({ type: 'appointment', ref: `apt:${a.id}`, severity: 'info', title: a.date === today ? 'Appointment today' : 'Appointment tomorrow', message: `${a.patient_name || ''} ${a.time} · ${a.reason || 'consultation'}` });
    }
  }

  await db.transaction('rw', db.notifications, async () => {
    const existing = await db.notifications.toArray();
    const seen = new Set(active.map((a) => a.type + '|' + a.ref));
    for (const a of active) {
      const existsUnread = existing.some((n) => n.type === a.type && n.ref === a.ref && !n.read);
      if (!existsUnread) {
        await db.notifications.add({ id: uid(), ...a, read: false, at: nowISO() });
      }
    }
    // prune managed alerts that no longer apply (unread only — history kept)
    for (const n of existing) {
      if (MANAGED_TYPES.includes(n.type) && !n.read && !seen.has(n.type + '|' + n.ref)) {
        await db.notifications.delete(n.id);
      }
    }
    // cap table growth: keep 500 most recent
    const all = await db.notifications.orderBy('at').reverse().toArray();
    if (all.length > 500) await db.notifications.bulkDelete(all.slice(500).map((n) => n.id));
  });

  void userId;
  return { count: active.length };
}

export async function markRead(id) {
  const n = await db.notifications.get(id);
  if (n) await db.notifications.put({ ...n, read: true });
}

export async function markAllRead() {
  const all = await db.notifications.filter((n) => !n.read).toArray();
  for (const n of all) await db.notifications.put({ ...n, read: true });
}

export async function unreadCount() {
  return db.notifications.filter((n) => !n.read).count();
}
