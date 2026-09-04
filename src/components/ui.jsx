// ─── HEEVA CLINIC — UI kit (design system components) ──────────────────────
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Search, AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cx, initials } from '../utils';

// ── Brand ────────────────────────────────────────────────────────────────────
export function Logo({ size = 36, className, src }) {
  const logoSrc = src || '/icons/heeva-logo.png';
  return (
    <img
      className={cx('logo', className)}
      src={logoSrc}
      width={size}
      height={size}
      alt="Heeva Clinic"
      style={{ objectFit: 'contain', borderRadius: '50%', flexShrink: 0 }}
      onError={(e) => {
        // Fallback to relative path if absolute path fails in certain environments
        if (e.target.src !== window.location.origin + '/icons/icon-192.png') {
          e.target.src = './icons/icon-192.png';
        }
      }}
    />
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────
export function Btn({ variant = 'primary', size = 'md', icon: Icon, children, className, ...rest }) {
  return (
    <button className={cx('btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, className)} {...rest}>
      {Icon && <Icon size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16} />}
      {children}
    </button>
  );
}

export function IconBtn({ title, icon: Icon, active, className, size = 18, ...rest }) {
  return (
    <button className={cx('icon-btn', active && 'icon-btn-active', className)} title={title} {...rest}>
      <Icon size={size} />
    </button>
  );
}

// ── Surfaces ─────────────────────────────────────────────────────────────────
export function Card({ title, sub, actions, children, className, pad = true, tone }) {
  return (
    <section className={cx('card', tone && `card-${tone}`, className)}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {sub && <p className="card-sub">{sub}</p>}
          </div>
          {actions && <div className="card-actions">{actions}</div>}
        </header>
      )}
      <div className={cx('card-body', !pad && 'card-body-flush')}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// ── Modal & Confirm ──────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, sub, children, footer, width = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => e.key === 'Escape' && onClose && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className={cx('modal', `modal-${width}`)} role="dialog" aria-modal="true">
        <header className="modal-head">
          <div>
            <h3>{title}</h3>
            {sub && <p>{sub}</p>}
          </div>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <X size={18} />
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title = 'Are you sure?', message, danger, confirmText = 'Confirm', busy, reason, requireReason, placeholder }) {
  const [why, setWhy] = useState('');
  useEffect(() => { if (open) setWhy(''); }, [open]);
  const blocked = requireReason && !String(why).trim();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="sm"
      footer={
        <>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant={danger ? 'danger' : 'primary'} disabled={blocked || busy} onClick={() => onConfirm(why)}>
            {busy ? 'Working…' : confirmText}
          </Btn>
        </>
      }
    >
      {message && <p className="confirm-msg">{message}</p>}
      {requireReason && (
        <Field label="Reason" required>
          <textarea className="input" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={placeholder || 'Required for the audit trail'} />
        </Field>
      )}
    </Modal>
  );
}

// ── Forms ────────────────────────────────────────────────────────────────────
export function Field({ label, required, error, hint, children, className }) {
  return (
    <label className={cx('field', className, error && 'field-error')}>
      {label && (
        <span className="field-label">
          {label}
          {required && <em>*</em>}
        </span>
      )}
      {children}
      {hint && !error && <span className="field-hint">{hint}</span>}
      {error && <span className="field-err">{error}</span>}
    </label>
  );
}

export const Input = (props) => <input className="input" {...props} />;
export const Select = ({ children, ...props }) => (
  <select className="input select" {...props}>{children}</select>
);
export const Textarea = (props) => <textarea className="input" rows={3} {...props} />;

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" className={cx('toggle', checked && 'toggle-on')} onClick={() => onChange(!checked)} role="switch" aria-checked={!!checked}>
      <span className="toggle-knob" />
      {label && <span className="toggle-label">{label}</span>}
    </button>
  );
}

export function Seg({ options, value, onChange, size = 'md' }) {
  return (
    <div className={cx('seg', size === 'sm' && 'seg-sm')}>
      {options.map((o) => (
        <button key={o.value} type="button" className={cx('seg-item', value === o.value && 'seg-active')} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Display ──────────────────────────────────────────────────────────────────
const TONES = {
  green: 'badge-green', amber: 'badge-amber', red: 'badge-red',
  blue: 'badge-blue', gray: 'badge-gray', teal: 'badge-teal', navy: 'badge-navy',
};
export function Badge({ tone = 'gray', children, className }) {
  return <span className={cx('badge', TONES[tone], className)}>{children}</span>;
}

export function PaymentBadge({ status }) {
  const map = { PAID: ['green', 'Paid'], PARTIAL: ['amber', 'Partially Paid'], PENDING: ['red', 'Pending'], CANCELLED: ['gray', 'Cancelled'] };
  const [tone, label] = map[status] || ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function BillStatusBadge({ status }) {
  const map = { completed: ['green', 'Completed'], CANCELLED: ['gray', 'Cancelled'] };
  const [tone, label] = map[status] || ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ApptBadge({ status }) {
  const map = {
    scheduled: ['blue', 'Scheduled'], confirmed: ['teal', 'Confirmed'], checked_in: ['teal', 'Checked In'], waiting: ['amber', 'Waiting'],
    in_consultation: ['navy', 'In Consultation'], completed: ['green', 'Completed'], cancelled: ['gray', 'Cancelled'], no_show: ['red', 'No Show'],
  };
  const [tone, label] = map[status] || ['gray', status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function Tabs({ tabs, active, onChange, className }) {
  return (
    <div className={cx('tabs', className)} role="tablist">
      {tabs.map((tb) => (
        <button
          key={tb.key}
          role="tab"
          aria-selected={active === tb.key}
          className={cx('tab', active === tb.key && 'tab-active')}
          onClick={() => onChange(tb.key)}
        >
          {tb.label}
          {tb.badge != null && <span className="tab-badge">{tb.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon = '—', title = 'Nothing here yet', message, action, compact }) {
  return (
    <div className={cx('empty', compact && 'empty-compact')}>
      <div className="empty-icon">{icon}</div>
      <div className="empty-title">{title}</div>
      {message && <div className="empty-msg">{message}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

export const Spinner = ({ size = 20 }) => (
  <svg className="spinner" width={size} height={size} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export function Stat({ label, value, icon: Icon, tone = 'navy', sub, onClick }) {
  return (
    <div className={cx('stat-card', `stat-${tone}`, onClick && 'stat-click')} onClick={onClick}>
      <div className="stat-icon">
        {Icon && <Icon size={20} />}
      </div>
      <div className="stat-main">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sub">{sub}</div>}
      </div>
    </div>
  );
}

export function Avatar({ name, size = 38, tone = 'navy' }) {
  return (
    <span className={cx('avatar', `avatar-${tone}`)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials(name)}
    </span>
  );
}

export function UhidChip({ uhid, onCopy, size = 'md' }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cx('uhid-chip', `uhid-${size}`)}
      title="Click to copy UHID"
      onClick={(e) => {
        e.stopPropagation();
        try { navigator.clipboard.writeText(uhid); } catch (err) { /* ignore */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
        onCopy && onCopy();
      }}
    >
      {copied ? '✓ Copied' : uhid}
    </button>
  );
}

// ── Data table (sort + pagination) ──────────────────────────────────────────
export function DataTable({ columns, rows, rowKey = 'id', onRow, pageSize = 10, empty = <EmptyState compact />, loading, dense, footerNote }) {
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort || !rows) return rows || [];
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const get = (r) => (col.sortValue ? col.sortValue(r) : r[sort.key]);
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null || va === '') return 1;
      if (vb == null || vb === '') return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
      return c * sort.dir;
    });
  }, [rows, sort, columns]);

  useEffect(() => { setPage(0); }, [rows ? rows.length : -1]);

  if (loading) {
    return (
      <div className="table-wrap">
        <div className="table-loading"><Spinner /> Loading…</div>
      </div>
    );
  }
  if (!rows || !rows.length) return <>{empty}</>;

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const slice = sorted.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table className={cx('table', dense && 'table-dense')}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={cx(c.sortable && 'th-sortable', sort && sort.key === c.key && 'th-sorted', c.align === 'right' && 'th-right')}
                  onClick={c.sortable ? () => setSort((s) => (s && s.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 })) : undefined}
                >
                  {c.label}
                  {sort && sort.key === c.key && <span className="th-arrow">{sort.dir === 1 ? '↑' : '↓'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((r, i) => (
              <tr key={r[rowKey] ?? i} className={cx(onRow && 'tr-click')} onClick={() => onRow && onRow(r)}>
                {columns.map((c) => (
                  <td key={c.key} className={cx(c.align === 'right' && 'td-right')}>
                    {c.render ? c.render(r) : r[c.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-foot">
        <span className="table-count">
          {sorted.length} record{sorted.length === 1 ? '' : 's'}
          {footerNote ? ` · ${footerNote}` : ''}
        </span>
        {pages > 1 && (
          <div className="table-pager">
            <IconBtn title="Previous page" icon={ChevronLeft} disabled={cur === 0} onClick={() => setPage(cur - 1)} />
            <span className="table-page">Page {cur + 1} of {pages}</span>
            <IconBtn title="Next page" icon={ChevronRight} disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── SearchSelect (combobox) ──────────────────────────────────────────────────
export function SearchSelect({ value, onChange, options, getLabel, getSearch, placeholder = 'Search…', error, disabled }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const boxRef = useRef(null);

  useEffect(() => {
    const h = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    const list = options || [];
    if (!q) return list;
    const s = q.toLowerCase();
    return list.filter((o) => (getSearch ? getSearch(o) : getLabel(o)).toLowerCase().includes(s));
  }, [options, q, getLabel, getSearch]);

  const pick = (o) => {
    onChange(o);
    setQ('');
    setOpen(false);
    setHi(-1);
  };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) setOpen(true);
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    if (e.key === 'Enter' && open && hi >= 0 && filtered[hi]) { e.preventDefault(); pick(filtered[hi]); }
    if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className={cx('search-select', error && 'field-error')} ref={boxRef}>
      <div className="search-select-box">
        <Search size={15} className="ss-icon" />
        <input
          className="ss-input"
          disabled={disabled}
          value={open ? q : value ? getLabel(value) : ''}
          placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setHi(-1); if (e.target.value === '' && value) onChange(null); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {value && !open && (
          <button type="button" className="ss-clear" onClick={() => { onChange(null); setQ(''); }}>
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div className="ss-drop">
          {filtered.length === 0 && <div className="ss-none">No matches</div>}
          {filtered.map((o, i) => (
            <div
              key={o.id}
              className={cx('ss-item', hi === i && 'ss-hi')}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => { e.preventDefault(); pick(o); }}
            >
              {getLabel(o)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Toasts ───────────────────────────────────────────────────────────────────
export function ToastStack({ toasts }) {
  const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
  return (
    <div className="toast-stack">
      {toasts.map((tst) => {
        const I = icons[tst.type] || Info;
        return (
          <div key={tst.id} className={cx('toast', `toast-${tst.type}`)}>
            <I size={17} />
            <span>{tst.msg}</span>
          </div>
        );
      })}
    </div>
  );
}
