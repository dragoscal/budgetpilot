import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { getSyncStatus, fullSync, startAutoSync, stopAutoSync, isAutoSyncRunning, onSyncComplete } from '../lib/sync';
import { getSetting } from '../lib/storage';

const SyncContext = createContext(null);

function hasAuthToken() {
  return !!(sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token'));
}

export function SyncProvider({ children }) {
  const [status, setStatus] = useState({
    isOnline: false,
    hasBackend: false,
    pendingChanges: 0,
    lastSync: null,
    syncing: false,
    error: null,
  });
  const initRef = useRef(false);

  // Initialize sync on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function init() {
      const syncStatus = await getSyncStatus();
      setStatus((prev) => ({ ...prev, ...syncStatus }));

      // Only start auto-sync if backend is configured AND user is authenticated
      if (syncStatus.hasBackend && hasAuthToken() && !isAutoSyncRunning()) {
        startAutoSync(60000); // Every 60 seconds
      }
    }

    init();

    // Listen for online/offline changes
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isOnline: true }));
      // Trigger sync when coming back online
      if (hasAuthToken()) {
        fullSync().catch(() => {});
      }
    };
    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isOnline: false }));
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Listen for sync completions
    const unsub = onSyncComplete((result) => {
      // Refresh status after each sync
      getSyncStatus().then((s) => {
        setStatus((prev) => ({
          ...prev,
          ...s,
          syncing: false,
          error: result.pushed?.failed > 0 ? `${result.pushed.failed} changes failed to sync` : null,
        }));
      });
    });

    return () => {
      unsub();
      stopAutoSync();
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Re-check sync status when apiUrl changes (e.g., after settings save or login)
  const refreshStatus = useCallback(async () => {
    const syncStatus = await getSyncStatus();
    setStatus((prev) => ({ ...prev, ...syncStatus }));

    if (syncStatus.hasBackend && hasAuthToken() && !isAutoSyncRunning()) {
      startAutoSync(60000);
    } else if ((!syncStatus.hasBackend || !hasAuthToken()) && isAutoSyncRunning()) {
      stopAutoSync();
    }
  }, []);

  // Manual sync trigger
  const syncNow = useCallback(async () => {
    if (!hasAuthToken()) return { pushed: { synced: 0, failed: 0 }, pulled: 'skipped' };

    setStatus((prev) => ({ ...prev, syncing: true, error: null }));
    try {
      const result = await fullSync();
      const syncStatus = await getSyncStatus();
      setStatus((prev) => ({
        ...prev,
        ...syncStatus,
        syncing: false,
        error: result.pushed?.failed > 0 ? `${result.pushed.failed} changes failed to sync` : null,
      }));
      return result;
    } catch (err) {
      setStatus((prev) => ({ ...prev, syncing: false, error: err.message }));
      throw err;
    }
  }, []);

  return (
    <SyncContext.Provider value={{ ...status, syncNow, refreshStatus }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
