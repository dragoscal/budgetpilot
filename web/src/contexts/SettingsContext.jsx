import { createContext, useContext, useState, useEffect } from 'react';
import { getSetting, setSetting } from '../lib/storage';

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

  const updateHideAmounts = (value) => {
    setHideAmounts(value);
    setSetting('hideAmounts', value);
  };

  const shouldHide = (type) => {
    if (hideAmounts === 'all') return true;
    if (hideAmounts === 'income' && type === 'income') return true;
    return false;
  };

  if (!loaded) return null;

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
