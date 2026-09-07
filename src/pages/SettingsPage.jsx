// ─── HEEVA CLINIC — settings (clinic, billing, UHID, inventory, print, data)
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, IconBtn, Card, Modal, Field, Input, Select, Textarea, Badge, PageHeader, Toggle, Confirm, Logo, DataTable, EmptyState,
} from '../components/ui';
import { download, fmtDateTime } from '../utils';
import {
  Building2, ReceiptText, Fingerprint, Boxes, Printer, Palette, Database,
  ShieldCheck, Upload, Download, RotateCcw, AlertTriangle,
  KeyRound, Plus, Trash2, Pencil,
} from 'lucide-react';
import { DEFAULT_SETTINGS } from '../services/core';
import { adminApi } from '../services/api';
import { createService, updateService, deleteService } from '../services/billing';

function Section({ icon: Icon, title, sub, children }) {
  return (
    <Card title={title} sub={sub} actions={<span className="set-ic"><Icon size={17} /></span>}>
      {children}
    </Card>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings, user, pushToast, theme, setTheme, lang, setLang } = useApp();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState(params.get('tab') || 'clinic');
  const [msg, setMsg] = useState(params.get('msg') || '');
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [serviceModal, setServiceModal] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [deleteServiceTarget, setDeleteServiceTarget] = useState(null);
  const [serviceForm, setServiceForm] = useState({ name: '', type: 'service', price: '', description: '' });
  const [serviceBusy, setServiceBusy] = useState(false);
  const [serviceError, setServiceError] = useState('');
  const logoRef = useRef(null);
  const importRef = useRef(null);

  const services = useLiveQuery(() => db.services.toArray(), []) || [];

  useEffect(() => {
    const t = params.get('tab');
    if (t) setTab(t);
    const m = params.get('msg');
    if (m) setMsg(decodeURIComponent(m));
  }, [params]);

  useEffect(() => {
    if (!msg) return undefined;
    const h = setTimeout(() => {
      setMsg('');
      setParams((p) => { p.delete('msg'); return p; }, { replace: true });
    }, 5000);
    return () => clearTimeout(h);
  }, [msg, setParams]);

  const logs = useLiveQuery(async () => db.activity_logs.orderBy('at').reverse().limit(10).toArray(), []);
  const counts = useLiveQuery(async () => {
    const [patients, bills, meds] = await Promise.all([
      db.patients.count(), db.bills.count(), db.medicines.count(),
    ]);
    return { patients, bills, meds };
  }, []);

  useEffect(() => {
    const s = { ...DEFAULT_SETTINGS, ...(settings || {}) };
    setF({
      clinic_name: s.clinic_name || '', tagline: s.tagline || '',
      doctor_name: s.doctor_name || '', doctor_phone: s.doctor_phone || '', doctor_qual: s.doctor_qual || '', doctor_role: s.doctor_role || '',
      address: s.address || '', phone: s.phone || '', email: s.email || '',
      receipt_footer: s.receipt_footer || '', logo: s.logo || '',
      currency: s.currency || '₹', bill_prefix: s.bill_prefix || 'HC-BILL',
      bill_padding: s.bill_padding ?? 6, default_payment: s.default_payment || 'Cash',
      uhid_prefix: s.uhid_prefix || 'HC', uhid_include_year: s.uhid_include_year ?? true,
      uhid_padding: s.uhid_padding ?? 6, uhid_start: s.uhid_start ?? 1,
      low_stock_default: s.low_stock_default ?? 10, expiry_30: s.expiry_30 ?? 30, expiry_60: s.expiry_60 ?? 60,
      expiry_90: s.expiry_90 ?? 90, fefo: s.fefo ?? true,
    });
  }, [settings]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const setBool = (k) => (v) => setF((x) => ({ ...x, [k]: v }));

  const save = async (keys) => {
    setBusy(true);
    try {
      const patch = {};
      for (const k of keys) patch[k] = f[k];
      await updateSettings(patch);
      pushToast('success', 'Settings saved');
    } catch (e) {
      pushToast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const uploadLogo = (file) => {
    const reader = new FileReader();
    reader.onload = () => setF((x) => ({ ...x, logo: reader.result }));
    reader.readAsDataURL(file);
  };

  const exportBackup = async () => {
    try {
      const tables = {};
      for (const t of db.tables) {
        tables[t.name] = await t.toArray();
      }
      const payload = { app: 'HEEVA CLINIC', version: 1, exported_at: new Date().toISOString(), data: tables };
      download(`heeva-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload), 'application/json');
      pushToast('success', 'Backup exported');
    } catch (e) {
      console.error('Export backup error', e);
      pushToast('error', `Backup failed: ${e.message}`);
    }
  };

  const importBackup = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!payload || payload.app !== 'HEEVA CLINIC' || !payload.data) throw new Error('Not a valid HEEVA CLINIC backup file');
      await db.transaction('rw', db.tables, async () => {
        for (const t of db.tables) {
          const rows = payload.data[t.name];
          if (!Array.isArray(rows)) continue;
          await t.clear();
          if (rows.length > 0) {
            await t.bulkPut(rows);
          }
        }
      });
      await updateSettings({});
      pushToast('success', 'Backup restored');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
      console.error('Import backup error', e);
      pushToast('error', `Import failed: ${e.message}`);
    }
  };

  const tabDefs = [
    { key: 'clinic', label: 'Clinic', icon: Building2 },
    { key: 'billing', label: 'Billing', icon: ReceiptText },
    { key: 'uhid', label: 'UHID', icon: Fingerprint },
    { key: 'inventory', label: 'Inventory', icon: Boxes },
    { key: 'print', label: 'Print', icon: Printer },
    { key: 'appearance', label: 'Appearance', icon: Palette },
    { key: 'data', label: 'Data & Backup', icon: Database },
  ];

  const uhidPreview = (() => {
    const year = new Date().getFullYear();
    const n = Number(f.uhid_start) || 1;
    const pad = Number(f.uhid_padding) || 6;
    return `${(f.uhid_prefix || 'HC').toUpperCase()}${f.uhid_include_year ? `-${year}` : ''}-${String(n).padStart(pad, '0')}`;
  })();

  return (
    <div className="page">
      <PageHeader title="Settings" sub="Configure the clinic profile, numbering, inventory rules and app behaviour" />
      {msg && (
        <div className="set-msg">✓ {msg}</div>
      )}
      <div className="tabs rep-tabs">
        {tabDefs.map((t) => (
          <button key={t.key} className={`tab ${tab === t.key ? 'tab-active' : ''}`} onClick={() => setTab(t.key)}><t.icon size={14} /> {t.label}</button>
        ))}
      </div>

      {tab === 'clinic' && (
        <Section icon={Building2} title="Clinic Profile" sub="Shown on payment receipts and prescription letterheads">
          <div className="form-grid">
            <Field label="Clinic Name" className="fg-2"><Input value={f.clinic_name} onChange={set('clinic_name')} /></Field>
            <Field label="Tagline" className="fg-2"><Input value={f.tagline} onChange={set('tagline')} /></Field>
            <Field label="Doctor Name"><Input value={f.doctor_name} onChange={set('doctor_name')} /></Field>
            <Field label="Doctor Phone"><Input value={f.doctor_phone} onChange={set('doctor_phone')} placeholder="e.g. 9913974000" /></Field>
            <Field label="Qualifications"><Input value={f.doctor_qual} onChange={set('doctor_qual')} /></Field>
            <Field label="Role"><Input value={f.doctor_role} onChange={set('doctor_role')} /></Field>
            <Field label="Phone"><Input value={f.phone} onChange={set('phone')} /></Field>
            <Field label="Email" className="fg-2"><Input value={f.email} onChange={set('email')} /></Field>
            <Field label="Address" className="fg-2"><Textarea rows={2} value={f.address} onChange={set('address')} /></Field>
            <Field label="Receipt Footer" className="fg-2"><Input value={f.receipt_footer} onChange={set('receipt_footer')} /></Field>
            <Field label="Logo" hint="PNG/JPG — used on A4 documents">
              <div className="logo-row">
                {f.logo ? <img src={f.logo} alt="logo" className="logo-preview" /> : <Logo size={44} />}
                <input type="file" accept="image/*" hidden ref={logoRef} onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
                <Btn size="sm" variant="ghost" onClick={() => logoRef.current?.click()}>Upload</Btn>
                {f.logo && <Btn size="sm" variant="ghost" onClick={() => setF((x) => ({ ...x, logo: '' }))}>Remove</Btn>}
              </div>
            </Field>
          </div>
          <div className="set-save">
            <Btn variant="accent" disabled={busy} onClick={() => save(['clinic_name', 'tagline', 'doctor_name', 'doctor_phone', 'doctor_qual', 'doctor_role', 'address', 'phone', 'email', 'receipt_footer', 'logo'])}>
              {busy ? 'Saving…' : 'Save clinic profile'}
            </Btn>
          </div>
        </Section>
      )}

      {tab === 'billing' && (
        <Section icon={ReceiptText} title="Billing Settings" sub="Currency, bill numbering and default payment method">
          <div className="form-grid">
            <Field label="Currency Symbol"><Input value={f.currency} onChange={set('currency')} /></Field>
            <Field label="Bill Number Prefix"><Input value={f.bill_prefix} onChange={set('bill_prefix')} /></Field>
            <Field label="Bill Number Padding"><Input type="number" min="3" max="10" value={f.bill_padding} onChange={set('bill_padding')} /></Field>
            <Field label="Default Payment Method">
              <Select value={f.default_payment} onChange={set('default_payment')}>
                {['Cash', 'UPI', 'Card', 'Bank Transfer', 'Other'].map((m) => <option key={m}>{m}</option>)}
              </Select>
            </Field>
            <div className="set-preview">
              <span className="set-preview-label">Next bill number preview</span>
              <Badge tone="navy" className="set-preview-badge">{f.bill_prefix}-{new Date().getFullYear()}-000001</Badge>
            </div>
          </div>
          <div className="set-save">
            <Btn variant="accent" disabled={busy} onClick={() => save(['currency', 'bill_prefix', 'bill_padding', 'default_payment'])}>{busy ? 'Saving…' : 'Save billing settings'}</Btn>
          </div>

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Clinic Billable Services</h4>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                  Standard consultation fees, laboratory tests, and clinical procedures
                </div>
              </div>
              <Btn
                size="sm"
                variant="accent"
                icon={Plus}
                onClick={() => {
                  setEditingService(null);
                  setServiceForm({ name: '', type: 'service', price: '', description: '' });
                  setServiceError('');
                  setServiceModal(true);
                }}
              >
                Add Service
              </Btn>
            </div>

            <DataTable
              columns={[
                { key: 'service_code', label: 'Code', render: (s) => <span className="cell-mono">{s.service_code}</span> },
                { key: 'name', label: 'Service Name', render: (s) => <b>{s.name}</b> },
                { key: 'type', label: 'Type', render: (s) => <Badge tone={s.type === 'consultation' ? 'teal' : 'navy'}>{s.type}</Badge> },
                { key: 'price', label: 'Price', align: 'right', render: (s) => `${f.currency || '₹'} ${s.price}` },
                { key: 'description', label: 'Description', render: (s) => s.description || '—' },
                {
                  key: 'actions', label: '', align: 'right',
                  render: (s) => (
                    <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                      <IconBtn
                        title="Edit Service"
                        icon={Pencil}
                        onClick={() => {
                          setEditingService(s);
                          setServiceForm({ name: s.name, type: s.type || 'service', price: s.price, description: s.description || '' });
                          setServiceError('');
                          setServiceModal(true);
                        }}
                      />
                      <IconBtn
                        title="Delete Service"
                        icon={Trash2}
                        className="text-danger"
                        onClick={() => setDeleteServiceTarget(s)}
                      />
                    </div>
                  ),
                },
              ]}
              rows={services}
              pageSize={8}
              empty={<EmptyState compact title="No clinic services configured" message="Add consultation fees or medical services to include in patient bills." />}
            />
          </div>
        </Section>
      )}

      {tab === 'uhid' && (
        <Section icon={Fingerprint} title="UHID Configuration" sub="Unique Health Identification format — applied to NEW registrations only; existing UHIDs never change">
          <div className="form-grid">
            <Field label="UHID Prefix"><Input value={f.uhid_prefix} onChange={set('uhid_prefix')} placeholder="HC" /></Field>
            <Field label="Include Registration Year">
              <Toggle checked={!!f.uhid_include_year} onChange={setBool('uhid_include_year')} label={f.uhid_include_year ? 'Yes — HC-2026-000001' : 'No — HC-000001'} />
            </Field>
            <Field label="Number Padding (digits)"><Input type="number" min="3" max="10" value={f.uhid_padding} onChange={set('uhid_padding')} /></Field>
            <Field label="Starting Number" hint="Applies to the first UHID of a new year/scope"><Input type="number" min="1" value={f.uhid_start} onChange={set('uhid_start')} /></Field>
            <div className="set-preview fg-2">
              <span className="set-preview-label">Next UHID preview</span>
              <Badge tone="teal" className="set-preview-badge">{uhidPreview}</Badge>
            </div>
          </div>
          <div className="uhid-rules">
            <ShieldCheck size={16} />
            <span>UHID is assigned once, permanently linked to the patient, stored with a unique database constraint, and appears on bills, prescriptions, receipts and history.</span>
          </div>
          <div className="set-save">
            <Btn variant="accent" disabled={busy} onClick={() => save(['uhid_prefix', 'uhid_include_year', 'uhid_padding', 'uhid_start'])}>{busy ? 'Saving…' : 'Save UHID settings'}</Btn>
          </div>
        </Section>
      )}

      {tab === 'inventory' && (
        <Section icon={Boxes} title="Inventory Rules" sub="Low-stock thresholds, expiry alert windows and batch selection">
          <div className="form-grid">
            <Field label="Default Low-Stock Level"><Input type="number" min="0" value={f.low_stock_default} onChange={set('low_stock_default')} /></Field>
            <Field label="Expiry Alert Window 1 (days)"><Input type="number" min="1" value={f.expiry_30} onChange={set('expiry_30')} /></Field>
            <Field label="Expiry Alert Window 2 (days)"><Input type="number" min="1" value={f.expiry_60} onChange={set('expiry_60')} /></Field>
            <Field label="Expiry Alert Window 3 (days)"><Input type="number" min="1" value={f.expiry_90} onChange={set('expiry_90')} /></Field>
            <Field label="FEFO (First Expired First Out)">
              <Toggle checked={!!f.fefo} onChange={setBool('fefo')} label={f.fefo ? 'Enabled — billing picks earliest-expiry batch' : 'Disabled — FIFO by manufacturing date'} />
            </Field>
          </div>
          <div className="set-save">
            <Btn variant="accent" disabled={busy} onClick={() => save(['low_stock_default', 'expiry_30', 'expiry_60', 'expiry_90', 'fefo'])}>{busy ? 'Saving…' : 'Save inventory rules'}</Btn>
          </div>
        </Section>
      )}

      {tab === 'print' && (
        <Section icon={Printer} title="Print Settings" sub="A4 landscape payment receipt with clinic and patient copies">
          <div className="set-preview">
            <span className="set-preview-label">Available format</span>
            <div className="set-chips"><Badge tone="teal">A4 landscape · 2 copies</Badge><Badge tone="gray">Clinic copy</Badge><Badge tone="gray">Patient copy</Badge></div>
          </div>
        </Section>
      )}

      {tab === 'appearance' && (
        <Section icon={Palette} title="Appearance" sub="Theme and language">
          <div className="form-grid">
            <Field label="Theme">
              <div className="theme-opts">
                <Btn variant={theme === 'light' ? 'primary' : 'ghost'} onClick={() => setTheme('light')}>☀️ Light</Btn>
                <Btn variant={theme === 'dark' ? 'primary' : 'ghost'} onClick={() => setTheme('dark')}>🌙 Dark</Btn>
              </div>
            </Field>
            <Field label="Language" hint="Gujarati UI is in progress — English labels are used as fallback">
              <Select value={lang} onChange={(e) => setLang(e.target.value)}>
                <option value="en">English</option>
                <option value="gu">ગુજરાતી (Gujarati)</option>
              </Select>
            </Field>
          </div>
        </Section>
      )}

      {tab === 'data' && (
        <Section icon={Database} title="Data, Backup & Maintenance" sub="All data is stored locally on this device (offline-first). Export regular backups.">
          <div className="data-grid">
            <div className="data-tile">
              <span>Patients</span><b>{counts?.patients ?? '—'}</b>
            </div>
            <div className="data-tile">
              <span>Bills</span><b>{counts?.bills ?? '—'}</b>
            </div>
            <div className="data-tile">
              <span>Medicines</span><b>{counts?.meds ?? '—'}</b>
            </div>
          </div>
          <div className="data-actions">
            <Btn variant="outline" icon={Download} onClick={exportBackup}>Export Full Backup (JSON)</Btn>
            <Btn variant="outline" icon={Upload} onClick={() => importRef.current?.click()}>Import Backup</Btn>
            <input type="file" accept="application/json" hidden ref={importRef} onChange={(e) => { const f2 = e.target.files?.[0]; if (f2) importBackup(f2); e.target.value = ''; }} />
            {user?.role === 'admin' && (
              <Btn variant="danger" icon={RotateCcw} onClick={() => setResetOpen(true)}>Reset All Clinic Data</Btn>
            )}
          </div>
          <div className="data-warn">
            <AlertTriangle size={15} /> Bills, financial records and medicines with history are never deleted — they are cancelled/archived/voided with a full audit trail.
          </div>
          {logs?.length > 0 && (
            <>
              <h4 className="sub-head">Recent activity</h4>
              <div className="audit-mini">
                {logs.map((l, idx) => (
                  <div key={l?.id || l?.at || idx} className="audit-row">
                    <span className="audit-when">{fmtDateTime(l?.at)}</span>
                    <Badge tone="navy">{l?.action || 'ACTION'}</Badge>
                    <span className="audit-detail">{l?.user_name || 'System'} — {l?.detail || '—'}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      {/* Reset All Clinic Data Modal */}
      <Modal
        open={resetOpen}
        onClose={() => {
          if (!isResetting) {
            setResetOpen(false);
            setResetPassword('');
            setResetError('');
          }
        }}
        title="⚠️ Reset All Clinic Data"
        sub="Permanent wipe of all Cloudflare D1 and local clinic records"
        width="md"
        footer={
          <>
            <Btn
              variant="ghost"
              disabled={isResetting}
              onClick={() => {
                setResetOpen(false);
                setResetPassword('');
                setResetError('');
              }}
            >
              Cancel
            </Btn>
            <Btn
              variant="danger"
              disabled={isResetting || !resetPassword.trim()}
              onClick={async () => {
                setIsResetting(true);
                setResetError('');
                try {
                  await adminApi.resetDatabase(resetPassword);
                  await db.delete();
                  window.location.reload();
                } catch (err) {
                  setResetError(err?.message || 'Failed to reset clinic data. Verify password.');
                  setIsResetting(false);
                }
              }}
            >
              {isResetting ? 'Wiping All Data…' : 'Wipe & Reset All Clinic Data'}
            </Btn>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{
            background: 'var(--red-50, #fee2e2)',
            border: '1px solid var(--red-200, #fca5a5)',
            borderRadius: 10,
            padding: '12px 14px',
            color: 'var(--red-800, #991b1b)',
            fontSize: 13,
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={16} /> Irreversible Database Wipe
            </div>
            <div>
              This will <strong>permanently erase all records</strong> from both <strong>Cloudflare D1</strong> and this local browser:
            </div>
            <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12.5 }}>
              <li>Patients, Vitals, Consultations, Prescriptions</li>
              <li>Bills, Payments, Inventory Transactions &amp; Batches</li>
              <li>Expenses, Notifications &amp; Activity Logs</li>
            </ul>
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Clinic settings will be reset to defaults.
            </div>
          </div>

          <Field label="Enter Clinic Password to Authorize Reset" required error={resetError}>
            <div className="input-with-icon" style={{ height: 42 }}>
              <KeyRound size={16} />
              <input
                type="password"
                className="input"
                placeholder="Enter clinic password..."
                value={resetPassword}
                onChange={(e) => {
                  setResetPassword(e.target.value);
                  if (resetError) setResetError('');
                }}
                disabled={isResetting}
                autoFocus
              />
            </div>
          </Field>
        </div>
      </Modal>

      {/* Add / Edit Service Modal */}
      <Modal
        open={serviceModal}
        onClose={() => setServiceModal(false)}
        title={editingService ? 'Edit Clinic Service' : 'Add New Service'}
        width="md"
        footer={
          <>
            <Btn variant="ghost" onClick={() => setServiceModal(false)}>Cancel</Btn>
            <Btn
              variant="accent"
              disabled={serviceBusy || !serviceForm.name.trim() || !serviceForm.price}
              onClick={async () => {
                setServiceBusy(true);
                setServiceError('');
                try {
                  if (editingService) {
                    await updateService(editingService.id, {
                      name: serviceForm.name,
                      type: serviceForm.type,
                      price: Number(serviceForm.price),
                      description: serviceForm.description,
                    }, user?.id);
                    pushToast('success', 'Service updated successfully');
                  } else {
                    await createService({
                      name: serviceForm.name,
                      type: serviceForm.type,
                      price: Number(serviceForm.price),
                      description: serviceForm.description,
                    }, user?.id);
                    pushToast('success', 'New service added');
                  }
                  setServiceModal(false);
                } catch (err) {
                  setServiceError(err.message);
                } finally {
                  setServiceBusy(false);
                }
              }}
            >
              {serviceBusy ? 'Saving…' : editingService ? 'Save Changes' : 'Create Service'}
            </Btn>
          </>
        }
      >
        {serviceError && <div className="form-alert">{serviceError}</div>}
        <div className="form-grid">
          <Field label="Service Name" required className="fg-2">
            <Input
              value={serviceForm.name}
              onChange={(e) => setServiceForm((s) => ({ ...s, name: e.target.value }))}
              placeholder="e.g. Consultation Fee, Dressing, ECG..."
            />
          </Field>
          <Field label="Service Type" required>
            <Select
              value={serviceForm.type}
              onChange={(e) => setServiceForm((s) => ({ ...s, type: e.target.value }))}
            >
              <option value="service">Clinical Service / Procedure</option>
              <option value="consultation">Doctor Consultation</option>
            </Select>
          </Field>
          <Field label={`Price (${f.currency || '₹'})`} required>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={serviceForm.price}
              onChange={(e) => setServiceForm((s) => ({ ...s, price: e.target.value }))}
              placeholder="0.00"
            />
          </Field>
          <Field label="Description" className="fg-2">
            <Textarea
              rows={2}
              value={serviceForm.description}
              onChange={(e) => setServiceForm((s) => ({ ...s, description: e.target.value }))}
              placeholder="Optional notes or details regarding this service..."
            />
          </Field>
        </div>
      </Modal>

      {/* Delete Service Confirm */}
      <Confirm
        open={!!deleteServiceTarget}
        onClose={() => setDeleteServiceTarget(null)}
        danger
        title="Delete Clinic Service?"
        message={`Are you sure you want to permanently delete service "${deleteServiceTarget?.name}"? Services that have been billed to patients cannot be deleted.`}
        confirmText="Delete Service"
        onConfirm={async () => {
          if (!deleteServiceTarget) return;
          try {
            await deleteService(deleteServiceTarget.id, user?.id);
            pushToast('success', `Service "${deleteServiceTarget.name}" deleted.`);
            setDeleteServiceTarget(null);
          } catch (err) {
            pushToast('error', err.message);
          }
        }}
      />
    </div>
  );
}
