/**
 * Spreadsheet parsing utilities for the Smart Import feature.
 * Uses SheetJS (xlsx) for XLSX/CSV/TSV parsing.
 */

/**
 * Parse a spreadsheet File into a normalized grid structure.
 * Dynamically imports xlsx to keep the bundle small (code-split).
 */
export async function parseSpreadsheet(file) {
  if (file.size > 50 * 1024 * 1024) {
    throw new Error('File too large (max 50MB)');
  }
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    // header: 1 gives us a 2D array (preserves raw grid layout)
    const rawGrid = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
    return { name, rawGrid };
  });

  return { sheets, fileName: file.name };
}

/**
 * Convert a grid section to a JSON string suitable for AI analysis.
 * Only sends the first N rows to keep token cost low.
 */
export function gridToAISample(rawGrid, maxRows = 40) {
  const sample = rawGrid.slice(0, maxRows);
  // Add row indices for AI reference
  const indexed = sample.map((row, i) => ({ row: i, cells: row }));
  return JSON.stringify(indexed, null, 1);
}

/**
 * Extract transaction data from the full grid using AI's structural analysis.
 * This is deterministic code — no AI calls, just reading cells by coordinates.
 */
export function extractDataFromGrid(rawGrid, aiAnalysis) {
  const { months, people, categoryColumnOffset, dataStartRow, layout } = aiAnalysis;
  const extracted = [];

  if (layout === 'flat-table') {
    // Flat table: one transaction per row with columns mapped by AI
    const cols = aiAnalysis.columns || {};
    const dateCol = cols.date;
    const monthCol = cols.month;
    const personCol = cols.person;
    const catCol = cols.category;
    const amountCol = cols.amount;

    for (let rowIdx = (dataStartRow || 1); rowIdx < rawGrid.length; rowIdx++) {
      const row = rawGrid[rowIdx];
      if (!row) continue;

      // Extract amount
      const amount = parseEuropeanNumber(row[amountCol]);
      if (!amount || amount <= 0) continue;

      // Extract category
      const categoryRaw = catCol != null ? row[catCol] : null;
      if (!categoryRaw || (typeof categoryRaw === 'string' && !categoryRaw.trim())) continue;
      const categoryName = String(categoryRaw).trim();
      const catLower = categoryName.toLowerCase();
      if (catLower === 'total' || catLower === 'totale' || catLower === 'scop') continue;

      // Extract month — try month column first, then parse from date
      let monthNumber = null;
      let monthName = '';
      if (monthCol != null && row[monthCol]) {
        const mRaw = String(row[monthCol]).trim().toLowerCase();
        monthNumber = MONTH_MAP[mRaw] || null;
        if (monthNumber) {
          monthName = MONTH_NAMES_RO[monthNumber] || mRaw;
        }
      }
      if (!monthNumber && dateCol != null && row[dateCol]) {
        // Try parsing date like "2026-01-15" or "15.01.2026" or a JS date number
        const dateVal = row[dateCol];
        if (typeof dateVal === 'number') {
          // Excel serial date — convert
          const d = new Date((dateVal - 25569) * 86400 * 1000);
          monthNumber = d.getMonth() + 1;
        } else {
          const ds = String(dateVal).trim();
          // Try YYYY-MM-DD
          const isoMatch = ds.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
          if (isoMatch) {
            monthNumber = parseInt(isoMatch[2], 10);
          } else {
            // Try DD.MM.YYYY or DD/MM/YYYY
            const euMatch = ds.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
            if (euMatch) {
              monthNumber = parseInt(euMatch[2], 10);
            }
          }
        }
        if (monthNumber) {
          monthName = MONTH_NAMES_RO[monthNumber] || String(monthNumber);
        }
      }
      // Fallback: try matching against known months list from AI
      if (!monthNumber && months && months.length > 0) {
        monthNumber = months[0].monthNumber;
        monthName = months[0].name;
      }
      if (!monthNumber) continue;

      // Extract person — from column or fallback to people list
      let personName = '';
      if (personCol != null && row[personCol]) {
        personName = String(row[personCol]).trim();
      } else if (people && people.length > 0) {
        personName = people[0].name;
      }
      if (!personName) personName = 'Unknown';

      extracted.push({
        month: monthNumber,
        monthName,
        originalCategory: categoryName,
        person: personName,
        amount,
        rowIdx,
        colIdx: amountCol,
      });
    }
  } else if (layout === 'monthly-columns') {
    for (let rowIdx = dataStartRow; rowIdx < rawGrid.length; rowIdx++) {
      const row = rawGrid[rowIdx];
      if (!row) continue;

      // Try each month group
      for (const month of months) {
        const catCol = month.startCol + (categoryColumnOffset ?? 1);
        const categoryName = row[catCol];
        if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) continue;
        // Skip total/header-like rows
        const catLower = categoryName.trim().toLowerCase();
        if (catLower === 'total' || catLower === 'totale' || catLower === 'scop') continue;

        for (const person of people) {
          const amountCol = month.startCol + person.columnOffset;
          const cellValue = row[amountCol];
          const amount = parseEuropeanNumber(cellValue);
          if (amount > 0) {
            extracted.push({
              month: month.monthNumber,
              monthName: month.name,
              originalCategory: categoryName.trim(),
              person: person.name,
              amount,
              rowIdx,
              colIdx: amountCol,
            });
          }
        }
      }
    }
  } else if (layout === 'monthly-rows') {
    // Rows are months, columns are categories — less common but supported
    for (const month of months) {
      const row = rawGrid[month.rowIndex];
      if (!row) continue;
      for (const person of people) {
        for (let colIdx = dataStartRow; colIdx < row.length; colIdx++) {
          const categoryName = rawGrid[aiAnalysis.headerRow]?.[colIdx];
          if (!categoryName || typeof categoryName !== 'string') continue;
          const amount = parseEuropeanNumber(row[colIdx]);
          if (amount > 0) {
            extracted.push({
              month: month.monthNumber,
              monthName: month.name,
              originalCategory: categoryName.trim(),
              person: person.name,
              amount,
              rowIdx: month.rowIndex,
              colIdx,
            });
          }
        }
      }
    }
  } else {
    // Generic fallback: try monthly-columns pattern
    // Use any structure hints the AI provided
    for (let rowIdx = (dataStartRow || 2); rowIdx < rawGrid.length; rowIdx++) {
      const row = rawGrid[rowIdx];
      if (!row) continue;
      for (const month of (months || [])) {
        const catCol = month.startCol + (categoryColumnOffset ?? 1);
        const categoryName = row[catCol];
        if (!categoryName || typeof categoryName !== 'string' || !categoryName.trim()) continue;

        for (const person of (people || [])) {
          const amountCol = month.startCol + person.columnOffset;
          const amount = parseEuropeanNumber(row[amountCol]);
          if (amount > 0) {
            extracted.push({
              month: month.monthNumber,
              monthName: month.name,
              originalCategory: categoryName.trim(),
              person: person.name,
              amount,
              rowIdx,
              colIdx: amountCol,
            });
          }
        }
      }
    }
  }

  return extracted;
}

/**
 * Parse a number that may be in European format (1.234,56), space-separated
 * thousands (1 234,56), or plain format. Handles currency symbols and suffixes.
 */
export function parseEuropeanNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  let str = String(value).trim();
  if (!str) return 0;

  // Strip currency symbols and text suffixes (€, $, RON, lei, EUR, etc.)
  str = str.replace(/^[€$£¥₹]+\s*/, '').replace(/\s*(?:RON|lei|EUR|USD|GBP)\s*$/i, '').trim();
  if (!str) return 0;

  // Handle space-separated thousands: "1 234,56" or "1 234.56" or "1 234"
  if (/^\d{1,3}(\s\d{3})+(,\d+)?$/.test(str)) {
    // Space thousands + comma decimal (European): "1 234,56"
    return parseFloat(str.replace(/\s/g, '').replace(',', '.')) || 0;
  }
  if (/^\d{1,3}(\s\d{3})+(\.\d+)?$/.test(str)) {
    // Space thousands + dot decimal (standard): "1 234.56"
    return parseFloat(str.replace(/\s/g, '')) || 0;
  }

  // European format: dots as thousands, comma as decimal
  // e.g., "1.234,56" or "234,56"
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(str)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  if (/^\d+(,\d+)$/.test(str)) {
    // Simple comma decimal: "234,56"
    return parseFloat(str.replace(',', '.')) || 0;
  }
  // Standard number: strip everything except digits, dot, minus
  return parseFloat(str.replace(/[^0-9.\-]/g, '')) || 0;
}

/**
 * Get the last day of a given month as "YYYY-MM-DD".
 * @param {number} year - e.g., 2025
 * @param {number} month - 1-based (1 = January)
 */
export function lastDayOfMonth(year, month) {
  // Day 0 of next month = last day of this month
  const d = new Date(year, month, 0);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Romanian month name → month number mapping.
 */
export const MONTH_MAP = {
  ianuarie: 1, ian: 1, january: 1, jan: 1,
  februarie: 2, feb: 2, february: 2,
  martie: 3, mar: 3, march: 3,
  aprilie: 4, apr: 4, april: 4,
  mai: 5, may: 5,
  iunie: 6, iun: 6, june: 6, jun: 6,
  iulie: 7, iul: 7, july: 7, jul: 7,
  august: 8, aug: 8,
  septembrie: 9, sep: 9, sept: 9, september: 9,
  octombrie: 10, oct: 10, october: 10,
  noiembrie: 11, noi: 11, nov: 11, november: 11,
  decembrie: 12, dec: 12, december: 12,
};

/**
 * Month number → Romanian month name (for display).
 */
export const MONTH_NAMES_RO = [
  '', 'Ianuarie', 'Februarie', 'Martie', 'Aprilie', 'Mai', 'Iunie',
  'Iulie', 'August', 'Septembrie', 'Octombrie', 'Noiembrie', 'Decembrie',
];
