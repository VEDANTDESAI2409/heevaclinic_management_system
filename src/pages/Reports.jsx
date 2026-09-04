// ─── HEEVA CLINIC — reports & analytics ────────────────────────────────────
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useApp } from '../context/AppContext';
import {
  Btn, Card, Field, Input, Select, Badge, DataTable, PageHeader, EmptyState, Seg,
} from '../components/ui';
import { salesReport, patientReport, topMedicines, financialReport } from '../services/reports';
import { lowStockList, expiryBuckets, stockMap } from '../services/inventory';
import { printReport } from '../print/printers';
import { fmtMoney, fmtDate, dkey, addDays, download, toCSV, daysUntil, monthLabel } from '../utils';
import { BarChart3, Download, Printer, Users, TrendingUp, Pill, Wallet, UserPlus, RotateCcw } from 'lucide-react';

const PRESETS = [
  { label: 'Today', get: () => [dkey(new Date()), dkey(new Date())] },
  { label: '7 days', get: () => [dkey(addDays(new Date(), -6)), dkey(new Date())] },
  { label: '30 days', get: () => [dkey(addDays(new Date(), -29)), dkey(new Date())] },
  { label: 'This month', get: () => [dkey(new Date()).slice(0, 8) + '01', dkey(new Date())] },
  { label: 'This year', get: () => [dkey(new Date()).slice(0, 5) + '01-01', dkey(new Date())] },
];

function RangeBar({ from, to, setFrom, setTo }) {
  return (
    <div className="toolbar">
      {PRESETS.map((p) => (
        <Btn key={p.label} size="sm" variant={from === p.get()[0] && to === p.get()[1] ? 'primary' : 'ghost'} onClick={() => { const [f, t] = p.get(); setFrom(f); setTo(t); }}>
          {p.label}
        </Btn>
      ))}
      <span className="range-sep" />
      <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="toolbar-date" />
      <span className="range-dash">→</span>
      <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="toolbar-date" />
    </div>
  );
}

function SalesTab({ from, to, setFrom, setTo, settings }) {
  const [group, setGroup] = useState('day');
  const money = (v) => fmtMoney(v, settings.currency);
  const data = useLiveQuery(() => salesReport(from, to, group), [from, to, group]);

  const label = (key) => (group === 'day' ? fmtDate(key) : group === 'month' ? monthLabel(key) : 'Week of ' + fmtDate(key));

  const cols = [
    { key: 'label', label: group === 'day' ? 'Date' : group === 'month' ? 'Month' : 'Week', render: (r) => label(r.key) },
    { key: 'bills', label: 'Bills', align: 'right' },
    { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => money(r.revenue) },
    { key: 'paid', label: 'Collected', align: 'right', render: (r) => money(r.paid) },
    { key: 'pending', label: 'Pending', align: 'right', render: (r) => money(r.pending) },
    { key: 'expenses', label: 'Expenses', align: 'right', render: (r) => money(r.expenses) },
    { key: 'profit', label: 'Est. Profit', align: 'right', render: (r) => <b className={r.profit < 0 ? 'val-red' : 'val-green'}>{money(r.profit)}</b> },
  ];

  return (
    <Card
      title="Sales Report"
      actions={<>
        <Seg size="sm" value={group} onChange={setGroup} options={[{ value: 'day', label: 'Daily' }, { value: 'week', label: 'Weekly' }, { value: 'month', label: 'Monthly' }]} />
        <Btn size="sm" variant="ghost" icon={Download} onClick={() => download(`heeva-sales-${from}-${to}.csv`, toCSV(cols.map((c) => c.label), data?.rows.map((r) => [label(r.key), r.bills, r.revenue, r.paid, r.pending, r.expenses, r.profit])), 'text/csv')}>Export</Btn>
        <Btn size="sm" variant="ghost" icon={Printer} onClick={() => printReport({ title: `Sales Report — ${group}`, subtitle: `${fmtDate(from)} to ${fmtDate(to)}`, columns: cols, rows: data?.rows, totals: { bills: data?.totals.bills, revenue: money(data?.totals.revenue), paid: money(data?.totals.paid), pending: money(data?.totals.pending), expenses: money(data?.totals.expenses), profit: money(data?.totals.profit) }, settings })}>Print</Btn>
      </>}
    >
      <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {data && (
        <div className="rep-summary">
          <span className="cat-chip">Bills: <b>{data.totals.bills}</b></span>
          <span className="cat-chip">Revenue: <b>{money(data.totals.revenue)}</b></span>
          <span className="cat-chip">Collected: <b>{money(data.totals.paid)}</b></span>
          <span className="cat-chip">Pending: <b>{money(data.totals.pending)}</b></span>
          <span className="cat-chip">Expenses: <b>{money(data.totals.expenses)}</b></span>
          <span className="cat-chip">Est. Profit: <b className={data.totals.profit < 0 ? 'val-red' : 'val-green'}>{money(data.totals.profit)}</b></span>
        </div>
      )}
      <DataTable columns={cols} rows={data?.rows} pageSize={14} empty={<EmptyState icon="📊" title="No sales in range" />} />
    </Card>
  );
}

function PatientsTab({ from, to, setFrom, setTo }) {
  const data = useLiveQuery(() => patientReport(from, to), [from, to]);
  return (
    <div className="rep-stacks">
      <Card title="Patient Report" sub={`New & returning patients between ${fmtDate(from)} and ${fmtDate(to)}`}>
        <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
        {data && (
          <div className="rep-summary">
            <span className="cat-chip"><UserPlus size={13} /> New patients: <b>{data.new_patients.length}</b></span>
            <span className="cat-chip"><Users size={13} /> Unique patients visited: <b>{data.unique_visits}</b></span>
            <span className="cat-chip">Total visits: <b>{data.total_visits}</b></span>
            <span className="cat-chip"><RotateCcw size={13} /> Returning: <b>{data.returning.length}</b></span>
          </div>
        )}
        <h4 className="sub-head">New patients in range</h4>
        <DataTable
          dense
          columns={[
            { key: 'uhid', label: 'UHID', render: (p) => <span className="cell-mono">{p.uhid}</span> },
            { key: 'name', label: 'Name', sortable: true },
            { key: 'gender', label: 'Gender' },
            { key: 'mobile', label: 'Mobile' },
            { key: 'reg_date', label: 'Registered', render: (p) => fmtDate(p.reg_date) },
            { key: 'city', label: 'City' },
          ]}
          rows={data?.new_patients}
          pageSize={10}
          empty={<EmptyState compact icon="👥" title="No new patients in range" />}
        />
        <h4 className="sub-head">Returning patients (had earlier visits)</h4>
        <DataTable
          dense
          columns={[
            { key: 'uhid', label: 'UHID', sortValue: (r) => r.patient.uhid, render: (r) => <span className="cell-mono">{r.patient.uhid}</span> },
            { key: 'name', label: 'Name', sortValue: (r) => r.patient.name, render: (r) => r.patient.name },
            { key: 'visits', label: 'Visits in range', align: 'right', sortable: true },
            { key: 'total_visits', label: 'All-time visits', align: 'right' },
          ]}
          rows={data?.returning}
          pageSize={10}
          empty={<EmptyState compact icon="↩" title="No returning patients in range" />}
        />
      </Card>
    </div>
  );
}

function MedicinesTab({ from, to, setFrom, setTo, settings }) {
  const top = useLiveQuery(() => topMedicines(from, to, 10), [from, to]);
  const low = useLiveQuery(() => lowStockList(), []);
  const exp = useLiveQuery(() => expiryBuckets(), []);
  const stock = useLiveQuery(() => stockMap(), []);
  const money = (v) => fmtMoney(v, settings.currency);

  return (
    <div className="rep-stacks">
      <Card title="Top Selling Medicines" sub={`Quantity & revenue · ${fmtDate(from)} to ${fmtDate(to)}`}>
        <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
        <DataTable
          dense
          columns={[
            { key: 'name', label: 'Medicine', sortable: true },
            { key: 'qty', label: 'Qty Sold', align: 'right', sortable: true },
            { key: 'revenue', label: 'Revenue', align: 'right', sortable: true, render: (m) => money(m.revenue) },
          ]}
          rows={top}
          pageSize={10}
          empty={<EmptyState compact icon="💊" title="No medicine sales in range" />}
        />
      </Card>

      <Card title="Low & Out of Stock" sub={`Minimum level per medicine · default ${settings.low_stock_default}`}>
        <DataTable
          dense
          columns={[
            { key: 'name', label: 'Medicine', sortValue: (r) => r.medicine.name, render: (r) => r.medicine.name },
            { key: 'available', label: 'Available', align: 'right', render: (r) => <b>{r.available}</b> },
            { key: 'min', label: 'Minimum', align: 'right' },
            { key: 'st', label: 'Status', render: (r) => r.available <= 0 ? <Badge tone="red">OUT</Badge> : <Badge tone="amber">LOW</Badge> },
          ]}
          rows={low ? [...low.out, ...low.low] : null}
          pageSize={10}
          empty={<EmptyState compact icon="✅" title="No low stock items" />}
        />
      </Card>

      <Card title="Expiry Report" sub="Expired stock and near-expiry batches with on-hand value">
        <DataTable
          dense
          columns={[
            {
              key: 'state', label: 'Status',
              render: (b) => b.state === 'expired' ? <Badge tone="red">EXPIRED</Badge> : <Badge tone={b.days <= 30 ? 'red' : b.days <= 60 ? 'amber' : 'blue'}>{b.days}d left</Badge>,
            },
            { key: 'med_name', label: 'Medicine', sortable: true },
            { key: 'batch', label: 'Batch #', render: (b) => b.batch.batch_no },
            { key: 'expiry', label: 'Expiry', sortable: true },
            { key: 'on_hand', label: 'On Hand', align: 'right' },
            { key: 'value', label: 'Value (buy)', align: 'right', render: (b) => money(b.on_hand * (b.batch.purchase_price || 0)) },
          ]}
          rows={exp ? [
            ...exp.expired.map((b) => ({ ...b, state: 'expired', days: b.days })),
            ...exp.d30.map((b) => ({ ...b, state: 'n30' })),
            ...exp.d60.map((b) => ({ ...b, state: 'n60' })),
            ...exp.d90.map((b) => ({ ...b, state: 'n90' })),
          ] : null}
          pageSize={12}
          empty={<EmptyState compact icon="✅" title="Nothing expired or near expiry" />}
        />
      </Card>
    </div>
  );
}

function FinancialTab({ from, to, setFrom, setTo, settings }) {
  const data = useLiveQuery(() => financialReport(from, to), [from, to]);
  const money = (v) => fmtMoney(v, settings.currency);
  return (
    <div className="rep-stacks">
      <Card title="Financial Summary">
        <RangeBar from={from} to={to} setFrom={setFrom} setTo={setTo} />
        {data && (
          <div className="rep-summary">
            <span className="cat-chip"><TrendingUp size={13} /> Revenue: <b>{money(data.revenue)}</b></span>
            <span className="cat-chip"><Wallet size={13} /> Expenses: <b>{money(data.expenses)}</b></span>
            <span className="cat-chip">Est. Profit: <b className={data.profit < 0 ? 'val-red' : 'val-green'}>{money(data.profit)}</b></span>
            <span className="cat-chip">Pending receivables: <b>{money(data.pending_payments.reduce((s, p) => s + p.due, 0))}</b> ({data.pending_payments.length} bills)</span>
          </div>
        )}
        {data && (
          <div className="fin-cols">
            <div>
              <h4 className="sub-head">Revenue by Payment Method</h4>
              <DataTable
                dense
                columns={[
                  { key: 'method', label: 'Method' },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
                ]}
                rows={Object.entries(data.revenue_by_method).map(([method, amount]) => ({ method, amount }))}
                pageSize={6}
                empty={<EmptyState compact icon="💳" title="No collections in range" />}
              />
            </div>
            <div>
              <h4 className="sub-head">Expenses by Category</h4>
              <DataTable
                dense
                columns={[
                  { key: 'cat', label: 'Category' },
                  { key: 'amount', label: 'Amount', align: 'right', render: (r) => money(r.amount) },
                ]}
                rows={Object.entries(data.expenses_by_category).map(([cat, amount]) => ({ cat, amount }))}
                pageSize={6}
                empty={<EmptyState compact icon="💰" title="No expenses in range" />}
              />
            </div>
          </div>
        )}
        <h4 className="sub-head">Pending Payments (all time, oldest first)</h4>
        <DataTable
          dense
          columns={[
            { key: 'bill_no', label: 'Bill #', render: (r) => <span className="cell-mono">{r.bill.bill_no}</span> },
            { key: 'patient', label: 'Patient', sortValue: (r) => r.bill.patient_name, render: (r) => r.bill.patient_name },
            { key: 'due', label: 'UHID', render: (r) => <span className="cell-mono">{r.bill.uhid}</span> },
            { key: 'date', label: 'Bill Date', sortValue: (r) => r.bill.date, render: (r) => fmtDate(r.bill.date) },
            { key: 'age', label: 'Days', align: 'right', sortable: true, render: (r) => Math.max(0, -r.days) },
            { key: 'amt', label: 'Due', align: 'right', sortable: true, sortValue: (r) => r.due, render: (r) => <b className="val-red">{money(r.due)}</b> },
          ]}
          rows={data?.pending_payments}
          pageSize={10}
          empty={<EmptyState compact icon="✅" title="All bills settled" />}
        />
      </Card>
    </div>
  );
}

export default function Reports() {
  const { settings } = useApp();
  const [tab, setTab] = useState('sales');
  const [from, setFrom] = useState(dkey(addDays(new Date(), -29)));
  const [to, setTo] = useState(dkey(new Date()));

  const tabs = [
    { key: 'sales', label: 'Sales' },
    { key: 'patients', label: 'Patients' },
    { key: 'medicines', label: 'Medicines' },
    { key: 'financial', label: 'Financial' },
  ];

  return (
    <div className="page">
      <PageHeader title="Reports & Analytics" sub="Date-range reports with CSV export and print" />
      <div className="tabs rep-tabs">{tabs.map((t) => (
        <button key={t.key} className={`tab ${tab === t.key ? 'tab-active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
      ))}</div>
      {tab === 'sales' && <SalesTab from={from} to={to} setFrom={setFrom} setTo={setTo} settings={settings} />}
      {tab === 'patients' && <PatientsTab from={from} to={to} setFrom={setFrom} setTo={setTo} />}
      {tab === 'medicines' && <MedicinesTab from={from} to={to} setFrom={setFrom} setTo={setTo} settings={settings} />}
      {tab === 'financial' && <FinancialTab from={from} to={to} setFrom={setFrom} setTo={setTo} settings={settings} />}
    </div>
  );
}
