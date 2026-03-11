import { useState, useRef, useCallback } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { parseSpreadsheet } from '../../lib/spreadsheetParser';
import { Upload, FileSpreadsheet, ChevronRight } from 'lucide-react';

const ACCEPT = '.xlsx,.xls,.csv,.tsv';
const currentYear = new Date().getFullYear();

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
    setParsing(true);
    try {
      const data = await parseSpreadsheet(file);
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

  const grid = parsedData?.sheets?.[selectedSheet]?.rawGrid;
  const previewRows = grid?.slice(0, 12) || [];

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
            <button className="text-xs text-accent-500 hover:underline mt-1">
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
              {Array.from({ length: 10 }, (_, i) => currentYear - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <p className="text-xs text-cream-400 mt-1">{t('import.yearHint')}</p>
          </div>

          {/* Raw preview table */}
          <div>
            <label className="label">{t('import.rawPreview')}</label>
            <div className="overflow-x-auto rounded-xl border border-cream-200 dark:border-dark-border">
              <table className="text-xs w-full">
                <tbody>
                  {previewRows.map((row, ri) => (
                    <tr key={ri} className={ri === 0 ? 'bg-cream-100 dark:bg-dark-border font-medium' : ri % 2 === 0 ? 'bg-cream-50 dark:bg-dark-card' : ''}>
                      <td className="px-2 py-1 text-cream-400 border-r border-cream-200 dark:border-dark-border">{ri}</td>
                      {(row || []).map((cell, ci) => (
                        <td key={ci} className="px-2 py-1 whitespace-nowrap max-w-[120px] truncate border-r border-cream-100 dark:border-dark-border/50">
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
            <button onClick={onNext} className="btn-primary flex items-center gap-2">
              {t('common.next')} <ChevronRight size={16} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
