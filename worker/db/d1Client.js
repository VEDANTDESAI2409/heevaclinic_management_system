import { resolveCollection, tableColumns } from './tables.js';

function nowISO() {
  return new Date().toISOString();
}

function parseHistoricalDateTime(val, fallbackISO = new Date().toISOString()) {
  if (!val) return fallbackISO;
  if (typeof val !== 'string') return fallbackISO;
  const s = val.trim();
  if (!s) return fallbackISO;

  // DD-MM-YYYY or DD-MM-YYYY HH:mm or DD-MM-YYYY HH:mm:ss with optional AM/PM
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    let hours = dmyMatch[4] ? parseInt(dmyMatch[4], 10) : 0;
    const minutes = dmyMatch[5] ? parseInt(dmyMatch[5], 10) : 0;
    const seconds = dmyMatch[6] ? parseInt(dmyMatch[6], 10) : 0;
    const ampm = dmyMatch[7] ? dmyMatch[7].toUpperCase() : null;
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // YYYY-MM-DD with optional time and AM/PM
  const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?)?$/i);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    let hours = ymdMatch[4] ? parseInt(ymdMatch[4], 10) : 0;
    const minutes = ymdMatch[5] ? parseInt(ymdMatch[5], 10) : 0;
    const seconds = ymdMatch[6] ? parseInt(ymdMatch[6], 10) : 0;
    const ampm = ymdMatch[7] ? ymdMatch[7].toUpperCase() : null;
    if (ampm === 'PM' && hours < 12) hours += 12;
    if (ampm === 'AM' && hours === 12) hours = 0;
    const d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString();
  return fallbackISO;
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
  async ensureSchemaIntegrity(db) {
    if (!db) return;
    const migrations = [
      'ALTER TABLE patients ADD COLUMN age INTEGER',
      "ALTER TABLE patients ADD COLUMN marital_status TEXT DEFAULT 'Single'",
      'ALTER TABLE prescription_items ADD COLUMN timing TEXT',
      'ALTER TABLE prescription_items ADD COLUMN quantity TEXT',
      'ALTER TABLE bills ADD COLUMN doctor_phone TEXT',
      'ALTER TABLE bills ADD COLUMN diagnosis TEXT',
      'ALTER TABLE bills ADD COLUMN advice TEXT',
      'ALTER TABLE bills ADD COLUMN next_visit TEXT',
      'ALTER TABLE bill_items ADD COLUMN timing TEXT',
      'ALTER TABLE bill_items ADD COLUMN frequency TEXT',
      'ALTER TABLE bill_items ADD COLUMN duration TEXT',
      'ALTER TABLE bill_items ADD COLUMN composition TEXT',
      'ALTER TABLE bill_items ADD COLUMN notes TEXT',
      'ALTER TABLE bill_items ADD COLUMN returned INTEGER DEFAULT 0',
      'CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id)',
      'CREATE INDEX IF NOT EXISTS idx_prescriptions_doctor_id ON prescriptions(doctor_id)',
    ];

    for (const sql of migrations) {
      try {
        await db.prepare(sql).run();
      } catch (_) {
        // Column already exists or index already exists in SQLite
      }
    }
  },

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

  async getDbVersion(db) {
    try {
      const row = await db.prepare('SELECT value, updated_at FROM counters WHERE key = ? OR id = ? LIMIT 1').bind('DB_VERSION', 'DB_VERSION').first();
      return {
        version: row && row.value != null ? Number(row.value) : 1,
        updatedAt: row?.updated_at || nowISO(),
      };
    } catch (_) {
      return { version: 1, updatedAt: nowISO() };
    }
  },

  async incrementDbVersion(db, now = nowISO()) {
    try {
      await db.prepare(`
        INSERT INTO counters (id, key, value, created_at, updated_at)
        VALUES ('DB_VERSION', 'DB_VERSION', 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          value = counters.value + 1,
          updated_at = excluded.updated_at
      `).bind(now, now).run();
    } catch (e) {
      console.warn('[incrementDbVersion] Failed to bump version:', e?.message || e);
    }
  },

  async getSyncBundle(db) {
    const versionStatus = await this.getDbVersion(db);

    const queries = [
      db.prepare('SELECT * FROM clinic_settings'),
      db.prepare('SELECT * FROM counters'),
      db.prepare('SELECT * FROM doctors ORDER BY name ASC'),
      db.prepare('SELECT * FROM patients ORDER BY updated_at DESC, created_at DESC'),
      db.prepare('SELECT * FROM patient_vitals ORDER BY recorded_at DESC'),
      db.prepare('SELECT * FROM medicine_categories ORDER BY name ASC'),
      db.prepare('SELECT * FROM medicines ORDER BY name ASC'),
      db.prepare('SELECT * FROM medicine_batches ORDER BY expiry ASC'),
      db.prepare('SELECT * FROM inventory_transactions ORDER BY at DESC'),
      db.prepare('SELECT * FROM services ORDER BY name ASC'),
      db.prepare('SELECT * FROM consultations ORDER BY date DESC, time DESC'),
      db.prepare('SELECT * FROM prescriptions ORDER BY date DESC, time DESC'),
      db.prepare('SELECT * FROM prescription_items ORDER BY seq ASC'),
      db.prepare('SELECT * FROM appointments ORDER BY date DESC, time DESC'),
      db.prepare('SELECT * FROM bills ORDER BY date DESC, time DESC'),
      db.prepare('SELECT * FROM bill_items'),
      db.prepare('SELECT * FROM payments ORDER BY at DESC'),
      db.prepare('SELECT * FROM returns ORDER BY at DESC'),
      db.prepare('SELECT * FROM return_items'),
      db.prepare('SELECT * FROM expenses ORDER BY date DESC'),
      db.prepare('SELECT * FROM notifications ORDER BY at DESC'),
      db.prepare('SELECT * FROM activity_logs ORDER BY at DESC LIMIT 150'),
    ];

    const results = await db.batch(queries);

    const data = {
      clinic_settings: results[0]?.results || [],
      counters: results[1]?.results || [],
      doctors: results[2]?.results || [],
      patients: results[3]?.results || [],
      patient_vitals: results[4]?.results || [],
      medicine_categories: results[5]?.results || [],
      medicines: results[6]?.results || [],
      medicine_batches: results[7]?.results || [],
      inventory_transactions: results[8]?.results || [],
      services: results[9]?.results || [],
      consultations: results[10]?.results || [],
      prescriptions: results[11]?.results || [],
      prescription_items: results[12]?.results || [],
      appointments: results[13]?.results || [],
      bills: results[14]?.results || [],
      bill_items: results[15]?.results || [],
      payments: results[16]?.results || [],
      returns: results[17]?.results || [],
      return_items: results[18]?.results || [],
      expenses: results[19]?.results || [],
      notifications: results[20]?.results || [],
      activity_logs: results[21]?.results || [],
    };

    return {
      ok: true,
      version: versionStatus.version,
      updatedAt: versionStatus.updatedAt,
      data,
    };
  },

  async getNextUhidPreview(db) {
    const settingsRow = (await db.prepare('SELECT * FROM clinic_settings LIMIT 1').first()) || {};
    const year = new Date().getFullYear();
    const includeYear = settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false;
    const counterKey = includeYear ? `UHID|${year}` : 'UHID|ALL';
    const pad = Number(settingsRow.uhid_padding) || 6;
    const prefix = (settingsRow.uhid_prefix || 'HC').trim().toUpperCase();
    const start = Number(settingsRow.uhid_start) || 1;

    const countRow = await db.prepare('SELECT COUNT(*) as count FROM patients').first();
    const patientCount = countRow ? Number(countRow.count) : 0;

    const counterRow = await db.prepare('SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1').bind(counterKey, counterKey).first();
    const nextNumber = counterRow && counterRow.value != null ? Number(counterRow.value) + 1 : start;

    const nextUhid = `${prefix}${includeYear ? `-${year}` : ''}-${String(nextNumber).padStart(pad, '0')}`;
    return {
      ok: true,
      nextUhid,
      nextNumber,
      counterKey,
      pad,
      prefix,
      year,
      patientCount,
    };
  },

  async allocatePatient(db, item, options = {}) {
    const now = nowISO();
    const today = now.slice(0, 10);
    const userId = options.userId || item.created_by || null;
    const id = String(item.id || crypto.randomUUID());

    // Check if patient with this id already exists
    const existing = await this.getById(db, 'patients', id);
    if (existing) {
      return this.update(db, 'patients', id, item);
    }

    const settingsRow = (await db.prepare('SELECT * FROM clinic_settings LIMIT 1').first()) || {};
    const year = new Date().getFullYear();
    const includeYear = settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false;
    const counterKey = includeYear ? `UHID|${year}` : 'UHID|ALL';
    const pad = Number(settingsRow.uhid_padding) || 6;
    const prefix = (settingsRow.uhid_prefix || 'HC').trim().toUpperCase();
    const start = Number(settingsRow.uhid_start) || 1;

    const itemAge = item.age !== undefined && item.age !== null && item.age !== ''
      ? Number(item.age)
      : (item.dob ? Math.max(0, Math.floor((Date.now() - new Date(item.dob).getTime()) / (365.25 * 24 * 3600 * 1000))) : null);

    const itemCreatedAt = item.created_at || now;
    const itemRegDate = item.reg_date || itemCreatedAt.slice(0, 10) || today;

    // Retry loop to guarantee concurrency safety and unique UHID allocation across multiple devices
    for (let attempt = 0; attempt < 5; attempt++) {
      const counterRow = await db.prepare('SELECT * FROM counters WHERE key = ? OR id = ? LIMIT 1').bind(counterKey, counterKey).first();
      let nextVal = counterRow && counterRow.value != null ? Number(counterRow.value) + 1 : start;
      if (attempt > 0) nextVal += attempt;

      let uhid = item.uhid ? String(item.uhid).trim() : null;
      if (!uhid) {
        uhid = `${prefix}${includeYear ? `-${year}` : ''}-${String(nextVal).padStart(pad, '0')}`;
      } else {
        const match = uhid.match(/-(\d+)$/);
        if (match) {
          const numInUhid = Number(match[1]);
          if (!isNaN(numInUhid) && numInUhid > nextVal) {
            nextVal = numInUhid;
          }
        }
      }

      const patientRecord = {
        id,
        uhid,
        name: String(item.name || '').trim(),
        age: itemAge,
        gender: item.gender || '',
        mobile: String(item.mobile || ''),
        marital_status: item.marital_status || 'Single',
        address: item.address || '',
        pin: item.pin ? String(item.pin) : '',
        blood_group: item.blood_group || '',
        allergies: item.allergies || '',
        conditions: item.conditions || '',
        current_meds: item.current_meds || '',
        notes: item.notes || '',
        active: item.active !== undefined ? item.active : 1,
        reg_date: itemRegDate,
        created_by: userId,
        created_at: itemCreatedAt,
        updated_at: now,
      };

      const filtered = filterFields('patients', patientRecord);
      const cols = Object.keys(filtered);
      const placeholders = cols.map(() => '?');
      const values = cols.map((c) => filtered[c]);

      const batchStmts = [
        // 1. Atomically update UHID counter
        db.prepare(`
          INSERT INTO counters (id, key, value, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            value = CASE WHEN excluded.value > counters.value THEN excluded.value ELSE counters.value END,
            updated_at = excluded.updated_at
        `).bind(counterKey, counterKey, nextVal, now, now),
        // 2. Insert patient record
        db.prepare(`INSERT INTO patients ("${cols.join('", "')}") VALUES (${placeholders.join(', ')})`).bind(...values),
        // 3. Atomically increment DB_VERSION for instant multi-device sync
        db.prepare(`
          INSERT INTO counters (id, key, value, created_at, updated_at)
          VALUES ('DB_VERSION', 'DB_VERSION', 1, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            value = counters.value + 1,
            updated_at = excluded.updated_at
        `).bind(now, now),
      ];

      try {
        await db.batch(batchStmts);
        return this.getById(db, 'patients', id);
      } catch (err) {
        if (/UNIQUE constraint failed.*patients\.uhid/i.test(err?.message || '') && !item.uhid) {
          continue; // retry with incremented counter
        }
        throw err;
      }
    }
    throw new Error('Could not allocate unique UHID after multiple attempts.');
  },

  async create(db, collection, item, options = {}) {
    const actual = resolveCollection(collection);
    if (actual === 'patients') {
      return this.allocatePatient(db, item, options);
    }
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

    // Ensure unique service_code if actual === 'services'
    if (actual === 'services') {
      if (!record.service_code) {
        const countRow = await db.prepare('SELECT COUNT(*) as count FROM services').first();
        const nextNum = (countRow ? Number(countRow.count) : 0) + 1;
        record.service_code = `SRV-${String(nextNum).padStart(4, '0')}`;
      }
      const existingSvc = await db.prepare('SELECT id FROM services WHERE service_code = ?').bind(record.service_code).first();
      if (existingSvc && existingSvc.id !== id) {
        const countRow = await db.prepare('SELECT COUNT(*) as count FROM services').first();
        record.service_code = `SRV-${String(nextNum).padStart(4, '0')}-${Date.now().toString().slice(-4)}`;
      }
    }

    if (actual === 'medicines') {
      if (record.active === undefined || record.active === null) record.active = 1;
      else record.active = (record.active === 1 || record.active === true || record.active === '1') ? 1 : 0;
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
    await this.incrementDbVersion(db, now);
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

    if (actual === 'services' && patch.service_code) {
      const existingSvc = await db.prepare('SELECT id FROM services WHERE service_code = ? AND id != ?').bind(patch.service_code, strId).first();
      if (existingSvc) {
        delete updated.service_code;
      }
    }

    if (actual === 'medicines' && patch.active !== undefined) {
      updated.active = (patch.active === 1 || patch.active === true || patch.active === '1') ? 1 : 0;
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
    await this.incrementDbVersion(db, now);
    return this.getById(db, actual, strId);
  },

  async remove(db, collection, id) {
    const actual = resolveCollection(collection);
    const strId = String(id);
    const now = nowISO();

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

    await this.incrementDbVersion(db, now);
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
    await this.incrementDbVersion(db, now);
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
      let counterVal = counterRow && counterRow.value != null ? Number(counterRow.value) : (Number(settingsRow.uhid_start) || 1) - 1;

      // Ensure counter is at least the highest numerical suffix in existing patients so deleting patients never recycles UHIDs
      const uhidPrefix = `${prefix}${settingsRow.uhid_include_year !== 0 && settingsRow.uhid_include_year !== false ? `-${year}` : ''}-`;
      const existingUhids = await db.prepare('SELECT uhid FROM patients WHERE uhid LIKE ?').bind(`${uhidPrefix}%`).all();
      let maxExistingSuffix = 0;
      if (existingUhids && existingUhids.results) {
        for (const row of existingUhids.results) {
          const match = String(row.uhid || '').match(/-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > maxExistingSuffix) {
              maxExistingSuffix = num;
            }
          }
        }
      }
      counterVal = Math.max(counterVal, maxExistingSuffix, (Number(settingsRow.uhid_start) || 1) - 1);

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
        const itemCreatedAt = parseHistoricalDateTime(item.created_at || item.date_time, now);
        const itemRegDate = item.reg_date || (itemCreatedAt ? itemCreatedAt.slice(0, 10) : today);
        const p = {
          id: item.id || crypto.randomUUID(),
          uhid,
          name: String(item.name).trim(),
          age: itemAge,
          gender: item.gender,
          mobile: String(item.mobile),
          marital_status: item.marital_status || 'Single',
          address: item.address || '',
          pin: item.pin ? String(item.pin) : '',
          blood_group: item.blood_group || '',
          allergies: item.allergies || '',
          conditions: item.conditions || '',
          current_meds: item.current_meds || '',
          notes: item.notes || '',
          active: 1,
          reg_date: itemRegDate,
          created_by: userId,
          created_at: itemCreatedAt,
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
        await this.incrementDbVersion(db, now);
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

      // Ensure counter is at least the highest numerical suffix in existing medicines
      const { results: existingCodes } = await db.prepare('SELECT medicine_code FROM medicines').all();
      let maxMedCodeSuffix = 0;
      if (existingCodes) {
        for (const row of existingCodes) {
          const m = String(row.medicine_code || '').match(/MD-(\d+)$/i);
          if (m) {
            const n = parseInt(m[1], 10);
            if (!isNaN(n) && n > maxMedCodeSuffix) maxMedCodeSuffix = n;
          }
        }
      }
      counterVal = Math.max(counterVal, maxMedCodeSuffix);

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
        await this.incrementDbVersion(db, now);
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
        await this.incrementDbVersion(db, now);
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
        await this.incrementDbVersion(db, now);
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

        const normalizeToIsoDate = (val, fallback) => {
          if (!val) return fallback;
          const s = String(val).trim();
          const dmy = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
          if (dmy) {
            const p2 = (n) => String(n).padStart(2, '0');
            return `${dmy[3]}-${p2(dmy[2])}-${p2(dmy[1])}`;
          }
          return s;
        };

        const batchId = item.id || crypto.randomUUID();
        const batch = {
          id: batchId,
          medicine_id: med.id,
          batch_no: batchNo,
          mfg_date: normalizeToIsoDate(item.mfg_date, today),
          expiry: normalizeToIsoDate(item.expiry, '9999-12-31'),
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
        await this.incrementDbVersion(db, now);
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

    if (actual === 'services') {
      const newServices = [];
      const skipped = [];
      const batchStmts = [];

      for (const item of items) {
        const name = String(item.name || '').trim();
        if (!name) {
          skipped.push({ item, reason: 'Missing service name' });
          continue;
        }
        const price = Number(item.price);
        if (isNaN(price) || price < 0) {
          skipped.push({ item, reason: 'Price must be a valid positive number' });
          continue;
        }

        const svc = {
          id: item.id || crypto.randomUUID(),
          service_code: item.service_code || `SVC-${Date.now().toString(36).toUpperCase()}`,
          name,
          type: item.type || 'Consultation',
          price,
          description: item.description || '',
          active: 1,
          created_at: now,
          updated_at: now,
        };
        newServices.push(svc);

        const filtered = filterFields('services', svc);
        const cols = Object.keys(filtered);
        const placeholders = cols.map(() => '?');
        batchStmts.push(
          db.prepare(`INSERT OR REPLACE INTO services ("${cols.join('", "')}") VALUES (${placeholders.join(', ')})`).bind(...cols.map((c) => filtered[c]))
        );
      }

      if (batchStmts.length > 0) {
        await db.batch(batchStmts);
        await this.incrementDbVersion(db, now);
      }

      return {
        success: true,
        count: newServices.length,
        skipped: skipped.length,
        skippedDetails: skipped,
        records: newServices,
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
