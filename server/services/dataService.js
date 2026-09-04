import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateId } from '../utils/idGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Table name aliases (logical -> physical/json file)
const tableAliases = {
  settings: 'clinic_settings',
  batches: 'medicine_batches',
  inventory_txns: 'inventory_transactions',
};

export const resolveCollection = (name) => tableAliases[name] || name;

class DataService {
  constructor() {
    this.cache = new Map();
    this.writeLocks = new Map();
  }

  getFilePath(collection) {
    const filename = `${resolveCollection(collection)}.json`;
    return path.join(DATA_DIR, filename);
  }

  async readRaw(collection) {
    const actual = resolveCollection(collection);
    if (this.cache.has(actual)) {
      return this.cache.get(actual);
    }
    const filePath = this.getFilePath(actual);
    if (!fs.existsSync(filePath)) {
      const initial = [];
      await this.writeRaw(actual, initial);
      this.cache.set(actual, initial);
      return initial;
    }
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const data = JSON.parse(content || '[]');
      const arrayData = Array.isArray(data) ? data : [data];
      this.cache.set(actual, arrayData);
      return arrayData;
    } catch (error) {
      console.error(`[DataService] Error reading ${actual}.json:`, error.message);
      const fallback = [];
      this.cache.set(actual, fallback);
      return fallback;
    }
  }

  async writeRaw(collection, data) {
    const actual = resolveCollection(collection);
    const filePath = this.getFilePath(actual);
    const tempPath = `${filePath}.tmp-${Date.now()}`;
    const serialized = JSON.stringify(data, null, 2);

    // Atomic write via temp file
    await fs.promises.writeFile(tempPath, serialized, 'utf8');
    await fs.promises.rename(tempPath, filePath);
    this.cache.set(actual, data);
  }

  async getAll(collection) {
    const rows = await this.readRaw(collection);
    const actual = resolveCollection(collection);

    // If returns, populate return_items
    if (actual === 'returns') {
      const returnItems = await this.readRaw('return_items');
      return rows.map((r) => ({
        ...r,
        items: returnItems.filter((it) => it.return_id === r.id),
      }));
    }

    // Default descending order by updated_at or created_at if available
    return [...rows].sort((a, b) => {
      const timeA = a.updated_at || a.created_at || a.date || '';
      const timeB = b.updated_at || b.created_at || b.date || '';
      if (timeA && timeB) {
        return timeA < timeB ? 1 : timeA > timeB ? -1 : 0;
      }
      return 0;
    });
  }

  async getById(collection, id) {
    if (id == null) return null;
    const strId = String(id);
    const rows = await this.readRaw(collection);
    const actual = resolveCollection(collection);

    let row = null;
    if (actual === 'counters') {
      row = rows.find((r) => String(r.key) === strId || String(r.id) === strId);
    } else {
      row = rows.find((r) => String(r.id) === strId);
    }

    if (!row) return null;

    if (actual === 'returns') {
      const returnItems = await this.readRaw('return_items');
      return {
        ...row,
        items: returnItems.filter((it) => it.return_id === row.id),
      };
    }

    return { ...row };
  }

  async create(collection, item) {
    const actual = resolveCollection(collection);
    const rows = await this.readRaw(actual);
    const now = new Date().toISOString();

    const id = actual === 'counters'
      ? String(item.key || item.id || generateId())
      : String(item.id || generateId());

    // Check if record already exists
    const existingIndex = actual === 'counters'
      ? rows.findIndex((r) => String(r.key) === id || String(r.id) === id)
      : rows.findIndex((r) => String(r.id) === id);

    if (existingIndex !== -1) {
      // Existing record -> update it
      return this.update(actual, id, item);
    }

    // Check medicine_categories for duplicate name
    if (actual === 'medicine_categories' && item.name) {
      const existingByName = rows.find(
        (r) => String(r.name).toLowerCase() === String(item.name).trim().toLowerCase()
      );
      if (existingByName) {
        return { ...existingByName };
      }
    }

    const record = {
      ...item,
      id,
      created_at: item.created_at || now,
      updated_at: item.updated_at || now,
    };

    if (actual === 'counters') {
      record.key = String(item.key || id);
    }

    rows.push(record);
    await this.writeRaw(actual, rows);

    // If returns with nested items
    if (actual === 'returns' && Array.isArray(item.items)) {
      const returnItems = await this.readRaw('return_items');
      for (const it of item.items) {
        returnItems.push({
          id: generateId(),
          return_id: id,
          bill_item_id: it.bill_item_id || null,
          name: it.name || '',
          qty: Number(it.qty) || 0,
          batch_no: it.batch_no || '',
          amount: Number(it.amount) || 0,
        });
      }
      await this.writeRaw('return_items', returnItems);
    }

    return record;
  }

  async update(collection, id, patch) {
    const actual = resolveCollection(collection);
    const strId = String(id);
    const rows = await this.readRaw(actual);
    const now = new Date().toISOString();

    let index = -1;
    if (actual === 'counters') {
      index = rows.findIndex((r) => String(r.key) === strId || String(r.id) === strId);
    } else {
      index = rows.findIndex((r) => String(r.id) === strId);
    }

    // If record doesn't exist, create it (upsert behavior)
    if (index === -1) {
      return this.create(actual, { ...patch, id: strId });
    }

    const existing = rows[index];
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      updated_at: now,
    };

    if (actual === 'counters' && patch.key) {
      updated.key = String(patch.key);
    }

    rows[index] = updated;
    await this.writeRaw(actual, rows);
    return updated;
  }

  async upsert(collection, id, data) {
    return this.update(collection, id, data);
  }

  async remove(collection, id) {
    const actual = resolveCollection(collection);
    const strId = String(id);
    const rows = await this.readRaw(actual);

    let index = -1;
    if (actual === 'counters') {
      index = rows.findIndex((r) => String(r.key) === strId || String(r.id) === strId);
    } else {
      index = rows.findIndex((r) => String(r.id) === strId);
    }

    if (index === -1) {
      return false;
    }

    rows.splice(index, 1);
    await this.writeRaw(actual, rows);

    // If removing return, remove related return_items
    if (actual === 'returns') {
      const returnItems = await this.readRaw('return_items');
      const filtered = returnItems.filter((it) => it.return_id !== strId);
      await this.writeRaw('return_items', filtered);
    }

    return true;
  }

  // Clinic settings key-value helper
  async updateClinicSetting(key, value) {
    const rows = await this.readRaw('clinic_settings');
    const settings = rows[0] || { id: '1' };
    settings[key] = value;
    settings.updated_at = new Date().toISOString();
    await this.writeRaw('clinic_settings', [settings]);
    return { key, value };
  }

  // Bulk import for master datasets (patients, medicines, categories, doctors, batches)
  async bulkImport(collection, items, options = {}) {
    const actual = resolveCollection(collection);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const userId = options.userId || null;

    if (!Array.isArray(items) || items.length === 0) {
      return { success: true, count: 0, skipped: 0, records: [] };
    }

    if (actual === 'patients') {
      const settingsRows = await this.readRaw('clinic_settings');
      const s = settingsRows[0] || {};
      const year = new Date().getFullYear();
      const counterKey = s.uhid_include_year !== false ? `UHID|${year}` : 'UHID|ALL';
      const pad = Number(s.uhid_padding) || 6;
      const prefix = (s.uhid_prefix || 'HC').trim().toUpperCase();

      const counters = await this.readRaw('counters');
      let counterIdx = counters.findIndex((c) => c.key === counterKey || c.id === counterKey);
      let counterVal = counterIdx !== -1 ? counters[counterIdx].value : (Number(s.uhid_start) || 1) - 1;

      const patients = await this.readRaw('patients');
      const newPatients = [];
      const skipped = [];

      for (const item of items) {
        if (!item.name || !item.dob || !item.gender || !item.mobile) {
          skipped.push({ item, reason: 'Missing required field (name, dob, gender, or mobile)' });
          continue;
        }
        counterVal++;
        const uhid = `${prefix}${s.uhid_include_year !== false ? `-${year}` : ''}-${String(counterVal).padStart(pad, '0')}`;
        const p = {
          id: item.id || generateId(),
          uhid: item.uhid || uhid,
          name: String(item.name).trim(),
          dob: item.dob,
          approx_age: null,
          gender: item.gender,
          mobile: String(item.mobile),
          alt_mobile: item.alt_mobile ? String(item.alt_mobile) : '',
          email: item.email || '',
          address: item.address || '',
          city: item.city || '',
          state: item.state || 'Gujarat',
          pin: item.pin ? String(item.pin) : '',
          blood_group: item.blood_group || '',
          allergies: item.allergies || '',
          conditions: item.conditions || '',
          current_meds: item.current_meds || '',
          notes: item.notes || '',
          ec_name: item.ec_name || '',
          ec_number: item.ec_number ? String(item.ec_number) : '',
          ec_relation: item.ec_relation || '',
          active: 1,
          reg_date: item.reg_date || today,
          created_by: userId,
          created_at: now,
          updated_at: now,
        };
        newPatients.push(p);
        patients.push(p);
      }

      const updatedCounter = {
        id: counterKey,
        key: counterKey,
        value: counterVal,
        updated_at: now,
      };
      if (counterIdx !== -1) {
        counters[counterIdx] = updatedCounter;
      } else {
        counters.push(updatedCounter);
      }

      await this.writeRaw('counters', counters);
      await this.writeRaw('patients', patients);

      return {
        success: true,
        count: newPatients.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newPatients,
        extraTables: {
          counters: [updatedCounter],
        },
      };
    }

    if (actual === 'medicines') {
      const counters = await this.readRaw('counters');
      let counterIdx = counters.findIndex((c) => c.key === 'MED|ALL' || c.id === 'MED|ALL');
      let counterVal = counterIdx !== -1 ? counters[counterIdx].value : 0;

      const medicines = await this.readRaw('medicines');
      const categories = await this.readRaw('medicine_categories');
      const existingMedNames = new Set(medicines.map((m) => String(m.name).trim().toLowerCase()));
      const existingCatNames = new Set(categories.map((c) => String(c.name).trim().toLowerCase()));

      const newMedicines = [];
      const newCategories = [];
      const skipped = [];

      for (const item of items) {
        const name = String(item.name || '').trim();
        if (!name) {
          skipped.push({ item, reason: 'Missing medicine name' });
          continue;
        }
        if (existingMedNames.has(name.toLowerCase())) {
          skipped.push({ item, reason: `Medicine "${name}" already exists` });
          continue;
        }

        const catName = String(item.category || 'Other').trim();
        if (catName && !existingCatNames.has(catName.toLowerCase())) {
          const newCat = {
            id: generateId(),
            name: catName,
            created_at: now,
            updated_at: now,
          };
          categories.push(newCat);
          existingCatNames.add(catName.toLowerCase());
          newCategories.push(newCat);
        }

        counterVal++;
        const medicine_code = item.medicine_code || `MD-${String(counterVal).padStart(4, '0')}`;
        const med = {
          id: item.id || generateId(),
          medicine_code,
          name,
          generic: item.generic || '',
          brand: item.brand || name,
          category: catName,
          manufacturer: item.manufacturer || '',
          type: item.type || 'Tablet',
          strength: item.strength || '',
          unit: item.unit || 'strip',
          barcode: item.barcode || '',
          purchase_price: Number(item.purchase_price) || 0,
          selling_price: Number(item.selling_price) || 0,
          min_stock: Number(item.min_stock) || 0,
          location: item.location || '',
          description: item.description || '',
          active: 1,
          created_at: now,
          updated_at: now,
        };
        existingMedNames.add(name.toLowerCase());
        newMedicines.push(med);
        medicines.push(med);
      }

      const updatedCounter = {
        id: 'MED|ALL',
        key: 'MED|ALL',
        value: counterVal,
        updated_at: now,
      };
      if (counterIdx !== -1) {
        counters[counterIdx] = updatedCounter;
      } else {
        counters.push(updatedCounter);
      }

      await this.writeRaw('counters', counters);
      if (newCategories.length > 0) {
        await this.writeRaw('medicine_categories', categories);
      }
      await this.writeRaw('medicines', medicines);

      return {
        success: true,
        count: newMedicines.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newMedicines,
        extraTables: {
          counters: [updatedCounter],
          ...(newCategories.length > 0 ? { medicine_categories: newCategories } : {}),
        },
      };
    }

    if (actual === 'medicine_categories') {
      const categories = await this.readRaw('medicine_categories');
      const existingCatNames = new Set(categories.map((c) => String(c.name).trim().toLowerCase()));
      const newCategories = [];
      const skipped = [];

      for (const item of items) {
        const name = String(item.name || '').trim();
        if (!name) {
          skipped.push({ item, reason: 'Missing category name' });
          continue;
        }
        if (existingCatNames.has(name.toLowerCase())) {
          skipped.push({ item, reason: `Category "${name}" already exists` });
          continue;
        }
        const cat = {
          id: item.id || generateId(),
          name,
          created_at: now,
          updated_at: now,
        };
        existingCatNames.add(name.toLowerCase());
        newCategories.push(cat);
        categories.push(cat);
      }

      await this.writeRaw('medicine_categories', categories);
      return {
        success: true,
        count: newCategories.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newCategories,
      };
    }

    if (actual === 'doctors') {
      const doctors = await this.readRaw('doctors');
      const existingDocNames = new Set(doctors.map((d) => String(d.name).trim().toLowerCase()));
      const newDoctors = [];
      const skipped = [];

      for (const item of items) {
        const name = String(item.name || '').trim();
        if (!name) {
          skipped.push({ item, reason: 'Missing doctor name' });
          continue;
        }
        if (existingDocNames.has(name.toLowerCase())) {
          skipped.push({ item, reason: `Doctor "${name}" already exists` });
          continue;
        }
        const doc = {
          id: item.id || generateId(),
          name,
          qualification: item.qualification || '',
          specialization: item.specialization || '',
          phone: item.phone ? String(item.phone) : '',
          email: item.email || '',
          active: 1,
          created_at: now,
          updated_at: now,
        };
        existingDocNames.add(name.toLowerCase());
        newDoctors.push(doc);
        doctors.push(doc);
      }

      await this.writeRaw('doctors', doctors);
      return {
        success: true,
        count: newDoctors.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newDoctors,
      };
    }

    if (actual === 'medicine_batches') {
      const medicines = await this.readRaw('medicines');
      const batches = await this.readRaw('medicine_batches');
      const txns = await this.readRaw('inventory_transactions');
      const medMapById = new Map(medicines.map((m) => [m.id, m]));
      const medMapByName = new Map(medicines.map((m) => [String(m.name).trim().toLowerCase(), m]));

      const newBatches = [];
      const newTxns = [];
      const skipped = [];

      for (const item of items) {
        let med = null;
        if (item.medicine_id && medMapById.has(item.medicine_id)) {
          med = medMapById.get(item.medicine_id);
        } else if (item.medicine_name && medMapByName.has(String(item.medicine_name).trim().toLowerCase())) {
          med = medMapByName.get(String(item.medicine_name).trim().toLowerCase());
        }
        if (!med) {
          skipped.push({ item, reason: `Medicine "${item.medicine_name || item.medicine_id}" not found` });
          continue;
        }
        const batchNo = String(item.batch_no || '').trim().toUpperCase();
        if (!batchNo) {
          skipped.push({ item, reason: 'Missing batch number' });
          continue;
        }
        const qty = Number(item.quantity);
        if (!(qty > 0)) {
          skipped.push({ item, reason: 'Quantity must be positive' });
          continue;
        }

        const batchId = item.id || generateId();
        const batch = {
          id: batchId,
          medicine_id: med.id,
          batch_no: batchNo,
          mfg_date: item.mfg_date || today,
          expiry: item.expiry || '9999-12-31',
          quantity: qty,
          available: qty,
          purchase_price: Number(item.purchase_price) || med.purchase_price || 0,
          status: 'active',
          created_at: now,
          updated_at: now,
        };
        const txn = {
          id: generateId(),
          medicine_id: med.id,
          batch_id: batchId,
          type: 'ADJUSTMENT',
          qty: qty,
          ref_id: null,
          at: now,
          by: userId,
          note: `Batch ${batchNo} imported via CSV`,
          created_at: now,
          updated_at: now,
        };
        newBatches.push(batch);
        batches.push(batch);
        newTxns.push(txn);
        txns.push(txn);
      }

      await this.writeRaw('medicine_batches', batches);
      await this.writeRaw('inventory_transactions', txns);

      return {
        success: true,
        count: newBatches.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newBatches,
        extraTables: {
          inventory_txns: newTxns,
        },
      };
    }

    // Default fallback: create each record
    const createdList = [];
    for (const item of items) {
      const rec = await this.create(actual, item);
      createdList.push(rec);
    }
    return {
      success: true,
      count: createdList.length,
      skipped: 0,
      records: createdList,
    };
  }
}

export const dataService = new DataService();
export default dataService;
