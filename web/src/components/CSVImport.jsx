import { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, X, Check, ChevronDown, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { generateId, todayLocal } from '../lib/helpers';

// ─── CSV Parser ────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  const delimiter = text.includes('\t') ? '\t' : text.includes(';') ? ';' : ',';
  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const row = {};
    headers.forEach((h, i) => row[h] = values[i] || '');
    return row;
  });

  return { headers, rows };
}

// ─── Auto-detect column mappings ───────────────────────────
function autoDetectMappings(headers) {
  const mappings = { date: '', amount: '', merchant: '', type: '' };
  const lower = headers.map(h => h.toLowerCase());

  // Date detection
  const datePatterns = ['date', 'data', 'tranzactie', 'transaction date', 'posting date', 'value date'];
  for (const pattern of datePatterns) {
    const idx = lower.findIndex(h => h.includes(pattern));
    if (idx >= 0) { mappings.date = headers[idx]; break; }
  }

  // Amount detection
  const amountPatterns = ['amount', 'suma', 'value', 'debit', 'credit', 'total'];
  for (const pattern of amountPatterns) {
    const idx = lower.findIndex(h => h.includes(pattern));
    if (idx >= 0) { mappings.amount = headers[idx]; break; }
  }

  // Merchant / description detection
  const merchantPatterns = ['merchant', 'description', 'descriere', 'details', 'detalii', 'payee', 'beneficiar', 'name', 'nume', 'memo', 'reference'];
  for (const pattern of merchantPatterns) {
    const idx = lower.findIndex(h => h.includes(pattern));
    if (idx >= 0) { mappings.merchant = headers[idx]; break; }
  }

  // Type detection
  const typePatterns = ['type', 'tip', 'transaction type'];
  for (const pattern of typePatterns) {
    const idx = lower.findIndex(h => h.includes(pattern));
    if (idx >= 0) { mappings.type = headers[idx]; break; }
  }

  return mappings;
}

// ─── Parse amount string ───────────────────────────────────
function parseAmount(str) {
  if (!str) return 0;
  // Handle European format: 1.234,56 → 1234.56
  let cleaned = str.replace(/[^\d.,-]/g, '');
  if (cleaned.includes(',') && cleaned.includes('.')) {
    // European: dots as thousands, comma as decimal
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    // Could be decimal separator
    const parts = cleaned.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }
  return Math.abs(parseFloat(cleaned)) || 0;
}

// ─── Parse date string to YYYY-MM-DD ──────────────────────
function parseDate(str) {
  if (!str) return todayLocal();
  const trimmed = str.trim();

  // ISO format: 2024-01-15
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 10);
  }
  // DD/MM/YYYY or DD.MM.YYYY or DD-MM-YYYY
  const match = trimmed.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  }
  // MM/DD/YYYY
  const matchUS = trimmed.match(/^(\d{1,2})[/](\d{1,2})[/](\d{4})/);
  if (matchUS) {
    const m = parseInt(matchUS[1]);
    const d = parseInt(matchUS[2]);
    if (m > 12) {
      return `${matchUS[3]}-${matchUS[2].padStart(2, '0')}-${matchUS[1].padStart(2, '0')}`;
    }
    return `${matchUS[3]}-${matchUS[1].padStart(2, '0')}-${matchUS[2].padStart(2, '0')}`;
  }

  // Try native Date parsing as fallback
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  return todayLocal();
}

// ─── Detect type from amount sign or type column ───────────
function detectType(row, mappings) {
  if (mappings.type && row[mappings.type]) {
    const t = row[mappings.type].toLowerCase();
    if (t.includes('income') || t.includes('credit') || t.includes('venit')) return 'income';
    if (t.includes('transfer')) return 'transfer';
    return 'expense';
  }
  // Negative amounts are expenses, positive are income
  if (mappings.amount && row[mappings.amount]) {
    const raw = row[mappings.amount].replace(/[^\d.,-]/g, '');
    if (raw.startsWith('-')) return 'expense';
    if (parseFloat(raw) > 0) return 'income';
  }
  return 'expense';
}

export default function CSVImport({ onResult, onError }) {
  const { t } = useTranslation();
  const { effectiveUserId } = useAuth();
  const [parsed, setParsed] = useState(null);
  const [mappings, setMappings] = useState({ date: '', amount: '', merchant: '', type: '' });
  const [fileName, setFileName] = useState(null);
  const fileRef = useRef(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.csv') && !ext.endsWith('.tsv') && !ext.endsWith('.txt')) {
      onError?.(t('addTransaction.csvOnly') || 'Please upload a CSV or TSV file');
      return;
    }

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const result = parseCSV(text);
        if (result.headers.length === 0 || result.rows.length === 0) {
          onError?.(t('addTransaction.csvEmpty') || 'CSV file appears empty or invalid');
          return;
        }
        setParsed(result);
        setMappings(autoDetectMappings(result.headers));
      } catch (err) {
        onError?.(err.message || 'Failed to parse CSV');
      }
    };
    reader.onerror = () => {
      onError?.(t('addTransaction.csvReadFailed') || 'Failed to read file');
    };
    reader.readAsText(file);
  }, [onError, t]);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleImportAll = () => {
    if (!parsed || !mappings.date || !mappings.amount) {
      onError?.(t('addTransaction.mapRequired') || 'Please map at least Date and Amount columns');
      return;
    }

    const transactions = parsed.rows
      .filter(row => {
        const amt = parseAmount(row[mappings.amount]);
        return amt > 0;
      })
      .map(row => {
        const amount = parseAmount(row[mappings.amount]);
        const type = detectType(row, mappings);
        const merchant = mappings.merchant ? row[mappings.merchant] : '';

        return {
          id: generateId(),
          type,
          amount,
          currency: 'RON',
          category: type === 'income' ? 'income' : 'other',
          merchant: merchant || '',
          description: merchant || '',
          date: parseDate(row[mappings.date]),
          source: 'csv-import',
          userId: effectiveUserId,
          createdAt: new Date().toISOString(),
        };
      });

    if (transactions.length === 0) {
      onError?.(t('addTransaction.noValidRows') || 'No valid rows found to import');
      return;
    }

    onResult?.({
      transactions,
      receipt: {
        store: fileName || 'CSV Import',
        date: `${transactions.length} transactions`,
      },
      warnings: [],
      summary: `${transactions.length} transactions parsed from CSV`,
      hasItemsToReview: false,
    });
  };

  const clear = () => {
    setParsed(null);
    setFileName(null);
    setMappings({ date: '', amount: '', merchant: '', type: '' });
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      {!parsed ? (
        <div
          className="border-2 border-dashed rounded-2xl p-4 md:p-8 text-center transition-colors cursor-pointer border-cream-300 dark:border-dark-border hover:border-cream-400"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <FileSpreadsheet size={32} className="mx-auto mb-3 text-cream-400" />
          <p className="text-sm font-medium">{t('addTransaction.uploadCsv')}</p>
          <p className="text-xs text-cream-500 mt-1">CSV, TSV</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* File info */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-cream-50 dark:bg-dark-card border border-cream-200 dark:border-dark-border">
            <div className="flex items-center gap-2 min-w-0">
              <FileSpreadsheet size={18} className="text-success shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{fileName}</p>
                <p className="text-xs text-cream-500">{parsed.rows.length} rows, {parsed.headers.length} columns</p>
              </div>
            </div>
            <button onClick={clear} className="p-1.5 rounded-full hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 hover:text-cream-600 shrink-0">
              <X size={16} />
            </button>
          </div>

          {/* Column mapping */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">{t('addTransaction.mapColumns')}</h4>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'date', label: t('common.date'), required: true },
                { key: 'amount', label: t('common.amount'), required: true },
                { key: 'merchant', label: t('common.description'), required: false },
                { key: 'type', label: t('common.type'), required: false },
              ].map(({ key, label, required }) => (
                <div key={key}>
                  <label className="text-xs text-cream-500 mb-1 block">
                    {label} {required && <span className="text-danger">*</span>}
                  </label>
                  <select
                    value={mappings[key]}
                    onChange={(e) => setMappings(m => ({ ...m, [key]: e.target.value }))}
                    className="input text-xs"
                  >
                    <option value="">-- {t('common.none')} --</option>
                    {parsed.headers.map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {(!mappings.date || !mappings.amount) && (
              <div className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle size={12} />
                <span>{t('addTransaction.mapRequired') || 'Please map at least Date and Amount columns'}</span>
              </div>
            )}
          </div>

          {/* Preview table */}
          <div>
            <h4 className="text-sm font-semibold mb-2">{t('addTransaction.csvPreview')}</h4>
            <div className="overflow-x-auto rounded-xl border border-cream-200 dark:border-dark-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-cream-50 dark:bg-dark-card">
                    {parsed.headers.map(h => (
                      <th key={h} className={`px-3 py-2 text-left font-medium whitespace-nowrap ${
                        Object.values(mappings).includes(h) ? 'text-accent-600 dark:text-accent-400' : 'text-cream-500'
                      }`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-100 dark:divide-dark-border">
                  {parsed.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="hover:bg-cream-50 dark:hover:bg-dark-card">
                      {parsed.headers.map(h => (
                        <td key={h} className="px-3 py-2 whitespace-nowrap text-cream-700 dark:text-cream-400 max-w-[200px] truncate">
                          {row[h]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.rows.length > 5 && (
                <div className="text-center py-2 text-xs text-cream-400 bg-cream-50 dark:bg-dark-card border-t border-cream-200 dark:border-dark-border">
                  +{parsed.rows.length - 5} more rows
                </div>
              )}
            </div>
          </div>

          {/* Import button */}
          <button
            onClick={handleImportAll}
            disabled={!mappings.date || !mappings.amount}
            className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Check size={16} />
            {t('addTransaction.importAll')} ({parsed.rows.length})
          </button>
        </div>
      )}
    </div>
  );
}
