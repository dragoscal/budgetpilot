import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as auth from '../lib/auth';
import { migrateLocalToUser } from '../lib/migration';
import { pullAllDataToCache, resetCacheReady } from '../lib/api';
import { clearUserData } from '../lib/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const migrationRan = useRef(false);

  // Listen for 401 auth-expired events from apiFetch to auto-logout
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      resetCacheReady();
      clearUserData().catch(() => {});
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  useEffect(() => {
    auth.getCurrentUser().then((u) => {
      setUser(u);
      setLoading(false);
      // Populate cache on app start if user is already logged in
      if (u?.id && u.id !== 'local') {
        pullAllDataToCache().catch((e) => console.warn('Initial cache pull error:', e));
      }
    });
  }, []);

  // Run userId migration once when user logs in with a real backend account
  // (handles the app-reload case where user was already logged in)
  useEffect(() => {
    if (user?.id && user.id !== 'local' && !migrationRan.current) {
      migrationRan.current = true;
      migrateLocalToUser(user.id).catch((e) =>
        console.warn('userId migration error:', e)
      );
    }
  }, [user]);

  const login = useCallback(async (credentials) => {
    const u = await auth.login(credentials);
    setUser(u);
    if (u?.id) {
      // Mark migration as done so the useEffect doesn't duplicate it
      migrationRan.current = true;
      // Await migration before pulling cache to prevent race condition
      try {
        await migrateLocalToUser(u.id);
      } catch (e) {
        console.warn('Post-login migration error:', e);
      }
      // Pull all server data to local cache (after migration completes)
      pullAllDataToCache().catch((e) =>
        console.warn('Post-login cache pull error:', e)
      );
    }
    return u;
  }, []);

  const register = useCallback(async (data) => {
    const u = await auth.register(data);
    setUser(u);
    if (u?.id) {
      migrationRan.current = true;
      try {
        await migrateLocalToUser(u.id);
      } catch (e) {
        console.warn('Post-register migration error:', e);
      }
      pullAllDataToCache().catch((e) =>
        console.warn('Post-register cache pull error:', e)
      );
    }
    return u;
  }, []);

  const logout = useCallback(() => {
    auth.logout();
    setUser(null);
    migrationRan.current = false;
    // Reset cache readiness so next login re-populates from server
    resetCacheReady();
    // Clear local data cache but preserve settings (API URL, AI keys, theme, etc.)
    clearUserData().catch((e) => console.warn('Logout cache clear error:', e));
  }, []);

  const updateProfile = useCallback(async (changes) => {
    if (!user) return;
    const updated = await auth.updateProfile(user.id, changes);
    setUser(updated);
    return updated;
  }, [user]);

  // effectiveUserId: real server userId when logged in w/ backend, 'local' otherwise
  const effectiveUserId = user?.id || 'local';

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile, effectiveUserId }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
