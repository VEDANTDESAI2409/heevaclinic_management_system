// ─── HEEVA CLINIC — lightweight SVG charts (no external deps, print-safe) ──
import React, { useMemo } from 'react';

function niceMax(v) {
  if (v <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

export function LineChart({ data, height = 180, color = 'var(--teal-600)', area = true, money = false, unit = '' }) {
  const W = 560;
  const H = height;
  const padL = 46;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const values = data.map((d) => d.value);
  const max = niceMax(Math.max(...values, 1));
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const x = (i) => padL + (data.length <= 1 ? iw / 2 : (i * iw) / (data.length - 1));
  const y = (v) => padT + ih - (v / max) * ih;
  const pts = data.map((d, i) => `${x(i)},${y(d.value)}`).join(' ');
  const areaPath = data.length > 1 ? `M ${x(0)},${y(0) + 0} L ${pts.split(' ').join(' L ')} L ${x(data.length - 1)},${padT + ih} L ${x(0)},${padT + ih} Z` : '';
  const fmt = (v) => (money ? '₹' + Math.round(v).toLocaleString('en-IN') : v + unit);
  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {gridVals.map((gv, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(gv)} y2={y(gv)} className="chart-grid" />
          <text x={padL - 6} y={y(gv) + 3.5} textAnchor="end" className="chart-tick">{fmt(gv)}</text>
        </g>
      ))}
      {area && data.length > 1 && <path d={areaPath} className="chart-area" fill={color} opacity="0.12" />}
      {data.length > 1 && <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(d.value)} r={data.length > 16 ? 2.4 : 3.4} fill={color}>
            <title>{`${d.label}: ${fmt(d.value)}`}</title>
          </circle>
          {(data.length <= 10 || i % Math.ceil(data.length / 10) === 0) && (
            <text x={x(i)} y={H - 8} textAnchor="middle" className="chart-tick">{d.label}</text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function BarChart({ series, labels, height = 180, money = false }) {
  const W = 560;
  const H = height;
  const padL = 46;
  const padR = 10;
  const padT = 12;
  const padB = 26;
  const max = niceMax(Math.max(...series.flatMap((s) => s.data), 1));
  const iw = W - padL - padR;
  const ih = H - padT - padB;
  const groupW = iw / Math.max(labels.length, 1);
  const barW = Math.min(22, (groupW * 0.7) / Math.max(series.length, 1));
  const y = (v) => padT + ih - (v / max) * ih;
  const fmt = (v) => (money ? '₹' + Math.round(v).toLocaleString('en-IN') : String(v));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img">
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(max * f)} y2={y(max * f)} className="chart-grid" />
          <text x={padL - 6} y={y(max * f) + 3.5} textAnchor="end" className="chart-tick">{fmt(max * f)}</text>
        </g>
      ))}
      {labels.map((lb, i) => {
        const cx0 = padL + groupW * i + groupW / 2;
        const total = series.length * barW + (series.length - 1) * 3;
        return (
          <g key={i}>
            {series.map((s, si) => {
              const v = s.data[i] || 0;
              const bx = cx0 - total / 2 + si * (barW + 3);
              return (
                <rect key={si} x={bx} y={y(v)} width={barW} height={Math.max(0, padT + ih - y(v))} rx="3" fill={s.color}>
                  <title>{`${lb} — ${s.name}: ${fmt(v)}`}</title>
                </rect>
              );
            })}
            <text x={cx0} y={H - 8} textAnchor="middle" className="chart-tick">{lb}</text>
          </g>
        );
      })}
      <g className="chart-legend">
        {series.map((s, i) => (
          <g key={i} transform={`translate(${padL + i * 110}, ${H - 2})`}>
            <rect x="0" y="-9" width="10" height="10" rx="2" fill={s.color} />
            <text x="15" y="0" className="chart-tick">{s.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

export function HBarList({ items, color = 'var(--teal-600)', money = false, unit = '' }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  const fmt = (v) => (money ? '₹' + Math.round(v).toLocaleString('en-IN') : v.toLocaleString('en-IN') + unit);
  if (!items.length) return <div className="hbars-empty">No data in range</div>;
  return (
    <div className="hbars">
      {items.map((it, i) => (
        <div className="hbar-row" key={i}>
          <div className="hbar-label" title={it.label}>{it.label}</div>
          <div className="hbar-track">
            <div className="hbar-fill" style={{ width: `${(it.value / max) * 100}%`, background: color }} />
          </div>
          <div className="hbar-value">{fmt(it.value)}</div>
        </div>
      ))}
    </div>
  );
}
