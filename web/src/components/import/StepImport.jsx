import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useToast } from '../../contexts/ToastContext';
import { transactions as txApi, recurring as recurringApi } from '../../lib/api';
import { checkDuplicate, checkTransferPair, learnCategory, detectRecurringPatterns, batchCheckDuplicates } from '../../lib/smartFeatures';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, AlertTriangle, ArrowRight, RefreshCw, X, ChevronDown, ChevronUp, Search, RotateCcw, Play } from 'lucide-react';

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

  // Pre-scan phase
  const [scanPhase, setScanPhase] = useState('scanning'); // 'scanning' | 'review' | 'importing' | 'done'
  const [preScanResult, setPreScanResult] = useState(null);

  // Recurring detection
  const [recurringPatterns, setRecurringPatterns] = useState(null);

  useEffect(() => {
    if (started.current || importResult || transactions.length === 0) return;
    started.current = true;
    runPreScan();
  }, []);

  const handleCancel = useCallback(() => {
    cancelledRef.current = true;
  }, []);

  // ─── PRE-SCAN PHASE ─────────────────────────────────────
  const runPreScan = async () => {
    setScanPhase('scanning');
    try {
      const results = await batchCheckDuplicates(transactions);
      const toImport = results.filter((r) => !r.isDuplicate && !r.isTransferPair);
      const dupeCount = results.filter((r) => r.isDuplicate).length;
      const transferCount = results.filter((r) => r.isTransferPair).length;

      setPreScanResult({
        toImport: toImport.map((r) => r.transaction),
        duplicates: dupeCount,
        transfers: transferCount,
        total: transactions.length,
      });

      // If nothing to import, go straight to review
      setScanPhase('review');
    } catch (err) {
      console.error('Pre-scan failed, proceeding with import:', err);
      // Fallback: skip pre-scan, import everything with per-item checks
      setPreScanResult({
        toImport: transactions,
        duplicates: 0,
        transfers: 0,
        total: transactions.length,
      });
      setScanPhase('review');
    }
  };

  const handleStartImport = () => {
    setScanPhase('importing');
    runImport(preScanResult?.toImport || transactions);
  };

  // ─── IMPORT PHASE ───────────────────────────────────────
  const runImport = async (txList) => {
    setImporting(true);
    cancelledRef.current = false;
    let saved = 0;
    let skipped = 0;
    const errors = [];
    let consecutiveErrors = 0;
    const batchId = crypto.randomUUID();

    for (let i = 0; i < txList.length; i++) {
      if (cancelledRef.current) break;

      const tx = txList[i];
      try {
        // Safety net: per-item duplicate check (in case DB changed since pre-scan)
        const dupes = await checkDuplicate(tx);
        if (dupes && dupes.length > 0 && dupes[0].confidence >= 0.8) {
          skipped++;
          consecutiveErrors = 0;
        } else if (tx.source === 'bank_statement' && (tx.type === 'transfer' || tx.category === 'transfer')) {
          const pair = await checkTransferPair(tx);
          if (pair) {
            skipped++;
            consecutiveErrors = 0;
          } else {
            const { _personName, _monthName, _monthNumber, ...clean } = tx;
            await txApi.create({ ...clean, importBatch: batchId });
            if (tx.merchant && tx.category) learnCategory(tx.merchant, tx.category, tx.subcategory);
            saved++;
            consecutiveErrors = 0;
          }
        } else {
          const { _personName, _monthName, _monthNumber, ...clean } = tx;
          await txApi.create({ ...clean, importBatch: batchId });
          if (tx.merchant && tx.category) learnCategory(tx.merchant, tx.category, tx.subcategory);
          saved++;
          consecutiveErrors = 0;
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

        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const remaining = txList.length - i - 1;
          errors.push({
            merchant: `+${remaining} remaining`,
            amount: 0, date: '', person: '',
            error: t('import.tooManyErrors') || `Stopped after ${MAX_CONSECUTIVE_ERRORS} consecutive errors.`,
          });
          break;
        }
      }
      setProgress(Math.round(((i + 1) / txList.length) * 100));
    }

    const wasCancelled = cancelledRef.current;
    const preDupes = preScanResult ? preScanResult.duplicates + preScanResult.transfers : 0;
    const result = {
      saved,
      skipped: skipped + preDupes,
      errors: errors.length,
      total: transactions.length,
      cancelled: wasCancelled,
      batchId: saved > 0 ? batchId : null,
    };
    setImportResult(result);
    setErrorDetails(errors);
    setImporting(false);
    setScanPhase('done');

    if (result.saved > 0) {
      toast.success(t('import.savedCount', { count: result.saved }));
    }
    if (wasCancelled && result.saved > 0) {
      toast.warning(t('import.importCancelled') || `Import cancelled. ${result.saved} transactions were already saved.`);
    }

    // ─── RECURRING DETECTION ────────────────────────────────
    if (result.saved > 0) {
      try {
        const [existingRecurring, patterns] = await Promise.all([
          recurringApi.getAll(),
          detectRecurringPatterns(),
        ]);
        const existingMerchants = new Set(
          (Array.isArray(existingRecurring) ? existingRecurring : [])
            .map((r) => (r.name || r.merchant || '').toLowerCase().trim())
        );
        const newPatterns = patterns.filter(
          (p) => !existingMerchants.has(p.merchant.toLowerCase().trim())
        );
        if (newPatterns.length > 0) setRecurringPatterns(newPatterns);
      } catch (err) {
        console.warn('Recurring detection failed:', err);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── SCANNING PHASE ──────────────────────────────── */}
      {scanPhase === 'scanning' && (
        <div className="flex flex-col items-center gap-4 py-12">
          <div className="w-12 h-12 border-3 border-accent border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-medium flex items-center gap-2">
            <Search size={16} /> {t('import.scanning')}
          </p>
          <p className="text-xs text-cream-400">{transactions.length} {t('common.transactions')}</p>
        </div>
      )}

      {/* ─── REVIEW PHASE ────────────────────────────────── */}
      {scanPhase === 'review' && preScanResult && (
        <div className="flex flex-col items-center gap-4 py-8">
          <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center">
            <Search size={28} className="text-accent" />
          </div>

          <h3 className="text-lg font-heading font-bold">{t('import.scanComplete')}</h3>

          <div className="space-y-1.5 text-center">
            <p className="text-sm">
              <span className="font-bold text-success">{preScanResult.toImport.length}</span>{' '}
              {t('import.scanResult', { toImport: preScanResult.toImport.length, total: preScanResult.total })}
            </p>
            {preScanResult.duplicates > 0 && (
              <p className="text-xs text-cream-500">
                {t('import.duplicatesFound', { count: preScanResult.duplicates })}
              </p>
            )}
            {preScanResult.transfers > 0 && (
              <p className="text-xs text-cream-500">
                {t('import.transfersSkipped', { count: preScanResult.transfers })}
              </p>
            )}
          </div>

          {preScanResult.toImport.length === 0 ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-cream-500">{t('import.nothingToImport')}</p>
              <button onClick={onReset} className="btn-secondary flex items-center gap-2">
                <RefreshCw size={16} /> {t('import.importAnother')}
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button onClick={handleStartImport} className="btn-primary flex items-center gap-2">
                <Play size={16} /> {t('import.startImport')}
              </button>
              <button onClick={onReset} className="btn-ghost text-xs">
                {t('common.cancel')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ─── IMPORTING PHASE ─────────────────────────────── */}
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
              {progress}% ({Math.round(progress / 100 * (preScanResult?.toImport?.length || transactions.length))}/{preScanResult?.toImport?.length || transactions.length})
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

      {/* ─── RESULTS PHASE ───────────────────────────────── */}
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

          {/* Recurring detection banner */}
          {recurringPatterns && recurringPatterns.length > 0 && (
            <div className="w-full max-w-md p-3 rounded-xl bg-accent-50 dark:bg-accent-500/10 border border-accent/20">
              <div className="flex items-center gap-2 mb-1.5">
                <RotateCcw size={14} className="text-accent" />
                <p className="text-sm font-medium">
                  {t('import.recurringFound', { count: recurringPatterns.length })}
                </p>
              </div>
              <p className="text-xs text-cream-500 mb-2">
                {recurringPatterns.slice(0, 3).map((p) => p.merchant).join(', ')}
                {recurringPatterns.length > 3 && ` +${recurringPatterns.length - 3}`}
              </p>
              <button
                onClick={() => navigate('/recurring')}
                className="btn-secondary text-xs"
              >
                {t('import.viewRecurring')}
              </button>
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
