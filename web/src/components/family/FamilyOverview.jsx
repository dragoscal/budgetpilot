import { useMemo, useState, useEffect } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { formatCurrency, sumBy, getDaysRemaining, percentOf, getCategoryById } from '../../lib/helpers';
import { budgets as budgetApi, goals as goalApi } from '../../lib/api';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Target, Sparkles } from 'lucide-react';

export default function FamilyOverview() {
  const { t } = useTranslation();
  const { activeFamily, familyTransactions, familyTransactionsLoading, sharedExpensesList } = useFamily();
  const currency = activeFamily?.defaultCurrency || 'RON';

  const [budgetsList, setBudgetsList] = useState([]);
  const [goalsList, setGoalsList] = useState([]);

  // Load budgets and goals for this family
  useEffect(() => {
    if (!activeFamily) return;
    (async () => {
      const [allBudgets, allGoals] = await Promise.all([
        budgetApi.getAll(),
        goalApi.getAll(),
      ]);
      setBudgetsList(allBudgets.filter((b) => b.familyId === activeFamily.id));
      setGoalsList(allGoals.filter((g) => g.familyId === activeFamily.id));
    })();
  }, [activeFamily]);

  const now = new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);
  const currentMonth = format(now, 'yyyy-MM');

  // This month's expenses
  const thisMonthExpenses = useMemo(() => {
    return familyTransactions.filter((tx) => {
      const d = new Date(tx.date);
      return d >= mStart && d <= mEnd && tx.type === 'expense';
    });
  }, [familyTransactions, mStart, mEnd]);

  const totalSpent = useMemo(() => sumBy(thisMonthExpenses, 'amount'), [thisMonthExpenses]);

  // ─── Pulse card ───
  const pulse = useMemo(() => {
    const monthBudgets = budgetsList.filter((b) => b.month === currentMonth);
    const totalBudget = sumBy(monthBudgets, 'amount');
    const remaining = totalBudget - totalSpent;
    const daysLeft = getDaysRemaining();
    const perDay = daysLeft > 0 ? remaining / daysLeft : 0;
    const pct = totalBudget > 0 ? percentOf(remaining, totalBudget) : 100;
    return { totalBudget, remaining, daysLeft, perDay, pct, hasBudgets: monthBudgets.length > 0 };
  }, [budgetsList, totalSpent, currentMonth]);

  // ─── Budget envelopes ───
  const envelopes = useMemo(() => {
    const monthBudgets = budgetsList.filter((b) => b.month === currentMonth);
    return monthBudgets
      .map((b) => {
        const cat = getCategoryById(b.category);
        const spent = sumBy(
          thisMonthExpenses.filter((tx) => tx.category === b.category),
          'amount'
        );
        const remaining = b.amount - spent;
        const pct = percentOf(spent, b.amount);
        return { ...b, cat, spent, remaining, pct };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 6);
  }, [budgetsList, thisMonthExpenses, currentMonth]);

  // ─── Shared goals ───
  const activeGoals = useMemo(() => {
    return goalsList.filter((g) => {
      if (g.type === 'savings' || g.type === 'target') {
        return (g.currentAmount || 0) < g.targetAmount;
      }
      return true;
    });
  }, [goalsList]);

  // ─── Spending trend (last 6 months, single line) ───
  const trendData = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const total = sumBy(
        familyTransactions.filter((tx) => {
          const td = new Date(tx.date);
          return td >= ms && td <= me && tx.type === 'expense';
        }),
        'amount'
      );
      data.push({ month: format(d, 'MMM'), total });
    }
    return data;
  }, [familyTransactions]);

  // ─── Celebrations ───
  const celebrations = useMemo(() => {
    const msgs = [];
    // Budget on track
    if (pulse.hasBudgets && pulse.pct > 30) {
      msgs.push({ emoji: '🎯', text: t('family.onTrack') });
    }
    // Goal almost there
    for (const g of activeGoals) {
      const goalPct = percentOf(g.currentAmount || 0, g.targetAmount);
      if (goalPct >= 75) {
        msgs.push({ emoji: '🔥', text: t('family.almostThere', { name: g.name }) });
      }
    }
    // No debts
    if (sharedExpensesList.length > 0) {
      const hasUnsettled = sharedExpensesList.some((e) =>
        e.splits?.some((s) => !s.settled)
      );
      if (!hasUnsettled) {
        msgs.push({ emoji: '🤝', text: t('family.teamwork') });
      }
    }
    return msgs;
  }, [pulse, activeGoals, sharedExpensesList, t]);

  if (familyTransactionsLoading) {
    return <div className="card animate-pulse"><div className="h-64 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>;
  }

  const pulseColor = pulse.pct > 30 ? 'text-success' : pulse.pct > 10 ? 'text-warning' : 'text-danger';
  const pulseBg = pulse.pct > 30 ? 'bg-success/10' : pulse.pct > 10 ? 'bg-warning/10' : 'bg-danger/10';

  return (
    <div className="space-y-4">
      {/* Pulse card */}
      {pulse.hasBudgets ? (
        <div className={`card ${pulseBg}`}>
          <p className="text-xs text-cream-500 mb-1">{t('family.leftToSpend', { amount: '' }).replace('{amount}', '').trim() || 'Left to spend'}</p>
          <p className={`font-heading font-bold text-3xl money ${pulseColor}`}>
            {formatCurrency(Math.max(pulse.remaining, 0), currency)}
          </p>
          <div className="flex items-center gap-4 mt-2 text-xs text-cream-500">
            <span>{t('family.daysRemaining', { count: pulse.daysLeft })}</span>
            <span>{t('family.perDay', { amount: formatCurrency(Math.max(pulse.perDay, 0), currency) })}</span>
          </div>
          {/* Progress bar */}
          <div className="mt-3 h-2 rounded-full bg-white/50 dark:bg-dark-border overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pulse.pct > 30 ? 'bg-success' : pulse.pct > 10 ? 'bg-warning' : 'bg-danger'}`}
              style={{ width: `${Math.min(Math.max(100 - pulse.pct, 0), 100)}%` }}
            />
          </div>
        </div>
      ) : (
        <div className="card text-center py-6">
          <p className="text-sm text-cream-500">{t('family.householdTrend')}</p>
          <p className="font-heading font-bold text-2xl money mt-1">{formatCurrency(totalSpent, currency)}</p>
          <p className="text-xs text-cream-400 mt-1">{t('family.spentThisMonth') || 'spent this month'}</p>
        </div>
      )}

      {/* Celebrations */}
      {celebrations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {celebrations.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-success/10 text-success text-xs font-medium">
              <span>{c.emoji}</span>
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Shared budget envelopes */}
      {envelopes.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('family.sharedBudgets')}</h3>
          <div className="space-y-3">
            {envelopes.map((env) => (
              <div key={env.id}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-1.5">
                    <span>{env.cat.icon}</span>
                    <span className="font-medium">{env.cat.name}</span>
                  </span>
                  <span className={`text-xs font-medium ${env.remaining >= 0 ? 'text-cream-500' : 'text-danger'}`}>
                    {env.remaining >= 0
                      ? t('family.remainingBudget', { amount: formatCurrency(env.remaining, currency) })
                      : t('family.overBudget', { amount: formatCurrency(Math.abs(env.remaining), currency) })}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-cream-100 dark:bg-dark-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${env.pct > 100 ? 'bg-danger' : env.pct > 80 ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${Math.min(env.pct, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared goals */}
      {activeGoals.length > 0 && (
        <div className="card">
          <h3 className="section-title flex items-center gap-2">
            <Target size={14} /> {t('family.sharedGoals')}
          </h3>
          <div className="space-y-3">
            {activeGoals.map((g) => {
              const goalPct = percentOf(g.currentAmount || 0, g.targetAmount);
              return (
                <div key={g.id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="flex items-center gap-1.5">
                      <span>{g.icon || '🎯'}</span>
                      <span className="font-medium">{g.name}</span>
                    </span>
                    <span className="text-xs text-cream-500">
                      {t('family.savedOf', {
                        current: formatCurrency(g.currentAmount || 0, currency),
                        target: formatCurrency(g.targetAmount, currency),
                      })}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-cream-100 dark:bg-dark-border overflow-hidden">
                    <div
                      className="h-full rounded-full bg-accent transition-all"
                      style={{ width: `${Math.min(goalPct, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Spending trend */}
      {trendData.some((d) => d.total > 0) && (
        <div className="card">
          <h3 className="section-title">{t('family.householdTrend')}</h3>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B7A6E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1B7A6E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCurrency(v, currency)} tick={{ fontSize: 10 }} width={70} />
              <Tooltip
                formatter={(v) => formatCurrency(v, currency)}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
              />
              <Area type="monotone" dataKey="total" stroke="#1B7A6E" fill="url(#trendFill)" strokeWidth={2} dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state */}
      {familyTransactions.length === 0 && envelopes.length === 0 && activeGoals.length === 0 && (
        <div className="card text-center py-8">
          <Sparkles size={28} className="text-cream-300 mx-auto mb-2" />
          <p className="text-sm text-cream-500">{t('family.noRecentActivity')}</p>
        </div>
      )}
    </div>
  );
}
