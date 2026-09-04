// ─── HEEVA CLINIC — reports & analytics engine ─────────────────────────────
import db from '../db';
import { dkey, addDays, weekStart, daysUntil, monthLabel } from '../utils';
import { round2 } from './core';
import { lowStockList, expiryBuckets, stockMap } from './inventory';

function bucketKey(dateStr, group) {
  if (group === 'day') return dateStr;
  if (group === 'month') return dateStr.slice(0, 7);
  // week (Monday)
  return dkey(weekStart(new Date(dateStr + 'T00:00:00')));
}

export async function salesReport(from, to, group = 'day') {
  const [bills, expenses] = await Promise.all([db.bills.toArray(), db.expenses.toArray()]);
  const valid = bills.filter((b) => b.status === 'completed' && b.date >= from && b.date <= to);
  const expIn = expenses.filter((e) => e.status === 'active' && e.date >= from && e.date <= to);
  const buckets = new Map();
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
  const rows = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1)).map((o) => ({ ...o, profit: round2(o.revenue - o.expenses) }));
  const totals = rows.reduce(
    (t, r) => ({
      bills: t.bills + r.bills,
      revenue: round2(t.revenue + r.revenue),
      paid: round2(t.paid + r.paid),
      pending: round2(t.pending + r.pending),
      expenses: round2(t.expenses + r.expenses),
      profit: round2(t.profit + r.profit),
    }),
    { bills: 0, revenue: 0, paid: 0, pending: 0, expenses: 0, profit: 0 }
  );
  return { rows, totals };
}

export async function revenueSeries(days = 14) {
  const bills = await db.bills.where('status').equals('completed').toArray();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dkey(addDays(new Date(), -i));
    const dayBills = bills.filter((b) => b.date === d);
    out.push({
      label: new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
      key: d,
      revenue: round2(dayBills.reduce((s, b) => s + b.total, 0)),
      visits: await db.consultations.where('date').equals(d).count(),
      bills: dayBills.length,
    });
  }
  return out;
}

export async function visitsSeries(days = 7) {
  const consultations = await db.consultations.toArray();
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = dkey(addDays(new Date(), -i));
    out.push({
      label: new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }),
      value: consultations.filter((c) => c.date === d).length,
    });
  }
  return out;
}

export async function topMedicines(from, to, limit = 5) {
  const [items, bills] = await Promise.all([db.bill_items.toArray(), db.bills.toArray()]);
  const billIds = new Map(bills.filter((b) => b.status === 'completed' && b.date >= from && b.date <= to).map((b) => [b.id, b]));
  const map = new Map();
  for (const it of items) {
    if (it.item_type !== 'medicine' || !billIds.has(it.bill_id)) continue;
    const e = map.get(it.name) || { name: it.name, qty: 0, revenue: 0 };
    e.qty = round2(e.qty + it.qty);
    e.revenue = round2(e.revenue + it.amount);
    map.set(it.name, e);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

export async function patientReport(from, to) {
  const [patients, consults] = await Promise.all([db.patients.toArray(), db.consultations.toArray()]);
  const newPatients = patients.filter((p) => p.reg_date >= from && p.reg_date <= to);
  const visitsByPatient = new Map();
  for (const c of consults) {
    if (c.date < from || c.date > to) continue;
    visitsByPatient.set(c.patient_id, (visitsByPatient.get(c.patient_id) || 0) + 1);
  }
  const firstVisit = new Map();
  for (const p of patients) firstVisit.set(p.id, p.reg_date);
  const returning = [];
  const totalVisits = new Map();
  for (const c of consults) totalVisits.set(c.patient_id, (totalVisits.get(c.patient_id) || 0) + 1);
  for (const [pid, count] of visitsByPatient) {
    const p = patients.find((x) => x.id === pid);
    if (!p) continue;
    const prev = (totalVisits.get(pid) || 0) - count;
    if (prev > 0) returning.push({ patient: p, visits: count, total_visits: totalVisits.get(pid) });
  }
  returning.sort((a, b) => b.visits - a.visits);
  return {
    new_patients: newPatients,
    unique_visits: visitsByPatient.size,
    total_visits: [...visitsByPatient.values()].reduce((s, n) => s + n, 0),
    returning: returning.slice(0, 50),
  };
}

export async function medicalReports() {
  const [stock, exp, buckets, map] = await Promise.all([lowStockList(), null, expiryBuckets(), stockMap()]);
  const totalMedicines = [...map.values()].filter((e) => e.medicine.active).length;
  return {
    total_medicines: totalMedicines,
    low_stock: stock.low,
    out_of_stock: stock.out,
    expired: buckets.expired,
    expiring_30: buckets.d30,
    expiring_60: buckets.d60,
    expiring_90: buckets.d90,
  };
}

export async function financialReport(from, to) {
  const [bills, expenses, payments] = await Promise.all([db.bills.toArray(), db.expenses.toArray(), db.payments.toArray()]);
  const valid = bills.filter((b) => b.status === 'completed' && b.date >= from && b.date <= to);
  const revenueByMethod = {};
  for (const p of payments) {
    if (p.kind !== 'payment') continue;
    const b = valid.find((x) => x.id === p.bill_id);
    if (!b) continue;
    revenueByMethod[p.method] = round2((revenueByMethod[p.method] || 0) + p.amount);
  }
  const expIn = expenses.filter((e) => e.status === 'active' && e.date >= from && e.date <= to);
  const expensesByCategory = {};
  for (const e of expIn) expensesByCategory[e.category] = round2((expensesByCategory[e.category] || 0) + e.amount);
  const revenue = round2(valid.reduce((s, b) => s + b.total, 0));
  const expensesTotal = round2(expIn.reduce((s, e) => s + e.amount, 0));
  const pending = bills
    .filter((b) => b.status === 'completed' && b.payment_status !== 'PAID')
    .map((b) => ({ bill: b, due: round2(b.total - (b.paid || 0)), days: daysUntil(b.date) }))
    .filter((x) => x.due > 0.005)
    .sort((a, b) => a.days - b.days);
  return {
    revenue,
    expenses: expensesTotal,
    profit: round2(revenue - expensesTotal),
    revenue_by_method: revenueByMethod,
    expenses_by_category: expensesByCategory,
    pending_payments: pending,
  };
}

export async function dashboardStats() {
  const today = dkey(new Date());
  const [bills, consults, patients, expenses, map] = await Promise.all([
    db.bills.toArray(),
    db.consultations.toArray(),
    db.patients.toArray(),
    db.expenses.toArray(),
    stockMap(),
  ]);
  const todayBills = bills.filter((b) => b.date === today && b.status === 'completed');
  const todayConsults = consults.filter((c) => c.date === today);
  const todayPatientIds = new Set([...todayConsults.map((c) => c.patient_id), ...todayBills.map((b) => b.patient_id)]);
  const todayExpenses = expenses.filter((e) => e.date === today && e.status === 'active').reduce((s, e) => s + e.amount, 0);
  const monthStart = today.slice(0, 8) + '01';
  const mtdBills = bills.filter((b) => b.date >= monthStart && b.status === 'completed');
  const mtdExpenses = expenses.filter((e) => e.date >= monthStart && e.status === 'active').reduce((s, e) => s + e.amount, 0);
  const pending = bills.filter((b) => b.status === 'completed' && b.payment_status !== 'PAID');
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
      profit: round2(todayBills.reduce((s, b) => s + b.total, 0) - todayExpenses),
    },
    month: {
      revenue: round2(mtdBills.reduce((s, b) => s + b.total, 0)),
      expenses: round2(mtdExpenses),
      profit: round2(mtdBills.reduce((s, b) => s + b.total, 0) - mtdExpenses),
    },
    medicines: { total: activeMeds.length, low: stock.low.length, out: stock.out.length },
    expiring: { expired: buckets.expired.length, d30: buckets.d30.length, d60: buckets.d60.length, d90: buckets.d90.length },
    pending_payments: { count: pending.length, amount: round2(pending.reduce((s, b) => s + (b.total - (b.paid || 0)), 0)) },
  };
}

export { monthLabel };
