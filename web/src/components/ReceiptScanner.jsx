import { useState, useRef, useCallback } from 'react';
import { Upload, Camera, X, Loader2, History } from 'lucide-react';
import { processReceipt, getReceiptHistory } from '../lib/ai';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';

export default function ReceiptScanner({ onResult, onError }) {
  const { effectiveUserId } = useAuth();
  const { t } = useTranslation();
  const [dragging, setDragging] = useState(false);
  const [image, setImage] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!navigator.onLine) {
      onError?.(t('receipt.offlineWarning') || 'Receipt scanning requires an internet connection. Please try again when online.');
      return;
    }
    if (!file || !file.type.startsWith('image/')) {
      onError?.(t('receipt.uploadImage'));
      return;
    }

    const mediaType = file.type || 'image/jpeg';

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64Full = e.target.result;
      setImage(base64Full);
      setProcessing(true);
      setProgress(20);
      setStatus(t('receipt.readingReceipt'));

      try {
        const base64Data = base64Full.split(',')[1];
        setStatus(t('receipt.aiAnalyzing'));
        setProgress(50);
        const results = await processReceipt(base64Data, mediaType, { userId: effectiveUserId });
        setProgress(100);
        setStatus(t('receipt.done'));

        // Pass the full enhanced result (transactions, receipt, warnings, summary, hasItemsToReview)
        onResult?.(results);
        setTimeout(() => setStatus(''), 1000);
      } catch (err) {
        onError?.(err.message || t('receipt.failed'));
        setStatus('');
      } finally {
        setProcessing(false);
        setProgress(0);
      }
    };
    reader.readAsDataURL(file);
  }, [onResult, onError, t, effectiveUserId]);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleCameraCapture = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  };

  const clear = () => {
    setImage(null);
    setProcessing(false);
    setStatus('');
    setProgress(0);
  };

  return (
    <div className="space-y-3">
      {!image ? (
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
            dragging
              ? 'border-success bg-success/5'
              : 'border-cream-300 dark:border-dark-border hover:border-cream-400'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={32} className="mx-auto mb-3 text-cream-400" />
          <p className="text-sm font-medium">{t('receipt.dropOrClick')}</p>
          <p className="text-xs text-cream-500 mt-1">{t('receipt.supportedFormats')}</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="relative">
          <img src={image} alt={t('addTransaction.receipt')} className="w-full max-h-64 object-contain rounded-xl bg-cream-50 dark:bg-dark-border" />
          {!processing && (
            <button onClick={clear} className="absolute top-2 right-2 p-1 rounded-full bg-black/50 text-white hover:bg-black/70">
              <X size={16} />
            </button>
          )}
        </div>
      )}

      {processing && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-info/5 border border-info/20">
          <Loader2 size={18} className="text-info animate-spin" />
          <div className="flex-1">
            <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
              <div className="h-full bg-info rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-info mt-1">{status}</p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={processing}
          className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Upload size={16} /> {t('receipt.uploadBtn')}
        </button>
        <button
          onClick={handleCameraCapture}
          disabled={processing}
          className="btn-secondary flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Camera size={16} /> {t('receipt.cameraBtn')}
        </button>
      </div>
    </div>
  );
}
