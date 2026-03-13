import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, X, Loader2, Building2, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../lib/helpers';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import {
  startBankStatementJob,
  markJobHandled,
  cancelJob,
  getActiveJob,
} from '../lib/backgroundJobs';

export default function BankStatementUpload({ onResult, onError }) {
  const { t } = useTranslation();
  const { effectiveUserId } = useAuth();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [bankInfo, setBankInfo] = useState(null);
  const fileRef = useRef(null);
  const mountedRef = useRef(true);

  // On mount: check if there's an active background job (user came back mid-processing)
  useEffect(() => {
    mountedRef.current = true;
    const job = getActiveJob();
    if (job && job.status === 'processing' && !job.handled) {
      // Resume showing progress for the in-flight job
      setFileName(job.fileName);
      setProcessing(true);
      setProgress(25);
      setStatus(t('addTransaction.aiAnalyzing'));

      // Attach to the existing promise
      job.promise
        .then((results) => {
          if (!mountedRef.current) return; // Component unmounted again
          markJobHandled();
          handleResults(results, job.fileName);
        })
        .catch((err) => {
          if (!mountedRef.current) return;
          if (err.name === 'AbortError') return;
          onError?.(err.message || t('addTransaction.failedProcess'));
          setStatus('');
        })
        .finally(() => {
          if (!mountedRef.current) return;
          setProcessing(false);
          setProgress(0);
        });
    }

    // On unmount: DON'T abort — let background system handle completion
    return () => {
      mountedRef.current = false;
      // The backgroundJobs module will handle the result if still processing
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleResults = useCallback((results, fName) => {
    setProgress(90);
    setStatus(t('addTransaction.preparingTx'));

    if (results.bankInfo) {
      setBankInfo(results.bankInfo);
    }

    setProgress(100);
    setStatus(t('common.done'));

    const enrichedResult = {
      transactions: results.transactions,
      receipt: {
        store: (results.bankInfo?.bankName && results.bankInfo.bankName !== 'Unknown Bank')
          ? results.bankInfo.bankName
          : t('addTransaction.bankStatement'),
        date: results.bankInfo?.period?.from
          ? `${results.bankInfo.period.from} to ${results.bankInfo.period.to}`
          : t('addTransaction.unknownPeriod'),
        currency: results.bankInfo?.currency || 'RON',
      },
      warnings: results.warnings || [],
      summary: results.summary || `${results.transactions.length} ${t('addTransaction.txExtracted')}`,
      hasItemsToReview: results.hasItemsToReview,
      _bankStatement: true,
      _bankInfo: results.bankInfo,
    };

    onResult?.(enrichedResult);
    setTimeout(() => setStatus(''), 1500);
  }, [onResult, t]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    if (!navigator.onLine) {
      onError?.(t('addTransaction.offlineWarning') || 'Bank statement processing requires an internet connection.');
      return;
    }

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onError?.(t('addTransaction.pdfOnly'));
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      onError?.(t('addTransaction.fileTooLarge'));
      return;
    }

    setFileName(file.name);
    setProcessing(true);
    setProgress(10);
    setStatus(t('addTransaction.readingPdf'));
    setBankInfo(null);

    const reader = new FileReader();

    // Timeout for FileReader — prevent hanging on very large files
    const readerTimeout = setTimeout(() => {
      reader.abort();
      if (mountedRef.current) {
        onError?.(t('addTransaction.readTimeout') || 'File reading timed out. The file may be too large or corrupted.');
        setProcessing(false);
        setProgress(0);
        setStatus('');
      }
    }, 30000); // 30s timeout for reading

    reader.onload = async (e) => {
      clearTimeout(readerTimeout);
      try {
        const base64Full = e.target.result;
        const base64Data = base64Full.split(',')[1];

        if (!base64Data || base64Data.length < 100) {
          throw new Error(t('addTransaction.emptyPdf') || 'PDF appears to be empty or corrupted.');
        }

        setProgress(25);
        setStatus(t('addTransaction.aiAnalyzing'));

        // Start via background job system (survives navigation)
        const { promise } = startBankStatementJob(base64Data, {
          userId: effectiveUserId,
          fileName: file.name,
          onProgress: ({ pass, count }) => {
            if (mountedRef.current) {
              setStatus(t('document.multiPassProgress').replace('{count}', count));
              setProgress(prev => Math.min(85, prev + 10));
            }
          },
        });

        const results = await promise;

        // If still mounted, handle inline
        if (!mountedRef.current) return;
        markJobHandled();

        // Validate AI returned actual transactions
        if (!results || !results.transactions || results.transactions.length === 0) {
          const msg = t('addTransaction.noTransactionsFound') || 'No transactions found in the PDF. Make sure this is a valid bank statement.';
          onError?.(msg);
          setStatus('');
          return;
        }

        handleResults(results, file.name);
      } catch (err) {
        if (!mountedRef.current) return;
        if (err.name === 'AbortError') return;
        // Provide clearer error messages
        let msg = err.message || t('addTransaction.failedProcess');
        if (msg.includes('API key') || msg.includes('api key')) {
          msg = t('addTransaction.noAiKey') || 'No AI API key configured. Go to Settings to add one.';
        } else if (msg.includes('timed out') || msg.includes('timeout')) {
          msg = t('addTransaction.processTimeout') || 'Processing timed out. The PDF may have too many pages — try splitting it.';
        }
        onError?.(msg);
        setStatus('');
      } finally {
        if (mountedRef.current) {
          setProcessing(false);
          setProgress(0);
        }
      }
    };

    reader.onerror = () => {
      clearTimeout(readerTimeout);
      onError?.(t('addTransaction.failedReadPdf'));
      setProcessing(false);
      setProgress(0);
      setStatus('');
    };

    reader.readAsDataURL(file);
  }, [onResult, onError, t, effectiveUserId, handleResults]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleCancel = () => {
    cancelJob();
    setProcessing(false);
    setProgress(0);
    setStatus('');
  };

  const clear = () => {
    handleCancel();
    setFileName(null);
    setBankInfo(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {!fileName ? (
        <div
          className={`border-2 border-dashed rounded-lg p-4 md:p-8 text-center transition-colors cursor-pointer ${
            dragging
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/10'
              : 'border-cream-300 dark:border-dark-border hover:border-cream-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <Building2 size={32} className="mx-auto mb-3 text-cream-400" />
          <p className="text-sm font-medium">{t('addTransaction.dropPdf')}</p>
          <p className="text-xs text-cream-500 mt-1">{t('addTransaction.supportsPdf')}</p>
          <p className="text-[10px] text-cream-400 mt-2">
            BRD, BCR, ING, Raiffeisen, Banca Transilvania, CEC, UniCredit, OTP, Alpha Bank
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="relative flex items-center gap-3 p-4 rounded-xl bg-cream-50 dark:bg-dark-card border border-cream-200 dark:border-dark-border">
          <FileText size={24} className="text-indigo-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            {bankInfo && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                {bankInfo.bankName && bankInfo.bankName !== 'Unknown Bank' && (
                  <span className="text-xs text-cream-500 flex items-center gap-1">
                    <Building2 size={10} /> {bankInfo.bankName}
                  </span>
                )}
                {bankInfo.accountNumber && (
                  <span className="text-xs text-cream-500 flex items-center gap-1">
                    <CreditCard size={10} /> ****{bankInfo.accountNumber}
                  </span>
                )}
                {bankInfo.period && (
                  <span className="text-xs text-cream-500 flex items-center gap-1">
                    <Calendar size={10} /> {bankInfo.period.from} → {bankInfo.period.to}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={clear}
            className="p-1.5 rounded-full hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 hover:text-cream-600 transition-colors shrink-0"
            title={processing ? t('common.cancel') : undefined}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {processing && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/30">
          <Loader2 size={18} className="text-indigo-500 animate-spin shrink-0" />
          <div className="flex-1">
            <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
              {status}
              <span className="text-cream-400 ml-2">{t('addTransaction.canNavigateAway') || 'You can leave this page — processing will continue'}</span>
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-800/30 text-indigo-400 hover:text-indigo-600 transition-colors shrink-0"
            title={t('common.cancel')}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {!processing && !fileName && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border">
          <AlertTriangle size={14} className="text-cream-400 mt-0.5 shrink-0" />
          <div className="text-[11px] text-cream-500 space-y-1">
            <p>{t('addTransaction.pdfTip1')}</p>
            <p>{t('addTransaction.pdfTip2')}</p>
          </div>
        </div>
      )}

      <button
        onClick={() => {
          if (processing) handleCancel();
          fileRef.current?.click();
        }}
        className="btn-secondary w-full flex items-center justify-center gap-2"
      >
        <Upload size={16} /> {fileName ? t('addTransaction.uploadDifferent') : t('addTransaction.selectPdf')}
      </button>
    </div>
  );
}
