// ─── HEEVA CLINIC — inventory: stock, batches (FEFO), expiry, ledger ───────
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Field, Input, Select, Badge, DataTable, PageHeader, EmptyState,
  Tabs, Modal, Confirm,
} from '../components/ui';
import { stockMap, expiryBuckets, lowStockList, markBatchExpired, adjustStock, createBatch, updateBatch, deleteBatch, TXN_TYPES } from '../services/inventory';
import { syncAlerts } from '../services/notifications';
import { fmtMoney, fmtQty, daysUntil, fmtDateTime, fmtDate, dkey, addDays } from '../utils';
import { Boxes, PackagePlus, AlertTriangle, Hourglass, ScrollText, Wrench, Plus, Pencil, Trash2, Upload } from 'lucide-react';
import CsvImportModal from '../components/csv/CsvImportModal';

const TXN_TONE = {
  SALE: 'navy', RETURN: 'teal', ADJUSTMENT: 'blue',
  DAMAGE: 'amber', EXPIRED: 'red', CANCELLED_BILL: 'gray',
};

function AdjustModal({ open, onClose }) {
  const { user, pushToast } = useApp();
  const meds = useLiveQuery(async () => (await db.medicines.where('active').equals(1).toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [med, setMed] = useState(null);
  const [batchId, setBatchId] = useState('');
  const [type, setType] = useState('ADJUSTMENT');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const batches = useLiveQuery(async () => {
    if (!med) return [];
    return db.batches.where('medicine_id').equals(med.id).toArray();
  }, [med]);

  React.useEffect(() => {
    if (open) { setMed(null); setBatchId(''); setType('ADJUSTMENT'); setQty(''); setNote(''); setErr(''); }
  }, [open]);

  const save = async () => {
    setErr('');
    if (!med) { setErr('Select a medicine'); return; }
    if (!(Number(qty) > 0)) { setErr('Quantity must be positive'); return; }
    setBusy(true);
    try {
      await adjustStock({ medicine_id: med.id, batch_id: batchId || null, type, qty: Number(qty), note }, user.id);
      pushToast('success', `Stock ${type.toLowerCase()} recorded (${med.name})`);
      await syncAlerts(user.id).catch(() => {});
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Stock Adjustment" width="md"
      sub="Creates an immutable ledger entry. Stock can never go negative."
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Record adjustment'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="stack">
        <Field label="Medicine" required>
          <Select value={med?.id || ''} onChange={(e) => { setMed((meds || []).find((m) => m.id === e.target.value) || null); setBatchId(''); }}>
            <option value="">Select…</option>
            {(meds || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        <Field label="Batch" hint="Leave empty to auto-pick (FEFO)">
          <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} disabled={!med}>
            <option value="">Auto (earliest expiry first)</option>
            {(batches || []).map((b) => <option key={b.id} value={b.id}>{b.batch_no} · exp {b.expiry} · {b.available} avail</option>)}
          </Select>
        </Field>
        <div className="fg-row">
          <Field label="Type">
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="ADJUSTMENT">Adjustment (+ add stock)</option>
              <option value="DAMAGE">Damage (− remove stock)</option>
              <option value="EXPIRED">Expired (− remove stock)</option>
            </Select>
          </Field>
          <Field label="Quantity" required>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        </div>
        <Field label="Note / Reason"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Carton found torn in store" /></Field>
      </div>
    </Modal>
  );
}

function BatchModal({ open, onClose, editing }) {
  const { user, pushToast } = useApp();
  const meds = useLiveQuery(async () => (await db.medicines.where('active').equals(1).toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const [medId, setMedId] = useState('');
  const [batchNo, setBatchNo] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expiry, setExpiry] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  React.useEffect(() => {
    if (open) {
      if (editing) {
        setMedId(editing.medicine_id || '');
        setBatchNo(editing.batch_no || '');
        setMfgDate(editing.mfg_date || '');
        setExpiry(editing.expiry || '');
        setQty(String(editing.quantity || ''));
        setPrice(String(editing.purchase_price ?? ''));
      } else {
        setMedId(meds?.[0]?.id || '');
        setBatchNo(`B-${Date.now().toString().slice(-5)}`);
        setMfgDate(dkey(new Date()));
        setExpiry('');
        setQty('');
        setPrice('');
      }
      setErr('');
    }
  }, [open, editing, meds]);

  const save = async () => {
    setErr('');
    if (!medId) { setErr('Select a medicine'); return; }
    if (!batchNo.trim()) { setErr('Batch number is required'); return; }
    if (!editing && !(Number(qty) > 0)) { setErr('Quantity must be greater than zero'); return; }
    setBusy(true);
    try {
      if (editing) {
        await updateBatch(editing.id, {
          batch_no: batchNo.trim().toUpperCase(),
          mfg_date: mfgDate || dkey(new Date()),
          expiry: expiry || '9999-12-31',
          purchase_price: Number(price) || 0,
        }, user.id);
        pushToast('success', `Batch ${batchNo} updated`);
      } else {
        await createBatch({
          medicine_id: medId,
          batch_no: batchNo.trim().toUpperCase(),
          mfg_date: mfgDate || dkey(new Date()),
          expiry: expiry || '9999-12-31',
          quantity: Number(qty),
          purchase_price: Number(price) || 0,
        }, user.id);
        pushToast('success', `Batch ${batchNo} created`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit Batch ${editing.batch_no}` : 'Add Medicine Batch'} width="md"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add batch'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="form-grid">
        <Field label="Medicine" required className="fg-2">
          <Select value={medId} onChange={(e) => setMedId(e.target.value)} disabled={!!editing}>
            {(meds || []).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.type})</option>)}
          </Select>
        </Field>
        <Field label="Batch Number" required>
          <Input value={batchNo} onChange={(e) => setBatchNo(e.target.value)} placeholder="BATCH-01" />
        </Field>
        {!editing && (
          <Field label="Quantity (initial stock)" required>
            <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
        )}
        <Field label="Mfg Date">
          <Input type="date" value={mfgDate} onChange={(e) => setMfgDate(e.target.value)} />
        </Field>
        <Field label="Expiry Date" required>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </Field>
        <Field label="Purchase Price (₹)">
          <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
        </Field>
      </div>
    </Modal>
  );
}

export default function Inventory() {
  const { settings, pushToast } = useApp();
  const [tab, setTab] = useState('stock');
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [importBatchOpen, setImportBatchOpen] = useState(false);
  const [editingBatch, setEditingBatch] = useState(null);
  const [deleteBatchTarget, setDeleteBatchTarget] = useState(null);
  const [expireTarget, setExpireTarget] = useState(null);
  const [stockF, setStockF] = useState('all');
  const [txnType, setTxnType] = useState('');
  const [txnFrom, setTxnFrom] = useState(dkey(addDays(new Date(), -30)));
  const [txnTo, setTxnTo] = useState(dkey(new Date()));

  const stock = useLiveQuery(() => stockMap(), []);
  const buckets = useLiveQuery(() => expiryBuckets(), []);
  const lowList = useLiveQuery(() => lowStockList(), []);
  const users = useLiveQuery(async () => new Map((await db.users.toArray()).map((u) => [u.id, u.name])), []);
  const allMeds = useLiveQuery(() => db.medicines.where('active').equals(1).toArray(), []);

  const stockRows = useLiveQuery(async () => {
    if (!stock) return null;
    let list = [...stock.values()].filter((e) => e.medicine.active);
    const min = (e) => e.medicine.min_stock || Number(settings.low_stock_default) || 0;
    if (stockF === 'low') list = list.filter((e) => e.available > 0 && e.available <= min(e));
    else if (stockF === 'out') list = list.filter((e) => e.available <= 0);
    else if (stockF === 'expiring') list = list.filter((e) => e.next_expiry && daysUntil(e.next_expiry) <= 90);
    return list.map((e) => ({ ...e, min: min(e) })).sort((a, b) => a.medicine.name.localeCompare(b.medicine.name));
  }, [stock, stockF]);

  const batches = useLiveQuery(async () => {
    const bs = await db.batches.toArray();
    const meds = new Map((await db.medicines.toArray()).map((m) => [m.id, m]));
    return bs
      .map((b) => ({ ...b, medicine: meds.get(b.medicine_id) }))
      .filter((b) => b.medicine && b.medicine.active)
      .sort((a, b) => a.medicine.name.localeCompare(b.medicine.name) || a.expiry.localeCompare(b.expiry));
  }, []);

  const txns = useLiveQuery(async () => {
    let list = await db.inventory_txns.orderBy('at').reverse().toArray();
    const meds = new Map((await db.medicines.toArray()).map((m) => [m.id, m]));
    const bs = new Map((await db.batches.toArray()).map((b) => [b.id, b]));
    list = list
      .map((t) => ({ ...t, medicine: meds.get(t.medicine_id), batch: bs.get(t.batch_id) }))
      .filter((t) => t.medicine && t.at.slice(0, 10) >= txnFrom && t.at.slice(0, 10) <= txnTo)
      .filter((t) => !txnType || t.type === txnType);
    return list.slice(0, 300);
  }, [txnType, txnFrom, txnTo]);

  const expRows = (buckets ? [...buckets.expired, ...buckets.d30, ...buckets.d60, ...buckets.d90] : []);

  return (
    <div className="page">
      <PageHeader
        title="Inventory"
        sub="FEFO batch control · expiry tracking · immutable stock ledger"
        actions={<Btn variant="accent" icon={Wrench} onClick={() => setAdjustOpen(true)}>Stock Adjustment</Btn>}
      />

      <div className="inv-summary">
        <div className="inv-chip green"><Boxes size={16} /> {stock ? [...stock.values()].filter((e) => e.medicine.active).length : '—'} active medicines</div>
        <div className="inv-chip amber"><AlertTriangle size={16} /> {lowList ? lowList.low.length : '—'} low · {lowList ? lowList.out.length : '—'} out of stock</div>
        <div className="inv-chip red"><Hourglass size={16} /> {buckets ? buckets.expired.length : '—'} expired batches · {buckets ? buckets.d30.length : '—'} expiring ≤30d</div>
        <div className="inv-chip blue"><ScrollText size={16} /> Ledger: every change is recorded</div>
      </div>

      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'stock', label: 'Stock Levels' },
          { key: 'batches', label: 'Batches (FEFO)', badge: batches?.length },
          { key: 'expiry', label: 'Expiry Watch', badge: expRows.length },
          { key: 'ledger', label: 'Transaction Ledger' },
        ]}
      />

      {tab === 'stock' && (
        <Card>
          <div className="toolbar">
            <Select value={stockF} onChange={(e) => setStockF(e.target.value)} className="toolbar-select">
              <option value="all">All medicines</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
              <option value="expiring">Expiring ≤ 90 days</option>
            </Select>
          </div>
          <DataTable
            columns={[
              { key: 'name', label: 'Medicine', sortable: true, sortValue: (r) => r.medicine.name, render: (r) => (
                <span className="cell-person"><span className="cell-main">{r.medicine.name}</span><span className="cell-sub">{r.medicine.generic || ''} · min {r.min}</span></span>
              ) },
              { key: 'available', label: 'Available', align: 'right', sortable: true, render: (r) => <b>{fmtQty(r.available)} {r.medicine.unit}</b> },
              {
                key: 'status', label: 'Status',
                render: (r) => {
                  if (r.available <= 0) return <Badge tone="red">OUT OF STOCK</Badge>;
                  if (r.available <= r.min) return <Badge tone="amber">LOW STOCK</Badge>;
                  return <Badge tone="green">OK</Badge>;
                },
              },
              {
                key: 'next_expiry', label: 'Next Expiry (FEFO first out)',
                render: (r) => !r.next_expiry ? <Badge tone="red">No stock</Badge> : (
                  <span>{r.next_expiry} <Badge tone={daysUntil(r.next_expiry) < 0 ? 'red' : daysUntil(r.next_expiry) <= 30 ? 'red' : daysUntil(r.next_expiry) <= 90 ? 'amber' : 'gray'}>
                    {daysUntil(r.next_expiry) < 0 ? 'EXPIRED' : `${daysUntil(r.next_expiry)}d`}
                  </Badge></span>
                ),
              },
              { key: 'val', label: 'Stock Value (buy)', align: 'right', render: (r) => fmtMoney(r.available * (r.medicine.purchase_price || 0), settings.currency) },
            ]}
            rows={stockRows}
            pageSize={12}
            empty={<EmptyState icon="📦" title="No stock records" message="Use Stock Adjustment to add stock." />}
            loading={!stockRows}
          />
        </Card>
      )}

      {tab === 'batches' && (
        <Card
          sub="Batches are selected automatically at billing time — earliest expiry goes out first (FEFO)"
          actions={
            <div style={{ display: 'flex', gap: '8px' }}>
              <Btn size="sm" variant="ghost" icon={Upload} onClick={() => setImportBatchOpen(true)}>Import Batches</Btn>
              <Btn size="sm" variant="accent" icon={Plus} onClick={() => { setEditingBatch(null); setBatchModalOpen(true); }}>+ Add Batch</Btn>
            </div>
          }
        >
          <DataTable
            columns={[
              { key: 'med', label: 'Medicine', sortable: true, sortValue: (b) => b.medicine.name, render: (b) => b.medicine.name },
              { key: 'batch_no', label: 'Batch #', render: (b) => <span className="cell-mono">{b.batch_no}</span> },
              { key: 'mfg_date', label: 'Mfg', render: (b) => b.mfg_date || '—' },
              {
                key: 'expiry', label: 'Expiry', sortable: true,
                render: (b) => {
                  if (b.status === 'expired') return <Badge tone="red">EXPIRED {b.expiry}</Badge>;
                  const d = daysUntil(b.expiry);
                  return <span>{b.expiry} <Badge tone={d < 0 ? 'red' : d <= 30 ? 'red' : d <= 60 ? 'amber' : d <= 90 ? 'amber' : 'green'}>{d}d</Badge></span>;
                },
              },
              { key: 'quantity', label: 'Received', align: 'right', sortable: true },
              { key: 'available', label: 'Available', align: 'right', sortable: true, render: (b) => <b>{fmtQty(b.available)}</b> },
              {
                key: 'act', label: '', align: 'right',
                render: (b) => (
                  <span className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    <Btn size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditingBatch(b); setBatchModalOpen(true); }}>Edit</Btn>
                    {b.status !== 'expired' && b.available > 0 && (
                      <Btn size="sm" variant="ghost" onClick={() => setExpireTarget(b)}>Expire</Btn>
                    )}
                    <Btn size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteBatchTarget(b)}>Delete</Btn>
                  </span>
                ),
              },
            ]}
            rows={batches}
            pageSize={15}
            empty={<EmptyState title="No batches yet" message="Use Add Batch or Stock Adjustment to add stock." action={<Btn size="sm" variant="accent" onClick={() => { setEditingBatch(null); setBatchModalOpen(true); }}>+ Add Batch</Btn>} />}
            loading={!batches}
          />
        </Card>
      )}

      {tab === 'expiry' && (
        <div className="expiry-grid">
          {[
            { title: '🔴 Expired', rows: buckets?.expired || [], tone: 'red', hint: 'Cannot be sold — visible in reports only' },
            { title: 'Expiring within 30 days', rows: buckets?.d30 || [], tone: 'amber', hint: 'Sell first (FEFO applies automatically)' },
            { title: 'Expiring within 60 days', rows: buckets?.d60 || [], tone: 'amber', hint: 'Keep an eye on movement' },
            { title: '🔵 Within 90 days', rows: buckets?.d90 || [], tone: 'blue', hint: 'Planned movement' },
          ].map((g) => (
            <Card key={g.title} title={g.title} sub={g.hint} tone={g.tone} className="exp-card">
              {g.rows.length === 0 ? <EmptyState compact icon="✅" title="None" /> : (
                <div className="exp-list">
                  {g.rows.map((b) => (
                    <div className="exp-row" key={b.batch.id}>
                      <span className="exp-name">{b.med_name}</span>
                      <span className="exp-sub">{b.batch.batch_no} · {b.expiry} · {b.on_hand} pcs</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {tab === 'ledger' && (
        <Card sub="Immutable record of every inventory movement — sales, returns, adjustments, expiries, cancellations">
          <div className="toolbar">
            <Select value={txnType} onChange={(e) => setTxnType(e.target.value)} className="toolbar-select">
              <option value="">All types</option>
              {TXN_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </Select>
            <Input type="date" value={txnFrom} onChange={(e) => setTxnFrom(e.target.value)} className="toolbar-date" />
            <Input type="date" value={txnTo} onChange={(e) => setTxnTo(e.target.value)} className="toolbar-date" />
          </div>
          <DataTable
            dense
            columns={[
              { key: 'at', label: 'When', sortable: true, render: (t) => <span className="cell-sub">{fmtDateTime(t.at)}</span> },
              { key: 'type', label: 'Type', render: (t) => <Badge tone={TXN_TONE[t.type] || 'gray'}>{t.type.replace('_', ' ')}</Badge> },
              { key: 'medicine', label: 'Medicine', render: (t) => t.medicine?.name || '—' },
              { key: 'batch', label: 'Batch', render: (t) => t.batch?.batch_no || '—' },
              { key: 'qty', label: 'Qty', align: 'right', render: (t) => <b className={t.qty > 0 ? 'qty-in' : 'qty-out'}>{t.qty > 0 ? '+' : ''}{fmtQty(t.qty)}</b> },
              { key: 'by', label: 'By', render: (t) => (users && users.get(t.by)) || '—' },
              { key: 'note', label: 'Note', render: (t) => <span className="cell-ellip">{t.note || '—'}</span> },
            ]}
            rows={txns}
            pageSize={15}
            empty={<EmptyState icon="📜" title="No ledger entries in range" />}
            loading={!txns}
          />
        </Card>
      )}

      <AdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} />
      <BatchModal open={batchModalOpen} onClose={() => { setBatchModalOpen(false); setEditingBatch(null); }} editing={editingBatch} />

      <Confirm
        open={!!deleteBatchTarget}
        onClose={() => setDeleteBatchTarget(null)}
        title={`Delete batch ${deleteBatchTarget?.batch_no}?`}
        message="This will delete this batch if no bills reference it. Batches with sales history cannot be deleted and must be marked expired."
        danger
        confirmText="Delete batch"
        onConfirm={async () => {
          try {
            await deleteBatch(deleteBatchTarget.id, user.id);
            pushToast('success', `Batch ${deleteBatchTarget.batch_no} deleted`);
            setDeleteBatchTarget(null);
          } catch (e) {
            pushToast('error', e.message);
          }
        }}
      />
      <Confirm
        open={!!expireTarget}
        onClose={() => setExpireTarget(null)}
        title={`Mark batch ${expireTarget?.batch_no} expired?`}
        message={`${expireTarget?.medicine?.name} — ${expireTarget?.available} units will be removed from sellable stock and recorded as EXPIRED in the ledger.`}
        danger
        confirmText="Mark expired"
        onConfirm={async () => {
          await markBatchExpired(expireTarget.id, user.id);
          await syncAlerts().catch(() => {});
          pushToast('success', 'Batch marked expired');
          setExpireTarget(null);
        }}
      />
      <CsvImportModal
        open={importBatchOpen}
        onClose={() => setImportBatchOpen(false)}
        type="inventory_batches"
        context={{ existingMedicines: allMeds }}
      />
    </div>
  );
}
