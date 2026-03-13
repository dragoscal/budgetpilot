/**
 * Smart Features Engine
 * - Auto-recurring detection
 * - Duplicate detection
 * - Category learning
 * - Merchant autocomplete
 * - Budget alerts
 */

import { getAll, getSetting, setSetting } from './storage';
import { MERCHANT_CATEGORY_MAP, KEYWORD_SUBCATEGORY_MAP } from './constants';
import { getCustomCategoriesSync } from './categoryManager';

// ─── MERCHANT NORMALIZATION ──────────────────────────────
// Aggressive normalization for merchant names from bank statements.
// Strips business suffixes, payment prefixes, reference numbers, locations.

export function normalizeMerchantName(name) {
  if (!name) return '';
  let s = name.toLowerCase().trim();

  // 1. Strip business suffixes (Romanian, European, international)
  s = s.replace(/\b(s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?c\.?\s?s\.?|s\.?\s?c\.?|s\.?\s?l\.?|s\.?\s?a\.?\s?u\.?|s\.?\s?p\.?\s?a\.?|s\.?\s?n\.?\s?c\.?|b\.?\s?v\.?|n\.?\s?v\.?|d\.?\s?o\.?\s?o\.?|e\.?\s?v\.?)\b/g, '');
  s = s.replace(/\b(ltd\.?|inc\.?|co\.?|corp\.?|llc|llp|plc|pty|gmbh|mbh|ag|kg|ohg|ug|sarl|sas|eurl|slne|kft|rt|zrt|as|ab|oy|oyj)\b/g, '');
  s = s.replace(/\ba\/s\b/g, '');
  s = s.replace(/\bsp\.?\s?z\.?\s?o\.?\s?o\.?\b/g, '');

  // 2. Strip payment method prefixes from bank statements
  s = s.replace(/\b(pos|plata|transfer|payment|card|debit|direct\s+debit|incasare|tranzactie)\b/g, '');

  // 2b. Strip payment processor prefixes (PAYPAL *, SQ *, GOOGLE *, AMZN*, etc.)
  s = s.replace(/^(paypal|sq|square|google|amzn?|amazon)\s*\*\s*/i, '');
  s = s.replace(/^apple\.com\s*\/?\s*bill\s*/i, 'apple ');

  // 3. Strip transaction IDs and card masks (but KEEP phone numbers — they differentiate subscriptions)
  s = s.replace(/\b(?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{12,}\b/g, ''); // long mixed alphanumeric codes (12+ chars, must have both letters AND digits)
  s = s.replace(/\b\d{12,}\b/g, '');              // very long pure digit numbers (bank account numbers, IBANs)
  s = s.replace(/\*+\d+/g, '');                   // masked cards like *1234

  // 4. Strip common Romanian location/descriptor words
  s = s.replace(/\b(romania|bucuresti|bucharest|cluj|timisoara|iasi|brasov|constanta|sibiu|craiova|oradea|sector\s*\d)\b/g, '');

  // 5. Strip dates and replace punctuation with spaces
  s = s.replace(/\d{1,2}[./-]\d{1,2}[./-]\d{2,4}/g, '');
  s = s.replace(/[./*_-]+/g, ' ');

  // 6. Clean up whitespace
  s = s.replace(/\s+/g, ' ').trim();

  return s;
}

// Bigram (Dice coefficient) similarity between two merchant names.
// Returns a score 0–1 used to decide if two normalized merchant keys should merge.
function merchantSimilarity(a, b) {
  if (!a || !b) return 0;
  const na = a.replace(/[^a-z0-9]/g, '');
  const nb = b.replace(/[^a-z0-9]/g, '');
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  // Short name guard — bigram similarity unreliable for ≤3 chars
  if (na.length <= 3 && nb.length <= 3) return 0;

  // Guard: if both keys have distinct numeric identifiers (phone numbers, account IDs),
  // they represent DIFFERENT subscriptions — cap similarity low to prevent merging.
  // e.g., "orange telefon 0741234567" vs "orange telefon 0731234567" → different subs.
  const numsA = (a.match(/\d{4,}/g) || []).sort().join(',');
  const numsB = (b.match(/\d{4,}/g) || []).sort().join(',');
  if (numsA && numsB && numsA !== numsB) return 0.3;

  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Same first word (brand name) with 3+ chars
  const firstA = a.split(/\s+/)[0];
  const firstB = b.split(/\s+/)[0];
  if (firstA.length >= 3 && firstA === firstB) return 0.8;

  // Bigram similarity
  const bigrams = (s) => {
    const result = new Set();
    for (let i = 0; i < s.length - 1; i++) result.add(s.slice(i, i + 2));
    return result;
  };
  const setA = bigrams(na);
  const setB = bigrams(nb);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const bg of setA) if (setB.has(bg)) intersection++;
  return (2.0 * intersection) / (setA.size + setB.size);
}

// Merge similar merchant groups into clusters.
// Input:  { normalizedKey: [tx, tx, ...], ... }
// Output: { canonicalKey: [tx, tx, ...], ... }
function clusterMerchantGroups(groups) {
  const keys = Object.keys(groups);
  const merged = {};

  for (const key of keys) {
    let bestMatch = null;
    let bestScore = 0;

    for (const canonical of Object.keys(merged)) {
      const score = merchantSimilarity(key, canonical);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = canonical;
      }
    }

    if (bestMatch && bestScore >= 0.6) {
      merged[bestMatch].push(...groups[key]);
    } else {
      merged[key] = [...groups[key]];
    }
  }

  return merged;
}

// Sub-group transactions by similar amounts (±tolerance).
// Handles e.g. 3 phone lines on same carrier at different prices.
// Returns array of arrays, each with transactions of similar amount.
function groupByAmountSimilarity(txns, tolerance = 0.20) {
  if (txns.length === 0) return [];
  const sorted = [...txns].sort((a, b) => a.amount - b.amount);
  const groups = [];
  let currentGroup = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const groupAvg = currentGroup.reduce((s, t) => s + t.amount, 0) / currentGroup.length;
    if (groupAvg > 0 && Math.abs(sorted[i].amount - groupAvg) / groupAvg <= tolerance) {
      currentGroup.push(sorted[i]);
    } else {
      groups.push(currentGroup);
      currentGroup = [sorted[i]];
    }
  }
  groups.push(currentGroup);
  return groups;
}

// Split an amount sub-group into billing-day "slots" when there are
// multiple transactions per month at the same price from the same merchant.
// E.g., 2× ~25 RON Orange charges per month → slot 0 (day ~5) and slot 1 (day ~9).
// Returns array of arrays. If only 1 transaction per month, returns [txns] unchanged.
function splitByBillingSlot(txns) {
  // Group by month
  const byMonth = {};
  for (const tx of txns) {
    const month = tx.date?.substring(0, 7);
    if (!month) continue;
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(tx);
  }

  // Sort each month by day-of-month
  const months = Object.keys(byMonth).sort();
  for (const m of months) {
    byMonth[m].sort((a, b) => {
      const dayA = parseInt(a.date?.substring(8, 10) || '1');
      const dayB = parseInt(b.date?.substring(8, 10) || '1');
      return dayA - dayB;
    });
  }

  // Find mode (most common count of transactions per month)
  const counts = months.map(m => byMonth[m].length);
  const countFreq = {};
  counts.forEach(c => { countFreq[c] = (countFreq[c] || 0) + 1; });
  const mode = parseInt(Object.entries(countFreq).sort((a, b) => b[1] - a[1])[0][0]);
  const modeCount = countFreq[mode] || 0;

  if (mode <= 1 || modeCount < 2) return [txns]; // Need 2+ months with same count to be confident

  // Build slot arrays: 1st tx of each month → slot 0, 2nd → slot 1, etc.
  const slots = Array.from({ length: mode }, () => []);
  for (const m of months) {
    const monthTxs = byMonth[m];
    for (let i = 0; i < Math.min(monthTxs.length, mode); i++) {
      slots[i].push(monthTxs[i]);
    }
  }

  return slots;
}

// ─── PERIOD HELPERS ──────────────────────────────────────

function isConsecutiveMonth(a, b) {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  if (y1 === y2) return m2 - m1 === 1;
  if (y2 - y1 === 1) return m1 === 12 && m2 === 1;
  return false;
}

function isConsecutiveQuarter(a, b) {
  const [y1, q1] = a.split('-Q').map(Number);
  const [y2, q2] = b.split('-Q').map(Number);
  if (y1 === y2) return q2 - q1 === 1;
  if (y2 - y1 === 1) return q1 === 4 && q2 === 1;
  return false;
}

function isConsecutiveYear(a, b) {
  return Number(b) - Number(a) === 1;
}

function isApproximatelyWeekly(dateA, dateB) {
  const diff = Math.abs(new Date(dateB) - new Date(dateA)) / 86400000;
  return diff >= 5 && diff <= 9;
}

function getPeriodKey(dateStr, frequency) {
  const [y, m] = dateStr.split('-').map(Number);
  switch (frequency) {
    case 'quarterly': return `${y}-Q${Math.ceil(m / 3)}`;
    case 'annual': return `${y}`;
    default: return `${y}-${String(m).padStart(2, '0')}`;
  }
}

function getConsecutiveChecker(frequency) {
  switch (frequency) {
    case 'quarterly': return isConsecutiveQuarter;
    case 'annual': return isConsecutiveYear;
    default: return isConsecutiveMonth;
  }
}

// ─── GENERIC SUGGESTION BUILDER ──────────────────────────

function buildSuggestion(slotTxns, normalizedKey, frequency, maxRecencyDays) {
  // Group by period
  const byPeriod = {};
  for (const tx of slotTxns) {
    if (!tx.date) continue;
    const period = getPeriodKey(tx.date, frequency);
    if (!byPeriod[period]) byPeriod[period] = [];
    byPeriod[period].push(tx);
  }

  const periods = Object.keys(byPeriod).sort();
  if (periods.length < 2) return null;

  // For quarterly/annual: skip if too many transactions per period (likely a more frequent pattern)
  if (frequency === 'quarterly' || frequency === 'annual') {
    const avgPerPeriod = slotTxns.length / periods.length;
    if (avgPerPeriod > 1.5) return null;
  }

  // Check consecutive periods
  const isConsecutive = getConsecutiveChecker(frequency);
  let consecutiveCount = 1;
  let maxConsecutive = 1;
  for (let i = 1; i < periods.length; i++) {
    if (isConsecutive(periods[i - 1], periods[i])) {
      consecutiveCount++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
    } else {
      consecutiveCount = 1;
    }
  }

  const minConsecutive = frequency === 'monthly' ? 2 : frequency === 'weekly' ? 4 : 2;
  if (maxConsecutive < minConsecutive) return null;

  // Amount stats
  const amounts = slotTxns.map(t => t.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const amountConsistent = avgAmount > 0
    ? amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.20)
    : true;

  // Billing day (most common day of month)
  const days = slotTxns.map(t => parseInt(t.date?.substring(8, 10) || '1'));
  const dayFreq = {};
  days.forEach(d => { dayFreq[d] = (dayFreq[d] || 0) + 1; });
  const billingDay = parseInt(Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0][0]);

  // Billing month for annual/quarterly
  let billingMonth = 1;
  if (frequency === 'annual' || frequency === 'quarterly') {
    const monthFreq = {};
    slotTxns.forEach(tx => {
      const m = parseInt(tx.date?.substring(5, 7) || '1');
      monthFreq[m] = (monthFreq[m] || 0) + 1;
    });
    billingMonth = parseInt(Object.entries(monthFreq).sort((a, b) => b[1] - a[1])[0][0]);
  }

  // Display merchant (most common original name)
  const merchantFreq = {};
  for (const tx of slotTxns) {
    merchantFreq[tx.merchant] = (merchantFreq[tx.merchant] || 0) + 1;
  }
  const displayMerchant = Object.entries(merchantFreq).sort((a, b) => b[1] - a[1])[0][0];

  // Best category (most common)
  const catFreq = {};
  for (const tx of slotTxns) {
    if (tx.category) catFreq[tx.category] = (catFreq[tx.category] || 0) + 1;
  }
  const bestCategory = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || slotTxns[0].category;

  // Recency check
  const lastDate = [...slotTxns].sort((a, b) => b.date?.localeCompare(a.date))[0].date;
  const daysSinceLast = (Date.now() - new Date(lastDate).getTime()) / 86400000;
  if (daysSinceLast > maxRecencyDays) return null;

  // Confidence scoring
  const base = 0.4;
  const periodBonus = Math.min(maxConsecutive * 0.12, 0.36);
  const amountBonus = amountConsistent ? 0.15 : 0;
  const recencyBonus = daysSinceLast < (maxRecencyDays / 2) ? 0.1 : 0;

  return {
    merchant: displayMerchant,
    amount: Math.round(avgAmount * 100) / 100,
    currency: slotTxns[0].currency || 'RON',
    category: bestCategory,
    consecutiveMonths: maxConsecutive,
    billingDay,
    billingMonth,
    frequency,
    confidence: Math.min(0.95, base + periodBonus + amountBonus + recencyBonus),
    lastDate,
    transactionCount: slotTxns.length,
  };
}

// ─── WEEKLY PATTERN DETECTOR ─────────────────────────────

function detectWeeklyPattern(txns, normalizedKey) {
  if (txns.length < 4) return null;

  const sorted = [...txns].sort((a, b) => a.date?.localeCompare(b.date));

  // Find longest chain of ~7-day gaps
  let bestChain = [sorted[0]];
  let currentChain = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    if (isApproximatelyWeekly(sorted[i - 1].date, sorted[i].date)) {
      currentChain.push(sorted[i]);
      if (currentChain.length > bestChain.length) bestChain = [...currentChain];
    } else {
      currentChain = [sorted[i]];
    }
  }

  if (bestChain.length < 4) return null;

  const amounts = bestChain.map(t => t.amount);
  const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  const amountConsistent = avgAmount > 0
    ? amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.20)
    : true;
  if (!amountConsistent) return null;

  // Display merchant
  const merchantFreq = {};
  for (const tx of bestChain) { merchantFreq[tx.merchant] = (merchantFreq[tx.merchant] || 0) + 1; }
  const displayMerchant = Object.entries(merchantFreq).sort((a, b) => b[1] - a[1])[0][0];

  // Best category
  const catFreq = {};
  for (const tx of bestChain) { if (tx.category) catFreq[tx.category] = (catFreq[tx.category] || 0) + 1; }
  const bestCategory = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || bestChain[0].category;

  const lastDate = bestChain[bestChain.length - 1].date;
  const daysSinceLast = (Date.now() - new Date(lastDate).getTime()) / 86400000;
  if (daysSinceLast > 30) return null;

  // Billing day = most common day of month (for display consistency)
  const days = bestChain.map(t => parseInt(t.date?.substring(8, 10) || '1'));
  const dayFreq = {};
  days.forEach(d => { dayFreq[d] = (dayFreq[d] || 0) + 1; });
  const billingDay = parseInt(Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0][0]);

  const base = 0.4;
  const weekBonus = Math.min(bestChain.length * 0.08, 0.36);
  const recencyBonus = daysSinceLast < 15 ? 0.1 : 0;

  return {
    merchant: displayMerchant,
    amount: Math.round(avgAmount * 100) / 100,
    currency: bestChain[0].currency || 'RON',
    category: bestCategory,
    consecutiveMonths: bestChain.length,
    billingDay,
    billingMonth: 1,
    frequency: 'weekly',
    confidence: Math.min(0.95, base + weekBonus + 0.15 + recencyBonus),
    lastDate,
    transactionCount: bestChain.length,
  };
}

// ─── SUGGESTION DEDUPLICATION ────────────────────────────

function deduplicateSuggestions(suggestions) {
  if (suggestions.length <= 1) return suggestions;

  const sorted = [...suggestions].sort((a, b) => b.confidence - a.confidence);
  const kept = [];
  const removed = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (removed.has(i)) continue;
    const a = sorted[i];

    for (let j = i + 1; j < sorted.length; j++) {
      if (removed.has(j)) continue;
      const b = sorted[j];

      const normA = normalizeMerchantName(a.merchant);
      const normB = normalizeMerchantName(b.merchant);
      if (merchantSimilarity(normA, normB) < 0.6) continue;

      // Check amount similarity (applies to both same and cross-frequency)
      const avgAmt = (a.amount + b.amount) / 2;
      if (avgAmt > 0 && Math.abs(a.amount - b.amount) / avgAmt > 0.25) continue;

      if (a.frequency === b.frequency) {
        // Same frequency: also check billing day proximity
        const dayDiff = Math.abs(a.billingDay - b.billingDay);
        if (dayDiff > 3 && dayDiff < 28) continue;
      }
      // Cross-frequency with similar amount from same merchant = same underlying pattern.
      // Keep the higher-confidence one (already sorted).

      removed.add(j);
    }

    kept.push(a);
  }

  return kept;
}

// ─── VARIABLE RECURRING DETECTION ────────────────────────

function detectVariableRecurring(clustered, existingRecurring, standardSuggestions) {
  const variableSuggestions = [];

  // Merchants already in standard suggestions — skip at cluster level
  // (prevents duplicate fixed + variable suggestion for same merchant)
  const standardMerchants = new Set(
    standardSuggestions.map(s => normalizeMerchantName(s.merchant))
  );

  // Per-suggestion tracking check (same logic as in detectRecurringPatterns)
  function isVariableTracked(suggestion) {
    for (const r of existingRecurring) {
      if (r.status === 'cancelled' || r.deletedAt) continue;
      const rNorm = normalizeMerchantName(r.merchant || r.name);
      if (merchantSimilarity(normalizeMerchantName(suggestion.merchant), rNorm) < 0.6) continue;
      // For variable: just check merchant + billing day (amount varies by design)
      const rDay = Number(r.billingDay) || 1;
      const sDay = Number(suggestion.billingDay) || 1;
      const dayDiff = Math.abs(rDay - sDay);
      if (dayDiff <= 3 || dayDiff >= 28) return true;
    }
    return false;
  }

  for (const [normalizedKey, txns] of Object.entries(clustered)) {
    // Only skip at cluster level for standard suggestions (not existing recurring)
    let hasStandard = false;
    for (const sm of standardMerchants) {
      if (merchantSimilarity(normalizedKey, sm) >= 0.6) { hasStandard = true; break; }
    }
    if (hasStandard) continue;
    if (txns.length < 3) continue;

    // Split by currency
    const byCurrency = {};
    for (const tx of txns) {
      const c = tx.currency || 'RON';
      if (!byCurrency[c]) byCurrency[c] = [];
      byCurrency[c].push(tx);
    }

    for (const [currCode, currTxns] of Object.entries(byCurrency)) {
      if (currTxns.length < 3) continue;

      // NO amount sub-grouping — check raw amount spread
      const amounts = currTxns.map(t => t.amount);
      const minAmt = Math.min(...amounts);
      const maxAmt = Math.max(...amounts);
      const avgAmt = amounts.reduce((a, b) => a + b, 0) / amounts.length;

      // Only flag as variable if spread > 20% (fixed detection would have missed it)
      if (avgAmt <= 0 || (maxAmt - minAmt) / avgAmt <= 0.20) continue;

      // Group by month
      const byMonth = {};
      for (const tx of currTxns) {
        const month = tx.date?.substring(0, 7);
        if (!month) continue;
        if (!byMonth[month]) byMonth[month] = [];
        byMonth[month].push(tx);
      }

      const months = Object.keys(byMonth).sort();
      if (months.length < 3) continue;

      // Check consecutive months (stricter: 3+ required)
      let consecutiveCount = 1;
      let maxConsecutive = 1;
      for (let i = 1; i < months.length; i++) {
        if (isConsecutiveMonth(months[i - 1], months[i])) {
          consecutiveCount++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        } else {
          consecutiveCount = 1;
        }
      }
      if (maxConsecutive < 3) continue;

      // Recency
      const lastDate = [...currTxns].sort((a, b) => b.date?.localeCompare(a.date))[0].date;
      const daysSinceLast = (Date.now() - new Date(lastDate).getTime()) / 86400000;
      if (daysSinceLast > 90) continue;

      // Display merchant
      const merchantFreq = {};
      for (const tx of currTxns) { merchantFreq[tx.merchant] = (merchantFreq[tx.merchant] || 0) + 1; }
      const displayMerchant = Object.entries(merchantFreq).sort((a, b) => b[1] - a[1])[0][0];

      // Best category
      const catFreq = {};
      for (const tx of currTxns) { if (tx.category) catFreq[tx.category] = (catFreq[tx.category] || 0) + 1; }
      const bestCategory = Object.entries(catFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || currTxns[0].category;

      // Billing day (most common)
      const days = currTxns.map(t => parseInt(t.date?.substring(8, 10) || '1'));
      const dayFreq = {};
      days.forEach(d => { dayFreq[d] = (dayFreq[d] || 0) + 1; });
      const billingDay = parseInt(Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0][0]);

      const base = 0.35;
      const monthBonus = Math.min(maxConsecutive * 0.1, 0.3);
      const recencyBonus = daysSinceLast < 45 ? 0.1 : 0;

      const varSuggestion = {
        merchant: displayMerchant,
        amount: Math.round(avgAmt * 100) / 100,
        amountMin: Math.round(minAmt * 100) / 100,
        amountMax: Math.round(maxAmt * 100) / 100,
        currency: currCode,
        category: bestCategory,
        consecutiveMonths: maxConsecutive,
        billingDay,
        billingMonth: 1,
        frequency: 'monthly',
        isVariable: true,
        confidence: Math.min(0.85, base + monthBonus + recencyBonus),
        lastDate,
        transactionCount: currTxns.length,
      };
      if (!isVariableTracked(varSuggestion)) variableSuggestions.push(varSuggestion);
    }
  }

  return variableSuggestions;
}

// ─── AUTO-RECURRING DETECTION ─────────────────────────────
// Multi-frequency detection: monthly, quarterly, annual, weekly + variable

export async function detectRecurringPatterns(userId, transactionsOverride, recurringOverride) {
  const filter = userId ? { userId } : {};
  const transactions = transactionsOverride || await getAll('transactions', filter);
  if (transactions.length < 2) return [];

  // Phase 1: Group by aggressively normalized merchant name
  const byMerchant = {};
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.merchant || !tx.date) continue;
    if (tx.amount <= 0 || tx.deletedAt) continue;
    const key = normalizeMerchantName(tx.merchant);
    if (!key) continue;
    if (!byMerchant[key]) byMerchant[key] = [];
    byMerchant[key].push(tx);
  }

  // Phase 2: Fuzzy-cluster similar merchant groups
  const clustered = clusterMerchantGroups(byMerchant);

  const suggestions = [];
  const existingRecurring = recurringOverride || await getAll('recurring', filter);
  // Per-suggestion tracking check: ensures only the EXACT subscription
  // (same merchant + similar amount + similar billing day) is excluded,
  // NOT the entire merchant cluster.
  function isSuggestionTracked(suggestion) {
    for (const r of existingRecurring) {
      if (r.status === 'cancelled' || r.deletedAt) continue;
      const rNorm = normalizeMerchantName(r.merchant || r.name);
      if (merchantSimilarity(normalizeMerchantName(suggestion.merchant), rNorm) < 0.6) continue;
      // Merchant matches — also check amount + billing day
      const rAmt = Number(r.amount) || 0;
      const sAmt = Number(suggestion.amount) || 0;
      const avgAmt = (rAmt + sAmt) / 2;
      const amtClose = avgAmt <= 0 || Math.abs(rAmt - sAmt) / avgAmt <= 0.30;
      const rDay = Number(r.billingDay) || 1;
      const sDay = Number(suggestion.billingDay) || 1;
      const dayDiff = Math.abs(rDay - sDay);
      const dayClose = dayDiff <= 3 || dayDiff >= 28; // handles month-wrap (e.g., day 1 vs 30)
      if (amtClose && dayClose) return true;
    }
    return false;
  }

  for (const [normalizedKey, txns] of Object.entries(clustered)) {
    if (txns.length < 2) continue;

    // Phase 2.5: Split by currency
    const byCurrency = {};
    for (const tx of txns) {
      const c = tx.currency || 'RON';
      if (!byCurrency[c]) byCurrency[c] = [];
      byCurrency[c].push(tx);
    }

    for (const [currencyCode, currencyTxns] of Object.entries(byCurrency)) {
      if (currencyTxns.length < 2) continue;

      // Phase 3: Sub-group by similar amounts
      const amountSubGroups = groupByAmountSimilarity(currencyTxns, 0.20);

      for (const subTxns of amountSubGroups) {
        if (subTxns.length < 2) continue;

        // === Monthly detection (with billing-day slot splitting) ===
        const billingSlots = splitByBillingSlot(subTxns);
        for (const slotTxns of billingSlots) {
          if (slotTxns.length < 2) continue;
          const s = buildSuggestion(slotTxns, normalizedKey, 'monthly', 90);
          if (s && !isSuggestionTracked(s)) suggestions.push(s);
        }

        // === Quarterly detection ===
        if (subTxns.length >= 2) {
          const s = buildSuggestion(subTxns, normalizedKey, 'quarterly', 120);
          if (s && !isSuggestionTracked(s)) suggestions.push(s);
        }

        // === Annual detection ===
        if (subTxns.length >= 2) {
          const s = buildSuggestion(subTxns, normalizedKey, 'annual', 400);
          if (s && !isSuggestionTracked(s)) suggestions.push(s);
        }

        // === Weekly detection ===
        if (subTxns.length >= 4) {
          const s = detectWeeklyPattern(subTxns, normalizedKey);
          if (s && !isSuggestionTracked(s)) suggestions.push(s);
        }
      }
    }
  }

  // Variable recurring detection (separate pass — relaxed amount tolerance)
  const variableSuggestions = detectVariableRecurring(clustered, existingRecurring, suggestions);
  suggestions.push(...variableSuggestions);

  // De-duplicate and sort by confidence
  return deduplicateSuggestions(suggestions).sort((a, b) => b.confidence - a.confidence);
}


// ─── DUPLICATE DETECTION ──────────────────────────────────
// Check if a new transaction looks like an existing one

export async function checkDuplicate(newTx, userId) {
  const filter = userId ? { userId } : {};
  const transactions = await getAll('transactions', filter);

  // Pre-filter: only check transactions within ±3 days (O(n) scan but skips most comparisons)
  const txDate = new Date(newTx.date);
  const windowMs = 3 * 24 * 60 * 60 * 1000;
  const nearby = transactions.filter((t) => {
    if (t.id === newTx.id) return false;
    const d = new Date(t.date);
    return Math.abs(d - txDate) <= windowMs;
  });

  const dupes = [];
  for (const existing of nearby) {
    const sameDate = existing.date === newTx.date;
    const sameAmount = Math.abs(existing.amount - newTx.amount) < 0.01;
    const sameMerchant = existing.merchant?.toLowerCase().trim() === newTx.merchant?.toLowerCase().trim();

    // Exact duplicate: same date + amount + merchant
    if (sameDate && sameAmount && sameMerchant) {
      dupes.push({ transaction: existing, confidence: 0.95, reason: 'Same merchant, amount, and date' });
      continue;
    }

    // Likely duplicate: same date + amount
    if (sameDate && sameAmount) {
      dupes.push({ transaction: existing, confidence: 0.7, reason: 'Same amount and date' });
      continue;
    }

    // Possible duplicate: same merchant + similar amount within 1 day
    if (sameMerchant && sameAmount) {
      const dayDiff = Math.abs(new Date(existing.date) - new Date(newTx.date)) / (1000 * 60 * 60 * 24);
      if (dayDiff <= 1) {
        dupes.push({ transaction: existing, confidence: 0.6, reason: 'Same merchant and amount within 1 day' });
      }
    }
  }

  return dupes.sort((a, b) => b.confidence - a.confidence);
}


// ─── TRANSFER PAIR DETECTION ──────────────────────────────
// Detect if a bank statement transfer already has a matching pair in existing transactions

export async function checkTransferPair(newTx, userId) {
  if (newTx.type !== 'transfer' && newTx.category !== 'transfer') return null;
  const filter = userId ? { userId } : {};
  const transactions = await getAll('transactions', filter);

  const txDate = new Date(newTx.date);
  const windowMs = 3 * 24 * 60 * 60 * 1000; // ±3 days

  for (const existing of transactions) {
    if (existing.id === newTx.id) continue;
    const sameAmount = Math.abs(existing.amount - newTx.amount) < 0.01;
    if (!sameAmount) continue;
    const d = new Date(existing.date);
    if (Math.abs(d - txDate) > windowMs) continue;
    // Same amount, close date, and existing is also a transfer
    if (existing.type === 'transfer' || existing.category === 'transfer') {
      return { transaction: existing, reason: 'transfer_pair' };
    }
  }
  return null;
}


// ─── BATCH DUPLICATE CHECK (Pre-scan) ────────────────────
// Loads existing transactions ONCE, then checks all incoming transactions against them.
// Much faster than calling checkDuplicate() per-item (avoids N+1 DB reads).

export async function batchCheckDuplicates(newTransactions, userId) {
  const filter = userId ? { userId } : {};
  const existing = await getAll('transactions', filter);

  // Build lookup indexes for fast matching
  const byDateAmount = {};   // 'date|amount' → [tx, ...]
  const byMerchantAmount = {}; // 'merchant|amount' → [tx, ...]

  for (const tx of existing) {
    if (tx.deletedAt) continue;
    const da = `${tx.date}|${Math.round(tx.amount * 100)}`;
    if (!byDateAmount[da]) byDateAmount[da] = [];
    byDateAmount[da].push(tx);

    if (tx.merchant) {
      const ma = `${tx.merchant.toLowerCase().trim()}|${Math.round(tx.amount * 100)}`;
      if (!byMerchantAmount[ma]) byMerchantAmount[ma] = [];
      byMerchantAmount[ma].push(tx);
    }
  }

  const results = [];

  for (const newTx of newTransactions) {
    const amtKey = Math.round(newTx.amount * 100);
    const daKey = `${newTx.date}|${amtKey}`;
    const merchantNorm = newTx.merchant?.toLowerCase().trim() || '';

    let isDuplicate = false;
    let isTransferPair = false;
    let confidence = 0;
    let reason = '';

    // 1. Exact match: same date + amount + merchant → 0.95 confidence
    const dateAmountMatches = byDateAmount[daKey] || [];
    for (const ex of dateAmountMatches) {
      const exMerchant = ex.merchant?.toLowerCase().trim() || '';
      if (merchantNorm && exMerchant === merchantNorm) {
        isDuplicate = true;
        confidence = 0.95;
        reason = 'Same merchant, amount, and date';
        break;
      }
    }

    // 2. Same date + amount WITHOUT merchant match
    // Only flag if both entries lack a merchant (generic/unidentified transactions)
    // Different merchants on the same day for the same amount = different transactions, NOT duplicates
    if (!isDuplicate && dateAmountMatches.length > 0) {
      const hasMatchWithNoMerchant = dateAmountMatches.some(ex => !ex.merchant?.trim());
      if (!merchantNorm && hasMatchWithNoMerchant) {
        isDuplicate = true;
        confidence = 0.7;
        reason = 'Same amount and date (no merchant)';
      }
      // Otherwise: different merchants = not a duplicate
    }

    // 3. Same merchant + amount within ±1 day → 0.85 confidence
    if (!isDuplicate && merchantNorm) {
      const maKey = `${merchantNorm}|${amtKey}`;
      const merchantMatches = byMerchantAmount[maKey] || [];
      for (const ex of merchantMatches) {
        const dayDiff = Math.abs(new Date(ex.date) - new Date(newTx.date)) / (1000 * 60 * 60 * 24);
        if (dayDiff <= 1) {
          isDuplicate = true;
          confidence = 0.85;
          reason = 'Same merchant and amount within 1 day';
          break;
        }
      }
    }

    // 4. Transfer pair check
    if (!isDuplicate && (newTx.type === 'transfer' || newTx.category === 'transfer')) {
      const txDate = new Date(newTx.date);
      const windowMs = 3 * 24 * 60 * 60 * 1000;
      for (const ex of existing) {
        if (ex.deletedAt) continue;
        if (Math.abs(ex.amount - newTx.amount) >= 0.01) continue;
        if (Math.abs(new Date(ex.date) - txDate) > windowMs) continue;
        if (ex.type === 'transfer' || ex.category === 'transfer') {
          isTransferPair = true;
          reason = 'Transfer pair already exists';
          break;
        }
      }
    }

    results.push({ transaction: newTx, isDuplicate, isTransferPair, confidence, reason });
  }

  return results;
}


// ─── CATEGORY LEARNING ────────────────────────────────────
// Learn from user's manual category assignments to improve auto-categorization

const LEARNED_CATEGORIES_KEY = 'learnedCategories';

export async function learnCategory(merchant, category, subcategory = null) {
  if (!merchant || !category) return;
  const key = merchant.toLowerCase().trim();
  const learned = await getLearnedCategories();

  if (!learned[key]) {
    learned[key] = {};
  }
  // Store as object with count and optional subcategory
  const existing = learned[key][category];
  if (typeof existing === 'object' && existing !== null && !Array.isArray(existing)) {
    existing.count = (existing.count || 0) + 1;
    if (subcategory) existing.subcategory = subcategory;
  } else {
    // Migrate from old number format
    learned[key][category] = {
      count: (typeof existing === 'number' ? existing : 0) + 1,
      subcategory: subcategory || null,
    };
  }

  await setSetting(LEARNED_CATEGORIES_KEY, learned);
}

export async function getLearnedCategories() {
  return (await getSetting(LEARNED_CATEGORIES_KEY)) || {};
}

export async function removeLearnedCategory(merchant) {
  if (!merchant) return;
  const key = merchant.toLowerCase().trim();
  const learned = await getLearnedCategories();
  delete learned[key];
  await setSetting(LEARNED_CATEGORIES_KEY, learned);
}

export async function getAllLearnedCategories() {
  const learned = await getLearnedCategories();
  const result = [];
  for (const [merchant, cats] of Object.entries(learned)) {
    const entries = Object.entries(cats);
    if (entries.length === 0) continue;
    // Sort by count descending, pick top
    entries.sort((a, b) => {
      const countA = typeof a[1] === 'object' ? (a[1].count || 0) : (typeof a[1] === 'number' ? a[1] : 0);
      const countB = typeof b[1] === 'object' ? (b[1].count || 0) : (typeof b[1] === 'number' ? b[1] : 0);
      return countB - countA;
    });
    const topCategory = entries[0][0];
    const topEntry = entries[0][1];
    const count = typeof topEntry === 'object' ? (topEntry.count || 0) : (typeof topEntry === 'number' ? topEntry : 0);
    result.push({ merchant, category: topCategory, count });
  }
  return result.sort((a, b) => a.merchant.localeCompare(b.merchant));
}

export async function inferCategorySmart(merchant) {
  if (!merchant) return { category: 'other', subcategory: null };
  const lower = merchant.toLowerCase().trim();

  // Helper to extract count from learned entry (supports old number format and new object format)
  const getCount = (entry) => {
    if (typeof entry === 'number') return entry;
    if (typeof entry === 'object' && entry !== null) return entry.count || 0;
    return 0;
  };
  const getSubcat = (entry) => {
    if (typeof entry === 'object' && entry !== null) return entry.subcategory || null;
    return null;
  };

  // 1. Check user-learned categories FIRST (exact match — threshold 1)
  const learned = await getLearnedCategories();
  if (learned[lower]) {
    const entries = Object.entries(learned[lower]);
    entries.sort((a, b) => getCount(b[1]) - getCount(a[1]));
    if (getCount(entries[0][1]) >= 1) {
      return { category: entries[0][0], subcategory: getSubcat(entries[0][1]) };
    }
  }

  // 2. Partial match on learned categories (threshold >= 2)
  for (const [key, cats] of Object.entries(learned)) {
    if (lower.includes(key) || key.includes(lower)) {
      const entries = Object.entries(cats);
      entries.sort((a, b) => getCount(b[1]) - getCount(a[1]));
      if (getCount(entries[0][1]) >= 2) {
        return { category: entries[0][0], subcategory: getSubcat(entries[0][1]) };
      }
    }
  }

  // 2.5 Check custom category keywords (user-defined)
  const customCats = getCustomCategoriesSync();
  for (const cat of customCats) {
    if (!cat.keywords?.length) continue;
    for (const kw of cat.keywords) {
      if (kw && lower.includes(kw.toLowerCase())) {
        // Check subcategories for a more specific match
        let subcat = null;
        if (cat.subcategories?.length) {
          for (const sub of cat.subcategories) {
            if (sub.name && lower.includes(sub.name.toLowerCase())) {
              subcat = sub.id;
              break;
            }
          }
        }
        return { category: cat.id, subcategory: subcat };
      }
    }
  }

  // 3. Check hardcoded keyword map (with subcategory support)
  for (const [key, cat] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (lower.includes(key)) {
      const subcat = KEYWORD_SUBCATEGORY_MAP[key] || null;
      return { category: cat, subcategory: subcat };
    }
  }

  return { category: 'other', subcategory: null };
}


// ─── MERCHANT AUTOCOMPLETE ────────────────────────────────
// Suggest merchants based on history + learned categories

export async function getMerchantSuggestions(query, userId) {
  if (!query || query.length < 1) return [];
  const lower = query.toLowerCase().trim();

  const filter = userId ? { userId } : {};
  const transactions = await getAll('transactions', filter);

  // Build merchant frequency map
  const merchantMap = {};
  for (const tx of transactions) {
    if (!tx.merchant) continue;
    const key = tx.merchant.toLowerCase().trim();
    if (!merchantMap[key]) {
      merchantMap[key] = {
        merchant: tx.merchant,
        category: tx.category,
        currency: tx.currency,
        count: 0,
        lastAmount: tx.amount,
        lastDate: tx.date,
      };
    }
    merchantMap[key].count++;
    if (tx.date > merchantMap[key].lastDate) {
      merchantMap[key].lastDate = tx.date;
      merchantMap[key].lastAmount = tx.amount;
    }
  }

  // Filter by query
  const matches = Object.values(merchantMap)
    .filter(m => m.merchant.toLowerCase().includes(lower))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  return matches;
}


// ─── BUDGET ALERTS ────────────────────────────────────────
// Check budget status and return alerts

export async function checkBudgetAlerts(monthTransactions, userId) {
  const filter = userId ? { userId } : {};
  const budgets = await getAll('budgets', filter);
  if (!budgets.length) return [];

  // Sum spending by category
  const spending = {};
  for (const tx of monthTransactions) {
    if (tx.type !== 'expense') continue;
    spending[tx.category] = (spending[tx.category] || 0) + tx.amount;
  }

  const alerts = [];
  for (const budget of budgets) {
    const spent = spending[budget.category] || 0;
    const pct = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;

    if (pct >= 100) {
      alerts.push({
        category: budget.category,
        type: 'over',
        percent: Math.round(pct),
        spent,
        budget: budget.amount,
        message: `${budget.category} budget exceeded! ${Math.round(pct)}% used.`,
      });
    } else if (pct >= 80) {
      alerts.push({
        category: budget.category,
        type: 'warning',
        percent: Math.round(pct),
        spent,
        budget: budget.amount,
        message: `${budget.category} budget at ${Math.round(pct)}% — be careful.`,
      });
    }

    // Pace-based alert: project spending to end of month
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (daysElapsed > 5 && spent > 0 && spent < budget.amount && budget.amount > 0) {
      const dailyPace = spent / daysElapsed;
      const projected = dailyPace * daysInMonth;
      if (projected > budget.amount) {
        const dayOfExceed = Math.min(daysInMonth, Math.ceil(budget.amount / dailyPace));
        alerts.push({
          category: budget.category,
          type: 'pace',
          percent: Math.round((projected / budget.amount) * 100),
          spent,
          budget: budget.amount,
          message: `At current pace, you'll exceed ${budget.category} by the ${dayOfExceed}th`,
        });
      }
    }
  }

  return alerts.sort((a, b) => b.percent - a.percent);
}


// ─── TRANSACTION SPLITTING ────────────────────────────────
// Split one transaction into multiple categories

export function splitTransaction(original, splits) {
  // splits = [{ category, amount, description }]
  return splits.map((split, i) => ({
    ...original,
    id: `${original.id}_split_${i}`,
    category: split.category,
    amount: split.amount,
    description: split.description || `Split from ${original.merchant}`,
    splitFrom: original.id,
    createdAt: new Date().toISOString(),
  }));
}


// ─── TRANSACTION AUDIT ──────────────────────────────────
// Scan all transactions for potential issues: duplicates, category suggestions, etc.

export async function auditTransactions(userId) {
  const filter = userId ? { userId } : {};
  const transactions = await getAll('transactions', filter);
  if (transactions.length < 2) return { duplicates: [], categorySuggestions: [], totalScanned: transactions.length };

  const learned = await getLearnedCategories();
  const duplicates = [];
  const categorySuggestions = [];

  // Build index by date+amount for fast duplicate finding
  const byDateAmount = {};
  for (const tx of transactions) {
    if (tx.deletedAt) continue;
    const key = `${tx.date}|${Math.round(tx.amount * 100)}`;
    if (!byDateAmount[key]) byDateAmount[key] = [];
    byDateAmount[key].push(tx);
  }

  // Find duplicate groups (same date + amount + similar merchant)
  const seenDupeGroups = new Set();
  for (const [key, group] of Object.entries(byDateAmount)) {
    if (group.length < 2) continue;
    // Check for merchant-based duplicates within the group
    const merchantGroups = {};
    for (const tx of group) {
      const m = (tx.merchant || '').toLowerCase().trim() || '_none_';
      if (!merchantGroups[m]) merchantGroups[m] = [];
      merchantGroups[m].push(tx);
    }
    for (const [merchant, txns] of Object.entries(merchantGroups)) {
      if (txns.length < 2) continue;
      const groupId = txns.map(t => t.id).sort().join('|');
      if (seenDupeGroups.has(groupId)) continue;
      seenDupeGroups.add(groupId);
      duplicates.push({
        reason: merchant === '_none_' ? 'Same date and amount' : `Same merchant "${txns[0].merchant}", date, and amount`,
        confidence: merchant === '_none_' ? 0.6 : 0.9,
        transactions: txns.map(t => ({
          id: t.id, merchant: t.merchant, amount: t.amount,
          currency: t.currency, date: t.date, category: t.category, source: t.source,
        })),
      });
    }
  }

  // Category suggestions based on learned patterns
  for (const tx of transactions) {
    if (tx.deletedAt || !tx.merchant) continue;
    const merchantLower = tx.merchant.toLowerCase().trim();
    if (!learned[merchantLower]) continue;
    const entries = Object.entries(learned[merchantLower]);
    if (entries.length === 0) continue;

    // Helper to extract count from learned entry
    const getCount = (entry) => {
      if (typeof entry === 'number') return entry;
      if (typeof entry === 'object' && entry !== null) return entry.count || 0;
      return 0;
    };

    entries.sort((a, b) => getCount(b[1]) - getCount(a[1]));
    const topCategory = entries[0][0];
    const topCount = getCount(entries[0][1]);
    if (topCount >= 2 && topCategory !== tx.category) {
      categorySuggestions.push({
        transactionId: tx.id,
        merchant: tx.merchant,
        date: tx.date,
        amount: tx.amount,
        currency: tx.currency,
        currentCategory: tx.category,
        suggestedCategory: topCategory,
        confidence: Math.min(0.95, 0.5 + topCount * 0.1),
      });
    }
  }

  // ─── UNUSUAL AMOUNTS: flag transactions > 3x category median ───
  const unusualAmounts = [];
  const categoryAmounts = {};
  for (const tx of transactions) {
    if (tx.deletedAt || tx.type !== 'expense' || !tx.category) continue;
    if (!categoryAmounts[tx.category]) categoryAmounts[tx.category] = [];
    categoryAmounts[tx.category].push(tx.amount);
  }
  for (const tx of transactions) {
    if (tx.deletedAt || tx.type !== 'expense' || !tx.category) continue;
    const amounts = categoryAmounts[tx.category];
    if (!amounts || amounts.length < 5) continue; // need enough data
    const sorted = [...amounts].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    if (median > 0 && tx.amount > median * 3) {
      unusualAmounts.push({
        transactionId: tx.id,
        merchant: tx.merchant,
        date: tx.date,
        amount: tx.amount,
        currency: tx.currency,
        category: tx.category,
        median,
        ratio: Math.round(tx.amount / median * 10) / 10,
      });
    }
  }

  // ─── MISSING RECURRING: check if expected recurring transactions exist this month ───
  const missingRecurring = [];
  try {
    const recurringItems = await getAll('recurring', filter);
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const activeRecurring = recurringItems.filter(r => r.active !== false && r.status !== 'cancelled' && r.status !== 'paused');

    for (const item of activeRecurring) {
      // For annual items, check billingMonth
      if (['annual', 'semiannual', 'biannual'].includes(item.frequency)) {
        const billingMonth = (item.billingMonth || 1) - 1;
        if (item.frequency === 'annual' && now.getMonth() !== billingMonth) continue;
        if (item.frequency === 'semiannual' && now.getMonth() !== billingMonth && now.getMonth() !== (billingMonth + 6) % 12) continue;
        if (item.frequency === 'biannual') {
          if (now.getMonth() !== billingMonth) continue;
          const startYear = item.createdAt ? new Date(item.createdAt).getFullYear() : now.getFullYear();
          if ((now.getFullYear() - startYear) % 2 !== 0) continue;
        }
      }

      // Check if the billing day has passed
      if ((item.billingDay || 1) > now.getDate()) continue;

      // Check if a matching transaction exists this month
      const found = transactions.some(tx =>
        !tx.deletedAt &&
        tx.date?.startsWith(currentMonth) &&
        (tx.recurringId === item.id ||
          (tx.merchant?.toLowerCase() === (item.name || item.merchant || '').toLowerCase() &&
           Math.abs(tx.amount - item.amount) < item.amount * 0.1))
      );

      if (!found) {
        missingRecurring.push({
          id: item.id,
          name: item.name,
          amount: item.amount,
          currency: item.currency,
          billingDay: item.billingDay,
          category: item.category,
        });
      }
    }
  } catch (e) {
    // Recurring data not available — skip
  }

  return {
    duplicates: duplicates.sort((a, b) => b.confidence - a.confidence),
    categorySuggestions: categorySuggestions.slice(0, 50),
    unusualAmounts: unusualAmounts.sort((a, b) => b.ratio - a.ratio).slice(0, 20),
    missingRecurring,
    totalScanned: transactions.filter(t => !t.deletedAt).length,
  };
}


// ─── SUBSCRIPTION AUDIT ──────────────────────────────────
// Analyze recurring items for savings opportunities

export async function auditSubscriptions(userId) {
  const filter = userId ? { userId } : {};
  const recurring = await getAll('recurring', filter);
  const transactions = await getAll('transactions', filter);
  const active = recurring.filter(r => r.active !== false && r.status !== 'cancelled' && r.status !== 'paused');
  const results = [];

  for (const sub of active) {
    const merchantLower = (sub.name || sub.merchant || '').toLowerCase().trim();
    if (!merchantLower) continue;

    // Find matching transactions
    const matchingTx = transactions.filter(t =>
      t.merchant && t.merchant.toLowerCase().trim() === merchantLower && t.type === 'expense'
    ).sort((a, b) => b.date?.localeCompare(a.date));

    // Annual cost
    const freq = sub.frequency || 'monthly';
    let monthlyMultiplier = 1;
    if (freq === 'weekly') monthlyMultiplier = 4.33;
    else if (freq === 'biweekly') monthlyMultiplier = 2.17;
    else if (freq === 'daily') monthlyMultiplier = 30.44;
    else if (freq === 'quarterly') monthlyMultiplier = 1 / 3;
    else if (freq === 'semiannual') monthlyMultiplier = 1 / 6;
    else if (freq === 'annual') monthlyMultiplier = 1 / 12;

    const monthlyCost = sub.amount * monthlyMultiplier;
    const annualCost = monthlyCost * 12;

    const audit = {
      id: sub.id,
      name: sub.name || sub.merchant,
      amount: sub.amount,
      currency: sub.currency || 'RON',
      category: sub.category,
      frequency: freq,
      monthlyCost: Math.round(monthlyCost * 100) / 100,
      annualCost: Math.round(annualCost * 100) / 100,
      issues: [],
    };

    // Check for price changes
    if (matchingTx.length >= 2) {
      const recentAmount = matchingTx[0].amount;
      const olderAmount = matchingTx[matchingTx.length > 3 ? 3 : matchingTx.length - 1].amount;
      if (recentAmount > olderAmount * 1.05) {
        const increase = Math.round(((recentAmount - olderAmount) / olderAmount) * 100);
        audit.issues.push({
          type: 'price_increase',
          severity: 'warning',
          message: `Price increased ${increase}% (${olderAmount} → ${recentAmount})`,
        });
      }
    }

    // Check for potentially unused subscriptions (no transactions in 60+ days)
    if (matchingTx.length > 0) {
      const lastTxDate = new Date(matchingTx[0].date);
      const daysSinceLast = Math.floor((Date.now() - lastTxDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceLast > 60) {
        audit.issues.push({
          type: 'potentially_unused',
          severity: 'info',
          message: `No charges in ${daysSinceLast} days — still using this?`,
        });
      }
    } else if (sub.createdAt) {
      const createdDate = new Date(sub.createdAt);
      const daysSinceCreated = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSinceCreated > 30) {
        audit.issues.push({
          type: 'no_transactions',
          severity: 'info',
          message: 'No matching transactions found — verify this is still active',
        });
      }
    }

    // High cost flag (>= 100/month equivalent)
    if (monthlyCost >= 100) {
      audit.issues.push({
        type: 'high_cost',
        severity: 'warning',
        message: `High cost: ${Math.round(monthlyCost)}/mo (${Math.round(annualCost)}/yr)`,
      });
    }

    results.push(audit);
  }

  // Sort: items with issues first, then by annual cost
  results.sort((a, b) => {
    if (a.issues.length !== b.issues.length) return b.issues.length - a.issues.length;
    return b.annualCost - a.annualCost;
  });

  const totalMonthly = results.reduce((s, r) => s + r.monthlyCost, 0);
  const totalAnnual = results.reduce((s, r) => s + r.annualCost, 0);
  const issueCount = results.filter(r => r.issues.length > 0).length;

  return { items: results, totalMonthly, totalAnnual, issueCount };
}

// ─── SMART INSIGHTS ───────────────────────────────────────
// Generate smart spending insights

export async function generateInsights(monthTransactions, userId) {
  const insights = [];

  if (monthTransactions.length === 0) return insights;

  const expenses = monthTransactions.filter(t => t.type === 'expense');
  const income = monthTransactions.filter(t => t.type === 'income');

  const totalExpenses = expenses.reduce((s, t) => s + t.amount, 0);
  const totalIncome = income.reduce((s, t) => s + t.amount, 0);

  // Spending by day of week
  const byDow = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  expenses.forEach(t => {
    const dow = new Date(t.date).getDay();
    byDow[dow] += t.amount;
  });
  const dowNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const maxDow = byDow.indexOf(Math.max(...byDow));
  if (byDow[maxDow] > 0) {
    insights.push({
      type: 'pattern',
      icon: '📅',
      title: 'Spending pattern',
      text: `You spend the most on ${dowNames[maxDow]}s (${Math.round(byDow[maxDow])} total).`,
    });
  }

  // Top category growing
  const byCat = {};
  expenses.forEach(t => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  if (topCat) {
    const pct = totalExpenses > 0 ? Math.round((topCat[1] / totalExpenses) * 100) : 0;
    insights.push({
      type: 'category',
      icon: '📊',
      title: 'Top category',
      text: `${topCat[0]} accounts for ${pct}% of your spending this month.`,
    });
  }

  // Savings rate
  if (totalIncome > 0) {
    const savingsRate = Math.round(((totalIncome - totalExpenses) / totalIncome) * 100);
    insights.push({
      type: savingsRate >= 20 ? 'positive' : 'warning',
      icon: savingsRate >= 20 ? '🎉' : '⚠️',
      title: 'Savings rate',
      text: savingsRate >= 0
        ? `Saving ${savingsRate}% of income. ${savingsRate >= 20 ? 'Great job!' : 'Try to aim for 20%+.'}`
        : `Spending ${Math.abs(savingsRate)}% more than income. Time to cut back.`,
    });
  }

  // Unusual spending detection
  const allFilter = userId ? { userId } : {};
  const allTx = await getAll('transactions', allFilter);
  const prevMonthExpenses = allTx.filter(t => {
    if (t.type !== 'expense') return false;
    const d = new Date(t.date);
    const now = new Date();
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    return d >= prevMonth && d <= prevMonthEnd;
  });
  const prevTotal = prevMonthExpenses.reduce((s, t) => s + t.amount, 0);

  if (prevTotal > 0 && totalExpenses > prevTotal * 1.3) {
    insights.push({
      type: 'warning',
      icon: '📈',
      title: 'Spending up',
      text: `Spending is ${Math.round(((totalExpenses - prevTotal) / prevTotal) * 100)}% higher than last month.`,
    });
  }

  return insights;
}
