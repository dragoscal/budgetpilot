import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import * as auth from '../lib/auth';
import { migrateLocalToUser } from '../lib/migration';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const migrationRan = useRef(false);

  useEffect(() => {
    auth.getCurrentUser().then((u) => {
      setUser(u);
      setLoading(false);
    });
  }, []);

  // Run userId migration once when user logs in with a real backend account
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
    // Trigger migration immediately after login
    if (u?.id) {
      migrateLocalToUser(u.id).catch((e) =>
        console.warn('Post-login migration error:', e)
      );
    }
    return u;
  }, []);

  const register = useCallback(async (data) => {
    const u = await auth.register(data);
    setUser(u);
    // Trigger migration after registration too (in case they had local data)
    if (u?.id) {
      migrateLocalToUser(u.id).catch((e) =>
        console.warn('Post-register migration error:', e)
      );
    }
    return u;
  }, []);

  const logout = useCallback(() => {
    auth.logout();
    setUser(null);
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
