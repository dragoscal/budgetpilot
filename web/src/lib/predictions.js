/**
 * Spending prediction engine for LUMET.
 * Uses moving averages — no external ML library needed.
 */

import { startOfMonth, endOfMonth, differenceInDays, format } from 'date-fns';

/**
 * Group transactions by month (YYYY-MM) and return per-month expense totals.
 */
function groupExpensesByMonth(transactions) {
  const monthMap = {};
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date) continue;
    const monthKey = tx.date.slice(0, 7); // YYYY-MM
    monthMap[monthKey] = (monthMap[monthKey] || 0) + (Number(tx.amount) || 0);
  }
  return monthMap;
}

/**
 * Group expenses by month AND category.
 */
function groupExpensesByMonthAndCategory(transactions) {
  const map = {}; // { 'YYYY-MM': { catId: total } }
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date) continue;
    const monthKey = tx.date.slice(0, 7);
    if (!map[monthKey]) map[monthKey] = {};
    const cat = tx.category || 'other';
    map[monthKey][cat] = (map[monthKey][cat] || 0) + (Number(tx.amount) || 0);
  }
  return map;
}

/**
 * Predict monthly spending based on a moving average of the last N months.
 *
 * @param {Array} transactions - All transactions (not just current month).
 * @param {number} months - Number of past months to average (default 3).
 * @returns {{ predictedTotal: number, perCategory: Record<string, number>, monthsUsed: number }}
 */
export function predictMonthlySpending(transactions, months = 3) {
  const now = new Date();
  const currentMonthKey = format(now, 'yyyy-MM');

  // Get month totals excluding the current (incomplete) month
  const monthTotals = groupExpensesByMonth(transactions);
  const pastMonths = Object.keys(monthTotals)
    .filter((m) => m < currentMonthKey)
    .sort()
    .slice(-months);

  if (pastMonths.length === 0) {
    return { predictedTotal: 0, perCategory: {}, monthsUsed: 0 };
  }

  const predictedTotal =
    pastMonths.reduce((sum, m) => sum + monthTotals[m], 0) / pastMonths.length;

  // Per-category predictions
  const catByMonth = groupExpensesByMonthAndCategory(transactions);
  const allCategories = new Set();
  for (const m of pastMonths) {
    if (catByMonth[m]) {
      Object.keys(catByMonth[m]).forEach((c) => allCategories.add(c));
    }
  }

  const perCategory = {};
  for (const cat of allCategories) {
    const catTotal = pastMonths.reduce((sum, m) => sum + (catByMonth[m]?.[cat] || 0), 0);
    perCategory[cat] = catTotal / pastMonths.length;
  }

  return { predictedTotal, perCategory, monthsUsed: pastMonths.length };
}

/**
 * Predict end-of-month balance based on daily spend rate so far this month.
 *
 * @param {Array} transactions - Current month's transactions.
 * @param {number} currentBalance - Current available balance.
 * @returns {{ predicted: number, daysLeft: number, dailyRate: number, trend: 'up'|'down'|'stable' }}
 */
export function predictEndOfMonthBalance(transactions, currentBalance) {
  const now = new Date();
  const monthEnd = endOfMonth(now);
  const monthStart = startOfMonth(now);
  const daysElapsed = differenceInDays(now, monthStart) + 1;
  const daysLeft = differenceInDays(monthEnd, now);
  const totalDays = differenceInDays(monthEnd, monthStart) + 1;

  const currentMonthExpenses = transactions.filter(
    (tx) => tx.type === 'expense'
  );
  const totalSpent = currentMonthExpenses.reduce(
    (sum, tx) => sum + (Number(tx.amount) || 0),
    0
  );

  const dailyRate = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const predictedTotalSpend = dailyRate * totalDays;
  const predictedRemainingSpend = dailyRate * daysLeft;
  const predicted = currentBalance - predictedRemainingSpend;

  // Determine trend by comparing first half vs second half pace
  const midpoint = Math.floor(daysElapsed / 2);
  if (midpoint > 0 && daysElapsed > 2) {
    const midDateStr = format(
      new Date(monthStart.getTime() + midpoint * 86400000),
      'yyyy-MM-dd'
    );
    const firstHalf = currentMonthExpenses
      .filter((tx) => tx.date <= midDateStr)
      .reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
    const secondHalf = totalSpent - firstHalf;
    const firstHalfRate = firstHalf / midpoint;
    const secondHalfRate = secondHalf / (daysElapsed - midpoint);

    let trend = 'stable';
    if (secondHalfRate > firstHalfRate * 1.15) trend = 'up';
    else if (secondHalfRate < firstHalfRate * 0.85) trend = 'down';

    return { predicted, daysLeft, dailyRate, trend, predictedTotalSpend };
  }

  return { predicted, daysLeft, dailyRate, trend: 'stable', predictedTotalSpend };
}

/**
 * Find categories where this month's spending is >50% above their historical average.
 *
 * @param {Array} transactions - All transactions (all months).
 * @returns {Array<{ category: string, thisMonth: number, average: number, percentOver: number }>}
 */
export function getSpendingAnomalies(transactions) {
  const now = new Date();
  const currentMonthKey = format(now, 'yyyy-MM');

  const catByMonth = groupExpensesByMonthAndCategory(transactions);
  const pastMonthKeys = Object.keys(catByMonth)
    .filter((m) => m < currentMonthKey)
    .sort();

  if (pastMonthKeys.length < 2) return [];

  // Get current month category spending
  const currentCats = catByMonth[currentMonthKey] || {};

  // Calculate averages for past months
  const allCategories = new Set();
  for (const m of pastMonthKeys) {
    Object.keys(catByMonth[m]).forEach((c) => allCategories.add(c));
  }

  const anomalies = [];
  for (const cat of allCategories) {
    const thisMonth = currentCats[cat] || 0;
    if (thisMonth === 0) continue;

    const pastValues = pastMonthKeys.map((m) => catByMonth[m]?.[cat] || 0);
    const average =
      pastValues.reduce((a, b) => a + b, 0) / pastValues.length;

    if (average > 0) {
      const percentOver = Math.round(((thisMonth - average) / average) * 100);
      if (percentOver > 50) {
        anomalies.push({ category: cat, thisMonth, average, percentOver });
      }
    }
  }

  return anomalies.sort((a, b) => b.percentOver - a.percentOver);
}

/**
 * Suggest budgets based on historical transaction data.
 * Groups expenses by category, computes monthly averages, and rounds up.
 *
 * @param {Array} transactions - All imported/existing transactions.
 * @param {string} currency - User's currency code (RON, EUR, USD).
 * @returns {Array<{ category: string, suggestedAmount: number }>}
 */
export function suggestBudgetsFromHistory(transactions, currency = 'RON') {
  const expenses = transactions.filter((t) => t.type === 'expense' && t.date && t.category);
  if (expenses.length === 0) return [];

  // Group by month and category
  const monthCats = {};
  const months = new Set();
  for (const tx of expenses) {
    const monthKey = tx.date.slice(0, 7);
    months.add(monthKey);
    const key = `${monthKey}:${tx.category}`;
    monthCats[key] = (monthCats[key] || 0) + (Number(tx.amount) || 0);
  }

  const monthCount = months.size || 1;

  // Aggregate per category
  const catTotals = {};
  for (const [key, total] of Object.entries(monthCats)) {
    const cat = key.split(':')[1];
    catTotals[cat] = (catTotals[cat] || 0) + total;
  }

  // Round to nearest 50 for RON, nearest 10 for others
  const roundTo = currency === 'RON' ? 50 : 10;
  const roundUp = (val) => Math.ceil(val / roundTo) * roundTo;

  const suggestions = [];
  for (const [category, total] of Object.entries(catTotals)) {
    if (category === 'income' || category === 'transfer') continue;
    const monthlyAvg = total / monthCount;
    if (monthlyAvg < 1) continue;
    suggestions.push({
      category,
      suggestedAmount: roundUp(monthlyAvg),
    });
  }

  return suggestions.sort((a, b) => b.suggestedAmount - a.suggestedAmount);
}
