// ─── HEEVA CLINIC — medicine master & category management (CRUD, archive, CSV) ─
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Textarea, Badge, DataTable,
  PageHeader, EmptyState, Confirm, Tabs,
} from '../components/ui';
import {
  createMedicine, updateMedicine, archiveMedicine, deleteMedicine,
  categoryList, createCategory, updateCategory, deleteCategory,
  MEDICINE_TYPES, stockMap,
} from '../services/inventory';
import { importMedicinesCSV } from '../services/billing';
import { fmtDate, fmtMoney, fmtQty, daysUntil, download, toCSV, dkey } from '../utils';
import { Pill, Plus, Archive, Download, Upload, Pencil, Search, Trash2, FolderPlus, Tag } from 'lucide-react';
import CsvImportModal from '../components/csv/CsvImportModal';

const EMPTY = {
  name: '', generic: '', category: 'Analgesic',
  type: 'Tablet', strength: '', unit: 'strip',
  purchase_price: '', selling_price: '', min_stock: '', location: '', description: '',
};

function MedFormModal({ open, onClose, editing }) {
  const { user, pushToast, settings } = useApp();
  const cats = useLiveQuery(() => categoryList(), []);
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setF(editing ? {
        name: editing.name, generic: editing.generic, category: editing.category,
        type: editing.type, strength: editing.strength, unit: editing.unit,
        purchase_price: String(editing.purchase_price ?? ''), selling_price: String(editing.selling_price ?? ''),
        min_stock: String(editing.min_stock ?? ''), location: editing.location, description: editing.description,
      } : EMPTY);
      setErr('');
    }
  }, [open, editing]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setErr('');
    if (!f.name.trim()) { setErr('Medicine name is required'); return; }
    if (!f.selling_price || Number(f.selling_price) < 0) { setErr('Valid selling price is required'); return; }
    setBusy(true);
    try {
      const data = {
        ...f,
        purchase_price: Number(f.purchase_price) || 0,
        selling_price: Number(f.selling_price) || 0,
        min_stock: Number(f.min_stock) || 0,
      };
      if (editing) {
        await updateMedicine(editing.id, data, user.id);
        pushToast('success', `${f.name} updated`);
      } else {
        await createMedicine(data, user.id);
        pushToast('success', `${f.name} added to the medicine master`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Add Medicine'} width="lg"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add medicine'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="form-grid">
        <Field label="Medicine Name (Brand)" required className="fg-2"><Input value={f.name} onChange={set('name')} placeholder="e.g. Dolo 650" /></Field>
        <Field label="Generic Name" className="fg-2"><Input value={f.generic} onChange={set('generic')} placeholder="e.g. Paracetamol 650mg" /></Field>
        <Field label="Category">
          <Select value={f.category || ''} onChange={set('category')}>
            <option value="">Select category…</option>
            {(cats || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Type">
          <Select value={f.type} onChange={set('type')}>{MEDICINE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
        </Field>
        <Field label="Strength"><Input value={f.strength} onChange={set('strength')} placeholder="e.g. 650 mg" /></Field>
        <Field label="Unit"><Input value={f.unit} onChange={set('unit')} placeholder="strip / bottle / vial" /></Field>
        <Field label="Purchase Price (₹)"><Input type="number" min="0" step="0.01" value={f.purchase_price} onChange={set('purchase_price')} /></Field>
        <Field label="Selling Price (₹)" required><Input type="number" min="0" step="0.01" value={f.selling_price} onChange={set('selling_price')} /></Field>
        <Field label="Minimum Stock Level" hint={`Default: ${settings.low_stock_default}`}><Input type="number" min="0" value={f.min_stock} onChange={set('min_stock')} /></Field>
        <Field label="Storage Location"><Input value={f.location} onChange={set('location')} placeholder="e.g. Shelf A-2 / Fridge" /></Field>
        <Field label="Description" className="fg-2"><Textarea rows={2} value={f.description} onChange={set('description')} /></Field>
      </div>
    </Modal>
  );
}

function CategoryModal({ open, onClose, editing }) {
  const { user, pushToast } = useApp();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setName(editing ? editing.name : '');
      setErr('');
    }
  }, [open, editing]);

  const save = async () => {
    setErr('');
    if (!name.trim()) { setErr('Category name is required'); return; }
    setBusy(true);
    try {
      if (editing) {
        await updateCategory(editing.id, name, user.id);
        pushToast('success', `Category renamed to ${name.trim()}`);
      } else {
        await createCategory(name, user.id);
        pushToast('success', `Category ${name.trim()} added`);
      }
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit Category` : 'Add Medicine Category'} width="sm"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Category'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <Field label="Category Name" required>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Antibiotics" autoFocus />
      </Field>
    </Modal>
  );
}

export default function Medicines() {
  const { user, settings, pushToast } = useApp();
  const [params] = useSearchParams();
  const [activeTab, setActiveTab] = useState('medicines');
  const [q, setQ] = useState(params.get('q') || '');
  const [catF, setCatF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [statusF, setStatusF] = useState('active');
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [editing, setEditing] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importCatOpen, setImportCatOpen] = useState(false);

  // Category state
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [deleteCatTarget, setDeleteCatTarget] = useState(null);

  const cats = useLiveQuery(() => categoryList(), []);
  const stock = useLiveQuery(() => stockMap(), []);

  const catUsage = useLiveQuery(async () => {
    const meds = await db.medicines.toArray();
    const map = new Map();
    for (const m of meds) {
      if (m.category) map.set(m.category, (map.get(m.category) || 0) + 1);
    }
    return map;
  }, []);

  const rows = useLiveQuery(async () => {
    const all = await db.medicines.toArray();
    let list = all.map((m) => {
      const s = stock?.get(m.id);
      return { ...m, available: s?.available ?? 0, total: s?.total ?? 0, next_expiry: s?.next_expiry || null };
    });
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter((m) =>
        (m.name || '').toLowerCase().includes(s) ||
        (m.generic || '').toLowerCase().includes(s) ||
        (m.medicine_code || '').toLowerCase().includes(s)
      );
    }
    if (catF) list = list.filter((m) => m.category === catF);
    if (typeF) list = list.filter((m) => m.type === typeF);
    if (statusF === 'active') list = list.filter((m) => m.active);
    else if (statusF === 'archived') list = list.filter((m) => !m.active);
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [q, catF, typeF, statusF, stock]);

  const exportCSV = () => {
    const list = rows || [];
    download(`heeva-medicines-${dkey()}.csv`, toCSV(
      ['Code', 'Name', 'Generic', 'Category', 'Type', 'Strength', 'Unit', 'Buy Price', 'Sell Price', 'Min Stock', 'Available', 'Active'],
      list.map((m) => [m.medicine_code, m.name, m.generic, m.category, m.type, m.strength, m.unit, m.purchase_price, m.selling_price, m.min_stock, m.available, m.active ? 'yes' : 'no'])
    ), 'text/csv');
  };


  return (
    <div className="page">
      <PageHeader
        title="Medicines & Pharmacy"
        sub="Master list of pharmaceutical products, pricing, stock thresholds & categories"
        actions={<>
          {activeTab === 'medicines' && (
            <>
              <Btn variant="ghost" icon={Upload} onClick={() => setImportOpen(true)}>Import CSV</Btn>
              <Btn variant="ghost" icon={Download} onClick={exportCSV}>Export</Btn>
              <Btn variant="accent" icon={Plus} onClick={() => { setEditing(null); setFormOpen(true); }}>+ Add Medicine</Btn>
            </>
          )}
          {activeTab === 'categories' && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <Btn variant="ghost" icon={Upload} onClick={() => setImportCatOpen(true)}>Import CSV</Btn>
              <Btn variant="accent" icon={Plus} onClick={() => { setEditingCat(null); setCatModalOpen(true); }}>+ Add Category</Btn>
            </div>
          )}
        </>}
      />

      <Tabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'medicines', label: 'Medicines Master', badge: rows?.length },
          { key: 'categories', label: 'Medicine Categories', badge: cats?.length },
        ]}
      />

      {activeTab === 'medicines' && (
        <Card>
          <div className="toolbar">
            <div className="toolbar-search grow"><Search size={15} /><input className="input" placeholder="Search name, generic or code…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            <Select value={catF} onChange={(e) => setCatF(e.target.value)} className="toolbar-select">
              <option value="">All categories</option>
              {(cats || []).map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </Select>
            <Select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="toolbar-select">
              <option value="">All types</option>
              {MEDICINE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </Select>
            <Select value={statusF} onChange={(e) => setStatusF(e.target.value)} className="toolbar-select">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </Select>
          </div>

          <DataTable
            columns={[
              { key: 'medicine_code', label: 'Code', render: (m) => <span className="cell-mono">{m.medicine_code}</span> },
              { key: 'name', label: 'Medicine', sortable: true, render: (m) => (
                <span className="cell-person"><span className="cell-main">{m.name} {!m.active && <Badge tone="gray">Archived</Badge>}</span><span className="cell-sub">{m.generic || '—'}{m.strength ? ` · ${m.strength}` : ''}</span></span>
              ) },
              { key: 'category', label: 'Category', sortable: true, render: (m) => m.category || '—' },
              { key: 'type', label: 'Type' },
              { key: 'selling_price', label: 'Sell Price', align: 'right', sortable: true, render: (m) => fmtMoney(m.selling_price, settings.currency) },
              {
                key: 'available', label: 'Stock', align: 'right', sortable: true,
                render: (m) => {
                  const min = m.min_stock || Number(settings.low_stock_default) || 0;
                  const tone = m.available <= 0 ? 'red' : m.available <= min ? 'amber' : 'green';
                  return <Badge tone={m.active ? tone : 'gray'}>{m.active ? `${fmtQty(m.available)} ${m.unit || ''}` : 'archived'}</Badge>;
                },
              },
              {
                key: 'next_expiry', label: 'Next Expiry',
                render: (m) => {
                  if (!m.active) return '—';
                  if (!m.next_expiry) return <Badge tone="red">No batches</Badge>;
                  const d = daysUntil(m.next_expiry);
                  return <span>{fmtDate(m.next_expiry)} {d <= 90 && <Badge tone={d < 0 ? 'red' : d <= 30 ? 'red' : 'amber'}>{d < 0 ? 'expired' : `${d}d`}</Badge>}</span>;
                },
              },
              {
                key: 'actions', label: '', align: 'right',
                render: (m) => (
                  <span className="cell-actions" onClick={(e) => e.stopPropagation()}>
                    <Btn size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditing(m); setFormOpen(true); }}>Edit</Btn>
                    {m.active ? (
                      <>
                        <Btn size="sm" variant="ghost" icon={Archive} onClick={() => setArchiveTarget(m)}>Archive</Btn>
                        <Btn size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteTarget(m)}>Delete</Btn>
                      </>
                    ) : (
                      <Btn size="sm" variant="ghost" onClick={async () => { await updateMedicine(m.id, { active: 1 }, user.id); pushToast('success', 'Medicine reactivated'); }}>Restore</Btn>
                    )}
                  </span>
                ),
              },
            ]}
            rows={rows}
            pageSize={12}
            onRow={(m) => { setEditing(m); setFormOpen(true); }}
            empty={<EmptyState title="No Medicines Found" message="Add medicines to start managing your clinic inventory." action={<Btn size="sm" variant="accent" onClick={() => { setEditing(null); setFormOpen(true); }}>+ Add Medicine</Btn>} />}
            loading={!rows}
          />
        </Card>
      )}

      {activeTab === 'categories' && (
        <Card title="Medicine Categories" sub="Organize medicines by pharmacological or therapeutic classification">
          <DataTable
            columns={[
              { key: 'name', label: 'Category Name', sortable: true, render: (c) => <b>{c.name}</b> },
              {
                key: 'count', label: 'Connected Medicines', align: 'right',
                render: (c) => {
                  const count = catUsage?.get(c.name) || 0;
                  return <Badge tone={count > 0 ? 'teal' : 'gray'}>{count} medicine(s)</Badge>;
                },
              },
              {
                key: 'actions', label: '', align: 'right',
                render: (c) => (
                  <span className="cell-actions">
                    <Btn size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditingCat(c); setCatModalOpen(true); }}>Edit</Btn>
                    <Btn size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteCatTarget(c)}>Delete</Btn>
                  </span>
                ),
              },
            ]}
            rows={cats}
            pageSize={12}
            empty={<EmptyState title="No categories" action={<Btn size="sm" variant="accent" onClick={() => { setEditingCat(null); setCatModalOpen(true); }}>+ Add Category</Btn>} />}
            loading={!cats}
          />
        </Card>
      )}

      <MedFormModal open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} editing={editing} />
      <CategoryModal open={catModalOpen} onClose={() => { setCatModalOpen(false); setEditingCat(null); }} editing={editingCat} />

      <Confirm
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title={`Archive ${archiveTarget?.name}?`}
        message="Archived medicines cannot be billed, but all history (stock, bills, transactions) is preserved. You can restore them anytime."
        danger
        confirmText="Archive medicine"
        onConfirm={async () => {
          await archiveMedicine(archiveTarget.id, user.id);
          pushToast('success', `${archiveTarget.name} archived`);
          setArchiveTarget(null);
        }}
      />

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.name}?`}
        message="This permanently removes an unused medicine. Medicines with stock, bills or prescriptions cannot be deleted and must be archived."
        danger
        confirmText="Delete medicine"
        onConfirm={async () => {
          try {
            await deleteMedicine(deleteTarget.id, user.id);
            pushToast('success', `${deleteTarget.name} deleted`);
            setDeleteTarget(null);
          } catch (e) {
            pushToast('error', e.message);
          }
        }}
      />

      <Confirm
        open={!!deleteCatTarget}
        onClose={() => setDeleteCatTarget(null)}
        title={`Delete category ${deleteCatTarget?.name}?`}
        message="Before deletion, the system will verify whether existing medicines are connected to this category."
        danger
        confirmText="Delete category"
        onConfirm={async () => {
          try {
            await deleteCategory(deleteCatTarget.id, user.id);
            pushToast('success', `Category ${deleteCatTarget.name} deleted`);
            setDeleteCatTarget(null);
          } catch (e) {
            pushToast('error', e.message);
          }
        }}
      />

      <CsvImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        type="medicines"
        context={{ existingMedicines: rows }}
      />
      <CsvImportModal
        open={importCatOpen}
        onClose={() => setImportCatOpen(false)}
        type="medicine_categories"
        context={{ existingCategories: cats }}
      />
    </div>
  );
}
