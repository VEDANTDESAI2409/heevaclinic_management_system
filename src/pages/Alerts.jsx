// ─── HEEVA CLINIC — notification center ────────────────────────────────────
import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../db';
import { useApp } from '../context/AppContext';
import { Btn, Card, Badge, PageHeader, EmptyState, Select } from '../components/ui';
import { markAllRead, unreadCount } from '../services/notifications';
import { fmtDateTime, cx } from '../utils';
import { Bell, CheckCheck, AlertTriangle, Hourglass, PackageX, Wallet, CalendarDays } from 'lucide-react';

const TYPE_META = {
  low_stock: { icon: AlertTriangle, label: 'Low Stock' },
  out_of_stock: { icon: PackageX, label: 'Out of Stock' },
  expired: { icon: Hourglass, label: 'Expired Medicine' },
  expiring_30: { icon: Hourglass, label: 'Expiring ≤ 30d' },
  expiring_60: { icon: Hourglass, label: 'Expiring ≤ 60d' },
  expiring_90: { icon: Hourglass, label: 'Expiring ≤ 90d' },
  pending_payment: { icon: Wallet, label: 'Pending Payment' },
  appointment: { icon: CalendarDays, label: 'Appointment' },
};

export default function Alerts() {
  const { pushToast, refreshNotifs } = useApp();
  const [sevF, setSevF] = useState('');
  const [typeF, setTypeF] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(true);

  const notifs = useLiveQuery(async () => {
    let list = await db.notifications.orderBy('at').reverse().toArray();
    if (sevF) list = list.filter((n) => n.severity === sevF);
    if (typeF) list = list.filter((n) => n.type === typeF);
    if (unreadOnly) list = list.filter((n) => !n.read);
    return list.slice(0, 100);
  }, [sevF, typeF, unreadOnly]);

  const unreads = useLiveQuery(() => unreadCount(), []);

  return (
    <div className="page">
      <PageHeader
        title="Alerts & Notifications"
        sub={`${unreads ?? 0} unread · auto-generated from stock, expiry, payments & appointments`}
        actions={<Btn variant="ghost" icon={CheckCheck} disabled={!unreads} onClick={async () => { await markAllRead(); refreshNotifs(); pushToast('success', 'All notifications marked read'); }}>Mark all read</Btn>}
      />

      <Card>
        <div className="toolbar">
          <Select value={sevF} onChange={(e) => setSevF(e.target.value)} className="toolbar-select">
            <option value="">All severities</option>
            <option value="danger">Danger</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </Select>
          <Select value={typeF} onChange={(e) => setTypeF(e.target.value)} className="toolbar-select">
            <option value="">All types</option>
            {Object.entries(TYPE_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Btn size="sm" variant={unreadOnly ? 'primary' : 'ghost'} onClick={() => setUnreadOnly((v) => !v)}>{unreadOnly ? 'Unread only' : 'Show all'}</Btn>
        </div>

        {!notifs ? <EmptyState compact title="Loading…" /> : notifs.length === 0 ? (
          <EmptyState icon="🔔" title="No notifications" message="Stock, expiry, payment and appointment alerts will appear here automatically." />
        ) : (
          <div className="alert-list">
            {notifs.map((n) => {
              const meta = TYPE_META[n.type] || { icon: Bell, label: n.type };
              const Icon = meta.icon;
              return (
                <button
                  key={n.id}
                  className={cx('alert-item', !n.read && 'alert-unread', `alert-${n.severity}`)}
                  onClick={async () => {
                    await db.notifications.put({ ...n, read: true });
                    refreshNotifs();
                  }}
                >
                  <span className={cx('alert-ic', `ai-${n.severity}`)}><Icon size={16} /></span>
                  <span className="alert-body">
                    <span className="alert-title">{n.title} <Badge tone={n.severity === 'danger' ? 'red' : n.severity === 'warning' ? 'amber' : 'blue'}>{meta.label}</Badge></span>
                    <span className="alert-msg">{n.message}</span>
                  </span>
                  <span className="alert-when">{fmtDateTime(n.at)}</span>
                  {!n.read && <span className="alert-unread-dot" title="Click to mark read" />}
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
