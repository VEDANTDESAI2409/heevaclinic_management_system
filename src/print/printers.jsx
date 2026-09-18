// ─── HEEVA CLINIC — print documents (thermal receipts, A4, prescription) ───
import React from 'react';
import { Logo } from '../components/ui';
import { fmtDate, fmtDateTime, fmtDateTime12h, fmtMoney, fmtQty, ageLabel, toDDMMYYYY } from '../utils';

// Bridge: PrintProvider registers its setter so any module can trigger a print.
let _printFn = null;
export function registerPrinter(fn) { _printFn = fn; }
const printNode = (node) => { if (_printFn) _printFn(node); };

const money = (v, sym = '₹') => fmtMoney(v, sym);

export function printInvoiceA4(bill, items = [], payments = [], s = {}) {
  const paidRows = (payments || []).filter((p) => p.kind === 'payment');
  const paymentStatus = { PAID: 'Paid', PARTIAL: 'Partially Paid', PENDING: 'Pending', CANCELLED: 'Cancelled' }[bill.payment_status] || bill.payment_status;
  const payMethodDisplay = paidRows.length > 0
    ? [...new Set(paidRows.map((p) => p.method))].join(', ')
    : (bill.payment_method || (bill.payment_status === 'PAID' ? 'Cash' : 'Pending'));

  const docName = bill.doctor_name || s.doctor_name || 'Dr. Mit Nayak';
  const docPhone = bill.doctor_phone || s.doctor_phone || '9913974000';

  const ageStr = bill.patient_age != null
    ? (String(bill.patient_age).includes('Y') ? bill.patient_age : `${bill.patient_age} Y`)
    : '';
  const ageSex = [ageStr, bill.patient_gender].filter(Boolean).join(' / ') || '—';

  printNode(
    <div className="print-job a4-letterhead-job">
      <style>{`
        @page { size: A4 portrait; margin: 0 !important; }
        .letterhead-sheet {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
          padding-top: 52mm;
          padding-bottom: 38mm;
          padding-left: 20mm;
          padding-right: 20mm;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          color: #1a202c;
          font-size: 13px;
          line-height: 1.45;
          background: #ffffff;
          page-break-after: avoid !important;
          page-break-inside: avoid !important;
          break-inside: avoid !important;
        }
        .med-doc-patient {
          border-top: 1.5px solid #2d3748;
          border-bottom: 1.5px solid #2d3748;
          padding: 8px 0;
          margin-bottom: 10px;
          font-size: 12.5px;
          line-height: 1.5;
        }
        .med-doc-grid {
          display: grid;
          grid-template-columns: 1.1fr 1fr 1.1fr;
          row-gap: 5px;
          column-gap: 16px;
        }
        .med-doc-field {
          display: flex;
          align-items: baseline;
          gap: 6px;
        }
        .med-doc-lbl {
          font-size: 10.5px;
          font-weight: 700;
          color: #4a5568;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
        }
        .med-doc-val {
          font-size: 13px;
          font-weight: 600;
          color: #1a202c;
        }

        .med-doc-diag {
          margin-bottom: 12px;
          padding: 4px 0 6px 0;
          border-bottom: 1px dashed #cbd5e0;
          font-size: 12.5px;
          line-height: 1.4;
        }
        .med-doc-diag-lbl {
          font-weight: 800;
          color: #1a202c;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 11.5px;
          margin-right: 6px;
        }
        .med-doc-diag-val {
          font-weight: 700;
          color: #1a202c;
          text-transform: uppercase;
        }

        .med-doc-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 14px;
          font-size: 12.5px;
        }
        .med-doc-table th {
          border-top: 1.5px solid #2d3748;
          border-bottom: 1.5px solid #2d3748;
          padding: 6px 8px;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #1a202c;
          background: #f8fafc;
          text-align: left;
        }
        .med-doc-table td {
          border-bottom: 1px solid #e2e8f0;
          padding: 6px 8px;
          color: #2d3748;
          vertical-align: top;
        }
        .med-doc-table .th-c, .med-doc-table .td-c { text-align: center; }
        .med-doc-table .th-r, .med-doc-table .td-r { text-align: right; }

        .med-name {
          font-weight: 700;
          color: #1a202c;
          font-size: 13px;
        }
        .med-comp {
          font-size: 11px;
          color: #4a5568;
          margin-top: 2px;
        }
        .med-note {
          font-size: 11px;
          color: #4a5568;
          font-style: italic;
          margin-top: 1px;
        }

        .med-doc-pay-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid #e2e8f0;
          font-size: 12.5px;
        }
        .med-doc-pay-left {
          flex: 1;
        }
        .med-doc-pay-lbl {
          font-size: 11px;
          font-weight: 700;
          color: #4a5568;
          text-transform: uppercase;
        }
        .med-doc-pay-txns {
          margin-top: 6px;
          font-size: 11.5px;
          color: #4a5568;
        }
        .med-doc-pay-right {
          width: 230px;
        }
        .med-doc-tot-line {
          display: flex;
          justify-content: space-between;
          padding: 2px 0;
          font-size: 12px;
          color: #4a5568;
        }
        .med-doc-tot-line.bold {
          font-weight: 700;
          font-size: 13.5px;
          color: #1a202c;
          border-top: 1px solid #cbd5e0;
          margin-top: 3px;
          padding-top: 4px;
        }
        .med-doc-tot-line.due {
          color: #c53030;
          font-weight: 700;
          font-size: 13px;
        }

        .med-doc-advice {
          margin-bottom: 10px;
          font-size: 12px;
          line-height: 1.5;
        }
        .med-doc-sec-title {
          font-weight: 800;
          text-transform: uppercase;
          font-size: 11px;
          letter-spacing: 0.04em;
          color: #1a202c;
          margin-bottom: 2px;
        }
        .med-doc-sec-body {
          white-space: pre-wrap;
          color: #2d3748;
        }

        .med-doc-followup {
          margin-bottom: 16px;
          font-size: 12.5px;
          color: #1a202c;
        }

        .med-doc-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 24px;
          padding-top: 8px;
        }
        .med-doc-doc-info {
          font-size: 12.5px;
        }
        .med-doc-doc-name {
          font-weight: 700;
          font-size: 14px;
          color: #1a202c;
        }
        .med-doc-doc-phone {
          font-size: 12px;
          color: #4a5568;
          margin-top: 2px;
        }
        .med-doc-sign-box {
          text-align: center;
          width: 200px;
        }
        .med-doc-sign-line {
          border-top: 1px solid #718096;
          margin-bottom: 5px;
        }
        .med-doc-sign-lbl {
          font-size: 11px;
          font-weight: 600;
          color: #4a5568;
        }
      `}</style>
      <div className="letterhead-sheet">
        {/* 1. Patient Information Section */}
        <div className="med-doc-patient">
          <div className="med-doc-grid">
            <div className="med-doc-field">
              <span className="med-doc-lbl">Patient:</span>
              <span className="med-doc-val">{bill.patient_name || '—'}</span>
            </div>
            <div className="med-doc-field">
              <span className="med-doc-lbl">UHID:</span>
              <span className="med-doc-val">{bill.uhid || '—'}</span>
            </div>
            <div className="med-doc-field">
              <span className="med-doc-lbl">Bill No:</span>
              <span className="med-doc-val" style={{ fontFamily: 'Consolas, monospace' }}>{bill.bill_no}</span>
            </div>
            <div className="med-doc-field">
              <span className="med-doc-lbl">Age / Sex:</span>
              <span className="med-doc-val">{ageSex}</span>
            </div>
            <div className="med-doc-field">
              <span className="med-doc-lbl">Mobile:</span>
              <span className="med-doc-val">{bill.patient_mobile || '—'}</span>
            </div>
            <div className="med-doc-field">
              <span className="med-doc-lbl">Date & Time:</span>
              <span className="med-doc-val">{fmtDateTime12h(bill.time)}</span>
            </div>
          </div>
        </div>

        {/* 2. Diagnosis Section */}
        {bill.diagnosis && (
          <div className="med-doc-diag">
            <span className="med-doc-diag-lbl">DIAGNOSIS:</span>
            <span className="med-doc-diag-val">{bill.diagnosis}</span>
          </div>
        )}

        {/* 3. Medicine / Prescription Table */}
        <table className="med-doc-table">
          <thead>
            <tr>
              <th style={{ width: '5%' }} className="th-c">#</th>
              <th style={{ width: '34%' }}>Medicine</th>
              <th style={{ width: '14%' }} className="th-c">Dosage</th>
              <th style={{ width: '25%' }}>Timing - Frequency - Duration</th>
              <th style={{ width: '8%' }} className="th-c">Qty</th>
              <th style={{ width: '7%' }} className="th-r">Rate</th>
              <th style={{ width: '7%' }} className="th-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => {
              const timingFreqDur = [it.timing, it.frequency, it.duration].filter(Boolean).join(' - ');
              return (
                <tr key={it.id || idx}>
                  <td className="td-c">{idx + 1}</td>
                  <td>
                    <div className="med-name">{it.name}</div>
                    {it.composition && <div className="med-comp">Composition: {it.composition}</div>}
                    {it.notes && <div className="med-note">Note: {it.notes}</div>}
                  </td>
                  <td className="td-c">{it.dosage || '—'}</td>
                  <td>{timingFreqDur || '—'}</td>
                  <td className="td-c">{fmtQty(it.qty)}{it.unit && it.unit !== 'service' ? ' ' + it.unit : ''}</td>
                  <td className="td-r">{money(it.price, s.currency)}</td>
                  <td className="td-r" style={{ fontWeight: 600 }}>{money(it.amount != null ? it.amount : it.qty * (it.price || 0), s.currency)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* 4. Payment Information (Clean & Minimal) */}
        <div className="med-doc-pay-row">
          <div className="med-doc-pay-left">
            <div>
              <span className="med-doc-pay-lbl">Payment Method:</span>{' '}
              <b>{payMethodDisplay}</b>
              <span style={{ marginLeft: '14px' }}>
                <span className="med-doc-pay-lbl">Status:</span>{' '}
                <b style={{ color: bill.payment_status === 'PAID' ? '#22543d' : '#7b341e' }}>{paymentStatus}</b>
              </span>
            </div>
            {paidRows.length > 0 && (
              <div className="med-doc-pay-txns">
                {paidRows.map((p, i) => (
                  <div key={p.id || i}>• {p.method}: <b>{money(p.amount, s.currency)}</b> on {fmtDate(p.at)}</div>
                ))}
              </div>
            )}
            {bill.cancel_reason && (
              <div style={{ marginTop: '6px', color: '#c53030', fontWeight: 600, fontSize: '11.5px' }}>
                Cancellation Reason: {bill.cancel_reason}
              </div>
            )}
          </div>
          <div className="med-doc-pay-right">
            <div className="med-doc-tot-line">
              <span>Subtotal</span>
              <span>{money(bill.subtotal, s.currency)}</span>
            </div>
            {Number(bill.discount) > 0 && (
              <div className="med-doc-tot-line" style={{ color: '#2b6cb0' }}>
                <span>Discount</span>
                <span>− {money(bill.discount, s.currency)}</span>
              </div>
            )}
            <div className="med-doc-tot-line bold">
              <span>Total Amount</span>
              <span>{money(bill.total, s.currency)}</span>
            </div>
            <div className="med-doc-tot-line">
              <span>Paid Amount</span>
              <span>{money(bill.paid || 0, s.currency)}</span>
            </div>
            {Math.max(0, bill.total - (bill.paid || 0)) > 0.005 && (
              <div className="med-doc-tot-line due">
                <span>Balance Due</span>
                <span>{money(Math.max(0, bill.total - (bill.paid || 0)), s.currency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* 5. Advice / Instructions Section */}
        {bill.advice && (
          <div className="med-doc-advice">
            <div className="med-doc-sec-title">Advice / Instructions:</div>
            <div className="med-doc-sec-body">{bill.advice}</div>
          </div>
        )}

        {/* 6. Next Visit / Follow-up */}
        {bill.next_visit && (
          <div className="med-doc-followup">
            <span className="med-doc-sec-title">Next Visit / Follow-up:</span>{' '}
            <b>{toDDMMYYYY(bill.next_visit) || bill.next_visit}</b>
          </div>
        )}

        {/* 7. Consulting Doctor & Signature Section */}
        <div className="med-doc-footer">
          <div className="med-doc-doc-info">
            <div style={{ fontSize: '10.5px', textTransform: 'uppercase', color: '#718096', fontWeight: 700, letterSpacing: '0.04em' }}>Consulting Doctor</div>
            <div className="med-doc-doc-name">{docName}</div>
            <div className="med-doc-doc-phone">Phone: <b>{docPhone}</b></div>
          </div>
          <div className="med-doc-sign-box">
            <div className="med-doc-sign-line" />
            <div className="med-doc-sign-lbl">Authorized Signatory</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function downloadReceipt(bill, items = [], payments = [], s = {}) {
  const paidRows = (payments || []).filter((p) => p.kind === 'payment');
  const paymentStatus = { PAID: 'Paid', PARTIAL: 'Partially Paid', PENDING: 'Pending', CANCELLED: 'Cancelled' }[bill.payment_status] || bill.payment_status;
  const payMethodDisplay = paidRows.length > 0
    ? [...new Set(paidRows.map((p) => p.method))].join(', ')
    : (bill.payment_method || (bill.payment_status === 'PAID' ? 'Cash' : 'Pending'));

  const docName = bill.doctor_name || s.doctor_name || 'Dr. Mit Nayak';
  const docPhone = bill.doctor_phone || s.doctor_phone || '9913974000';

  const sym = s.currency || '₹';
  const fmtM = (v) => `${sym} ${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const ageStr = bill.patient_age != null
    ? (String(bill.patient_age).includes('Y') ? bill.patient_age : `${bill.patient_age} Y`)
    : '';
  const ageSex = [ageStr, bill.patient_gender].filter(Boolean).join(' / ') || '—';

  const itemsRows = items.map((it, idx) => {
    const timingFreqDur = [it.timing, it.frequency, it.duration].filter(Boolean).join(' - ');
    return `
      <tr>
        <td style="text-align: center; padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${idx + 1}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight: 700; color: #1a202c; font-size: 13px;">${it.name || ''}</div>
          ${it.composition ? `<div style="font-size: 11px; color: #4a5568; margin-top: 2px;">Composition: ${it.composition}</div>` : ''}
          ${it.notes ? `<div style="font-size: 11px; color: #4a5568; font-style: italic; margin-top: 1px;">Note: ${it.notes}</div>` : ''}
        </td>
        <td style="text-align: center; padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${it.dosage || '—'}</td>
        <td style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${timingFreqDur || '—'}</td>
        <td style="text-align: center; padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${fmtQty(it.qty)}${it.unit && it.unit !== 'service' ? ' ' + it.unit : ''}</td>
        <td style="text-align: right; padding: 6px 8px; border-bottom: 1px solid #e2e8f0;">${fmtM(it.price)}</td>
        <td style="text-align: right; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${fmtM(it.amount != null ? it.amount : it.qty * (it.price || 0))}</td>
      </tr>
    `;
  }).join('');

  const paymentsRows = paidRows.map((p) => `
    <div>• ${p.method}: <b>${fmtM(p.amount)}</b> on ${fmtDate(p.at)}</div>
  `).join('');

  const nextVisitDisplay = bill.next_visit ? (toDDMMYYYY(bill.next_visit) || bill.next_visit) : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Medical Bill - ${bill.bill_no}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    body {
      margin: 0;
      padding: 0;
      background: #f0f2f5;
      font-family: Inter, system-ui, -apple-system, sans-serif;
      color: #1a202c;
    }
    .no-print {
      text-align: center;
      padding: 14px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
    }
    .btn-print {
      background: #0b1f35;
      color: #ffffff;
      border: none;
      padding: 9px 20px;
      font-size: 13.5px;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
    }
    .sheet-wrap {
      display: flex;
      justify-content: center;
      padding: 24px 0;
    }
    .letterhead-sheet {
      width: 210mm;
      min-height: 297mm;
      box-sizing: border-box;
      padding-top: 52mm;
      padding-bottom: 38mm;
      padding-left: 20mm;
      padding-right: 20mm;
      background: #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      font-size: 13px;
      line-height: 1.45;
      page-break-after: avoid !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    .med-doc-patient {
      border-top: 1.5px solid #2d3748;
      border-bottom: 1.5px solid #2d3748;
      padding: 8px 0;
      margin-bottom: 10px;
      font-size: 12.5px;
      line-height: 1.5;
    }
    .med-doc-grid {
      display: grid;
      grid-template-columns: 1.1fr 1fr 1.1fr;
      row-gap: 5px;
      column-gap: 16px;
    }
    .med-doc-field {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .med-doc-lbl {
      font-size: 10.5px;
      font-weight: 700;
      color: #4a5568;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      white-space: nowrap;
    }
    .med-doc-val {
      font-size: 13px;
      font-weight: 600;
      color: #1a202c;
    }
    .med-doc-diag {
      margin-bottom: 12px;
      padding: 4px 0 6px 0;
      border-bottom: 1px dashed #cbd5e0;
      font-size: 12.5px;
      line-height: 1.4;
    }
    .med-doc-diag-lbl {
      font-weight: 800;
      color: #1a202c;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 11.5px;
      margin-right: 6px;
    }
    .med-doc-diag-val {
      font-weight: 700;
      color: #1a202c;
      text-transform: uppercase;
    }
    .med-doc-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 14px;
      font-size: 12.5px;
    }
    .med-doc-table th {
      border-top: 1.5px solid #2d3748;
      border-bottom: 1.5px solid #2d3748;
      padding: 6px 8px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #1a202c;
      background: #f8fafc;
      text-align: left;
    }
    .med-doc-table td {
      border-bottom: 1px solid #e2e8f0;
      padding: 6px 8px;
      color: #2d3748;
      vertical-align: top;
    }
    .med-doc-pay-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 12.5px;
    }
    .med-doc-pay-left { flex: 1; }
    .med-doc-pay-lbl {
      font-size: 11px;
      font-weight: 700;
      color: #4a5568;
      text-transform: uppercase;
    }
    .med-doc-pay-txns {
      margin-top: 6px;
      font-size: 11.5px;
      color: #4a5568;
    }
    .med-doc-pay-right { width: 230px; }
    .med-doc-tot-line {
      display: flex;
      justify-content: space-between;
      padding: 2px 0;
      font-size: 12px;
      color: #4a5568;
    }
    .med-doc-tot-line.bold {
      font-weight: 700;
      font-size: 13.5px;
      color: #1a202c;
      border-top: 1px solid #cbd5e0;
      margin-top: 3px;
      padding-top: 4px;
    }
    .med-doc-tot-line.due {
      color: #c53030;
      font-weight: 700;
      font-size: 13px;
    }
    .med-doc-advice {
      margin-bottom: 10px;
      font-size: 12px;
      line-height: 1.5;
    }
    .med-doc-sec-title {
      font-weight: 800;
      text-transform: uppercase;
      font-size: 11px;
      letter-spacing: 0.04em;
      color: #1a202c;
      margin-bottom: 2px;
    }
    .med-doc-sec-body {
      white-space: pre-wrap;
      color: #2d3748;
    }
    .med-doc-followup {
      margin-bottom: 16px;
      font-size: 12.5px;
      color: #1a202c;
    }
    .med-doc-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 24px;
      padding-top: 8px;
    }
    .med-doc-doc-info { font-size: 12.5px; }
    .med-doc-doc-name {
      font-weight: 700;
      font-size: 14px;
      color: #1a202c;
    }
    .med-doc-doc-phone {
      font-size: 12px;
      color: #4a5568;
      margin-top: 2px;
    }
    .med-doc-sign-box {
      text-align: center;
      width: 200px;
    }
    .med-doc-sign-line {
      border-top: 1px solid #718096;
      margin-bottom: 5px;
    }
    .med-doc-sign-lbl {
      font-size: 11px;
      font-weight: 600;
      color: #4a5568;
    }
    @media print {
      body { background: #fff; }
      .no-print { display: none !important; }
      .sheet-wrap { padding: 0; }
      .letterhead-sheet { box-shadow: none; width: 100%; }
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button class="btn-print" onclick="window.print()">Print Receipt</button>
  </div>
  <div class="sheet-wrap">
    <div class="letterhead-sheet">
      <!-- 1. Patient Information Section -->
      <div class="med-doc-patient">
        <div class="med-doc-grid">
          <div class="med-doc-field">
            <span class="med-doc-lbl">Patient:</span>
            <span class="med-doc-val">${bill.patient_name || '—'}</span>
          </div>
          <div class="med-doc-field">
            <span class="med-doc-lbl">UHID:</span>
            <span class="med-doc-val">${bill.uhid || '—'}</span>
          </div>
          <div class="med-doc-field">
            <span class="med-doc-lbl">Bill No:</span>
            <span class="med-doc-val" style="font-family: Consolas, monospace;">${bill.bill_no}</span>
          </div>
          <div class="med-doc-field">
            <span class="med-doc-lbl">Age / Sex:</span>
            <span class="med-doc-val">${ageSex}</span>
          </div>
          <div class="med-doc-field">
            <span class="med-doc-lbl">Mobile:</span>
            <span class="med-doc-val">${bill.patient_mobile || '—'}</span>
          </div>
          <div class="med-doc-field">
            <span class="med-doc-lbl">Date & Time:</span>
            <span class="med-doc-val">${fmtDateTime12h(bill.time)}</span>
          </div>
        </div>
      </div>

      <!-- 2. Diagnosis Section -->
      ${bill.diagnosis ? `
        <div class="med-doc-diag">
          <span class="med-doc-diag-lbl">DIAGNOSIS:</span>
          <span class="med-doc-diag-val">${bill.diagnosis}</span>
        </div>
      ` : ''}

      <!-- 3. Medicine / Prescription Table -->
      <table class="med-doc-table">
        <thead>
          <tr>
            <th style="width: 5%; text-align: center;">#</th>
            <th style="width: 34%;">Medicine</th>
            <th style="width: 14%; text-align: center;">Dosage</th>
            <th style="width: 25%;">Timing - Frequency - Duration</th>
            <th style="width: 8%; text-align: center;">Qty</th>
            <th style="width: 7%; text-align: right;">Rate</th>
            <th style="width: 7%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <!-- 4. Payment Information (Clean & Minimal) -->
      <div class="med-doc-pay-row">
        <div class="med-doc-pay-left">
          <div>
            <span class="med-doc-pay-lbl">Payment Method:</span> <b>${payMethodDisplay}</b>
            <span style="margin-left: 14px;">
              <span class="med-doc-pay-lbl">Status:</span>
              <b style="color: ${bill.payment_status === 'PAID' ? '#22543d' : '#7b341e'};">${paymentStatus}</b>
            </span>
          </div>
          ${paidRows.length > 0 ? `
            <div class="med-doc-pay-txns">
              ${paymentsRows}
            </div>
          ` : ''}
          ${bill.cancel_reason ? `
            <div style="margin-top: 6px; color: #c53030; font-weight: 600; font-size: 11.5px;">
              Cancellation Reason: ${bill.cancel_reason}
            </div>
          ` : ''}
        </div>
        <div class="med-doc-pay-right">
          <div class="med-doc-tot-line">
            <span>Subtotal</span>
            <span>${fmtM(bill.subtotal)}</span>
          </div>
          ${Number(bill.discount) > 0 ? `
            <div class="med-doc-tot-line" style="color: #2b6cb0;">
              <span>Discount</span>
              <span>− ${fmtM(bill.discount)}</span>
            </div>
          ` : ''}
          <div class="med-doc-tot-line bold">
            <span>Total Amount</span>
            <span>${fmtM(bill.total)}</span>
          </div>
          <div class="med-doc-tot-line">
            <span>Paid Amount</span>
            <span>${fmtM(bill.paid || 0)}</span>
          </div>
          ${Math.max(0, bill.total - (bill.paid || 0)) > 0.005 ? `
            <div class="med-doc-tot-line due">
              <span>Balance Due</span>
              <span>${fmtM(Math.max(0, bill.total - (bill.paid || 0)))}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- 5. Advice / Instructions Section -->
      ${bill.advice ? `
        <div class="med-doc-advice">
          <div class="med-doc-sec-title">Advice / Instructions:</div>
          <div class="med-doc-sec-body">${bill.advice}</div>
        </div>
      ` : ''}

      <!-- 6. Next Visit / Follow-up -->
      ${bill.next_visit ? `
        <div class="med-doc-followup">
          <span class="med-doc-sec-title">Next Visit / Follow-up:</span> <b>${nextVisitDisplay}</b>
        </div>
      ` : ''}

      <!-- 7. Consulting Doctor & Signature Section -->
      <div class="med-doc-footer">
        <div class="med-doc-doc-info">
          <div style="font-size: 10.5px; text-transform: uppercase; color: #718096; font-weight: 700; letter-spacing: 0.04em;">Consulting Doctor</div>
          <div class="med-doc-doc-name">${docName}</div>
          <div class="med-doc-doc-phone">Phone: <b>${docPhone}</b></div>
        </div>
        <div class="med-doc-sign-box">
          <div class="med-doc-sign-line"></div>
          <div class="med-doc-sign-lbl">Authorized Signatory</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  // Download trigger
  const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bill-${bill.bill_no || 'receipt'}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printPrescription(pr, patient) {
  const s = pr.settings;
  const age = patient ? ageLabel(patient) : '';
  const sex = patient ? patient.gender || '' : '';
  printNode(
    <div className="print-job a4">
      <style>{`@page { size: A4; margin: 0 !important; } .prx { padding: 12mm 14mm; box-sizing: border-box; font-family: Inter, system-ui, sans-serif; color: #111; font-size: 12.5px; }`}</style>
      <div className="prx">
        <div className="prx-head">
          <div className="prx-brand">
            <Logo size={54} src={s.logo} />
            <div>
              <div className="prx-clinic">{s.clinic_name}</div>
              <div className="prx-addr">{s.address}</div>
              <div className="prx-phone">Ph: {s.phone}</div>
            </div>
          </div>
          <div className="prx-doc">
            <div className="prx-dname">{s.doctor_name}</div>
            <div className="prx-dqual">{s.doctor_qual}</div>
            <div className="prx-drole">{s.doctor_role}</div>
          </div>
        </div>
        <div className="prx-pat">
          <span><b>Patient:</b> {patient?.name || '—'} &nbsp; <b>Age/Sex:</b> {age} / {sex}</span>
          <span><b>UHID:</b> {pr.uhid}</span>
          <span><b>Date:</b> {fmtDate(pr.time)}</span>
        </div>
        {pr.diagnosis && <div className="prx-diag"><b>Diagnosis:</b> {pr.diagnosis}</div>}
        <div className="prx-rx">℞</div>
        <table className="prx-table">
          <thead>
            <tr><th style={{ width: '30%' }}>Medicine</th><th style={{ width: '16%' }}>Dosage</th><th style={{ width: '20%' }}>Frequency</th><th style={{ width: '14%' }}>Duration</th><th>Instructions</th></tr>
          </thead>
          <tbody>
            {(pr.items || []).map((it, i) => (
              <tr key={it.id}>
                <td><b>{i + 1}.</b> {it.name}</td>
                <td>{it.dosage || '—'}</td>
                <td>{it.frequency || '—'}</td>
                <td>{it.duration || '—'}</td>
                <td>{it.instruction || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pr.advice && <div className="prx-advice"><b>Advice:</b> {pr.advice}</div>}
        {pr.notes && <div className="prx-notes"><b>Notes:</b> {pr.notes}</div>}
        <div className="prx-sign">
          <div className="prx-signline" />
          <div>{s.doctor_name}<br /><span className="prx-signqual">{s.doctor_qual}</span></div>
        </div>
        <div className="prx-foot">{s.receipt_footer || ''} · {s.phone}</div>
      </div>
    </div>
  );
}

export function printReport({ title, subtitle, columns, rows, totals, s, settings }) {
  const conf = s || settings || {};
  printNode(
    <div className="print-job a4">
      <style>{`@page { size: A4 landscape; margin: 0 !important; } .rpt { padding: 12mm 14mm; box-sizing: border-box; font-family: Inter, system-ui, sans-serif; color: #111; font-size: 11px; }`}</style>
      <div className="rpt">
        <div className="rpt-head">
          <div>
            <div className="rpt-clinic">{conf?.clinic_name || 'HEEVA CLINIC'}</div>
            <div className="rpt-title">{title}</div>
            {subtitle && <div className="rpt-sub">{subtitle}</div>}
          </div>
          <div className="rpt-date">Generated {fmtDateTime(new Date().toISOString())}</div>
        </div>
        <table className="rpt-table">
          <thead>
            <tr>{columns.map((c) => <th key={c.key} className={c.align === 'right' ? 'th-right' : ''}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {(rows || []).map((r, i) => (
              <tr key={i}>{columns.map((c) => <td key={c.key} className={c.align === 'right' ? 'th-right' : ''}>{c.render ? c.render(r) : (r[c.key] ?? '—')}</td>)}</tr>
            ))}
            {totals && (
              <tr className="rpt-total">{columns.map((c, i) => <td key={c.key} className={c.align === 'right' ? 'th-right' : ''}>{i === 0 ? 'TOTAL' : (totals[c.key] != null ? totals[c.key] : '')}</td>)}
            </tr>
            )}
          </tbody>
        </table>
        <div className="rpt-foot">{s?.receipt_footer || ''} · {s?.phone || ''}</div>
      </div>
    </div>
  );
}

export function printPatientCard(p, s) {
  return printNode(
    <div className="print-job a4">
      <style>{`@page { size: A4; margin: 0 !important; } .pcc { padding: 16mm; box-sizing: border-box; font-family: Inter, system-ui, sans-serif; color: #111; }`}</style>
      <div className="pcc">
        <div className="pcc-card">
          <div className="pcc-top">
            <div className="pcc-brand">
              <Logo size={40} src={s.logo} />
              <div>
                <div className="pcc-clinic">{s.clinic_name}</div>
                <div className="pcc-tag">{s.tagline}</div>
              </div>
            </div>
            <div className="pcc-doctor">{s.doctor_name}<br /><span className="pcc-qual">{s.doctor_qual}</span></div>
          </div>
          <div className="pcc-body">
            <div className="pcc-name">{p.name}</div>
            <div className="pcc-uhid">{p.uhid}</div>
            <div className="pcc-grid">
              <div><span>Age / Sex</span><b>{p.age != null ? `${p.age} Y` : ageLabel(p)} / {p.gender || '—'}</b></div>
              <div><span>Marital Status</span><b>{p.marital_status || 'Single'}</b></div>
              <div><span>Blood Group</span><b>{p.blood_group || '—'}</b></div>
              <div><span>Mobile</span><b>{p.mobile || '—'}</b></div>
              <div><span>Allergies</span><b>{p.allergies || 'None recorded'}</b></div>
              <div><span>Registered</span><b>{fmtDate(p.reg_date || p.created_at)}</b></div>
            </div>
          </div>
          <div className="pcc-foot">
            <div className="pcc-contact">{s.address}<br />Phone: {s.phone}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
