// ─── HEEVA CLINIC — appointments & daily queue ─────────────────────────────
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Modal, Field, Input, Select, Textarea, Badge, DataTable,
  PageHeader, EmptyState, UhidChip, ApptBadge, IconBtn, Confirm,
} from '../components/ui';
import { createAppointment, updateAppointment, setAppointmentStatus, APPT_STATUSES } from '../services/clinical';
import { dkey, addDays, fmtDate, fmtTime } from '../utils';
import { CalendarDays, ChevronLeft, ChevronRight, UserPlus, Pencil, Search } from 'lucide-react';

const NEXT = {
  scheduled: ['confirmed', 'checked_in', 'cancelled', 'no_show'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['waiting', 'in_consultation', 'cancelled'],
  waiting: ['in_consultation', 'cancelled'],
  in_consultation: ['completed'],
  completed: [],
  cancelled: [],
};
const NEXT_LABEL = { confirmed: 'Confirm', checked_in: 'Check In', waiting: 'To Waiting', in_consultation: 'Start Consultation', completed: 'Complete', cancelled: 'Cancel', no_show: 'No Show' };

function NewApptModal({ open, onClose, editing }) {
  const { user, pushToast } = useApp();
  const patients = useLiveQuery(async () => (await db.patients.toArray()).sort((a, b) => a.name.localeCompare(b.name)), []) || [];
  const doctors = useLiveQuery(() => db.doctors.filter((d) => d.active).toArray(), []) || [];
  const [f, setF] = useState({});
  const [patient, setPatient] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (open) {
      setF(editing ? { doctor_id: editing.doctor_id || '', date: editing.date, time: editing.time, reason: editing.reason || '' } : { doctor_id: doctors?.[0]?.id || '', date: dkey(new Date()), time: '10:00', reason: '' });
      setPatient(editing?.patient || null); setErr('');
    }
  }, [open, editing, doctors]);

  const save = async () => {
    setErr('');
    if (!patient) { setErr('Select a patient'); return; }
    if (!f.date || !f.time) { setErr('Date and time are required'); return; }
    setBusy(true);
    try {
      const a = editing
        ? await updateAppointment(editing.id, { patient_id: patient.id, doctor_id: f.doctor_id, date: f.date, time: f.time, reason: f.reason }, user.id)
        : await createAppointment({ patient_id: patient.id, doctor_id: f.doctor_id, date: f.date, time: f.time, reason: f.reason }, user.id);
      pushToast('success', editing ? `Appointment ${a.appointment_no} updated` : `Appointment ${a.appointment_no} scheduled`);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit Appointment' : 'Schedule Appointment'} width="md"
      footer={<>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Schedule'}</Btn>
      </>}>
      {err && <div className="form-alert">{err}</div>}
      <div className="form-grid">
        <Field label="Patient" required className="fg-2">
          <Select value={patient?.id || ''} onChange={(e) => setPatient((patients || []).find((p) => p.id === e.target.value) || null)}>
            <option value="">Search patient…</option>
            {patients.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.uhid}{p.mobile ? ` · ${p.mobile}` : ''}</option>)}
          </Select>
        </Field>
        <Field label="Doctor">
          <Select value={f.doctor_id || ''} onChange={(e) => setF((x) => ({ ...x, doctor_id: e.target.value }))}>
            {(doctors || []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Date" required><Input type="date" value={f.date || ''} onChange={(e) => setF((x) => ({ ...x, date: e.target.value }))} min={dkey(new Date())} /></Field>
        <Field label="Time" required><Input type="time" value={f.time || ''} onChange={(e) => setF((x) => ({ ...x, time: e.target.value }))} /></Field>
        <Field label="Reason" className="fg-2"><Textarea rows={2} value={f.reason || ''} onChange={(e) => setF((x) => ({ ...x, reason: e.target.value }))} placeholder="e.g. Diabetes review" /></Field>
      </div>
    </Modal>
  );
}

export default function Appointments() {
  const { user, pushToast } = useApp();
  const navigate = useNavigate();
  const [day, setDay] = useState(dkey(new Date()));
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [cancelTarget, setCancelTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const doctors = useLiveQuery(() => db.doctors.toArray(), []);
  const dayAppts = useLiveQuery(async () => {
    const list = await db.appointments.where('date').equals(day).toArray();
    const pmap = new Map((await db.patients.toArray()).map((p) => [p.id, p]));
    const needle = q.trim().toLowerCase();
    return list
      .map((a) => ({ ...a, patient: pmap.get(a.patient_id), doctor: doctors?.find((d) => d.id === a.doctor_id) }))
      .filter((a) => !statusFilter || a.status === statusFilter)
      .filter((a) => !needle || [a.appointment_no, a.uhid, a.reason, a.patient?.name, a.patient?.mobile].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [day, q, statusFilter, doctors]);

  const counts = (dayAppts || []).reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {});

  const advance = async (a, status) => {
    if (status === 'cancelled') { setCancelTarget(a); return; }
    setBusyId(a.id);
    try {
      await setAppointmentStatus(a.id, status, user.id);
      pushToast('success', `Marked ${NEXT_LABEL[status]}`);
      if (status === 'completed') {
        pushToast('info', 'Consider creating a consultation & bill for this visit');
      }
    } catch (e) {
      pushToast('error', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const shift = (n) => setDay(dkey(addDays(new Date(day + 'T00:00:00'), n)));
  const isToday = day === dkey(new Date());

  return (
    <div className="page">
      <PageHeader
        title="Appointments"
        sub="Daily patient queue with status tracking"
        actions={<Btn variant="accent" icon={UserPlus} onClick={() => { setEditing(null); setModal(true); }}>+ Schedule Appointment</Btn>}
      />

      <div className="appt-daybar">
        <IconBtn icon={ChevronLeft} title="Previous day" onClick={() => shift(-1)} />
        <input type="date" className="input appt-date" value={day} onChange={(e) => setDay(e.target.value)} />
        <IconBtn icon={ChevronRight} title="Next day" onClick={() => shift(1)} />
        <Btn variant="ghost" size="sm" onClick={() => setDay(dkey(new Date()))}>Today</Btn>
        <span className="appt-daylabel">
          {isToday ? 'Today' : fmtDate(day, { weekday: 'long' })} · {dayAppts?.length ?? 0} appointment(s)
        </span>
        <div className="appt-counts">
          {APPT_STATUSES.map((s) => counts[s] ? <Badge key={s} tone={s === 'completed' ? 'green' : s === 'cancelled' ? 'gray' : s === 'in_consultation' ? 'navy' : s === 'waiting' ? 'amber' : 'blue'}>{NEXT_LABEL[s] || s}: {counts[s]}</Badge> : null)}
        </div>
      </div>

      <div className="toolbar">
        <div className="toolbar-search"><Search size={15} /><input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search patient, UHID, mobile or appointment number" /></div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="toolbar-select">
          <option value="">All statuses</option>
          {APPT_STATUSES.map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}
        </Select>
      </div>

      <Card>
        {!dayAppts ? <EmptyState compact title="Loading…" /> : dayAppts.length === 0 ? (
          <EmptyState title="No Appointments Found" message="No appointments have been scheduled yet." action={<Btn size="sm" variant="accent" onClick={() => { setEditing(null); setModal(true); }}>+ Schedule Appointment</Btn>} />
        ) : (
          <div className="queue">
            {dayAppts.map((a, i) => (
              <div key={a.id} className={`queue-item q-${a.status}`}>
                <div className="q-time">
                  <span className="q-slotslot">{i + 1}</span>
                  <span className="q-t">{fmtTime(a.time + ':00')}</span>
                </div>
                <div className="q-main">
                  <span className="q-name">
                    {a.patient?.name || 'Unknown'}
                    {a.status === 'scheduled' && <span className="q-dot" title="Scheduled" />}
                  </span>
                  <span className="q-sub">
                    <UhidChip uhid={a.uhid} size="sm" />
                    {a.reason && <span>· {a.reason}</span>}
                    {a.doctor && <span>· {a.doctor.name}</span>}
                  </span>
                </div>
                <ApptBadge status={a.status} />
                <div className="q-actions">
                  {!['completed', 'cancelled', 'no_show'].includes(a.status) && <Btn size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditing(a); setModal(true); }}>Edit</Btn>}
                  {(NEXT[a.status] || []).map((s) => (
                    <Btn key={s} size="sm" variant={s === 'cancelled' ? 'ghost' : s === 'completed' ? 'accent' : 'outline'} disabled={busyId === a.id} onClick={() => advance(a, s)}>
                      {NEXT_LABEL[s]}
                    </Btn>
                  ))}
                  {a.status === 'completed' && a.patient && (
                    <Btn size="sm" variant="ghost" onClick={() => navigate(`/patients/${a.patient.id}`)}>Open</Btn>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <NewApptModal open={modal} editing={editing} onClose={() => { setModal(false); setEditing(null); }} />
      <Confirm
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        title="Cancel appointment?"
        message={cancelTarget ? `${cancelTarget.patient?.name || ''} — ${cancelTarget.appointment_no}` : ''}
        requireReason
        placeholder="e.g. Patient rescheduled"
        danger
        confirmText="Cancel appointment"
        onConfirm={async (reason) => {
          await setAppointmentStatus(cancelTarget.id, 'cancelled', user.id);
          pushToast('success', 'Appointment cancelled');
          setCancelTarget(null);
        }}
      />
    </div>
  );
}
