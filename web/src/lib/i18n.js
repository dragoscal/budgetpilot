/**
 * Lightweight i18n engine for LUMET.
 * No external dependencies — just a lookup function with interpolation.
 */
import ro from './translations/ro';
import en from './translations/en';

const translations = { ro, en };

let currentLang = 'ro'; // default — overridden by LanguageContext on mount

export function getCurrentLanguage() {
  return currentLang;
}

export function setCurrentLanguage(lang) {
  if (translations[lang]) {
    currentLang = lang;
  }
}

/**
 * Translate a key with optional parameter interpolation.
 *   t('dashboard.title')                     → 'Panou de control'
 *   t('budget.overBy', { amount: '50 lei' }) → 'Depășit cu 50 lei'
 *
 * Fallback chain: current language → English → key itself.
 */
export function t(key, params) {
  let value = translations[currentLang]?.[key]
            ?? translations.en?.[key]
            ?? key;

  if (params && typeof value === 'string') {
    for (const [k, v] of Object.entries(params)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }

  return value;
}

/**
 * Translate a constant ID within a namespace.
 *   tConst('groceries', 'categories') → t('categories.groceries')
 */
export function tConst(id, namespace) {
  return t(`${namespace}.${id}`);
}

/**
 * Get all available languages for the picker.
 */
export function getAvailableLanguages() {
  return [
    { code: 'ro', name: 'Română', flag: '🇷🇴' },
    { code: 'en', name: 'English', flag: '🇬🇧' },
  ];
}
