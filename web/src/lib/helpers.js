import { v4 as uuidv4 } from 'uuid';
import { format, startOfMonth, endOfMonth, differenceInDays, isToday, parseISO } from 'date-fns';
import { CURRENCIES, CATEGORIES, SUBCATEGORIES, RECURRING_FREQUENCIES } from './constants';
import { getCategoryByIdSync, getSubcategoriesSync, getSubcategoryByIdSync } from './categoryManager';

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

/** Get today's date as YYYY-MM-DD in local timezone (avoids UTC midnight bug) */
export function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Convert a Date to YYYY-MM-DD in local timezone */
export function dateToLocalISO(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Safely parse a YYYY-MM-DD date string as local midnight (not UTC).
 * Prevents the UTC timezone bug where '2024-03-10' becomes March 9 in UTC+2.
 */
export function parseLocalDate(dateStr) {
  if (!dateStr) return new Date();
  // YYYY-MM-DD format is parsed as UTC by new Date(), so we split and construct locally
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(dateStr);
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
  return getCategoryByIdSync(id);
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

/**
 * Convert and display amount in default currency, showing both if different
 * @param {number} amount
 * @param {string} fromCurrency
 * @param {string} defaultCurrency
 * @param {Object} rates — exchange rates from getRates()
 * @returns {{ original: string, converted: string|null, convertedAmount: number }}
 */
export function getDisplayAmount(amount, fromCurrency, defaultCurrency, rates) {
  const original = formatCurrency(amount, fromCurrency);
  if (!rates || fromCurrency === defaultCurrency) {
    return { original, converted: null, convertedAmount: amount };
  }
  const fromRate = rates[fromCurrency];
  const toRate = rates[defaultCurrency];
  if (!fromRate || !toRate) return { original, converted: null, convertedAmount: amount };

  const inBase = amount / fromRate;
  const convertedAmount = Math.round(inBase * toRate * 100) / 100;
  const converted = formatCurrency(convertedAmount, defaultCurrency);
  return { original, converted: `≈ ${converted}`, convertedAmount };
}

/**
 * Sum amounts across currencies, converting everything to the default currency
 */
export function sumAmountsMultiCurrency(items, defaultCurrency, rates, amountKey = 'amount', currencyKey = 'currency') {
  if (!rates) {
    return items.reduce((sum, item) => sum + (Number(item[amountKey]) || 0), 0);
  }
  return items.reduce((sum, item) => {
    const amount = Number(item[amountKey]) || 0;
    const curr = item[currencyKey] || defaultCurrency;
    if (curr === defaultCurrency) return sum + amount;
    const fromRate = rates[curr];
    const toRate = rates[defaultCurrency];
    if (!fromRate || !toRate) return sum + amount;
    return sum + (amount / fromRate) * toRate;
  }, 0);
}

// ─── SUBCATEGORY HELPERS ─────────────────────────────────

export function getParentCategory(subcatId) {
  if (!subcatId || !subcatId.includes(':')) return subcatId || 'other';
  return subcatId.split(':')[0];
}

export function getSubcategories(categoryId) {
  return getSubcategoriesSync(categoryId);
}

export function getSubcategoryById(subcatId) {
  return getSubcategoryByIdSync(subcatId);
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

// ─── RECURRING AUTO-CREATE HELPERS ───────────────────────

/**
 * Check if a recurring item's billing day has passed this month
 * and no transaction exists for it yet. Returns items that need auto-creation.
 */
export function getRecurringDueToday(recurringItems, existingTransactions) {
  const now = new Date();
  const currentDay = now.getDate();
  const currentMonthNum = now.getMonth(); // 0-indexed
  const currentMonth = `${now.getFullYear()}-${String(currentMonthNum + 1).padStart(2, '0')}`;

  return recurringItems.filter(item => {
    if (item.status === 'cancelled' || item.status === 'paused') return false;
    if (!item.active && item.active !== undefined) return false;
    if ((item.billingDay || 1) > currentDay) return false; // not yet due

    // For annual/semiannual/biannual: check if current month matches billingMonth
    if (['annual', 'semiannual', 'biannual'].includes(item.frequency)) {
      const billingMonth = (item.billingMonth || 1) - 1; // convert to 0-indexed
      if (item.frequency === 'annual' && currentMonthNum !== billingMonth) return false;
      if (item.frequency === 'semiannual' && currentMonthNum !== billingMonth && currentMonthNum !== (billingMonth + 6) % 12) return false;
      if (item.frequency === 'biannual') {
        // Every 2 years: check month matches AND year parity matches creation year
        if (currentMonthNum !== billingMonth) return false;
        const startYear = item.createdAt ? new Date(item.createdAt).getFullYear() : now.getFullYear();
        if ((now.getFullYear() - startYear) % 2 !== 0) return false;
      }
    }

    // Check if already created this month (by recurringId link OR merchant match)
    const alreadyCreated = existingTransactions.some(tx =>
      (tx.recurringId === item.id ||
        (tx.merchant === (item.name || item.merchant) &&
         Math.abs(tx.amount - item.amount) < 0.01 &&
         tx.source === 'recurring')) &&
      tx.date?.startsWith(currentMonth)
    );

    return !alreadyCreated;
  });
}

/**
 * Split due recurring items into manual and auto-debit groups.
 */
export function splitRecurringDue(recurringItems, existingTransactions) {
  const dueItems = getRecurringDueToday(recurringItems, existingTransactions);
  return {
    manual: dueItems.filter(item => !item.autoDebit),
    auto: dueItems.filter(item => !!item.autoDebit),
  };
}

/**
 * Calculate total spent and payment count for a recurring item
 * by querying linked transactions (by recurringId or merchant match).
 */
export function getRecurringPaymentStats(recurringItem, allTransactions) {
  const linked = allTransactions.filter(tx =>
    tx.recurringId === recurringItem.id ||
    (tx.source === 'recurring' &&
     tx.merchant === (recurringItem.name || recurringItem.merchant) &&
     Math.abs(tx.amount - recurringItem.amount) < 0.01)
  );
  const totalSpent = linked.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  const lastPayment = linked.length > 0
    ? linked.sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0].date
    : null;
  return { totalSpent, paymentCount: linked.length, lastPayment };
}

/**
 * Validate a transaction before saving. Returns { valid, errors }.
 */
export function validateTransaction(tx) {
  const errors = [];

  if (!tx.amount || Number(tx.amount) <= 0) {
    errors.push('Amount must be greater than 0');
  }
  if (Number(tx.amount) > 1000000) {
    errors.push('Amount seems too large (max 1,000,000)');
  }
  if (!tx.date) {
    errors.push('Date is required');
  } else {
    const txDate = new Date(tx.date);
    const oneYearFromNow = new Date();
    oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
    if (txDate > oneYearFromNow) {
      errors.push('Date cannot be more than 1 year in the future');
    }
    if (isNaN(txDate.getTime())) {
      errors.push('Invalid date format');
    }
  }
  if (!tx.type || !['expense', 'income', 'transfer'].includes(tx.type)) {
    errors.push('Transaction type must be expense, income, or transfer');
  }

  return { valid: errors.length === 0, errors };
}

// ─── NUMBER PARSING ─────────────────────────────────────

/**
 * Parse a number from user input that may use comma or dot as decimal separator.
 * European locales (RO, DE, FR) type "12,50" instead of "12.50".
 * Handles:  "12,50" → 12.5,  "1.234,56" → 1234.56,  "1,234.56" → 1234.56
 */
export function parseLocalNumber(str) {
  if (typeof str === 'number') return str;
  if (!str || typeof str !== 'string') return NaN;
  let s = str.trim();
  // Remove currency symbols/letters
  s = s.replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) {
    // Detect EU "1.234,56" vs US "1,234.56" by last separator position
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (s.includes(',')) {
    // Multiple commas = thousands separators (e.g., "1,234,567")
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1) {
      s = s.replace(/,/g, ''); // strip all commas (thousands separators)
    } else {
      // Single comma: could be decimal (EU "12,50") or thousands ("1,234")
      // If exactly 3 digits after the comma, treat as thousands separator
      const afterComma = s.split(',')[1];
      if (afterComma && afterComma.length === 3) {
        s = s.replace(',', ''); // thousands separator
      } else {
        s = s.replace(',', '.'); // decimal separator
      }
    }
  }
  return Number(s);
}

// ─── SETTLEMENT HELPERS ─────────────────────────────────

/**
 * Given an array of debts, calculate the minimal set of payments
 * needed to settle all balances (balance netting algorithm).
 *
 * @param {Array<{ from: string, to: string, amount: number }>} debts
 * @returns {Array<{ from: string, to: string, amount: number }>}
 */
export function calculateSettlements(debts) {
  if (!debts || debts.length === 0) return [];

  // 1. Calculate net balance for each person
  const balances = {};
  for (const debt of debts) {
    const amt = Number(debt.amount) || 0;
    if (amt <= 0) continue;
    balances[debt.from] = (balances[debt.from] || 0) - amt;
    balances[debt.to] = (balances[debt.to] || 0) + amt;
  }

  // 2. Separate into creditors (positive balance) and debtors (negative balance)
  const creditors = []; // people who are owed money
  const debtors = [];   // people who owe money

  for (const [person, balance] of Object.entries(balances)) {
    const rounded = Math.round(balance * 100) / 100;
    if (rounded > 0.01) {
      creditors.push({ person, amount: rounded });
    } else if (rounded < -0.01) {
      debtors.push({ person, amount: Math.abs(rounded) });
    }
  }

  // Sort for deterministic results: largest amounts first
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  // 3. Greedily match debtors to creditors
  const settlements = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const payment = Math.min(creditors[ci].amount, debtors[di].amount);
    if (payment > 0.01) {
      settlements.push({
        from: debtors[di].person,
        to: creditors[ci].person,
        amount: Math.round(payment * 100) / 100,
      });
    }

    creditors[ci].amount -= payment;
    debtors[di].amount -= payment;

    if (creditors[ci].amount < 0.01) ci++;
    if (debtors[di].amount < 0.01) di++;
  }

  return settlements;
}
