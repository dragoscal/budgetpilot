/**
 * Predictive Cash Flow Forecasting
 * Projects day-by-day balance using:
 *   - Recurring bills (known future expenses)
 *   - Recurring income
 *   - Historical daily spend patterns
 *   - Current account balance
 */

import { getAll } from './storage';
import { calcMonthlyEquivalent, dateToLocalISO } from './helpers';

/**
 * Forecast cash flow for the next N days
 * @param {Object} options
 * @param {string} options.userId
 * @param {number} options.days — forecast horizon (default 90)
 * @param {number} options.startingBalance — current balance (if null, computed from transactions)
 * @param {string} options.defaultCurrency
 * @returns {Promise<Object>} { projections, dangerZones, summary }
 */
export async function forecastCashFlow({ userId = 'local', days = 90, startingBalance = null, defaultCurrency = 'RON' } = {}) {
  const [transactions, recurring, accounts] = await Promise.all([
    getAll('transactions'),
    getAll('recurring'),
    getAll('accounts'),
  ]);

  const userTx = transactions.filter(t => !userId || t.userId === userId);
  const userRecurring = recurring.filter(r => (!userId || r.userId === userId) && r.active !== false);

  // ─── Compute starting balance ──────────────────────────
  let balance = startingBalance;
  if (balance === null) {
    // Sum from accounts, or estimate from income - expenses
    const accountTotal = accounts
      .filter(a => !userId || a.userId === userId)
      .reduce((sum, a) => sum + (Number(a.balance) || 0), 0);

    if (accountTotal > 0) {
      balance = accountTotal;
    } else {
      // Estimate: total income - total expenses from all time
      balance = userTx.reduce((sum, t) => {
        if (t.type === 'income') return sum + t.amount;
        if (t.type === 'expense') return sum - t.amount;
        return sum;
      }, 0);
    }
  }

  // ─── Historical daily spending pattern (last 90 days) ──
  const now = new Date();
  const ninetyDaysAgo = new Date(now);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const recentExpenses = userTx.filter(t =>
    t.type === 'expense' && new Date(t.date) >= ninetyDaysAgo && new Date(t.date) <= now
  );

  // Average daily spend by day-of-week (0=Sun, 6=Sat)
  // Count unique dates per DOW (not transactions) to get correct per-day average
  const dowSpend = [0, 0, 0, 0, 0, 0, 0];
  const dowDates = [new Set(), new Set(), new Set(), new Set(), new Set(), new Set(), new Set()];
  for (const tx of recentExpenses) {
    const d = new Date(tx.date);
    const dow = d.getDay();
    dowSpend[dow] += tx.amount;
    dowDates[dow].add(tx.date);
  }
  const dowAvg = dowSpend.map((total, i) => dowDates[i].size > 0 ? total / dowDates[i].size : 0);

  // Overall average daily spend (fallback)
  const totalDays = Math.max(1, Math.ceil((now - ninetyDaysAgo) / (1000 * 60 * 60 * 24)));
  const totalRecentSpend = recentExpenses.reduce((s, t) => s + t.amount, 0);
  const avgDailySpend = totalRecentSpend / totalDays;

  // ─── Build recurring schedule ──────────────────────────
  // Map each recurring item to its expected days
  const recurringEvents = [];
  for (const r of userRecurring) {
    const isIncome = r.category === 'income';
    const frequency = r.frequency || 'monthly';
    const billingDay = r.billingDay || 1;

    if (frequency === 'daily') {
      // Schedule every day
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        recurringEvents.push({
          day: d,
          date: dateToLocalISO(date),
          amount: r.amount,
          name: r.name || r.merchant || 'Recurring',
          isIncome,
          category: r.category,
        });
      }
    } else if (frequency === 'weekly') {
      // Schedule every 7 days starting from the nearest occurrence
      // Find the first occurrence: use billingDay as day-of-week (0=Sun..6=Sat), default to today's DOW
      const targetDow = billingDay <= 6 ? billingDay : now.getDay();
      const todayDow = now.getDay();
      let firstOffset = (targetDow - todayDow + 7) % 7;
      for (let d = firstOffset; d < days; d += 7) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        recurringEvents.push({
          day: d,
          date: dateToLocalISO(date),
          amount: r.amount,
          name: r.name || r.merchant || 'Recurring',
          isIncome,
          category: r.category,
        });
      }
    } else if (frequency === 'annual' || frequency === 'yearly') {
      // Schedule once if billingDay and month match within the forecast window
      const billingMonth = r.billingMonth || (now.getMonth() + 1); // 1-indexed month
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        if (date.getDate() === billingDay && (date.getMonth() + 1) === billingMonth) {
          recurringEvents.push({
            day: d,
            date: dateToLocalISO(date),
            amount: r.amount,
            name: r.name || r.merchant || 'Recurring',
            isIncome,
            category: r.category,
          });
        }
      }
    } else if (frequency === 'biweekly') {
      // Schedule every 14 days starting from the nearest occurrence
      const targetDow = billingDay <= 6 ? billingDay : now.getDay();
      const todayDow = now.getDay();
      let firstOffset = (targetDow - todayDow + 7) % 7;
      for (let d = firstOffset; d < days; d += 14) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        recurringEvents.push({
          day: d,
          date: dateToLocalISO(date),
          amount: r.amount,
          name: r.name || r.merchant || 'Recurring',
          isIncome,
          category: r.category,
        });
      }
    } else if (frequency === 'quarterly') {
      // Schedule on billingDay in quarter-boundary months (Jan, Apr, Jul, Oct)
      const quarterMonths = [1, 4, 7, 10];
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        if (date.getDate() === billingDay && quarterMonths.includes(date.getMonth() + 1)) {
          recurringEvents.push({
            day: d,
            date: dateToLocalISO(date),
            amount: r.amount,
            name: r.name || r.merchant || 'Recurring',
            isIncome,
            category: r.category,
          });
        }
      }
    } else if (frequency === 'bimonthly') {
      // Schedule on billingDay every 2 months
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        if (date.getDate() === billingDay) {
          const monthDiff = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();
          if (monthDiff % 2 === 0) {
            recurringEvents.push({
              day: d, date: dateToLocalISO(date), amount: r.amount,
              name: r.name || r.merchant || 'Recurring', isIncome, category: r.category,
            });
          }
        }
      }
    } else if (frequency === 'semiannual') {
      // Schedule on billingDay every 6 months
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        if (date.getDate() === billingDay) {
          const monthDiff = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();
          if (monthDiff % 6 === 0) {
            recurringEvents.push({
              day: d, date: dateToLocalISO(date), amount: r.amount,
              name: r.name || r.merchant || 'Recurring', isIncome, category: r.category,
            });
          }
        }
      }
    } else if (frequency === 'biannual') {
      // Schedule on billingDay every 24 months (every 2 years)
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);
        if (date.getDate() === billingDay) {
          const monthDiff = (date.getFullYear() - now.getFullYear()) * 12 + date.getMonth() - now.getMonth();
          if (monthDiff % 24 === 0) {
            recurringEvents.push({
              day: d, date: dateToLocalISO(date), amount: r.amount,
              name: r.name || r.merchant || 'Recurring', isIncome, category: r.category,
            });
          }
        }
      }
    } else {
      // monthly (default): keep existing billingDay logic
      for (let d = 0; d < days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);

        if (date.getDate() === billingDay || (billingDay > 28 && date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() && billingDay >= date.getDate())) {
          recurringEvents.push({
            day: d,
            date: dateToLocalISO(date),
            amount: r.amount,
            name: r.name || r.merchant || 'Recurring',
            isIncome,
            category: r.category,
          });
        }
      }
    }
  }

  // ─── Project day by day ────────────────────────────────
  const projections = [];
  let runningBalance = balance;
  const dangerZones = [];

  for (let d = 0; d < days; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const dateStr = dateToLocalISO(date);
    const dow = date.getDay();

    // Known recurring on this day
    const dayRecurring = recurringEvents.filter(e => e.day === d);
    let dayIncome = 0;
    let dayExpenses = 0;
    const events = [];

    for (const ev of dayRecurring) {
      if (ev.isIncome) {
        dayIncome += ev.amount;
      } else {
        dayExpenses += ev.amount;
      }
      events.push(ev);
    }

    // Estimated daily spend (non-recurring, based on day-of-week pattern)
    // Only add estimated spend if there's historical data
    const estimatedSpend = dowAvg[dow] > 0 ? dowAvg[dow] : avgDailySpend;
    // Reduce estimated spend by what's already accounted for in recurring
    const additionalSpend = Math.max(0, estimatedSpend - dayExpenses * 0.3);

    if (d > 0) {
      // Don't add estimated spend for today (already happened partially)
      dayExpenses += additionalSpend;
    }

    runningBalance += dayIncome - dayExpenses;

    projections.push({
      date: dateStr,
      day: d,
      balance: Math.round(runningBalance * 100) / 100,
      income: Math.round(dayIncome * 100) / 100,
      expenses: Math.round(dayExpenses * 100) / 100,
      events,
      isEstimated: events.length === 0,
    });

    // Track danger zones (negative balance)
    if (runningBalance < 0) {
      if (dangerZones.length === 0 || dangerZones[dangerZones.length - 1].endDay !== d - 1) {
        dangerZones.push({ startDate: dateStr, startDay: d, endDate: dateStr, endDay: d, lowestBalance: runningBalance });
      } else {
        const zone = dangerZones[dangerZones.length - 1];
        zone.endDate = dateStr;
        zone.endDay = d;
        zone.lowestBalance = Math.min(zone.lowestBalance, runningBalance);
      }
    }
  }

  // ─── Summary ───────────────────────────────────────────
  const totalProjectedIncome = projections.reduce((s, p) => s + p.income, 0);
  const totalProjectedExpenses = projections.reduce((s, p) => s + p.expenses, 0);
  const endBalance = projections[projections.length - 1]?.balance ?? balance;
  const lowestBalance = Math.min(...projections.map(p => p.balance));
  const lowestDate = projections.find(p => p.balance === lowestBalance)?.date;

  return {
    projections,
    dangerZones,
    summary: {
      startingBalance: Math.round(balance * 100) / 100,
      endBalance: Math.round(endBalance * 100) / 100,
      totalProjectedIncome: Math.round(totalProjectedIncome * 100) / 100,
      totalProjectedExpenses: Math.round(totalProjectedExpenses * 100) / 100,
      lowestBalance: Math.round(lowestBalance * 100) / 100,
      lowestDate,
      avgDailySpend: Math.round(avgDailySpend * 100) / 100,
      dangerZoneCount: dangerZones.length,
      forecastDays: days,
    },
  };
}
