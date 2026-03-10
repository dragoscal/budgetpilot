import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, budgets as budgetsApi, goals as goalsApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency, sumBy, groupBy, getCategoryById, percentOf, trendIndicator, sumAmountsMultiCurrency } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import MonthPicker from '../components/MonthPicker';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function MonthlyReview() {
  const { user, effectiveUserId } = useAuth();
  const { t } = useTranslation();
  const [month, setMonth] = useState(new Date());
  const [currentTx, setCurrentTx] = useState([]);
  const [prevTx, setPrevTx] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [goalsList, setGoals] = useState([]);
  const [recurringItems, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState(null);
  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [allTx, budgets, goals, rec] = await Promise.all([
          txApi.getAll({ userId: effectiveUserId }),
          budgetsApi.getAll({ userId: effectiveUserId }),
          goalsApi.getAll({ userId: effectiveUserId }),
          recurringApi.getAll({ userId: effectiveUserId }),
        ]);
        const start = startOfMonth(month);
        const end = endOfMonth(month);
        const prevStart = startOfMonth(subMonths(month, 1));
        const prevEnd = endOfMonth(subMonths(month, 1));

        setCurrentTx(allTx.filter((tx) => { const d = new Date(tx.date); return d >= start && d <= end; }));
        setPrevTx(allTx.filter((tx) => { const d = new Date(tx.date); return d >= prevStart && d <= prevEnd; }));
        setBudgets(budgets);
        setGoals(goals);
        setRecurring(rec.filter((r) => r.active !== false));
        getCachedRates().then(setRates).catch(() => {});
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [month, effectiveUserId]);

  const income = sumAmountsMultiCurrency(currentTx.filter((tx) => tx.type === 'income'), currency, rates);
  const expenses = sumAmountsMultiCurrency(currentTx.filter((tx) => tx.type === 'expense'), currency, rates);
  const netSavings = income - expenses;
  const savingsRate = income > 0 ? percentOf(netSavings, income) : 0;
  const prevExpenses = sumAmountsMultiCurrency(prevTx.filter((tx) => tx.type === 'expense'), currency, rates);
  const trend = trendIndicator(expenses, prevExpenses);
  const recurringTotal = sumAmountsMultiCurrency(recurringItems, currency, rates);

  // Category breakdown (multi-currency aware)
  const categoryBreakdown = useMemo(() => {
    const exp = currentTx.filter((tx) => tx.type === 'expense');
    const grouped = groupBy(exp, 'category');
    return Object.entries(grouped)
      .map(([catId, txs]) => {
        const cat = getCategoryById(catId);
        const spent = sumAmountsMultiCurrency(txs, currency, rates);
        const budget = budgetsList.find((b) => b.category === catId);
        return { id: catId, name: t(`categories.${catId}`) || cat.name, icon: cat.icon, spent, budget: budget?.amount || 0, pct: budget ? percentOf(spent, budget.amount) : 0 };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [currentTx, budgetsList, currency, rates, t]);

  // Top merchants (multi-currency aware)
  const topMerchants = useMemo(() => {
    const exp = currentTx.filter((tx) => tx.type === 'expense');
    const grouped = groupBy(exp, (tx) => tx.merchant || 'Unknown');
    return Object.entries(grouped)
      .map(([merchant, txs]) => ({ merchant, total: sumAmountsMultiCurrency(txs, currency, rates) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [currentTx, currency, rates]);

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">{t('review.title')}</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">{t('review.income')}</p><p className="text-lg font-heading font-bold text-income money">{formatCurrency(income, currency)}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">{t('review.expenses')}</p><p className="text-lg font-heading font-bold text-danger money">{formatCurrency(expenses, currency)}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">{t('review.netSavings')}</p><p className={`text-lg font-heading font-bold money ${netSavings >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(netSavings, currency)}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">{t('review.savingsRate')}</p><p className={`text-lg font-heading font-bold ${savingsRate >= 0 ? 'text-success' : 'text-danger'}`}>{savingsRate}%</p></div>
      </div>

      {/* Comparison */}
      <div className="card">
        <h3 className="section-title">{t('review.vsPreviousMonth')}</h3>
        <p className="text-sm">
          {trend.direction === 'up' ? t('review.spendingIncreased') : trend.direction === 'down' ? t('review.spendingDecreased') : t('review.spendingSame')}
          {trend.percent > 0 && <span className={`font-medium ${trend.direction === 'up' ? 'text-danger' : 'text-success'}`}> {t('review.by')} {trend.percent}%</span>}
          {' '}{t('review.comparedToLastMonth')} ({formatCurrency(prevExpenses, currency)}).
        </p>
      </div>

      {/* Budget performance */}
      <div className="card">
        <h3 className="section-title">{t('review.budgetPerformance')}</h3>
        {categoryBreakdown.length > 0 ? (
          <div className="space-y-2">
            {categoryBreakdown.map((cat) => (
              <div key={cat.id} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  <span className="font-medium">{cat.name}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="money">{formatCurrency(cat.spent, currency)}</span>
                  {cat.budget > 0 && (
                    <span className={`text-xs ${cat.pct > 100 ? 'text-danger' : 'text-cream-400'}`}>
                      / {formatCurrency(cat.budget, currency)} ({cat.pct}%)
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-cream-500">{t('common.noData')}</p>}
      </div>

      {/* Top merchants */}
      <div className="card">
        <h3 className="section-title">{t('review.topMerchants')}</h3>
        {topMerchants.map((m, i) => (
          <div key={m.merchant} className="flex justify-between text-sm py-1">
            <span>{i + 1}. {m.merchant}</span>
            <span className="money font-medium">{formatCurrency(m.total, currency)}</span>
          </div>
        ))}
      </div>

      {/* Goals update */}
      {goalsList.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('review.goalProgress')}</h3>
          {goalsList.map((g) => (
            <div key={g.id} className="flex justify-between text-sm py-1">
              <span>{g.icon || '🎯'} {g.name}</span>
              <span className="money">{formatCurrency(g.currentAmount || 0, currency)} / {formatCurrency(g.targetAmount, currency)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recurring total */}
      <div className="card">
        <h3 className="section-title">{t('review.recurringExpenses')}</h3>
        <p className="text-sm">{t('review.recurringDesc', { count: recurringItems.length })} <span className="font-heading font-bold money">{formatCurrency(recurringTotal, currency)}</span>{t('review.perMonth')}</p>
      </div>

      <div className="card text-center py-6">
        <p className="text-xs text-cream-500">{t('review.transactionsThisMonth', { count: currentTx.length })}</p>
      </div>
    </div>
  );
}
