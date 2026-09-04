const BASE = process.env.API_BASE || 'http://127.0.0.1:8787';

const collections = [
  'clinic_settings',
  'counters',
  'patients',
  'patient_vitals',
  'doctors',
  'consultations',
  'appointments',
  'prescriptions',
  'prescription_items',
  'medicines',
  'medicine_categories',
  'medicine_batches',
  'inventory_transactions',
  'medicine_stock_history',
  'services',
  'bills',
  'bill_items',
  'payments',
  'expenses',
  'returns',
  'return_items',
  'notifications',
  'activity_logs',
];

async function main() {
  console.log(`Inspecting Cloudflare Worker + D1 Backend (${BASE}):\n`);

  try {
    const healthRes = await fetch(`${BASE}/api/health`);
    if (!healthRes.ok) throw new Error(`Healthcheck failed: ${healthRes.status}`);
    const health = await healthRes.json();
    console.log(`Health Status: ${health.status}, Storage: ${health.storage}, Backend: ${health.backend}\n`);
  } catch (err) {
    console.error(`Cannot connect to Worker at ${BASE}:`, err.message);
    process.exit(1);
  }

  for (const name of collections) {
    try {
      const res = await fetch(`${BASE}/api/${name}`);
      if (!res.ok) {
        console.log(`Collection "${name}": Error ${res.status}`);
        continue;
      }
      const data = await res.json();
      const count = Array.isArray(data) ? data.length : 1;
      console.log(`Collection "${name}": ${count} items`);
      if (Array.isArray(data) && data.length > 0) {
        console.log(`  Sample:`, JSON.stringify(data[0], null, 2));
      }
    } catch (e) {
      console.error(`Error reading ${name}:`, e.message);
    }
  }
}

main().catch(console.error);
