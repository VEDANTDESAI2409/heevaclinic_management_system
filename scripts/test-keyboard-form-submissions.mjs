// ─── HEEVA CLINIC — Keyboard Usability & Form Submission Unit/Integration Tests ───
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
global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
global.HTMLButtonElement = dom.window.HTMLButtonElement;
global.Element = dom.window.Element;
global.Node = dom.window.Node;
global.getComputedStyle = dom.window.getComputedStyle;
global.localStorage = dom.window.localStorage;
global.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');

// Import UI components
const { Btn, IconBtn, Modal, Confirm, SearchSelect } = await import('../src/components/ui.jsx');

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

const render = async (element) => {
  await act(async () => {
    root.render(element);
  });
};

const cleanup = async () => {
  await act(async () => {
    root.render(null);
  });
  rootContainer.innerHTML = '';
};

console.log('==================================================');
console.log('KEYBOARD USABILITY & FORM SUBMISSION TESTS');
console.log('==================================================\n');

// ── Test 1: Btn and IconBtn default to type="button" ──
console.log('1. Button Type Invariants:');
await render(React.createElement('div', null,
  React.createElement(Btn, { id: 'btn-default' }, 'Cancel'),
  React.createElement(Btn, { id: 'btn-submit', type: 'submit' }, 'Save'),
  React.createElement(IconBtn, { id: 'icon-btn-default' }, 'X')
));

const btnDefault = document.getElementById('btn-default');
const btnSubmit = document.getElementById('btn-submit');
const iconBtnDefault = document.getElementById('icon-btn-default');

assert(btnDefault.getAttribute('type') === 'button', 'Btn without explicit type defaults to type="button"');
assert(btnSubmit.getAttribute('type') === 'submit', 'Btn with type="submit" has type="submit"');
assert(iconBtnDefault.getAttribute('type') === 'button', 'IconBtn defaults to type="button"');
await cleanup();

// ── Test 2: Modal with onSubmit renders as <form> and handles Enter submission ──
console.log('\n2. Modal Form Semantics & Enter Submission:');
let submittedData = null;
let cancelClicked = false;

const TestModalComponent = () => {
  const [val, setVal] = React.useState('Test Patient');
  return React.createElement(Modal, {
    open: true,
    title: 'Test Form Modal',
    onClose: () => {},
    onSubmit: (e) => {
      e.preventDefault();
      submittedData = val;
    },
    footer: React.createElement(React.Fragment, null,
      React.createElement(Btn, { id: 'cancel-btn', onClick: () => { cancelClicked = true; } }, 'Cancel'),
      React.createElement(Btn, { id: 'submit-btn', type: 'submit', variant: 'primary' }, 'Register')
    )
  },
    React.createElement('input', {
      id: 'test-name-input',
      value: val,
      onChange: (e) => setVal(e.target.value)
    })
  );
};

await render(React.createElement(TestModalComponent));

const modalForm = document.querySelector('form.modal');
assert(modalForm !== null, 'Modal with onSubmit renders as a <form>');

const nameInput = document.getElementById('test-name-input');
const cancelBtn = document.getElementById('cancel-btn');
const submitBtn = document.getElementById('submit-btn');

assert(cancelBtn.getAttribute('type') === 'button', 'Modal cancel button has type="button" (won\'t trigger on Enter)');
assert(submitBtn.getAttribute('type') === 'submit', 'Modal submit button has type="submit"');

// Simulate pressing Enter inside single-line input field
nameInput.focus();
const enterEvent = new dom.window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true });
nameInput.dispatchEvent(enterEvent);

// Also test submitting via form requestSubmit / submit dispatch
modalForm.requestSubmit();

assert(submittedData === 'Test Patient', 'Form onSubmit triggered and captured data on submit');
assert(cancelClicked === false, 'Cancel button was NOT triggered');
await cleanup();

// ── Test 3: Textarea does NOT submit form on Enter ──
console.log('\n3. Textarea Enter Protection:');
let textareaSubmitted = false;

const TextareaModalComponent = () => {
  return React.createElement(Modal, {
    open: true,
    title: 'Textarea Modal',
    onClose: () => {},
    onSubmit: (e) => {
      textareaSubmitted = true;
    },
    footer: React.createElement(Btn, { type: 'submit' }, 'Save')
  },
    React.createElement('textarea', { id: 'test-textarea' })
  );
};

await render(React.createElement(TextareaModalComponent));
const textarea = document.getElementById('test-textarea');
textarea.focus();

// Trigger form submit while textarea is active element
const textForm = document.querySelector('form.modal');
const formSubmitEvent = new dom.window.Event('submit', { bubbles: true, cancelable: true });
textForm.dispatchEvent(formSubmitEvent);

assert(textareaSubmitted === false, 'Form submit is ignored when activeElement is a textarea');
await cleanup();

// ── Test 4: Destructive Confirm dialog safety ──
console.log('\n4. Destructive Confirmation Modal Safety:');
let deleteConfirmed = false;

await render(React.createElement(Confirm, {
  open: true,
  title: 'Delete Patient?',
  msg: 'Are you sure?',
  danger: true,
  onConfirm: () => { deleteConfirmed = true; },
  onCancel: () => {}
}));

const confirmForm = document.querySelector('form.modal');
assert(confirmForm === null, 'Confirm dialog is NOT a form (cannot be submitted by Enter)');

const confirmButtons = document.querySelectorAll('.modal-footer button');
const allAreTypeButton = Array.from(confirmButtons).every(b => b.getAttribute('type') === 'button');
assert(allAreTypeButton, 'All Confirm dialog action buttons are type="button"');
assert(deleteConfirmed === false, 'Destructive confirmation was NOT triggered');
await cleanup();

// ── Test 5: SearchSelect dropdown Enter handling ──
console.log('\n5. SearchSelect Dropdown Enter Navigation:');
let selectedOpt = null;
let formSubmittedFromSelect = false;

const SearchSelectTest = () => {
  const [val, setVal] = React.useState(null);
  const options = [
    { id: 'p1', name: 'Patient One' },
    { id: 'p2', name: 'Patient Two' }
  ];
  return React.createElement('form', {
    id: 'select-form',
    onSubmit: (e) => {
      e.preventDefault();
      formSubmittedFromSelect = true;
    }
  },
    React.createElement(SearchSelect, {
      options: options,
      value: val,
      getLabel: (o) => o?.name || '',
      onChange: (v) => {
        selectedOpt = v;
        setVal(v);
      },
      placeholder: 'Search patient...'
    })
  );
};

await render(React.createElement(SearchSelectTest));
const selectForm = document.getElementById('select-form');
const ssInput = document.querySelector('.ss-input');
assert(ssInput !== null, 'SearchSelect input element exists');

// Focus input to open dropdown
await act(async () => {
  ssInput.focus();
  const focusEvent = new dom.window.FocusEvent('focus', { bubbles: true });
  ssInput.dispatchEvent(focusEvent);
});

const dropMenu = document.querySelector('.ss-drop');
assert(dropMenu !== null, 'Dropdown opens on focus');

// Press Enter when dropdown is open -> should pick first item and prevent form submission
await act(async () => {
  const enterOnSelect = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  ssInput.dispatchEvent(enterOnSelect);
});

assert(selectedOpt && selectedOpt.id === 'p1', 'Enter selected highlighted option in SearchSelect');
assert(formSubmittedFromSelect === false, 'Enter in open SearchSelect did NOT submit parent form');

// Now dropdown is closed. Pressing Enter should bubble and submit form
await act(async () => {
  const enterClosed = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
  const notPrevented = ssInput.dispatchEvent(enterClosed);
  if (notPrevented) {
    selectForm.requestSubmit();
  }
});

assert(formSubmittedFromSelect === true, 'Enter when dropdown is closed successfully submits parent form');

await cleanup();

// ── Test 6: Multi-input form Enter submission ──
console.log('\n6. Multi-input Form Enter Navigation & Submission:');
let submittedFormData = null;

const MultiInputModal = () => {
  const [patient, setPatient] = React.useState({ name: '', phone: '', age: '' });
  return React.createElement(Modal, {
    open: true,
    title: 'New Patient',
    onClose: () => {},
    onSubmit: (e) => {
      e.preventDefault();
      submittedFormData = { ...patient };
    },
    footer: React.createElement(React.Fragment, null,
      React.createElement(Btn, { id: 'modal-cancel' }, 'Cancel'),
      React.createElement(Btn, { id: 'modal-register', type: 'submit' }, 'Register Patient')
    )
  },
    React.createElement('input', {
      id: 'input-name',
      value: patient.name,
      onChange: (e) => setPatient((p) => ({ ...p, name: e.target.value }))
    }),
    React.createElement('input', {
      id: 'input-phone',
      value: patient.phone,
      onChange: (e) => setPatient((p) => ({ ...p, phone: e.target.value }))
    }),
    React.createElement('input', {
      id: 'input-age',
      value: patient.age,
      onChange: (e) => setPatient((p) => ({ ...p, age: e.target.value }))
    })
  );
};

await render(React.createElement(MultiInputModal));
const multiForm = document.querySelector('form.modal');
const inputName = document.getElementById('input-name');
const inputPhone = document.getElementById('input-phone');
const inputAge = document.getElementById('input-age');

const setReactInputValue = (input, val) => {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
  nativeInputValueSetter.call(input, val);
  const ev = new dom.window.Event('input', { bubbles: true });
  input.dispatchEvent(ev);
};

await act(async () => {
  setReactInputValue(inputName, 'John Doe');
  setReactInputValue(inputPhone, '9876543210');
  setReactInputValue(inputAge, '35');
});

// Press Enter on the age field (last single-line input)
await act(async () => {
  inputAge.focus();
  multiForm.requestSubmit();
});

assert(submittedFormData !== null, 'Form submitted via requestSubmit from input');
assert(submittedFormData.name === 'John Doe', 'Patient name preserved on Enter submit');
assert(submittedFormData.phone === '9876543210', 'Patient phone preserved on Enter submit');
assert(submittedFormData.age === '35', 'Patient age preserved on Enter submit');

await cleanup();

// ── Test 7: Double Submit Prevention ──
console.log('\n7. Double Submission Prevention:');
let submitCount = 0;

const DoubleSubmitProtectedModal = () => {
  const [busy, setBusy] = React.useState(false);
  return React.createElement(Modal, {
    open: true,
    title: 'Save Item',
    onClose: () => {},
    onSubmit: async (e) => {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      submitCount++;
    },
    footer: React.createElement(Btn, { id: 'double-submit-btn', type: 'submit', disabled: busy }, 'Save')
  },
    React.createElement('input', { id: 'ds-input' })
  );
};

await render(React.createElement(DoubleSubmitProtectedModal));
const dsForm = document.querySelector('form.modal');
const dsBtn = document.getElementById('double-submit-btn');

await act(async () => {
  // First Enter submit
  dsForm.requestSubmit();
});

assert(submitCount === 1, 'First Enter submission succeeded');
assert(dsBtn.hasAttribute('disabled'), 'Submit button is disabled during submission');

await act(async () => {
  // Immediate second Enter press while busy
  const submitEvt = new dom.window.Event('submit', { bubbles: true, cancelable: true });
  dsForm.dispatchEvent(submitEvt);
});

assert(submitCount === 1, 'Duplicate Enter press while busy was blocked (preventing double submit)');

await cleanup();

console.log('\n==================================================');
console.log(`SUMMARY: ${passed} passed, ${failed} failed`);
console.log('==================================================');

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
