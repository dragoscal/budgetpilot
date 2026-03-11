import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { transactions as txApi } from '../../lib/api';
import { checkDuplicate, learnCategory } from '../../lib/smartFeatures';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ArrowRight, RefreshCw } from 'lucide-react';

export default function StepImport({ transactions, importResult, setImportResult, onReset }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || importResult || transactions.length === 0) return;
    started.current = true;
    runImport();
  }, []);

  const runImport = async () => {
    setImporting(true);
    let saved = 0;
    let skipped = 0;
    const errors = [];

    for (let i = 0; i < transactions.length; i++) {
      const tx = transactions[i];
      try {
        // Check for duplicates (skip high-confidence matches)
        const dupes = await checkDuplicate(tx);
        if (dupes && dupes.length > 0 && dupes[0].confidence >= 0.8) {
          skipped++;
        } else {
          // Clean display-only fields before saving
          const { _personName, _monthName, _monthNumber, ...clean } = tx;
          await txApi.create(clean);
          // Learn category mapping
          if (tx.merchant && tx.category) {
            learnCategory(tx.merchant, tx.category, tx.subcategory);
          }
          saved++;
        }
      } catch (err) {
        console.error(`Import error for ${tx.merchant}:`, err);
        errors.push({ tx, error: err.message });
      }
      setProgress(Math.round(((i + 1) / transactions.length) * 100));
    }

    const result = { saved, skipped, errors: errors.length, total: transactions.length };
    setImportResult(result);
    setImporting(false);

    if (result.saved > 0) {
      toast.success(t('import.savedCount', { count: result.saved }));
    }
  };

  return (
    <div className="space-y-6">
      {importing && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium">{t('import.importing')}</p>
          <div className="w-64">
            <div className="h-2 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-cream-400 text-center mt-1">{progress}%</p>
          </div>
        </div>
      )}

      {importResult && !importing && (
        <div className="flex flex-col items-center gap-4 py-8">
          {importResult.errors === 0 ? (
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-success" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertTriangle size={32} className="text-warning" />
            </div>
          )}

          <h3 className="text-lg font-heading font-bold">{t('import.importComplete')}</h3>

          <div className="space-y-1 text-center">
            <p className="text-sm">
              <span className="font-medium text-success">{importResult.saved}</span> {t('import.savedCount', { count: '' }).trim()}
            </p>
            {importResult.skipped > 0 && (
              <p className="text-sm text-cream-500">
                <span className="font-medium">{importResult.skipped}</span> {t('import.skippedCount', { count: '' }).trim()}
              </p>
            )}
            {importResult.errors > 0 && (
              <p className="text-sm text-danger">
                <span className="font-medium">{importResult.errors}</span> {t('import.importError')}
              </p>
            )}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => navigate('/transactions')}
              className="btn-primary flex items-center gap-2"
            >
              {t('import.viewTransactions')} <ArrowRight size={16} />
            </button>
            <button
              onClick={onReset}
              className="btn-secondary flex items-center gap-2"
            >
              <RefreshCw size={16} /> {t('import.importAnother')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
