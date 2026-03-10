import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, budgets as budgetsApi, goals as goalsApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, sumBy, groupBy, getCategoryById, percentOf, trendIndicator } from '../lib/helpers';
import MonthPicker from '../components/MonthPicker';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { FileText } from 'lucide-react';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { startOfMonth, endOfMonth, subMonths } from 'date-fns';

export default function MonthlyReview() {
  const { user, effectiveUserId } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [currentTx, setCurrentTx] = useState([]);
  const [prevTx, setPrevTx] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [goalsList, setGoals] = useState([]);
  const [recurringItems, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
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

        setCurrentTx(allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; }));
        setPrevTx(allTx.filter((t) => { const d = new Date(t.date); return d >= prevStart && d <= prevEnd; }));
        setBudgets(budgets);
        setGoals(goals);
        setRecurring(rec.filter((r) => r.active !== false));
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [month]);

  const income = sumBy(currentTx.filter((t) => t.type === 'income'), 'amount');
  const expenses = sumBy(currentTx.filter((t) => t.type === 'expense'), 'amount');
  const netSavings = income - expenses;
  const savingsRate = income > 0 ? percentOf(netSavings, income) : 0;
  const prevExpenses = sumBy(prevTx.filter((t) => t.type === 'expense'), 'amount');
  const trend = trendIndicator(expenses, prevExpenses);
  const recurringTotal = sumBy(recurringItems, 'amount');

  // Category breakdown
  const categoryBreakdown = useMemo(() => {
    const exp = currentTx.filter((t) => t.type === 'expense');
    const grouped = groupBy(exp, 'category');
    return Object.entries(grouped)
      .map(([catId, txs]) => {
        const cat = getCategoryById(catId);
        const spent = sumBy(txs, 'amount');
        const budget = budgetsList.find((b) => b.category === catId);
        return { name: cat.name, icon: cat.icon, spent, budget: budget?.amount || 0, pct: budget ? percentOf(spent, budget.amount) : 0 };
      })
      .sort((a, b) => b.spent - a.spent);
  }, [currentTx, budgetsList]);

  // Top merchants
  const topMerchants = useMemo(() => {
    const exp = currentTx.filter((t) => t.type === 'expense');
    const grouped = groupBy(exp, (t) => t.merchant || 'Unknown');
    return Object.entries(grouped)
      .map(([merchant, txs]) => ({ merchant, total: sumBy(txs, 'amount') }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [currentTx]);

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Monthly Review</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">Income</p><p className="text-lg font-heading font-bold text-income money">{formatCurrency(income, currency)}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">Expenses</p><p className="text-lg font-heading font-bold text-danger money">{formatCurrency(expenses, currency)}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">Net Savings</p><p className={`text-lg font-heading font-bold money ${netSavings >= 0 ? 'text-success' : 'text-danger'}`}>{formatCurrency(netSavings, currency)}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">Savings Rate</p><p className={`text-lg font-heading font-bold ${savingsRate >= 0 ? 'text-success' : 'text-danger'}`}>{savingsRate}%</p></div>
      </div>

      {/* Comparison */}
      <div className="card">
        <h3 className="section-title">vs Previous month</h3>
        <p className="text-sm">
          Spending {trend.direction === 'up' ? 'increased' : trend.direction === 'down' ? 'decreased' : 'stayed the same'}
          {trend.percent > 0 && <span className={`font-medium ${trend.direction === 'up' ? 'text-danger' : 'text-success'}`}> by {trend.percent}%</span>}
          {' '}compared to last month ({formatCurrency(prevExpenses, currency)}).
        </p>
      </div>

      {/* Budget performance */}
      <div className="card">
        <h3 className="section-title">Budget performance</h3>
        {categoryBreakdown.length > 0 ? (
          <div className="space-y-2">
            {categoryBreakdown.map((cat) => (
              <div key={cat.name} className="flex items-center justify-between text-sm">
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
        ) : <p className="text-sm text-cream-500">No data</p>}
      </div>

      {/* Top merchants */}
      <div className="card">
        <h3 className="section-title">Top merchants</h3>
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
          <h3 className="section-title">Goal progress</h3>
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
        <h3 className="section-title">Recurring expenses</h3>
        <p className="text-sm">{recurringItems.length} active subscriptions/bills totaling <span className="font-heading font-bold money">{formatCurrency(recurringTotal, currency)}</span>/month.</p>
      </div>

      <div className="card text-center py-6">
        <p className="text-xs text-cream-500">{currentTx.length} transactions this month</p>
      </div>
    </div>
  );
}
