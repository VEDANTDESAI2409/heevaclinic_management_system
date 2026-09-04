// ─── HEEVA CLINIC — app shell: sidebar, topbar, global search, notifications
import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, useNavigate, useLocation, Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import { Logo, Btn, IconBtn, ToastStack } from '../components/ui';
import {
  Home, Users, Stethoscope, CalendarDays, FileText, ReceiptText, CreditCard,
  Pill, Boxes, Undo2, Wallet, BarChart3, Bell, UserCog, Settings as SettingsIcon,
  Search, Plus, Moon, Sun, Download, WifiOff, ChevronRight,
} from 'lucide-react';
import { fmtDateTime, fmtDate, dkey, todayStr, cx } from '../utils';

const NAV = [
  { group: 'Clinic', items: [
    { key: 'dashboard', to: '/', label: 'Dashboard', icon: Home },
    { key: 'patients', to: '/patients', label: 'Patients', icon: Users },
    { key: 'consultations', to: '/consultations', label: 'Consultations', icon: Stethoscope },
    { key: 'appointments', to: '/appointments', label: 'Appointments', icon: CalendarDays },
  ]},
  { group: 'Clinical', items: [
    { key: 'prescriptions', to: '/prescriptions', label: 'Prescriptions', icon: FileText },
  ]},
  { group: 'Operations', items: [
    { key: 'billing', to: '/billing', label: 'Billing', icon: ReceiptText },
    { key: 'payments', to: '/payments', label: 'Payments', icon: CreditCard },
  ]},
  { group: 'Pharmacy & Stock', items: [
    { key: 'medicines', to: '/medicines', label: 'Medicines', icon: Pill },
    { key: 'inventory', to: '/inventory', label: 'Inventory', icon: Boxes },
    { key: 'returns', to: '/returns', label: 'Returns', icon: Undo2 },
  ]},
  { group: 'Finance', items: [
    { key: 'expenses', to: '/expenses', label: 'Expenses', icon: Wallet },
    { key: 'reports', to: '/reports', label: 'Reports', icon: BarChart3 },
  ]},
  { group: 'Administration', items: [
    { key: 'alerts', to: '/alerts', label: 'Alerts', icon: Bell },
    { key: 'staff', to: '/staff', label: 'Staff & Users', icon: UserCog },
    { key: 'settings', to: '/settings', label: 'Settings', icon: SettingsIcon },
  ]},
];

function GlobalSearch() {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return undefined; }
    let on = true;
    (async () => {
      const s = q.trim().toLowerCase();
      const sDigits = s.replace(/\D/g, '');
      const [patients, bills, meds] = await Promise.all([
        db.patients.filter((p) => (p.name || '').toLowerCase().includes(s) || (p.uhid || '').toLowerCase().includes(s) || (p.mobile || '').includes(sDigits)).limit(5).toArray(),
        db.bills.filter((b) => (b.bill_no || '').toLowerCase().includes(s) || (b.patient_name || '').toLowerCase().includes(s)).limit(5).toArray(),
        db.medicines.filter((m) => m.active && ((m.name || '').toLowerCase().includes(s) || (m.generic || '').toLowerCase().includes(s) || (m.barcode || '').includes(sDigits))).limit(5).toArray(),
      ]);
      if (on) setRes({ patients, bills, meds });
    })();
    return () => { on = false; };
  }, [q]);

  const go = (path) => {
    navigate(path);
    setQ('');
    setOpen(false);
  };

  const empty = res && !res.patients.length && !res.bills.length && !res.meds.length;

  return (
    <div className="gsearch">
      <div className="gsearch-box">
        <Search size={16} className="gsearch-icon" />
        <input
          className="gsearch-input"
          placeholder="Search patients, UHID, medicines..."
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 180)}
        />
      </div>
      {open && q.trim().length >= 2 && (
        <div className="gsearch-drop">
          {empty && <div className="gsearch-none">No results for “{q}”</div>}
          {res?.patients.length > 0 && (
            <div className="gs-group">
              <div className="gs-title">Patients</div>
              {res.patients.map((p) => (
                <button key={p.id} className="gs-item" onMouseDown={() => go(`/patients/${p.id}`)}>
                  <Users size={14} /><span className="gs-main">{p.name}</span><span className="gs-sub">{p.uhid} · {p.mobile || ''}</span>
                </button>
              ))}
            </div>
          )}
          {res?.bills.length > 0 && (
            <div className="gs-group">
              <div className="gs-title">Bills</div>
              {res.bills.map((b) => (
                <button key={b.id} className="gs-item" onMouseDown={() => go(`/billing?bill=${b.id}`)}>
                  <ReceiptText size={14} /><span className="gs-main">{b.bill_no}</span><span className="gs-sub">{b.patient_name} · ₹{(b.total || 0).toLocaleString('en-IN')}</span>
                </button>
              ))}
            </div>
          )}
          {res?.meds.length > 0 && (
            <div className="gs-group">
              <div className="gs-title">Medicines</div>
              {res.meds.map((m) => (
                <button key={m.id} className="gs-item" onMouseDown={() => go(`/medicines?q=${encodeURIComponent(m.name)}`)}>
                  <Pill size={14} /><span className="gs-main">{m.name}</span><span className="gs-sub">{m.generic || m.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationBell() {
  const { notifCount, refreshNotifs, t } = useApp();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const notifs = useLiveQuery(() => db.notifications.orderBy('at').reverse().limit(8).toArray(), [], []);

  return (
    <div className="bell-wrap">
      <IconBtn title="Notifications" icon={Bell} onClick={() => setOpen((o) => !o)} active={open} />
      {notifCount > 0 && <span className="bell-count">{notifCount > 99 ? '99+' : notifCount}</span>}
      {open && (
        <>
          <div className="drop-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-drop">
            <div className="notif-drop-head">
              <strong>Notifications</strong>
              <Link to="/alerts" onClick={() => setOpen(false)} className="notif-all">View all <ChevronRight size={13} /></Link>
            </div>
            {(!notifs || !notifs.length) && <div className="notif-empty">You are all caught up.</div>}
            {(notifs || []).map((n) => (
              <button
                key={n.id}
                className={cx('notif-item', !n.read && 'notif-unread')}
                onClick={async () => {
                  await db.notifications.put({ ...n, read: true });
                  refreshNotifs();
                  setOpen(false);
                  navigate('/alerts');
                }}
              >
                <span className={cx('notif-dot', `nd-${n.severity}`)} />
                <span className="notif-body">
                  <span className="notif-title">{n.title}</span>
                  <span className="notif-msg">{n.message}</span>
                </span>
                <span className="notif-time">{fmtDateTime(n.at).split(', ')[1] || fmtDate(n.at)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AppShell() {
  const { user, t, settings, theme, setTheme, online, toasts, install, installEvt, standalone, can } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const today = todayStr();
  const dateLabel = useMemo(() => new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }), []);

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="side-brand">
          <Logo size={38} src={settings.logo} />
          <div className="side-brand-text">
            <div className="side-brand-name">{settings.clinic_name}</div>
          </div>
        </div>
        <nav className="side-nav">
          {NAV.map((g) => {
            const items = g.items.filter((i) => can(i.key));
            if (!items.length) return null;
            return (
              <div className="side-group" key={g.group}>
                <div className="side-group-label">{g.group}</div>
                {items.map((i) => {
                  const active = i.to === '/' ? location.pathname === '/' : location.pathname.startsWith(i.to);
                  return (
                    <button
                      key={i.key}
                      className={cx('side-item', active && 'side-active', i.hot && 'side-hot')}
                      onClick={() => navigate(i.to)}
                      title={i.label}
                      aria-label={i.label}
                    >
                      <i.icon size={18} className="side-icon" />
                      <span className="side-label">{i.label}</span>
                      {i.hot && <span className="side-hot-dot" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="side-foot">
            <div className="side-foot-card">
              <div className="sfc-name">{user?.name || settings.clinic_name}</div>
              <div className="sfc-qual">Administrator</div>
            </div>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="main-col">
        <header className="topbar">
          <div className="topbar-left">
            <GlobalSearch />
          </div>
          <div className="topbar-center">
            <Btn variant="accent" icon={Plus} size="sm" onClick={() => navigate('/patients?new=1')} title="Register a new patient">
              {t('new_patient', 'New Patient')}
            </Btn>
          </div>
          <div className="topbar-right">
            {!online && (
              <span className="offline-pill" title={t('offline')}>
                <WifiOff size={13} /> Offline
              </span>
            )}
            <span className="topbar-date">{dateLabel}</span>
            {installEvt && !standalone && (
              <Btn variant="ghost" size="sm" icon={Download} onClick={install} title="Install HEEVA Clinic as a desktop app">
                {t('install_app', 'Install')}
              </Btn>
            )}
            <NotificationBell />
            <IconBtn title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'} icon={theme === 'light' ? Moon : Sun} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
          </div>
        </header>

        {!online && (
          <div className="offline-banner">
            <WifiOff size={14} /> {t('offline', 'Offline — changes are saved on this device')}
          </div>
        )}

        <main className="content">
          <Outlet />
        </main>
      </div>

      <ToastStack toasts={toasts} />
    </div>
  );
}
