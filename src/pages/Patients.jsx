// ─── HEEVA CLINIC — patients: search and register ──────────────────────────
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, IconBtn, Confirm, Card, Modal, Field, Input, Select, Textarea, DataTable, Badge,
  PageHeader, EmptyState, UhidChip, Avatar, Spinner,
} from '../components/ui';
import { registerPatient, deletePatient } from '../services/patients';
import { getSettings } from '../services/core';
import { getNextUhid } from '../services/api';
import { ageLabel, fmtDate, fmtDateTime, fmtMoney, dkey, validMobile, download, toCSV } from '../utils';
import { UserPlus, Download, Upload, Search, CheckCircle2, Phone, Droplets, Trash2 } from 'lucide-react';
import CsvImportModal from '../components/csv/CsvImportModal';

const BLOOD_GROUPS = ['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed', 'Other'];

function emptyForm() {
  return {
    name: '', age: '', gender: 'M', marital_status: 'Single', mobile: '',
    blood_group: '', address: '',
  };
}

function RegisterModal({ open, onClose, prefill = {} }) {
  const { t, settings, user, pushToast } = useApp();
  const navigate = useNavigate();
  const [f, setF] = useState({ ...emptyForm(), ...prefill });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverPreview, setServerPreview] = useState(null);

  useEffect(() => {
    if (open) {
      setF({ ...emptyForm(), ...prefill });
      setErrs({});
      setServerPreview(null);
      getNextUhid().then((res) => {
        if (res && res.nextUhid) {
          setServerPreview(res.nextUhid);
        }
      }).catch(() => {});
    }
  }, [open]);

  // live UHID preview
  const uhidPreview = useLiveQuery(async () => {
    if (!open) return null;
    const s = await getSettings();
    const year = new Date().getFullYear();
    const pad = Number(s.uhid_padding) || 6;
    const prefix = (s.uhid_prefix || 'HC').trim().toUpperCase();
    const count = await db.patients.count();
    if (count === 0) {
      const n = Number(s.uhid_start) || 1;
      return `${prefix}${s.uhid_include_year ? `-${year}` : ''}-${String(n).padStart(pad, '0')}`;
    }
    const key = s.uhid_include_year ? `UHID|${year}` : 'UHID|ALL';
    const row = await db.counters.get(key);
    const n = row ? row.value + 1 : Number(s.uhid_start) || 1;
    return `${prefix}${s.uhid_include_year ? `-${year}` : ''}-${String(n).padStart(pad, '0')}`;
  }, [open]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  // Enter key navigation: moves to next focusable form field without submitting
  const handleKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    const target = e.target;
    if (!target || target.tagName !== 'INPUT' || target.type === 'submit' || target.type === 'button') {
      return;
    }
    e.preventDefault();
    const form = target.closest('.form-grid');
    if (!form) return;
    const focusables = Array.from(
      form.querySelectorAll('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])')
    );
    const idx = focusables.indexOf(target);
    if (idx >= 0 && idx < focusables.length - 1) {
      focusables[idx + 1].focus();
    }
  };

  const validate = () => {
    const e = {};
    if (!f.name || f.name.trim().length < 3) e.name = 'Full name is required (min 3 characters)';
    const ageNum = Number(f.age);
    if (f.age === '' || f.age == null || isNaN(ageNum) || ageNum < 0 || ageNum > 125) {
      e.age = 'Enter a valid age (0–125)';
    }
    if (!f.gender) e.gender = 'Select gender (M, F, Other)';
    if (!f.mobile || !f.mobile.trim()) e.mobile = 'Mobile number is required';
    else if (!validMobile(f.mobile)) e.mobile = 'Enter a valid 10-digit mobile number';
    setErrs(e);
    return Object.keys(e).length === 0;
  };

  const save = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const p = await registerPatient(f, user?.id);
      pushToast('success', `Patient registered with UHID ${p.uhid}`);
      onClose();
      navigate(`/patients/${p.id}`);
    } catch (e) {
      pushToast('error', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="md"
      title="Register New Patient"
      sub={<span className="uhid-preview">UHID will be assigned: <UhidChip uhid={serverPreview || uhidPreview || '…'} size="sm" /> — permanent, unique, never changes</span>}
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="accent" onClick={save} disabled={busy}>
            {busy ? 'Registering…' : 'Register patient'}
          </Btn>
        </>
      }
    >
      <div className="form-grid" onKeyDown={handleKeyDown}>
        <Field label="Full Name" required error={errs.name} className="fg-2">
          <Input value={f.name} onChange={set('name')} placeholder="Enter full name" autoFocus />
        </Field>
        <Field label="Age" required error={errs.age}>
          <Input type="number" min="0" max="125" value={f.age} onChange={set('age')} placeholder="Age in years" />
        </Field>
        <Field label="Gender" required error={errs.gender}>
          <Select value={f.gender} onChange={set('gender')}>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="Other">Other</option>
          </Select>
        </Field>
        <Field label="Marital Status">
          <Select value={f.marital_status} onChange={set('marital_status')}>
            {MARITAL_STATUSES.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Mobile Number" required error={errs.mobile}>
          <Input value={f.mobile} onChange={set('mobile')} placeholder="10-digit mobile" inputMode="numeric" />
        </Field>
        <Field label="Blood Group">
          <Select value={f.blood_group} onChange={set('blood_group')}>
            {BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b || 'Unknown'}</option>)}
          </Select>
        </Field>
        <Field label="Address" className="fg-2">
          <Input value={f.address} onChange={set('address')} placeholder="Full address" />
        </Field>
      </div>
    </Modal>
  );
}

export default function Patients() {
  const { t, settings, user, pushToast } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [gender, setGender] = useState('');
  const [reg, setReg] = useState(params.get('new') === '1');
  const [importOpen, setImportOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const patients = useLiveQuery(async () => {
    const all = await db.patients.toArray();
    const consults = await db.consultations.toArray();
    const bills = await db.bills.toArray();
    const visitCounts = {};
    const lastVisit = {};
    for (const c of consults) {
      visitCounts[c.patient_id] = (visitCounts[c.patient_id] || 0) + 1;
      if (!lastVisit[c.patient_id] || c.time > lastVisit[c.patient_id]) lastVisit[c.patient_id] = c.time;
    }
    for (const b of bills) {
      if (b.status === 'completed') {
        visitCounts[b.patient_id] = (visitCounts[b.patient_id] || 0) + 1;
      }
    }
    let list = all.map((p) => {
      const historyCount = visitCounts[p.id] || 0;
      const status = p.patient_status || (historyCount > 0 ? 'Old' : 'New');
      return {
        ...p,
        status,
        last_visit: lastVisit[p.id] || null,
      };
    });

    const s = q.trim().toLowerCase();
    if (s) {
      const digits = s.replace(/\D/g, '');
      list = list.filter((p) =>
        (p.name || '').toLowerCase().includes(s) ||
        (p.uhid || '').toLowerCase().includes(s) ||
        (digits && (p.mobile || '').includes(digits)) ||
        (p.age != null && String(p.age) === s)
      );
    }
    if (gender) list = list.filter((p) => p.gender === gender);
    return list.sort((a, b) => (b.created_at || b.reg_date || '').localeCompare(a.created_at || a.reg_date || ''));
  }, [q, gender]);

  const exportCSV = () => {
    const headers = [
      'UHID',
      'Registered Date & Time',
      'Full Name',
      'Age',
      'Gender',
      'Marital Status',
      'Mobile Number',
      'Blood Group',
      'Address',
      'PIN Code',
      'Allergies',
      'Important Medical Conditions',
      'Current Medications',
      'Notes',
      'Patient Status',
    ];
    const rows = (patients || []).map((p) => [
      p.uhid || '—',
      fmtDateTime(p.created_at || p.reg_date),
      p.name || '—',
      p.age != null ? p.age : ageLabel(p),
      p.gender || '—',
      p.marital_status || 'Single',
      p.mobile || '—',
      p.blood_group || '—',
      p.address || '—',
      p.pin || '—',
      p.allergies || 'None',
      p.conditions || 'None',
      p.current_meds || 'None',
      p.notes || '—',
      p.status || 'New',
    ]);
    download(
      `heeva-patients-all-${dkey()}.csv`,
      toCSV(headers, rows),
      'text/csv'
    );
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
            <input className="input" placeholder="Search by name, UHID, mobile, or age…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={gender} onChange={(e) => setGender(e.target.value)} className="toolbar-select">
            <option value="">All genders</option>
            <option value="M">M</option>
            <option value="F">F</option>
            <option value="Other">Other</option>
          </Select>
        </div>

        <DataTable
          columns={[
            { key: 'uhid', label: 'UHID', sortable: true, render: (p) => <UhidChip uhid={p.uhid} size="sm" /> },
            {
              key: 'name', label: 'Patient', sortable: true,
              render: (p) => (
                <span className="cell-person">
                  <Avatar name={p.name} size={30} tone={p.gender === 'F' || p.gender === 'Female' ? 'teal' : 'navy'} />
                  <span>
                    <span className="cell-main">{p.name} {p.needs_completion && <Badge tone="red">Complete profile</Badge>}</span>
                    <span className="cell-sub">{p.blood_group && <span title="Blood group"><Droplets size={11} /> {p.blood_group}</span>}{p.marital_status ? ` · ${p.marital_status}` : ''}</span>
                  </span>
                </span>
              ),
            },
            {
              key: 'status', label: 'Status', sortable: true,
              render: (p) => <Badge tone={p.status === 'New' ? 'teal' : 'gray'}>{p.status}</Badge>,
            },
            { key: 'age', label: 'Age / Gender', sortable: true, sortValue: (p) => ageLabel(p), render: (p) => `${ageLabel(p)} · ${p.gender || '—'}` },
            { key: 'mobile', label: 'Mobile', sortable: true, render: (p) => <span className="cell-mono">{p.mobile || '—'}</span> },
            { key: 'created_at', label: 'Registered Date & Time', sortable: true, render: (p) => fmtDateTime(p.created_at || p.reg_date) },
            { key: 'last_visit', label: 'Last Visit', sortable: true, sortValue: (p) => p.last_visit || '', render: (p) => (p.last_visit ? fmtDate(p.last_visit) : <Badge tone="gray">First visit</Badge>) },
            {
              key: 'actions', label: '', align: 'right',
              render: (p) => (
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <IconBtn
                    title="Delete Patient"
                    icon={Trash2}
                    className="text-danger"
                    onClick={() => setDeleteTarget(p)}
                  />
                </div>
              ),
            },
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

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        danger
        busy={isDeleting}
        title="Delete Patient Record?"
        message={`Are you sure you want to permanently delete ${deleteTarget?.name} (${deleteTarget?.uhid})? Patients with medical or billing history cannot be deleted.`}
        confirmText="Delete Patient"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setIsDeleting(true);
          try {
            await deletePatient(deleteTarget.id, user?.id);
            pushToast('success', `Patient ${deleteTarget.name} deleted.`);
            setDeleteTarget(null);
          } catch (err) {
            pushToast('error', err.message);
          } finally {
            setIsDeleting(false);
          }
        }}
      />
    </div>
  );
}
