import { validMobile, dkey } from '../utils.js';

const BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const GENDERS = new Set(['male', 'female', 'other']);

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

/**
 * Validates parsed CSV rows for a specific entity type.
 * Returns { total, validRows, invalidRows, summary }
 */
export function validateCSVRows(type, rows, context = {}) {
  const validRows = [];
  const invalidRows = [];
  const today = dkey(new Date());

  switch (type) {
    case 'patients': {
      const seenMobileName = new Set();

      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors = [];

        const name = String(row.name || '').trim();
        if (!name) {
          errors.push('Full name is required');
        } else if (name.length < 3) {
          errors.push('Full name must be at least 3 characters');
        }

        const dob = String(row.dob || '').trim();
        if (!dob) {
          errors.push('Date of birth is required');
        } else if (!isValidDate(dob)) {
          errors.push('Date of birth must be valid YYYY-MM-DD format');
        } else if (dob > today) {
          errors.push('Date of birth cannot be in the future');
        }

        const rawGender = String(row.gender || '').trim().toLowerCase();
        let gender = '';
        if (!rawGender) {
          errors.push('Gender is required');
        } else if (!GENDERS.has(rawGender)) {
          errors.push('Gender must be Male, Female, or Other');
        } else {
          gender = rawGender.charAt(0).toUpperCase() + rawGender.slice(1);
        }

        const rawMobile = String(row.mobile || '').trim();
        const mobile = cleanDigits(rawMobile);
        if (!rawMobile) {
          errors.push('Mobile number is required');
        } else if (!validMobile(mobile) || mobile.length !== 10) {
          errors.push('Mobile must be a valid 10-digit number');
        }

        let altMobile = '';
        if (row.alt_mobile) {
          altMobile = cleanDigits(row.alt_mobile);
          if (!validMobile(altMobile) || altMobile.length !== 10) {
            errors.push('Alt mobile must be a valid 10-digit number');
          }
        }

        let email = String(row.email || '').trim();
        if (email && !isValidEmail(email)) {
          errors.push('Invalid email address format');
        }

        let bloodGroup = String(row.blood_group || '').trim().toUpperCase();
        if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) {
          errors.push('Blood group must be one of A+, A-, B+, B-, AB+, AB-, O+, O-');
        }

        let ecNumber = '';
        if (row.ec_number) {
          ecNumber = cleanDigits(row.ec_number);
          if (ecNumber.length !== 10) {
            errors.push('Emergency contact number must be 10 digits');
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
            name,
            dob,
            gender,
            mobile,
            alt_mobile: altMobile,
            email,
            address: String(row.address || '').trim(),
            city: String(row.city || '').trim(),
            state: String(row.state || 'Gujarat').trim(),
            pin: String(row.pin || '').trim(),
            blood_group: bloodGroup,
            allergies: String(row.allergies || '').trim(),
            conditions: String(row.conditions || '').trim(),
            current_meds: String(row.current_meds || '').trim(),
            notes: String(row.notes || '').trim(),
            ec_name: String(row.ec_name || '').trim(),
            ec_number: ecNumber,
            ec_relation: String(row.ec_relation || '').trim(),
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

      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors = [];

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

        const sellingPriceStr = String(row.selling_price || '').trim();
        const sellingPrice = Number(sellingPriceStr);
        if (!sellingPriceStr) {
          errors.push('Selling price is required');
        } else if (isNaN(sellingPrice) || sellingPrice < 0) {
          errors.push('Selling price must be a valid positive number');
        }

        let purchasePrice = 0;
        if (row.purchase_price !== undefined && String(row.purchase_price).trim() !== '') {
          purchasePrice = Number(row.purchase_price);
          if (isNaN(purchasePrice) || purchasePrice < 0) {
            errors.push('Purchase price must be a valid positive number');
          }
        }

        let minStock = 0;
        if (row.min_stock !== undefined && String(row.min_stock).trim() !== '') {
          minStock = parseInt(row.min_stock, 10);
          if (isNaN(minStock) || minStock < 0) {
            errors.push('Min stock must be a non-negative integer');
          }
        }

        if (errors.length > 0) {
          invalidRows.push({ rowNum, row, errors });
        } else {
          validRows.push({
            __rowNum: rowNum,
            name,
            generic: String(row.generic || '').trim(),
            category: String(row.category || 'Other').trim(),
            type: String(row.type || 'Tablet').trim(),
            strength: String(row.strength || '').trim(),
            unit: String(row.unit || 'strip').trim(),
            purchase_price: Math.round(purchasePrice * 100) / 100,
            selling_price: Math.round(sellingPrice * 100) / 100,
            min_stock: minStock,
            barcode: String(row.barcode || '').trim(),
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

      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors = [];

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

      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors = [];

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

        let phone = '';
        if (row.phone) {
          phone = cleanDigits(row.phone);
          if (phone && phone.length !== 10) {
            errors.push('Phone must be a valid 10-digit number');
          }
        }

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
      });

      const seenBatchKey = new Set();

      for (const row of rows) {
        const rowNum = row.__rowNum;
        const errors = [];

        const medName = String(row.medicine_name || '').trim();
        let matchedMed = null;
        if (!medName) {
          errors.push('Medicine name is required');
        } else {
          matchedMed = medMap.get(medName.toLowerCase());
          if (!matchedMed) {
            errors.push(`Medicine "${medName}" not found in catalog. Create the medicine first.`);
          }
        }

        const batchNo = String(row.batch_no || '').trim().toUpperCase();
        if (!batchNo) {
          errors.push('Batch number is required');
        }

        const expiry = String(row.expiry || '').trim();
        if (!expiry) {
          errors.push('Expiry date is required');
        } else if (!isValidDate(expiry)) {
          errors.push('Expiry must be valid YYYY-MM-DD format');
        }

        let mfgDate = String(row.mfg_date || '').trim();
        if (mfgDate) {
          if (!isValidDate(mfgDate)) {
            errors.push('Mfg date must be valid YYYY-MM-DD format');
          } else if (expiry && mfgDate > expiry) {
            errors.push('Mfg date cannot be after expiry date');
          }
        } else {
          mfgDate = today;
        }

        const qtyStr = String(row.quantity || '').trim();
        const quantity = parseInt(qtyStr, 10);
        if (!qtyStr) {
          errors.push('Quantity is required');
        } else if (isNaN(quantity) || quantity <= 0) {
          errors.push('Quantity must be a positive integer');
        }

        let purchasePrice = matchedMed?.purchase_price || 0;
        if (row.purchase_price !== undefined && String(row.purchase_price).trim() !== '') {
          const p = Number(row.purchase_price);
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
            errors.push(`Duplicate batch "${batchNo}" for medicine "${medName}" in this CSV`);
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

    default:
      throw new Error(`Unsupported validation type: ${type}`);
  }

  return {
    total: rows.length,
    validRows,
    invalidRows,
    summary: {
      total: rows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
    },
  };
}
