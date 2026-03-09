import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHideAmounts } from '../contexts/SettingsContext';
import { transactions as txApi, budgets as budgetsApi, goals as goalsApi, recurring as recurringApi, accounts as accountsApi } from '../lib/api';
import { formatCurrency, percentOf, sumBy, groupBy, trendIndicator, getDaysRemaining, formatDate, getCategoryById, sortByDate } from '../lib/helpers';
import StatCard from '../components/StatCard';
import BudgetBar from '../components/BudgetBar';
import TransactionRow from '../components/TransactionRow';
import MonthPicker from '../components/MonthPicker';
import EmptyState from '../components/EmptyState';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SyncIndicator from '../components/SyncIndicator';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PiggyBank, CalendarDays, Shield, ArrowRight, PlusCircle, Landmark, Eye, EyeOff } from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';

export default function Dashboard() {
  const { user } = useAuth();
  const { hideAmounts, updateHideAmounts, shouldHide } = useHideAmounts();
  const [month, setMonth] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [prevTransactions, setPrevTransactions] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [goalsList, setGoals] = useState([]);
  const [recurringList, setRecurring] = useState([]);
  const [accountsList, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Single master toggle for hiding all amounts
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    loadData();
  }, [month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allTx, budgets, goals, rec, accts] = await Promise.all([
        txApi.getAll({ userId: 'local' }),
        budgetsApi.getAll({ userId: 'local' }),
        goalsApi.getAll({ userId: 'local' }),
        recurringApi.getAll({ userId: 'local' }),
        accountsApi.getAll({ userId: 'local' }),
      ]);

      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const prevStart = startOfMonth(subMonths(month, 1));
      const prevEnd = endOfMonth(subMonths(month, 1));

      const monthTx = allTx.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });
      const prevTx = allTx.filter((t) => {
        const d = new Date(t.date);
        return d >= prevStart && d <= prevEnd;
      });

      setTransactions(monthTx);
      setPrevTransactions(prevTx);
      setBudgets(budgets);
      setGoals(goals);
      setRecurring(rec.filter((r) => r.active !== false));
      setAccounts(accts);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === 'expense');
    const income = transactions.filter((t) => t.type === 'income');
    const prevExpenses = prevTransactions.filter((t) => t.type === 'expense');
    const prevIncome = prevTransactions.filter((t) => t.type === 'income');

    const totalSpent = sumBy(expenses, 'amount');
    const totalIncome = sumBy(income, 'amount');
    const prevTotalSpent = sumBy(prevExpenses, 'amount');
    const net = totalIncome - totalSpent;
    const totalBudget = sumBy(budgetsList, 'amount');
    const budgetRemaining = totalBudget - totalSpent;
    const daysPassed = new Date().getDate();
    const dailyAvg = daysPassed > 0 ? totalSpent / daysPassed : 0;
    const netWorth = sumBy(accountsList, (a) =>
      ['credit_card', 'loan'].includes(a.type) ? -(a.balance || 0) : (a.balance || 0)
    );

    // "In My Pocket" — income minus budgeted minus upcoming bills
    const recurringTotal = sumBy(recurringList, 'amount');
    const inMyPocket = totalIncome - totalSpent - Math.max(0, recurringTotal - totalSpent);

    return {
      totalSpent, totalIncome, net, budgetRemaining, dailyAvg, netWorth, inMyPocket, totalBudget,
      spentTrend: trendIndicator(totalSpent, prevTotalSpent),
    };
  }, [transactions, prevTransactions, budgetsList, accountsList, recurringList]);

  // Chart data — cumulative spending per day
  const spendingChartData = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    const days = eachDayOfInterval({ start, end });
    const expenses = transactions.filter((t) => t.type === 'expense');

    let cumulative = 0;
    return days.map((day) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const daySpend = sumBy(expenses.filter((t) => t.date === dayStr), 'amount');
      cumulative += daySpend;
      return { date: format(day, 'dd'), daily: daySpend, cumulative };
    });
  }, [transactions, month]);

  // Category pie chart data
  const categoryData = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === 'expense');
    const grouped = groupBy(expenses, 'category');
    return Object.entries(grouped)
      .map(([catId, txs]) => {
        const cat = getCategoryById(catId);
        return { name: cat.name, value: sumBy(txs, 'amount'), color: cat.color, icon: cat.icon };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [transactions]);

  // Budget progress — sorted by most critical
  const budgetProgress = useMemo(() => {
    return budgetsList
      .map((b) => {
        const spent = sumBy(
          transactions.filter((t) => t.type === 'expense' && t.category === b.category),
          'amount'
        );
        return { ...b, spent, pct: percentOf(spent, b.amount) };
      })
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [budgetsList, transactions]);

  const recentTx = useMemo(() => sortByDate(transactions).slice(0, 6), [transactions]);

  const upcomingBills = useMemo(() => {
    const today = new Date().getDate();
    return recurringList
      .filter((r) => (r.billingDay || 1) >= today)
      .sort((a, b) => (a.billingDay || 1) - (b.billingDay || 1))
      .slice(0, 5);
  }, [recurringList]);

  if (loading) return <SkeletonPage />;

  const currency = user?.defaultCurrency || 'RON';

  // Show fewer recent transactions on mobile
  const recentTxMobile = recentTx.slice(0, 3);

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title mb-0">
            {user?.name ? `Hey, ${user.name.split(' ')[0]}` : 'Dashboard'}
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-cream-600 dark:text-cream-500">Here's your financial overview</p>
            <span className="md:hidden"><SyncIndicator mobile /></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHidden(!hidden)}
            className="p-2 rounded-xl hover:bg-cream-100 dark:hover:bg-cream-800 text-cream-400 hover:text-cream-600 dark:hover:text-cream-300 transition-all"
            title={hidden ? 'Show all amounts' : 'Hide all amounts'}
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
      </div>

      {/* Stat cards — horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible scrollbar-hide snap-x snap-mandatory">
        <StatCard label="Total Spent" value={formatCurrency(stats.totalSpent, currency)} trend={stats.spentTrend} icon={TrendingDown} accent="#e11d48" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label="Total Income" value={formatCurrency(stats.totalIncome, currency)} icon={TrendingUp} accent="#059669" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label="Net" value={formatCurrency(stats.net, currency)} icon={DollarSign} accent="#6366f1" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label="Budget Left" value={formatCurrency(Math.max(0, stats.budgetRemaining), currency)} icon={PiggyBank} accent="#d97706" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label="Daily Avg" value={formatCurrency(stats.dailyAvg, currency)} icon={CalendarDays} accent="#0ea5e9" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label="Net Worth" value={formatCurrency(stats.netWorth, currency)} icon={Landmark} accent="#6366f1" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
      </div>

      {/* In My Pocket — compact on mobile */}
      <div className="card relative overflow-hidden border-success/20 !p-3 md:!p-5">
        <div className="absolute inset-0 bg-gradient-to-r from-success/5 to-transparent dark:from-success/8" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] md:text-[11px] font-bold text-success uppercase tracking-wider">In My Pocket</p>
            <p className="text-xs md:text-sm text-cream-500 dark:text-cream-400 mt-0.5">Safe to spend after bills</p>
          </div>
          <p className="text-2xl md:text-3xl font-heading font-bold text-success money">
            {hidden ? '••••••' : formatCurrency(Math.max(0, stats.inMyPocket), currency)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Spending trend chart — shorter on mobile */}
        <div className="card !p-3 md:!p-5">
          <h3 className="section-title">Spending trend</h3>
          {spendingChartData.length > 0 ? (
            <div className="h-[140px] md:h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={spendingChartData}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#e11d48" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.08)', fontSize: '12px' }}
                    formatter={(val) => [hidden ? '••••••' : formatCurrency(val, currency), '']}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke={hidden ? 'transparent' : '#e11d48'} fill={hidden ? 'transparent' : 'url(#spendGrad)'} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-cream-500 text-center py-6">No spending data this month</p>
          )}
        </div>

        {/* Category breakdown — compact pie on mobile */}
        <div className="card !p-3 md:!p-5">
          <h3 className="section-title">By category</h3>
          {categoryData.length > 0 ? (
            <div className="flex items-center gap-3 md:gap-4">
              <div className="w-[110px] h-[110px] md:w-[140px] md:h-[140px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" innerRadius="55%" outerRadius="90%" paddingAngle={2} stroke="none">
                      {categoryData.map((d, i) => <Cell key={i} fill={hidden ? '#e7e5e4' : d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 space-y-1.5">
                {categoryData.slice(0, 5).map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hidden ? '#e7e5e4' : d.color }} />
                      {d.name}
                    </span>
                    <span className="font-medium money">{hidden ? '••••••' : formatCurrency(d.value, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-cream-500 text-center py-6">No data yet</p>
          )}
        </div>
      </div>

      {/* Budget progress — show top 3 on mobile */}
      {budgetProgress.length > 0 && (
        <div className="card !p-3 md:!p-5">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="section-title mb-0">Budget progress</h3>
            <Link to="/budgets" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          <div className="space-y-2.5 md:space-y-3">
            {budgetProgress.map((b, idx) => (
              <div key={b.id} className={idx >= 3 ? 'hidden md:block' : ''}>
                <BudgetBar category={b.category} spent={b.spent} budgeted={b.amount} currency={b.currency || currency} compact hide={hidden} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Goals & Bills — hide empty sections on mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Goals preview — hidden on mobile if empty */}
        <div className={`card !p-3 md:!p-5 ${goalsList.length === 0 ? 'hidden md:block' : ''}`}>
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="section-title mb-0">Savings goals</h3>
            <Link to="/goals" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {goalsList.length > 0 ? (
            <div className="space-y-3">
              {goalsList.slice(0, 3).map((g) => {
                const pct = percentOf(g.currentAmount || 0, g.targetAmount);
                return (
                  <div key={g.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{g.icon || '🎯'} {g.name}</span>
                      <span className="text-cream-500">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                      <div className="h-full bg-success rounded-full transition-all" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: g.color || '#059669' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-cream-500 text-center py-6">No goals yet</p>
          )}
        </div>

        {/* Upcoming bills — hidden on mobile if empty */}
        <div className={`card !p-3 md:!p-5 ${upcomingBills.length === 0 ? 'hidden md:block' : ''}`}>
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="section-title mb-0">Upcoming bills</h3>
            <Link to="/recurring" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
              View all <ArrowRight size={12} />
            </Link>
          </div>
          {upcomingBills.length > 0 ? (
            <div className="space-y-2">
              {upcomingBills.map((r) => {
                const cat = getCategoryById(r.category);
                return (
                  <div key={r.id} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span>{cat.icon}</span>
                      <span>{r.name}</span>
                      <span className="text-xs text-cream-400">Day {r.billingDay}</span>
                    </span>
                    <span className="font-heading font-bold money">{hidden ? '••••••' : formatCurrency(r.amount, r.currency || currency)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-cream-500 text-center py-6">No upcoming bills</p>
          )}
        </div>
      </div>

      {/* Recent transactions — 3 on mobile, 6 on desktop */}
      <div className="card !p-3 md:!p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title mb-0">Recent transactions</h3>
          <Link to="/transactions" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
            View all <ArrowRight size={12} />
          </Link>
        </div>
        {recentTx.length > 0 ? (
          <>
            {/* Mobile: show 3 */}
            <div className="divide-y divide-cream-100 dark:divide-dark-border md:hidden">
              {recentTxMobile.map((tx) => <TransactionRow key={tx.id} transaction={tx} hide={hidden} />)}
            </div>
            {/* Desktop: show all 6 */}
            <div className="divide-y divide-cream-100 dark:divide-dark-border hidden md:block">
              {recentTx.map((tx) => <TransactionRow key={tx.id} transaction={tx} hide={hidden} />)}
            </div>
          </>
        ) : (
          <EmptyState
            icon={PlusCircle}
            title="No transactions yet"
            description="Add your first transaction to start tracking"
            action="Add transaction"
            onAction={() => window.location.href = '/add'}
          />
        )}
      </div>
    </div>
  );
}
