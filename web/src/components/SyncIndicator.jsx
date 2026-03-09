import { useSync } from '../contexts/SyncContext';
import { Cloud, CloudOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

export default function SyncIndicator({ collapsed = false }) {
  const { hasBackend, pendingChanges, lastSync, syncing, error, syncNow } = useSync();

  // Don't show anything if no backend is configured
  if (!hasBackend) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-cream-400 dark:text-cream-600 ${collapsed ? 'justify-center' : ''}`}
        title="Offline mode — configure Backend API URL in Settings to sync"
      >
        <CloudOff size={13} className="shrink-0" />
        {!collapsed && <span>Offline</span>}
      </div>
    );
  }

  const lastSyncLabel = lastSync
    ? formatTimeAgo(new Date(lastSync))
    : 'Never';

  if (syncing) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-accent-600 dark:text-accent-400 ${collapsed ? 'justify-center' : ''}`}
        title="Syncing..."
      >
        <RefreshCw size={13} className="shrink-0 animate-spin" />
        {!collapsed && <span>Syncing...</span>}
      </div>
    );
  }

  if (error) {
    return (
      <button
        onClick={syncNow}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-warning hover:bg-warning/10 w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
        title={`Sync error: ${error}. Click to retry.`}
      >
        <AlertCircle size={13} className="shrink-0" />
        {!collapsed && <span>Sync error · Retry</span>}
      </button>
    );
  }

  if (pendingChanges > 0) {
    return (
      <button
        onClick={syncNow}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20 w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
        title={`${pendingChanges} pending changes. Click to sync now.`}
      >
        <Cloud size={13} className="shrink-0" />
        {!collapsed && <span>{pendingChanges} pending · Sync</span>}
      </button>
    );
  }

  return (
    <button
      onClick={syncNow}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-success/70 hover:bg-success/5 w-full transition-colors ${collapsed ? 'justify-center' : ''}`}
      title={`Synced · Last: ${lastSyncLabel}. Click to sync now.`}
    >
      <CheckCircle2 size={13} className="shrink-0" />
      {!collapsed && <span>Synced · {lastSyncLabel}</span>}
    </button>
  );
}

function formatTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${diffDay}d ago`;
}
