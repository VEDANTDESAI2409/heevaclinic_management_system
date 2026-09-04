import { d1Client } from '../db/d1Client.js';
import { allowedCollections } from '../db/tables.js';

export async function handleBulkImport(table, body, env) {
  if (!allowedCollections.has(table)) {
    return Response.json({ error: `Unknown collection: ${table}` }, { status: 404 });
  }

  const records = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return Response.json(
      { error: 'Payload must contain a non-empty records array' },
      { status: 400 }
    );
  }

  try {
    const result = await d1Client.bulkImport(env.DB, table, records, { userId: body.userId });
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error(`[Worker D1 API] Error importing records into ${table}:`, error);
    return Response.json(
      { error: error.message || 'Bulk import failed' },
      { status: 500 }
    );
  }
}
