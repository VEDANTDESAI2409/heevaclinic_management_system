import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import { Btn, Card, Modal, Field, Input, DataTable, PageHeader, EmptyState, Tabs, Badge, Confirm } from '../components/ui';
import { createDoctor, updateDoctor, archiveDoctor, deleteDoctor } from '../services/clinical';
import { fmtDateTime } from '../utils';
import { Pencil, Archive, Trash2, Plus, Upload } from 'lucide-react';
import CsvImportModal from '../components/csv/CsvImportModal';

function DoctorModal({ open, onClose, editing }) {
  const { user: me, pushToast } = useApp();
  const [form, setForm] = useState({ name: '', qualification: '', specialization: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(editing ? { name: editing.name || '', qualification: editing.qualification || '', specialization: editing.specialization || '', phone: editing.phone || '', email: editing.email || '' } : { name: '', qualification: '', specialization: '', phone: '', email: '' });
    setError('');
  }, [open, editing]);

  const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
  const save = async () => {
    setError('');
    if (!form.name.trim()) { setError('Doctor name is required'); return; }
    setBusy(true);
    try {
      if (editing) await updateDoctor(editing.id, form, me.id);
      else await createDoctor(form, me.id);
      pushToast('success', `${form.name} ${editing ? 'updated' : 'added to doctors directory'}`);
      onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return <Modal open={open} onClose={onClose} title={editing ? `Edit ${editing.name}` : 'Add Doctor'} width="md"
    footer={<><Btn variant="ghost" onClick={onClose}>Cancel</Btn><Btn variant="accent" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save Doctor'}</Btn></>}>
    {error && <div className="form-alert">{error}</div>}
    <div className="form-grid">
      <Field label="Doctor Full Name" required className="fg-2"><Input value={form.name} onChange={set('name')} /></Field>
      <Field label="Qualification"><Input value={form.qualification} onChange={set('qualification')} /></Field>
      <Field label="Specialization"><Input value={form.specialization} onChange={set('specialization')} /></Field>
      <Field label="Phone / Mobile"><Input value={form.phone} onChange={set('phone')} /></Field>
      <Field label="Email Address"><Input type="email" value={form.email} onChange={set('email')} /></Field>
    </div>
  </Modal>;
}

export default function Staff() {
  const { user: me, pushToast } = useApp();
  const [tab, setTab] = useState('doctors');
  const [doctorModal, setDoctorModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const doctors = useLiveQuery(async () => {
    const list = await db.doctors.toArray();
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  const logs = useLiveQuery(() => db.activity_logs.orderBy('at').reverse().limit(100).toArray(), []);

  return <div className="page">
    <PageHeader title="Staff & Users" sub="Doctors directory · audit logging" actions={tab === 'doctors' && (
      <div style={{ display: 'flex', gap: '8px' }}>
        <Btn variant="ghost" icon={Upload} onClick={() => setImportModal(true)}>Import CSV</Btn>
        <Btn variant="accent" icon={Plus} onClick={() => { setEditingDoctor(null); setDoctorModal(true); }}>+ Add Doctor</Btn>
      </div>
    )} />
    <Tabs active={tab} onChange={setTab} tabs={[{ key: 'doctors', label: 'Doctors', badge: doctors?.length }, { key: 'audit', label: 'Activity Log', badge: 'recent' }]} />
    {tab === 'doctors' && <Card title="Doctors Directory" sub="Consulting doctors, qualifications & specialties">
      <DataTable columns={[
        { key: 'name', label: 'Doctor', sortable: true, render: (doctor) => <div><div className="cell-main">{doctor.name}</div><div className="cell-sub">{doctor.qualification}{doctor.specialization ? ` · ${doctor.specialization}` : ''}</div></div> },
        { key: 'phone', label: 'Phone', render: (doctor) => doctor.phone || '—' },
        { key: 'email', label: 'Email', render: (doctor) => doctor.email || '—' },
        { key: 'active', label: 'Status', render: (doctor) => doctor.active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Archived</Badge> },
        { key: 'actions', label: '', align: 'right', render: (doctor) => <span className="cell-actions" onClick={(event) => event.stopPropagation()}><Btn size="sm" variant="ghost" icon={Pencil} onClick={() => { setEditingDoctor(doctor); setDoctorModal(true); }}>Edit</Btn><Btn size="sm" variant="ghost" icon={Archive} onClick={() => setArchiveTarget(doctor)}>{doctor.active ? 'Archive' : 'Reactivate'}</Btn><Btn size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteTarget(doctor)}>Delete</Btn></span> },
      ]} rows={doctors} pageSize={10} loading={!doctors} empty={<EmptyState icon="🩺" title="No doctors registered" action={<Btn size="sm" variant="accent" onClick={() => setDoctorModal(true)}>+ Add Doctor</Btn>} />} />
    </Card>}
    {tab === 'audit' && <Card title="Activity Log" sub="Chronological record of clinic operations"><DataTable dense columns={[{ key: 'at', label: 'When', sortable: true, render: (log) => <span className="cell-sub">{fmtDateTime(log.at)}</span> }, { key: 'user_name', label: 'User', render: (log) => <b>{log.user_name || 'system'}</b> }, { key: 'action', label: 'Action', render: (log) => <Badge tone="navy">{log.action}</Badge> }, { key: 'entity', label: 'Entity', render: (log) => log.entity || '—' }, { key: 'detail', label: 'Detail', render: (log) => <span className="cell-ellip" title={log.detail}>{log.detail || '—'}</span> }]} rows={logs} pageSize={15} empty={<EmptyState icon="📜" title="No activity yet" />} /></Card>}
    <DoctorModal open={doctorModal} onClose={() => { setDoctorModal(false); setEditingDoctor(null); }} editing={editingDoctor} />
    <CsvImportModal open={importModal} onClose={() => setImportModal(false)} type="doctors" context={{ existingDoctors: doctors }} />
    <Confirm open={!!archiveTarget} onClose={() => setArchiveTarget(null)} title={`${archiveTarget?.active ? 'Archive' : 'Reactivate'} ${archiveTarget?.name}?`} message={archiveTarget?.active ? 'Archived doctors will not appear in new consultation or appointment dropdowns, but historical records remain connected.' : 'Reactivate this doctor to allow new consultations and appointments.'} confirmText={archiveTarget?.active ? 'Archive doctor' : 'Reactivate'} onConfirm={async () => { await archiveDoctor(archiveTarget.id, me.id); pushToast('success', `${archiveTarget.name} ${archiveTarget.active ? 'archived' : 'reactivated'}`); setArchiveTarget(null); }} />
    <Confirm open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete ${deleteTarget?.name}?`} message="Doctors with recorded consultations or appointments cannot be deleted and must be archived instead." danger confirmText="Delete doctor" onConfirm={async () => { try { await deleteDoctor(deleteTarget.id, me.id); pushToast('success', `${deleteTarget.name} deleted`); setDeleteTarget(null); } catch (e) { pushToast('error', e.message); } }} />
  </div>;
}