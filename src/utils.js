// ─── HEEVA CLINIC — shared utilities ────────────────────────────────────────
export const cx = (...a) => a.filter(Boolean).join(' ');

export function uid() {
  try {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* non-secure context fallback */ }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const p2 = (n) => String(n).padStart(2, '0');

/** Local-timezone date key YYYY-MM-DD */
export function dkey(d = new Date()) {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export const todayStr = () => dkey();
export const nowISO = () => new Date().toISOString();

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function toDDMMYYYY(s) {
  if (!s) return '';
  const str = String(s).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) return str;
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const parts = str.slice(0, 10).split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return str;
  return `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function isValidDDMMYYYY(dateStr) {
  if (typeof dateStr !== 'string') return false;
  const match = dateStr.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!match) return false;
  const day = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  if (month < 1 || month > 12) return false;
  if (year < 1900 || year > 2100) return false;
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

export function parseDDMMYYYY(dateStr) {
  if (!isValidDDMMYYYY(dateStr)) return null;
  const [d, m, y] = dateStr.trim().split('-');
  return `${y}-${m}-${d}`;
}

export function fmtDate(s) {
  if (!s) return '—';
  return toDDMMYYYY(s) || '—';
}

export function fmtDateTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s);
  const datePart = `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}`;
  const timePart = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
  return `${datePart} ${timePart}`;
}

export function fmtTime(s) {
  if (!s) return '—';
  const d = new Date(s);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age < 0 ? null : age;
}

export function ageLabel(p) {
  if (!p) return '—';
  if (typeof p === 'number') return `${p} yrs`;
  if (p.age != null && p.age !== '') return `${p.age} yrs`;
  if (p.approx_age != null && p.approx_age !== '') return `${p.approx_age} yrs`;
  if (p.dob) {
    const a = ageFromDob(p.dob);
    if (a != null) return `${a} yrs`;
  }
  return '—';
}

/** integer days from today (local) until dateStr (YYYY-MM-DD); negative = past */
export function daysUntil(dateStr) {
  if (!dateStr) return Infinity;
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + 'T00:00:00');
  return Math.round((d - t) / 86400000);
}
export const isExpired = (dateStr) => daysUntil(dateStr) < 0;

export function fmtMoney(n, sym = '₹') {
  const v = Number(n) || 0;
  const hasPaise = Math.round(v * 100) % 100 !== 0;
  return sym + v.toLocaleString('en-IN', { minimumFractionDigits: hasPaise ? 2 : 0, maximumFractionDigits: 2 });
}

export function fmtQty(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function validMobile(m) {
  const s = String(m || '').replace(/[\s()-]/g, '');
  return /^(\+?91)?[6-9]\d{9}$/.test(s);
}

export function download(filename, content, mime = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function toCSV(headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

export function monthLabel(key) {
  // key YYYY-MM
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function weekStart(d = new Date()) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function hoursAgoISO(h) {
  return new Date(Date.now() - h * 3600000).toISOString();
}

export function debounce(fn, ms = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
}

export function timeSlot(t) {
  const h = Number(String(t || '0').split(':')[0]);
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}
