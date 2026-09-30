/**
 * Lightweight, zero-dependency RFC-4180 compliant CSV parser for HEEVA CLINIC.
 * Handles:
 * - UTF-8 and UTF-16 Byte Order Marks (\uFEFF, \uFFFE, zero-width characters)
 * - Auto-detecting delimiters (comma ',', semicolon ';', or tab '\t')
 * - Quoted fields with embedded commas, semicolons, tabs, newlines, and escaped quotes ("")
 * - Windows (CRLF) and Unix (LF) line breaks
 * - Header normalization (trimmed, lowercased, spaces/dashes converted to snake_case)
 * - Tracking accurate 1-indexed row numbers (accounting for header row)
 */

/**
 * Strips UTF Byte Order Marks and zero-width spaces from text or cell.
 */
export function stripBOM(str) {
  if (!str) return '';
  return String(str).replace(/^[\uFEFF\uFFFE\u200B\u200C\u200D]+/, '').replace(/[\uFEFF\uFFFE]/g, '');
}

/**
 * Auto-detects the delimiter used in the CSV header line.
 * Counts unquoted commas, semicolons, and tabs.
 */
export function detectDelimiter(text) {
  if (!text) return ',';
  let inQuotes = false;
  let line = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (line.trim()) break;
      line = '';
      continue;
    }
    line += ch;
  }

  if (!line.trim()) return ',';

  let commaCount = 0;
  let semiCount = 0;
  let tabCount = 0;
  inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes) {
      if (ch === ',') commaCount++;
      else if (ch === ';') semiCount++;
      else if (ch === '\t') tabCount++;
    }
  }

  if (semiCount > commaCount && semiCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semiCount) return '\t';
  return ',';
}

/**
 * Normalizes a raw CSV column header string to a clean snake_case identifier.
 */
export function normalizeHeader(h) {
  if (!h) return '';
  const cleaned = stripBOM(h).trim();
  const lower = cleaned.toLowerCase();

  // Fast-track common date and time variations before character substitution
  if (/^date\s*(&|and)?\s*time/i.test(lower)) {
    return 'date_time';
  }

  return lower
    .replace(/&/g, 'and')
    .replace(/[\s\-\/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function parseCSV(text) {
  if (!text || typeof text !== 'string') {
    return { headers: [], rawHeaders: [], rows: [], rawRows: [], errors: ['File is empty'], delimiter: ',' };
  }

  // Strip initial BOM if present
  const cleanText = stripBOM(text);
  const delimiter = detectDelimiter(cleanText);

  const rawRows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;
  const len = cleanText.length;

  while (i < len) {
    const char = cleanText[i];
    const nextChar = i + 1 < len ? cleanText[i + 1] : '';

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      }

      if (char === delimiter) {
        currentRow.push(stripBOM(currentField).trim());
        currentField = '';
        i++;
        continue;
      }

      if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Skip \n in CRLF
        }
        currentRow.push(stripBOM(currentField).trim());
        rawRows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      }

      if (char === '\n') {
        currentRow.push(stripBOM(currentField).trim());
        rawRows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      }

      currentField += char;
      i++;
    }
  }

  // Push final field/row if any characters remain
  if (currentField || currentRow.length > 0) {
    currentRow.push(stripBOM(currentField).trim());
    rawRows.push(currentRow);
  }

  // Filter out completely blank lines
  const nonEmptyRows = rawRows.filter((row) => row.some((cell) => cell.trim() !== ''));

  if (nonEmptyRows.length === 0) {
    return { headers: [], rawHeaders: [], rows: [], rawRows: [], errors: ['No data rows found in CSV file'], delimiter };
  }

  // Extract raw and normalized headers
  const rawHeaders = nonEmptyRows[0].map((h) => stripBOM(h).trim());
  const headers = rawHeaders.map(normalizeHeader);

  const rows = [];
  // Each data row begins at row index 2 (line 1 is the header)
  for (let r = 1; r < nonEmptyRows.length; r++) {
    const rawRow = nonEmptyRows[r];
    const rowObj = { __rowNum: r + 1 };
    headers.forEach((header, colIdx) => {
      if (header) {
        const cellVal = rawRow[colIdx] !== undefined ? stripBOM(rawRow[colIdx]).trim() : '';
        rowObj[header] = cellVal;
      }
    });
    rows.push(rowObj);
  }

  return {
    headers,
    rawHeaders,
    rows,
    rawRows: nonEmptyRows,
    delimiter,
    errors: [],
  };
}
