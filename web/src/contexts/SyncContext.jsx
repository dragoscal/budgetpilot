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

  // No-op — server-first model has no sync queue
  const syncNow = useCallback(async () => ({}), []);

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
