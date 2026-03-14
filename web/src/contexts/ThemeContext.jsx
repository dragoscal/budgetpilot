import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getSetting } from '../lib/storage';
import { settings as settingsApi } from '../lib/api';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSetting('darkMode').then((val) => {
      const isDark = val === true;
      setDark(isDark);
      document.documentElement.classList.toggle('dark', isDark);
      setLoaded(true);
    });
  }, []);

  // Listen for server settings sync (after login / pullAllDataToCache)
  useEffect(() => {
    const handleSync = () => {
      getSetting('darkMode').then((val) => {
        const isDark = val === true;
        if (isDark !== dark) {
          setDark(isDark);
          document.documentElement.classList.toggle('dark', isDark);
        }
      });
    };
    window.addEventListener('settings-synced', handleSync);
    return () => window.removeEventListener('settings-synced', handleSync);
  }, [dark]);

  const toggleTheme = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      settingsApi.set('darkMode', next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ dark, toggleTheme }), [dark, toggleTheme]);

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
