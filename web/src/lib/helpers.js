import { v4 as uuidv4 } from 'uuid';
import { format, startOfMonth, endOfMonth, differenceInDays, isToday, parseISO } from 'date-fns';
import { CURRENCIES, CATEGORIES, SUBCATEGORIES, RECURRING_FREQUENCIES } from './constants';

export function generateId() {
  return uuidv4();
}

export function formatCurrency(amount, currencyCode = 'RON', { hide = false } = {}) {
  if (hide) return '••••••';
  const currency = CURRENCIES.find((c) => c.code === currencyCode) || CURRENCIES[0];
  const absAmount = Math.abs(amount);
  const formatted = new Intl.NumberFormat(currency.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(absAmount);

  const sign = amount < 0 ? '-' : '';
  if (currency.position === 'suffix') {
    return `${sign}${formatted} ${currency.symbol}`;
  }
  return `${sign}${currency.symbol}${formatted}`;
}

export function formatDate(date, fmt = 'dd MMM yyyy') {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, fmt);
}

export function formatDateShort(date) {
  return formatDate(date, 'dd MMM');
}

export function formatDateISO(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  return format(d, 'yyyy-MM-dd');
}

export function getMonthRange(date = new Date()) {
  return {
    start: startOfMonth(date),
    end: endOfMonth(date),
  };
}

export function getDaysRemaining(date = new Date()) {
  const end = endOfMonth(date);
  return differenceInDays(end, date) + 1;
}

export function getDaysInMonth(date = new Date()) {
  const { start, end } = getMonthRange(date);
  return differenceInDays(end, start) + 1;
}

export function percentOf(value, total) {
  if (!total || total === 0) return 0;
  return Math.round((value / total) * 100);
}

export function isDateToday(date) {
  const d = typeof date === 'string' ? parseISO(date) : date;
  return isToday(d);
}

export function getCategoryById(id) {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

export function getCurrencyByCode(code) {
  return CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : item[key];
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

export function sumBy(arr, key) {
  return arr.reduce((sum, item) => {
    const val = typeof key === 'function' ? key(item) : item[key];
    return sum + (Number(val) || 0);
  }, 0);
}

export function sortByDate(arr, key = 'date', dir = 'desc') {
  return [...arr].sort((a, b) => {
    const da = new Date(a[key]);
    const db = new Date(b[key]);
    return dir === 'desc' ? db - da : da - db;
  });
}

export function truncate(str, len = 30) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}

export function trendIndicator(current, previous) {
  if (!previous || previous === 0) return { direction: 'neutral', percent: 0 };
  const change = ((current - previous) / previous) * 100;
  return {
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral',
    percent: Math.abs(Math.round(change)),
  };
}

export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

// ─── SUBCATEGORY HELPERS ─────────────────────────────────

export function getParentCategory(subcatId) {
  if (!subcatId || !subcatId.includes(':')) return subcatId || 'other';
  return subcatId.split(':')[0];
}

export function getSubcategories(categoryId) {
  return SUBCATEGORIES[categoryId] || [];
}

export function getSubcategoryById(subcatId) {
  if (!subcatId || !subcatId.includes(':')) return null;
  const parentId = subcatId.split(':')[0];
  const subs = SUBCATEGORIES[parentId] || [];
  return subs.find((s) => s.id === subcatId) || null;
}

export function formatCategoryLabel(categoryId, subcategoryId) {
  const cat = getCategoryById(categoryId);
  if (!subcategoryId) return cat.name;
  const sub = getSubcategoryById(subcategoryId);
  return sub ? `${cat.name} > ${sub.name}` : cat.name;
}

// ─── RECURRING FREQUENCY HELPERS ─────────────────────────

export function getFrequencyById(freqId) {
  return RECURRING_FREQUENCIES.find((f) => f.id === freqId) || RECURRING_FREQUENCIES.find((f) => f.id === 'monthly');
}

export function calcMonthlyEquivalent(amount, freqId) {
  const freq = getFrequencyById(freqId);
  return amount * freq.multiplierToMonthly;
}

export function calcAnnualEquivalent(amount, freqId) {
  return calcMonthlyEquivalent(amount, freqId) * 12;
}
