// ─── HEEVA CLINIC — print documents (thermal receipts, A4, prescription) ───
import React from 'react';
import { Logo } from '../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, ageLabel } from '../utils';

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

  printNode(
    <div className="print-job a4-letterhead-job">
      <style>{`
        @page { size: A4 portrait; margin: 0 !important; }
        .letterhead-sheet {
          width: 210mm;
          min-height: 297mm;
          box-sizing: border-box;
          padding-top: 48mm;
          padding-bottom: 35mm;
          padding-left: 20mm;
          padding-right: 20mm;
          font-family: Inter, system-ui, -apple-system, sans-serif;
          color: #1a202c;
          font-size: 13.5px;
          line-height: 1.45;
          background: #ffffff;
        }
        .lh-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #2d3748;
          padding-bottom: 12px;
          margin-bottom: 16px;
        }
        .lh-title-block h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.05em;
          color: #1a202c;
          text-transform: uppercase;
        }
        .lh-title-block .lh-subtitle {
          font-size: 12px;
          color: #718096;
          margin-top: 2px;
        }
        .lh-meta-block {
          text-align: right;
          font-size: 13px;
        }
        .lh-docno {
          font-family: Consolas, monospace;
          font-size: 16px;
          font-weight: 700;
          color: #2b6cb0;
        }
        .lh-date {
          color: #4a5568;
          margin-top: 3px;
        }
        .lh-status-badge {
          display: inline-block;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          padding: 2px 8px;
          border-radius: 4px;
          margin-top: 4px;
        }
        .lh-status-paid { background: #c6f6d5; color: #22543d; }
        .lh-status-partial { background: #feebc8; color: #7b341e; }
        .lh-status-pending { background: #edf2f7; color: #4a5568; }
        .lh-status-cancelled { background: #fed7d7; color: #742a2a; }

        .lh-patient-box {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 16px;
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px 16px;
          margin-bottom: 20px;
        }
        .lh-pat-col {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .lh-label {
          font-size: 10.5px;
          font-weight: 700;
          color: #718096;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .lh-val-name {
          font-size: 16px;
          font-weight: 700;
          color: #1a202c;
        }
        .lh-info-row {
          display: flex;
          gap: 16px;
          font-size: 13px;
          color: #2d3748;
          flex-wrap: wrap;
        }

        .lh-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 13.5px;
        }
        .lh-table th {
          background: #2d3748;
          color: #ffffff;
          font-weight: 700;
          text-transform: uppercase;
          font-size: 11.5px;
          letter-spacing: 0.04em;
          padding: 9px 10px;
          text-align: left;
        }
        .lh-table td {
          padding: 9px 10px;
          border-bottom: 1px solid #e2e8f0;
          color: #2d3748;
        }
        .lh-table .th-r, .lh-table .td-r { text-align: right; }
        .lh-table .th-c, .lh-table .td-c { text-align: center; }

        .lh-summary-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 24px;
          margin-bottom: 24px;
        }
        .lh-payment-info {
          flex: 1;
          background: #f7fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 12px 14px;
          font-size: 13px;
        }
        .lh-pay-method-pill {
          display: inline-block;
          font-weight: 700;
          background: #ebf8ff;
          color: #2b6cb0;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 13px;
          margin-left: 6px;
        }
        .lh-totals-box {
          width: 260px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          background: #ffffff;
          overflow: hidden;
        }
        .lh-tot-row {
          display: flex;
          justify-content: space-between;
          padding: 7px 12px;
          font-size: 13.5px;
          border-bottom: 1px solid #f0f4f8;
        }
        .lh-tot-row.grand {
          background: #edf2f7;
          border-top: 1px solid #cbd5e0;
          border-bottom: 1px solid #cbd5e0;
          font-weight: 800;
          font-size: 15.5px;
          color: #1a202c;
        }
        .lh-tot-row.paid { color: #22543d; font-weight: 600; }
        .lh-tot-row.bal { color: #c53030; font-weight: 700; }

        .lh-signature-area {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          margin-top: 36px;
          padding-top: 10px;
        }
        .lh-sign-box {
          text-align: center;
          width: 200px;
        }
        .lh-sign-line {
          border-top: 1px solid #718096;
          margin-bottom: 6px;
        }
        .lh-sign-text {
          font-size: 12px;
          color: #4a5568;
          font-weight: 600;
        }
      `}</style>
      <div className="letterhead-sheet">
        <div className="lh-header">
          <div className="lh-title-block">
            <h1>Payment Receipt</h1>
            <div className="lh-subtitle">Official Clinic Billing Receipt</div>
          </div>
          <div className="lh-meta-block">
            <div className="lh-docno">{bill.bill_no}</div>
            <div className="lh-date">{fmtDateTime(bill.time)}</div>
            <div>
              <span className={`lh-status-badge lh-status-${(bill.payment_status || '').toLowerCase()}`}>
                {paymentStatus}
              </span>
            </div>
            {bill.status === 'CANCELLED' && <div style={{ color: '#c53030', fontWeight: 800, marginTop: 4 }}>CANCELLED</div>}
          </div>
        </div>

        <div className="lh-patient-box">
          <div className="lh-pat-col">
            <span className="lh-label">Billed To</span>
            <span className="lh-val-name">{bill.patient_name}</span>
            <div className="lh-info-row">
              <span>UHID: <b>{bill.uhid}</b></span>
              {(bill.patient_age != null || bill.patient_gender) && (
                <span>Age / Sex: <b>{[bill.patient_age != null ? `${bill.patient_age} Y` : '', bill.patient_gender].filter(Boolean).join(' / ')}</b></span>
              )}
              {bill.patient_mobile && <span>Mobile: <b>{bill.patient_mobile}</b></span>}
            </div>
          </div>
          <div className="lh-pat-col">
            <span className="lh-label">Consulting Clinician</span>
            <span style={{ fontWeight: 700, fontSize: '15px', color: '#1a202c' }}>{docName}</span>
            <div style={{ fontSize: '12.5px', color: '#2d3748', marginTop: '2px' }}>Phone: <b>{docPhone}</b></div>
          </div>
        </div>

        <table className="lh-table">
          <thead>
            <tr>
              <th style={{ width: '8%' }} className="th-c">Sr.</th>
              <th style={{ width: '46%' }}>Item Description</th>
              <th style={{ width: '16%' }}>Type</th>
              <th style={{ width: '10%' }} className="th-r">Qty</th>
              <th style={{ width: '10%' }} className="th-r">Rate</th>
              <th style={{ width: '10%' }} className="th-r">Amount</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, idx) => (
              <tr key={it.id || idx}>
                <td className="td-c">{idx + 1}</td>
                <td><b style={{ color: '#1a202c' }}>{it.name}</b></td>
                <td style={{ textTransform: 'capitalize', color: '#4a5568' }}>{it.item_type}</td>
                <td className="td-r">{fmtQty(it.qty)}</td>
                <td className="td-r">{money(it.price, s.currency)}</td>
                <td className="td-r" style={{ fontWeight: 600 }}>{money(it.amount, s.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="lh-summary-row">
          <div className="lh-payment-info">
            <div style={{ marginBottom: 6 }}>
              <span className="lh-label">Payment Method:</span>
              <span className="lh-pay-method-pill">{payMethodDisplay}</span>
            </div>
            {paidRows.length > 0 && (
              <div style={{ marginTop: 8, fontSize: '12px', color: '#4a5568' }}>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>Payment Transactions:</div>
                {paidRows.map((p, i) => (
                  <div key={p.id || i} style={{ marginLeft: 6 }}>
                    • {p.method}: <b>{money(p.amount, s.currency)}</b> on {fmtDate(p.at)}
                  </div>
                ))}
              </div>
            )}
            {bill.cancel_reason && (
              <div style={{ marginTop: 8, color: '#c53030', fontWeight: 600, fontSize: '12px' }}>
                Cancellation Reason: {bill.cancel_reason}
              </div>
            )}
            <div style={{ marginTop: 10, fontSize: '12px', color: '#718096', fontStyle: 'italic' }}>
              Thank you for choosing our clinic. Get well soon!
            </div>
          </div>

          <div className="lh-totals-box">
            <div className="lh-tot-row">
              <span>Subtotal</span>
              <b>{money(bill.subtotal, s.currency)}</b>
            </div>
            {(Number(bill.discount) > 0) && (
              <div className="lh-tot-row" style={{ color: '#2b6cb0' }}>
                <span>Discount</span>
                <b>− {money(bill.discount, s.currency)}</b>
              </div>
            )}
            <div className="lh-tot-row grand">
              <span>Total Amount</span>
              <span>{money(bill.total, s.currency)}</span>
            </div>
            <div className="lh-tot-row paid">
              <span>Paid Amount</span>
              <b>{money(bill.paid || 0, s.currency)}</b>
            </div>
            <div className="lh-tot-row bal">
              <span>Balance Due</span>
              <b>{money(Math.max(0, bill.total - (bill.paid || 0)), s.currency)}</b>
            </div>
          </div>
        </div>

        <div className="lh-signature-area">
          <div style={{ fontSize: '12px', color: '#718096' }}>
            Receipt generated on {fmtDateTime(bill.time)}
          </div>
          <div className="lh-sign-box">
            <div className="lh-sign-line" />
            <div className="lh-sign-text">Authorized Signatory</div>
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

  const itemsRows = items.map((it, idx) => `
    <tr>
      <td style="text-align: center; padding: 9px 10px; border-bottom: 1px solid #e2e8f0;">${idx + 1}</td>
      <td style="padding: 9px 10px; border-bottom: 1px solid #e2e8f0;"><b style="color: #1a202c;">${it.name || ''}</b></td>
      <td style="padding: 9px 10px; border-bottom: 1px solid #e2e8f0; text-transform: capitalize; color: #4a5568;">${it.item_type || ''}</td>
      <td style="text-align: right; padding: 9px 10px; border-bottom: 1px solid #e2e8f0;">${it.qty || 1}</td>
      <td style="text-align: right; padding: 9px 10px; border-bottom: 1px solid #e2e8f0;">${fmtM(it.price)}</td>
      <td style="text-align: right; padding: 9px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600;">${fmtM(it.amount)}</td>
    </tr>
  `).join('');

  const paymentsRows = paidRows.map((p) => `
    <div style="margin-left: 6px;">• ${p.method}: <b>${fmtM(p.amount)}</b> on ${fmtDate(p.at)}</div>
  `).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Receipt - ${bill.bill_no}</title>
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
      padding: 16px;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
    }
    .btn-print {
      background: #0b1f35;
      color: #ffffff;
      border: none;
      padding: 10px 22px;
      font-size: 14px;
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
      padding-top: 48mm;
      padding-bottom: 35mm;
      padding-left: 20mm;
      padding-right: 20mm;
      background: #ffffff;
      box-shadow: 0 4px 12px rgba(0,0,0,0.08);
      font-size: 13.5px;
      line-height: 1.45;
    }
    .lh-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #2d3748;
      padding-bottom: 12px;
      margin-bottom: 16px;
    }
    .lh-title-block h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      letter-spacing: 0.05em;
      color: #1a202c;
      text-transform: uppercase;
    }
    .lh-meta-block {
      text-align: right;
    }
    .lh-docno {
      font-family: Consolas, monospace;
      font-size: 16px;
      font-weight: 700;
      color: #2b6cb0;
    }
    .lh-patient-box {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 16px;
      background: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 16px;
      margin-bottom: 20px;
    }
    .lh-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #718096;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .lh-val-name {
      font-size: 16px;
      font-weight: 700;
      color: #1a202c;
    }
    .lh-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13.5px;
    }
    .lh-table th {
      background: #2d3748;
      color: #ffffff;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11.5px;
      padding: 9px 10px;
      text-align: left;
    }
    .lh-summary-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      margin-bottom: 24px;
    }
    .lh-payment-info {
      flex: 1;
      background: #f7fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 12px 14px;
      font-size: 13px;
    }
    .lh-pay-method-pill {
      display: inline-block;
      font-weight: 700;
      background: #ebf8ff;
      color: #2b6cb0;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 13px;
      margin-left: 6px;
    }
    .lh-totals-box {
      width: 260px;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      background: #ffffff;
    }
    .lh-tot-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 12px;
      font-size: 13.5px;
      border-bottom: 1px solid #f0f4f8;
    }
    .lh-tot-row.grand {
      background: #edf2f7;
      border-top: 1px solid #cbd5e0;
      border-bottom: 1px solid #cbd5e0;
      font-weight: 800;
      font-size: 15.5px;
    }
    .lh-signature-area {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 36px;
    }
    .lh-sign-box {
      text-align: center;
      width: 200px;
    }
    .lh-sign-line {
      border-top: 1px solid #718096;
      margin-bottom: 6px;
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
      <div class="lh-header">
        <div class="lh-title-block">
          <h1>Payment Receipt</h1>
          <div style="font-size: 12px; color: #718096; margin-top: 2px;">Official Clinic Billing Receipt</div>
        </div>
        <div class="lh-meta-block">
          <div class="lh-docno">${bill.bill_no}</div>
          <div style="color: #4a5568; margin-top: 3px;">${fmtDateTime(bill.time)}</div>
          <div style="margin-top: 4px; font-weight: 700; color: #22543d;">${paymentStatus}</div>
        </div>
      </div>

      <div class="lh-patient-box">
        <div>
          <div class="lh-label">Billed To</div>
          <div class="lh-val-name">${bill.patient_name || 'Patient'}</div>
          <div style="display: flex; gap: 14px; margin-top: 4px; font-size: 13px; color: #2d3748;">
            <span>UHID: <b>${bill.uhid || '—'}</b></span>
            ${(bill.patient_age != null || bill.patient_gender) ? `<span>Age / Sex: <b>${[bill.patient_age != null ? `${bill.patient_age} Y` : '', bill.patient_gender].filter(Boolean).join(' / ')}</b></span>` : ''}
            ${bill.patient_mobile ? `<span>Mobile: <b>${bill.patient_mobile}</b></span>` : ''}
          </div>
        </div>
        <div>
          <div class="lh-label">Consulting Clinician</div>
          <div style="font-weight: 700; font-size: 15px; color: #1a202c;">${docName}</div>
          <div style="font-size: 12.5px; color: #2d3748; margin-top: 2px;">Phone: <b>${docPhone}</b></div>
        </div>
      </div>

      <table class="lh-table">
        <thead>
          <tr>
            <th style="width: 8%; text-align: center;">Sr.</th>
            <th style="width: 46%;">Item Description</th>
            <th style="width: 16%;">Type</th>
            <th style="width: 10%; text-align: right;">Qty</th>
            <th style="width: 10%; text-align: right;">Rate</th>
            <th style="width: 10%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsRows}
        </tbody>
      </table>

      <div class="lh-summary-row">
        <div class="lh-payment-info">
          <div>
            <span class="lh-label">Payment Method:</span>
            <span class="lh-pay-method-pill">${payMethodDisplay}</span>
          </div>
          ${paidRows.length > 0 ? `
            <div style="margin-top: 8px; font-size: 12px; color: #4a5568;">
              <div style="font-weight: 600; margin-bottom: 2px;">Payment Transactions:</div>
              ${paymentsRows}
            </div>
          ` : ''}
          <div style="margin-top: 10px; font-size: 12px; color: #718096; font-style: italic;">
            Thank you for choosing our clinic. Get well soon!
          </div>
        </div>

        <div class="lh-totals-box">
          <div class="lh-tot-row">
            <span>Subtotal</span>
            <b>${fmtM(bill.subtotal)}</b>
          </div>
          ${Number(bill.discount) > 0 ? `
            <div class="lh-tot-row" style="color: #2b6cb0;">
              <span>Discount</span>
              <b>− ${fmtM(bill.discount)}</b>
            </div>
          ` : ''}
          <div class="lh-tot-row grand">
            <span>Total Amount</span>
            <span>${fmtM(bill.total)}</span>
          </div>
          <div class="lh-tot-row" style="color: #22543d; font-weight: 600;">
            <span>Paid Amount</span>
            <b>${fmtM(bill.paid || 0)}</b>
          </div>
          <div class="lh-tot-row" style="color: #c53030; font-weight: 700;">
            <span>Balance Due</span>
            <b>${fmtM(Math.max(0, bill.total - (bill.paid || 0)))}</b>
          </div>
        </div>
      </div>

      <div class="lh-signature-area">
        <div style="font-size: 12px; color: #718096;">Receipt generated on ${fmtDateTime(bill.time)}</div>
        <div class="lh-sign-box">
          <div class="lh-sign-line"></div>
          <div style="font-size: 12px; color: #4a5568; font-weight: 600;">Authorized Signatory</div>
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
  a.download = `receipt-${bill.bill_no || 'bill'}.html`;
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
