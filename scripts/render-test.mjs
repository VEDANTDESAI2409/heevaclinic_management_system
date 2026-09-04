// ─── HEEVA CLINIC — page render test (jsdom + real services + seeded DB) ───
// Renders EVERY route in a real DOM with seeded data and asserts the page
// produces meaningful output without throwing. Catches runtime errors the
// build cannot (bad hook usage, undefined access, wrong query, missing import).
// Run: npm run render
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

// ── DOM environment ─────────────────────────────────────────────────────────
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.SVGElement = dom.window.SVGElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.File = dom.window.File;
global.FileReader = dom.window.FileReader;
global.Blob = dom.window.Blob;
global.URL = dom.window.URL;
global.URL.createObjectURL = () => 'blob:fake';
global.URL.revokeObjectURL = () => {};
global.HTMLElement.prototype.scrollIntoView = () => {};
global.HTMLElement.prototype.attachEvent = () => {};
global.HTMLElement.prototype.detachEvent = () => {};
dom.window.matchMedia = dom.window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
global.matchMedia = dom.window.matchMedia;
global.IS_REACT_ACT_ENVIRONMENT = true;

// ── IndexedDB (before dexie loads) ─────────────────────────────────────────
await import('fake-indexeddb/auto');

// ── capture errors ──────────────────────────────────────────────────────────
const errors = [];
dom.window.addEventListener('error', (e) => errors.push('window.error: ' + (e.error && e.error.stack || e.message)));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + (e && e.stack || e)));
const origConsoleError = console.error.bind(console);
console.error = (...a) => {
  const s = a.join(' ');
  if (!/Warning:|act\(\)|useLayoutEffect|findDOMNode|non-boolean|Each child|validateDOMNesting|deprecated/i.test(s)) errors.push('console.error: ' + s.slice(0, 300));
  origConsoleError(...a);
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');
const { AppProvider } = await import('../src/context/AppContext.jsx');
const { PrintProvider } = await import('../src/context/PrintContext.jsx');
const App = (await import('../src/App.jsx')).default;
const db = (await import('../src/db.js')).default;
const patientService = await import('../src/services/patients.js');
const inventory = await import('../src/services/inventory.js');
const billing = await import('../src/services/billing.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const h = React.createElement;

let passed = 0;
const ok = (m) => { console.log('  ✓', m); passed++; };
const fail = (m) => { console.error('  ✗ FAIL:', m); process.exit(1); };

console.log('HEEVA CLINIC render test\n');

// prepare data
const user = { id: 'render-test-user' };
ok(`data layer ready — ${await db.patients.count()} patients, ${await db.bills.count()} bills`);
const patient = await patientService.registerPatient({ name: 'Render Test Patient', gender: 'Other', dob: '1990-01-01', mobile: '9000000002' }, user.id);
const medicine = await inventory.createMedicine({ name: 'Render Test Medicine', selling_price: 10 }, user.id);
await inventory.createBatch({ medicine_id: medicine.id, batch_no: 'RENDER-001', quantity: 20, expiry: '2099-12-31' }, user.id);
const service = await billing.createService({ name: 'Render Test Service', price: 25 }, user.id);
await billing.createBill({ patient_id: patient.id, items: [{ item_type: 'medicine', ref_id: medicine.id, qty: 1 }, { item_type: 'service', ref_id: service.id, qty: 1 }], payments: [] }, user.id);

async function renderRoute(path, expectText, waitMs = 600) {
  const rootEl = document.getElementById('root');
  rootEl.innerHTML = '';
  const before = errors.length;
  const root = createRoot(rootEl);
  root.render(
    h(AppProvider, null,
      h(PrintProvider, null,
        h(MemoryRouter, { initialEntries: [path] },
          h(App, null)
        )
      )
    )
  );
  await sleep(waitMs);
  const text = rootEl.textContent || '';
  const missing = errors.length > before;
  if (missing) {
    errors.slice(before).forEach((e) => console.log('    ✗ ' + e.split('\n')[0]));
  }
  const found = expectText.length ? expectText.every((t) => text.includes(t)) : text.length > 200;
  if (found && !missing) ok(`route ${path.padEnd(28)} → ${text.length} chars rendered`);
  else if (missing) { errors.push(`route ${path}: errors above`); throw new Error('route ' + path + ' threw'); }
  else { fail(`route ${path}: expected ${JSON.stringify(expectText)}, got "${text.slice(0, 120)}…"`); }
  root.unmount();
  return text;
}

const firstPatient = (await db.patients.toArray())[0];
const pid = firstPatient.id;
const bill = (await db.bills.where('status').equals('completed').first());

await renderRoute('/', ['Dashboard', 'Today'], 1200);
await renderRoute('/patients', ['Patients', 'UHID']);
await renderRoute(`/patients/${pid}`, [firstPatient.uhid, firstPatient.name]);
await renderRoute('/consultations', ['Consultations']);
await renderRoute('/appointments', ['Appointment']);
await renderRoute('/prescriptions', ['Prescription']);
await renderRoute('/billing', ['Billing', 'Patient']);
await renderRoute(`/billing?bill=${bill.id}`, ['BILL'], 900);
await renderRoute('/payments', ['Payments', 'Outstanding']);
await renderRoute('/medicines', ['Medicines']);
await renderRoute('/inventory', ['Inventory']);
await renderRoute('/returns', ['Return']);
await renderRoute('/expenses', ['Expense']);
await renderRoute('/reports', ['Report', 'Sales']);
await renderRoute('/alerts', ['Alerts', 'otification'.toLowerCase()]);
await renderRoute('/staff', ['Staff', 'Doctor']);
await renderRoute('/settings', ['Settings', 'Clinic Profile']);

console.log(`\n${passed} checks passed — every page renders.`);
process.exit(0);
