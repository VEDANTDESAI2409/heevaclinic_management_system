// ─── HEEVA CLINIC — consultations, prescriptions and appointments ──────────
import db from '../db';
import { uid, nowISO, dkey } from '../utils';
import { makeNo, audit, getSettings } from './core';
import { addVitals } from './patients';

export async function createConsultation(data, userId) {
  const settings = await getSettings();
  return db.transaction('rw', [db.consultations, db.counters, db.activity_logs, db.patient_vitals, db.patients, db.doctors], async () => {
    const patient = await db.patients.get(data.patient_id);
    if (!patient) throw new Error('Patient not found');
    const doctor = await db.doctors.get(data.doctor_id);
    const now = data.when || nowISO();
    const consultation_no = await makeNo('CONS', 'HC-C', new Date(now).getFullYear());
    const c = {
      id: uid(),
      consultation_no,
      patient_id: patient.id,
      uhid: patient.uhid,
      doctor_id: doctor ? doctor.id : null,
      doctor_name: doctor ? doctor.name : '',
      date: dkey(new Date(now)),
      time: now,
      chief: data.chief || '',
      symptoms: data.symptoms || '',
      diagnosis: data.diagnosis || '',
      notes: data.notes || '',
      advice: data.advice || '',
      follow_up: data.follow_up || '',
      status: 'completed',
      created_by: userId || null,
      created_at: now,
    };
    await db.consultations.add(c);
    if (data.vitals && Object.values(data.vitals).some((v) => v != null && v !== '')) {
      await addVitals(patient.id, data.vitals, userId);
    }
    await audit(userId, 'CONSULTATION_CREATE', 'consultation', c.id, `${consultation_no} · ${patient.name} (${patient.uhid})`);
    return c;
  });
}

export async function createPrescription(data, userId) {
  const settings = await getSettings();
  return db.transaction('rw', [db.prescriptions, db.prescription_items, db.counters, db.activity_logs, db.patients, db.medicines], async () => {
    const patient = await db.patients.get(data.patient_id);
    if (!patient) throw new Error('Patient not found');
    const now = data.when || nowISO();
    const prescription_no = await makeNo('PR', 'HC-PR', new Date(now).getFullYear());
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) throw new Error('Add at least one item to the prescription');
    const pr = {
      id: uid(),
      prescription_no,
      patient_id: patient.id,
      uhid: patient.uhid,
      consultation_id: data.consultation_id || null,
      doctor_id: data.doctor_id || null,
      doctor_name: data.doctor_name || '',
      date: dkey(new Date(now)),
      time: now,
      diagnosis: data.diagnosis || '',
      notes: data.notes || '',
      advice: data.advice || '',
      created_by: userId || null,
      created_at: now,
    };
    await db.prescriptions.add(pr);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let name = it.name || '';
      if (!name && it.medicine_id) {
        const med = await db.medicines.get(it.medicine_id);
        name = med ? med.name : 'Medicine';
      }
      await db.prescription_items.add({
        id: uid(),
        prescription_id: pr.id,
        medicine_id: it.medicine_id || null,
        seq: i + 1,
        name,
        dosage: it.dosage || '',
        frequency: it.frequency || '',
        duration: it.duration || '',
        instruction: it.instruction || '',
      });
    }
    await audit(userId, 'PRESCRIPTION_CREATE', 'prescription', pr.id, `${prescription_no} · ${patient.name} (${patient.uhid})`);
    return pr;
  });
}

export async function createAppointment(data, userId) {
  const settings = await getSettings();
  return db.transaction('rw', [db.appointments, db.counters, db.activity_logs, db.patients], async () => {
    const patient = await db.patients.get(data.patient_id);
    if (!patient) throw new Error('Patient not found');
    if (!data.date || !data.time) throw new Error('Date and time are required');
    const now = nowISO();
    const appointment_no = await makeNo('APT', 'HC-APT', new Date(data.date + 'T00:00:00').getFullYear());
    const a = {
      id: uid(),
      appointment_no,
      patient_id: patient.id,
      uhid: patient.uhid,
      doctor_id: data.doctor_id || null,
      date: data.date,
      time: data.time,
      reason: data.reason || '',
      status: 'scheduled',
      created_by: userId || null,
      created_at: now,
      updated_at: now,
    };
    await db.appointments.add(a);
    await audit(userId, 'APPOINTMENT_CREATE', 'appointment', a.id, `${appointment_no} · ${patient.name} · ${data.date} ${data.time}`);
    return a;
  });
}

export const APPT_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'waiting', 'in_consultation', 'completed', 'cancelled', 'no_show'];

export async function updateAppointment(id, data, userId) {
  return db.transaction('rw', [db.appointments, db.activity_logs, db.patients], async () => {
    const current = await db.appointments.get(id);
    if (!current) throw new Error('Appointment not found');
    const patient = await db.patients.get(data.patient_id || current.patient_id);
    if (!patient) throw new Error('Patient not found');
    if (!data.date || !data.time) throw new Error('Date and time are required');
    const updated = {
      ...current, patient_id: patient.id, uhid: patient.uhid,
      doctor_id: data.doctor_id || null, date: data.date, time: data.time,
      reason: data.reason || '', updated_at: nowISO(),
    };
    await db.appointments.put(updated);
    await audit(userId, 'APPOINTMENT_UPDATE', 'appointment', id, `${current.appointment_no} · ${data.date} ${data.time}`);
    return updated;
  });
}

export async function setAppointmentStatus(id, status, userId) {
  if (!APPT_STATUSES.includes(status)) throw new Error('Invalid status');
  return db.transaction('rw', [db.appointments, db.activity_logs], async () => {
    const a = await db.appointments.get(id);
    if (!a) throw new Error('Appointment not found');
    const updated = { ...a, status, updated_at: nowISO() };
    await db.appointments.put(updated);
    await audit(userId, 'APPOINTMENT_STATUS', 'appointment', id, `${a.status} → ${status}`);
    return updated;
  });
}

// ─── Doctor CRUD ──────────────────────────────────────────────────────────────
export async function createDoctor(data, userId) {
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Doctor name is required');
  const doc = {
    id: uid(),
    name,
    qualification: data.qualification || '',
    specialization: data.specialization || '',
    phone: data.phone || '',
    email: data.email || '',
    active: 1,
    created_at: nowISO(),
    updated_at: nowISO(),
  };
  await db.doctors.add(doc);
  await audit(userId, 'DOCTOR_CREATE', 'doctor', doc.id, doc.name);
  return doc;
}

export async function updateDoctor(id, patch, userId) {
  const existing = await db.doctors.get(id);
  if (!existing) throw new Error('Doctor not found');
  const updated = { ...existing, ...patch, id: existing.id, updated_at: nowISO() };
  await db.doctors.put(updated);
  await audit(userId, 'DOCTOR_UPDATE', 'doctor', id, Object.keys(patch).join(', '));
  return updated;
}

export async function archiveDoctor(id, userId) {
  const existing = await db.doctors.get(id);
  if (!existing) throw new Error('Doctor not found');
  const active = existing.active ? 0 : 1;
  const updated = { ...existing, active, updated_at: nowISO() };
  await db.doctors.put(updated);
  await audit(userId, active ? 'DOCTOR_REACTIVATE' : 'DOCTOR_ARCHIVE', 'doctor', id, existing.name);
  return updated;
}

export async function deleteDoctor(id, userId) {
  const existing = await db.doctors.get(id);
  if (!existing) throw new Error('Doctor not found');
  const [consultCount, apptCount, presCount] = await Promise.all([
    db.consultations.where('doctor_id').equals(id).count(),
    db.appointments.where('doctor_id').equals(id).count(),
    db.prescriptions.where('doctor_id').equals(id).count(),
  ]);
  if (consultCount > 0 || apptCount > 0 || presCount > 0) {
    throw new Error('This doctor has clinical history (consultations or appointments) and cannot be deleted. Archive the doctor instead.');
  }
  await db.doctors.delete(id);
  await audit(userId, 'DOCTOR_DELETE', 'doctor', id, existing.name);
}
