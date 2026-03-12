import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';

/**
 * Global component that listens for background AI job completions
 * and shows toast notifications. Mounted in App.jsx so it persists
 * across page navigation.
 */
export default function BackgroundJobNotifier() {
  const { toast } = useToast();
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const onComplete = (e) => {
      const { txCount, bankName } = e.detail;
      toast.success(
        t('addTransaction.bgJobComplete')
          ?.replace('{bank}', bankName)
          ?.replace('{count}', txCount)
        || `${bankName}: ${txCount} transactions saved as draft. Go to Add Transaction to review.`
      );
    };

    const onError = (e) => {
      toast.error(
        t('addTransaction.bgJobError')
          ?.replace('{error}', e.detail.error)
        || `Bank statement processing failed: ${e.detail.error}`
      );
    };

    window.addEventListener('bg-job-complete', onComplete);
    window.addEventListener('bg-job-error', onError);

    return () => {
      window.removeEventListener('bg-job-complete', onComplete);
      window.removeEventListener('bg-job-error', onError);
    };
  }, [toast, t, navigate]);

  return null;
}
