import { createContext, useContext, useState, useEffect } from 'react';
import { getSetting, setSetting } from '../lib/storage';

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

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    setSetting('darkMode', next);
  };

  if (!loaded) return null;

  return (
    <ThemeContext.Provider value={{ dark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
