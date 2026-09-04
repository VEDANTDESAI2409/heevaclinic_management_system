// ─── HEEVA CLINIC — prescriptions (build + print) ──────────────────────────
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Textarea, Badge, DataTable,
  PageHeader, EmptyState, UhidChip, SearchSelect,
} from '../components/ui';
import { createPrescription } from '../services/clinical';
import { printPrescription } from '../print/printers';
import { fmtDate, fmtDateTime } from '../utils';
import { FileText, Printer, Plus, Trash2, CheckCircle2 } from 'lucide-react';

const FREQS = ['Once daily', 'Twice daily', 'Thrice daily', 'Four times daily', 'Every 6 hours', 'Every 8 hours', 'At night', 'In the morning', 'Before food', 'After food', 'At bedtime', 'As needed'];

function NewPrescriptionModal({ open, onClose, prefillPatient, onDone }) {
  const { user, settings, pushToast } = useApp();
  const patients = useLiveQuery(async () => (await db.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) || [];
  const meds = useLiveQuery(async () => (await db.medicines.where('active').equals(1).toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) || [];
  const doctors = useLiveQuery(() => db.doctors.filter((d) => d.active).toArray(), []) || [];
  const [patient, setPatient] = useState(null);
  const [consult, setConsult] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [advice, setAdvice] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]);
  const [pickMed, setPickMed] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const consults = useLiveQuery(async () => {
    if (!patient) return [];
    const list = await db.consultations.where('patient_id').equals(patient.id).reverse().sortBy('time');
    return list.slice(0, 10);
  }, [patient]);

  useEffect(() => {
    if (open) {
      setPatient(prefillPatient || null);
      setConsult(''); setDiagnosis(''); setAdvice(''); setNotes(''); setItems([]); setPickMed(null); setErr('');
      if (prefillPatient) {
        db.consultations.where('patient_id').equals(prefillPatient.id).reverse().sortBy('time').then((list) => {
          if (list[0]) {
            setConsult(list[0].id);
            setDiagnosis(list[0].diagnosis || '');
            setAdvice(list[0].advice || '');
          }
        });
      }
    }
  }, [open]); // eslint-disable-line

  const addMed = () => {
    if (!pickMed) return;
    if (items.some((i) => i.medicine_id === pickMed.id)) { pushToast('warning', 'Medicine already in the list'); return; }
    setItems((x) => [...x, { medicine_id: pickMed.id, name: pickMed.name, dosage: '', frequency: 'Once daily', duration: '', instruction: '' }]);
    setPickMed(null);
  };

  const setItem = (idx, k, v) => setItems((x) => x.map((it, i) => (i === idx ? { ...it, [k]: v } : it)));

  const save = async () => {
    setErr('');
    if (!patient) { setErr('Select a patient'); return; }
    if (!items.length) { setErr('Add at least one medicine'); return; }
    setBusy(true);
    try {
      const pr = await createPrescription({
        patient_id: patient.id,
        consultation_id: consult || null,
        doctor_id: doctors?.[0]?.id || null,
        doctor_name: doctors?.[0]?.name || settings.doctor_name,
        diagnosis, advice, notes,
        items,
      }, user.id);
      pushToast('success', `Prescription ${pr.prescription_no} saved`);
      onDone && onDone(pr, patient);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Prescription" width="lg"
      sub={patient ? <span>{patient.name} · <UhidChip uhid={patient.uhid} size="sm" /> · {patient.gender} {patient.dob && `· DOB ${fmtDate(patient.dob)}`}</span> : 'Select the patient'}
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save prescription'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="form-grid">
        <Field label="Patient" required className="fg-2">
          <Select value={patient?.id || ''} onChange={(e) => setPatient(patients.find((p) => p.id === e.target.value) || null)}>
            <option value="">Search patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.uhid}</option>)}
          </Select>
        </Field>
        <Field label="Linked Consultation" hint="Optional — prefills diagnosis">
          <Select value={consult} onChange={(e) => setConsult(e.target.value)}>
            <option value="">None</option>
            {(consults || []).map((c) => <option key={c.id} value={c.id}>{c.consultation_no} · {fmtDate(c.time)} · {c.diagnosis || c.chief}</option>)}
          </Select>
        </Field>
        <Field label="Diagnosis" className="fg-2">
          <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
        </Field>
        <Field label="Advice / Counselling" className="fg-2">
          <Input value={advice} onChange={(e) => setAdvice(e.target.value)} placeholder="e.g. Complete full course, avoid driving" />
        </Field>
      </div>

      <div className="prx-builder">
        <div className="prx-add">
          <SearchSelect
            value={pickMed}
            onChange={setPickMed}
            options={meds || []}
            getLabel={(m) => `${m.name}${m.strength ? ' (' + m.strength + ')' : ''}`}
            getSearch={(m) => `${m.name} ${m.generic} ${m.barcode}`}
            placeholder="Search medicine by name, generic or barcode…"
          />
          <Btn variant="primary" icon={Plus} onClick={addMed} disabled={!pickMed}>Add</Btn>
        </div>
        {!items.length && <EmptyState compact icon="💊" title="No medicines added yet" message="Search and add medicines above." />}
        {items.map((it, i) => (
          <div className="prx-line" key={it.medicine_id}>
            <div className="prx-line-name"><b>{i + 1}.</b> {it.name}
              <button type="button" className="prx-rm" title="Remove" onClick={() => setItems((x) => x.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
            </div>
            <div className="prx-line-grid">
              <Field label="Dosage"><Input value={it.dosage} onChange={(e) => setItem(i, 'dosage', e.target.value)} placeholder="1 tablet" /></Field>
              <Field label="Frequency">
                <Select value={it.frequency} onChange={(e) => setItem(i, 'frequency', e.target.value)}>
                  {FREQS.map((fr) => <option key={fr}>{fr}</option>)}
                </Select>
              </Field>
              <Field label="Duration"><Input value={it.duration} onChange={(e) => setItem(i, 'duration', e.target.value)} placeholder="5 days" /></Field>
              <Field label="Instructions"><Input value={it.instruction} onChange={(e) => setItem(i, 'instruction', e.target.value)} placeholder="After food" /></Field>
            </div>
          </div>
        ))}
        <Field label="Additional notes" className="prx-notes-field">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

export default function Prescriptions() {
  const { settings } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [modal, setModal] = useState(false);
  const [pre, setPre] = useState(null);
  const [done, setDone] = useState(null);
  const [q, setQ] = useState('');

  const rows = useLiveQuery(async () => {
    const list = await db.prescriptions.toArray();
    const pmap = new Map((await db.patients.toArray()).map((p) => [p.id, p]));
    return list
      .map((x) => ({ ...x, patient: pmap.get(x.patient_id) }))
      .filter((x) => x.patient)
      .filter((x) => !q || (x.patient.name + ' ' + x.patient.uhid + ' ' + x.prescription_no).toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.time.localeCompare(a.time));
  }, [q]);

  const withItems = async (x) => {
    const items = await db.prescription_items.where('prescription_id').equals(x.id).toArray();
    items.sort((a, b) => a.seq - b.seq);
    return { ...x, items };
  };

  useEffect(() => {
    if (params.get('new') === '1') {
      const pid = params.get('patient');
      db.patients.get(pid).then((p) => {
        setPre(p || null);
        setModal(true);
        params.delete('new'); params.delete('patient');
        setParams(params, { replace: true });
      });
    }
  }, [params]); // eslint-disable-line

  return (
    <div className="page">
      <PageHeader
        title="Prescriptions"
        sub="Printable prescriptions with clinic letterhead and doctor signature"
        actions={<Btn variant="accent" icon={FileText} onClick={() => { setPre(null); setModal(true); }}>+ New Prescription</Btn>}
      />
      <Card>
        <div className="toolbar">
          <div className="toolbar-search grow"><input className="input" placeholder="Search patient, UHID or prescription no…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        </div>
        <DataTable
          columns={[
            { key: 'prescription_no', label: 'Prescription #', render: (x) => <span className="cell-mono">{x.prescription_no}</span> },
            { key: 'time', label: 'Date', sortable: true, sortValue: (x) => x.time, render: (x) => fmtDate(x.time) },
            { key: 'patient', label: 'Patient', sortable: true, sortValue: (x) => x.patient.name, render: (x) => (
              <span className="cell-person"><span className="cell-main">{x.patient.name}</span><span className="cell-sub"><UhidChip uhid={x.patient.uhid} size="sm" /></span></span>
            ) },
            { key: 'doctor_name', label: 'Doctor', render: (x) => x.doctor_name || '—' },
            { key: 'diagnosis', label: 'Diagnosis', render: (x) => <span className="cell-ellip">{x.diagnosis || '—'}</span> },
            { key: 'print', label: '', render: async (x) => null, align: 'right' },
          ]}
          rows={rows}
          pageSize={12}
          onRow={async (x) => {
            const full = await withItems(x);
            printPrescription({ ...full, settings }, full.patient);
          }}
          empty={<EmptyState icon="📋" title="No prescriptions found" action={<Btn size="sm" variant="accent" onClick={() => setModal(true)}>Create prescription</Btn>} />}
          loading={!rows}
        />
      </Card>

      <NewPrescriptionModal open={modal} onClose={() => setModal(false)} prefillPatient={pre} onDone={(pr, patient) => { setModal(false); setDone({ pr, patient }); }} />

      {done && (
        <Modal open onClose={() => setDone(null)} title="Prescription saved" width="sm"
          footer={<Btn variant="ghost" onClick={() => setDone(null)}>Close</Btn>}>
          <div className="done-panel">
            <CheckCircle2 size={34} className="done-ic" />
            <p><b>{done.pr.prescription_no}</b> · {done.patient.name}</p>
            <div className="done-actions">
              <Btn size="sm" variant="primary" icon={Printer} onClick={async () => {
                const full = await withItems(done.pr);
                printPrescription({ ...full, settings }, done.patient);
                setDone(null);
              }}>Print Prescription</Btn>
              <Btn size="sm" variant="outline" onClick={() => { const d = done; setDone(null); navigate(`/patients/${d.patient.id}`); }}>View Patient</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
