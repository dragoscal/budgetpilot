import { useState, useRef, useCallback } from 'react';
import { Upload, Camera, X, Loader2, FileText, AlertCircle } from 'lucide-react';
import { processDocument } from '../lib/ai';
import { startDocumentJob, getActiveJob, markJobHandled, cancelJob } from '../lib/backgroundJobs';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

export default function DocumentScanner({ onResult, onError }) {
  const { effectiveUserId } = useAuth();
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState(null);       // { name, type, preview, isImage }
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [bgMode, setBgMode] = useState(false);   // PDF background processing
  const fileRef = useRef(null);
  const mountedRef = useRef(true);

  const isImage = (f) => f.type.startsWith('image/');
  const isPdf = (f) => f.type === 'application/pdf' || f.name?.toLowerCase().endsWith('.pdf');
  const isAccepted = (f) => isImage(f) || isPdf(f);

  const handleFile = useCallback(async (inputFile) => {
    if (!navigator.onLine) {
      onError?.(t('document.offlineWarning'));
      return;
    }
    if (!inputFile || !isAccepted(inputFile)) {
      onError?.(t('document.pdfOnly'));
      return;
    }
    if (inputFile.size > MAX_FILE_SIZE) {
      onError?.(t('document.fileTooLarge'));
      return;
    }
    if (inputFile.size === 0) {
      onError?.(t('document.emptyFile'));
      return;
    }

    const fileIsImage = isImage(inputFile);
    const mediaType = inputFile.type || (fileIsImage ? 'image/jpeg' : 'application/pdf');

    const reader = new FileReader();

    // Timeout for large files
    const readTimeout = setTimeout(() => {
      reader.abort();
      onError?.(t('document.readTimeout'));
    }, 30000);

    reader.onload = async (e) => {
      clearTimeout(readTimeout);
      const base64Full = e.target.result;
      const base64Data = base64Full.split(',')[1];

      if (!base64Data) {
        onError?.(t('document.emptyFile'));
        return;
      }

      setFile({
        name: inputFile.name,
        type: mediaType,
        preview: fileIsImage ? base64Full : null,
        isImage: fileIsImage,
      });
      setProcessing(true);
      setProgress(20);
      setStatus(t('document.reading'));

      if (fileIsImage) {
        // Process images inline (fast)
        try {
          setStatus(t('document.aiAnalyzing'));
          setProgress(50);
          const results = await processDocument(base64Data, mediaType, { userId: effectiveUserId });
          if (!mountedRef.current) return;
          setProgress(100);
          setStatus(t('document.done'));

          if (!results.transactions?.length) {
            onError?.(t('document.noTransactions'));
            setProcessing(false);
            setProgress(0);
            setStatus('');
            return;
          }

          onResult?.(results);
          setTimeout(() => { if (mountedRef.current) setStatus(''); }, 1000);
        } catch (err) {
          if (mountedRef.current) {
            onError?.(err.message || t('document.failed'));
            setStatus('');
          }
        } finally {
          if (mountedRef.current) {
            setProcessing(false);
            setProgress(0);
          }
        }
      } else {
        // Process PDFs via background job (survives navigation)
        setBgMode(true);
        setStatus(t('document.aiAnalyzing'));
        setProgress(40);

        const { promise } = startDocumentJob(base64Data, mediaType, {
          userId: effectiveUserId,
          fileName: inputFile.name,
        });

        try {
          const results = await promise;
          if (!mountedRef.current) return; // Background handler takes over
          markJobHandled();

          setProgress(100);
          setStatus(t('document.done'));

          if (!results.transactions?.length) {
            onError?.(t('document.noTransactions'));
            setProcessing(false);
            setProgress(0);
            setStatus('');
            setBgMode(false);
            return;
          }

          onResult?.(results);
          setTimeout(() => { if (mountedRef.current) setStatus(''); }, 1000);
        } catch (err) {
          if (mountedRef.current) {
            if (err.name !== 'AbortError') {
              onError?.(err.message || t('document.failed'));
            }
            setStatus('');
          }
        } finally {
          if (mountedRef.current) {
            setProcessing(false);
            setProgress(0);
            setBgMode(false);
          }
        }
      }
    };

    reader.onerror = () => {
      clearTimeout(readTimeout);
      onError?.(t('document.failed'));
    };

    reader.readAsDataURL(inputFile);
  }, [onResult, onError, t, effectiveUserId]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  };

  const handleCameraCapture = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (ev) => {
      const f = ev.target.files?.[0];
      if (f) handleFile(f);
    };
    input.click();
  };

  const handleCancel = () => {
    cancelJob();
    clear();
  };

  const clear = () => {
    setFile(null);
    setProcessing(false);
    setStatus('');
    setProgress(0);
    setBgMode(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-3">
      {/* Drop zone / Preview */}
      {!file ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragging
              ? 'border-violet-500 bg-violet-500/5'
              : 'border-cream-300 dark:border-dark-border hover:border-cream-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <FileText size={32} className="mx-auto mb-3 text-cream-400" />
          <p className="text-sm font-medium">{t('document.dropOrClick')}</p>
          <p className="text-xs text-cream-500 mt-1">{t('document.supportedFormats')}</p>
          <p className="text-xs text-cream-400 mt-0.5">{t('document.supportedTypes')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>
      ) : (
        <div className="relative">
          {file.isImage ? (
            <img
              src={file.preview}
              alt={t('addTransaction.document')}
              className="w-full max-h-64 object-contain rounded-xl bg-cream-50 dark:bg-dark-border"
            />
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-cream-50 dark:bg-dark-border">
              <div className="w-12 h-12 rounded-lg bg-violet-100 dark:bg-violet-500/15 flex items-center justify-center">
                <FileText size={24} className="text-violet-600 dark:text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-cream-500">PDF</p>
              </div>
            </div>
          )}
          {!processing && (
            <button
              onClick={clear}
              className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70"
            >
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {/* Progress */}
      {processing && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
          <Loader2 size={18} className="text-violet-600 dark:text-violet-400 animate-spin" />
          <div className="flex-1">
            <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-violet-600 dark:text-violet-400 mt-1">{status}</p>
            {bgMode && (
              <p className="text-xs text-cream-400 mt-0.5">{t('document.canNavigateAway')}</p>
            )}
          </div>
          {bgMode && (
            <button
              onClick={handleCancel}
              className="text-xs text-cream-500 hover:text-danger transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Upload size={16} /> {t('document.uploadBtn')}
        </button>
        <button
          onClick={handleCameraCapture}
          disabled={processing}
          className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Camera size={16} /> {t('document.cameraBtn')}
        </button>
      </div>

      {/* Tips */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-cream-100/60 dark:bg-cream-800/20 text-xs text-cream-500">
        <AlertCircle size={13} className="mt-0.5 shrink-0" />
        <div>
          <p>{t('document.tip1')}</p>
          <p className="mt-0.5">{t('document.tip2')}</p>
        </div>
      </div>
    </div>
  );
}
