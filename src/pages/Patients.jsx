// ─── HEEVA CLINIC — patients: search and register ──────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Textarea, DataTable, Badge,
  PageHeader, EmptyState, UhidChip, Avatar, Spinner,
} from '../components/ui';
import { registerPatient } from '../services/patients';
import { getSettings } from '../services/core';
import { ageLabel, fmtDate, fmtMoney, dkey, validMobile, download, toCSV } from '../utils';
import { UserPlus, Download, Upload, Search, CheckCircle2, Phone, Droplets } from 'lucide-react';
import CsvImportModal from '../components/csv/CsvImportModal';

const BLOOD_GROUPS = ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];

function emptyForm() {
  return {
    name: '', dob: '', gender: '', mobile: '', alt_mobile: '', email: '',
    address: '', city: 'Surat', state: 'Gujarat', pin: '',
    ec_name: '', ec_number: '', ec_relation: '',
    blood_group: '', allergies: '', conditions: '', current_meds: '', notes: '',
  };
}

function RegisterModal({ open, onClose, prefill = {} }) {
  const { t, settings, user, pushToast } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(3);
  const [f, setF] = useState({ ...emptyForm(), ...prefill });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setF({ ...emptyForm(), ...prefill }); setStep(3); setErrs({}); }
  }, [open]);

  // live UHID preview
  const uhidPreview = useLiveQuery(async () => {
    if (!open) return null;
    const s = await getSettings();
    const year = new Date().getFullYear();
    const key = s.uhid_include_year ? `UHID|${year}` : 'UHID|ALL';
    const row = await db.counters.get(key);
    const n = row ? row.value + 1 : Number(s.uhid_start) || 1;
    const pad = 3;
    return `${(s.uhid_prefix || 'HC').toUpperCase()}${s.uhid_include_year ? `-${year}` : ''}-${String(n).padStart(pad, '0')}`;
  }, [open]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const validateStep = (s) => {
    const e = {};
    if (s === 1) {
      if (f.name.trim().length < 3) e.name = 'Full name is required (min 3 characters)';
      if (!f.gender) e.gender = 'Select gender';
      if (!f.mobile.trim()) e.mobile = 'Mobile number is required';
      else if (!validMobile(f.mobile)) e.mobile = 'Enter a valid 10-digit mobile number';
      if (f.dob && f.dob > dkey(new Date())) e.dob = 'Date of birth cannot be in the future';
      if (!f.dob) e.dob = 'Date of birth is required';
      if (f.alt_mobile && !validMobile(f.alt_mobile)) e.alt_mobile = 'Invalid mobile number';
    }
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validateStep(1)) return;
    setBusy(true);
    try {
      const p = await registerPatient(f, user.id);
      pushToast('success', `Patient registered with UHID ${p.uhid}`);
      onClose();
      navigate(`/patients/${p.id}`);
    } catch (e) {
      pushToast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  const stepDots = (
    <div className="wizard-dots">
      {[1, 2, 3].map((s) => (
        <span key={s} className={`wiz-dot ${step >= s ? 'wiz-on' : ''}`} />
      ))}
      <span className="wiz-step-label">Step {step} of 3 · {['Identity', 'Contact', 'Medical History'][step - 1]}</span>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Register New Patient"
      sub={<span className="uhid-preview">UHID will be assigned: <UhidChip uhid={uhidPreview || '…'} size="sm" /> — permanent, unique, never changes</span>}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          {step < 3 && (
            <Btn onClick={next}>
              {step === 1 ? 'Continue →' : 'Continue →'}
            </Btn>
          )}
          {step === 3 && (
            <Btn variant="accent" onClick={save} disabled={busy}>
              {busy ? 'Registering…' : 'Register patient'}
            </Btn>
          )}
        </>
      }
    >
      {step === 3 && (
        <div className="form-grid">
          <Field label="Full Name" required error={errs.name} className="fg-2">
            <Input value={f.name} onChange={set('name')} placeholder="Enter full name" autoFocus />
          </Field>
          <Field label="Date of Birth" error={errs.dob} hint={f.dob ? `Age: ${ageLabel({ dob: f.dob })}` : ''}>
            <Input type="date" value={f.dob} onChange={set('dob')} max={dkey(new Date())} />
          </Field>
          <Field label="Gender" required error={errs.gender}>
            <Select value={f.gender} onChange={set('gender')}>
              <option value="">Select…</option>
              <option>Male</option><option>Female</option><option>Other</option>
            </Select>
          </Field>
          <Field label="Mobile Number" required error={errs.mobile}>
            <Input value={f.mobile} onChange={set('mobile')} placeholder="10-digit mobile" inputMode="numeric" />
          </Field>
          <Field label="Alternative Mobile" error={errs.alt_mobile}>
            <Input value={f.alt_mobile} onChange={set('alt_mobile')} inputMode="numeric" />
          </Field>
          <Field label="Blood Group">
            <Select value={f.blood_group} onChange={set('blood_group')}>
              {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b || 'Unknown'}</option>)}
            </Select>
          </Field>
          <div className="fg-sep"><strong>Address Information</strong></div>
          <Field label="Address" className="fg-2"><Input value={f.address} onChange={set('address')} /></Field>
          <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
          <Field label="State"><Input value={f.state} onChange={set('state')} /></Field>
        </div>
      )}

      {step === 2 && (
        <div className="form-grid">
          <Field label="Address" className="fg-2">
            <Input value={f.address} onChange={set('address')} />
          </Field>
          <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
          <Field label="State"><Input value={f.state} onChange={set('state')} /></Field>
          <Field label="PIN Code" error={errs.pin}><Input value={f.pin} onChange={set('pin')} inputMode="numeric" /></Field>
        </div>
      )}

      {false && step === 3 && (
        <div className="form-grid">
          <div className="fg-sep"><strong>Optional medical information</strong></div>
          <Field label="Allergies" className="fg-2" hint="e.g. Penicillin, sulphur drugs">
            <Textarea rows={2} value={f.allergies} onChange={set('allergies')} />
          </Field>
          <Field label="Important Medical Conditions" className="fg-2" hint="e.g. Diabetes, Hypertension, Asthma">
            <Textarea rows={2} value={f.conditions} onChange={set('conditions')} />
          </Field>
          <Field label="Current Medications" className="fg-2">
            <Textarea rows={2} value={f.current_meds} onChange={set('current_meds')} />
          </Field>
          <Field label="Notes" className="fg-2">
            <Textarea rows={2} value={f.notes} onChange={set('notes')} />
          </Field>
          <div className="reg-summary">
            <div><span>Name</span>{f.name || '—'}</div>
            <div><span>Age / Gender</span>{ageLabel({ dob: f.dob, approx_age: f.approx_age })} / {f.gender || '—'}</div>
            <div><span>Mobile</span>{f.mobile || '—'}</div>
            <div><span>UHID (to be assigned)</span><UhidChip uhid={uhidPreview || '…'} size="sm" /></div>
          </div>
          <Btn variant="accent" size="lg" onClick={save} disabled={busy} className="fg-2">
            {busy ? 'Registering…' : '✓ Register patient'}
          </Btn>
        </div>
      )}
    </Modal>
  );
}

export default function Patients() {
  const { t, settings } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [reg, setReg] = useState(params.get('new') === '1');
  const [importOpen, setImportOpen] = useState(false);
  const [qMobile, setQMobile] = useState('');

  const patients = useLiveQuery(async () => {
    const all = await db.patients.toArray();
    const consults = await db.consultations.toArray();
    const lastVisit = {};
    for (const c of consults) if (!lastVisit[c.patient_id] || c.time > lastVisit[c.patient_id]) lastVisit[c.patient_id] = c.time;
    let list = all.map((p) => ({ ...p, last_visit: lastVisit[p.id] || null }));
    const s = q.trim().toLowerCase();
    if (s) {
      const digits = s.replace(/\D/g, '');
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(s) ||
        (p.uhid || '').toLowerCase().includes(s) ||
        (digits && (p.mobile || '').includes(digits)) ||
        (p.dob || '') === s
      );
    }
    if (gender) list = list.filter((p) => p.gender === gender);
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }, [q, gender]);

  const exportCSV = () => {
    const rows = (patients || []).map((p) => [p.uhid, p.name, p.gender, ageLabel(p), p.mobile, p.dob, p.address, p.city, p.reg_date, p.blood_group]);
    download(`heeva-patients-${dkey()}.csv`, toCSV(['UHID', 'Name', 'Gender', 'Age', 'Mobile', 'DOB', 'Address', 'City', 'Registered', 'Blood Group'], rows), 'text/csv');
  };

  if (params.get('new') === '1') {
    params.delete('new');
    setParams(params, { replace: true });
  }

  return (
    <div className="page">
      <PageHeader
        title="Patients"
        sub={`${(patients || []).length} patient(s) · UHID-linked permanent records`}
        actions={<>
          <Btn variant="ghost" icon={Upload} onClick={() => setImportOpen(true)}>Import CSV</Btn>
          <Btn variant="ghost" icon={Download} onClick={exportCSV}>Export CSV</Btn>
          <Btn variant="accent" icon={UserPlus} onClick={() => setReg(true)}>+ {t('new_patient', 'New Patient')}</Btn>
        </>}
      />

      <Card>
        <div className="toolbar">
          <div className="toolbar-search">
            <Search size={15} />
            <input className="input" placeholder="Search by name, UHID, mobile, or date of birth…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={gender} onChange={(e) => setGender(e.target.value)} className="toolbar-select">
            <option value="">All genders</option>
            <option>Male</option><option>Female</option><option>Other</option>
          </Select>
        </div>

        <DataTable
          columns={[
            { key: 'uhid', label: 'UHID', sortable: true, render: (p) => <UhidChip uhid={p.uhid} size="sm" /> },
            {
              key: 'name', label: 'Patient', sortable: true,
              render: (p) => (
                <span className="cell-person">
                  <Avatar name={p.name} size={30} tone={p.gender === 'Female' ? 'teal' : 'navy'} />
                  <span>
                    <span className="cell-main">{p.name} {p.needs_completion && <Badge tone="red">Complete profile</Badge>}</span>
                    <span className="cell-sub">{p.blood_group && <span title="Blood group"><Droplets size={11} /> {p.blood_group}</span>} · {p.city || ''}</span>
                  </span>
                </span>
              ),
            },
            { key: 'age', label: 'Age / Gender', sortable: true, sortValue: (p) => ageLabel(p), render: (p) => `${ageLabel(p)} · ${p.gender || '—'}` },
            { key: 'mobile', label: 'Mobile', sortable: true, render: (p) => <span className="cell-mono">{p.mobile || '—'}</span> },
            { key: 'reg_date', label: 'Registered', sortable: true, render: (p) => fmtDate(p.reg_date) },
            { key: 'last_visit', label: 'Last Visit', sortable: true, sortValue: (p) => p.last_visit || '', render: (p) => (p.last_visit ? fmtDate(p.last_visit) : <Badge tone="gray">First visit</Badge>) },
          ]}
          rows={patients}
          pageSize={12}
          onRow={(p) => navigate(`/patients/${p.id}`)}
          empty={
            <EmptyState
              icon="👥"
              title={q ? 'No matching patients' : 'No patients registered yet'}
              message={q ? 'Try a different name, UHID or mobile number.' : 'Register your first patient to generate a UHID.'}
              action={!q ? <Btn variant="accent" icon={UserPlus} onClick={() => setReg(true)}>Register patient</Btn> : null}
            />
          }
          loading={!patients}
        />
      </Card>

      <RegisterModal open={reg} onClose={() => setReg(false)} />
      <CsvImportModal open={importOpen} onClose={() => setImportOpen(false)} type="patients" />
    </div>
  );
}
