/**
 * Exchange rate management — fetch, cache, and convert
 * Uses frankfurter.app (free, no API key needed) as primary source
 * Falls back to cached/manual rates when offline
 */

import { getSetting, setSetting } from './storage';
import { CURRENCIES } from './constants';

const RATES_KEY = 'exchangeRates';
const RATES_UPDATED_KEY = 'exchangeRatesUpdatedAt';
const MANUAL_OVERRIDES_KEY = 'exchangeRateOverrides';
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

// ─── Default fallback rates (RON-centric, approximate) ──────
const DEFAULT_RATES = {
  RON: 1,
  EUR: 0.2008,
  USD: 0.2180,
  GBP: 0.1720,
};

/**
 * Fetch latest exchange rates from frankfurter.app
 * Returns rates relative to baseCurrency (default RON)
 */
export async function fetchRates(baseCurrency = 'RON') {
  const codes = CURRENCIES.map(c => c.code).filter(c => c !== baseCurrency).join(',');
  const url = `https://api.frankfurter.app/latest?from=${baseCurrency}&to=${codes}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Rate fetch failed: ${res.status}`);

  const data = await res.json();
  // data.rates = { EUR: 0.2008, USD: 0.218, GBP: 0.172 }
  const rates = { [baseCurrency]: 1, ...data.rates };

  // Cache
  await setSetting(RATES_KEY, rates);
  await setSetting(RATES_UPDATED_KEY, new Date().toISOString());

  return rates;
}

/**
 * Get cached rates, merging any manual overrides
 */
export async function getCachedRates() {
  const rates = (await getSetting(RATES_KEY)) || DEFAULT_RATES;
  const overrides = (await getSetting(MANUAL_OVERRIDES_KEY)) || {};
  return { ...rates, ...overrides };
}

/**
 * Get rates — uses cache if fresh, otherwise fetches
 */
export async function getRates(baseCurrency = 'RON') {
  const updatedAt = await getSetting(RATES_UPDATED_KEY);
  const isFresh = updatedAt && (Date.now() - new Date(updatedAt).getTime()) < CACHE_DURATION_MS;

  if (isFresh) {
    return getCachedRates();
  }

  try {
    const rates = await fetchRates(baseCurrency);
    const overrides = (await getSetting(MANUAL_OVERRIDES_KEY)) || {};
    return { ...rates, ...overrides };
  } catch {
    // Offline or error — use cached
    return getCachedRates();
  }
}

/**
 * Get manual override rates
 */
export async function getManualOverrides() {
  return (await getSetting(MANUAL_OVERRIDES_KEY)) || {};
}

/**
 * Set a manual rate override for a specific currency pair
 * @param {string} currency — target currency code (e.g. 'EUR')
 * @param {number} rate — rate from base currency to target (e.g. 0.2008)
 */
export async function setManualOverride(currency, rate) {
  const overrides = await getManualOverrides();
  if (rate === null || rate === undefined) {
    delete overrides[currency];
  } else {
    overrides[currency] = Number(rate);
  }
  await setSetting(MANUAL_OVERRIDES_KEY, overrides);
}

/**
 * Clear all manual overrides
 */
export async function clearOverrides() {
  await setSetting(MANUAL_OVERRIDES_KEY, {});
}

/**
 * Convert amount from one currency to another
 * Rates should be relative to a common base (default: RON)
 * @param {number} amount
 * @param {string} from — source currency code
 * @param {string} to — target currency code
 * @param {Object} rates — rates object from getRates()
 * @returns {number} converted amount (2 decimal places)
 */
export function convertAmount(amount, from, to, rates) {
  if (from === to) return amount;
  if (!rates[from] || !rates[to]) return amount;

  // Convert: amount in 'from' → base → 'to'
  // If rates are "1 BASE = X TARGET":
  //   amount_in_base = amount / rates[from]
  //   amount_in_to   = amount_in_base * rates[to]
  const inBase = amount / rates[from];
  const converted = inBase * rates[to];
  return Math.round(converted * 100) / 100;
}

/**
 * Format a converted amount with both original and converted display
 * e.g. "€50.00 (≈ 249.00 lei)"
 */
export function formatConvertedDisplay(amount, fromCurrency, toCurrency, rates, formatCurrencyFn) {
  if (fromCurrency === toCurrency) return null;
  const converted = convertAmount(amount, fromCurrency, toCurrency, rates);
  return `≈ ${formatCurrencyFn(converted, toCurrency)}`;
}

/**
 * Get the last update timestamp
 */
export async function getRatesUpdatedAt() {
  return getSetting(RATES_UPDATED_KEY);
}
