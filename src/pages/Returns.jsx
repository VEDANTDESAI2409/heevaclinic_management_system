// ─── HEEVA CLINIC — returns (restock + optional refund) ────────────────────
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Badge, DataTable, PageHeader, EmptyState,
} from '../components/ui';
import { createReturn, getBill, PAY_METHODS } from '../services/billing';
import { syncAlerts } from '../services/notifications';
import { fmtMoney, fmtDate, fmtDateTime } from '../utils';
import { Undo2, Plus } from 'lucide-react';

function ReturnModal({ open, onClose }) {
  const { user, settings, pushToast } = useApp();
  const [billId, setBillId] = useState('');
  const [bill, setBill] = useState(null);
  const [retQty, setRetQty] = useState({});
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState(settings.default_payment || 'Cash');
  const [refundAmt, setRefundAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // bills that have medicine items and are not cancelled
  const returnableBills = useLiveQuery(async () => {
    const bills = await db.bills.where('status').equals('completed').toArray();
    const out = [];
    for (const b of bills) {
      const items = await db.bill_items.where('bill_id').equals(b.id).toArray();
      const medLines = items.filter((i) => i.item_type === 'medicine' && i.returned < i.qty);
      if (medLines.length) out.push({ bill: b, medLines });
    }
    return out.sort((a, b) => b.bill.time.localeCompare(a.bill.time)).slice(0, 60);
  }, [open]);

  useEffect(() => {
    if (open) { setBillId(''); setBill(null); setRetQty({}); setReason(''); setRefundAmt(''); setErr(''); }
  }, [open]);

  useEffect(() => {
    const found = returnableBills?.find((x) => x.bill.id === billId);
    setBill(found || null);
    setRetQty({});
  }, [billId, returnableBills]);

  const save = async () => {
    setErr('');
    if (!bill) { setErr('Select a bill'); return; }
    const items = bill.medLines
      .filter((l) => Number(retQty[l.id]) > 0)
      .map((l) => ({ bill_item_id: l.id, qty: Number(retQty[l.id]) }));
    if (!items.length) { setErr('Enter quantity for at least one medicine line'); return; }
    setBusy(true);
    try {
      const r = await createReturn({ bill_id: bill.bill.id, items, reason, refund_method: refundMethod, refund_amount: Number(refundAmt) || 0 }, user.id);
      pushToast('success', `Return ${r.return_no} processed — stock restored to batches`);
      await syncAlerts(user.id).catch(() => {});
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Return" width="lg"
      sub="Medicines returned by the patient are restored to their original batches (RETURN ledger entry)"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="danger" onClick={save} disabled={busy}>{busy ? 'Processing…' : 'Process Return'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="stack">
        <Field label="Bill" required>
          <Select value={billId} onChange={(e) => setBillId(e.target.value)}>
            <option value="">Select bill with medicine items…</option>
            {(returnableBills || []).map((x) => (
              <option key={x.bill.id} value={x.bill.id}>{x.bill.bill_no} · {x.bill.patient_name} · {fmtDate(x.bill.date)} · {fmtMoney(x.bill.total, settings.currency)}</option>
            ))}
          </Select>
        </Field>
        {bill && (
          <div className="ret-lines">
            {bill.medLines.map((l) => {
              const maxQty = l.qty - (l.returned || 0);
              return (
                <div className="ret-line" key={l.id}>
                  <span className="ret-name">{l.name}{l.batch_no && <span className="cell-sub"> · batch {l.batch_no}</span>}</span>
                  <span className="ret-avail">sold {l.qty} · returnable {maxQty}</span>
                  <Input type="number" min="0" max={maxQty} value={retQty[l.id] ?? ''} onChange={(e) => setRetQty((x) => ({ ...x, [l.id]: e.target.value }))} placeholder="0" className="ret-qty" />
                </div>
              );
            })}
          </div>
        )}
        <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medication caused reaction, duplicate dispense" /></Field>
        <div className="fg-row">
          <Field label="Refund Method">
            <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
              {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Refund Amount" hint={`Max ${fmtMoney(bill?.bill.paid || 0, settings.currency)}`}>
            <Input type="number" min="0" step="0.01" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} placeholder="0 (no refund)" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export default function Returns() {
  const { settings } = useApp();
  const [modal, setModal] = useState(false);
  const [q, setQ] = useState('');

  const returns = useLiveQuery(async () => {
    const all = await db.returns.toArray();
    const s = q.trim().toLowerCase();
    const list = s ? all.filter((r) => r.return_no.toLowerCase().includes(s) || (r.bill_no || '').toLowerCase().includes(s) || (r.patient_name || '').toLowerCase().includes(s)) : all;
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [q]);

  return (
    <div className="page">
      <PageHeader
        title="Returns"
        sub="Patient medicine returns — restock to original batches with optional refund"
        actions={<Btn variant="accent" icon={Plus} onClick={() => setModal(true)}>+ New Return</Btn>}
      />
      <Card>
        <div className="toolbar">
          <input className="input" placeholder="Search return #, bill #, patient…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <DataTable
          columns={[
            { key: 'return_no', label: 'Return #', render: (r) => <span className="cell-mono">{r.return_no}</span> },
            { key: 'at', label: 'When', sortable: true, sortValue: (r) => r.at, render: (r) => fmtDateTime(r.at) },
            { key: 'bill_no', label: 'Bill', render: (r) => <span className="cell-mono">{r.bill_no}</span> },
            { key: 'patient_name', label: 'Patient', render: (r) => r.patient_name },
            {
              key: 'items', label: 'Items Returned',
              render: (r) => (r.items || []).map((i) => `${i.name} ×${i.qty}`).join(', '),
            },
            { key: 'reason', label: 'Reason', render: (r) => <span className="cell-ellip" title={r.reason}>{r.reason}</span> },
            {
              key: 'refund', label: 'Refund', align: 'right',
              render: (r) => r.refund > 0 ? <Badge tone="red">− {fmtMoney(r.refund, settings.currency)} ({r.refund_method})</Badge> : <Badge tone="gray">No refund</Badge>,
            },
          ]}
          rows={returns}
          pageSize={12}
          empty={<EmptyState icon="↩" title="No returns processed" action={<Btn size="sm" variant="accent" onClick={() => setModal(true)}>Process a return</Btn>} />}
          loading={!returns}
        />
      </Card>
      <ReturnModal open={modal} onClose={() => setModal(false)} />
    </div>
  );
}
