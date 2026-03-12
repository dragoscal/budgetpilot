import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { transactions as txApi } from '../../lib/api';
import { checkDuplicate, learnCategory } from '../../lib/smartFeatures';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';

const MAX_CONSECUTIVE_ERRORS = 5;

export default function StepImport({ transactions, importResult, setImportResult, onReset }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [errorDetails, setErrorDetails] = useState([]);
  const started = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (started.current || importResult || transactions.length === 0) return;
    started.current = true;
    runImport();
  }, []);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  const runImport = async () => {
    setImporting(true);
    cancelledRef.current = false;
    let saved = 0;
    let skipped = 0;
    const errors = [];
    let consecutiveErrors = 0;

    for (let i = 0; i < transactions.length; i++) {
      // Check for cancellation
      if (cancelledRef.current) {
        break;
      }

      const tx = transactions[i];
      try {
        // Check for duplicates (skip high-confidence matches)
        const dupes = await checkDuplicate(tx);
        if (dupes && dupes.length > 0 && dupes[0].confidence >= 0.8) {
          skipped++;
          consecutiveErrors = 0; // Reset on successful check
        } else {
          // Clean display-only fields before saving
          const { _personName, _monthName, _monthNumber, ...clean } = tx;
          await txApi.create(clean);
          // Learn category mapping
          if (tx.merchant && tx.category) {
            learnCategory(tx.merchant, tx.category, tx.subcategory);
          }
          saved++;
          consecutiveErrors = 0; // Reset on success
        }
      } catch (err) {
        console.error(`Import error for ${tx.merchant}:`, err);
        errors.push({
          merchant: tx.merchant || 'Unknown',
          amount: tx.amount,
          date: tx.date,
          person: tx._personName,
          error: err.message || 'Unknown error',
        });
        consecutiveErrors++;

        // Early exit if too many consecutive errors (likely API is down)
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const remaining = transactions.length - i - 1;
          errors.push({
            merchant: `+${remaining} remaining`,
            amount: 0,
            date: '',
            person: '',
            error: t('import.tooManyErrors') || `Stopped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors. Server may be unreachable.`,
          });
          break;
        }
      }
      setProgress(Math.round(((i + 1) / transactions.length) * 100));
    }

    const wasCancelled = cancelledRef.current;
    const result = {
      saved,
      skipped,
      errors: errors.length,
      total: transactions.length,
      cancelled: wasCancelled,
    };
    setImportResult(result);
    setErrorDetails(errors);
    setImporting(false);

    if (result.saved > 0) {
      toast.success(t('import.savedCount', { count: result.saved }));
    }
    if (wasCancelled && result.saved > 0) {
      toast.warning(t('import.importCancelled') || `Import cancelled. ${result.saved} transactions were already saved.`);
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
            <p className="text-xs text-cream-400 text-center mt-1">
              {progress}% ({Math.round(progress / 100 * transactions.length)}/{transactions.length})
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="btn-ghost text-xs text-danger flex items-center gap-1"
          >
            <X size={12} /> {t('common.cancel') || 'Cancel'}
          </button>
        </div>
      )}

      {importResult && !importing && (
        <div className="flex flex-col items-center gap-4 py-8">
          {importResult.errors === 0 && !importResult.cancelled ? (
            <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center">
              <CheckCircle2 size={32} className="text-success" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center">
              <AlertTriangle size={32} className="text-warning" />
            </div>
          )}

          <h3 className="text-lg font-heading font-bold">
            {importResult.cancelled
              ? (t('import.importCancelledTitle') || 'Import Cancelled')
              : t('import.importComplete')}
          </h3>

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

          {/* Error details expandable */}
          {errorDetails.length > 0 && (
            <div className="w-full max-w-md">
              <button
                onClick={() => setShowErrors((s) => !s)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-danger bg-danger/5 rounded-lg hover:bg-danger/10"
              >
                <span>{t('import.showErrors') || 'Show error details'}</span>
                {showErrors ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showErrors && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {errorDetails.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-1.5 text-[11px] bg-cream-50 dark:bg-dark-card rounded-lg">
                      <AlertTriangle size={10} className="text-danger mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium">{err.merchant}</span>
                        {err.amount > 0 && <span className="text-cream-400 ml-1">({err.amount.toFixed(2)})</span>}
                        <p className="text-cream-500 truncate">{err.error}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

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
