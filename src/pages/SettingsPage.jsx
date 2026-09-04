// ─── HEEVA CLINIC — settings (clinic, billing, UHID, inventory, print, data)
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import { Btn, Card, Field, Input, Select, Textarea, Badge, PageHeader, Tabs, Toggle, Confirm, Logo } from '../components/ui';
import { download, fmtDateTime } from '../utils';
import { Building2, ReceiptText, Fingerprint, Boxes, Printer, Palette, Database, ShieldCheck, Upload, Download, RotateCcw, AlertTriangle } from 'lucide-react';

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
  const logoRef = useRef(null);
  const importRef = useRef(null);

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
    setF({
      clinic_name: settings.clinic_name, tagline: settings.tagline,
      doctor_name: settings.doctor_name, doctor_qual: settings.doctor_qual, doctor_role: settings.doctor_role,
      address: settings.address, phone: settings.phone, email: settings.email,
      receipt_footer: settings.receipt_footer, logo: settings.logo,
      currency: settings.currency, bill_prefix: settings.bill_prefix,
      bill_padding: settings.bill_padding, default_payment: settings.default_payment,
      uhid_prefix: settings.uhid_prefix, uhid_include_year: settings.uhid_include_year,
      uhid_padding: settings.uhid_padding, uhid_start: settings.uhid_start,
      low_stock_default: settings.low_stock_default, expiry_30: settings.expiry_30, expiry_60: settings.expiry_60,
      expiry_90: settings.expiry_90, fefo: settings.fefo,
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
    const tables = {};
    for (const t of db.tables) {
      tables[t.name] = await t.toArray();
    }
    const payload = { app: 'HEEVA CLINIC', version: 1, exported_at: new Date().toISOString(), data: tables };
    download(`heeva-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload), 'application/json');
    pushToast('success', 'Backup exported');
  };

  const importBackup = async (file) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (payload.app !== 'HEEVA CLINIC' || !payload.data) throw new Error('Not a valid HEEVA CLINIC backup file');
      await db.transaction('rw', db.tables, async () => {
        for (const t of db.tables) {
          const rows = payload.data[t.name];
          if (!Array.isArray(rows)) continue;
          await t.clear();
          await t.bulkPut(rows);
        }
      });
      await updateSettings({});
      pushToast('success', 'Backup restored');
      setTimeout(() => window.location.reload(), 900);
    } catch (e) {
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
            <Btn variant="accent" disabled={busy} onClick={() => save(['clinic_name', 'tagline', 'doctor_name', 'doctor_qual', 'doctor_role', 'address', 'phone', 'email', 'receipt_footer', 'logo'])}>
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
                {logs.map((l) => (
                  <div key={l.id} className="audit-row">
                    <span className="audit-when">{fmtDateTime(l.at)}</span>
                    <Badge tone="navy">{l.action}</Badge>
                    <span className="audit-detail">{l.user_name} — {l.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Section>
      )}

      <Confirm
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all clinic data?"
        message="This deletes all local clinic records on this device. The authorized clinic account will be recreated on the next start. Export a backup first if you have real data."
        danger
        confirmText="Yes, reset local data"
        onConfirm={async () => {
          await db.delete();
          window.location.reload();
        }}
      />
    </div>
  );
}
