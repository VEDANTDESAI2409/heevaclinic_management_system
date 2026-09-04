// ─── HEEVA CLINIC — expense management (void, never delete) ────────────────
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Textarea, Badge, DataTable, PageHeader, EmptyState, Confirm,
} from '../components/ui';
import { addExpense, voidExpense, EXPENSE_CATEGORIES } from '../services/expenses';
import { expenseTotals } from '../services/expenses';
import { fmtMoney, fmtDate, dkey, addDays, download, toCSV } from '../utils';
import { Wallet, Plus, Download, CircleSlash } from 'lucide-react';

export default function Expenses() {
  const { user, settings, pushToast } = useApp();
  const [modal, setModal] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [f, setF] = useState({ category: 'Rent', amount: '', date: dkey(new Date()), description: '', method: 'Cash' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusF, setStatusF] = useState('active');
  const [catF, setCatF] = useState('');

  const from = dkey(new Date(dkey(new Date()).slice(0, 8) + '01'));
  const to = dkey(new Date());

  const totals = useLiveQuery(() => expenseTotals(from, to), []);

  const rows = useLiveQuery(async () => {
    const all = await db.expenses.toArray();
    const users = new Map((await db.users.toArray()).map((u) => [u.id, u.name]));
    let list = all.map((e) => ({ ...e, by: users.get(e.added_by) || '—' }));
    if (statusF === 'active') list = list.filter((e) => e.status === 'active');
    else if (statusF === 'void') list = list.filter((e) => e.status === 'void');
    if (catF) list = list.filter((e) => e.category === catF);
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [statusF, catF]);

  const save = async () => {
    setErr('');
    if (!(Number(f.amount) > 0)) { setErr('Enter a valid amount'); return; }
    setBusy(true);
    try {
      await addExpense({ ...f, amount: Number(f.amount) }, user.id);
      pushToast('success', 'Expense recorded');
      setModal(false);
      setF({ category: 'Rent', amount: '', date: dkey(new Date()), description: '', method: 'Cash' });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () => {
    download(`heeva-expenses-${dkey()}.csv`, toCSV(
      ['No', 'Date', 'Category', 'Amount', 'Description', 'Method', 'Status', 'Added By'],
      (rows || []).map((e) => [e.expense_no, e.date, e.category, e.amount, e.description, e.method, e.status, e.by])
    ), 'text/csv');
  };

  return (
    <div className="page">
      <PageHeader
        title="Expenses"
        sub={`This month (MTD): ${fmtMoney(totals?.total || 0, settings.currency)} · financial records are never deleted, only voided`}
        actions={<>
          <Btn variant="ghost" icon={Download} onClick={exportCSV}>Export</Btn>
          <Btn variant="accent" icon={Plus} onClick={() => setModal(true)}>+ Record Expense</Btn>
        </>}
      />

      {totals && Object.keys(totals.byCat).length > 0 && (
        <div className="cat-chips">
          {Object.entries(totals.byCat).map(([c, v]) => (
            <span key={c} className="cat-chip">{c}: <b>{fmtMoney(v, settings.currency)}</b></span>
          ))}
        </div>
      )}

      <Card>
        <div className="toolbar">
          <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="toolbar-select">
            <option value="active">Active</option>
            <option value="void">Voided</option>
            <option value="all">All</option>
          </Select>
          <Select value={catF} onChange={(e) => setCatF(e.target.value)} className="toolbar-select">
            <option value="">All categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </div>
        <DataTable
          columns={[
            { key: 'expense_no', label: 'Expense #', render: (e) => <span className="cell-mono">{e.expense_no}</span> },
            { key: 'date', label: 'Date', sortable: true, render: (e) => fmtDate(e.date) },
            { key: 'category', label: 'Category', sortable: true, render: (e) => <Badge tone="navy">{e.category}</Badge> },
            { key: 'description', label: 'Description', render: (e) => e.description || '—' },
            { key: 'method', label: 'Method' },
            { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: (e) => fmtMoney(e.amount, settings.currency) },
            { key: 'by', label: 'Added By' },
            {
              key: 'status', label: 'Status',
              render: (e) => e.status === 'void' ? <Badge tone="gray">VOID — {e.void_reason}</Badge> : (
                <Btn size="sm" variant="ghost" icon={CircleSlash} onClick={() => setVoidTarget(e)}>Void</Btn>
              ),
            },
          ]}
          rows={rows}
          pageSize={12}
          empty={<EmptyState icon="💰" title="No expenses recorded" action={<Btn size="sm" variant="accent" onClick={() => setModal(true)}>Record expense</Btn>} />}
          loading={!rows}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Record Expense" width="md"
        footer={<>
          <Btn variant="ghost" onClick={() => setModal(false)}>Cancel</Btn>
          <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</Btn>
        </>}>
        {err && <div className="form-alert">{err}</div>}
        <div className="form-grid">
          <Field label="Category" required>
            <Select value={f.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Amount (₹)" required>
            <Input type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF((x) => ({ ...x, amount: e.target.value }))} />
          </Field>
          <Field label="Date"><Input type="date" value={f.date} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} /></Field>
          <Field label="Payment Method">
            <Select value={f.method} onChange={(e) => setF((x) => ({ ...x, method: e.target.value }))}>
              {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Description" className="fg-2"><Textarea rows={2} value={f.description} onChange={(e) => setF((x) => ({ ...x, description: e.target.value }))} /></Field>
        </div>
      </Modal>

      <Confirm
        open={!!voidTarget}
        onClose={() => setVoidTarget(null)}
        title={`Void expense ${voidTarget?.expense_no}?`}
        message={`${voidTarget?.category} · ${fmtMoney(voidTarget?.amount || 0, settings.currency)} — ${voidTarget?.description || ''}`.trim()}
        requireReason
        danger
        confirmText="Void expense"
        onConfirm={async (reason) => {
          await voidExpense(voidTarget.id, reason, user.id);
          pushToast('success', 'Expense voided (kept in records)');
          setVoidTarget(null);
        }}
      />
    </div>
  );
}
