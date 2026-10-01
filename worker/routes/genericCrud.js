import { d1Client } from '../db/d1Client.js';
import { allowedCollections, resolveCollection } from '../db/tables.js';

const noCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function handleGetAll(table, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const rows = await d1Client.getAll(env.DB, table);
    return Response.json(rows, { status: 200, headers: noCacheHeaders });
  } catch (error) {
    console.error(`[Worker D1 API] Error reading ${table}:`, error);
    return Response.json({ error: error.message || 'Operation failed' }, { status: 500, headers: noCacheHeaders });
  }
}

export async function handleGetById(table, id, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const row = await d1Client.getById(env.DB, table, id);
    if (!row) {
      return Response.json({ error: 'Record not found' }, { status: 404, headers: noCacheHeaders });
    }
    return Response.json(row, { status: 200, headers: noCacheHeaders });
  } catch (error) {
    console.error(`[Worker D1 API] Error reading ${table}/${id}:`, error);
    return Response.json({ error: error.message || 'Operation failed' }, { status: 500, headers: noCacheHeaders });
  }
}

export async function handleCreate(table, body, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const actual = resolveCollection(table);
    if (actual === 'clinic_settings' && body?.key) {
      const result = await d1Client.updateClinicSetting(env.DB, body.key, body.value);
      return Response.json(result, { status: 201 });
    }
    const created = await d1Client.create(env.DB, actual, body || {});
    return Response.json(created, { status: 201 });
  } catch (error) {
    console.error(`[Worker D1 API] Error creating in ${table}:`, error);
    return Response.json({ error: error.message || 'Operation failed' }, { status: 500 });
  }
}

export async function handleUpdate(table, id, body, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    const actual = resolveCollection(table);
    if (actual === 'clinic_settings' && body?.key) {
      const result = await d1Client.updateClinicSetting(env.DB, body.key, body.value);
      return Response.json(result, { status: 200 });
    }
    const updated = await d1Client.update(env.DB, actual, id, body || {});
    return Response.json(updated, { status: 200 });
  } catch (error) {
    console.error(`[Worker D1 API] Error updating ${table}/${id}:`, error);
    return Response.json({ error: error.message || 'Operation failed' }, { status: 500 });
  }
}

export async function handleDelete(table, id, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }
  try {
    await d1Client.remove(env.DB, table, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(`[Worker D1 API] Error deleting ${table}/${id}:`, error);
    return Response.json({ error: error.message || 'Operation failed' }, { status: 500 });
  }
}

export async function handleGetNextUhid(env) {
  try {
    const preview = await d1Client.getNextUhidPreview(env.DB);
    return Response.json(preview, { status: 200, headers: noCacheHeaders });
  } catch (error) {
    console.error('[Worker D1 API] Error getting next UHID preview:', error);
    return Response.json({ error: error.message || 'Operation failed' }, { status: 500, headers: noCacheHeaders });
  }
}

export async function handleClearPatients(body, env) {
  const confirmation = String(body?.confirmation || '').trim();
  if (confirmation !== 'DELETE PATIENTS') {
    return Response.json(
      { error: 'Confirmation phrase "DELETE PATIENTS" is required.' },
      { status: 400, headers: noCacheHeaders }
    );
  }

  const db = env.DB;
  if (!db) {
    return Response.json({ error: 'Database binding (DB) is unavailable.' }, { status: 500, headers: noCacheHeaders });
  }

  try {
    const settingsRow = (await db.prepare('SELECT * FROM clinic_settings LIMIT 1').first()) || {};
    const year = new Date().getFullYear();
    const includeYear = settingsRow.uhid_include_year === 1 || settingsRow.uhid_include_year === true;
    const counterKey = includeYear ? `UHID|${year}` : 'UHID|ALL';
    const start = Number(settingsRow.uhid_start) || 1001;

    // 1. Fetch current counter value
    const counterRow = await db.prepare('SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1').bind(counterKey, counterKey).first();
    const currentCounter = counterRow && counterRow.value != null ? Number(counterRow.value) : 0;

    // 2. Scan all current patient UHIDs to ensure we never reset or reuse past numbers
    let maxExisting = 0;
    try {
      const existingRows = await db.prepare('SELECT uhid FROM patients').all();
      if (existingRows && existingRows.results) {
        for (const r of existingRows.results) {
          const uhidStr = String(r.uhid || '');
          const m = includeYear ? uhidStr.match(/-(\d+)$/) : uhidStr.match(/^[A-Za-z]+-(\d+)$/);
          if (m) {
            const val = parseInt(m[1], 10);
            if (!isNaN(val) && val > maxExisting) maxExisting = val;
          }
        }
      }
    } catch (_) {}

    const finalCounterVal = Math.max(currentCounter, maxExisting, start - 1);
    const now = new Date().toISOString();

    const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM patients').first();
    const deletedCount = countRow ? Number(countRow.cnt) : 0;

    // 3. Perform atomic batch in D1:
    //    a) Preserve UHID sequence counter in counters table
    //    b) Mark CLEARED|patients in counters so all syncing devices clear local cache
    //    c) Delete patient_vitals (dependent child records)
    //    d) Delete patients
    const clearKey = 'CLEARED|patients';
    const stmts = [
      db.prepare(
        'INSERT INTO counters (id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = MAX(counters.value, excluded.value), updated_at = excluded.updated_at'
      ).bind(counterKey, counterKey, finalCounterVal, now, now),
      db.prepare(
        'INSERT INTO counters (id, key, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).bind(clearKey, clearKey, Date.now(), now, now),
      db.prepare('DELETE FROM patient_vitals'),
      db.prepare('DELETE FROM patients'),
    ];

    await db.batch(stmts);
    await d1Client.incrementDbVersion(db, now);

    return Response.json(
      {
        ok: true,
        message: 'All patient records have been permanently cleared.',
        deletedCount,
        counterPreserved: finalCounterVal,
      },
      { status: 200, headers: noCacheHeaders }
    );
  } catch (error) {
    console.error('[Worker D1 API] Error clearing patients:', error);
    return Response.json({ error: error.message || 'Failed to clear patients' }, { status: 500, headers: noCacheHeaders });
  }
}


