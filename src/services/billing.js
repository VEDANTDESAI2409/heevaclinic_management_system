// ─── HEEVA CLINIC — billing, payments, cancellation, returns ───────────────
// Completing a bill is an atomic transaction:
//   validate → FEFO allocate → bill + items → SALE txns → payments → status → audit
// Cancelling restores inventory to the exact batches and is never a delete.
import db from '../db';
import { uid, nowISO, dkey, ageLabel } from '../utils';
import { audit, getSettings, makeNo, makeCode, round2 } from './core';
import { allocateFEFO, restoreBillStock, txn as addTxn } from './inventory';

const PAY_METHODS = ['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'];
export { PAY_METHODS };

function billTypeLabel(items) {
  const types = new Set(items.map((i) => i.item_type));
  if (types.size === 1) {
    const t = [...types][0];
    if (t === 'consultation') return 'CONSULTATION';
    if (t === 'medicine') return 'MEDICINES';
    if (t === 'service') return 'SERVICES';
  }
  return 'COMBINED';
}

/**
 * Create and complete a bill atomically.
 * items: [{ item_type: 'consultation'|'service'|'medicine', ref_id, qty, price? }]
 * payments: [{ amount, method, note? }]
 * Returns { bill, items, allocations } or throws (transaction rolls back).
 */
export async function createBill({ patient_id, items, discount_mode = 'amt', discount_value = 0, payments = [], when = null }, userId) {
  const settings = await getSettings();
  return db.transaction('rw', [db.bills, db.bill_items, db.payments, db.batches, db.inventory_txns, db.counters, db.activity_logs, db.patients, db.medicines, db.services], async () => {
    const patient = await db.patients.get(patient_id);
    if (!patient) throw new Error('Patient not found');
    if (!Array.isArray(items) || !items.length) throw new Error('Bill has no items');

    // Resolve + price + allocate
    const resolved = [];
    for (const it of items) {
      const qty = round2(it.qty);
      if (!(qty > 0)) continue;
      if (it.item_type === 'medicine') {
        const med = await db.medicines.get(it.ref_id);
        if (!med || !med.active) throw new Error(`Medicine not available: ${it.name || it.ref_id}`);
        const alloc = await allocateFEFO(med.id, qty, settings);
        const price = it.price != null && it.price !== '' ? Number(it.price) : med.selling_price;
        for (const a of alloc) {
          resolved.push({ item_type: 'medicine', ref_id: med.id, name: med.name, qty: a.qty, price, batch_id: a.batch_id, batch_no: a.batch_no });
        }
      } else if (it.item_type === 'service' || it.item_type === 'consultation') {
        const svc = await db.services.get(it.ref_id);
        if (!svc || !svc.active) throw new Error(`Service not available: ${it.name || it.ref_id}`);
        resolved.push({
          item_type: it.item_type,
          ref_id: svc.id,
          name: svc.name,
          qty,
          price: it.price != null && it.price !== '' ? Number(it.price) : svc.price,
        });
      } else throw new Error('Invalid item type');
    }
    if (!resolved.length) throw new Error('Bill has no valid items');

    const subtotal = round2(resolved.reduce((s, i) => s + i.qty * (Number(i.price) || 0), 0));
    const discRaw = discount_mode === 'pct' ? subtotal * ((Math.min(Number(discount_value) || 0, 100) / 100)) : Number(discount_value) || 0;
    const discount = round2(Math.min(Math.max(discRaw, 0), subtotal));
    const total = round2(Math.max(0, subtotal - discount));

    const now = when || nowISO();
    const bill_no = await makeNo('BILL', settings.bill_prefix || 'HC-BILL', new Date(now).getFullYear(), Number(settings.bill_padding) || 6);
    const bill = {
      id: uid(),
      bill_no,
      patient_id,
      uhid: patient.uhid,
      patient_name: patient.name,
      patient_mobile: patient.mobile || '',
      patient_age: ageLabel(patient),
      patient_gender: patient.gender || '',
      date: dkey(new Date(now)),
      time: now,
      item_count: resolved.length,
      subtotal,
      discount,
      total,
      paid: 0,
      status: 'completed',
      payment_status: 'PENDING',
      bill_type: billTypeLabel(resolved),
      created_by: userId || null,
      created_at: now,
      cancel_reason: null,
      cancelled_at: null,
    };
    await db.bills.add(bill);

    for (const it of resolved) {
      const amount = round2(it.qty * (Number(it.price) || 0));
      await db.bill_items.add({
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
        returned: 0,
      });
    }

    // Inventory SALE transactions (immutable ledger)
    for (const it of resolved.filter((i) => i.item_type === 'medicine')) {
      await addTxn('SALE', it.ref_id, it.batch_id, -it.qty, bill.id, bill_no, userId, now);
    }

    // Payments
    let paid = 0;
    for (const pay of payments) {
      const amt = round2(pay.amount);
      if (!(amt > 0)) continue;
      paid = round2(paid + amt);
      await db.payments.add({
        id: uid(),
        bill_id: bill.id,
        patient_id,
        kind: 'payment',
        amount: amt,
        method: PAY_METHODS.includes(pay.method) ? pay.method : 'Other',
        note: pay.note || '',
        by: userId || null,
        at: now,
      });
    }
    paid = Math.min(paid, total);
    bill.paid = paid;
    bill.payment_status = total - paid < 0.005 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'PENDING';
    await db.bills.put(bill);

    await audit(userId, 'BILL_CREATE', 'bill', bill.id, `${bill_no} · ${patient.name} (${patient.uhid}) · total ${bill.total} · ${bill.payment_status}`);
    return {
      bill: await db.bills.get(bill.id),
      items: await db.bill_items.where('bill_id').equals(bill.id).toArray(),
    };
  });
}

export async function getBill(billId) {
  const bill = await db.bills.get(billId);
  if (!bill) return null;
  const [items, payments] = await Promise.all([
    db.bill_items.where('bill_id').equals(billId).toArray(),
    db.payments.where('bill_id').equals(billId).toArray(),
  ]);
  items.sort((a, b) => a.item_type.localeCompare(b.item_type));
  return { bill, items, payments: payments.sort((a, b) => a.at.localeCompare(b.at)) };
}

/** Record an additional payment against an open bill */
export async function recordPayment(billId, { amount, method, note }, userId) {
  return db.transaction('rw', [db.bills, db.bill_items, db.payments, db.activity_logs], async () => {
    const bill = await db.bills.get(billId);
    if (!bill) throw new Error('Bill not found');
    if (bill.status !== 'completed') throw new Error('Cannot record payment on a cancelled bill');
    const amt = round2(amount);
    if (!(amt > 0)) throw new Error('Amount must be positive');
    const balance = round2(bill.total - bill.paid);
    if (amt > balance + 0.005) throw new Error(`Amount exceeds outstanding balance of ${balance}`);
    await db.payments.add({
      id: uid(),
      bill_id: billId,
      patient_id: bill.patient_id,
      kind: 'payment',
      amount: amt,
      method: PAY_METHODS.includes(method) ? method : 'Other',
      note: note || '',
      by: userId || null,
      at: nowISO(),
    });
    const updated = { ...bill, paid: round2(bill.paid + amt) };
    updated.payment_status = updated.total - updated.paid < 0.005 ? 'PAID' : updated.paid > 0 ? 'PARTIAL' : 'PENDING';
    await db.bills.put(updated);
    await audit(userId, 'PAYMENT_RECORD', 'bill', billId, `${bill.bill_no} · +${amt} via ${method}`);
    return getBill(billId);
  });
}

/**
 * Cancel a completed bill — never deleted:
 * reason required → inventory restored to original batches → CANCELLED_BILL txns → CANCELLED status
 */
export async function cancelBill(billId, reason, userId) {
  if (!String(reason || '').trim()) throw new Error('Cancellation reason is required');
  return db.transaction('rw', [db.bills, db.bill_items, db.batches, db.inventory_txns, db.activity_logs, db.medicines, db.payments], async () => {
    const bill = await db.bills.get(billId);
    if (!bill) throw new Error('Bill not found');
    if (bill.status === 'CANCELLED') throw new Error('Bill is already cancelled');
    if (bill.status !== 'completed') throw new Error('Bill cannot be cancelled');
    const items = await db.bill_items.where('bill_id').equals(billId).toArray();
    await restoreBillStock(items, bill, userId);
    const updated = {
      ...bill,
      status: 'CANCELLED',
      cancel_reason: String(reason).trim(),
      cancelled_at: nowISO(),
      cancelled_by: userId || null,
    };
    await db.bills.put(updated);
    await audit(userId, 'BILL_CANCEL', 'bill', billId, `${bill.bill_no} · ${bill.patient_name} · reason: ${reason}`);
    return getBill(billId);
  });
}

/**
 * Patient return of medicines from a completed bill.
 * Restores stock (RETURN txns), optionally records a refund payment.
 */
export async function createReturn({ bill_id, items, reason, refund_method = 'Cash', refund_amount = 0, note = '' }, userId) {
  return db.transaction('rw', [db.returns, db.bill_items, db.batches, db.inventory_txns, db.payments, db.counters, db.activity_logs, db.bills, db.medicines], async () => {
    const full = await getBill(bill_id);
    if (!full) throw new Error('Bill not found');
    const bill = full.bill;
    if (bill.status !== 'completed') throw new Error('Only completed bills can be returned against');
    if (!String(reason || '').trim()) throw new Error('Return reason is required');
    if (!Array.isArray(items) || !items.length) throw new Error('Select items to return');

    const return_no = await makeNo('RET', 'HC-RET');
    const lines = [];
    for (const r of items) {
      const bi = full.items.find((i) => i.id === r.bill_item_id);
      if (!bi) throw new Error('Bill item not found');
      if (bi.item_type !== 'medicine') throw new Error(`Only medicine items can be returned: ${bi.name}`);
      const qty = round2(r.qty);
      const already = bi.returned || 0;
      if (!(qty > 0)) throw new Error('Return quantity must be positive');
      if (qty > bi.qty - already + 0.001) throw new Error(`Only ${round2(bi.qty - already)} of ${bi.name} can be returned`);
      const batch = bi.batch_id ? await db.batches.get(bi.batch_id) : null;
      if (!batch) throw new Error(`Batch for ${bi.name} is missing — contact administrator`);
      await db.batches.put({ ...batch, available: round2((batch.available || 0) + qty) });
      await addTxn('RETURN', bi.ref_id, batch.id, qty, bill.id, `Return · ${reason}`, userId);
      await db.bill_items.put({ ...bi, returned: round2(already + qty) });
      lines.push({ bill_item_id: bi.id, name: bi.name, qty, batch_no: bi.batch_no, amount: round2(qty * bi.price) });
    }

    const refund = round2(refund_amount);
    if (refund > 0) {
      if (refund > bill.paid + 0.005) throw new Error('Refund cannot exceed amount paid');
      await db.payments.add({
        id: uid(),
        bill_id,
        patient_id: bill.patient_id,
        kind: 'refund',
        amount: refund,
        method: PAY_METHODS.includes(refund_method) ? refund_method : 'Other',
        note: `Return ${return_no}`,
        by: userId || null,
        at: nowISO(),
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
      created_by: userId || null,
    };
    await db.returns.add(ret);
    await audit(userId, 'RETURN_CREATE', 'return', ret.id, `${return_no} · bill ${bill.bill_no} · refund ${refund}`);
    return ret;
  });
}

export async function importMedicinesCSV(rows, userId) {
  // rows: [{name, generic, category, type, strength, unit, purchase_price, selling_price, min_stock, barcode}]
  const results = { created: 0, skipped: 0, errors: [] };
  for (const r of rows) {
    const name = String(r.name || '').trim();
    if (!name) continue;
    const existing = (await db.medicines.filter((m) => m.name.toLowerCase() === name.toLowerCase()).toArray())[0];
    if (existing) { results.skipped++; continue; }
    try {
      await createMedicine({
        name,
        generic: r.generic || '',
        category: r.category || 'Other',
        type: r.type || 'Tablet',
        strength: r.strength || '',
        unit: r.unit || 'strip',
        barcode: r.barcode || '',
        purchase_price: Number(r.purchase_price) || 0,
        selling_price: Number(r.selling_price) || 0,
        min_stock: Number(r.min_stock) || 0,
      }, userId);
      results.created++;
    } catch (e) {
      results.errors.push(`${name}: ${e.message}`);
    }
  }
  return results;
}

// ─── Clinic Services CRUD ───────────────────────────────────────────────────
export async function createService(data, userId) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Service name is required');
  const price = Number(data.price);
  if (isNaN(price) || price < 0) throw new Error('Valid service price is required');
  const code = await makeCode('SVC', 'SRV');
  const svc = {
    id: uid(),
    service_code: code,
    name,
    type: data.type || 'service', // 'consultation' | 'service'
    price: round2(price),
    description: data.description || '',
    active: 1,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  await db.services.add(svc);
  await audit(userId, 'SERVICE_CREATE', 'service', svc.id, `${svc.name} (${svc.service_code}) · ₹${svc.price}`);
  return svc;
}

export async function updateService(id, patch, userId) {
  const existing = await db.services.get(id);
  if (!existing) throw new Error('Service not found');
  const updated = {
    ...existing,
    ...patch,
    id: existing.id,
    service_code: existing.service_code,
    price: patch.price != null ? round2(Number(patch.price) || 0) : existing.price,
    updated_at: nowISO(),
  };
  await db.services.put(updated);
  await audit(userId, 'SERVICE_UPDATE', 'service', id, Object.keys(patch).join(', '));
  return updated;
}

export async function archiveService(id, userId) {
  const existing = await db.services.get(id);
  if (!existing) throw new Error('Service not found');
  const active = existing.active ? 0 : 1;
  const updated = { ...existing, active, updated_at: nowISO() };
  await db.services.put(updated);
  await audit(userId, active ? 'SERVICE_REACTIVATE' : 'SERVICE_ARCHIVE', 'service', id, existing.name);
  return updated;
}

export async function deleteService(id, userId) {
  const existing = await db.services.get(id);
  if (!existing) throw new Error('Service not found');
  const billItemCount = await db.bill_items.where('ref_id').equals(id).count();
  if (billItemCount > 0) {
    throw new Error('This service has billing history and cannot be permanently deleted. Deactivate or archive it instead.');
  }
  await db.services.delete(id);
  await audit(userId, 'SERVICE_DELETE', 'service', id, existing.name);
}
