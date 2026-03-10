import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useHideAmounts } from '../contexts/SettingsContext';
import { useTranslation } from '../contexts/LanguageContext';
import { transactions as txApi, budgets as budgetsApi, goals as goalsApi, recurring as recurringApi, accounts as accountsApi } from '../lib/api';
import { formatCurrency, percentOf, sumBy, sumAmountsMultiCurrency, groupBy, trendIndicator, getDaysRemaining, formatDate, getCategoryById, sortByDate } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import StatCard from '../components/StatCard';
import BudgetBar from '../components/BudgetBar';
import TransactionRow from '../components/TransactionRow';
import MonthPicker from '../components/MonthPicker';
import EmptyState from '../components/EmptyState';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import SyncIndicator from '../components/SyncIndicator';
import { Wallet, TrendingUp, TrendingDown, DollarSign, PiggyBank, CalendarDays, Shield, ArrowRight, PlusCircle, Landmark, Eye, EyeOff, Camera, Zap, RotateCcw, AlertTriangle, Bell, Flame, X } from 'lucide-react';
import { format, eachDayOfInterval, startOfMonth, endOfMonth, subMonths, parseISO } from 'date-fns';


export default function Dashboard() {
  const navigate = useNavigate();
  const { user, effectiveUserId } = useAuth();
  const { hideAmounts, updateHideAmounts, shouldHide } = useHideAmounts();
  const { t } = useTranslation();
  const [month, setMonth] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [prevTransactions, setPrevTransactions] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [goalsList, setGoals] = useState([]);
  const [recurringList, setRecurring] = useState([]);
  const [accountsList, setAccounts] = useState([]);
  const [rates, setRates] = useState(null);
  const [loading, setLoading] = useState(true);

  // Single master toggle for hiding all amounts
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    loadData();
  }, [month, effectiveUserId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allTx, budgets, goals, rec, accts, ratesData] = await Promise.all([
        txApi.getAll({ userId: effectiveUserId }),
        budgetsApi.getAll({ userId: effectiveUserId }),
        goalsApi.getAll({ userId: effectiveUserId }),
        recurringApi.getAll({ userId: effectiveUserId }),
        accountsApi.getAll({ userId: effectiveUserId }),
        getCachedRates(),
      ]);
      setRates(ratesData);

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
    const currency = user?.defaultCurrency || 'RON';
    const expenses = transactions.filter((t) => t.type === 'expense');
    const income = transactions.filter((t) => t.type === 'income');
    const prevExpenses = prevTransactions.filter((t) => t.type === 'expense');

    const totalSpent = sumAmountsMultiCurrency(expenses, currency, rates);
    const totalIncome = sumAmountsMultiCurrency(income, currency, rates);
    const prevTotalSpent = sumAmountsMultiCurrency(prevExpenses, currency, rates);
    const net = totalIncome - totalSpent;
    const totalBudget = sumBy(budgetsList, 'amount');
    const budgetRemaining = totalBudget - totalSpent;
    const now = new Date();
    const selYear = month.getFullYear();
    const selMonth = month.getMonth() + 1;
    const isCurrentMonth = selYear === now.getFullYear() && selMonth === now.getMonth() + 1;
    const daysPassed = isCurrentMonth
      ? now.getDate()
      : new Date(selYear, selMonth, 0).getDate(); // total days in that month
    const dailyAvg = daysPassed > 0 ? totalSpent / daysPassed : 0;
    const netWorth = sumBy(accountsList, (a) =>
      ['credit_card', 'loan'].includes(a.type) ? -(a.balance || 0) : (a.balance || 0)
    );

    // "In My Pocket" — income minus budgeted minus upcoming bills
    const recurringTotal = sumAmountsMultiCurrency(recurringList, currency, rates);
    const inMyPocket = totalIncome - totalSpent - Math.max(0, recurringTotal - totalSpent);

    return {
      totalSpent, totalIncome, net, budgetRemaining, dailyAvg, netWorth, inMyPocket, totalBudget,
      prevTotalSpent,
      spentTrend: trendIndicator(totalSpent, prevTotalSpent),
    };
  }, [transactions, prevTransactions, budgetsList, accountsList, recurringList, rates, user]);

  // Spending velocity: compare current pace to last month
  const velocity = useMemo(() => {
    const now = new Date();
    const daysElapsed = now.getDate();
    const daysInPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0).getDate();

    const currentDailyRate = daysElapsed > 0 ? stats.totalSpent / daysElapsed : 0;
    const prevDailyRate = daysInPrevMonth > 0 ? stats.prevTotalSpent / daysInPrevMonth : 0;

    if (prevDailyRate === 0) return null;
    const change = Math.round(((currentDailyRate - prevDailyRate) / prevDailyRate) * 100);
    return { change, faster: change > 0 };
  }, [stats.totalSpent, stats.prevTotalSpent]);

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

  // Smart alerts
  const smartAlerts = useMemo(() => {
    const alerts = [];

    // Budget alerts
    budgetProgress.forEach((b) => {
      if (b.pct >= 100) {
        alerts.push({ type: 'danger', icon: AlertTriangle, text: t('dashboard.budgetExceeded', { name: t(`categories.${b.category}`), pct: b.pct }), link: '/budgets' });
      } else if (b.pct >= 80) {
        alerts.push({ type: 'warning', icon: AlertTriangle, text: t('dashboard.budgetAt', { name: t(`categories.${b.category}`), pct: b.pct }), link: '/budgets' });
      }
    });

    // Upcoming bill in next 2 days
    const today = new Date().getDate();
    recurringList.forEach((r) => {
      const billingDay = r.billingDay || 1;
      const daysUntil = billingDay >= today ? billingDay - today : 30 - today + billingDay;
      if (daysUntil <= 2 && daysUntil >= 0) {
        const text = daysUntil === 0 ? t('dashboard.dueToday', { name: r.name }) : daysUntil === 1 ? t('dashboard.dueTomorrow', { name: r.name }) : t('dashboard.dueIn2Days', { name: r.name });
        alerts.push({ type: 'info', icon: Bell, text, link: '/recurring' });
      }
    });

    // Month-over-month spending comparison (at same point in month)
    if (stats.totalSpent > 0 && prevTransactions.length > 0) {
      const prevExpenses = prevTransactions.filter((tx) => tx.type === 'expense');
      const dayOfMonth = new Date().getDate();
      const prevAtThisPoint = sumBy(
        prevExpenses.filter((tx) => new Date(tx.date).getDate() <= dayOfMonth),
        'amount'
      );
      if (prevAtThisPoint > 0) {
        const diff = ((stats.totalSpent - prevAtThisPoint) / prevAtThisPoint) * 100;
        if (diff > 30) {
          alerts.push({ type: 'warning', icon: TrendingUp, text: t('dashboard.spendingHigher', { pct: Math.round(diff) }) });
        }
      }
    }

    return alerts.slice(0, 3);
  }, [budgetProgress, recurringList, stats, prevTransactions, t]);

  // No-spend days count
  const noSpendDays = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === 'expense');
    const spendDates = new Set(expenses.map((t) => t.date));
    const start = startOfMonth(month);
    const today = new Date();
    const end = today < endOfMonth(month) ? today : endOfMonth(month);
    const days = eachDayOfInterval({ start, end });
    return days.filter((d) => !spendDates.has(format(d, 'yyyy-MM-dd'))).length;
  }, [transactions, month]);

  // Month comparison text
  const monthComparison = useMemo(() => {
    if (prevTransactions.length === 0 || stats.totalSpent === 0) return null;
    const prevExpenses = prevTransactions.filter((t) => t.type === 'expense');
    const dayOfMonth = new Date().getDate();
    const prevAtThisPoint = sumBy(
      prevExpenses.filter((t) => new Date(t.date).getDate() <= dayOfMonth),
      'amount'
    );
    if (prevAtThisPoint === 0) return null;
    const diff = ((stats.totalSpent - prevAtThisPoint) / prevAtThisPoint) * 100;
    return {
      pct: Math.abs(Math.round(diff)),
      direction: diff > 0 ? 'more' : 'less',
      isGood: diff <= 0,
    };
  }, [stats, prevTransactions]);

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
            {user?.name ? t('dashboard.hey', { name: user.name.split(' ')[0] }) : t('dashboard.title')}
          </h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-cream-600 dark:text-cream-500">{t('dashboard.financialOverview')}</p>
            <span className="md:hidden"><SyncIndicator mobile /></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHidden(!hidden)}
            className="p-2 rounded-xl hover:bg-cream-100 dark:hover:bg-cream-800 text-cream-400 hover:text-cream-600 dark:hover:text-cream-300 transition-all"
            title={hidden ? t('dashboard.showAmounts') : t('dashboard.hideAmounts')}
          >
            {hidden ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
          <MonthPicker value={month} onChange={setMonth} />
        </div>
      </div>

      {/* Smart Alerts */}
      {smartAlerts.length > 0 && (
        <div className="space-y-2">
          {smartAlerts.map((alert, i) => (
            <Link
              key={i}
              to={alert.link || '#'}
              className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                alert.type === 'danger' ? 'bg-danger/8 text-danger border border-danger/15 hover:bg-danger/12' :
                alert.type === 'warning' ? 'bg-warning/8 text-warning border border-warning/15 hover:bg-warning/12' :
                'bg-info/8 text-info border border-info/15 hover:bg-info/12'
              }`}
            >
              <alert.icon size={14} className="shrink-0" />
              <span className="flex-1">{alert.text}</span>
              <ArrowRight size={12} className="shrink-0 opacity-50" />
            </Link>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide">
        <Link to="/add?tab=quick" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 text-sm font-medium whitespace-nowrap hover:bg-accent-100 dark:hover:bg-accent-500/15 transition-colors shrink-0">
          <Zap size={16} /> {t('dashboard.quickAdd')}
        </Link>
        <Link to="/add?tab=receipt" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream-100 dark:bg-dark-border text-cream-700 dark:text-cream-400 text-sm font-medium whitespace-nowrap hover:bg-cream-200 dark:hover:bg-cream-700 transition-colors shrink-0">
          <Camera size={16} /> {t('dashboard.scanReceipt')}
        </Link>
        <Link to="/recurring" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream-100 dark:bg-dark-border text-cream-700 dark:text-cream-400 text-sm font-medium whitespace-nowrap hover:bg-cream-200 dark:hover:bg-cream-700 transition-colors shrink-0">
          <RotateCcw size={16} /> {t('dashboard.recurring')}
        </Link>
        <Link to="/analytics" className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-cream-100 dark:bg-dark-border text-cream-700 dark:text-cream-400 text-sm font-medium whitespace-nowrap hover:bg-cream-200 dark:hover:bg-cream-700 transition-colors shrink-0">
          <TrendingUp size={16} /> {t('dashboard.analytics')}
        </Link>
      </div>

      {/* Stat cards — horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 md:grid md:grid-cols-3 md:gap-3 md:overflow-visible scrollbar-hide snap-x snap-mandatory">
        <StatCard label={t('dashboard.totalSpent')} value={formatCurrency(stats.totalSpent, currency)} trend={stats.spentTrend} icon={TrendingDown} accent="#e11d48" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label={t('dashboard.totalIncome')} value={formatCurrency(stats.totalIncome, currency)} icon={TrendingUp} accent="#059669" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label={t('dashboard.net')} value={formatCurrency(stats.net, currency)} icon={DollarSign} accent="#6366f1" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label={t('dashboard.budgetLeft')} value={formatCurrency(Math.max(0, stats.budgetRemaining), currency)} icon={PiggyBank} accent="#d97706" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label={t('dashboard.dailyAvg')} value={formatCurrency(stats.dailyAvg, currency)} icon={CalendarDays} accent="#0ea5e9" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
        <StatCard label={t('dashboard.netWorth')} value={formatCurrency(stats.netWorth, currency)} icon={Landmark} accent="#6366f1" hide={hidden} compact className="min-w-[140px] shrink-0 md:min-w-0 md:shrink snap-start" />
      </div>

      {/* Spending velocity indicator */}
      {velocity && Math.abs(velocity.change) > 5 && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium ${
          velocity.faster
            ? 'bg-warning/10 text-warning border border-warning/20'
            : 'bg-success/10 text-success border border-success/20'
        }`}>
          {velocity.faster ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          {t('dashboard.spendingVelocity', { pct: Math.abs(velocity.change), direction: velocity.faster ? t('dashboard.faster') : t('dashboard.slower') })}
        </div>
      )}

      {/* In My Pocket + Month Comparison + No-spend days */}
      <div className="card relative overflow-hidden border-success/20 !p-3 md:!p-5">
        <div className="absolute inset-0 bg-gradient-to-r from-success/5 to-transparent dark:from-success/8" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[10px] md:text-[11px] font-bold text-success uppercase tracking-wider">{t('dashboard.inMyPocket')}</p>
            <p className="text-xs md:text-sm text-cream-500 dark:text-cream-400 mt-0.5">{t('dashboard.safeToSpend')}</p>
          </div>
          <p className="text-2xl md:text-3xl font-heading font-bold text-success money">
            {hidden ? '••••••' : formatCurrency(Math.max(0, stats.inMyPocket), currency)}
          </p>
        </div>
        {/* Month comparison + No-spend days */}
        <div className="relative flex items-center gap-3 mt-2 pt-2 border-t border-success/10">
          {monthComparison && (
            <span className={`flex items-center gap-1 text-[11px] font-medium ${monthComparison.isGood ? 'text-success' : 'text-warning'}`}>
              {monthComparison.isGood ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
              {t(monthComparison.isGood ? 'dashboard.lessLastMonth' : 'dashboard.moreLastMonth', { pct: monthComparison.pct })}
            </span>
          )}
          {noSpendDays > 0 && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-accent-600 dark:text-accent-400">
              <Flame size={12} /> {t(noSpendDays !== 1 ? 'dashboard.noSpendDaysPlural' : 'dashboard.noSpendDays', { count: noSpendDays })}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
        {/* Spending trend chart — shorter on mobile */}
        <div className="card !p-3 md:!p-5">
          <h3 className="section-title">{t('dashboard.spendingTrend')}</h3>
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
            <p className="text-sm text-cream-500 text-center py-6">{t('dashboard.noSpendingData')}</p>
          )}
        </div>

        {/* Category breakdown — compact pie on mobile */}
        <div className="card !p-3 md:!p-5">
          <h3 className="section-title">{t('dashboard.byCategory')}</h3>
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
            <p className="text-sm text-cream-500 text-center py-6">{t('common.noData')}</p>
          )}
        </div>
      </div>

      {/* Budget progress — show top 3 on mobile */}
      {budgetProgress.length > 0 && (
        <div className="card !p-3 md:!p-5">
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="section-title mb-0">{t('dashboard.budgetProgress')}</h3>
            <Link to="/budgets" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
              {t('common.viewAll')} <ArrowRight size={12} />
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
            <h3 className="section-title mb-0">{t('dashboard.savingsGoals')}</h3>
            <Link to="/goals" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
              {t('common.viewAll')} <ArrowRight size={12} />
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
            <p className="text-sm text-cream-500 text-center py-6">{t('dashboard.noGoals')}</p>
          )}
        </div>

        {/* Upcoming bills — hidden on mobile if empty */}
        <div className={`card !p-3 md:!p-5 ${upcomingBills.length === 0 ? 'hidden md:block' : ''}`}>
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <h3 className="section-title mb-0">{t('dashboard.upcomingBills')}</h3>
            <Link to="/recurring" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
              {t('common.viewAll')} <ArrowRight size={12} />
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
                      <span className="text-xs text-cream-400">{t('dashboard.billDay', { day: r.billingDay })}</span>
                    </span>
                    <span className="font-heading font-bold money">{hidden ? '••••••' : formatCurrency(r.amount, r.currency || currency)}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-cream-500 text-center py-6">{t('dashboard.noBills')}</p>
          )}
        </div>
      </div>

      {/* Recent transactions — 3 on mobile, 6 on desktop */}
      <div className="card !p-3 md:!p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="section-title mb-0">{t('dashboard.recentTransactions')}</h3>
          <Link to="/transactions" className="text-xs text-cream-500 hover:text-cream-700 flex items-center gap-1">
            {t('common.viewAll')} <ArrowRight size={12} />
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
            title={t('dashboard.noTransactions')}
            description={t('dashboard.addFirst')}
            action={t('dashboard.addTransaction')}
            onAction={() => navigate('/add')}
          />
        )}
      </div>
    </div>
  );
}
