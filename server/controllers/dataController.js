import { dataService, resolveCollection } from '../services/dataService.js';

const allowedCollections = new Set([
  'clinic_settings', 'settings',
  'counters',
  'patients',
  'patient_vitals',
  'doctors',
  'consultations',
  'appointments',
  'medicines',
  'medicine_categories',
  'medicine_batches', 'batches',
  'inventory_transactions', 'inventory_txns',
  'medicine_stock_history',
  'services',
  'prescriptions',
  'prescription_items',
  'bills',
  'bill_items',
  'payments',
  'expenses',
  'returns',
  'return_items',
  'notifications',
  'activity_logs',
]);

export async function healthCheck(_req, res) {
  res.json({
    status: 'ok',
    storage: 'json',
    backend: 'connected',
  });
}

export async function getAllRecords(req, res) {
  const { table } = req.params;
  if (!allowedCollections.has(table)) {
    return res.status(404).json({ error: `Unknown collection: ${table}` });
  }
  try {
    const rows = await dataService.getAll(table);
    res.json(rows);
  } catch (error) {
    console.error(`[API] Error reading ${table}:`, error);
    res.status(500).json({ error: error.message || 'Operation failed' });
  }
}

export async function getRecordById(req, res) {
  const { table, id } = req.params;
  if (!allowedCollections.has(table)) {
    return res.status(404).json({ error: `Unknown collection: ${table}` });
  }
  try {
    const row = await dataService.getById(table, id);
    if (!row) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(row);
  } catch (error) {
    console.error(`[API] Error reading ${table}/${id}:`, error);
    res.status(500).json({ error: error.message || 'Operation failed' });
  }
}

export async function createRecord(req, res) {
  const { table } = req.params;
  if (!allowedCollections.has(table)) {
    return res.status(404).json({ error: `Unknown collection: ${table}` });
  }
  try {
    const actual = resolveCollection(table);
    if (actual === 'clinic_settings' && req.body.key) {
      const result = await dataService.updateClinicSetting(req.body.key, req.body.value);
      return res.status(201).json(result);
    }
    const created = await dataService.create(actual, req.body);
    res.status(201).json(created);
  } catch (error) {
    console.error(`[API] Error creating in ${table}:`, error);
    res.status(500).json({ error: error.message || 'Operation failed' });
  }
}

export async function updateRecord(req, res) {
  const { table, id } = req.params;
  if (!allowedCollections.has(table)) {
    return res.status(404).json({ error: `Unknown collection: ${table}` });
  }
  try {
    const actual = resolveCollection(table);
    if (actual === 'clinic_settings' && req.body.key) {
      const result = await dataService.updateClinicSetting(req.body.key, req.body.value);
      return res.json(result);
    }
    // Upsert: if record doesn't exist, create it cleanly
    const updated = await dataService.update(actual, id, req.body);
    res.json(updated);
  } catch (error) {
    console.error(`[API] Error updating ${table}/${id}:`, error);
    res.status(500).json({ error: error.message || 'Operation failed' });
  }
}

export async function deleteRecord(req, res) {
  const { table, id } = req.params;
  if (!allowedCollections.has(table)) {
    return res.status(404).json({ error: `Unknown collection: ${table}` });
  }
  try {
    await dataService.remove(table, id);
    res.status(204).end();
  } catch (error) {
    console.error(`[API] Error deleting ${table}/${id}:`, error);
    res.status(500).json({ error: error.message || 'Operation failed' });
  }
}

export async function bulkImportRecords(req, res) {
  const { table } = req.params;
  if (!allowedCollections.has(table)) {
    return res.status(404).json({ error: `Unknown collection: ${table}` });
  }
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ error: 'Payload must contain a non-empty records array' });
  }
  try {
    const result = await dataService.bulkImport(table, records, { userId: req.body.userId });
    res.status(200).json(result);
  } catch (error) {
    console.error(`[API] Error importing records into ${table}:`, error);
    res.status(500).json({ error: error.message || 'Bulk import failed' });
  }
}

