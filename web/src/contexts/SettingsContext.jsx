import { createContext, useContext, useState, useEffect } from 'react';
import { getSetting } from '../lib/storage';
import { settings as settingsApi } from '../lib/api';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [hideAmounts, setHideAmounts] = useState('none');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSetting('hideAmounts').then((val) => {
      setHideAmounts(val || 'none');
      setLoaded(true);
    });
  }, []);

  // Listen for server settings sync (after login / pullAllDataToCache)
  useEffect(() => {
    const handleSync = () => {
      getSetting('hideAmounts').then((val) => {
        if (val && val !== hideAmounts) {
          setHideAmounts(val);
        }
      });
    };
    window.addEventListener('settings-synced', handleSync);
    return () => window.removeEventListener('settings-synced', handleSync);
  }, [hideAmounts]);

  const updateHideAmounts = (value) => {
    setHideAmounts(value);
    settingsApi.set('hideAmounts', value);
  };

  const shouldHide = (type) => {
    if (hideAmounts === 'all') return true;
    if (hideAmounts === 'income' && type === 'income') return true;
    return false;
  };

  // Render immediately with defaults instead of blocking (#20)
  return (
    <SettingsContext.Provider value={{ hideAmounts, updateHideAmounts, shouldHide }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useHideAmounts() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useHideAmounts must be used within SettingsProvider');
  return ctx;
}
