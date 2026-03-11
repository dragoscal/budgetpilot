import { useSync } from '../contexts/SyncContext';
import { useTranslation } from '../contexts/LanguageContext';
import { CloudOff, CheckCircle2, WifiOff } from 'lucide-react';

export default function SyncIndicator({ collapsed = false, mobile = false }) {
  const { t } = useTranslation();
  const { hasBackend, isOnline } = useSync();

  if (!hasBackend) {
    if (mobile) return null;
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-cream-400 dark:text-cream-600 ${collapsed ? 'justify-center' : ''}`}
        title={t('sync.localOnlyTip')}
      >
        <CloudOff size={13} className="shrink-0" />
        {!collapsed && <span>{t('sync.localOnly')}</span>}
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-warning ${collapsed ? 'justify-center' : ''}`}
        title={t('sync.offlineTip') || 'You are offline. Data is read-only.'}
      >
        <WifiOff size={13} className="shrink-0" />
        {!collapsed && <span>{t('sync.offline') || 'Offline'}</span>}
      </div>
    );
  }

  if (mobile) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-success/60">
        <CheckCircle2 size={10} />
        <span>{t('sync.autoSynced')}</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-success/70 ${collapsed ? 'justify-center' : ''}`}
      title={t('sync.connectedTip') || 'Connected to server'}
    >
      <CheckCircle2 size={13} className="shrink-0" />
      {!collapsed && <span>{t('sync.autoSynced')}</span>}
    </div>
  );
}
