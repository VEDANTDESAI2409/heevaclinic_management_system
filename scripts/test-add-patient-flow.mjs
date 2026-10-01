// ─── HEEVA CLINIC — Full Add Patient Form & Keyboard Integration Tests ───
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

const rootContainer = document.getElementById('root');
const root = createRoot(rootContainer);

const renderApp = async (initialEntries = ['/patients']) => {
  await act(async () => {
    root.render(
      React.createElement(AppProvider, null,
        React.createElement(PrintProvider, null,
          React.createElement(MemoryRouter, { initialEntries },
            React.createElement(Routes, null,
              React.createElement(Route, { path: '/patients', element: React.createElement(Patients) }),
              React.createElement(Route, { path: '/patients/:id', element: React.createElement('div', { id: 'patient-profile-mock' }, 'Patient Profile') })
            )
          )
        )
      )
    );
  });
  // Wait a tick for live queries and effects
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });
};

const cleanup = async () => {
  await act(async () => {
    root.render(null);
  });
  rootContainer.innerHTML = '';
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
console.log('HEEVA CLINIC — ADD PATIENT FORM & BUTTON FUNCTIONALITY VERIFICATION');
console.log('===============================================================\n');

// ── Test Section 1: Modal Open & Close Behaviors (Cancel, X Button) ──
console.log('1. Add Patient Modal Open, Cancel & Close Button:');
await renderApp(['/patients']);

// Click "+ New Patient" button
const newPatientBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('New Patient'));
assert(!!newPatientBtn, '"+ New Patient" button exists in header');

await act(async () => {
  newPatientBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

let modalForm = document.querySelector('form.modal');
assert(!!modalForm, 'Register New Patient modal opens as a form on click');
assert(modalForm.querySelector('h3')?.textContent === 'Register New Patient', 'Modal header has correct title "Register New Patient"');

// Check Close "X" button
const closeXBtn = modalForm.querySelector('button.icon-btn[aria-label="Close"]');
assert(!!closeXBtn, 'Modal "X" close button exists');
assert(closeXBtn.getAttribute('type') === 'button', '"X" close button has type="button" (cannot trigger submit on Enter)');

await act(async () => {
  closeXBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
assert(!document.querySelector('form.modal'), '"X" close button correctly closes modal without saving');

// Reopen modal and test Cancel button
await act(async () => {
  newPatientBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
modalForm = document.querySelector('form.modal');

const cancelBtn = Array.from(modalForm.querySelectorAll('button')).find((b) => b.textContent === 'Cancel');
assert(!!cancelBtn, 'Cancel button exists in modal footer');
assert(cancelBtn.getAttribute('type') === 'button', 'Cancel button has type="button" (cannot trigger submit on Enter)');

// Fill partial state before canceling
const nameInput = modalForm.querySelector('input[placeholder="Enter full name"]');
await act(async () => {
  setInput(nameInput, 'Partial State To Cancel');
});
assert(nameInput.value === 'Partial State To Cancel', 'Form accepted input text');

await act(async () => {
  cancelBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
assert(!document.querySelector('form.modal'), 'Cancel button closes modal');

// Reopen modal and verify state is cleared (no stale state)
await act(async () => {
  newPatientBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
modalForm = document.querySelector('form.modal');
const nameInputClean = modalForm.querySelector('input[placeholder="Enter full name"]');
assert(nameInputClean.value === '', 'Reopening modal resets form state (no stale state)');

// ── Test Section 2: Validation on Empty Submission (Mouse and Enter) ──
console.log('\n2. Validation Behavior (Mouse Click & Enter Key):');

const submitBtn = Array.from(modalForm.querySelectorAll('button')).find((b) => b.textContent.includes('Register patient'));
assert(!!submitBtn, '"Register patient" submit button exists in modal footer');
assert(submitBtn.getAttribute('type') === 'submit', '"Register patient" button has type="submit"');

// Click submit on empty form
await act(async () => {
  submitBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

let errorEls = Array.from(modalForm.querySelectorAll('.field-err')).map((el) => el.textContent);
assert(errorEls.some((msg) => msg.includes('Full name is required')), 'Mouse click: Full name validation error displayed');
assert(errorEls.some((msg) => msg.includes('valid age')), 'Mouse click: Age validation error displayed');
assert(errorEls.some((msg) => msg.includes('Mobile number is required')), 'Mouse click: Mobile validation error displayed');
assert(!!document.querySelector('form.modal'), 'Mouse click: Modal stays open when validation fails');

// Close and reopen to test Enter key validation
await act(async () => {
  cancelBtn.click();
});
await act(async () => {
  newPatientBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});
modalForm = document.querySelector('form.modal');

// Press Enter on the Name input with empty fields
const nameInputEmpty = modalForm.querySelector('input[placeholder="Enter full name"]');
await act(async () => {
  nameInputEmpty.focus();
  modalForm.requestSubmit();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

errorEls = Array.from(modalForm.querySelectorAll('.field-err')).map((el) => el.textContent);
assert(errorEls.some((msg) => msg.includes('Full name is required')), 'Enter key: Full name validation error displayed');
assert(errorEls.some((msg) => msg.includes('valid age')), 'Enter key: Age validation error displayed');
assert(errorEls.some((msg) => msg.includes('Mobile number is required')), 'Enter key: Mobile validation error displayed');
assert(!!document.querySelector('form.modal'), 'Enter key: Modal stays open when validation fails');

// ── Test Section 3: Interactive Controls (Inputs, Selects) ──
console.log('\n3. All Form Input & Select Controls:');

const ageInput = modalForm.querySelector('input[placeholder="Age in years"]');
const genderSelect = modalForm.querySelectorAll('select')[0];
const maritalSelect = modalForm.querySelectorAll('select')[1];
const mobileInput = modalForm.querySelector('input[placeholder="10-digit mobile"]');
const bloodSelect = modalForm.querySelectorAll('select')[2];
const addressInput = modalForm.querySelector('input[placeholder="Full address"]');

assert(!!nameInputEmpty, 'Full Name input is present');
assert(!!ageInput, 'Age input is present');
assert(!!genderSelect, 'Gender select is present');
assert(!!maritalSelect, 'Marital Status select is present');
assert(!!mobileInput, 'Mobile Number input is present');
assert(!!bloodSelect, 'Blood Group select is present');
assert(!!addressInput, 'Address input is present');

await act(async () => {
  setInput(nameInputEmpty, 'Test User Mouse');
  setInput(ageInput, '32');
  setInput(genderSelect, 'F');
  setInput(maritalSelect, 'Married');
  setInput(mobileInput, '9876543210');
  setInput(bloodSelect, 'O+');
  setInput(addressInput, '123 Main Street');
});

assert(nameInputEmpty.value === 'Test User Mouse', 'Name input value retained');
assert(ageInput.value === '32', 'Age input value retained');
assert(genderSelect.value === 'F', 'Gender select option retained');
assert(maritalSelect.value === 'Married', 'Marital status option retained');
assert(mobileInput.value === '9876543210', 'Mobile input value retained');
assert(bloodSelect.value === 'O+', 'Blood group option retained');
assert(addressInput.value === '123 Main Street', 'Address input value retained');

// ── Test Section 4: Mouse Click Registration Flow ──
console.log('\n4. Mouse Click Registration Flow:');
const initialPatientCount = await db.patients.count();

await act(async () => {
  submitBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 200));
});

const afterMouseCount = await db.patients.count();
assert(afterMouseCount === initialPatientCount + 1, 'Mouse click created exactly 1 patient in database');

const registeredMousePatient = await db.patients.where('mobile').equals('9876543210').first();
assert(!!registeredMousePatient, 'Patient record found in database');
assert(registeredMousePatient.name === 'Test User Mouse', 'Patient name matches');
assert(registeredMousePatient.age === 32, 'Patient age matches');
assert(registeredMousePatient.gender === 'F', 'Patient gender matches');
assert(registeredMousePatient.marital_status === 'Married', 'Patient marital status matches');
assert(registeredMousePatient.blood_group === 'O+', 'Patient blood group matches');
assert(registeredMousePatient.address === '123 Main Street', 'Patient address matches');
assert(/^HC(-\d{4})?-\d+$/.test(registeredMousePatient.uhid), `UHID generated correctly: ${registeredMousePatient.uhid}`);
assert(!document.querySelector('form.modal'), 'Modal closes after successful mouse registration');

// ── Test Section 5: Enter Key Registration Flow ──
console.log('\n5. Enter Key Registration Flow:');
await cleanup();
await renderApp(['/patients']);

const newPatientBtn2 = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('New Patient'));
await act(async () => {
  newPatientBtn2.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

const modalForm2 = document.querySelector('form.modal');
const nameInput2 = modalForm2.querySelector('input[placeholder="Enter full name"]');
const ageInput2 = modalForm2.querySelector('input[placeholder="Age in years"]');
const genderSelect2 = modalForm2.querySelectorAll('select')[0];
const maritalSelect2 = modalForm2.querySelectorAll('select')[1];
const mobileInput2 = modalForm2.querySelector('input[placeholder="10-digit mobile"]');
const bloodSelect2 = modalForm2.querySelectorAll('select')[2];
const addressInput2 = modalForm2.querySelector('input[placeholder="Full address"]');

await act(async () => {
  setInput(nameInput2, 'Test User Enter');
  setInput(ageInput2, '45');
  setInput(genderSelect2, 'M');
  setInput(maritalSelect2, 'Single');
  setInput(mobileInput2, '9123456780');
  setInput(bloodSelect2, 'B+');
  setInput(addressInput2, '456 Elm Street');
});

// Submit by pressing Enter on any input field (e.g. mobileInput)
await act(async () => {
  mobileInput2.focus();
  modalForm2.requestSubmit();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 200));
});

const afterEnterCount = await db.patients.count();
assert(afterEnterCount === afterMouseCount + 1, 'Enter key created exactly 1 patient in database');

const registeredEnterPatient = await db.patients.where('mobile').equals('9123456780').first();
assert(!!registeredEnterPatient, 'Patient record found in database');
assert(registeredEnterPatient.name === 'Test User Enter', 'Patient name matches');
assert(registeredEnterPatient.age === 45, 'Patient age matches');
assert(registeredEnterPatient.gender === 'M', 'Patient gender matches');
assert(registeredEnterPatient.marital_status === 'Single', 'Patient marital status matches');
assert(registeredEnterPatient.blood_group === 'B+', 'Patient blood group matches');
assert(registeredEnterPatient.address === '456 Elm Street', 'Patient address matches');
assert(/^HC(-\d{4})?-\d+$/.test(registeredEnterPatient.uhid), `UHID generated correctly: ${registeredEnterPatient.uhid}`);
assert(registeredEnterPatient.uhid !== registeredMousePatient.uhid, 'Unique UHID assigned');
assert(!document.querySelector('form.modal'), 'Modal closes after successful Enter key registration');

// ── Test Section 6: Duplicate Submission Prevention ──
console.log('\n6. Duplicate Submission Prevention (Rapid Enter Presses):');
await cleanup();
await renderApp(['/patients']);

const newPatientBtn3 = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('New Patient'));
await act(async () => {
  newPatientBtn3.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

const modalForm3 = document.querySelector('form.modal');
const nameInput3 = modalForm3.querySelector('input[placeholder="Enter full name"]');
const ageInput3 = modalForm3.querySelector('input[placeholder="Age in years"]');
const mobileInput3 = modalForm3.querySelector('input[placeholder="10-digit mobile"]');

await act(async () => {
  setInput(nameInput3, 'Test Rapid Enter');
  setInput(ageInput3, '28');
  setInput(mobileInput3, '9998887776');
});

const beforeRapidCount = await db.patients.count();

// Rapidly trigger requestSubmit 5 times in succession
await act(async () => {
  modalForm3.requestSubmit();
  modalForm3.requestSubmit();
  modalForm3.requestSubmit();
  modalForm3.requestSubmit();
  modalForm3.requestSubmit();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 300));
});

const afterRapidCount = await db.patients.count();
assert(afterRapidCount === beforeRapidCount + 1, 'Rapid Enter presses resulted in exactly ONE patient created (no duplicates)');

// ── Test Section 7: Patients Page Regression Checks ──
console.log('\n7. Patients Page Main Actions Regression Checks:');
await cleanup();
await renderApp(['/patients']);

// Search filter
const searchInput = document.querySelector('.toolbar-search input');
assert(!!searchInput, 'Search input exists');
await act(async () => {
  setInput(searchInput, 'Test Rapid');
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});
let rows = document.querySelectorAll('tbody tr');
assert(rows.length === 1, `Search filtered table to 1 row (found: ${rows.length})`);
assert(rows[0].textContent.includes('Test Rapid Enter'), 'Search correctly matched patient name');

// Clear search
await act(async () => {
  setInput(searchInput, '');
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});
rows = document.querySelectorAll('tbody tr');
assert(rows.length >= 3, `Clearing search restored rows (found: ${rows.length})`);

// Gender filter
const genderFilter = document.querySelector('select.toolbar-select');
assert(!!genderFilter, 'Gender filter select exists');
await act(async () => {
  setInput(genderFilter, 'F');
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});
rows = document.querySelectorAll('tbody tr');
assert(Array.from(rows).every((r) => r.textContent.includes('F')), 'Gender filter only displays Female patients');

// Reset gender filter
await act(async () => {
  setInput(genderFilter, '');
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

// Import CSV button
const importBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Import CSV'));
assert(!!importBtn, 'Import CSV button exists');
await act(async () => {
  importBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});
const importModal = document.querySelector('.modal');
assert(!!importModal && importModal.textContent.includes('Import Patients'), 'Import CSV opens import modal');
const importCloseBtn = importModal.querySelector('button.icon-btn[aria-label="Close"]') || Array.from(importModal.querySelectorAll('button')).find(b => b.textContent === 'Cancel');
await act(async () => {
  importCloseBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});

// Export CSV button
const exportBtn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Export CSV'));
assert(!!exportBtn, 'Export CSV button exists');
let exportThrew = false;
try {
  await act(async () => {
    exportBtn.click();
  });
} catch (e) {
  exportThrew = true;
  console.error('Export CSV error:', e);
}
assert(!exportThrew, 'Export CSV executes without throwing any error');

// Delete patient action
const deleteBtn = document.querySelector('.row-actions button[title="Delete Patient"]');
assert(!!deleteBtn, 'Delete patient action icon exists');
await act(async () => {
  deleteBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 100));
});
const confirmModal = document.querySelector('.modal');
assert(!!confirmModal && confirmModal.textContent.includes('Delete Patient Record?'), 'Delete button opens confirmation modal');

const confirmDeleteBtn = Array.from(confirmModal.querySelectorAll('button')).find((b) => b.textContent.includes('Delete Patient'));
const countBeforeDelete = await db.patients.count();
await act(async () => {
  confirmDeleteBtn.click();
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 200));
});
const countAfterDelete = await db.patients.count();
assert(countAfterDelete === countBeforeDelete - 1, 'Patient successfully deleted via confirmation dialog');

// ── Test Section 8: Textarea Enter Key Protection ──
console.log('\n8. Textarea Enter Key Behavior:');
let textareaFormSubmitted = false;
const { Modal, Textarea, Btn } = await import('../src/components/ui.jsx');

const TextareaTestModal = () => {
  const [notes, setNotes] = React.useState('Initial note');
  return React.createElement(Modal, {
    open: true,
    title: 'Textarea Test Modal',
    onClose: () => {},
    onSubmit: (e) => {
      e.preventDefault();
      textareaFormSubmitted = true;
    },
    footer: React.createElement(Btn, { type: 'submit' }, 'Save')
  },
    React.createElement(Textarea, {
      id: 'test-notes',
      value: notes,
      onChange: (e) => setNotes(e.target.value)
    })
  );
};

await cleanup();
await act(async () => {
  root.render(React.createElement(TextareaTestModal));
});
await act(async () => {
  await new Promise((r) => setTimeout(r, 50));
});

const textareaEl = document.getElementById('test-notes');
assert(!!textareaEl, 'Textarea element rendered inside modal');

// Simulate pressing Enter in textarea
await act(async () => {
  textareaEl.focus();
  const enterEvent = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  const allowed = textareaEl.dispatchEvent(enterEvent);
  assert(allowed === true, 'Enter key is not cancelled in textarea (allows newline creation)');
  // If requestSubmit was somehow called while textarea is focused
  const formEl = document.querySelector('form.modal');
  formEl.requestSubmit();
});

assert(textareaFormSubmitted === false, 'Enter inside textarea did NOT submit form');

await cleanup();

console.log('\n===============================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('===============================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
