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
    const now = new Date().toISOString();
    const countRow = await db.prepare('SELECT COUNT(*) as cnt FROM patients').first();
    const deletedCount = countRow ? Number(countRow.cnt) : 0;

    // Perform atomic transaction in D1:
    // 1. Delete patient_vitals (dependent child records)
    // 2. Delete all patients
    // 3. Reset UHID sequence counter to 1000 so next patient receives HC-1001
    // 4. Mark CLEARED|patients so all multi-device clients synchronize the deletion and reset
    const clearKey = 'CLEARED|patients';
    const clearTime = Date.now();
    const stmts = [
      db.prepare('DELETE FROM patient_vitals'),
      db.prepare('DELETE FROM patients'),
      db.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('UHID|SEQUENCE', 'UHID|SEQUENCE', 1000, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = 1000, updated_at = excluded.updated_at
      `).bind(now, now),
      db.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('UHID|ALL', 'UHID|ALL', 1000, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = 1000, updated_at = excluded.updated_at
      `).bind(now, now),
      db.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('UHID|2026', 'UHID|2026', 0, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = 0, updated_at = excluded.updated_at
      `).bind(now, now),
      db.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).bind(clearKey, clearKey, clearTime, now, now),
    ];

    await db.batch(stmts);

    // Verify deletion succeeded
    const verifyRow = await db.prepare('SELECT COUNT(*) as cnt FROM patients').first();
    const remainingCount = verifyRow ? Number(verifyRow.cnt) : 0;
    if (remainingCount !== 0) {
      throw new Error(`Deletion verification failed: ${remainingCount} patients still remain.`);
    }

    await d1Client.incrementDbVersion(db, now);

    return Response.json(
      {
        ok: true,
        message: 'All patient records have been permanently cleared. UHID sequence reset to HC-1001.',
        deletedCount,
        nextUhid: 'HC-1001',
      },
      { status: 200, headers: noCacheHeaders }
    );
  } catch (error) {
    console.error('[Worker D1 API] Error clearing patients:', error);
    return Response.json({ error: error.message || 'Failed to clear patients' }, { status: 500, headers: noCacheHeaders });
  }
}


