import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getSetting } from '../lib/storage';

const SyncContext = createContext(null);

export function SyncProvider({ children }) {
  const [status, setStatus] = useState({
    isOnline: navigator.onLine,
    hasBackend: false,
    pendingChanges: 0,
    lastSync: null,
    syncing: false,
    error: null,
  });

  useEffect(() => {
    // Check if backend is configured
    getSetting('apiUrl').then((apiUrl) => {
      const envUrl = import.meta.env.VITE_API_URL;
      setStatus((prev) => ({ ...prev, hasBackend: !!(apiUrl || envUrl) }));
    });

    const handleOnline = () => setStatus((prev) => ({ ...prev, isOnline: true }));
    const handleOffline = () => setStatus((prev) => ({ ...prev, isOnline: false }));
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshStatus = useCallback(async () => {
    const apiUrl = await getSetting('apiUrl');
    const envUrl = import.meta.env.VITE_API_URL;
    setStatus((prev) => ({ ...prev, hasBackend: !!(apiUrl || envUrl) }));
  }, []);

  // Manual refresh: pull all server data into IndexedDB cache
  const syncNow = useCallback(async () => {
    if (!status.hasBackend || !status.isOnline) return { skipped: true };
    setStatus(prev => ({ ...prev, syncing: true, error: null }));
    try {
      const { pullAllDataToCache } = await import('../lib/api.js');
      await pullAllDataToCache();
      setStatus(prev => ({ ...prev, syncing: false, lastSync: new Date().toISOString() }));
      return { success: true };
    } catch (err) {
      setStatus(prev => ({ ...prev, syncing: false, error: err.message }));
      return { error: err.message };
    }
  }, [status.hasBackend, status.isOnline]);

  const value = useMemo(() => ({
    ...status, syncNow, refreshStatus,
  }), [status, syncNow, refreshStatus]);

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within SyncProvider');
  return ctx;
}
