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
