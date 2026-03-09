import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, budgets as budgetsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, sumBy, groupBy, getCategoryById, percentOf } from '../lib/helpers';
import { generateInsights } from '../lib/smartFeatures';
import MonthPicker from '../components/MonthPicker';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, Lightbulb } from 'lucide-react';
import { startOfMonth, endOfMonth, format, eachDayOfInterval } from 'date-fns';

export default function Analytics() {
  const { user } = useAuth();
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
          txApi.getAll({ userId: 'local' }),
          budgetsApi.getAll({ userId: 'local' }),
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

  // Summary stats
  const totalSpent = sumBy(expenses, 'amount');
  const totalIncome = sumBy(monthTx.filter((t) => t.type === 'income'), 'amount');
  const dailyAvg = new Date().getDate() > 0 ? totalSpent / Math.min(new Date().getDate(), 30) : 0;
  const daysLeft = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() - new Date().getDate();
  const projected = totalSpent + dailyAvg * Math.max(daysLeft, 0);
  const totalBudget = sumBy(budgetsList, 'amount');

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
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ede8de" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
              <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
              <Bar dataKey="spent" fill="#d44f4f" radius={[0, 4, 4, 0]} name="Spent" />
              <Bar dataKey="budget" fill="#ede8de" radius={[0, 4, 4, 0]} name="Budget" />
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
            <Bar dataKey="total" fill="#c9773c" radius={[3, 3, 0, 0]} />
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
    </div>
  );
}
