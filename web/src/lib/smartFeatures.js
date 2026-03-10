/**
 * Smart Features Engine
 * - Auto-recurring detection
 * - Duplicate detection
 * - Category learning
 * - Merchant autocomplete
 * - Budget alerts
 */

import { getAll, getSetting, setSetting } from './storage';
import { MERCHANT_CATEGORY_MAP } from './constants';

// ─── AUTO-RECURRING DETECTION ─────────────────────────────
// Scans transactions for patterns: same merchant + similar amount appearing 2+ months in a row

export async function detectRecurringPatterns() {
  const transactions = await getAll('transactions');
  if (transactions.length < 2) return [];

  // Group by merchant (normalized)
  const byMerchant = {};
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.merchant) continue;
    const key = tx.merchant.toLowerCase().trim();
    if (!byMerchant[key]) byMerchant[key] = [];
    byMerchant[key].push(tx);
  }

  const suggestions = [];
  const existingRecurring = await getAll('recurring');
  const existingMerchants = new Set(existingRecurring.map(r => r.merchant?.toLowerCase().trim()));

  for (const [merchant, txns] of Object.entries(byMerchant)) {
    // Skip if already tracked as recurring
    if (existingMerchants.has(merchant)) continue;
    if (txns.length < 2) continue;

    // Group by month (YYYY-MM)
    const byMonth = {};
    for (const tx of txns) {
      const month = tx.date?.substring(0, 7);
      if (!month) continue;
      if (!byMonth[month]) byMonth[month] = [];
      byMonth[month].push(tx);
    }

    const months = Object.keys(byMonth).sort();
    if (months.length < 2) continue;

    // Check for consecutive months
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

    if (maxConsecutive < 2) continue;

    // Calculate average amount and check similarity
    const amounts = txns.map(t => t.amount);
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const amountVariance = amounts.every(a => Math.abs(a - avgAmount) / avgAmount < 0.15); // within 15%

    if (!amountVariance && amounts.length > 2) continue;

    // Estimate billing day (most common day of month)
    const days = txns.map(t => parseInt(t.date?.substring(8, 10) || '1'));
    const dayFreq = {};
    days.forEach(d => { dayFreq[d] = (dayFreq[d] || 0) + 1; });
    const billingDay = parseInt(Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0][0]);

    suggestions.push({
      merchant: txns[0].merchant,
      amount: Math.round(avgAmount * 100) / 100,
      currency: txns[0].currency || 'RON',
      category: txns[0].category,
      consecutiveMonths: maxConsecutive,
      billingDay,
      confidence: Math.min(0.95, 0.5 + (maxConsecutive * 0.15) + (amountVariance ? 0.2 : 0)),
      lastDate: txns.sort((a, b) => b.date?.localeCompare(a.date))[0].date,
      transactionCount: txns.length,
    });
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}

function isConsecutiveMonth(a, b) {
  const [y1, m1] = a.split('-').map(Number);
  const [y2, m2] = b.split('-').map(Number);
  if (y1 === y2) return m2 - m1 === 1;
  if (y2 - y1 === 1) return m1 === 12 && m2 === 1;
  return false;
}


// ─── DUPLICATE DETECTION ──────────────────────────────────
// Check if a new transaction looks like an existing one

export async function checkDuplicate(newTx) {
  const transactions = await getAll('transactions');

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

  // 3. Check hardcoded keyword map
  for (const [key, cat] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (lower.includes(key)) return { category: cat, subcategory: null };
  }

  return { category: 'other', subcategory: null };
}


// ─── MERCHANT AUTOCOMPLETE ────────────────────────────────
// Suggest merchants based on history + learned categories

export async function getMerchantSuggestions(query) {
  if (!query || query.length < 1) return [];
  const lower = query.toLowerCase().trim();

  const transactions = await getAll('transactions');

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

export async function checkBudgetAlerts(monthTransactions) {
  const budgets = await getAll('budgets');
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
        const dayOfExceed = Math.ceil(budget.amount / dailyPace);
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


// ─── SUBSCRIPTION AUDIT ──────────────────────────────────
// Analyze recurring items for savings opportunities

export async function auditSubscriptions() {
  const recurring = await getAll('recurring');
  const transactions = await getAll('transactions');
  const active = recurring.filter(r => r.active !== false);
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

export async function generateInsights(monthTransactions) {
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
  const allTx = await getAll('transactions');
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
