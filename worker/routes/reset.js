import { verifyPassword, verifyAuthToken } from '../auth.js';

const TABLES_TO_CLEAR = [
  'prescription_items',
  'prescriptions',
  'return_items',
  'returns',
  'bill_items',
  'payments',
  'bills',
  'patient_vitals',
  'consultations',
  'appointments',
  'patients',
  'inventory_transactions',
  'medicine_stock_history',
  'medicine_batches',
  'medicines',
  'medicine_categories',
  'services',
  'expenses',
  'notifications',
  'activity_logs',
  'counters',
];

export async function handleReset(request, env) {
  if (request.method !== 'POST') {
    return Response.json({ ok: false, error: 'Method Not Allowed' }, { status: 405 });
  }

  // 1. Verify bearer token
  const authHeader = request.headers.get('Authorization');
  const isTokenValid = await verifyAuthToken(authHeader, env);
  if (!isTokenValid) {
    return Response.json({ ok: false, error: 'Unauthorized. Invalid session.' }, { status: 401 });
  }

  // 2. Re-verify password from request body
  let body;
  try {
    body = await request.json();
  } catch (_) {
    return Response.json({ ok: false, error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { password } = body || {};
  if (!password || typeof password !== 'string') {
    return Response.json({ ok: false, error: 'Clinic password is required to reset data.' }, { status: 400 });
  }

  const isPasswordValid = verifyPassword(password, env);
  if (!isPasswordValid) {
    return Response.json({ ok: false, error: 'Incorrect clinic password. Data reset aborted.' }, { status: 401 });
  }

  const db = env.DB;
  if (!db) {
    return Response.json({ ok: false, error: 'Database binding (DB) is unavailable.' }, { status: 500 });
  }

  try {
    const stmts = [];

    // Delete all records from operational tables
    for (const table of TABLES_TO_CLEAR) {
      stmts.push(db.prepare(`DELETE FROM "${table}"`));
    }

    // Reset clinic_settings to clean defaults
    const now = new Date().toISOString();
    stmts.push(
      db.prepare(`
        INSERT INTO clinic_settings (
          id, clinic_name, tagline, doctor_name, doctor_qual, doctor_role,
          address, phone, email, logo, receipt_footer, currency, bill_prefix,
          bill_padding, default_payment, uhid_prefix, uhid_include_year,
          uhid_padding, uhid_start, low_stock_default, expiry_30, expiry_60,
          expiry_90, fefo, theme, lang, seeded, created_at, updated_at
        ) VALUES (
          '1', 'HEEVA CLINIC', 'Trusted care, every time.', '', '', '',
          'A/8, MONARCH, Pal Gam, Surat, Gujarat – 394510', '', '', '/icons/heeva-logo.png',
          'Thank you for choosing Heeva Clinic.', '₹', 'HC-BILL',
          6, 'Cash', 'HC', 1,
          6, 1, 10, 30, 60,
          90, 1, 'light', 'en', '1', ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
          clinic_name = 'HEEVA CLINIC',
          tagline = 'Trusted care, every time.',
          doctor_name = '',
          doctor_qual = '',
          doctor_role = '',
          address = 'A/8, MONARCH, Pal Gam, Surat, Gujarat – 394510',
          phone = '',
          email = '',
          logo = '/icons/heeva-logo.png',
          receipt_footer = 'Thank you for choosing Heeva Clinic.',
          currency = '₹',
          bill_prefix = 'HC-BILL',
          bill_padding = 6,
          default_payment = 'Cash',
          uhid_prefix = 'HC',
          uhid_include_year = 1,
          uhid_padding = 6,
          uhid_start = 1,
          low_stock_default = 10,
          expiry_30 = 30,
          expiry_60 = 60,
          expiry_90 = 90,
          fefo = 1,
          theme = 'light',
          lang = 'en',
          seeded = '1',
          updated_at = ?
      `).bind(now, now, now)
    );

    await db.batch(stmts);

    return Response.json({
      ok: true,
      message: 'All clinic data has been completely reset.',
    });
  } catch (err) {
    console.error('[Reset Data Error]', err);
    return Response.json(
      { ok: false, error: err.message || 'Failed to reset clinic data in database.' },
      { status: 500 }
    );
  }
}
