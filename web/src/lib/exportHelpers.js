import { formatCurrency } from './helpers';

/**
 * Generate a UTF-8 CSV with BOM for proper Excel compatibility
 * @param {Array<Object>} transactions
 * @returns {Blob}
 */
export function generateCSV(transactions) {
  const BOM = '\uFEFF'; // UTF-8 BOM for Excel
  const headers = ['Date', 'Type', 'Merchant', 'Category', 'Subcategory', 'Amount', 'Currency', 'Description', 'Tags', 'Source', 'Visibility'];

  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = transactions.map((t) => [
    escape(t.date),
    escape(t.type),
    escape(t.merchant),
    escape(t.category),
    escape(t.subcategory || ''),
    escape(t.amount),
    escape(t.currency || 'RON'),
    escape(t.description || ''),
    escape((t.tags || []).join('; ')),
    escape(t.source || 'manual'),
    escape(t.visibility || ''),
  ]);

  const csv = BOM + [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  return new Blob([csv], { type: 'text/csv;charset=utf-8' });
}

/**
 * Download a blob as a file
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
