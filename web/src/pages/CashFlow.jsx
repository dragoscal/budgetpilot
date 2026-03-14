import { useState, useEffect, useMemo, useRef } from 'react';
import { transactions as txApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency, sumBy, sumAmountsMultiCurrency, groupBy, getCategoryById, percentOf } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import { getCachedRates } from '../lib/exchangeRates';
import StatCard from '../components/StatCard';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart, ReferenceLine } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Zap, AlertTriangle } from 'lucide-react';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { forecastCashFlow } from '../lib/forecasting';
import HelpButton from '../components/HelpButton';

export default function CashFlow() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, effectiveUserId } = useAuth();
  const [allTx, setAllTx] = useState([]);
  const [recurringItems, setRecurring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview'); // 'overview' | 'forecast'
  const [forecast, setForecast] = useState(null);
  const [forecastDays, setForecastDays] = useState(90);
  const [rates, setRates] = useState(null);
  const loadVersion = useRef(0);
  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    (async () => {
      setLoading(true);
      try {
        const [tx, rec, ratesData] = await Promise.all([
          txApi.getAll({ userId: effectiveUserId }),
          recurringApi.getAll({ userId: effectiveUserId }),
          getCachedRates(),
        ]);
        if (version !== loadVersion.current) return; // stale
        setAllTx(tx);
        setRecurring(rec.filter((r) => r.active !== false));
        setRates(ratesData);
        // Load forecast
        const fc = await forecastCashFlow({ userId: effectiveUserId, days: forecastDays, defaultCurrency: currency });
        if (version !== loadVersion.current) return; // stale
        setForecast(fc);
      } catch (err) { console.error(err); toast.error(t('cashflow.failedLoad')); }
      finally { if (version === loadVersion.current) setLoading(false); }
    })();
  }, [forecastDays, effectiveUserId, toast, t]);

  // Current month stats
  const now = new Date();
  const currentMonthTx = useMemo(() => {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; });
  }, [allTx]);

  const monthIncome = sumAmountsMultiCurrency(currentMonthTx.filter((t) => t.type === 'income'), currency, rates);
  const monthExpenses = sumAmountsMultiCurrency(currentMonthTx.filter((t) => t.type === 'expense'), currency, rates);
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
      const income = sumAmountsMultiCurrency(monthTx.filter((t) => t.type === 'income'), currency, rates);
      const expenses = sumAmountsMultiCurrency(monthTx.filter((t) => t.type === 'expense'), currency, rates);
      months.push({ month: format(m, 'MMM'), income, expenses, net: income - expenses });
    }
    return months;
  }, [allTx, currency, rates]);

  // Category breakdown
  const expenseByCategory = useMemo(() => {
    const expenses = currentMonthTx.filter((t) => t.type === 'expense');
    const grouped = groupBy(expenses, 'category');
    return Object.entries(grouped)
      .map(([catId, txs]) => ({ ...getCategoryById(catId), total: sumAmountsMultiCurrency(txs, currency, rates) }))
      .sort((a, b) => b.total - a.total);
  }, [currentMonthTx, currency, rates]);

  // Income sources
  const incomeSources = useMemo(() => {
    const income = currentMonthTx.filter((t) => t.type === 'income');
    const grouped = groupBy(income, (tx) => tx.merchant || tx.description || t('common.other'));
    return Object.entries(grouped)
      .map(([source, txs]) => ({ source, total: sumAmountsMultiCurrency(txs, currency, rates) }))
      .sort((a, b) => b.total - a.total);
  }, [currentMonthTx, currency, rates]);

  // Forecast
  const recurringIncome = sumAmountsMultiCurrency(recurringItems.filter((r) => r.category === 'income'), currency, rates);
  const recurringExpenses = sumAmountsMultiCurrency(recurringItems.filter((r) => r.category !== 'income'), currency, rates);

  // Forecast chart data — sample every 3rd day for readability
  const forecastChartData = useMemo(() => {
    if (!forecast) return [];
    return forecast.projections
      .filter((_, i) => i % 3 === 0 || i === forecast.projections.length - 1)
      .map(p => ({
        date: format(new Date(p.date), 'dd MMM'),
        balance: p.balance,
        income: p.income,
        expenses: p.expenses,
      }));
  }, [forecast]);

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('cashflow.title')}</h1>
          <HelpButton section="cashflow" />
        </div>
        <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
          {[
            { id: 'overview', label: t('cashflow.overview') },
            { id: 'forecast', label: t('cashflow.forecast'), icon: Zap },
          ].map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`px-4 py-2 text-xs font-medium flex items-center gap-1.5 transition-colors ${
                tab === tb.id
                  ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                  : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              {tb.icon && <tb.icon size={12} />}
              {tb.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t('cashflow.monthlyIncome')} value={formatCurrency(monthIncome, currency)} icon={TrendingUp} />
        <StatCard label={t('cashflow.monthlyExpenses')} value={formatCurrency(monthExpenses, currency)} icon={TrendingDown} />
        <StatCard label={t('cashflow.netCashFlow')} value={formatCurrency(netCashFlow, currency)} icon={DollarSign} />
      </div>

      <div className="card">
        <h3 className="section-title">{t('cashflow.savingsRate')}</h3>
        <div className="flex items-end gap-3">
          <span className={`text-4xl font-heading font-bold ${savingsRate >= 0 ? 'text-success' : 'text-danger'}`}>{savingsRate}%</span>
          <span className="text-sm text-cream-500 mb-1">{t('cashflow.ofIncomeSaved')}</span>
        </div>
      </div>

      {/* 6-month chart */}
      <div className="card">
        <h3 className="section-title">{t('cashflow.incomeVsExpenses6m')}</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
            <Bar dataKey="income" fill="#059669" radius={[4, 4, 0, 0]} name={t('cashflow.income')} />
            <Bar dataKey="expenses" fill="#DC2626" radius={[4, 4, 0, 0]} name={t('cashflow.expenses')} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Net cash flow trend */}
      <div className="card">
        <h3 className="section-title">{t('cashflow.netCashFlowTrend')}</h3>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={chartData}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
            <Line type="monotone" dataKey="net" stroke="#1B7A6E" strokeWidth={2} dot={{ r: 4 }} name={t('cashflow.net')} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income breakdown */}
        <div className="card">
          <h3 className="section-title">{t('cashflow.incomeSources')}</h3>
          {incomeSources.length > 0 ? (
            <div className="space-y-2">
              {incomeSources.map((s) => (
                <div key={s.source} className="flex justify-between text-sm">
                  <span>{s.source}</span>
                  <span className="money font-medium text-income">{formatCurrency(s.total, currency)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-cream-500">{t('cashflow.noIncomeThisMonth')}</p>}
        </div>

        {/* Expense breakdown */}
        <div className="card">
          <h3 className="section-title">{t('cashflow.expensesByCategory')}</h3>
          {expenseByCategory.length > 0 ? (
            <div className="space-y-2">
              {expenseByCategory.slice(0, 8).map((c) => (
                <div key={c.id} className="flex justify-between text-sm">
                  <span>{c.icon} {getCategoryLabel(c, t)}</span>
                  <span className="money font-medium">{formatCurrency(c.total, currency)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-cream-500">{t('cashflow.noExpensesThisMonth')}</p>}
        </div>
      </div>

      {/* Projection */}
      <div className="card">
        <h3 className="section-title">{t('cashflow.nextMonthProjection')}</h3>
        <p className="text-sm text-cream-600 dark:text-cream-400">
          {t('cashflow.projectionDesc', { income: formatCurrency(recurringIncome, currency), expenses: formatCurrency(recurringExpenses, currency), net: formatCurrency(recurringIncome - recurringExpenses, currency) })}
        </p>
      </div>
      </>}

      {/* ─── Forecast Tab ─────────────────────────────── */}
      {tab === 'forecast' && forecast && <>
        {/* Forecast summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card text-center">
            <p className="text-[10px] text-cream-500 uppercase tracking-wider mb-1">{t('cashflow.currentBalance')}</p>
            <p className="text-lg font-heading font-bold money">{formatCurrency(forecast.summary.startingBalance, currency)}</p>
          </div>
          <div className="card text-center">
            <p className="text-[10px] text-cream-500 uppercase tracking-wider mb-1">{t('cashflow.projectedEnd')}</p>
            <p className={`text-lg font-heading font-bold money ${forecast.summary.endBalance >= 0 ? 'text-success' : 'text-danger'}`}>
              {formatCurrency(forecast.summary.endBalance, currency)}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-[10px] text-cream-500 uppercase tracking-wider mb-1">{t('cashflow.lowestPoint')}</p>
            <p className={`text-lg font-heading font-bold money ${forecast.summary.lowestBalance >= 0 ? '' : 'text-danger'}`}>
              {formatCurrency(forecast.summary.lowestBalance, currency)}
            </p>
            {forecast.summary.lowestDate && (
              <p className="text-[10px] text-cream-400">{format(new Date(forecast.summary.lowestDate), 'dd MMM')}</p>
            )}
          </div>
          <div className="card text-center">
            <p className="text-[10px] text-cream-500 uppercase tracking-wider mb-1">{t('cashflow.avgDailySpend')}</p>
            <p className="text-lg font-heading font-bold money">{formatCurrency(forecast.summary.avgDailySpend, currency)}</p>
          </div>
        </div>

        {/* Danger zones */}
        {forecast.dangerZones.length > 0 && (
          <div className="card border-danger/30 bg-danger/5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-danger" />
              <h3 className="text-sm font-semibold text-danger">{t('cashflow.dangerZones')}</h3>
            </div>
            <p className="text-xs text-cream-600 dark:text-cream-400 mb-2">
              {t('cashflow.balanceGoesNegative', { count: forecast.dangerZones.length })}
            </p>
            <div className="space-y-1">
              {forecast.dangerZones.map((z, i) => (
                <div key={i} className="flex justify-between text-xs bg-white dark:bg-dark-card rounded-lg px-3 py-2 border border-danger/15">
                  <span>{format(new Date(z.startDate), 'dd MMM')} — {format(new Date(z.endDate), 'dd MMM')}</span>
                  <span className="font-medium text-danger">{formatCurrency(z.lowestBalance, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Forecast period selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-cream-500">{t('cashflow.forecastPeriod')}</span>
          {[30, 60, 90, 180].map(d => (
            <button
              key={d}
              onClick={() => setForecastDays(d)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                forecastDays === d
                  ? 'bg-accent-600 text-white'
                  : 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-400 hover:bg-cream-200'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>

        {/* Forecast chart */}
        <div className="card">
          <h3 className="section-title">{t('cashflow.projectedBalance', { days: forecastDays })}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={forecastChartData}>
              <defs>
                <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B7A6E" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#1B7A6E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} />
              <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)', fontSize: 12 }}
                formatter={(v) => formatCurrency(v, currency)}
              />
              <ReferenceLine y={0} stroke="#DC2626" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="balance" stroke="#1B7A6E" fill="url(#balanceGrad)" strokeWidth={2} name={t('cashflow.balance')} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Upcoming recurring events */}
        {forecast.projections.some(p => p.events.length > 0) && (
          <div className="card">
            <h3 className="section-title">{t('cashflow.upcomingBillsIncome')}</h3>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {forecast.projections
                .filter(p => p.events.length > 0)
                .slice(0, 20)
                .map((p, i) => (
                  <div key={i}>
                    {p.events.map((ev, j) => (
                      <div key={j} className="flex items-center justify-between py-1.5 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-cream-400 w-14">{format(new Date(p.date), 'dd MMM')}</span>
                          <span className="font-medium">{ev.name}</span>
                        </div>
                        <span className={`money font-medium ${ev.isIncome ? 'text-success' : ''}`}>
                          {ev.isIncome ? '+' : '-'}{formatCurrency(ev.amount, currency)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        )}
      </>}
    </div>
  );
}
