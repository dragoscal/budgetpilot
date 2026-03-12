import { useState, useRef, useCallback } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { parseSpreadsheet } from '../../lib/spreadsheetParser';
import { Upload, FileSpreadsheet, ChevronRight, AlertTriangle } from 'lucide-react';

const ACCEPT = '.xlsx,.xls,.csv,.tsv';
const currentYear = new Date().getFullYear();
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function StepUpload({ parsedData, setParsedData, selectedSheet, setSelectedSheet, year, setYear, onNext }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const fileRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) {
      toast.error(t('import.invalidFormat'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error(t('import.fileTooLarge') || 'File is too large. Maximum 50MB allowed.');
      return;
    }
    if (file.size === 0) {
      toast.error(t('import.emptyFile') || 'File is empty.');
      return;
    }
    setParsing(true);
    try {
      const data = await parseSpreadsheet(file);
      // Validate we actually got data
      const hasData = data.sheets?.some((s) => s.rawGrid?.length > 0);
      if (!hasData) {
        toast.error(t('import.emptySpreadsheet') || 'Spreadsheet has no data rows.');
        return;
      }
      setParsedData(data);
      setSelectedSheet(0);
    } catch (err) {
      console.error('Parse error:', err);
      toast.error(t('import.parseError'));
    } finally {
      setParsing(false);
    }
  }, [setParsedData, setSelectedSheet, toast, t]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const uploadDifferent = useCallback((e) => {
    e.stopPropagation();
    setParsedData(null);
    setSelectedSheet(0);
    // Reset file input so same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
    // Open file picker after a tick
    setTimeout(() => fileRef.current?.click(), 50);
  }, [setParsedData, setSelectedSheet]);

  const grid = parsedData?.sheets?.[selectedSheet]?.rawGrid;
  const previewRows = grid?.slice(0, 12) || [];
  const dataRowCount = grid ? Math.max(0, grid.length - 1) : 0; // exclude header

  // Validate: need at least 2 rows (1 header + 1 data)
  const canProceed = grid && grid.length >= 2;

  return (
    <div className="space-y-5">
      <h3 className="section-title">{t('import.stepUpload')}</h3>

      {/* Drag-drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer ${
          dragging
            ? 'border-accent bg-accent/5'
            : 'border-cream-300 dark:border-dark-border hover:border-accent/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        {parsing ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-cream-500">{t('import.parsing')}</p>
          </div>
        ) : parsedData ? (
          <div className="flex flex-col items-center gap-2">
            <FileSpreadsheet size={32} className="text-accent" />
            <p className="text-sm font-medium">{parsedData.fileName}</p>
            <p className="text-xs text-cream-500">
              {t('import.rowsFound', { count: grid?.length || 0, cols: grid?.[0]?.length || 0 })}
            </p>
            <button
              onClick={uploadDifferent}
              className="text-xs text-accent-500 hover:underline mt-1"
            >
              {t('import.uploadDifferent')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={32} className="text-cream-400" />
            <p className="text-sm font-medium">{t('import.dropFile')}</p>
            <p className="text-xs text-cream-400">{t('import.supportedFormats')}</p>
          </div>
        )}
      </div>

      {parsedData && (
        <>
          {/* Sheet selector */}
          {parsedData.sheets.length > 1 && (
            <div>
              <label className="label">{t('import.sheetLabel')}</label>
              <select
                className="input"
                value={selectedSheet}
                onChange={(e) => setSelectedSheet(Number(e.target.value))}
              >
                {parsedData.sheets.map((s, i) => (
                  <option key={i} value={i}>{s.name} ({s.rawGrid.length} rows)</option>
                ))}
              </select>
            </div>
          )}

          {/* Year picker */}
          <div>
            <label className="label">{t('import.yearLabel')}</label>
            <select className="input w-32" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: 15 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <p className="text-xs text-cream-400 mt-1">{t('import.yearHint')}</p>
          </div>

          {/* Warning for sheets with too few rows */}
          {!canProceed && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-warning/5 border border-warning/20">
              <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
              <p className="text-xs text-warning">{t('import.tooFewRows') || 'Spreadsheet needs at least one header row and one data row.'}</p>
            </div>
          )}

          {/* Raw preview table */}
          <div>
            <label className="label">{t('import.rawPreview')} <span className="text-cream-400 font-normal">({dataRowCount} {t('import.dataRows') || 'data rows'})</span></label>
            <div className="overflow-x-auto rounded-xl border border-cream-200 dark:border-dark-border">
              <table className="text-xs w-full">
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? 'bg-cream-100 dark:bg-dark-border font-medium' : ri % 2 === 0 ? 'bg-cream-50 dark:bg-dark-card' : ''}>
                      <td className="px-2 py-1 text-cream-400 border-r border-cream-200 dark:border-dark-border">{ri}</td>
                      {(row || []).map((cell, ci) => (
                        <td key={ci} className="px-2 py-1 whitespace-nowrap max-w-[160px] truncate border-r border-cream-100 dark:border-dark-border/50" title={cell != null ? String(cell) : ''}>
                          {cell != null ? String(cell) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Next button */}
          <div className="flex justify-end">
            <button onClick={onNext} disabled={!canProceed} className="btn-primary flex items-center gap-2">
              {t('common.next')} <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
