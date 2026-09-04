// ─── HEEVA CLINIC — billing POS (consultation + services + medicines) ──────
// Workflow: search patient → add items → qty/price/discount → pay →
// complete (atomic: bill + payments + FEFO stock decrement + audit) → receipt
import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Badge, PageHeader, EmptyState,
  UhidChip, SearchSelect, Seg, Confirm,
} from '../components/ui';
import BillViewer from '../components/BillViewer';
import { createBill, getBill, PAY_METHODS } from '../services/billing';
import { stockMap } from '../services/inventory';
import { syncAlerts } from '../services/notifications';
import { printInvoiceA4 } from '../print/printers';
import { fmtMoney, fmtQty, fmtDate, daysUntil } from '../utils';
import {
  Pill, Stethoscope, Sparkles, Trash2, Minus, Plus, UserPlus, ReceiptText,
  Printer, CheckCircle2, AlertTriangle, Search,
} from 'lucide-react';
import { round2 as r2 } from '../services/core';

function PaymentModal({ open, onClose, total, onComplete, defaultMethod }) {
  const { pushToast } = useApp();
  const [rows, setRows] = useState([{ method: defaultMethod || 'Cash', amount: '' }]);
  const [busy, setBusy] = useState(false);
  const [savePending, setSavePending] = useState(false);

  useEffect(() => {
    if (open) setRows([{ method: defaultMethod || 'Cash', amount: String(total) }]);
  }, [open]);

  const paid = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const remaining = r2(total - paid);

  const setRow = (i, k, v) => setRows((x) => x.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const complete = async () => {
    if (paid > total + 0.005) { pushToast('warning', 'Payments exceed bill total — remove excess'); return; }
    setBusy(true);
    try {
      await onComplete(rows.filter((r) => Number(r.amount) > 0));
    } catch (e) {
      pushToast('error', e.message);
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Payment" sub={`Bill total ${fmtMoney(total)} · ${paid > 0 ? `collected ${fmtMoney(paid)}` : 'no payment yet'}`} width="md"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Back</Btn>
        {remaining > 0.005 && <Btn variant="outline" disabled={busy} onClick={async () => { setBusy(true); try { await onComplete([]); } catch (e) { pushToast('error', e.message); setBusy(false); } }}>Save as Pending</Btn>}
        <Btn variant="accent" size="lg" disabled={busy || paid <= 0} onClick={complete}>{busy ? 'Completing…' : `Complete · ${fmtMoney(paid)}`}</Btn>
      </>}>
      <div className="pay-rows">
        {rows.map((r, i) => (
          <div className="pay-row" key={i}>
            <Select value={r.method} onChange={(e) => setRow(i, 'method', e.target.value)}>
              {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
            </Select>
            <Input type="number" min="0" step="0.01" value={r.amount} onChange={(e) => setRow(i, 'amount', e.target.value)} placeholder="Amount" />
            <Btn size="sm" variant="ghost" onClick={() => setRow(i, 'amount', String(Math.max(0, remaining)))}>Rest</Btn>
            {rows.length > 1 && <Btn size="sm" variant="ghost" icon={Trash2} onClick={() => setRows((x) => x.filter((_, j) => j !== i))} title="Remove payment" />}
          </div>
        ))}
      </div>
      <div className="pay-summary">
        <span>Collected: <b>{fmtMoney(paid)}</b></span>
        <span>Remaining: <b className={remaining > 0.005 ? 'pay-due' : 'pay-ok'}>{fmtMoney(remaining)}</b></span>
        {paid < total && <span className="pay-status"><Badge tone="amber">Bill will be marked PARTIALLY PAID</Badge></span>}
      </div>
      <div className="pay-actions">
        <Btn size="sm" variant="outline" icon={Plus} onClick={() => setRows((x) => [...x, { method: 'Cash', amount: '' }])}>Add payment method</Btn>
        <Btn size="sm" variant="ghost" onClick={() => setRows([{ method: defaultMethod || 'Cash', amount: String(total) }])}>Full amount</Btn>
      </div>
    </Modal>
  );
}

export default function Billing() {
  const { user, settings, pushToast, can } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  // patient
  const patients = useLiveQuery(async () => (await db.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [patient, setPatient] = useState(null);

  // item catalog
  const stock = useLiveQuery(() => stockMap(), []);
  const services = useLiveQuery(() => db.services.where('active').equals(1).toArray(), []);
  const [tab, setTab] = useState('medicines');
  const [medQ, setMedQ] = useState('');

  // cart
  const [cart, setCart] = useState([]);
  const [discMode, setDiscMode] = useState('amt');
  const [discVal, setDiscVal] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [done, setDone] = useState(null);
  const [viewBill, setViewBill] = useState(null);
  const [busy, setBusy] = useState(false);

  const money = (v) => fmtMoney(v, settings.currency);

  const cartQty = (medId) => cart.filter((i) => i.item_type === 'medicine' && i.ref_id === medId).reduce((s, i) => s + i.qty, 0);

  const addMedicine = (m) => {
    const avail = (stock?.get(m.id)?.available || 0);
    const inCart = cartQty(m.id);
    if (inCart + 1 > avail) { pushToast('error', `Only ${fmtQty(avail)} of ${m.name} available in stock`); return; }
    setCart((x) => {
      const found = x.find((i) => i.item_type === 'medicine' && i.ref_id === m.id);
      if (found) return x.map((i) => (i === found ? { ...i, qty: i.qty + 1 } : i));
      return [...x, { item_type: 'medicine', ref_id: m.id, name: m.name, qty: 1, price: m.selling_price, unit: m.unit }];
    });
  };

  const addService = (s, type) => {
    setCart((x) => {
      const found = x.find((i) => i.item_type === type && i.ref_id === s.id);
      if (found) return x.map((i) => (i === found ? { ...i, qty: i.qty + 1 } : i));
      return [...x, { item_type: type, ref_id: s.id, name: s.name, qty: 1, price: s.price, unit: 'service' }];
    });
  };

  const setQty = (idx, qty) => {
    setCart((x) => x.map((it, i) => {
      if (i !== idx) return it;
      const n = Math.max(0, Math.round(qty));
      if (it.item_type === 'medicine') {
        const others = cartQty(it.ref_id) - it.qty;
        const avail = stock?.get(it.ref_id)?.available || 0;
        if (n > avail - others) {
          pushToast('warning', `Max available: ${fmtQty(avail - others)}`);
          return { ...it, qty: Math.max(0, avail - others) };
        }
      }
      return { ...it, qty: n };
    }));
  };

  const setPrice = (idx, price) => setCart((x) => x.map((it, i) => (i === idx ? { ...it, price } : it)));
  const removeItem = (idx) => setCart((x) => x.filter((_, i) => i !== idx));

  const subtotal = r2(cart.reduce((s, i) => s + i.qty * (Number(i.price) || 0), 0));
  const disc = discMode === 'pct' ? r2(subtotal * (Math.min(Number(discVal) || 0, 100) / 100)) : Math.min(Number(discVal) || 0, subtotal);
  const total = r2(Math.max(0, subtotal - disc));

  // deep-link: ?new=1&patient=ID or ?bill=ID
  useEffect(() => {
    const pid = params.get('patient');
    const billId = params.get('bill');
    if (billId) {
      getBill(billId).then((full) => {
        if (full) { setViewBill(full); setParams({}, { replace: true }); }
      });
      return;
    }
    if (params.get('new') === '1' && pid) {
      const p = patients?.find((x) => x.id === pid);
      if (p) setPatient(p);
      setParams({}, { replace: true });
    }
  }, [params, patients, services]); // eslint-disable-line

  const complete = async (payments) => {
    if (!patient) throw new Error('Select a patient first');
    if (!cart.length) throw new Error('Bill has no items');
    setBusy(true);
    setPayOpen(false);
    try {
      const { bill, items } = await createBill({
        patient_id: patient.id,
        items: cart,
        discount_mode: discMode,
        discount_value: Number(discVal) || 0,
        payments,
      }, user.id);
      pushToast('success', `Bill ${bill.bill_no} completed — inventory updated automatically`);
      await syncAlerts(user.id).catch(() => {});
      setDone({ bill, items });
      setCart([]);
      setDiscVal('');
      setPatient(null);
    } finally {
      setBusy(false);
    }
  };

  const medsList = useMemo(() => {
    const list = [...(stock ? [...stock.values()] : [])].filter((e) => e.medicine.active);
    const s = medQ.trim().toLowerCase();
    if (s) {
      const digits = s.replace(/\D/g, '');
      return list.filter((e) =>
        e.medicine.name.toLowerCase().includes(s) ||
        (e.medicine.generic || '').toLowerCase().includes(s) ||
        (digits && (e.medicine.barcode || '').includes(digits))
      );
    }
    return list.slice(0, 60);
  }, [stock, medQ]);

  const consultationSvcs = (services || []).filter((s) => s.type === 'consultation');
  const serviceSvcs = (services || []).filter((s) => s.type === 'service');

  // ── success screen ──
  if (done) {
    return (
      <div className="page">
        <PageHeader title="Bill Completed" sub="Inventory updated · stock ledger recorded · receipt ready" />
        <Card className="bill-done-card">
          <div className="done-panel">
            <CheckCircle2 size={46} className="done-ic" />
            <h2 className="done-no">{done.bill.bill_no}</h2>
            <p>{done.bill.patient_name} · <UhidChip uhid={done.bill.uhid} size="sm" /></p>
            <p className="done-amount">
              Total <b>{money(done.bill.total)}</b> · Paid <b>{money(done.bill.paid)}</b>{' '}
              <Badge tone={done.bill.payment_status === 'PAID' ? 'green' : 'amber'}>{done.bill.payment_status}</Badge>
            </p>
            <div className="done-actions">
              <Btn variant="primary" icon={Printer} onClick={() => printInvoiceA4(done.bill, done.items, [], settings)}>A4 Payment Receipt</Btn>
              <Btn variant="accent" icon={ReceiptText} onClick={() => setDone(null)}>New Bill</Btn>
            </div>
            <p className="done-note">Tip: full payment history is attached to the bill — reopen it anytime from the bills list.</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader title="Billing" sub="POS counter — consultation, services & medicines in one invoice" />

      <div className="pos-grid">
        {/* LEFT: patient + items */}
        <div className="pos-left">
          <Card title="1 · Patient" pad>
            <div className="pos-patient-row">
              <SearchSelect
                value={patient}
                onChange={setPatient}
                options={patients || []}
                getLabel={(p) => `${p.name} — ${p.uhid}${p.mobile ? ' · ' + p.mobile : ''}`}
                getSearch={(p) => `${p.name} ${p.uhid} ${p.mobile}`}
                placeholder="Search by UHID, name or mobile…"
              />
              <Btn variant="ghost" size="sm" icon={UserPlus} onClick={() => navigate('/patients?new=1')}>
                New
              </Btn>
            </div>
            {patient && (
              <div className="pos-patient-info">
                <span className="ppi-name">{patient.name}</span>
                <UhidChip uhid={patient.uhid} size="sm" />
                <span>{patient.gender}{patient.dob ? ` · DOB ${fmtDate(patient.dob)}` : ''}{patient.blood_group ? ` · ${patient.blood_group}` : ''}</span>
                {patient.allergies && (
                  <span className="allergy-warn"><AlertTriangle size={13} /> {patient.allergies}</span>
                )}
              </div>
            )}
          </Card>

          <Card pad className="pos-catalog">
            <div className="pos-tabs">
              <button className={`pos-tab ${tab === 'medicines' ? 'pos-tab-on' : ''}`} onClick={() => setTab('medicines')}><Pill size={15} /> Medicines</button>
              <button className={`pos-tab ${tab === 'consultation' ? 'pos-tab-on' : ''}`} onClick={() => setTab('consultation')}><Stethoscope size={15} /> Consultation</button>
              <button className={`pos-tab ${tab === 'services' ? 'pos-tab-on' : ''}`} onClick={() => setTab('services')}><Sparkles size={15} /> Services</button>
            </div>

            {tab === 'medicines' && (
              <div className="pos-medlist-wrap">
                <div className="pos-medsearch"><Search size={14} /><Input value={medQ} onChange={(e) => setMedQ(e.target.value)} placeholder="Search medicine or scan barcode…" autoFocus /></div>
                <div className="pos-medlist">
                  {medsList.length === 0 && <div className="pos-none">No medicines match</div>}
                  {medsList.map(({ medicine: m, available, next_expiry }) => {
                    const left = available - cartQty(m.id);
                    const exp = next_expiry ? daysUntil(next_expiry) : null;
                    return (
                      <button key={m.id} className="pos-med" onClick={() => addMedicine(m)} disabled={left <= 0}>
                        <span className="pos-med-name">{m.name}{m.strength && <span className="cell-sub"> {m.strength}</span>}</span>
                        <span className="pos-med-right">
                          <Badge tone={left <= 0 ? 'red' : left <= (m.min_stock || 0) ? 'amber' : 'green'}>{left <= 0 ? 'OUT' : `${left} ${m.unit}`}</Badge>
                          {exp != null && exp <= 90 && <Badge tone={exp <= 30 ? 'red' : 'amber'}>exp {exp}d</Badge>}
                          <b>{money(m.selling_price)}</b>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === 'consultation' && (
              <div className="pos-svc-list">
                {consultationSvcs.map((s) => (
                  <button key={s.id} className="pos-svc" onClick={() => addService(s, 'consultation')}>
                    <span>{s.name}</span>
                    <span className="pos-svc-price">{money(s.price)}</span>
                  </button>
                ))}
              </div>
            )}

            {tab === 'services' && (
              <div className="pos-svc-list">
                {serviceSvcs.map((s) => (
                  <button key={s.id} className="pos-svc" onClick={() => addService(s, 'service')}>
                    <span>{s.name}</span>
                    <span className="pos-svc-price">{money(s.price)}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT: cart */}
        <div className="pos-right">
          <Card title="2 · Bill Items" sub={cart.length ? `${cart.length} line(s)` : 'Add consultation, services or medicines'} pad className="pos-cart-card">
            {cart.length === 0 ? (
              <EmptyState compact title="Bill is empty" message="Select a patient on the left and add items." />
            ) : (
              <div className="cart-lines">
                {cart.map((it, i) => (
                  <div className={`cart-line cl-${it.item_type}`} key={`${it.item_type}-${it.ref_id}`}>
                    <div className="cl-top">
                      <Badge tone={it.item_type === 'medicine' ? 'teal' : it.item_type === 'consultation' ? 'navy' : 'blue'}>{it.item_type === 'consultation' ? 'CONSULT' : it.item_type === 'service' ? 'SERVICE' : 'MED'}</Badge>
                      <span className="cl-name">{it.name}</span>
                      <button className="cl-rm" title="Remove" onClick={() => removeItem(i)}><Trash2 size={13} /></button>
                    </div>
                    <div className="cl-bottom">
                      <span className="cl-qty">
                        <button onClick={() => setQty(i, it.qty - 1)}><Minus size={12} /></button>
                        <b>{fmtQty(it.qty)}</b>
                        <button onClick={() => setQty(i, it.qty + 1)}><Plus size={12} /></button>
                      </span>
                      <span className="cl-price">
                        × <Input className="cl-price-input" type="number" min="0" step="0.01" value={it.price} onChange={(e) => setPrice(i, e.target.value)} />
                      </span>
                      <b className="cl-amt">{money(it.qty * (Number(it.price) || 0))}</b>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="cart-totals">
              <div className="kv"><span>Subtotal</span><b>{money(subtotal)}</b></div>
              <div className="cart-disc">
                <span className="kv-label">Discount</span>
                <Seg size="sm" value={discMode} onChange={setDiscMode} options={[{ value: 'amt', label: '₹' }, { value: 'pct', label: '%' }]} />
                <Input className="cart-disc-input" type="number" min="0" value={discVal} onChange={(e) => setDiscVal(e.target.value)} placeholder="0" />
                <b>− {money(disc)}</b>
              </div>
              <div className="kv kv-total"><span>TOTAL AMOUNT</span><b>{money(total)}</b></div>
            </div>

            <div className="cart-actions">
              <Btn
                variant="accent"
                size="lg"
                icon={ReceiptText}
                disabled={!patient || !cart.length || busy}
                onClick={() => setPayOpen(true)}
              >
                {busy ? 'Completing…' : `3 · Take Payment · ${money(total)}`}
              </Btn>
            </div>
          </Card>
        </div>
      </div>

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={total}
        defaultMethod={settings.default_payment}
        onComplete={complete}
      />

      {viewBill && (
        <BillViewer full={viewBill} onClose={() => setViewBill(null)} />
      )}
    </div>
  );
}
