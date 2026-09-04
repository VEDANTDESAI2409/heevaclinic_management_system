// ─── HEEVA CLINIC — print documents (thermal receipts, A4, prescription) ───
import React from 'react';
import { Logo } from '../components/ui';
import { fmtDate, fmtDateTime, fmtMoney, fmtQty, ageLabel } from '../utils';

// Bridge: PrintProvider registers its setter so any module can trigger a print.
let _printFn = null;
export function registerPrinter(fn) { _printFn = fn; }
const printNode = (node) => { if (_printFn) _printFn(node); };

const money = (v, sym = '₹') => fmtMoney(v, sym);

export function printInvoiceA4(bill, items, payments, s) {
  const paidRows = payments.filter((p) => p.kind === 'payment');
  const paymentStatus = { PAID: 'Paid', PARTIAL: 'Partially Paid', PENDING: 'Pending', CANCELLED: 'Cancelled' }[bill.payment_status] || bill.payment_status;
  printNode(
    <div className="print-job a4">
      <style>{`@page { size: A4 landscape; margin: 0; } .a4-sheet { width: 297mm; height: 210mm; display: flex; flex-direction: row; font-family: Inter, system-ui, sans-serif; color: #16232f; } .a4-copy { width: 50%; height: 210mm; padding: 10mm 8mm; overflow: hidden; position: relative; } .a4-copy + .a4-copy { border-left: 0.3mm dashed #8994a3; } .a4-copy + .a4-copy::before { content: 'CUT HERE'; position: absolute; top: 50%; left: -3.5mm; transform: translate(-50%, -50%) rotate(-90deg); background: #fff; padding: 0 4mm; color: #8994a3; font-size: 8px; letter-spacing: 1px; } .a4-doc { width: 100%; font-size: 8px; line-height: 1.15; } .a4-head { margin-bottom: 3mm; } .a4-brand img { width: 12mm; height: 12mm; } .a4-clinic { font-size: 14px; } .a4-doctype { font-size: 8px; } .a4-parties { margin: 2mm 0; } .a4-pbox { padding: 5px 6px; font-size: 8px; } .a4-pname { font-size: 10px; } .a4-table { margin-top: 2mm; font-size: 8px; } .a4-table th { padding: 4px 5px; font-size: 7px; } .a4-table td { padding: 4px 5px; } .a4-totals { width: 135px; padding: 6px 8px; } .a4-totals .kv { font-size: 8px; } .a4-totals .kv-total b { font-size: 11px; } .a4-sign { margin-top: 12mm; font-size: 8px; }`}</style>
      <div className="a4-sheet">
        {[['CLINIC COPY'], ['PATIENT COPY']].map(([copyLabel]) => <div className="a4-copy" key={copyLabel}>
        <div className="a4-doc">
        <div className="a4-head">
          <div className="a4-brand">
            <Logo size={52} src={s.logo} />
            <div>
              <div className="a4-clinic">{s.clinic_name}</div>
              <div className="a4-tag">{s.tagline}</div>
              <div className="a4-addr">{s.address}</div>
              <div className="a4-phone">Ph: {s.phone} {s.email ? ` · ${s.email}` : ''}</div>
            </div>
          </div>
          <div className="a4-billbox">
            <div className="a4-doctype">PAYMENT RECEIPT · {copyLabel}</div>
            <div className="a4-docno">{bill.bill_no}</div>
            <div>{fmtDateTime(bill.time)}</div>
            {bill.status === 'CANCELLED' && <div className="a4-cancelstamp">CANCELLED</div>}
          </div>
        </div>

        <div className="a4-parties">
          <div className="a4-pbox">
            <div className="a4-plabel">Billed To</div>
            <div className="a4-pname">{bill.patient_name}</div>
            <div>UHID: <b>{bill.uhid}</b></div>
            {(bill.patient_age || bill.patient_gender) && <div>Age / Gender: <b>{[bill.patient_age, bill.patient_gender].filter(Boolean).join(' / ')}</b></div>}
            {bill.patient_mobile && <div>Mobile: <b>{bill.patient_mobile}</b></div>}
          </div>
          <div className="a4-pbox">
            <div className="a4-plabel">Clinician</div>
            <div className="a4-pname">{s.doctor_name}</div>
            <div>{s.doctor_qual}</div>
            <div>{s.doctor_role}</div>
          </div>
          <div className="a4-pbox">
            <div className="a4-plabel">Payment Status</div>
            <div className="a4-pname">{paymentStatus}</div>
            <div>Paid: <b>{money(bill.paid, s.currency)}</b> · Balance: <b>{money(bill.total - (bill.paid || 0), s.currency)}</b></div>
          </div>
        </div>

        <table className="a4-table">
          <thead>
            <tr><th style={{ width: '6%' }}>Sr.</th><th style={{ width: '42%' }}>Item Name</th><th>Type</th><th className="th-right">Qty</th><th className="th-right">Unit Price</th><th className="th-right">Total</th></tr>
          </thead>
          <tbody>
            {items.map((it, index) => (
              <tr key={it.id}>
                <td>{index + 1}</td>
                <td>{it.name}{it.batch_no ? <span className="a4-sub"> — batch {it.batch_no}</span> : ''}</td>
                <td className="a4-cap">{it.item_type}</td>
                <td className="th-right">{fmtQty(it.qty)}</td>
                <td className="th-right">{money(it.price, s.currency)}</td>
                <td className="th-right">{money(it.amount, s.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="a4-totalrow">
          <div className="a4-note">
            {bill.cancel_reason && <p className="a4-cancel">Reason for cancellation: {bill.cancel_reason}</p>}
            <p className="a4-thanks">{s.receipt_footer || 'Thank you. Get well soon!'}</p>
            <p className="a4-contact">For enquiries contact {s.phone}</p>
          </div>
          <div className="a4-totals">
            <div className="kv"><span>Subtotal</span><b>{money(bill.subtotal, s.currency)}</b></div>
            <div className="kv"><span>Discount</span><b>− {money(bill.discount, s.currency)}</b></div>
            <div className="kv kv-total"><span>Total Amount</span><b>{money(bill.total, s.currency)}</b></div>
          </div>
        </div>

        {paidRows.length > 0 && (
          <div className="a4-payrow">
            {paidRows.map((p) => (
              <span key={p.id}>
                {p.method}: {money(p.amount, s.currency)} · {fmtDate(p.at)}
              </span>
            ))}
          </div>
        )}

        <div className="a4-sign"><div>Payment Method: {paidRows.map((p) => p.method).join(', ') || 'Pending'}</div><div>Thank You</div></div>
      </div>
      </div>)}
    </div>
    </div>
  );
}

export function printPrescription(pr, patient) {
  const s = pr.settings;
  const age = patient ? ageLabel(patient) : '';
  const sex = patient ? patient.gender || '' : '';
  printNode(
    <div className="print-job a4">
      <style>{`@page { size: A4; margin: 10mm; } .prx { font-family: Inter, system-ui, sans-serif; color: #111; font-size: 12.5px; }`}</style>
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

export function printReport({ title, subtitle, columns, rows, totals, s }) {
  printNode(
    <div className="print-job a4">
      <style>{`@page { size: A4 landscape; margin: 10mm; } .rpt { font-family: Inter, system-ui, sans-serif; color: #111; font-size: 11px; }`}</style>
      <div className="rpt">
        <div className="rpt-head">
          <div>
            <div className="rpt-clinic">{s?.clinic_name || 'HEEVA CLINIC'}</div>
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
      <style>{`@page { size: A4; margin: 15mm; } .pcc { font-family: Inter, system-ui, sans-serif; color: #111; }`}</style>
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
              <div><span>Age / Sex</span><b>{ageLabel(p)} / {p.gender || '—'}</b></div>
              <div><span>DOB</span><b>{fmtDate(p.dob)}</b></div>
              <div><span>Blood Group</span><b>{p.blood_group || '—'}</b></div>
              <div><span>Mobile</span><b>{p.mobile || '—'}</b></div>
              <div><span>Allergies</span><b>{p.allergies || 'None recorded'}</b></div>
              <div><span>Registered</span><b>{fmtDate(p.reg_date)}</b></div>
            </div>
          </div>
          <div className="pcc-foot">
            <span className="pcc-barcode" aria-hidden="true" />
            <div className="pcc-contact">{s.address}<br />Phone: {s.phone}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
