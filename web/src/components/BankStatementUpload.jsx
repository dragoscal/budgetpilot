import { useState, useRef, useCallback } from 'react';
import { Upload, FileText, X, Loader2, Building2, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { processBankStatement } from '../lib/ai';
import { formatCurrency } from '../lib/helpers';
import { useAuth } from '../contexts/AuthContext';

export default function BankStatementUpload({ onResult, onError }) {
  const { effectiveUserId } = useAuth();
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [bankInfo, setBankInfo] = useState(null);
  const fileRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;

    // Validate PDF
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      onError?.('Please upload a PDF file. Bank statements are typically in PDF format.');
      return;
    }

    // Size check (max 20MB)
    if (file.size > 20 * 1024 * 1024) {
      onError?.('File too large. Maximum size is 20MB.');
      return;
    }

    setFileName(file.name);
    setProcessing(true);
    setProgress(10);
    setStatus('Reading PDF...');
    setBankInfo(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const base64Full = e.target.result;
        const base64Data = base64Full.split(',')[1];

        setProgress(25);
        setStatus('AI analyzing bank statement...');

        const results = await processBankStatement(base64Data, { userId: effectiveUserId });

        setProgress(90);
        setStatus('Preparing transactions...');

        // Store bank info for display
        if (results.bankInfo) {
          setBankInfo(results.bankInfo);
        }

        setProgress(100);
        setStatus('Done!');

        // Transform into the format handleAIResult expects
        const enrichedResult = {
          transactions: results.transactions,
          receipt: {
            store: results.bankInfo?.bankName || 'Bank Statement',
            date: results.bankInfo?.period?.from
              ? `${results.bankInfo.period.from} to ${results.bankInfo.period.to}`
              : 'Unknown period',
            currency: results.bankInfo?.currency || 'RON',
          },
          warnings: results.warnings || [],
          summary: results.summary || `${results.transactions.length} transactions extracted from bank statement`,
          hasItemsToReview: results.hasItemsToReview,
          _bankStatement: true,
          _bankInfo: results.bankInfo,
        };

        onResult?.(enrichedResult);
        setTimeout(() => setStatus(''), 1500);
      } catch (err) {
        onError?.(err.message || 'Failed to process bank statement');
        setStatus('');
      } finally {
        setProcessing(false);
        setProgress(0);
      }
    };

    reader.onerror = () => {
      onError?.('Failed to read the PDF file');
      setProcessing(false);
      setProgress(0);
      setStatus('');
    };

    reader.readAsDataURL(file);
  }, [onResult, onError]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const clear = () => {
    setFileName(null);
    setProcessing(false);
    setStatus('');
    setProgress(0);
    setBankInfo(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Upload area */}
      {!fileName ? (
        <div
          className={`border-2 border-dashed rounded-2xl p-4 md:p-8 text-center transition-colors cursor-pointer ${
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
          <p className="text-sm font-medium">Drop bank statement PDF here or click to upload</p>
          <p className="text-xs text-cream-500 mt-1">Supports PDF bank statements from any Romanian bank</p>
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
          {!processing && (
            <button
              onClick={clear}
              className="p-1.5 rounded-full hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 hover:text-cream-600 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Processing indicator */}
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
            <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{status}</p>
          </div>
        </div>
      )}

      {/* Tips */}
      {!processing && !fileName && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border">
          <AlertTriangle size={14} className="text-cream-400 mt-0.5 shrink-0" />
          <div className="text-[11px] text-cream-500 space-y-1">
            <p>For best results, upload the <strong>official PDF</strong> from your bank's online portal.</p>
            <p>The AI will extract all transactions, categorize them, and check for duplicates with your existing records.</p>
          </div>
        </div>
      )}

      {/* Upload button */}
      <button
        onClick={() => fileRef.current?.click()}
        disabled={processing}
        className="btn-secondary w-full flex items-center justify-center gap-2 disabled:opacity-50"
      >
        <Upload size={16} /> {fileName ? 'Upload different PDF' : 'Select PDF'}
      </button>
    </div>
  );
}
