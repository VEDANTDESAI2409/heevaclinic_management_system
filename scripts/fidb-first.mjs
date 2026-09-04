// Installed via `node --import` so fake-indexeddb is registered on globalThis
// BEFORE the bundled (hoisted) dexie module evaluates and captures indexedDB.
import 'fake-indexeddb/auto';
