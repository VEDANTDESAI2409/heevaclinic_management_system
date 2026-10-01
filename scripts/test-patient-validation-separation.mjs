// ─── HEEVA CLINIC — Patient Validation Separation Verification Suite ─────────
import 'fake-indexeddb/auto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.HTMLInputElement = dom.window.HTMLInputElement;
global.HTMLSelectElement = dom.window.HTMLSelectElement;
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;
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
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
dom.window.Element.prototype.attachEvent = () => {};
dom.window.Element.prototype.detachEvent = () => {};
dom.window.matchMedia = dom.window.matchMedia || ((q) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} }));
global.matchMedia = dom.window.matchMedia;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { MemoryRouter, Routes, Route } = await import('react-router-dom');

const { parseCSV } = await import('../src/utils/csvParser.js');
const { CSV_TEMPLATES } = await import('../src/utils/csvTemplates.js');
const { MODULE_REQUIRED_FIELDS } = await import('../src/utils/csvMapping.js');
const { validateCSVRows } = await import('../src/utils/csvValidation.js');

const { default: db } = await import('../src/db.js');
const { AppProvider } = await import('../src/context/AppContext.jsx');
const { PrintProvider } = await import('../src/context/PrintContext.jsx');
const { default: Patients } = await import('../src/pages/Patients.jsx');

let passed = 0;
let failed = 0;
const assert = (condition, msg) => {
  if (condition) {
    console.log('  ✓ PASS:', msg);
    passed++;
  } else {
    console.error('  ✗ FAIL:', msg);
    failed++;
  }
};

const setInput = (element, val) => {
  if (element instanceof dom.window.HTMLSelectElement || element.tagName === 'SELECT') {
    element.value = val;
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  } else {
    const proto = element.tagName === 'TEXTAREA'
      ? dom.window.HTMLTextAreaElement.prototype
      : dom.window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(element, val);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
};

console.log('===============================================================');
console.log('VERIFYING PATIENT CSV IMPORT vs MANUAL NEW PATIENT VALIDATION');
console.log('===============================================================\n');

// ── Check Template & Expected Columns Metadata ──
console.log('--- Template & Expected Columns Metadata ---');
const patientTemplate = CSV_TEMPLATES.patients;
assert(patientTemplate.columns.find((c) => c.key === 'name')?.required === true, 'CSV Template: name is marked required: true');
assert(patientTemplate.columns.find((c) => c.key === 'gender')?.required === true, 'CSV Template: gender is marked required: true');
assert(patientTemplate.columns.find((c) => c.key === 'age')?.required === false, 'CSV Template: age is marked required: false');
assert(patientTemplate.columns.find((c) => c.key === 'mobile')?.required === false, 'CSV Template: mobile is marked required: false');
assert(patientTemplate.columns.find((c) => c.key === 'date_time')?.required === false, 'CSV Template: date_time is marked required: false');
assert(patientTemplate.columns.find((c) => c.key === 'marital_status')?.required === false, 'CSV Template: marital_status is marked required: false');
assert(patientTemplate.columns.find((c) => c.key === 'blood_group')?.required === false, 'CSV Template: blood_group is marked required: false');
assert(patientTemplate.columns.find((c) => c.key === 'address')?.required === false, 'CSV Template: address is marked required: false');

assert(MODULE_REQUIRED_FIELDS.patients.length === 2, 'MODULE_REQUIRED_FIELDS.patients has exactly 2 required fields');
assert(MODULE_REQUIRED_FIELDS.patients.includes('name'), 'MODULE_REQUIRED_FIELDS.patients includes name');
assert(MODULE_REQUIRED_FIELDS.patients.includes('gender'), 'MODULE_REQUIRED_FIELDS.patients includes gender');
assert(!MODULE_REQUIRED_FIELDS.patients.includes('age'), 'MODULE_REQUIRED_FIELDS.patients DOES NOT include age');
assert(!MODULE_REQUIRED_FIELDS.patients.includes('mobile'), 'MODULE_REQUIRED_FIELDS.patients DOES NOT include mobile');

// ── TEST 1: CSV containing only name,gender (Ramesh Sharma,M) ──
console.log('\n--- TEST 1: CSV name,gender -> Ramesh Sharma,M ---');
const csv1 = `name,gender\nRamesh Sharma,M\n`;
const p1 = parseCSV(csv1);
const v1 = validateCSVRows('patients', p1.rows, { headers: p1.rawHeaders });
assert(!v1.mappingError, 'TEST 1: No header mapping error for [name, gender]');
assert(v1.summary.validCount === 1, 'TEST 1: Summary shows 1 valid record');
assert(v1.summary.invalidCount === 0, 'TEST 1: Summary shows 0 invalid records');
assert(v1.validRows[0].name === 'Ramesh Sharma', 'TEST 1: name is "Ramesh Sharma"');
assert(v1.validRows[0].gender === 'M', 'TEST 1: gender is "M"');
assert(v1.validRows[0].age === null, 'TEST 1: age defaults safely to null');
assert(v1.validRows[0].mobile === '', 'TEST 1: mobile defaults safely to empty string');

// ── TEST 2: CSV containing Priya Patel,F ──
console.log('\n--- TEST 2: CSV name,gender -> Priya Patel,F ---');
const csv2 = `name,gender\nPriya Patel,F\n`;
const p2 = parseCSV(csv2);
const v2 = validateCSVRows('patients', p2.rows, { headers: p2.rawHeaders });
assert(!v2.mappingError, 'TEST 2: No header mapping error');
assert(v2.summary.validCount === 1, 'TEST 2: Summary shows 1 valid record');
assert(v2.summary.invalidCount === 0, 'TEST 2: Summary shows 0 invalid records');
assert(v2.validRows[0].name === 'Priya Patel', 'TEST 2: name is "Priya Patel"');
assert(v2.validRows[0].gender === 'F', 'TEST 2: gender is "F"');

// ── TEST 3: CSV with empty optional fields (Amit Shah,M,,,) ──
console.log('\n--- TEST 3: CSV with empty optional fields -> Amit Shah,M,,, ---');
const csv3 = `name,gender,age,mobile,address\nAmit Shah,M,,,\n`;
const p3 = parseCSV(csv3);
const v3 = validateCSVRows('patients', p3.rows, { headers: p3.rawHeaders });
assert(!v3.mappingError, 'TEST 3: No header mapping error');
assert(v3.summary.validCount === 1, 'TEST 3: Successfully accepted row with empty age, mobile, address');
assert(v3.summary.invalidCount === 0, 'TEST 3: 0 invalid records');
assert(v3.validRows[0].name === 'Amit Shah', 'TEST 3: name is "Amit Shah"');
assert(v3.validRows[0].gender === 'M', 'TEST 3: gender is "M"');
assert(v3.validRows[0].age === null, 'TEST 3: age is null');
assert(v3.validRows[0].mobile === '', 'TEST 3: mobile is empty string');

// ── TEST 4: CSV with complete patient information ──
console.log('\n--- TEST 4: CSV with complete patient information ---');
const csv4 = `name,date_time,age,gender,marital_status,mobile,blood_group,address
Ramesh Sharma,05-09-2026 10:30,36,M,Married,9825012345,B+,Surat
`;
const p4 = parseCSV(csv4);
const v4 = validateCSVRows('patients', p4.rows, { headers: p4.rawHeaders });
assert(v4.summary.validCount === 1, 'TEST 4: Successfully accepted complete patient row');
assert(v4.summary.invalidCount === 0, 'TEST 4: 0 invalid records');
assert(v4.validRows[0].name === 'Ramesh Sharma', 'TEST 4: name is "Ramesh Sharma"');
assert(v4.validRows[0].age === 36, 'TEST 4: age is 36');
assert(v4.validRows[0].gender === 'M', 'TEST 4: gender is "M"');
assert(v4.validRows[0].marital_status === 'Married', 'TEST 4: marital_status is "Married"');
assert(v4.validRows[0].mobile === '9825012345', 'TEST 4: mobile is "9825012345"');
assert(v4.validRows[0].blood_group === 'B+', 'TEST 4: blood_group is "B+"');
assert(v4.validRows[0].address === 'Surat', 'TEST 4: address is "Surat"');
assert(v4.validRows[0].created_at === '2026-09-05T10:30:00.000Z', 'TEST 4: historical created_at parsed correctly');

// ── TEST 5: CSV missing gender ──
console.log('\n--- TEST 5: CSV missing gender ---');
const csv5 = `name,gender\nRamesh Sharma,\n`;
const p5 = parseCSV(csv5);
const v5 = validateCSVRows('patients', p5.rows, { headers: p5.rawHeaders });
assert(v5.summary.validCount === 0, 'TEST 5: 0 valid records');
assert(v5.summary.invalidCount === 1, 'TEST 5: 1 invalid record');
assert(v5.invalidRows[0].errors.some((e) => e.includes('Gender is required')), 'TEST 5: Validation error: Gender is required');

// ── TEST 6: CSV missing name ──
console.log('\n--- TEST 6: CSV missing name ---');
const csv6 = `name,gender\n,M\n`;
const p6 = parseCSV(csv6);
const v6 = validateCSVRows('patients', p6.rows, { headers: p6.rawHeaders });
assert(v6.summary.validCount === 0, 'TEST 6: 0 valid records');
assert(v6.summary.invalidCount === 1, 'TEST 6: 1 invalid record');
assert(v6.invalidRows[0].errors.some((e) => e.includes('Full name is required')), 'TEST 6: Validation error: Full name is required');

// ── TEST 7 & 8: Manual New Patient Form Validation (4 required fields) ──
console.log('\n--- TEST 7 & 8: Manual New Patient Form Validation ---');
const rootContainer = document.getElementById('root');
const root = createRoot(rootContainer);

await act(async () => {
  root.render(
    React.createElement(AppProvider, null,
      React.createElement(PrintProvider, null,
        React.createElement(MemoryRouter, { initialEntries: ['/patients'] },
          React.createElement(Routes, null,
            React.createElement(Route, { path: '/patients', element: React.createElement(Patients) }),
            React.createElement(Route, { path: '/patients/:id', element: React.createElement('div', null, 'Profile') })
          )
        )
      )
    )
  );
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

// Click "+ New Patient" to open manual modal
const newPatientBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('New Patient'));
await act(async () => {
  newPatientBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

const manualModal = document.querySelector('form.modal');
assert(!!manualModal, 'Manual New Patient modal opened');

// Check manual form fields: 4 required fields marked with asterisk
const fields = Array.from(manualModal.querySelectorAll('.field'));
const nameField = fields.find((f) => f.textContent.includes('Full Name'));
const ageField = fields.find((f) => f.textContent.includes('Age'));
const genderField = fields.find((f) => f.textContent.includes('Gender'));
const mobileField = fields.find((f) => f.textContent.includes('Mobile Number'));
const maritalField = fields.find((f) => f.textContent.includes('Marital Status'));
const bloodField = fields.find((f) => f.textContent.includes('Blood Group'));
const addressField = fields.find((f) => f.textContent.includes('Address'));

assert(nameField?.querySelector('em')?.textContent === '*', 'Manual form: Full Name has required asterisk (*)');
assert(ageField?.querySelector('em')?.textContent === '*', 'Manual form: Age has required asterisk (*)');
assert(genderField?.querySelector('em')?.textContent === '*', 'Manual form: Gender has required asterisk (*)');
assert(mobileField?.querySelector('em')?.textContent === '*', 'Manual form: Mobile Number has required asterisk (*)');

assert(!maritalField?.querySelector('em'), 'Manual form: Marital Status is optional (no asterisk)');
assert(!bloodField?.querySelector('em'), 'Manual form: Blood Group is optional (no asterisk)');
assert(!addressField?.querySelector('em'), 'Manual form: Address is optional (no asterisk)');

// Submit empty manual form -> verify all 4 required field errors appear
const submitBtn = Array.from(manualModal.querySelectorAll('button')).find((b) => b.textContent.includes('Register patient'));
await act(async () => {
  submitBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

const manualErrors = Array.from(manualModal.querySelectorAll('.field-err')).map((el) => el.textContent);
assert(manualErrors.some((e) => e.includes('Full name is required')), 'TEST 7: Manual form requires Full Name');
assert(manualErrors.some((e) => e.includes('valid age')), 'TEST 7: Manual form requires Age');
assert(manualErrors.some((e) => e.includes('Mobile number is required')), 'TEST 7: Manual form requires Mobile Number');

// Now provide only name and gender in manual form -> Age and Mobile MUST STILL BE REQUIRED
const nameInput = manualModal.querySelector('input[placeholder="Enter full name"]');
await act(async () => {
  setInput(nameInput, 'Manual Patient Test');
  submitBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

const manualErrorsAfterName = Array.from(manualModal.querySelectorAll('.field-err')).map((el) => el.textContent);
assert(!manualErrorsAfterName.some((e) => e.includes('Full name is required')), 'Manual form: Name accepted');
assert(manualErrorsAfterName.some((e) => e.includes('valid age')), 'TEST 7: Manual form STILL blocks on missing Age (independent of CSV rule)');
assert(manualErrorsAfterName.some((e) => e.includes('Mobile number is required')), 'TEST 7: Manual form STILL blocks on missing Mobile (independent of CSV rule)');

// Fill all 4 required fields leaving optional fields empty -> Successful registration
const ageInput = manualModal.querySelector('input[placeholder="Age in years"]');
const mobileInput = manualModal.querySelector('input[placeholder="10-digit mobile"]');
const countBefore = await db.patients.count();

await act(async () => {
  setInput(ageInput, '29');
  setInput(mobileInput, '9876543210');
  submitBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 200));
});

const countAfter = await db.patients.count();
assert(countAfter === countBefore + 1, 'TEST 8: Manual form successfully saved patient with only 4 required fields and empty optional fields');

const savedManualPatient = await db.patients.where('mobile').equals('9876543210').first();
assert(savedManualPatient.name === 'Manual Patient Test', 'Manual patient saved with correct name');
assert(savedManualPatient.address === '', 'TEST 8: Optional address safely saved as empty');
assert(savedManualPatient.blood_group === '', 'TEST 8: Optional blood_group safely saved as empty');

await act(async () => {
  root.render(null);
});

console.log('\n===============================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
