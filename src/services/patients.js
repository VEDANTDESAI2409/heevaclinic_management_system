// ─── HEEVA CLINIC — patient registry, UHID, vitals ─────────────────────────
import db from '../db';
import { uid, nowISO, dkey, ageFromDob } from '../utils';
import { makeUHID, audit, getSettings } from './core';

const digits = (s) => String(s || '').replace(/\D/g, '');
/**
 * Register a patient and assign their permanent UHID (unique constraint enforced).
 */
export async function registerPatient(data, userId, { temp = false } = {}) {
  const settings = await getSettings();
  const name = String(data.name || '').trim();
  const mobile = digits(data.mobile);
  if (!name || name.length < 3) throw new Error('Full name is required');
  if (!data.gender) throw new Error('Gender is required');
  if (mobile.length !== 10) throw new Error('Enter a valid 10-digit mobile number');
  if (!data.dob) throw new Error('Date of birth is required');
  if (data.dob > dkey(new Date())) throw new Error('Date of birth cannot be in the future');
  return db.transaction('rw', [db.patients, db.counters, db.activity_logs], async () => {
    const uhid = await makeUHID(settings);
    if (await db.patients.where('uhid').equals(uhid).count()) throw new Error('UHID collision detected — please retry');
    const p = {
      id: uid(),
      uhid,
      name,
      dob: data.dob || '',
      approx_age: null,
      gender: data.gender || '',
      mobile,
      alt_mobile: digits(data.alt_mobile),
      email: data.email || '',
      address: data.address || '',
      city: data.city || '',
      state: data.state || 'Gujarat',
      pin: String(data.pin || ''),
      ec_name: data.ec_name || '',
      ec_number: digits(data.ec_number),
      ec_relation: data.ec_relation || '',
      blood_group: data.blood_group || '',
      allergies: data.allergies || '',
      conditions: data.conditions || '',
      current_meds: data.current_meds || '',
      notes: data.notes || '',
      active: 1,
      reg_date: dkey(new Date()),
      created_at: nowISO(),
      created_by: userId || null,
    };
    await db.patients.add(p);
    await audit(userId, 'PATIENT_CREATE', 'patient', p.id, `${p.name} · ${p.uhid}`);
    return p;
  });
}

export async function updatePatient(id, patch, userId) {
  return db.transaction('rw', [db.patients, db.activity_logs], async () => {
    const p = await db.patients.get(id);
    if (!p) throw new Error('Patient not found');
    // UHID is immutable — strip it from any patch
    const { uhid: _uhid, id: _id, ...safe } = patch;
    const updated = { ...p, ...safe, id: p.id, uhid: p.uhid };
    await db.patients.put(updated);
    await audit(userId, 'PATIENT_UPDATE', 'patient', id, Object.keys(safe).join(', '));
    return updated;
  });
}

export async function archivePatient(id, userId) {
  return db.transaction('rw', [db.patients, db.activity_logs], async () => {
    const p = await db.patients.get(id);
    if (!p) throw new Error('Patient not found');
    const newActive = p.active === 0 ? 1 : 0;
    const updated = { ...p, active: newActive };
    await db.patients.put(updated);
    await audit(userId, newActive ? 'PATIENT_REACTIVATE' : 'PATIENT_ARCHIVE', 'patient', id, `${p.name} · ${p.uhid}`);
    return updated;
  });
}

export async function reactivatePatient(id, userId) {
  return db.transaction('rw', [db.patients, db.activity_logs], async () => {
    const p = await db.patients.get(id);
    if (!p) throw new Error('Patient not found');
    const updated = { ...p, active: 1 };
    await db.patients.put(updated);
    await audit(userId, 'PATIENT_REACTIVATE', 'patient', id, `${p.name} · ${p.uhid}`);
    return updated;
  });
}

export async function deletePatient(id, userId) {
  return db.transaction('rw', [db.patients, db.consultations, db.bills, db.prescriptions, db.appointments, db.patient_vitals, db.activity_logs], async () => {
    const p = await db.patients.get(id);
    if (!p) throw new Error('Patient not found');
    const [cCount, bCount, prCount, aCount, vCount] = await Promise.all([
      db.consultations.where('patient_id').equals(id).count(),
      db.bills.where('patient_id').equals(id).count(),
      db.prescriptions.where('patient_id').equals(id).count(),
      db.appointments.where('patient_id').equals(id).count(),
      db.patient_vitals.where('patient_id').equals(id).count(),
    ]);
    if (cCount > 0 || bCount > 0 || prCount > 0 || aCount > 0 || vCount > 0) {
      throw new Error('This patient has clinical, billing or appointment history and cannot be permanently deleted. Archive the patient instead.');
    }
    await db.patients.delete(id);
    await audit(userId, 'PATIENT_DELETE', 'patient', id, `${p.name} · ${p.uhid}`);
  });
}

export const VITAL_FIELDS = ['temp', 'sbp', 'dbp', 'pulse', 'spo2', 'rr', 'weight', 'height', 'sugar'];

export async function addVitals(patientId, v, userId) {
  return db.transaction('rw', [db.patient_vitals, db.activity_logs], async () => {
    const rec = {
      id: uid(),
      patient_id: patientId,
      temp: v.temp ?? null,
      sbp: v.sbp ?? null,
      dbp: v.dbp ?? null,
      pulse: v.pulse ?? null,
      spo2: v.spo2 ?? null,
      rr: v.rr ?? null,
      weight: v.weight ?? null,
      height: v.height ?? null,
      sugar: v.sugar ?? null,
      recorded_at: nowISO(),
      recorded_by: userId || null,
    };
    await db.patient_vitals.add(rec);
    await audit(userId, 'VITALS_RECORD', 'vitals', rec.id, `Patient ${patientId}`);
    return rec;
  });
}

export async function patientVisits(patientId) {
  return db.consultations.where('patient_id').equals(patientId).toArray();
}

export function ageOf(p) {
  return ageFromDob(p.dob) ?? p.approx_age ?? null;
}
