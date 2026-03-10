import { useState, useEffect } from 'react';
import { WifiOff } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

export default function OfflineBanner() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setOffline(false);
    const handleOffline = () => setOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-warning/90 text-warning-dark px-4 py-2 text-center text-xs font-medium flex items-center justify-center gap-2 backdrop-blur-sm">
      <WifiOff size={14} />
      {t('offline.message')}
    </div>
  );
}
