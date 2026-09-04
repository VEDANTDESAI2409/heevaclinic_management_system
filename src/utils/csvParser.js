/**
 * Lightweight, zero-dependency RFC-4180 compliant CSV parser for HEEVA CLINIC.
 * Handles:
 * - UTF-8 Byte Order Mark (\uFEFF)
 * - Quoted fields with embedded commas, newlines, and escaped quotes ("")
 * - Windows (CRLF) and Unix (LF) line breaks
 * - Header normalization (trimmed, lowercased, spaces/dashes converted to snake_case)
 * - Tracking accurate 1-indexed row numbers (accounting for header row)
 */

export function parseCSV(text) {
  if (!text || typeof text !== 'string') {
    return { headers: [], rows: [], rawRows: [], errors: ['File is empty'] };
  }

  // Strip BOM if present
  let cleanText = text;
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

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

      if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
        i++;
        continue;
      }

      if (char === '\r') {
        if (nextChar === '\n') {
          i++; // Skip \n in CRLF
        }
        currentRow.push(currentField.trim());
        rawRows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
        continue;
      }

      if (char === '\n') {
        currentRow.push(currentField.trim());
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
    currentRow.push(currentField.trim());
    rawRows.push(currentRow);
  }

  // Filter out completely blank lines
  const nonEmptyRows = rawRows.filter((row) => row.some((cell) => cell.trim() !== ''));

  if (nonEmptyRows.length === 0) {
    return { headers: [], rows: [], rawRows: [], errors: ['No data rows found in CSV file'] };
  }

  // Extract and normalize header line
  const rawHeaders = nonEmptyRows[0];
  const headers = rawHeaders.map((h) =>
    h
      .toLowerCase()
      .trim()
      .replace(/[\s\-\/]+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
  );

  const rows = [];
  // Each data row begins at row index 2 (line 1 is the header)
  for (let r = 1; r < nonEmptyRows.length; r++) {
    const rawRow = nonEmptyRows[r];
    const rowObj = { __rowNum: r + 1 };
    headers.forEach((header, colIdx) => {
      if (header) {
        rowObj[header] = rawRow[colIdx] !== undefined ? rawRow[colIdx].trim() : '';
      }
    });
    rows.push(rowObj);
  }

  return {
    headers,
    rawHeaders,
    rows,
    rawRows: nonEmptyRows,
    errors: [],
  };
}
