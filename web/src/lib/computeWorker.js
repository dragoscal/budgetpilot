// Web Worker for heavy computations — offloads analytics from the main thread

self.addEventListener('message', (e) => {
  const { id, type, payload } = e.data;

  try {
    let result;

    switch (type) {
      case 'COMPUTE_ANALYTICS':
        result = computeAnalytics(payload.transactions);
        break;

      case 'COMPUTE_CASHFLOW':
        result = computeCashflow(payload.transactions, payload.months);
        break;

      case 'COMPUTE_HEALTH_SCORE':
        result = computeHealthScore(payload.transactions, payload.budgets, payload.goals);
        break;

      default:
        self.postMessage({ id, error: `Unknown computation type: ${type}` });
        return;
    }

    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
});

// ─── COMPUTE_ANALYTICS ──────────────────────────────────
// Takes transactions array, returns category totals, daily totals, merchant frequency
function computeAnalytics(transactions) {
  const categoryTotals = {};
  const dailyTotals = {};
  const merchantFrequency = {};

  for (const tx of transactions) {
    // Category totals (expenses only)
    if (tx.type === 'expense') {
      const cat = tx.category || 'other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (tx.amount || 0);
    }

    // Daily totals
    const day = tx.date || 'unknown';
    if (!dailyTotals[day]) {
      dailyTotals[day] = { income: 0, expense: 0 };
    }
    if (tx.type === 'income') {
      dailyTotals[day].income += tx.amount || 0;
    } else if (tx.type === 'expense') {
      dailyTotals[day].expense += tx.amount || 0;
    }

    // Merchant frequency
    const merchant = tx.merchant || tx.description || 'Unknown';
    if (!merchantFrequency[merchant]) {
      merchantFrequency[merchant] = { count: 0, total: 0, category: tx.category };
    }
    merchantFrequency[merchant].count += 1;
    merchantFrequency[merchant].total += tx.amount || 0;
  }

  // Sort category totals descending
  const sortedCategories = Object.entries(categoryTotals)
    .sort(([, a], [, b]) => b - a)
    .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }));

  // Sort daily totals by date
  const sortedDaily = Object.entries(dailyTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, totals]) => ({
      date,
      income: Math.round(totals.income * 100) / 100,
      expense: Math.round(totals.expense * 100) / 100,
    }));

  // Sort merchants by frequency descending
  const sortedMerchants = Object.entries(merchantFrequency)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([merchant, data]) => ({
      merchant,
      count: data.count,
      total: Math.round(data.total * 100) / 100,
      category: data.category,
    }));

  return {
    categoryTotals: sortedCategories,
    dailyTotals: sortedDaily,
    merchantFrequency: sortedMerchants,
  };
}

// ─── COMPUTE_CASHFLOW ───────────────────────────────────
// Takes transactions + months range, computes income vs expenses per month
function computeCashflow(transactions, months = 12) {
  const monthlyData = {};

  for (const tx of transactions) {
    if (!tx.date) continue;
    // Extract YYYY-MM from date
    const monthKey = tx.date.substring(0, 7);

    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = { income: 0, expense: 0 };
    }

    if (tx.type === 'income') {
      monthlyData[monthKey].income += tx.amount || 0;
    } else if (tx.type === 'expense') {
      monthlyData[monthKey].expense += tx.amount || 0;
    }
  }

  // Sort by month and limit to the requested range
  const sorted = Object.entries(monthlyData)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-months)
    .map(([month, data]) => ({
      month,
      income: Math.round(data.income * 100) / 100,
      expense: Math.round(data.expense * 100) / 100,
      net: Math.round((data.income - data.expense) * 100) / 100,
    }));

  const totalIncome = sorted.reduce((s, m) => s + m.income, 0);
  const totalExpense = sorted.reduce((s, m) => s + m.expense, 0);

  return {
    months: sorted,
    totalIncome: Math.round(totalIncome * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    totalNet: Math.round((totalIncome - totalExpense) * 100) / 100,
  };
}

// ─── COMPUTE_HEALTH_SCORE ───────────────────────────────
// Takes transactions + budgets + goals, returns health score breakdown
function computeHealthScore(transactions, budgets, goals) {
  const scores = {};
  let totalWeight = 0;
  let weightedSum = 0;

  // 1. Budget adherence score (0-100) — weight: 30
  const budgetScore = computeBudgetAdherence(transactions, budgets);
  scores.budgetAdherence = budgetScore;
  weightedSum += budgetScore * 30;
  totalWeight += 30;

  // 2. Savings rate score (0-100) — weight: 25
  const savingsScore = computeSavingsRate(transactions);
  scores.savingsRate = savingsScore;
  weightedSum += savingsScore * 25;
  totalWeight += 25;

  // 3. Spending consistency (0-100) — weight: 20
  const consistencyScore = computeSpendingConsistency(transactions);
  scores.spendingConsistency = consistencyScore;
  weightedSum += consistencyScore * 20;
  totalWeight += 20;

  // 4. Goal progress score (0-100) — weight: 15
  const goalScore = computeGoalProgress(goals);
  scores.goalProgress = goalScore;
  weightedSum += goalScore * 15;
  totalWeight += 15;

  // 5. Diversity score (0-100) — weight: 10
  const diversityScore = computeExpenseDiversity(transactions);
  scores.expenseDiversity = diversityScore;
  weightedSum += diversityScore * 10;
  totalWeight += 10;

  const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 50;

  return {
    overall,
    breakdown: scores,
  };
}

function computeBudgetAdherence(transactions, budgets) {
  if (!budgets || budgets.length === 0) return 50; // Neutral if no budgets set

  // Get current month expenses by category
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthExpenses = {};

  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date?.startsWith(currentMonth)) continue;
    const cat = tx.category || 'other';
    monthExpenses[cat] = (monthExpenses[cat] || 0) + (tx.amount || 0);
  }

  let totalScore = 0;
  let count = 0;

  for (const budget of budgets) {
    const spent = monthExpenses[budget.category] || 0;
    const limit = budget.amount || 0;
    if (limit <= 0) continue;

    const ratio = spent / limit;
    // Score: 100 if under 80%, scales down to 0 at 150%+
    const score = ratio <= 0.8 ? 100 : ratio >= 1.5 ? 0 : Math.round((1.5 - ratio) / 0.7 * 100);
    totalScore += score;
    count++;
  }

  return count > 0 ? Math.round(totalScore / count) : 50;
}

function computeSavingsRate(transactions) {
  let income = 0;
  let expense = 0;

  for (const tx of transactions) {
    if (tx.type === 'income') income += tx.amount || 0;
    else if (tx.type === 'expense') expense += tx.amount || 0;
  }

  if (income <= 0) return 0;
  const rate = (income - expense) / income;

  // Score: 0% savings = 0, 20%+ savings = 100
  return Math.min(100, Math.max(0, Math.round(rate * 500)));
}

function computeSpendingConsistency(transactions) {
  // Group expenses by month
  const monthlyExpenses = {};
  for (const tx of transactions) {
    if (tx.type !== 'expense' || !tx.date) continue;
    const month = tx.date.substring(0, 7);
    monthlyExpenses[month] = (monthlyExpenses[month] || 0) + (tx.amount || 0);
  }

  const values = Object.values(monthlyExpenses);
  if (values.length < 2) return 50;

  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  if (avg === 0) return 50;

  // Coefficient of variation (lower is more consistent)
  const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
  const cv = Math.sqrt(variance) / avg;

  // Score: CV of 0 = 100 (perfectly consistent), CV of 1+ = 0
  return Math.min(100, Math.max(0, Math.round((1 - cv) * 100)));
}

function computeGoalProgress(goals) {
  if (!goals || goals.length === 0) return 50; // Neutral if no goals

  let totalProgress = 0;
  let count = 0;

  for (const goal of goals) {
    if (!goal.targetAmount || goal.targetAmount <= 0) continue;
    const progress = Math.min(1, (goal.currentAmount || 0) / goal.targetAmount);
    totalProgress += progress;
    count++;
  }

  return count > 0 ? Math.round((totalProgress / count) * 100) : 50;
}

function computeExpenseDiversity(transactions) {
  // More diverse spending across categories = healthier
  const categoryAmounts = {};

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    const cat = tx.category || 'other';
    categoryAmounts[cat] = (categoryAmounts[cat] || 0) + (tx.amount || 0);
  }

  const categories = Object.keys(categoryAmounts);
  if (categories.length <= 1) return 30;

  const total = Object.values(categoryAmounts).reduce((s, v) => s + v, 0);
  if (total <= 0) return 50;

  // Shannon entropy normalized
  let entropy = 0;
  for (const amount of Object.values(categoryAmounts)) {
    const p = amount / total;
    if (p > 0) entropy -= p * Math.log2(p);
  }

  const maxEntropy = Math.log2(categories.length);
  const normalized = maxEntropy > 0 ? entropy / maxEntropy : 0;

  // Score: normalized entropy 0-1 mapped to 0-100
  return Math.round(normalized * 100);
}
