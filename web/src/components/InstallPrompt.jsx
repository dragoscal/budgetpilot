import { useState, useEffect } from 'react';
import { Download, X, Share } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

const DISMISS_KEY = 'bp_installDismissed';
const DISMISS_COUNT_KEY = 'bp_installDismissCount';
const MAX_DISMISSALS = 3;

function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const { t } = useTranslation();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [showIOS, setShowIOS] = useState(false);

  useEffect(() => {
    if (isInStandaloneMode()) return;

    const dismissCount = parseInt(localStorage.getItem(DISMISS_COUNT_KEY) || '0', 10);
    if (dismissCount >= MAX_DISMISSALS) return;

    const lastDismissed = localStorage.getItem(DISMISS_KEY);
    if (lastDismissed) {
      const daysSince = (Date.now() - parseInt(lastDismissed, 10)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return;
    }

    // iOS Safari — no beforeinstallprompt, show manual guide
    if (isIOS()) {
      setTimeout(() => setShowIOS(true), 3000);
      return;
    }

    // Chrome/Edge/Android — standard install prompt
    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShow(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setShow(false);
    setShowIOS(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
    const count = parseInt(localStorage.getItem(DISMISS_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(DISMISS_COUNT_KEY, count.toString());
  };

  // iOS install guide
  if (showIOS) {
    return (
      <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-fadeUp">
        <div className="bg-white dark:bg-dark-card rounded-lg border border-cream-200 dark:border-dark-border shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center shrink-0">
              <Download size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t('install.title')}</p>
              <p className="text-xs text-cream-500 mt-1 leading-relaxed">
                {t('install.iosStep1')} <Share size={12} className="inline -mt-0.5 text-accent-600" /> {t('install.iosStep2')}
              </p>
              <button
                onClick={handleDismiss}
                className="btn-ghost text-xs py-1.5 mt-2"
              >
                {t('install.gotIt')}
              </button>
            </div>
            <button
              onClick={handleDismiss}
              className="p-1 rounded-lg hover:bg-cream-100 dark:hover:bg-dark-border text-cream-400 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Standard Chrome/Android install prompt
  if (!show) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 animate-fadeUp">
      <div className="bg-white dark:bg-dark-card rounded-lg border border-cream-200 dark:border-dark-border shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center shrink-0">
            <Download size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{t('install.title')}</p>
            <p className="text-xs text-cream-500 mt-0.5">
              {t('install.description')}
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="btn-primary text-xs py-1.5 px-4"
              >
                {t('install.install')}
              </button>
              <button
                onClick={handleDismiss}
                className="btn-ghost text-xs py-1.5"
              >
                {t('install.notNow')}
              </button>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-lg hover:bg-cream-100 dark:hover:bg-dark-border text-cream-400 shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
