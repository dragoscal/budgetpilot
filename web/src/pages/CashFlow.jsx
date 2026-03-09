import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, sumBy, groupBy, getCategoryById, percentOf } from '../lib/helpers';
import StatCard from '../components/StatCard';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';

export default function CashFlow() {
  const { user } = useAuth();
  const [allTx, setAllTx] = useState([]);
  const [recurringItems, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [tx, rec] = await Promise.all([
          txApi.getAll({ userId: 'local' }),
          recurringApi.getAll({ userId: 'local' }),
        ]);
        setAllTx(tx);
        setRecurring(rec.filter((r) => r.active !== false));
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, []);

  // Current month stats
  const now = new Date();
  const currentMonthTx = useMemo(() => {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; });
  }, [allTx]);

  const monthIncome = sumBy(currentMonthTx.filter((t) => t.type === 'income'), 'amount');
  const monthExpenses = sumBy(currentMonthTx.filter((t) => t.type === 'expense'), 'amount');
  const netCashFlow = monthIncome - monthExpenses;
  const savingsRate = monthIncome > 0 ? percentOf(netCashFlow, monthIncome) : 0;

  // 6-month chart data
  const chartData = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(now, i);
      const start = startOfMonth(m);
      const end = endOfMonth(m);
      const monthTx = allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; });
      const income = sumBy(monthTx.filter((t) => t.type === 'income'), 'amount');
      const expenses = sumBy(monthTx.filter((t) => t.type === 'expense'), 'amount');
      months.push({ month: format(m, 'MMM'), income, expenses, net: income - expenses });
    }
    return months;
  }, [allTx]);

  // Category breakdown
  const expenseByCategory = useMemo(() => {
    const expenses = currentMonthTx.filter((t) => t.type === 'expense');
    const grouped = groupBy(expenses, 'category');
    return Object.entries(grouped)
      .map(([catId, txs]) => ({ ...getCategoryById(catId), total: sumBy(txs, 'amount') }))
      .sort((a, b) => b.total - a.total);
  }, [currentMonthTx]);

  // Income sources
  const incomeSources = useMemo(() => {
    const income = currentMonthTx.filter((t) => t.type === 'income');
    const grouped = groupBy(income, (t) => t.merchant || t.description || 'Other');
    return Object.entries(grouped)
      .map(([source, txs]) => ({ source, total: sumBy(txs, 'amount') }))
      .sort((a, b) => b.total - a.total);
  }, [currentMonthTx]);

  // Forecast
  const recurringIncome = sumBy(recurringItems.filter((r) => r.category === 'income'), 'amount');
  const recurringExpenses = sumBy(recurringItems.filter((r) => r.category !== 'income'), 'amount');

  return (
    <div className="space-y-6">
      <h1 className="page-title">Cash Flow</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Monthly Income" value={formatCurrency(monthIncome, currency)} icon={TrendingUp} />
        <StatCard label="Monthly Expenses" value={formatCurrency(monthExpenses, currency)} icon={TrendingDown} />
        <StatCard label="Net Cash Flow" value={formatCurrency(netCashFlow, currency)} icon={DollarSign} />
      </div>

      <div className="card">
        <h3 className="section-title">Savings rate</h3>
        <div className="flex items-end gap-3">
          <span className={`text-4xl font-heading font-bold ${savingsRate >= 0 ? 'text-success' : 'text-danger'}`}>{savingsRate}%</span>
          <span className="text-sm text-cream-500 mb-1">of income saved</span>
        </div>
      </div>

      {/* 6-month chart */}
      <div className="card">
        <h3 className="section-title">Income vs Expenses (6 months)</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e7e5e4)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
            <Bar dataKey="income" fill="#059669" radius={[4, 4, 0, 0]} name="Income" />
            <Bar dataKey="expenses" fill="#e11d48" radius={[4, 4, 0, 0]} name="Expenses" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Net cash flow trend */}
      <div className="card">
        <h3 className="section-title">Net cash flow trend</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
            <Line type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Net" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income breakdown */}
        <div className="card">
          <h3 className="section-title">Income sources</h3>
          {incomeSources.length > 0 ? (
            <div className="space-y-2">
              {incomeSources.map((s) => (
                <div key={s.source} className="flex justify-between text-sm">
                  <span>{s.source}</span>
                  <span className="money font-medium text-income">{formatCurrency(s.total, currency)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-cream-500">No income this month</p>}
        </div>

        {/* Expense breakdown */}
        <div className="card">
          <h3 className="section-title">Expenses by category</h3>
          {expenseByCategory.length > 0 ? (
            <div className="space-y-2">
              {expenseByCategory.slice(0, 8).map((c) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <span>{c.icon} {c.name}</span>
                  <span className="money font-medium">{formatCurrency(c.total, currency)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-cream-500">No expenses this month</p>}
        </div>
      </div>

      {/* Projection */}
      <div className="card">
        <h3 className="section-title">Next month projection</h3>
        <p className="text-sm text-cream-600 dark:text-cream-400">
          Based on recurring items: est. income {formatCurrency(recurringIncome, currency)}, est. expenses {formatCurrency(recurringExpenses, currency)}, est. net {formatCurrency(recurringIncome - recurringExpenses, currency)}.
        </p>
      </div>
    </div>
  );
}
