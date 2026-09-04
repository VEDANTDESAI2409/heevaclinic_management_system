// ─── HEEVA CLINIC — patient profile: full history linked by UHID ───────────
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Textarea, Badge, Tabs, EmptyState,
  DataTable, UhidChip, Avatar, PaymentBadge, BillStatusBadge,
} from '../components/ui';
import { LineChart } from '../components/charts';
import { updatePatient, addVitals } from '../services/patients';
import { getBill } from '../services/billing';
import { printInvoiceA4, printPatientCard } from '../print/printers';
import { ageLabel, fmtDate, fmtDateTime, fmtTime, fmtMoney, fmtQty } from '../utils';
import {
  Phone, MapPin, Mail, Droplets, Stethoscope, FileText, ReceiptText,
  CreditCard, Activity, NotebookPen, Pencil, Printer, Plus,
} from 'lucide-react';

const VITAL_DEFS = [
  { key: 'temp', label: 'Temperature (°F)', step: 0.1 },
  { key: 'sbp', label: 'BP Systolic (mmHg)' },
  { key: 'dbp', label: 'BP Diastolic (mmHg)' },
  { key: 'pulse', label: 'Heart Rate (bpm)' },
  { key: 'spo2', label: 'SpO₂ (%)' },
  { key: 'rr', label: 'Respiratory Rate' },
  { key: 'weight', label: 'Weight (kg)', step: 0.1 },
  { key: 'height', label: 'Height (cm)', step: 0.1 },
  { key: 'sugar', label: 'Blood Sugar (mg/dL)' },
];

function trend(v, prev) {
  if (v == null || prev == null || v === prev) return null;
  return v > prev ? '↑' : '↓';
}

function VitalsTable({ rows }) {
  if (!rows.length) return <EmptyState compact icon="❤️" title="No vital signs recorded yet" />;
  const chrono = [...rows].reverse();
  return (
    <DataTable
      dense
      columns={[
        { key: 'recorded_at', label: 'Date & Time', sortable: true, sortValue: (v) => v.recorded_at, render: (v) => fmtDateTime(v.recorded_at) },
        ...VITAL_DEFS.map((d, i) => ({
          key: d.key,
          label: d.label,
          align: 'right',
          render: (v) => {
            const val = v[d.key];
            if (val == null || val === '') return <span className="cell-muted">—</span>;
            const prev = chrono[chrono.indexOf(v) - 1]?.[d.key];
            const tr = trend(val, prev);
            return (
              <span>
                {val}
                {tr && <span className={tr === '↑' ? 'trend-up' : 'trend-down'}> {tr}</span>}
              </span>
            );
          },
        })),
        { key: 'recorded_by', label: 'By', render: (v) => v.recorded_by || '—' },
      ]}
      rows={rows}
      pageSize={10}
    />
  );
}

function AddVitalsModal({ open, onClose, patient, user }) {
  const { pushToast } = useApp();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const save = async () => {
    setErr('');
    if (!Object.values(f).some((v) => v != null && v !== '')) { setErr('Enter at least one vital sign'); return; }
    setBusy(true);
    try {
      await addVitals(patient.id, f, user.id);
      pushToast('success', 'Vital signs saved');
      onClose();
      setF({});
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Record Vital Signs" sub={`${patient.name} · ${patient.uhid}`} width="lg"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save vitals'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="form-grid">
        {VITAL_DEFS.map((d) => (
          <Field key={d.key} label={d.label}>
            <Input type="number" step={d.step || 1} value={f[d.key] ?? ''} onChange={(e) => setF((x) => ({ ...x, [d.key]: e.target.value === '' ? '' : Number(e.target.value) }))} />
          </Field>
        ))}
        <p className="vitals-note">Date &amp; time are recorded automatically. ↑↓ arrows in the table show the trend vs. the previous reading.</p>
      </div>
    </Modal>
  );
}

function EditPatientModal({ open, onClose, patient, user }) {
  const { pushToast } = useApp();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  React.useEffect(() => {
    if (open && patient) setF({
      name: patient.name, dob: patient.dob, gender: patient.gender, mobile: patient.mobile,
      alt_mobile: patient.alt_mobile, email: patient.email, address: patient.address, city: patient.city,
      state: patient.state, pin: patient.pin, ec_name: patient.ec_name, ec_number: patient.ec_number,
      ec_relation: patient.ec_relation, blood_group: patient.blood_group, allergies: patient.allergies,
      conditions: patient.conditions, current_meds: patient.current_meds, notes: patient.notes,
    });
  }, [open, patient]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    setErr('');
    if (!f.name || f.name.trim().length < 3) { setErr('Name is required'); return; }
    if (!f.dob) { setErr('Date of birth is required'); return; }
    if (f.dob > new Date().toISOString().slice(0, 10)) { setErr('Date of birth cannot be in the future'); return; }
    setBusy(true);
    try {
      await updatePatient(patient.id, f, user.id);
      pushToast('success', 'Patient updated');
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Edit Patient" sub={<span>UHID <UhidChip uhid={patient?.uhid} size="sm" /> is permanent and cannot be changed</span>} width="lg"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="form-grid">
        <Field label="Full Name" required className="fg-2"><Input value={f.name || ''} onChange={set('name')} /></Field>
        <Field label="Date of Birth" required hint={f.dob ? `Age: ${ageLabel({ dob: f.dob })}` : 'Required for automatic age calculation'}><Input type="date" max={new Date().toISOString().slice(0, 10)} value={f.dob || ''} onChange={set('dob')} /></Field>
        <Field label="Gender"><Select value={f.gender || ''} onChange={set('gender')}><option value="">—</option><option>Male</option><option>Female</option><option>Other</option></Select></Field>
        <Field label="Mobile"><Input value={f.mobile || ''} onChange={set('mobile')} /></Field>
        <Field label="Alternative Mobile"><Input value={f.alt_mobile || ''} onChange={set('alt_mobile')} /></Field>
        <Field label="Address" className="fg-2"><Input value={f.address || ''} onChange={set('address')} /></Field>
        <Field label="City"><Input value={f.city || ''} onChange={set('city')} /></Field>
        <Field label="State"><Input value={f.state || ''} onChange={set('state')} /></Field>
        <Field label="Blood Group">
          <Select value={f.blood_group || ''} onChange={set('blood_group')}>
            {['', 'A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map((b) => <option key={b} value={b}>{b || 'Unknown'}</option>)}
          </Select>
        </Field>
        <Field label="Allergies" className="fg-2"><Textarea rows={2} value={f.allergies || ''} onChange={set('allergies')} /></Field>
        <Field label="Conditions" className="fg-2"><Textarea rows={2} value={f.conditions || ''} onChange={set('conditions')} /></Field>
        <Field label="Current Medications" className="fg-2"><Textarea rows={2} value={f.current_meds || ''} onChange={set('current_meds')} /></Field>
        <Field label="Notes" className="fg-2"><Textarea rows={2} value={f.notes || ''} onChange={set('notes')} /></Field>
      </div>
    </Modal>
  );
}

export default function PatientProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, settings, t, can } = useApp();
  const [tab, setTab] = useState('overview');
  const [vitalsOpen, setVitalsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [billView, setBillView] = useState(null);

  const patient = useLiveQuery(() => db.patients.get(id), [id]);
  const vitals = useLiveQuery(() => db.patient_vitals.where('patient_id').equals(id).reverse().sortBy('recorded_at'), [id]);
  const consults = useLiveQuery(() => db.consultations.where('patient_id').equals(id).reverse().sortBy('time'), [id]);
  const presc = useLiveQuery(() => db.prescriptions.where('patient_id').equals(id).reverse().sortBy('time'), [id]);
  const bills = useLiveQuery(() => db.bills.where('patient_id').equals(id).reverse().sortBy('time'), [id]);
  const payments = useLiveQuery(() => db.payments.where('patient_id').equals(id).reverse().sortBy('at'), [id]);

  if (!patient) return <div className="page"><EmptyState icon="🔍" title="Loading patient…" /></div>;
  if (!patient.id) return <div className="page"><EmptyState title="Patient not found" action={<Btn onClick={() => navigate('/patients')}>Back to patients</Btn>} /></div>;

  const money = (v) => fmtMoney(v, settings.currency);
  const totalSpent = (bills || []).filter((b) => b.status === 'completed').reduce((s, b) => s + (b.paid || 0), 0);
  const p = patient;

  const viewBill = async (b) => {
    const full = await getBill(b.id);
    if (full) setBillView(full);
  };

  return (
    <div className="page">
      {/* header */}
      <div className="pt-head">
        <Avatar name={p.name} size={64} tone={p.gender === 'Female' ? 'teal' : 'navy'} />
        <div className="pt-id">
          <div className="pt-name-row">
            <h1>{p.name}</h1>
            {p.needs_completion && <Badge tone="red">Profile incomplete — complete details</Badge>}
            {p.blood_group && <Badge tone="red">Blood group: {p.blood_group}</Badge>}
            {p.allergies && <Badge tone="amber">⚠ {p.allergies.split(',')[0]}</Badge>}
          </div>
          <div className="pt-meta">
            <UhidChip uhid={p.uhid} />
            <span>{ageLabel(p)} · {p.gender || '—'}</span>
            {p.mobile && <span className="pt-meta-item"><Phone size={13} /> {p.mobile}</span>}
            <span className="pt-meta-item"><MapPin size={13} /> {p.city || '—'}{p.pin ? ` ${p.pin}` : ''}</span>
            <span className="pt-meta-item">Registered {fmtDate(p.reg_date)}</span>
          </div>
        </div>
        <div className="pt-actions">
          {can('consultations') && <Btn variant="primary" icon={Stethoscope} size="sm" onClick={() => navigate(`/consultations?new=1&patient=${p.id}`)}>New Consultation</Btn>}
          {can('billing') && <Btn variant="accent" icon={ReceiptText} size="sm" onClick={() => navigate(`/billing?new=1&patient=${p.id}`)}>New Bill</Btn>}
          {can('prescriptions') && <Btn variant="outline" icon={FileText} size="sm" onClick={() => navigate(`/prescriptions?new=1&patient=${p.id}`)}>Prescription</Btn>}
          <Btn variant="outline" icon={Activity} size="sm" onClick={() => setVitalsOpen(true)}>Add Vitals</Btn>
          {can('patients') && <Btn variant="ghost" icon={Pencil} size="sm" onClick={() => setEditOpen(true)}>Edit</Btn>}
          <Btn variant="ghost" icon={Printer} size="sm" onClick={() => printPatientCard(p, settings)}>ID Card</Btn>
        </div>
      </div>

      {(p.allergies || p.conditions) && (
        <div className="pt-medstrip">
          {p.allergies && <span className="medstrip-item warn">⚠ Allergies: {p.allergies}</span>}
          {p.conditions && <span className="medstrip-item info">📋 Conditions: {p.conditions}</span>}
          {p.current_meds && <span className="medstrip-item">💊 Current meds: {p.current_meds}</span>}
        </div>
      )}

      <Tabs
        className="pt-tabs"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'overview', label: 'Overview' },
          { key: 'visits', label: 'Visits', badge: consults?.length },
          { key: 'consults', label: 'Consultations', badge: consults?.length },
          { key: 'prescriptions', label: 'Prescriptions', badge: presc?.length },
          { key: 'bills', label: 'Bills', badge: bills?.length },
          { key: 'payments', label: 'Payments', badge: payments?.length },
          { key: 'vitals', label: 'Vital Signs', badge: vitals?.length },
          { key: 'notes', label: 'Medical Notes' },
        ]}
      />

      {tab === 'overview' && (
        <div className="ov-grid">
          <Card title="Contact" className="ov-card">
            <div className="kv"><span>Mobile</span><b>{p.mobile || '—'}</b></div>
            <div className="kv"><span>Alt. mobile</span><b>{p.alt_mobile || '—'}</b></div>
            <div className="kv"><span>Email</span><b>{p.email || '—'}</b></div>
            <div className="kv"><span>Address</span><b>{p.address || '—'}{p.city ? `, ${p.city}` : ''} {p.pin}</b></div>
          </Card>
          <Card title="Medical Summary" className="ov-card">
            <div className="kv"><span>Blood group</span><b>{p.blood_group || 'Unknown'}</b></div>
            <div className="kv"><span>Allergies</span><b>{p.allergies || 'None recorded'}</b></div>
            <div className="kv"><span>Conditions</span><b>{p.conditions || 'None recorded'}</b></div>
            <div className="kv"><span>Current meds</span><b>{p.current_meds || '—'}</b></div>
            <div className="kv"><span>Total visits</span><b>{consults?.length || 0}</b></div>
            <div className="kv"><span>Total paid to date</span><b>{money(totalSpent)}</b></div>
          </Card>
          <Card title="Latest Vitals" className="ov-card">
            {!vitals?.length ? <EmptyState compact icon="❤️" title="No vitals yet" action={<Btn size="sm" variant="outline" onClick={() => setVitalsOpen(true)}>Record now</Btn>} /> : (
              <div className="vitals-chips">
                {vitals.slice(0, 1).map((v) => (
                  <React.Fragment key={v.id}>
                    {v.temp != null && <div className="vchip"><span>Temp</span><b>{v.temp}°F</b></div>}
                    {(v.sbp != null) && <div className="vchip"><span>BP</span><b>{v.sbp}/{v.dbp}</b></div>}
                    {v.pulse != null && <div className="vchip"><span>Pulse</span><b>{v.pulse} bpm</b></div>}
                    {v.spo2 != null && <div className="vchip"><span>SpO₂</span><b>{v.spo2}%</b></div>}
                    {v.weight != null && <div className="vchip"><span>Weight</span><b>{v.weight} kg</b></div>}
                    {v.sugar != null && <div className="vchip"><span>Sugar</span><b>{v.sugar}</b></div>}
                    <div className="vchip when">{fmtDateTime(v.recorded_at)}</div>
                  </React.Fragment>
                ))}
              </div>
            )}
          </Card>
          {vitals && vitals.length >= 2 && (
            <Card title="Weight Trend" sub="All recorded weights">
              <LineChart height={160} data={[...vitals].reverse().filter((v) => v.weight != null).slice(-12).map((v, i, a) => ({ label: fmtDate(v.recorded_at).slice(0, 6), value: v.weight }))} color="var(--navy-700)" unit="" />
            </Card>
          )}
        </div>
      )}

      {tab === 'visits' && (
        <Card>
          <DataTable
            columns={[
              { key: 'date', label: 'Date', sortable: true, sortValue: (c) => c.time, render: (c) => fmtDateTime(c.time) },
              { key: 'doctor_name', label: 'Doctor', render: (c) => c.doctor_name || '—' },
              { key: 'diagnosis', label: 'Diagnosis', render: (c) => c.diagnosis || '—' },
              { key: 'status', label: 'Status', render: (c) => <Badge tone="blue">{c.status || 'Completed'}</Badge> },
              { key: 'follow_up', label: 'Follow-up', render: (c) => c.follow_up || '—' },
            ]}
            rows={consults}
            pageSize={10}
            onRow={(c) => setTab('consults')}
            empty={<EmptyState title="No visits yet" action={can('consultations') ? <Btn size="sm" onClick={() => navigate(`/consultations?new=1&patient=${p.id}`)}>Start consultation</Btn> : null} />}
          />
        </Card>
      )}

      {tab === 'consults' && (
        <Card>
          {!consults ? <EmptyState compact title="Loading…" /> : consults.length === 0 ? (
            <EmptyState title="No consultations recorded" />
          ) : (
            <div className="consult-list">
              {consults.map((c) => (
                <div className="consult-card" key={c.id}>
                  <div className="cc-head">
                    <span className="cc-no">{c.consultation_no}</span>
                    <span className="cc-date">{fmtDateTime(c.time)}</span>
                    <span className="cc-doctor">{c.doctor_name}</span>
                  </div>
                  <div className="cc-grid">
                    <div><span>Chief Complaint</span>{c.chief || '—'}</div>
                    <div><span>Diagnosis</span>{c.diagnosis || '—'}</div>
                    {c.symptoms && <div><span>Symptoms</span>{c.symptoms}</div>}
                    {c.notes && <div><span>Clinical Notes</span>{c.notes}</div>}
                    {c.advice && <div><span>Advice</span>{c.advice}</div>}
                    {c.follow_up && <div><span>Follow-up</span>{fmtDate(c.follow_up)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'prescriptions' && (
        <Card>
          <DataTable
            columns={[
              { key: 'prescription_no', label: 'Prescription', render: (x) => <span className="cell-mono">{x.prescription_no}</span> },
              { key: 'time', label: 'Date', sortable: true, sortValue: (x) => x.time, render: (x) => fmtDate(x.time) },
              { key: 'doctor_name', label: 'Doctor', render: (x) => x.doctor_name || '—' },
              { key: 'diagnosis', label: 'Diagnosis', render: (x) => x.diagnosis || '—' },
            ]}
            rows={presc}
            pageSize={10}
            onRow={async (x) => {
              const items = await db.prescription_items.where('prescription_id').equals(x.id).toArray();
              const doc = (await db.doctors.get(x.doctor_id)) || null;
              import('../print/printers').then(({ printPrescription }) => printPrescription({ ...x, items, settings }, p));
            }}
            empty={<EmptyState icon="📋" title="No prescriptions yet" action={can('prescriptions') ? <Btn size="sm" variant="outline" onClick={() => navigate(`/prescriptions?new=1&patient=${p.id}`)}>Create prescription</Btn> : null} />}
          />
        </Card>
      )}

      {tab === 'bills' && (
        <Card>
          <DataTable
            columns={[
              { key: 'bill_no', label: 'Bill #', render: (b) => <span className="cell-mono">{b.bill_no}</span> },
              { key: 'time', label: 'Date', sortable: true, sortValue: (b) => b.time, render: (b) => fmtDateTime(b.time) },
              { key: 'bill_type', label: 'Type', render: (b) => <Badge tone="navy">{b.bill_type}</Badge> },
              { key: 'total', label: 'Total', align: 'right', sortable: true, render: (b) => money(b.total) },
              { key: 'payment_status', label: 'Payment', render: (b) => <PaymentBadge status={b.status === 'CANCELLED' ? 'CANCELLED' : b.payment_status} /> },
            ]}
            rows={bills}
            pageSize={10}
            onRow={viewBill}
            empty={<EmptyState title="No bills yet" action={can('billing') ? <Btn size="sm" variant="accent" onClick={() => navigate(`/billing?new=1&patient=${p.id}`)}>Create bill</Btn> : null} />}
          />
        </Card>
      )}

      {tab === 'payments' && (
        <Card>
          <DataTable
            columns={[
              { key: 'at', label: 'Date', sortable: true, render: (x) => fmtDateTime(x.at) },
              { key: 'kind', label: 'Type', render: (x) => x.kind === 'refund' ? <Badge tone="red">Refund</Badge> : <Badge tone="green">Payment</Badge> },
              { key: 'method', label: 'Method', render: (x) => x.method },
              { key: 'amount', label: 'Amount', align: 'right', sortable: true, render: (x) => (x.kind === 'refund' ? '− ' : '') + money(x.amount) },
              { key: 'note', label: 'Note', render: (x) => x.note || '—' },
            ]}
            rows={payments}
            pageSize={10}
            empty={<EmptyState icon="💳" title="No payments recorded" />}
          />
        </Card>
      )}

      {tab === 'vitals' && (
        <Card
          title="Vital Signs History"
          sub="Most recent first — arrows show trend vs previous reading"
          actions={<Btn size="sm" variant="accent" icon={Plus} onClick={() => setVitalsOpen(true)}>Record vitals</Btn>}
        >
          <VitalsTable rows={vitals || []} />
        </Card>
      )}

      {tab === 'notes' && (
        <Card title="Medical Notes">
          <div className="notes-box">
            {p.notes ? <p>{p.notes}</p> : <EmptyState compact icon="🗒️" title="No general notes" action={can('patients') ? <Btn size="sm" variant="outline" onClick={() => setEditOpen(true)}>Add notes</Btn> : null} />}
          </div>
          {(consults || []).filter((c) => c.notes).length > 0 && (
            <>
              <h4 className="sub-head">Notes from consultations</h4>
              {(consults || []).filter((c) => c.notes).map((c) => (
                <div className="note-item" key={c.id}>
                  <span className="note-when">{fmtDateTime(c.time)} · {c.consultation_no}</span>
                  <p>{c.notes}</p>
                </div>
              ))}
            </>
          )}
        </Card>
      )}

      <AddVitalsModal open={vitalsOpen} onClose={() => setVitalsOpen(false)} patient={p} user={user} />
      <EditPatientModal open={editOpen} onClose={() => setEditOpen(false)} patient={p} user={user} />

      {/* bill viewer */}
      {billView && (
        <BillViewer full={billView} onClose={() => setBillView(null)} patient={p} />
      )}
    </div>
  );
}

function BillViewer({ full, onClose, patient }) {
  const { settings } = useApp();
  const { bill, items, payments } = full;
  const money = (v) => fmtMoney(v, settings.currency);
  return (
    <Modal open onClose={onClose} title={<span className="cell-mono">{bill.bill_no}</span>} sub={`${patient.name} · ${patient.uhid}`} width="lg"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Close</Btn>
        <Btn variant="primary" icon={Printer} onClick={() => printInvoiceA4(bill, items, payments, settings)}>A4 Payment Receipt</Btn>
      </>}>
      <div className="bv-body">
        <div className="bv-meta">
          <span><PaymentBadge status={bill.status === 'CANCELLED' ? 'CANCELLED' : bill.payment_status} /></span>
          <Badge tone="navy">{bill.bill_type}</Badge>
          <span>{fmtDateTime(bill.time)}</span>
          {bill.cancel_reason && <Badge tone="red">Cancelled: {bill.cancel_reason}</Badge>}
        </div>
        <table className="table bv-table">
          <thead><tr><th>Item</th><th>Category</th><th className="th-right">Qty</th><th className="th-right">Price</th><th className="th-right">Amount</th></tr></thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.name}{it.batch_no && <span className="cell-sub"> · batch {it.batch_no}</span>}</td>
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
          <div className="kv"><span>Balance</span><b>{money(bill.total - (bill.paid || 0))}</b></div>
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
  );
}
