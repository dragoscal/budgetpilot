import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, budgets as budgetsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, sumBy, groupBy, getCategoryById, percentOf } from '../lib/helpers';
import { generateInsights } from '../lib/smartFeatures';
import MonthPicker from '../components/MonthPicker';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, Lightbulb, Hash } from 'lucide-react';
import { getTagStats } from '../lib/tagHelpers';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { startOfMonth, endOfMonth, format, eachDayOfInterval } from 'date-fns';

export default function Analytics() {
  const { user, effectiveUserId } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [allTx, setAllTx] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState([]);
  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [tx, budgets] = await Promise.all([
          txApi.getAll({ userId: effectiveUserId }),
          budgetsApi.getAll({ userId: effectiveUserId }),
        ]);
        setAllTx(tx);
        setBudgets(budgets);
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  const monthTx = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    return allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; });
  }, [allTx, month]);

  // Generate smart insights
  useEffect(() => {
    if (monthTx.length > 0) {
      generateInsights(monthTx).then(setInsights).catch(() => {});
    } else {
      setInsights([]);
    }
  }, [monthTx]);

  const expenses = monthTx.filter((t) => t.type === 'expense');

  // Category vs budget
  const categoryBudgetData = useMemo(() => {
    const byCategory = groupBy(expenses, 'category');
    const categories = [...new Set([...Object.keys(byCategory), ...budgetsList.map((b) => b.category)])];
    return categories.map((catId) => {
      const cat = getCategoryById(catId);
      const spent = sumBy(byCategory[catId] || [], 'amount');
      const budget = budgetsList.find((b) => b.category === catId);
      return { name: cat.name, spent, budget: budget?.amount || 0, icon: cat.icon, color: cat.color };
    }).filter((d) => d.spent > 0 || d.budget > 0).sort((a, b) => b.spent - a.spent).slice(0, 10);
  }, [expenses, budgetsList]);

  // Daily spending
  const dailySpending = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    return days.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const total = sumBy(expenses.filter((t) => t.date === key), 'amount');
      return { date: format(day, 'dd'), total };
    });
  }, [expenses, month]);

  // Top merchants
  const topMerchants = useMemo(() => {
    const grouped = groupBy(expenses, (t) => t.merchant || 'Unknown');
    return Object.entries(grouped)
      .map(([merchant, txs]) => ({ merchant, total: sumBy(txs, 'amount'), count: txs.length }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [expenses]);

  // Tag stats
  const tagStats = useMemo(() => getTagStats(expenses), [expenses]);

  // Summary stats
  const totalSpent = sumBy(expenses, 'amount');
  const totalIncome = sumBy(monthTx.filter((t) => t.type === 'income'), 'amount');
  const dailyAvg = new Date().getDate() > 0 ? totalSpent / Math.min(new Date().getDate(), 30) : 0;
  const daysLeft = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() - new Date().getDate();
  const projected = totalSpent + dailyAvg * Math.max(daysLeft, 0);
  const totalBudget = sumBy(budgetsList, 'amount');

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Analytics</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Smart summary */}
      <div className="card">
        <h3 className="section-title">Smart summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-cream-500 text-xs">Transactions</p><p className="font-heading font-bold text-lg">{monthTx.length}</p></div>
          <div><p className="text-cream-500 text-xs">Total spent</p><p className="font-heading font-bold text-lg money">{formatCurrency(totalSpent, currency)}</p></div>
          <div><p className="text-cream-500 text-xs">Daily avg</p><p className="font-heading font-bold text-lg money">{formatCurrency(dailyAvg, currency)}</p></div>
          <div><p className="text-cream-500 text-xs">Projected total</p><p className="font-heading font-bold text-lg money">{formatCurrency(projected, currency)}</p></div>
        </div>
        {totalBudget > 0 && (
          <p className="text-xs text-cream-500 mt-3">
            {projected > totalBudget
              ? `At this pace, you'll be ${formatCurrency(projected - totalBudget, currency)} over budget.`
              : `On track — projected ${formatCurrency(totalBudget - projected, currency)} under budget.`}
          </p>
        )}
        {daysLeft > 0 && totalBudget > totalSpent && (
          <p className="text-xs text-success mt-1">
            Safe to spend: {formatCurrency((totalBudget - totalSpent) / daysLeft, currency)}/day
          </p>
        )}
      </div>

      {/* Category vs budget */}
      <div className="card">
        <h3 className="section-title">Category spending vs budget</h3>
        {categoryBudgetData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryBudgetData} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e5e4" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
              <Bar dataKey="spent" fill="#e11d48" radius={[0, 4, 4, 0]} name="Spent" />
              <Bar dataKey="budget" fill="#e7e5e4" radius={[0, 4, 4, 0]} name="Budget" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">No data</p>}
      </div>

      {/* Daily spending pattern */}
      <div className="card">
        <h3 className="section-title">Daily spending</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dailySpending}>
            <XAxis dataKey="date" tick={{ fontSize: 9 }} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
            <Bar dataKey="total" fill="#d97706" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Smart Insights */}
      {insights.length > 0 && (
        <div className="card border-info/20 bg-info-light/20">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={16} className="text-info" />
            <h3 className="section-title mb-0">Smart insights</h3>
          </div>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span>{insight.icon}</span>
                <div>
                  <p className="font-medium text-xs">{insight.title}</p>
                  <p className="text-xs text-cream-600 dark:text-cream-400">{insight.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top merchants */}
      <div className="card">
        <h3 className="section-title">Top merchants</h3>
        {topMerchants.length > 0 ? (
          <div className="space-y-2">
            {topMerchants.map((m, i) => (
              <div key={m.merchant} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-cream-400 w-5">{i + 1}.</span>
                  <span className="font-medium">{m.merchant}</span>
                  <span className="text-xs text-cream-400">({m.count}x)</span>
                </span>
                <span className="money font-medium">{formatCurrency(m.total, currency)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-cream-500">No data</p>}
      </div>

      {/* Spending by tag */}
      {tagStats.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Hash size={16} className="text-accent" />
            <h3 className="section-title mb-0">Spending by tag</h3>
          </div>
          <div className="space-y-2">
            {tagStats.slice(0, 10).map((t, i) => {
              const pct = totalSpent > 0 ? (t.total / totalSpent) * 100 : 0;
              return (
                <div key={t.tag} className="flex items-center gap-3">
                  <span className="text-xs text-cream-400 w-5">{i + 1}.</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300 text-xs font-medium">
                    <Hash size={10} className="opacity-60" />{t.tag}
                  </span>
                  <div className="flex-1 h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="text-right min-w-[80px]">
                    <span className="text-sm money font-medium">{formatCurrency(t.total, currency)}</span>
                    <span className="text-[10px] text-cream-400 ml-1">({t.count}x)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
