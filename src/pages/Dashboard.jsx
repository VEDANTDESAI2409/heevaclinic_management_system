// ─── HEEVA CLINIC — dashboard ───────────────────────────────────────────────
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import { Card, Stat, Btn, Badge, EmptyState, PageHeader, UhidChip } from '../components/ui';
import { LineChart, BarChart, HBarList } from '../components/charts';
import {
  dashboardStats, revenueSeries, visitsSeries, topMedicines, salesReport,
} from '../services/reports';
import { lowStockList, expiryBuckets } from '../services/inventory';
import { fmtDate, fmtMoney, fmtTime, todayStr, dkey, addDays } from '../utils';
import {
  Users, Stethoscope, ReceiptText, Wallet, TrendingUp, Pill, AlertTriangle,
  Hourglass, CreditCard, Plus, UserPlus, FilePlus2, PackagePlus,
  CalendarDays, Clock,
} from 'lucide-react';

function SectionCard({ title, icon: Icon, children, action, to }) {
  const navigate = useNavigate();
  return (
    <Card
      title={title}
      actions={action || (to ? <Btn variant="ghost" size="sm" onClick={() => navigate(to)}>View all</Btn> : null)}
      className="dash-section"
    >
      {children}
    </Card>
  );
}

const Row = ({ children, onClick }) => (
  <button className="dash-row" onClick={onClick} type="button">{children}</button>
);

export default function Dashboard() {
  const { t, settings, can, user } = useApp();
  const navigate = useNavigate();

  const stats = useLiveQuery(() => dashboardStats(), []);
  const rev14 = useLiveQuery(() => revenueSeries(14), []);
  const visits7 = useLiveQuery(() => visitsSeries(7), []);
  const topMeds = useLiveQuery(() => topMedicines(dkey(addDays(new Date(), -29)), todayStr(), 5), []);
  const rev7 = useLiveQuery(async () => {
    const r = await salesReport(dkey(addDays(new Date(), -6)), todayStr(), 'day');
    return r.rows.map((x) => ({ label: x.key.slice(8) + '/' + x.key.slice(5, 7), revenue: x.revenue, expenses: x.expenses }));
  }, []);

  const recentPatients = useLiveQuery(() => db.patients.orderBy('created_at').reverse().limit(5).toArray(), []);
  const recentBills = useLiveQuery(() => db.bills.orderBy('time').reverse().limit(5).toArray(), []);
  const upAppts = useLiveQuery(async () => {
    const t0 = todayStr();
    const t1 = dkey(addDays(new Date(), 1));
    const all = await db.appointments.filter((a) => (a.date === t0 || a.date === t1) && !['cancelled', 'completed'].includes(a.status)).toArray();
    return all.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
  }, []);
  const low = useLiveQuery(async () => (await lowStockList()).low.slice(0, 5), []);
  const expiring = useLiveQuery(async () => {
    const b = await expiryBuckets();
    return [...b.d30, ...b.d60].slice(0, 5);
  }, []);
  const pending = useLiveQuery(async () => db.bills.filter((b) => b.status === 'completed' && b.payment_status !== 'PAID').limit(5).toArray(), []);

  const money = (v) => fmtMoney(v, settings.currency);

  return (
    <div className="page">
      <PageHeader
        title={`${t('dashboard')} — ${new Date().toLocaleDateString('en-GB', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`}
        sub={`Good ${new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, ${user?.name?.split(' ')[0] || ''} · ${settings.clinic_name}`}
      />

      {/* quick actions */}
      <div className="quick-actions">
        {can('patients') && <Btn variant="accent" icon={UserPlus} size="sm" onClick={() => navigate('/patients?new=1')}>+ New Patient</Btn>}
        {can('consultations') && <Btn variant="primary" icon={Stethoscope} size="sm" onClick={() => navigate('/consultations?new=1')}>+ New Consultation</Btn>}
        {can('billing') && <Btn variant="outline" icon={ReceiptText} size="sm" onClick={() => navigate('/billing?new=1')}>+ Create Bill</Btn>}
        {can('medicines') && <Btn variant="outline" icon={Pill} size="sm" onClick={() => navigate('/medicines?new=1')}>+ Add Medicine</Btn>}
        {can('inventory') && <Btn variant="outline" icon={PackagePlus} size="sm" onClick={() => navigate('/inventory')}>+ Add Stock</Btn>}
      </div>

      {/* stat cards */}
      <div className="stat-grid">
        <Stat label="Today's Patients" value={stats?.today.patients ?? '—'} icon={Users} tone="navy" onClick={() => navigate('/patients')} />
        <Stat label="Today's Consultations" value={stats?.today.consultations ?? '—'} icon={Stethoscope} tone="teal" onClick={() => navigate('/consultations')} />
        <Stat label="Today's Bills" value={stats?.today.bills ?? '—'} icon={ReceiptText} tone="teal" onClick={() => navigate('/billing')} />
        <Stat label="Today's Revenue" value={stats ? money(stats.today.revenue) : '—'} icon={Wallet} tone="green" onClick={() => navigate('/reports')} />
        <Stat label="Today's Expenses" value={stats ? money(stats.today.expenses) : '—'} icon={Wallet} tone="red" onClick={() => can('expenses') ? navigate('/expenses') : undefined} />
        <Stat label="Estimated Profit (MTD)" value={stats ? money(stats.month.profit) : '—'} icon={TrendingUp} tone="green" sub={`Revenue ${money(stats?.month.revenue ?? 0)} − Expenses ${money(stats?.month.expenses ?? 0)}`} />
        <Stat label="Total Medicines" value={stats?.medicines.total ?? '—'} icon={Pill} tone="navy" onClick={() => can('medicines') && navigate('/medicines')} />
        <Stat label="Low Stock Medicines" value={stats?.medicines.low ?? '—'} icon={AlertTriangle} tone="amber" sub={`${stats?.medicines.out ?? 0} out of stock`} onClick={() => can('inventory') && navigate('/inventory')} />
        <Stat label="Expiring Medicines" value={stats ? stats.expiring.d30 : '—'} icon={Hourglass} tone="amber" sub={`${stats?.expiring.expired ?? 0} expired · 30/60/90d: ${stats?.expiring.d60 ?? 0}/${stats?.expiring.d90 ?? 0}`} onClick={() => can('inventory') && navigate('/inventory')} />
        <Stat label="Pending Payments" value={stats ? money(stats.pending_payments.amount) : '—'} icon={CreditCard} tone="red" sub={`${stats?.pending_payments.count ?? 0} bill(s) outstanding`} onClick={() => can('payments') && navigate('/payments')} />
      </div>

      {/* charts */}
      <div className="chart-grid">
        <Card title="Daily Revenue — last 14 days" sub="Completed bills only">
          {rev14 ? <LineChart data={rev14.map((r) => ({ label: r.label, value: r.revenue }))} money color="var(--teal-600)" /> : <EmptyState compact title="Loading…" />}
        </Card>
        <Card title="Revenue vs Expenses — last 7 days">
          {rev7 ? (
            <BarChart
              labels={rev7.map((r) => r.label)}
              series={[
                { name: 'Revenue', color: 'var(--teal-600)', data: rev7.map((r) => r.revenue) },
                { name: 'Expenses', color: 'var(--red)', data: rev7.map((r) => r.expenses) },
              ]}
              money
            />
          ) : <EmptyState compact title="Loading…" />}
        </Card>
        <Card title="Patient Visits — last 7 days">
          {visits7 ? <BarChart labels={visits7.map((v) => v.label)} series={[{ name: 'Visits', color: 'var(--navy-700)', data: visits7.map((v) => v.value) }]} /> : <EmptyState compact title="Loading…" />}
        </Card>
        <Card title="Top Selling Medicines — last 30 days" sub="By quantity dispensed">
          {topMeds && topMeds.length ? <HBarList items={topMeds.map((m) => ({ label: m.name, value: m.qty }))} /> : <EmptyState compact title="No sales in range" />}
        </Card>
      </div>

      {/* live sections */}
      <div className="dash-grid">
        <SectionCard title="Recent Patients" icon={Users} to={can('patients') ? '/patients' : undefined}>
          {!recentPatients ? <EmptyState compact title="Loading…" /> : recentPatients.length === 0 ? (
            <EmptyState compact title="No patients yet" action={<Btn size="sm" variant="accent" onClick={() => navigate('/patients?new=1')}>Register first patient</Btn>} />
          ) : (
            <>
              {recentPatients.map((p) => (
                <Row key={p.id} onClick={() => navigate(`/patients/${p.id}`)}>
                  <span className="dr-name">{p.name}</span>
                  <span className="dr-sub"><UhidChip uhid={p.uhid} size="sm" /></span>
                  <span className="dr-right">{fmtDate(p.reg_date)}</span>
                </Row>
              ))}
            </>
          )}
        </SectionCard>

        <SectionCard title="Recent Bills" to={can('billing') ? '/billing' : undefined}>
          {!recentBills ? <EmptyState compact title="Loading…" /> : recentBills.length === 0 ? (
            <EmptyState compact title="No bills yet" />
          ) : (
            <>
              {recentBills.map((b) => (
                <Row key={b.id} onClick={() => navigate(`/billing?bill=${b.id}`)}>
                  <span className="dr-name">{b.bill_no}</span>
                  <span className="dr-sub">{b.patient_name} · {fmtTime(b.time)}</span>
                  <span className="dr-right">
                    {money(b.total)} <Badge tone={b.status === 'CANCELLED' ? 'gray' : b.payment_status === 'PAID' ? 'green' : b.payment_status === 'PARTIAL' ? 'amber' : 'red'}>
                      {b.status === 'CANCELLED' ? 'Cancelled' : b.payment_status}
                    </Badge>
                  </span>
                </Row>
              ))}
            </>
          )}
        </SectionCard>

        <SectionCard title="Upcoming Appointments" to={can('appointments') ? '/appointments' : undefined}>
          {!upAppts ? <EmptyState compact title="Loading…" /> : upAppts.length === 0 ? (
            <EmptyState compact title="Nothing scheduled" action={can('appointments') ? <Btn size="sm" variant="outline" onClick={() => navigate('/appointments')}>Schedule</Btn> : null} />
          ) : (
            <>
              {upAppts.map((a) => (
                <Row key={a.id} onClick={() => navigate('/appointments')}>
                  <span className="dr-name">{a.patient_name || '—'}</span>
                  <span className="dr-sub"><Badge tone={a.date === todayStr() ? 'teal' : 'blue'}>{a.date === todayStr() ? 'Today' : 'Tomorrow'}</Badge> {fmtTime(a.time + ':00')}</span>
                  <span className="dr-right">{a.reason || ''}</span>
                </Row>
              ))}
            </>
          )}
        </SectionCard>

        <SectionCard title="Low Stock Medicines" to={can('inventory') ? '/inventory' : undefined}>
          {!low ? <EmptyState compact title="Loading…" /> : low.length === 0 ? (
            <EmptyState compact title="All stocks healthy" />
          ) : (
            <>
              {low.map((r) => (
                <Row key={r.medicine.id} onClick={() => navigate('/inventory')}>
                  <span className="dr-name">{r.medicine.name}</span>
                  <span className="dr-sub"><Badge tone="amber">{r.available} left</Badge> min {r.min}</span>
                  <span className="dr-right" />
                </Row>
              ))}
            </>
          )}
        </SectionCard>

        <SectionCard title="Expiring Medicines" to={can('inventory') ? '/inventory' : undefined}>
          {!expiring ? <EmptyState compact title="Loading…" /> : expiring.length === 0 ? (
            <EmptyState compact title="Nothing expiring soon" />
          ) : (
            <>
              {expiring.map((b) => (
                <Row key={b.batch.id} onClick={() => navigate('/inventory')}>
                  <span className="dr-name">{b.med_name}</span>
                  <span className="dr-sub">Batch {b.batch.batch_no} · <Badge tone={b.days <= 30 ? 'red' : 'amber'}>{b.days}d</Badge></span>
                  <span className="dr-right">{b.on_hand} pcs</span>
                </Row>
              ))}
            </>
          )}
        </SectionCard>

        <SectionCard title="Pending Payments" to={can('payments') ? '/payments' : undefined}>
          {!pending ? <EmptyState compact title="Loading…" /> : pending.length === 0 ? (
            <EmptyState compact title="All bills settled" />
          ) : (
            <>
              {pending.map((b) => (
                <Row key={b.id} onClick={() => navigate('/payments')}>
                  <span className="dr-name">{b.bill_no}</span>
                  <span className="dr-sub">{b.patient_name} · {fmtDate(b.date)}</span>
                  <span className="dr-right"><Badge tone="red">{money(b.total - (b.paid || 0))}</Badge></span>
                </Row>
              ))}
            </>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
