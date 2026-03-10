import { useSync } from '../contexts/SyncContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SyncIndicator({ collapsed = false, mobile = false }) {
  const { t } = useTranslation();
  const { hasBackend, pendingChanges, lastSync, syncing, error, syncNow } = useSync();

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

  const lastSyncLabel = lastSync
    ? formatTimeAgo(new Date(lastSync), t)
    : t('sync.never');

  if (mobile) {
    if (syncing) {
      return (
        <div className="flex items-center gap-1 text-[10px] text-accent-500">
          <RefreshCw size={10} className="animate-spin" />
          <span>{t('sync.syncing')}</span>
        </div>
      );
    }
    if (error) {
      return (
        <button onClick={syncNow} className="flex items-center gap-1 text-[10px] text-warning">
          <AlertCircle size={10} />
          <span>{t('sync.error')}</span>
        </button>
      );
    }
    if (pendingChanges > 0) {
      return (
        <button onClick={syncNow} className="flex items-center gap-1 text-[10px] text-accent-500">
          <Cloud size={10} />
          <span>{t('sync.pending', { count: pendingChanges })}</span>
        </button>
      );
    }
    return (
      <button onClick={syncNow} className="flex items-center gap-1 text-[10px] text-success/60">
        <CheckCircle2 size={10} />
        <span>{lastSyncLabel}</span>
      </button>
    );
  }

  if (syncing) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-accent-600 dark:text-accent-400 ${collapsed ? 'justify-center' : ''}`}
        title={t('sync.syncingData')}
      >
        <RefreshCw size={13} className="shrink-0 animate-spin" />
        {!collapsed && <span>{t('sync.syncing')}...</span>}
      </div>
    );
  }

  if (error) {
    return (
      <button
        onClick={syncNow}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-warning hover:bg-warning/10 w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
        title={t('sync.errorRetry', { error })}
      >
        <AlertCircle size={13} className="shrink-0" />
        {!collapsed && <span>{t('sync.errorRetryShort')}</span>}
      </button>
    );
  }

  if (pendingChanges > 0) {
    return (
      <button
        onClick={syncNow}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
        title={t('sync.pendingTip', { count: pendingChanges })}
      >
        <Cloud size={13} className="shrink-0" />
        {!collapsed && <span>{t('sync.pendingTapSync', { count: pendingChanges })}</span>}
      </button>
    );
  }

  return (
    <button
      onClick={syncNow}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-success/70 hover:bg-success/5 w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
      title={t('sync.autoSyncTip', { time: lastSyncLabel })}
    >
      <CheckCircle2 size={13} className="shrink-0" />
      {!collapsed && <span>{t('sync.autoSynced')} · {lastSyncLabel}</span>}
    </button>
  );
}

function formatTimeAgo(date, t) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return t('sync.justNow');
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  return `${diffDay}d`;
}
