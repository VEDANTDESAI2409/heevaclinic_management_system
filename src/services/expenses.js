// ─── HEEVA CLINIC — expense management ─────────────────────────────────────
// Financial records are never deleted; expenses can be voided (audit kept).
import db from '../db';
import { uid, nowISO, dkey } from '../utils';
import { audit, makeNo, round2 } from './core';

export const EXPENSE_CATEGORIES = ['Rent', 'Electricity', 'Salary', 'Equipment', 'Maintenance', 'Supplies', 'Other'];

export async function addExpense({ category, amount, date, description, method }, userId) {
  return db.transaction('rw', [db.expenses, db.counters, db.activity_logs], async () => {
    const amt = round2(amount);
    if (!(amt > 0)) throw new Error('Amount must be positive');
    if (!EXPENSE_CATEGORIES.includes(category)) throw new Error('Invalid category');
    const d = date || dkey(new Date());
    const expense_no = await makeNo('EXP', 'EXP', new Date(d + 'T00:00:00').getFullYear());
    const e = {
      id: uid(),
      expense_no,
      category,
      amount: amt,
      date: d,
      description: description || '',
      method: method || 'Cash',
      status: 'active',
      void_reason: null,
      added_by: userId || null,
      created_at: nowISO(),
    };
    await db.expenses.add(e);
    await audit(userId, 'EXPENSE_ADD', 'expense', e.id, `${expense_no} · ${category} · ${amt}`);
    return e;
  });
}

export async function voidExpense(id, reason, userId) {
  return db.transaction('rw', [db.expenses, db.activity_logs], async () => {
    const e = await db.expenses.get(id);
    if (!e) throw new Error('Expense not found');
    if (e.status === 'void') throw new Error('Expense already voided');
    const updated = { ...e, status: 'void', void_reason: String(reason || 'no reason').trim() };
    await db.expenses.put(updated);
    await audit(userId, 'EXPENSE_VOID', 'expense', id, `${e.expense_no} · ${reason}`);
    return updated;
  });
}

export async function expenseTotals(from, to) {
  const all = await db.expenses.toArray();
  const inRange = all.filter((e) => e.status === 'active' && e.date >= from && e.date <= to);
  const byCat = {};
  let total = 0;
  for (const e of inRange) {
    byCat[e.category] = round2((byCat[e.category] || 0) + e.amount);
    total = round2(total + e.amount);
  }
  return { total, byCat };
}

export async function deleteExpense(id, userId) {
  return db.transaction('rw', [db.expenses, db.activity_logs], async () => {
    const e = await db.expenses.get(id);
    if (!e) throw new Error('Expense not found');
    await db.expenses.delete(id);
    await audit(userId, 'EXPENSE_DELETE', 'expense', id, `${e.expense_no} · ${e.category} · ${e.amount}`);
  });
}
