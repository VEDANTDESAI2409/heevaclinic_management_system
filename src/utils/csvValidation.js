import { validMobile, dkey, isValidDDMMYYYY, parseDDMMYYYY } from '../utils.js';
import { mapCSVRows, inspectHeaders, cleanCurrency, normalizeValue } from './csvMapping.js';

const BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const GENDERS = new Set(['m', 'f', 'other', 'male', 'female']);

function isValidDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + 'T00:00:00Z');
  return !isNaN(d.getTime()) && dateStr === d.toISOString().slice(0, 10);
}

function cleanDigits(val) {
  let s = String(val || '').replace(/[\s()-]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.startsWith('91') && s.length === 12) s = s.slice(2);
  else if (s.startsWith('0') && s.length === 11) s = s.slice(1);
  return s.replace(/\D/g, '');
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseHistoricalDateTime(rawDateTime, today) {
  let itemCreatedAt = new Date().toISOString();
  let regDate = today;
  if (!rawDateTime) return { itemCreatedAt, regDate, error: null };

  const s = String(rawDateTime).trim();

  // 1. DD-MM-YYYY or DD/MM/YYYY with optional time
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10);
    const year = parseInt(dmyMatch[3], 10);
    const hour = dmyMatch[4] !== undefined ? parseInt(dmyMatch[4], 10) : 0;
    const minute = dmyMatch[5] !== undefined ? parseInt(dmyMatch[5], 10) : 0;
    const second = dmyMatch[6] !== undefined ? parseInt(dmyMatch[6], 10) : 0;

    if (month < 1 || month > 12) return { error: 'Invalid month in Date & Time (must be 01–12)' };
    if (year < 1900 || year > 2100) return { error: 'Invalid year in Date & Time (1900–2100)' };
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) return { error: `Invalid day in Date & Time for month ${month} (must be 01–${daysInMonth})` };
    if (hour < 0 || hour > 23) return { error: 'Invalid hour in Date & Time (must be 00–23)' };
    if (minute < 0 || minute > 59) return { error: 'Invalid minute in Date & Time (must be 00–59)' };
    if (second < 0 || second > 59) return { error: 'Invalid second in Date & Time (must be 00–59)' };

    const p2 = (n) => String(n).padStart(2, '0');
    itemCreatedAt = `${year}-${p2(month)}-${p2(day)}T${p2(hour)}:${p2(minute)}:${p2(second)}.000Z`;
    regDate = `${year}-${p2(month)}-${p2(day)}`;
    return { itemCreatedAt, regDate, error: null };
  }

  // 2. YYYY-MM-DD with optional time
  const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[\sT](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10);
    const day = parseInt(ymdMatch[3], 10);
    const hour = ymdMatch[4] !== undefined ? parseInt(ymdMatch[4], 10) : 0;
    const minute = ymdMatch[5] !== undefined ? parseInt(ymdMatch[5], 10) : 0;
    const second = ymdMatch[6] !== undefined ? parseInt(ymdMatch[6], 10) : 0;

    if (month < 1 || month > 12) return { error: 'Invalid month in Date & Time (must be 01–12)' };
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) return { error: `Invalid day in Date & Time for month ${month} (must be 01–${daysInMonth})` };

    const p2 = (n) => String(n).padStart(2, '0');
    itemCreatedAt = `${year}-${p2(month)}-${p2(day)}T${p2(hour)}:${p2(minute)}:${p2(second)}.000Z`;
    regDate = `${year}-${p2(month)}-${p2(day)}`;
    return { itemCreatedAt, regDate, error: null };
  }

  return { error: 'Date & Time must use DD-MM-YYYY HH:mm format (e.g. 05-09-2026 10:45)' };
}

function parseFlexibleDate(val, defaultVal = '') {
  if (!val) return defaultVal;
  const s = String(val).trim();
  if (isValidDDMMYYYY(s)) return parseDDMMYYYY(s);
  if (isValidDate(s)) return s;
  return null;
}

/**
 * Validates parsed and canonicalized CSV rows for a specific entity type.
 * Returns { total, validRows, invalidRows, mappingError, summary }
 */
export function validateCSVRows(type, rows, context = {}) {
  // 1. Check for global header mapping errors if raw headers are available
  if (context.headers && Array.isArray(context.headers)) {
    const mappingErr = inspectHeaders(type, context.headers);
    if (mappingErr) {
      return {
        total: rows.length,
        validRows: [],
        invalidRows: [],
        mappingError: mappingErr,
        summary: {
          total: rows.length,
          validCount: 0,
          invalidCount: rows.length,
          mappingError: true,
        },
      };
    }
  }

  // 2. Canonicalize rows through the shared mapping layer
  const canonicalRows = mapCSVRows(type, rows);

  const validRows = [];
  const invalidRows = [];
  const today = dkey(new Date());

  switch (type) {
    case 'patients': {
      const seenMobileName = new Set();

      for (const row of canonicalRows) {
        const rowNum = row.__rowNum;
        const errors = [];

        // Required: Full Name
        const name = String(row.name || '').trim();
        if (!name) {
          errors.push('Full name is required');
        } else if (name.length < 3) {
          errors.push('Full name must be at least 3 characters');
        }

        // Required: Age
        const rawAge = String(row.age ?? '').trim();
        const age = parseInt(rawAge, 10);
        if (!rawAge) {
          errors.push('Age is required');
        } else if (isNaN(age) || age < 0 || age > 125) {
          errors.push('Age must be a valid number between 0 and 125');
        }

        // Required: Gender
        const rawGender = String(row.gender || '').trim().toLowerCase();
        let gender = '';
        if (!rawGender) {
          errors.push('Gender is required (M, F, or Other)');
        } else if (!GENDERS.has(rawGender)) {
          errors.push('Gender must be M, F, or Other');
        } else {
          gender = rawGender === 'm' || rawGender === 'male' ? 'M' : rawGender === 'f' || rawGender === 'female' ? 'F' : 'Other';
        }

        // Required: Mobile Number
        const rawMobile = String(row.mobile || '').trim();
        const mobile = cleanDigits(rawMobile);
        if (!rawMobile) {
          errors.push('Mobile number is required');
        } else if (!validMobile(mobile) || mobile.length !== 10) {
          errors.push('Mobile must be a valid 10-digit number');
        }

        // Optional: Blood Group
        let bloodGroup = String(row.blood_group || '').trim().toUpperCase();
        if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) {
          errors.push('Blood group must be one of A+, A-, B+, B-, AB+, AB-, O+, O-');
        }

        // Optional: Historical Date & Time (DD-MM-YYYY HH:mm)
        const rawDateTime = String(row.date_time || '').trim();
        let itemCreatedAt = new Date().toISOString();
        let regDate = today;

        if (rawDateTime) {
          const parsedDT = parseHistoricalDateTime(rawDateTime, today);
          if (parsedDT.error) {
            errors.push(parsedDT.error);
          } else {
            itemCreatedAt = parsedDT.itemCreatedAt;
            regDate = parsedDT.regDate;
          }
        }

        // Duplicate check within batch by mobile + name
        const dedupKey = `${name.toLowerCase()}||${mobile}`;
        if (seenMobileName.has(dedupKey)) {
          errors.push('Duplicate patient entry in this CSV file (same name & mobile)');
        } else if (name && mobile) {
          seenMobileName.add(dedupKey);
        }

        if (errors.length > 0) {
          invalidRows.push({ rowNum, row, errors });
        } else {
          validRows.push({
            __rowNum: rowNum,
            uhid: row.uhid || undefined,
            name,
            age,
            gender,
            marital_status: String(row.marital_status || 'Single').trim(),
            mobile,
            address: String(row.address || '').trim(),
            pin: String(row.pin || '').trim(),
            blood_group: bloodGroup,
            allergies: String(row.allergies || '').trim(),
            conditions: String(row.conditions || '').trim(),
            current_meds: String(row.current_meds || '').trim(),
            notes: String(row.notes || '').trim(),
            reg_date: regDate,
            created_at: itemCreatedAt,
            date_time: rawDateTime || undefined,
          });
        }
      }
      break;
    }

    case 'medicines': {
      const existingNames = new Set(
        (context.existingMedicines || []).map((m) => String(m.name || '').trim().toLowerCase())
      );
      const seenNames = new Set();

      for (const row of canonicalRows) {
        const rowNum = row.__rowNum;
        const errors = [];

        // Required: Medicine Name
        const name = String(row.name || '').trim();
        if (!name) {
          errors.push('Medicine name is required');
        } else if (name.length < 2) {
          errors.push('Medicine name must be at least 2 characters');
        }

        const nameKey = name.toLowerCase();
        if (seenNames.has(nameKey)) {
          errors.push(`Duplicate medicine name "${name}" in this CSV file`);
        } else if (existingNames.has(nameKey)) {
          errors.push(`Medicine "${name}" already exists in clinic catalog`);
        } else if (name) {
          seenNames.add(nameKey);
        }

        // Required: Selling Price
        const rawSelling = cleanCurrency(row.selling_price);
        const sellingPrice = Number(rawSelling);
        if (!rawSelling) {
          errors.push('Selling price is required');
        } else if (isNaN(sellingPrice) || sellingPrice < 0) {
          errors.push('Selling price must be a valid positive number');
        }

        // Optional: Purchase Price
        let purchasePrice = 0;
        const rawPurchase = cleanCurrency(row.purchase_price);
        if (rawPurchase) {
          purchasePrice = Number(rawPurchase);
          if (isNaN(purchasePrice) || purchasePrice < 0) {
            errors.push('Purchase price must be a valid positive number');
          }
        }

        // Optional: Min Stock
        let minStock = 0;
        const rawMinStock = String(row.min_stock ?? '').trim();
        if (rawMinStock) {
          minStock = parseInt(rawMinStock, 10);
          if (isNaN(minStock) || minStock < 0) {
            errors.push('Min stock must be a non-negative integer');
          }
        }

        if (errors.length > 0) {
          invalidRows.push({ rowNum, row, errors });
        } else {
          validRows.push({
            __rowNum: rowNum,
            medicine_code: row.medicine_code || undefined,
            name,
            generic: String(row.generic || '').trim(),
            category: String(row.category || 'Other').trim(),
            type: String(row.type || 'Tablet').trim(),
            strength: String(row.strength || '').trim(),
            unit: String(row.unit || 'strip').trim(),
            purchase_price: Math.round(purchasePrice * 100) / 100,
            selling_price: Math.round(sellingPrice * 100) / 100,
            min_stock: minStock,
            location: String(row.location || '').trim(),
            description: String(row.description || '').trim(),
          });
        }
      }
      break;
    }

    case 'medicine_categories': {
      const existingNames = new Set(
        (context.existingCategories || []).map((c) => String(c.name || '').trim().toLowerCase())
      );
      const seenNames = new Set();

      for (const row of canonicalRows) {
        const rowNum = row.__rowNum;
        const errors = [];

        // Required: Category Name
        const name = String(row.name || '').trim();
        if (!name) {
          errors.push('Category name is required');
        } else if (name.length < 2) {
          errors.push('Category name must be at least 2 characters');
        }

        const nameKey = name.toLowerCase();
        if (seenNames.has(nameKey)) {
          errors.push(`Duplicate category "${name}" in this CSV file`);
        } else if (existingNames.has(nameKey)) {
          errors.push(`Category "${name}" already exists`);
        } else if (name) {
          seenNames.add(nameKey);
        }

        if (errors.length > 0) {
          invalidRows.push({ rowNum, row, errors });
        } else {
          validRows.push({
            __rowNum: rowNum,
            name,
          });
        }
      }
      break;
    }

    case 'doctors': {
      const existingNames = new Set(
        (context.existingDoctors || []).map((d) => String(d.name || '').trim().toLowerCase())
      );
      const seenNames = new Set();

      for (const row of canonicalRows) {
        const rowNum = row.__rowNum;
        const errors = [];

        // Required: Doctor Name
        const name = String(row.name || '').trim();
        if (!name) {
          errors.push('Doctor name is required');
        } else if (name.length < 2) {
          errors.push('Doctor name must be at least 2 characters');
        }

        const nameKey = name.toLowerCase();
        if (seenNames.has(nameKey)) {
          errors.push(`Duplicate doctor name "${name}" in this CSV file`);
        } else if (existingNames.has(nameKey)) {
          errors.push(`Doctor "${name}" already exists in directory`);
        } else if (name) {
          seenNames.add(nameKey);
        }

        // Optional: Phone
        let phone = '';
        if (row.phone) {
          phone = cleanDigits(row.phone);
          if (phone && phone.length !== 10) {
            errors.push('Phone must be a valid 10-digit number');
          }
        }

        // Optional: Email
        let email = String(row.email || '').trim();
        if (email && !isValidEmail(email)) {
          errors.push('Invalid email address format');
        }

        if (errors.length > 0) {
          invalidRows.push({ rowNum, row, errors });
        } else {
          validRows.push({
            __rowNum: rowNum,
            name,
            qualification: String(row.qualification || '').trim(),
            specialization: String(row.specialization || '').trim(),
            phone,
            email,
          });
        }
      }
      break;
    }

    case 'inventory_batches': {
      const medicines = context.existingMedicines || [];
      const medMap = new Map();
      medicines.forEach((m) => {
        medMap.set(String(m.name || '').trim().toLowerCase(), m);
        if (m.id) medMap.set(String(m.id).trim().toLowerCase(), m);
      });

      const seenBatchKey = new Set();

      for (const row of canonicalRows) {
        const rowNum = row.__rowNum;
        const errors = [];

        // Required: Medicine Name / ID
        const medName = String(row.medicine_name || row.medicine_id || '').trim();
        let matchedMed = null;
        if (!medName) {
          errors.push('Medicine name is required');
        } else {
          matchedMed = medMap.get(medName.toLowerCase());
          if (!matchedMed) {
            errors.push(`Medicine "${medName}" not found in catalog. Create the medicine first.`);
          }
        }

        // Required: Batch Number
        const batchNo = String(row.batch_no || '').trim().toUpperCase();
        if (!batchNo) {
          errors.push('Batch number is required');
        }

        // Required: Expiry Date (supports DD-MM-YYYY and YYYY-MM-DD)
        const rawExpiry = String(row.expiry || '').trim();
        const expiry = parseFlexibleDate(rawExpiry);
        if (!rawExpiry) {
          errors.push('Expiry date is required');
        } else if (!expiry) {
          errors.push('Expiry must be valid DD-MM-YYYY or YYYY-MM-DD format');
        }

        // Optional: Manufacturing Date
        const rawMfg = String(row.mfg_date || '').trim();
        let mfgDate = today;
        if (rawMfg) {
          const parsedMfg = parseFlexibleDate(rawMfg);
          if (!parsedMfg) {
            errors.push('Mfg date must be valid DD-MM-YYYY or YYYY-MM-DD format');
          } else {
            mfgDate = parsedMfg;
          }
          if (expiry && mfgDate > expiry) {
            errors.push('Mfg date cannot be after expiry date');
          }
        }

        // Required: Quantity
        const qtyStr = String(row.quantity || '').trim();
        const quantity = parseInt(qtyStr, 10);
        if (!qtyStr) {
          errors.push('Quantity is required');
        } else if (isNaN(quantity) || quantity <= 0) {
          errors.push('Quantity must be a positive integer');
        }

        // Optional: Purchase Price
        let purchasePrice = matchedMed?.purchase_price || 0;
        const rawPrice = cleanCurrency(row.purchase_price);
        if (rawPrice) {
          const p = Number(rawPrice);
          if (isNaN(p) || p < 0) {
            errors.push('Purchase price must be a valid positive number');
          } else {
            purchasePrice = Math.round(p * 100) / 100;
          }
        }

        // Duplicate check within batch
        if (matchedMed && batchNo) {
          const bKey = `${matchedMed.id}||${batchNo}`;
          if (seenBatchKey.has(bKey)) {
            errors.push(`Duplicate batch "${batchNo}" for medicine "${matchedMed.name}" in this CSV`);
          } else {
            seenBatchKey.add(bKey);
          }
        }

        if (errors.length > 0) {
          invalidRows.push({ rowNum, row, errors });
        } else {
          validRows.push({
            __rowNum: rowNum,
            medicine_id: matchedMed.id,
            medicine_name: matchedMed.name,
            batch_no: batchNo,
            mfg_date: mfgDate,
            expiry,
            quantity,
            purchase_price: purchasePrice,
          });
        }
      }
      break;
    }

    case 'services': {
      for (const row of canonicalRows) {
        const rowNum = row.__rowNum;
        const errors = [];

        const name = String(row.name || '').trim();
        if (!name) {
          errors.push('Service name is required');
        } else if (name.length < 2) {
          errors.push('Service name must be at least 2 characters');
        }

        const rawPrice = cleanCurrency(row.price);
        const price = Number(rawPrice);
        if (!rawPrice) {
          errors.push('Service price is required');
        } else if (isNaN(price) || price < 0) {
          errors.push('Price must be a valid positive number');
        }

        if (errors.length > 0) {
          invalidRows.push({ rowNum, row, errors });
        } else {
          validRows.push({
            __rowNum: rowNum,
            service_code: row.service_code || undefined,
            name,
            type: String(row.type || 'Consultation').trim(),
            price: Math.round(price * 100) / 100,
            description: String(row.description || '').trim(),
          });
        }
      }
      break;
    }

    default:
      throw new Error(`Unsupported validation type: ${type}`);
  }

  return {
    total: canonicalRows.length,
    validRows,
    invalidRows,
    mappingError: null,
    summary: {
      total: canonicalRows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      mappingError: false,
    },
  };
}
