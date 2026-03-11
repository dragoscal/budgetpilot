import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getSetting, setSetting } from '../lib/storage';
import { t as tRaw, setCurrentLanguage, getCurrentLanguage, getAvailableLanguages } from '../lib/i18n';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState('en'); // default English
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSetting('language').then((val) => {
      const lang = val || 'en';
      setLanguageState(lang);
      setCurrentLanguage(lang);
      setLoaded(true);
    });
  }, []);

  const setLanguage = useCallback((lang) => {
    setLanguageState(lang);
    setCurrentLanguage(lang);
    setSetting('language', lang);
  }, []);

  // Wrap t so it triggers re-render when language changes
  const t = useCallback((key, params) => {
    // eslint-disable-next-line no-unused-expressions
    language; // depend on language so t() re-evaluates on switch
    return tRaw(key, params);
  }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t,
    languages: getAvailableLanguages(),
  }), [language, setLanguage, t]);

  if (!loaded) return null;

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useTranslation must be used within LanguageProvider');
  return ctx;
}
