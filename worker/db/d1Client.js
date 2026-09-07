import { resolveCollection, tableColumns } from './tables.js';

function nowISO() {
  return new Date().toISOString();
}

function filterFields(table, obj) {
  const allowed = tableColumns[table];
  if (!allowed) return obj;
  const filtered = {};
  for (const col of allowed) {
    if (obj[col] !== undefined) {
      filtered[col] = obj[col];
    }
  }
  return filtered;
}

export const d1Client = {
  async getAll(db, collection) {
    const actual = resolveCollection(collection);
    const query = `SELECT * FROM "${actual}" ORDER BY CASE WHEN updated_at IS NOT NULL THEN updated_at WHEN created_at IS NOT NULL THEN created_at ELSE id END DESC`;
    const { results } = await db.prepare(query).all();
    const rows = results || [];

    if (actual === 'returns') {
      const { results: itemResults } = await db.prepare('SELECT * FROM return_items').all();
      const returnItems = itemResults || [];
      return rows.map((r) => ({
        ...r,
        items: returnItems.filter((it) => it.return_id === r.id),
      }));
    }

    return rows;
  },

  async getById(db, collection, id) {
    if (id == null) return null;
    const strId = String(id);
    const actual = resolveCollection(collection);

    let query;
    let stmt;
    if (actual === 'counters') {
      query = 'SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1';
      stmt = db.prepare(query).bind(strId, strId);
    } else {
      query = `SELECT * FROM "${actual}" WHERE id = ? LIMIT 1`;
      stmt = db.prepare(query).bind(strId);
    }

    const row = await stmt.first();
    if (!row) return null;

    if (actual === 'returns') {
      const { results: itemResults } = await db
        .prepare('SELECT * FROM return_items WHERE return_id = ?')
        .bind(row.id)
        .all();
      return {
        ...row,
        items: itemResults || [],
      };
    }

    return row;
  },

  async create(db, collection, item) {
    const actual = resolveCollection(collection);
    const now = nowISO();
    const id = actual === 'counters'
      ? String(item.key || item.id || crypto.randomUUID())
      : String(item.id || crypto.randomUUID());

    // Check if record already exists -> update it
    const existing = await this.getById(db, actual, id);
    if (existing) {
      return this.update(db, actual, id, item);
    }

    // Check medicine_categories for duplicate name
    if (actual === 'medicine_categories' && item.name) {
      const catCheck = await db
        .prepare('SELECT * FROM medicine_categories WHERE LOWER(name) = LOWER(?) LIMIT 1')
        .bind(String(item.name).trim())
        .first();
      if (catCheck) {
        return catCheck;
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

    const filtered = filterFields(actual, record);
    const cols = Object.keys(filtered);
    const placeholders = cols.map(() => '?');
    const values = cols.map((c) => filtered[c]);

    const insertSql = `INSERT INTO "${actual}" ("${cols.join('", "')}") VALUES (${placeholders.join(', ')})`;
    const stmts = [db.prepare(insertSql).bind(...values)];

    // If returns with nested items
    if (actual === 'returns' && Array.isArray(item.items)) {
      for (const it of item.items) {
        const retItem = {
          id: crypto.randomUUID(),
          return_id: id,
          bill_item_id: it.bill_item_id || null,
          name: it.name || '',
          qty: Number(it.qty) || 0,
          batch_no: it.batch_no || '',
          amount: Number(it.amount) || 0,
          created_at: now,
          updated_at: now,
        };
        const retFiltered = filterFields('return_items', retItem);
        const rCols = Object.keys(retFiltered);
        const rPlaceholders = rCols.map(() => '?');
        const rValues = rCols.map((c) => retFiltered[c]);
        stmts.push(
          db.prepare(`INSERT INTO return_items ("${rCols.join('", "')}") VALUES (${rPlaceholders.join(', ')})`).bind(...rValues)
        );
      }
    }

    await db.batch(stmts);
    return this.getById(db, actual, id);
  },

  async update(db, collection, id, patch) {
    const actual = resolveCollection(collection);
    const strId = String(id);
    const existing = await this.getById(db, actual, strId);

    // If record doesn't exist, create it (upsert behavior)
    if (!existing) {
      return this.create(db, actual, { ...patch, id: strId });
    }

    const now = nowISO();
    const updated = {
      ...existing,
      ...patch,
      id: existing.id,
      updated_at: now,
    };

    if (actual === 'counters' && patch.key) {
      updated.key = String(patch.key);
    }

    const filtered = filterFields(actual, updated);
    const cols = Object.keys(filtered).filter((c) => c !== 'id');
    const setClauses = cols.map((c) => `"${c}" = ?`);
    const values = cols.map((c) => filtered[c]);

    let updateSql;
    if (actual === 'counters') {
      updateSql = `UPDATE counters SET ${setClauses.join(', ')} WHERE key = ? OR id = ?`;
      values.push(existing.key || strId, strId);
    } else {
      updateSql = `UPDATE "${actual}" SET ${setClauses.join(', ')} WHERE id = ?`;
      values.push(strId);
    }

    await db.prepare(updateSql).bind(...values).run();
    return this.getById(db, actual, strId);
  },

  async remove(db, collection, id) {
    const actual = resolveCollection(collection);
    const strId = String(id);

    let deleteSql;
    if (actual === 'counters') {
      deleteSql = 'DELETE FROM counters WHERE key = ? OR id = ?';
      await db.prepare(deleteSql).bind(strId, strId).run();
    } else {
      deleteSql = `DELETE FROM "${actual}" WHERE id = ?`;
      await db.prepare(deleteSql).bind(strId).run();
    }

    if (actual === 'returns') {
      await db.prepare('DELETE FROM return_items WHERE return_id = ?').bind(strId).run();
    }

    if (actual === 'prescriptions') {
      await db.prepare('DELETE FROM prescription_items WHERE prescription_id = ?').bind(strId).run();
    }

    if (actual === 'bills') {
      await db.prepare('DELETE FROM bill_items WHERE bill_id = ?').bind(strId).run();
      await db.prepare('DELETE FROM payments WHERE bill_id = ?').bind(strId).run();
    }

    return true;
  },

  async updateClinicSetting(db, key, value) {
    const settingsRow = await db.prepare('SELECT * FROM clinic_settings LIMIT 1').first();
    const now = nowISO();
    const settingId = settingsRow ? settingsRow.id : '1';

    if (settingsRow && key in settingsRow) {
      await db
        .prepare(`UPDATE clinic_settings SET "${key}" = ?, updated_at = ? WHERE id = ?`)
        .bind(value, now, settingId)
        .run();
    } else if (!settingsRow) {
      await db
        .prepare(`INSERT INTO clinic_settings (id, "${key}", created_at, updated_at) VALUES ('1', ?, ?, ?)`)
        .bind(value, now, now)
        .run();
    }
    return { key, value };
  },

  async bulkImport(db, collection, items, options = {}) {
    const actual = resolveCollection(collection);
    const now = nowISO();
    const today = now.slice(0, 10);
    const userId = options.userId || null;

    if (!Array.isArray(items) || items.length === 0) {
      return { success: true, count: 0, skipped: 0, records: [] };
    }

    if (actual === 'patients') {
      const settingsRow = (await db.prepare('SELECT * FROM clinic_settings LIMIT 1').first()) || {};
      const year = new Date().getFullYear();
      const counterKey = settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false
        ? `UHID|${year}`
        : 'UHID|ALL';
      const pad = Number(settingsRow.uhid_padding) || 6;
      const prefix = (settingsRow.uhid_prefix || 'HC').trim().toUpperCase();

      const counterRow = await db.prepare('SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1').bind(counterKey, counterKey).first();
      let counterVal = counterRow ? Number(counterRow.value) : (Number(settingsRow.uhid_start) || 1) - 1;

      const newPatients = [];
      const skipped = [];
      const batchStmts = [];
      for (const item of items) {
        const itemAge = item.age !== undefined && item.age !== null && item.age !== ''
          ? Number(item.age)
          : (item.dob ? Math.max(0, Math.floor((Date.now() - new Date(item.dob).getTime()) / (365.25 * 24 * 3600 * 1000))) : null);
        if (!item.name || itemAge == null || isNaN(itemAge) || !item.gender || !item.mobile) {
          skipped.push({ item, reason: 'Missing required field (name, age, gender, or mobile)' });
          continue;
        }
        counterVal++;
        const uhid = item.uhid || `${prefix}${settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false ? `-${year}` : ''}-${String(counterVal).padStart(pad, '0')}`;
        const p = {
          id: item.id || crypto.randomUUID(),
          uhid,
          name: String(item.name).trim(),
          age: itemAge,
          gender: item.gender,
          mobile: String(item.mobile),
          alt_mobile: item.alt_mobile ? String(item.alt_mobile) : '',
          email: item.email || '',
          marital_status: item.marital_status || 'Single',
          address: item.address || '',
          pin: item.pin ? String(item.pin) : '',
          blood_group: item.blood_group || '',
          allergies: item.allergies || '',
          conditions: item.conditions || '',
          current_meds: item.current_meds || '',
          notes: item.notes || '',
          active: 1,
          reg_date: item.reg_date || today,
          created_by: userId,
          created_at: now,
          updated_at: now,
        };
        newPatients.push(p);

        const filtered = filterFields('patients', p);
        const cols = Object.keys(filtered);
        const placeholders = cols.map(() => '?');
        batchStmts.push(
          db.prepare(`INSERT OR REPLACE INTO patients ("${cols.join('", "')}") VALUES (${placeholders.join(', ')})`).bind(...cols.map((c) => filtered[c]))
        );
      }

      const updatedCounter = {
        id: counterKey,
        key: counterKey,
        value: counterVal,
        updated_at: now,
      };
      batchStmts.push(
        db.prepare('INSERT OR REPLACE INTO counters (id, key, value, updated_at) VALUES (?, ?, ?, ?)').bind(counterKey, counterKey, counterVal, now)
      );

      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
      }

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
      const counterRow = await db.prepare("SELECT * FROM counters WHERE key = 'MED|ALL' OR id = 'MED|ALL' LIMIT 1").first();
      let counterVal = counterRow ? Number(counterRow.value) : 0;

      const { results: existingMeds } = await db.prepare('SELECT id, name FROM medicines').all();
      const { results: existingCats } = await db.prepare('SELECT id, name FROM medicine_categories').all();

      const existingMedNames = new Set((existingMeds || []).map((m) => String(m.name).trim().toLowerCase()));
      const existingCatNames = new Set((existingCats || []).map((c) => String(c.name).trim().toLowerCase()));

      const newMedicines = [];
      const newCategories = [];
      const skipped = [];
      const batchStmts = [];

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
            id: crypto.randomUUID(),
            name: catName,
            created_at: now,
            updated_at: now,
          };
          existingCatNames.add(catName.toLowerCase());
          newCategories.push(newCat);
          batchStmts.push(
            db.prepare('INSERT OR REPLACE INTO medicine_categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(newCat.id, newCat.name, now, now)
          );
        }

        counterVal++;
        const medicine_code = item.medicine_code || `MD-${String(counterVal).padStart(4, '0')}`;
        const med = {
          id: item.id || crypto.randomUUID(),
          medicine_code,
          name,
          generic: item.generic || '',
          brand: item.brand || name,
          category: catName,
          type: item.type || 'Tablet',
          strength: item.strength || '',
          unit: item.unit || 'strip',
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

        const filtered = filterFields('medicines', med);
        const cols = Object.keys(filtered);
        const placeholders = cols.map(() => '?');
        batchStmts.push(
          db.prepare(`INSERT OR REPLACE INTO medicines ("${cols.join('", "')}") VALUES (${placeholders.join(', ')})`).bind(...cols.map((c) => filtered[c]))
        );
      }

      const updatedCounter = {
        id: 'MED|ALL',
        key: 'MED|ALL',
        value: counterVal,
        updated_at: now,
      };
      batchStmts.push(
        db.prepare('INSERT OR REPLACE INTO counters (id, key, value, updated_at) VALUES (?, ?, ?, ?)').bind('MED|ALL', 'MED|ALL', counterVal, now)
      );

      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
      }

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
      const { results: existingCats } = await db.prepare('SELECT id, name FROM medicine_categories').all();
      const existingCatNames = new Set((existingCats || []).map((c) => String(c.name).trim().toLowerCase()));

      const newCategories = [];
      const skipped = [];
      const batchStmts = [];

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
          id: item.id || crypto.randomUUID(),
          name,
          created_at: now,
          updated_at: now,
        };
        existingCatNames.add(name.toLowerCase());
        newCategories.push(cat);
        batchStmts.push(
          db.prepare('INSERT OR REPLACE INTO medicine_categories (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').bind(cat.id, cat.name, now, now)
        );
      }

      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
      }

      return {
        success: true,
        count: newCategories.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newCategories,
      };
    }

    if (actual === 'doctors') {
      const { results: existingDocs } = await db.prepare('SELECT id, name FROM doctors').all();
      const existingDocNames = new Set((existingDocs || []).map((d) => String(d.name).trim().toLowerCase()));

      const newDoctors = [];
      const skipped = [];
      const batchStmts = [];

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
          id: item.id || crypto.randomUUID(),
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

        const filtered = filterFields('doctors', doc);
        const cols = Object.keys(filtered);
        const placeholders = cols.map(() => '?');
        batchStmts.push(
          db.prepare(`INSERT OR REPLACE INTO doctors ("${cols.join('", "')}") VALUES (${placeholders.join(', ')})`).bind(...cols.map((c) => filtered[c]))
        );
      }

      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
      }

      return {
        success: true,
        count: newDoctors.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newDoctors,
      };
    }

    if (actual === 'medicine_batches') {
      const { results: meds } = await db.prepare('SELECT id, name, purchase_price FROM medicines').all();
      const medMapById = new Map((meds || []).map((m) => [m.id, m]));
      const medMapByName = new Map((meds || []).map((m) => [String(m.name).trim().toLowerCase(), m]));

      const newBatches = [];
      const newTxns = [];
      const skipped = [];
      const batchStmts = [];

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

        const batchId = item.id || crypto.randomUUID();
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
          id: crypto.randomUUID(),
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
        newTxns.push(txn);

        const bFiltered = filterFields('medicine_batches', batch);
        const bCols = Object.keys(bFiltered);
        const bPlaceholders = bCols.map(() => '?');
        batchStmts.push(
          db.prepare(`INSERT OR REPLACE INTO medicine_batches ("${bCols.join('", "')}") VALUES (${bPlaceholders.join(', ')})`).bind(...bCols.map((c) => bFiltered[c]))
        );

        const tFiltered = filterFields('inventory_transactions', txn);
        const tCols = Object.keys(tFiltered);
        const tPlaceholders = tCols.map(() => '?');
        batchStmts.push(
          db.prepare(`INSERT OR REPLACE INTO inventory_transactions ("${tCols.join('", "')}") VALUES (${tPlaceholders.join(', ')})`).bind(...tCols.map((c) => tFiltered[c]))
        );
      }

      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
      }

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

    // Generic fallback: insert items
    const createdList = [];
    for (const item of items) {
      const rec = await this.create(db, actual, item);
      createdList.push(rec);
    }
    return {
      success: true,
      count: createdList.length,
      skipped: 0,
      records: createdList,
    };
  },
};

export default d1Client;
