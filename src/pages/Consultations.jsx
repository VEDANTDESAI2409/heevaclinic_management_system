// ─── HEEVA CLINIC — consultations (with vitals capture) ────────────────────
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, IconBtn, Confirm, Card, Modal, Field, Input, Select, Textarea, Badge, DataTable,
  PageHeader, EmptyState, UhidChip, Toggle,
} from '../components/ui';
import { createConsultation, deleteConsultation } from '../services/clinical';
import { fmtDate, fmtDateTime, dkey, todayStr } from '../utils';
import { Stethoscope, Siren, Clock, CheckCircle2, FileText, ReceiptText, Trash2 } from 'lucide-react';

const VITAL_INPUTS = [
  { key: 'temp', label: 'Temp (°F)', step: 0.1 },
  { key: 'sbp', label: 'BP Systolic', step: 1 },
  { key: 'dbp', label: 'BP Diastolic', step: 1 },
  { key: 'pulse', label: 'Pulse (bpm)', step: 1 },
  { key: 'spo2', label: 'SpO₂ (%)', step: 1 },
  { key: 'rr', label: 'Resp. Rate', step: 1 },
  { key: 'weight', label: 'Weight (kg)', step: 0.1 },
  { key: 'height', label: 'Height (cm)', step: 0.1 },
  { key: 'sugar', label: 'Sugar (mg/dL)', step: 1 },
];

function NewConsultModal({ open, onClose, prefillPatient, onDone }) {
  const { user, settings, pushToast } = useApp();
  const patients = useLiveQuery(async () => (await db.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []);
  const doctors = useLiveQuery(() => db.doctors.filter((d) => d.active).toArray(), []);
  const [f, setF] = useState({});
  const [patient, setPatient] = useState(null);
  const [vitals, setVitals] = useState(null);
  const [showVitals, setShowVitals] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setPatient(prefillPatient || null);
      setF({ doctor_id: doctors?.[0]?.id || '', date: todayStr(), time: new Date().toTimeString().slice(0, 5), chief: '', symptoms: '', diagnosis: '', notes: '', advice: '', follow_up: '' });
      setVitals(null);
      setErr('');
    }
  }, [open]); // eslint-disable-line

  const save = async () => {
    setErr('');
    if (!patient) { setErr('Select a patient'); return; }
    if (!f.doctor_id) { setErr('Select a doctor'); return; }
    if (!f.chief.trim()) { setErr('Chief complaint is required'); return; }
    setBusy(true);
    try {
      const when = `${f.date || todayStr()}T${f.time || '09:00'}:00`;
      const c = await createConsultation({
        patient_id: patient.id,
        doctor_id: f.doctor_id,
        when: new Date(when).toISOString(),
        chief: f.chief, symptoms: f.symptoms, diagnosis: f.diagnosis, notes: f.notes,
        advice: f.advice, follow_up: f.follow_up,
        vitals: vitals,
      }, user.id);
      pushToast('success', `Consultation ${c.consultation_no} saved`);
      onDone && onDone(c, patient);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Consultation" width="lg"
      sub={patient ? <span>{patient.name} · <UhidChip uhid={patient.uhid} size="sm" /> {patient.allergies && <Badge tone="amber">⚠ {patient.allergies}</Badge>}</span> : 'Select the patient being seen'}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save consultation'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="form-grid">
        <Field label="Patient" required className="fg-3">
          <Select value={patient?.id || ''} onChange={(e) => setPatient((patients || []).find((p) => p.id === e.target.value) || null)}>
            <option value="">Search patient…</option>
            {(patients || []).map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {p.uhid}{p.mobile ? ` · ${p.mobile}` : ''}</option>
            ))}
          </Select>
        </Field>
        <Field label="Doctor" required>
          <Select value={f.doctor_id || ''} onChange={(e) => setF((x) => ({ ...x, doctor_id: e.target.value }))}>
            <option value="">Select…</option>
            {(doctors || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <div className="fg-row">
          <Field label="Date"><Input type="date" value={f.date || ''} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} /></Field>
          <Field label="Time"><Input type="time" value={f.time || ''} onChange={(e) => setF((x) => ({ ...x, time: e.target.value }))} /></Field>
        </div>
        <Field label="Chief Complaint" required className="fg-2">
          <Input value={f.chief || ''} onChange={(e) => setF((x) => ({ ...x, chief: e.target.value }))} placeholder="e.g. Fever since 2 days" />
        </Field>
        <Field label="Symptoms" className="fg-2">
          <Textarea rows={2} value={f.symptoms || ''} onChange={(e) => setF((x) => ({ ...x, symptoms: e.target.value }))} />
        </Field>
        <Field label="Diagnosis" className="fg-2">
          <Input value={f.diagnosis || ''} onChange={(e) => setF((x) => ({ ...x, diagnosis: e.target.value }))} placeholder="Provisional / final diagnosis" />
        </Field>
        <Field label="Clinical Notes" className="fg-2">
          <Textarea rows={2} value={f.notes || ''} onChange={(e) => setF((x) => ({ ...x, notes: e.target.value }))} />
        </Field>
        <Field label="Advice" className="fg-2">
          <Textarea rows={2} value={f.advice || ''} onChange={(e) => setF((x) => ({ ...x, advice: e.target.value }))} />
        </Field>
        <Field label="Follow-up Date" hint="Optional">
          <Input type="date" value={f.follow_up || ''} onChange={(e) => setF((x) => ({ ...x, follow_up: e.target.value }))} />
        </Field>
      </div>

      <div className="vitals-toggle-row">
        <button type="button" className="vt-btn" onClick={() => setShowVitals((s) => !s)}>
          {showVitals ? '▾' : '▸'} Vital signs {vitals && Object.values(vitals).some((v) => v != null && v !== '') && <Badge tone="teal">recorded</Badge>}
        </button>
      </div>
      {showVitals && (
        <div className="vitals-grid">
          {VITAL_INPUTS.map((v) => (
            <label key={v.key} className="field">
              <span className="field-label">{v.label}</span>
              <Input
                type="number"
                step={v.step}
                value={vitals?.[v.key] ?? ''}
                onChange={(e) => setVitals((x) => ({ ...(x || {}), [v.key]: e.target.value === '' ? null : Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

export default function Consultations() {
  const { t, user, pushToast } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState(false);
  const [pre, setPre] = useState(null);
  const [done, setDone] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [from, setFrom] = useState(dkey(new Date(Date.now() - 29 * 86400000)));
  const [to, setTo] = useState(todayStr());
  const [doctorF, setDoctorF] = useState('');

  const doctors = useLiveQuery(() => db.doctors.toArray(), []);
  const rows = useLiveQuery(async () => {
    const all = await db.consultations.toArray();
    const pmap = new Map((await db.patients.toArray()).map((p) => [p.id, p]));
    let list = all
      .filter((c) => c.date >= from && c.date <= to)
      .map((c) => ({ ...c, patient: pmap.get(c.patient_id) }))
      .filter((c) => c.patient);
    if (doctorF) list = list.filter((c) => c.doctor_id === doctorF);
    return list.sort((a, b) => b.time.localeCompare(a.time));
  }, [from, to, doctorF]);

  // open modal from query params (?new=1&patient=ID)
  useEffect(() => {
    if (params.get('new') === '1') {
      const pid = params.get('patient');
      const p = db.patients.get(pid).then((x) => {
        setPre(x || null);
        setModal(true);
        params.delete('new'); params.delete('patient');
        setParams(params, { replace: true });
      });
      return () => { p && p.cancel?.(); };
    }
    return undefined;
  }, [params]); // eslint-disable-line

  const onDone = (c, patient) => {
    setModal(false);
    setDone({ c, patient });
  };

  return (
    <div className="page">
      <PageHeader
        title="Consultations"
        sub="Every consultation is permanently linked to the patient's UHID"
        actions={<Btn variant="accent" icon={Stethoscope} onClick={() => { setPre(null); setModal(true); }}>+ New Consultation</Btn>}
      />

      <Card>
        <div className="toolbar">
          <Field label="" className="tb-field"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="" className="tb-field"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <Select value={doctorF} onChange={(e) => setDoctorF(e.target.value)} className="toolbar-select">
            <option value="">All doctors</option>
            {(doctors || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
        <DataTable
          columns={[
            { key: 'time', label: 'Date & Time', sortable: true, render: (c) => (
              <span className="cell-person">
                <span className="cell-main">{fmtDateTime(c.time)}</span>
                <span className="cell-sub">{c.consultation_no}</span>
              </span>
            ) },
            { key: 'patient', label: 'Patient', sortable: true, sortValue: (c) => c.patient.name, render: (c) => (
              <span className="cell-person">
                <span className="cell-main">{c.patient.name}</span>
                <span className="cell-sub"><UhidChip uhid={c.patient.uhid} size="sm" /></span>
              </span>
            ) },
            { key: 'doctor_name', label: 'Doctor', render: (c) => c.doctor_name || '—' },
            { key: 'chief', label: 'Chief Complaint', render: (c) => <span className="cell-ellip" title={c.chief}>{c.chief || '—'}</span> },
            { key: 'diagnosis', label: 'Diagnosis', render: (c) => <span className="cell-ellip" title={c.diagnosis}>{c.diagnosis || '—'}</span> },
            { key: 'follow_up', label: 'Follow-up', render: (c) => c.follow_up ? <span className="follow-chip"><Clock size={12} /> {fmtDate(c.follow_up)}</span> : '—' },
            {
              key: 'actions', label: '', align: 'right',
              render: (c) => (
                <div className="row-actions" onClick={(e) => e.stopPropagation()}>
                  <IconBtn
                    title="Delete Consultation"
                    icon={Trash2}
                    className="text-danger"
                    onClick={() => setDeleteTarget(c)}
                  />
                </div>
              ),
            },
          ]}
          rows={rows}
          pageSize={12}
          onRow={(c) => navigate(`/patients/${c.patient_id}`)}
          empty={<EmptyState title="No consultations in this range" action={<Btn size="sm" variant="accent" onClick={() => setModal(true)}>New consultation</Btn>} />}
          loading={!rows}
        />
      </Card>

      <NewConsultModal open={modal} onClose={() => setModal(false)} prefillPatient={pre} onDone={onDone} />

      {done && (
        <Modal open onClose={() => setDone(null)} title="Consultation saved" width="sm"
          footer={<Btn variant="ghost" onClick={() => setDone(null)}>Close</Btn>}>
          <div className="done-panel">
            <CheckCircle2 size={34} className="done-ic" />
            <p><b>{done.c.consultation_no}</b> · {done.patient.name}</p>
            <div className="done-actions">
              <Btn size="sm" variant="accent" icon={FileText} onClick={() => { const d = done; setDone(null); navigate(`/prescriptions?new=1&patient=${d.patient.id}`); }}>Create Prescription</Btn>
              <Btn size="sm" variant="primary" icon={ReceiptText} onClick={() => { const d = done; setDone(null); navigate(`/billing?new=1&patient=${d.patient.id}`); }}>Create Bill</Btn>
              <Btn size="sm" variant="outline" onClick={() => { const d = done; setDone(null); navigate(`/patients/${d.patient.id}`); }}>View Patient</Btn>
            </div>
          </div>
        </Modal>
      )}

      <Confirm
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        danger
        busy={isDeleting}
        title="Delete Consultation?"
        message={`Are you sure you want to delete consultation ${deleteTarget?.consultation_no} for ${deleteTarget?.patient?.name || 'patient'}? Consultations linked to prescriptions cannot be deleted until those prescriptions are removed.`}
        confirmText="Delete Consultation"
        onConfirm={async () => {
          if (!deleteTarget) return;
          setIsDeleting(true);
          try {
            await deleteConsultation(deleteTarget.id, user?.id);
            pushToast('success', `Consultation ${deleteTarget.consultation_no} deleted.`);
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
