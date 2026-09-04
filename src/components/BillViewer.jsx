// ─── HEEVA CLINIC — shared bill viewer modal (print + payment actions) ─────
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Btn, Modal, Badge, PaymentBadge, Input, Select, Field } from './ui';
import { printInvoiceA4 } from '../print/printers';
import { recordPayment, cancelBill } from '../services/billing';
import { syncAlerts } from '../services/notifications';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty } from '../utils';
import { Printer, CreditCard, XCircle } from 'lucide-react';
import { PAY_METHODS } from '../services/billing';
import { Confirm } from './ui';

export default function BillViewer({ full, onClose, allowCancel = true, allowPayment = true }) {
  const { settings, user, pushToast, can } = useApp();
  const { bill, items, payments } = full;
  const money = (v) => fmtMoney(v, settings.currency);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [method, setMethod] = useState(settings.default_payment || 'Cash');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const balance = bill.total - (bill.paid || 0);
  const open = bill.status === 'completed';

  const doPay = async () => {
    setBusy(true);
    try {
      await recordPayment(bill.id, { amount: Number(amount), method }, user.id);
      pushToast('success', `Payment of ${money(Number(amount))} recorded`);
      await syncAlerts(user.id).catch(() => {});
      onClose();
    } catch (e) {
      pushToast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async (reason) => {
    setBusy(true);
    try {
      await cancelBill(bill.id, reason, user.id);
      pushToast('success', 'Bill cancelled — medicine stock restored to original batches');
      setCancelOpen(false);
      await syncAlerts(user.id).catch(() => {});
      onClose();
    } catch (e) {
      pushToast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={<span className="cell-mono">{bill.bill_no}</span>}
        sub={`${bill.patient_name} · ${bill.uhid}`}
        width="lg"
        footer={
          <>
            <Btn variant="ghost" onClick={onClose}>Close</Btn>
            {allowPayment && open && balance > 0.005 && can('payments') && (
              <Btn variant="accent" icon={CreditCard} onClick={() => { setAmount(String(balance)); setPayOpen(true); }}>Record Payment</Btn>
            )}
            {allowCancel && open && can('billing') && (
              <Btn variant="danger" icon={XCircle} onClick={() => setCancelOpen(true)}>Cancel Bill</Btn>
            )}
            <Btn variant="primary" icon={Printer} onClick={() => printInvoiceA4(bill, items, payments, settings)}>A4 Payment Receipt</Btn>
          </>
        }
      >
        <div className="bv-body">
          <div className="bv-meta">
            <PaymentBadge status={bill.status === 'CANCELLED' ? 'CANCELLED' : bill.payment_status} />
            <Badge tone="navy">{bill.bill_type}</Badge>
            <span>{fmtDateTime(bill.time)}</span>
            {bill.cancel_reason && <Badge tone="red">Cancelled: {bill.cancel_reason}</Badge>}
          </div>
          <table className="table bv-table">
            <thead>
              <tr><th>Item</th><th>Category</th><th className="th-right">Qty</th><th className="th-right">Price</th><th className="th-right">Amount</th></tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.name}{it.batch_no && <span className="cell-sub"> · batch {it.batch_no}</span>}{it.returned > 0 && <Badge tone="amber"> {fmtQty(it.returned)} returned</Badge>}</td>
                  <td><Badge tone={it.item_type === 'medicine' ? 'teal' : it.item_type === 'consultation' ? 'navy' : 'blue'}>{it.item_type}</Badge></td>
                  <td className="td-right">{fmtQty(it.qty)}</td>
                  <td className="td-right">{money(it.price)}</td>
                  <td className="td-right">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="bv-totals">
            <div className="kv"><span>Subtotal</span><b>{money(bill.subtotal)}</b></div>
            <div className="kv"><span>Discount</span><b>− {money(bill.discount)}</b></div>
            <div className="kv kv-total"><span>Total Amount</span><b>{money(bill.total)}</b></div>
            <div className="kv"><span>Paid</span><b>{money(bill.paid)}</b></div>
            <div className="kv"><span>Balance</span><b>{money(balance)}</b></div>
          </div>
          {payments.length > 0 && (
            <div className="bv-pay">
              {payments.map((x) => (
                <span key={x.id} className="bpay-item">
                  <Badge tone={x.kind === 'refund' ? 'red' : 'green'}>{x.kind === 'refund' ? 'Refund' : x.method}</Badge> {money(x.amount)} · {fmtDate(x.at)}
                </span>
              ))}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record payment"
        sub={`${bill.bill_no} · balance ${money(balance)}`}
        width="sm"
        footer={<>
          <Btn variant="ghost" onClick={() => setPayOpen(false)}>Cancel</Btn>
          <Btn variant="accent" onClick={doPay} disabled={busy || !(Number(amount) > 0)}>{busy ? 'Saving…' : 'Record'}</Btn>
        </>}
      >
        <div className="stack">
          <Field label="Method">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
          </Field>
          <Field label={`Amount (max ${money(balance)})`}>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Btn size="sm" variant="ghost" onClick={() => setAmount(String(balance))}>Full balance {money(balance)}</Btn>
        </div>
      </Modal>

      <Confirm
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel bill ${bill.bill_no}?`}
        message="Medicine items will be restored to their original batches (FEFO ledger). The bill is never deleted — it stays as CANCELLED with full audit trail."
        requireReason
        danger
        confirmText="Cancel bill"
        busy={busy}
        onConfirm={doCancel}
      />
    </>
  );
}
