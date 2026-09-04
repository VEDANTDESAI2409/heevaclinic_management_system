// ─── HEEVA CLINIC — payments: outstanding bills, record payments, history ──
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Badge, DataTable, PageHeader, EmptyState,
  PaymentBadge, UhidChip,
} from '../components/ui';
import BillViewer from '../components/BillViewer';
import { getBill, recordPayment, PAY_METHODS } from '../services/billing';
import { syncAlerts } from '../services/notifications';
import { fmtMoney, fmtDate, fmtDateTime, dkey, addDays, download, toCSV } from '../utils';
import { CreditCard, Plus, Printer, Download, Search } from 'lucide-react';

function PayModal({ bill, onClose }) {
  const { user, settings, pushToast } = useApp();
  const [method, setMethod] = useState(settings.default_payment || 'Cash');
  const [amount, setAmount] = useState(String(bill.balance));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const money = (v) => fmtMoney(v, settings.currency);

  const doPay = async () => {
    setErr('');
    setBusy(true);
    try {
      await recordPayment(bill.bill.id, { amount: Number(amount), method, note }, user.id);
      pushToast('success', `Payment of ${money(Number(amount))} recorded against ${bill.bill.bill_no}`);
      await syncAlerts(user.id).catch(() => {});
      onClose();
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Record Payment — ${bill.bill.bill_no}`} width="sm"
      sub={`${bill.bill.patient_name} · balance ${money(bill.balance)}`}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={doPay} disabled={busy || !(Number(amount) > 0)}>{busy ? 'Saving…' : `Record ${money(Number(amount) || 0)}`}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="stack">
        <Field label="Payment Method" required>
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label={`Amount (max ${money(bill.balance)})`} required>
          <Input type="number" min="0" max={bill.balance} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <div className="pay-actions">
          <Btn size="sm" variant="ghost" onClick={() => setAmount(String(bill.balance))}>Full balance</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setAmount(String(Math.round(bill.balance / 2 * 100) / 100))}>Half</Btn>
          <Btn size="sm" variant="ghost" onClick={() => setAmount('')}>Custom…</Btn>
        </div>
        <Field label="Note (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. received at counter" />
        </Field>
      </div>
    </Modal>
  );
}

export default function Payments() {
  const { settings, pushToast, user } = useApp();
  const [params] = useSearchParams();
  const [statusF, setStatusF] = useState('open');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState(dkey(addDays(new Date(), -29)));
  const [to, setTo] = useState(dkey(new Date()));
  const [payTarget, setPayTarget] = useState(null);
  const [viewBill, setViewBill] = useState(null);
  const [methodH, setMethodH] = useState('');

  const money = (v) => fmtMoney(v, settings.currency);

  // bills within range, grouped by payment status
  const bills = useLiveQuery(async () => {
    const all = await db.bills.where('status').equals('completed').toArray();
    let list = all.filter((b) => b.date >= from && b.date <= to);
    const s = q.trim().toLowerCase();
    const sDigits = s.replace(/\D/g, '');
    if (s) list = list.filter((b) =>
      b.bill_no.toLowerCase().includes(s) ||
      b.patient_name.toLowerCase().includes(s) ||
      b.uhid.toLowerCase().includes(s) ||
      (sDigits && b.uhid.includes(sDigits))
    );
    if (statusF === 'pending') list = list.filter((b) => b.payment_status === 'PENDING');
    else if (statusF === 'partial') list = list.filter((b) => b.payment_status === 'PARTIAL');
    else if (statusF === 'paid') list = list.filter((b) => b.payment_status === 'PAID');
    else list = list.filter((b) => b.payment_status !== 'PAID');
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }, [statusF, q, from, to]);

  const outstanding = useLiveQuery(async () => {
    const all = await db.bills.where('status').equals('completed').toArray();
    const open = all.filter((b) => b.payment_status !== 'PAID');
    return {
      count: open.length,
      amount: open.reduce((s, b) => s + (b.total - (b.paid || 0)), 0),
      pending: open.filter((b) => b.payment_status === 'PENDING').length,
      partial: open.filter((b) => b.payment_status === 'PARTIAL').length,
    };
  }, []);

  const history = useLiveQuery(async () => {
    const all = await db.payments.orderBy('at').reverse().toArray();
    const billsMap = new Map((await db.bills.toArray()).map((b) => [b.id, b]));
    let list = all.map((p) => ({ ...p, bill: billsMap.get(p.bill_id) || null }));
    if (methodH) list = list.filter((p) => p.method === methodH);
    return list.slice(0, 200);
  }, [methodH]);

  // deep link ?bill=ID opens the viewer
  React.useEffect(() => {
    const id = params.get('bill');
    if (id) getBill(id).then((full) => { if (full) setViewBill(full); });
  }, [params]); // eslint-disable-line

  const exportCSV = () => {
    download(`heeva-payments-${from}-${to}.csv`, toCSV(
      ['Bill No', 'Date', 'Patient', 'UHID', 'Total', 'Paid', 'Balance', 'Status'],
      (bills || []).map((b) => [b.bill_no, b.date, b.patient_name, b.uhid, b.total, b.paid || 0, b.total - (b.paid || 0), b.payment_status])
    ), 'text/csv');
  };

  return (
    <div className="page">
      <PageHeader
        title="Payments"
        sub={`Outstanding: ${money(outstanding?.amount || 0)} across ${outstanding?.count ?? '…'} open bill(s) · ${outstanding?.pending ?? 0} pending · ${outstanding?.partial ?? 0} partial`}
        actions={<Btn variant="ghost" icon={Download} onClick={exportCSV}>Export CSV</Btn>}
      />

      <Card>
        <div className="toolbar">
          <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="toolbar-select">
            <option value="open">Open (Pending + Partial)</option>
            <option value="pending">Pending only</option>
            <option value="partial">Partial only</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </Select>
          <div className="toolbar-search">
            <Search size={15} />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bill #, patient, UHID…" />
          </div>
          <Input type="date" className="toolbar-date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span className="range-dash">→</span>
          <Input type="date" className="toolbar-date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <DataTable
          columns={[
            { key: 'bill_no', label: 'Bill #', render: (b) => <span className="cell-mono">{b.bill_no}</span> },
            {
              key: 'patient_name', label: 'Patient', sortable: true,
              render: (b) => (
                <span className="cell-person">
                  <span><span className="cell-main">{b.patient_name}</span> <UhidChip uhid={b.uhid} size="sm" /></span>
                </span>
              ),
            },
            { key: 'date', label: 'Date', sortable: true, render: (b) => fmtDate(b.date) },
            { key: 'total', label: 'Total', align: 'right', sortable: true, render: (b) => money(b.total) },
            { key: 'paid', label: 'Paid', align: 'right', render: (b) => money(b.paid || 0) },
            {
              key: 'balance', label: 'Balance', align: 'right', sortable: true, sortValue: (b) => b.total - (b.paid || 0),
              render: (b) => {
                const bal = b.total - (b.paid || 0);
                return bal > 0.005 ? <b className="val-red">{money(bal)}</b> : <span className="val-green">—</span>;
              },
            },
            { key: 'payment_status', label: 'Status', render: (b) => <PaymentBadge status={b.payment_status} /> },
            {
              key: 'actions', label: '', align: 'right',
              render: (b) => (
                <span className="cell-actions" onClick={(e) => e.stopPropagation()}>
                  {b.payment_status !== 'PAID' && (
                    <Btn size="sm" variant="accent" icon={Plus} onClick={async () => {
                      const full = await getBill(b.id);
                      if (full) setPayTarget({ bill: full.bill, balance: full.bill.total - (full.bill.paid || 0) });
                    }}>Payment</Btn>
                  )}
                  <Btn size="sm" variant="ghost" icon={Printer} onClick={async () => {
                    const full = await getBill(b.id);
                    if (full) setViewBill(full);
                  }}>View</Btn>
                </span>
              ),
            },
          ]}
          rows={bills}
          pageSize={12}
          empty={<EmptyState icon="💳" title="No bills match" message="Adjust filters or date range." />}
          loading={!bills}
        />
      </Card>

      <Card title="Payment History" sub="Every collection and refund — financial records are never deleted">
        <div className="toolbar">
          <Select value={methodH} onChange={(e) => setMethodH(e.target.value)} className="toolbar-select">
            <option value="">All methods</option>
            {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
          </Select>
        </div>
        <DataTable
          dense
          columns={[
            { key: 'at', label: 'When', sortable: true, render: (p) => <span className="cell-sub">{fmtDateTime(p.at)}</span> },
            { key: 'bill_no', label: 'Bill #', sortValue: (p) => p.bill?.bill_no || '', render: (p) => <span className="cell-mono">{p.bill?.bill_no || '—'}</span> },
            { key: 'patient_name', label: 'Patient', sortValue: (p) => p.bill?.patient_name || '', render: (p) => p.bill?.patient_name || '—' },
            { key: 'method', label: 'Method', render: (p) => <Badge tone="navy">{p.method}</Badge> },
            {
              key: 'kind', label: 'Type',
              render: (p) => p.kind === 'refund' ? <Badge tone="red">Refund</Badge> : <Badge tone="green">Payment</Badge>,
            },
            { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: (p) => <b className={p.kind === 'refund' ? 'val-red' : 'val-green'}>{p.kind === 'refund' ? '− ' : ''}{money(p.amount)}</b> },
            { key: 'note', label: 'Note', render: (p) => <span className="cell-ellip" title={p.note}>{p.note || '—'}</span> },
          ]}
          rows={history}
          pageSize={12}
          empty={<EmptyState title="No payments recorded yet" />}
          loading={!history}
        />
      </Card>

      {payTarget && <PayModal bill={payTarget} onClose={() => setPayTarget(null)} />}
      {viewBill && <BillViewer full={viewBill} onClose={() => setViewBill(null)} allowPayment={false} />}
    </div>
  );
}
