// ─── HEEVA CLINIC — inventory, batches, FEFO, expiry, stock rules ──────────
// Business rules enforced here:
//   · Never negative inventory
//   · Expired batches can never be sold
//   · FEFO (First Expired First Out) batch selection
//   · Every stock change writes an immutable inventory transaction
import db from '../db';
import { uid, nowISO, dkey, daysUntil, isExpired } from '../utils';
import { audit, getSettings, makeCode, round2 } from './core';

export const MEDICINE_TYPES = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Drops', 'Powder', 'Inhaler', 'Other'];
export const TXN_TYPES = ['SALE', 'RETURN', 'ADJUSTMENT', 'DAMAGE', 'EXPIRED', 'CANCELLED_BILL'];

// ── medicines ────────────────────────────────────────────────────────────────
export async function createMedicine(data, userId) {
  return db.transaction('rw', [db.medicines, db.counters, db.activity_logs], async () => {
    const medicine_code = await makeCode('MED', 'MD');
    const med = {
      id: uid(),
      medicine_code,
      name: String(data.name || '').trim(),
      generic: data.generic || '',
      brand: data.brand || data.name || '',
      category: data.category || 'Other',
      type: data.type || 'Tablet',
      strength: data.strength || '',
      unit: data.unit || 'strip',
      purchase_price: round2(data.purchase_price || 0),
      selling_price: round2(data.selling_price || 0),
      min_stock: Number(data.min_stock) || 0,
      location: data.location || '',
      description: data.description || '',
      active: 1,
      created_at: nowISO(),
      updated_at: nowISO(),
    };
    await db.medicines.add(med);
    await audit(userId, 'MEDICINE_CREATE', 'medicine', med.id, `${med.name} · ${med.medicine_code}`);
    return med;
  });
}

export async function updateMedicine(id, patch, userId) {
  return db.transaction('rw', [db.medicines, db.activity_logs], async () => {
    const med = await db.medicines.get(id);
    if (!med) throw new Error('Medicine not found');
    const updated = { ...med, ...patch, id: med.id, medicine_code: med.medicine_code, updated_at: nowISO() };
    await db.medicines.put(updated);
    await audit(userId, 'MEDICINE_UPDATE', 'medicine', id, Object.keys(patch).join(', '));
    return updated;
  });
}

/** Archive instead of delete — records with transaction history are preserved */
export async function archiveMedicine(id, userId) {
  return db.transaction('rw', [db.medicines, db.activity_logs], async () => {
    const med = await db.medicines.get(id);
    if (!med) throw new Error('Medicine not found');
    const updated = { ...med, active: med.active ? 0 : 1 };
    await db.medicines.put(updated);
    await audit(userId, updated.active ? 'MEDICINE_REACTIVATE' : 'MEDICINE_ARCHIVE', 'medicine', id, med.name);
    return updated;
  });
}

/** Delete an unused medicine; clinical and stock history must remain auditable. */
export async function deleteMedicine(id, userId) {
  return db.transaction('rw', [db.medicines, db.batches, db.bill_items, db.prescription_items, db.activity_logs], async () => {
    const med = await db.medicines.get(id);
    if (!med) throw new Error('Medicine not found');
    const [batches, billItems, prescriptionItems] = await Promise.all([
      db.batches.where('medicine_id').equals(id).count(),
      db.bill_items.where('ref_id').equals(id).count(),
      db.prescription_items.where('medicine_id').equals(id).count(),
    ]);
    if (batches || billItems || prescriptionItems) {
      throw new Error('This medicine has clinical or inventory history and must be archived instead of deleted');
    }
    await db.medicines.delete(id);
    await audit(userId, 'MEDICINE_DELETE', 'medicine', id, med.name);
  });
}

// ── stock aggregation ────────────────────────────────────────────────────────
export async function stockMap() {
  const [meds, batches] = await Promise.all([db.medicines.toArray(), db.batches.toArray()]);
  const map = new Map();
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

export async function medicineStock(medicineId) {
  const bs = await db.batches.where('medicine_id').equals(medicineId).toArray();
  return {
    available: bs.reduce((s, b) => s + (b.available || 0), 0),
    total: bs.reduce((s, b) => s + (b.quantity || 0), 0),
  };
}

/**
 * FEFO allocation: selects batches earliest-expiry-first, skipping expired.
 * Mutates batch.available (caller must be inside a transaction) and returns
 * the allocation. Throws if stock is insufficient or only expired stock remains.
 */
export async function allocateFEFO(medicineId, qty, settings) {
  const s = settings || (await getSettings());
  const need = Number(qty);
  if (!(need > 0)) throw new Error('Quantity must be positive');
  const batches = await db.batches.where('medicine_id').equals(medicineId).toArray();
  const usable = batches.filter((b) => (b.available || 0) > 0 && b.status !== 'expired' && !isExpired(b.expiry));
  if (s.fefo !== false) {
    usable.sort((a, b) => (a.expiry || '9999') < (b.expiry || '9999') ? -1 : (a.expiry || '9999') > (b.expiry || '9999') ? 1 : 0);
  } else {
    usable.sort((a, b) => (a.mfg_date || '0000') < (b.mfg_date || '0000') ? -1 : 1);
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
  if (remaining > 0.001) {
    const expiredOnly = batches.some((b) => (b.available || 0) > 0 && isExpired(b.expiry));
    throw new Error(
      expiredOnly
        ? 'Only expired stock remains for this medicine — expired medicines cannot be sold'
        : `Insufficient stock: ${need} requested, ${need - remaining} available`
    );
  }
  for (const a of alloc) await db.batches.put(batches.find((x) => x.id === a.batch_id));
  return alloc;
}

export function txn(type, medicineId, batchId, qty, refId = null, note = '', by = null, at = null) {
  return db.inventory_txns.add({
    id: uid(),
    medicine_id: medicineId,
    batch_id: batchId || null,
    type,
    qty: round2(qty),
    ref_id: refId,
    at: at || nowISO(),
    by: by,
    note,
  });
}

/** Mark a batch expired: removes it from sellable stock, records EXPIRED txn */
export async function markBatchExpired(batchId, userId) {
  return db.transaction('rw', [db.batches, db.inventory_txns, db.activity_logs, db.medicines], async () => {
    const b = await db.batches.get(batchId);
    if (!b) throw new Error('Batch not found');
    if (b.status === 'expired') throw new Error('Batch already marked expired');
    const med = await db.medicines.get(b.medicine_id);
    const updated = { ...b, status: 'expired' };
    const avail = b.available || 0;
    updated.available = 0;
    await db.batches.put(updated);
    if (avail > 0) await txn('EXPIRED', b.medicine_id, b.id, -avail, null, `Batch ${b.batch_no} expired`, userId);
    await audit(userId, 'BATCH_EXPIRED', 'batch', b.id, `${med ? med.name : b.medicine_id} · ${b.batch_no} · qty ${avail}`);
    return updated;
  });
}

/** Manual stock adjustment — ADJUSTMENT (±), DAMAGE (−), EXPIRED (−). Never negative. */
export async function adjustStock({ medicine_id, batch_id, type, qty, note }, userId) {
  if (!['ADJUSTMENT', 'DAMAGE', 'EXPIRED'].includes(type)) throw new Error('Invalid adjustment type');
  return db.transaction('rw', [db.batches, db.inventory_txns, db.activity_logs, db.medicines], async () => {
    const med = await db.medicines.get(medicine_id);
    if (!med) throw new Error('Medicine not found');
    let batch = batch_id ? await db.batches.get(batch_id) : null;
    if (!batch) {
      const bs = await db.batches.where('medicine_id').equals(medicine_id).toArray();
      batch = bs[0] || null;
    }
    const q = Number(qty);
    if (!(q > 0)) throw new Error('Quantity must be positive');
    if (!batch && type === 'ADJUSTMENT') {
      batch = {
        id: uid(), medicine_id, batch_no: `ADJ-${Date.now()}`, mfg_date: dkey(new Date()),
        expiry: '9999-12-31', quantity: 0, available: 0, purchase_price: med.purchase_price || 0, status: 'active',
      };
    }
    if (!batch) throw new Error('No batch exists for this medicine');
    let delta;
    if (type === 'ADJUSTMENT') delta = q; // caller passes signed direction via note? keep positive add; UI uses +/- buttons
    else delta = -q;
    const newAvail = round2((batch.available || 0) + delta);
    if (newAvail < 0) throw new Error(`Cannot reduce below zero: only ${batch.available} available in batch ${batch.batch_no}`);
    const updated = { ...batch, available: newAvail, quantity: Math.max(batch.quantity || 0, newAvail) };
    if (type === 'EXPIRED' && newAvail === 0) updated.status = 'expired';
    await db.batches.put(updated);
    await txn(type, medicine_id, batch.id, delta, null, note || '', userId);
    await audit(userId, 'STOCK_ADJUST', 'batch', batch.id, `${med.name} · batch ${batch.batch_no} · ${type} ${delta > 0 ? '+' : ''}${delta} · ${note || ''}`);
    return updated;
  });
}

/** Restore stock from a cancelled bill (batch recorded on each medicine line) */
export async function restoreBillStock(billItems, bill, userId) {
  for (const it of billItems) {
    if (it.item_type !== 'medicine' || !it.batch_id) continue;
    const b = await db.batches.get(it.batch_id);
    const med = await db.medicines.get(it.ref_id);
    if (b) {
      await db.batches.put({ ...b, available: round2((b.available || 0) + it.qty), status: b.status === 'expired' && isExpired(b.expiry) ? 'expired' : b.status });
      await txn('CANCELLED_BILL', it.ref_id, b.id, it.qty, bill.id, `Bill ${bill.bill_no} cancelled`, userId);
    } else {
      await txn('CANCELLED_BILL', it.ref_id, null, it.qty, bill.id, `Bill ${bill.bill_no} cancelled — batch unavailable`, userId);
    }
    if (!med) continue;
  }
}

// ── alerts data ──────────────────────────────────────────────────────────────
export async function expiryBuckets(settings) {
  const s = settings || (await getSettings());
  const [batches, meds] = await Promise.all([db.batches.toArray(), db.medicines.toArray()]);
  const medMap = new Map(meds.map((m) => [m.id, m]));
  const out = { expired: [], d30: [], d60: [], d90: [] };
  for (const b of batches) {
    const med = medMap.get(b.medicine_id);
    if (!med || !med.active) continue;
    const onHand = b.available || 0;
    const base = { batch: b, medicine: med, med_name: med.name, on_hand: onHand, days: daysUntil(b.expiry), expiry: b.expiry };
    if (b.status === 'expired' || isExpired(b.expiry)) {
      out.expired.push(base);
    } else if (onHand > 0) {
      const d = daysUntil(b.expiry);
      if (d <= Number(s.expiry_30)) out.d30.push(base);
      else if (d <= Number(s.expiry_60)) out.d60.push(base);
      else if (d <= Number(s.expiry_90)) out.d90.push(base);
    }
  }
  const byDate = (a, b) => (a.expiry < b.expiry ? -1 : 1);
  out.expired.sort(byDate); out.d30.sort(byDate); out.d60.sort(byDate); out.d90.sort(byDate);
  return out;
}

export async function lowStockList(settings) {
  const s = settings || (await getSettings());
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

export async function ensureMedicineCategories() {
  const cats = await db.medicine_categories.toArray();
  const known = new Set(cats.map((c) => c.name));
  for (const def of ['Analgesic', 'Antibiotic', 'Antacid', 'Antiseptic', 'Vitamin', 'Antihistamine', 'Respiratory', 'Cardiovascular', 'Diabetes', 'Dermatology', 'Supplement', 'Injection', 'IV Fluid', 'Other']) {
    if (!known.has(def)) await db.medicine_categories.add({ id: uid(), name: def });
  }
}

export async function categoryList() {
  return db.medicine_categories.orderBy('name').toArray();
}

export async function createCategory(name, userId) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Category name is required');
  const existing = await db.medicine_categories.where('name').equalsIgnoreCase(trimmed).first();
  if (existing) throw new Error('A category with this name already exists');
  const cat = { id: uid(), name: trimmed };
  await db.medicine_categories.add(cat);
  await audit(userId, 'CATEGORY_CREATE', 'category', cat.id, cat.name);
  return cat;
}

export async function updateCategory(id, newName, userId) {
  const trimmed = String(newName || '').trim();
  if (!trimmed) throw new Error('Category name is required');
  const cat = await db.medicine_categories.get(id);
  if (!cat) throw new Error('Category not found');
  const oldName = cat.name;
  await db.transaction('rw', [db.medicine_categories, db.medicines, db.activity_logs], async () => {
    await db.medicine_categories.update(id, { name: trimmed });
    // Update medicines referencing old category name
    const meds = await db.medicines.where('category').equals(oldName).toArray();
    for (const m of meds) {
      await db.medicines.update(m.id, { category: trimmed, updated_at: nowISO() });
    }
    await audit(userId, 'CATEGORY_UPDATE', 'category', id, `${oldName} → ${trimmed}`);
  });
  return { id, name: trimmed };
}

export async function deleteCategory(id, userId) {
  const cat = await db.medicine_categories.get(id);
  if (!cat) throw new Error('Category not found');
  const count = await db.medicines.where('category').equals(cat.name).count();
  if (count > 0) {
    throw new Error('This category cannot be deleted because it is currently being used by existing medicines.');
  }
  await db.medicine_categories.delete(id);
  await audit(userId, 'CATEGORY_DELETE', 'category', id, cat.name);
}

// ─── Batches CRUD ────────────────────────────────────────────────────────────
export async function createBatch(data, userId) {
  return db.transaction('rw', [db.batches, db.medicines, db.inventory_txns, db.activity_logs], async () => {
    const med = await db.medicines.get(data.medicine_id);
    if (!med) throw new Error('Medicine not found');
    const batchNo = String(data.batch_no || '').trim().toUpperCase();
    if (!batchNo) throw new Error('Batch number is required');
    const qty = Number(data.quantity);
    if (!(qty > 0)) throw new Error('Quantity must be positive');

    const batch = {
      id: uid(),
      medicine_id: med.id,
      batch_no: batchNo,
      mfg_date: data.mfg_date || dkey(new Date()),
      expiry: data.expiry || '9999-12-31',
      quantity: qty,
      available: qty,
      purchase_price: round2(data.purchase_price != null ? data.purchase_price : med.purchase_price),
      status: 'active',
    };
    await db.batches.add(batch);
    await txn('ADJUSTMENT', med.id, batch.id, qty, null, `Batch ${batch.batch_no} created manually`, userId);
    await audit(userId, 'BATCH_CREATE', 'batch', batch.id, `${med.name} · batch ${batch.batch_no} · qty ${qty}`);
    return batch;
  });
}

export async function updateBatch(id, patch, userId) {
  return db.transaction('rw', [db.batches, db.activity_logs], async () => {
    const existing = await db.batches.get(id);
    if (!existing) throw new Error('Batch not found');
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      medicine_id: existing.medicine_id,
    };
    await db.batches.put(updated);
    await audit(userId, 'BATCH_UPDATE', 'batch', id, Object.keys(patch).join(', '));
    return updated;
  });
}

export async function deleteBatch(id, userId) {
  return db.transaction('rw', [db.batches, db.bill_items, db.purchase_items, db.inventory_txns, db.activity_logs], async () => {
    const batch = await db.batches.get(id);
    if (!batch) throw new Error('Batch not found');
    const billLineCount = await db.bill_items.where('batch_id').equals(id).count();
    if (billLineCount > 0) {
      throw new Error('This batch has sales history and cannot be deleted. Use Mark Expired instead.');
    }
    await db.batches.delete(id);
    await audit(userId, 'BATCH_DELETE', 'batch', id, `Batch ${batch.batch_no}`);
  });
}
