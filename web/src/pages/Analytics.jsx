import { useState, useEffect, useMemo, useRef } from 'react';
import { transactions as txApi, budgets as budgetsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { formatCurrency, sumBy, sumAmountsMultiCurrency, groupBy, getCategoryById, percentOf, getDisplayAmount } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';
import { generateInsights } from '../lib/smartFeatures';
import MonthPicker from '../components/MonthPicker';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Lightbulb, Hash, User, Home, TrendingUp, TrendingDown, BarChart2, BarChart3, FileText } from 'lucide-react';
import { getTagStats } from '../lib/tagHelpers';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { startOfMonth, endOfMonth, format, eachDayOfInterval, subMonths, getISOWeek, startOfWeek, endOfWeek } from 'date-fns';
import HelpButton from '../components/HelpButton';
import EmptyState from '../components/EmptyState';
import PageTabs from '../components/PageTabs';

export default function Analytics() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { user, effectiveUserId } = useAuth();
  const { subcategories } = useCategories();
  const [month, setMonth] = useState(new Date());
  const [allTx, setAllTx] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState([]);
  const [rates, setRates] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [scopeFilter, setScopeFilter] = useState('all');
  const [spendingView, setSpendingView] = useState('day');
  const loadVersion = useRef(0);
  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    (async () => {
      setLoading(true);
      try {
        const [tx, budgets, ratesData] = await Promise.all([
          txApi.getAll({ userId: effectiveUserId }),
          budgetsApi.getAll({ userId: effectiveUserId }),
          getCachedRates(),
        ]);
        if (version !== loadVersion.current) return; // stale
        setAllTx(tx);
        setBudgets(budgets);
        setRates(ratesData);
      } catch (err) { console.error(err); toast.error(t('analytics.failedLoad')); }
      finally { if (version === loadVersion.current) setLoading(false); }
    })();
  }, [effectiveUserId, toast, t]);

  const monthTx = useMemo(() => {
    const start = startOfMonth(month);
    const end = endOfMonth(month);
    let result = allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; });
    if (scopeFilter !== 'all') {
      result = result.filter((t) => (t.scope || 'personal') === scopeFilter);
    }
    return result;
  }, [allTx, month, scopeFilter]);

  // Generate smart insights
  useEffect(() => {
    if (monthTx.length > 0) {
      generateInsights(monthTx).then(setInsights).catch(e => console.warn('Insights generation failed:', e));
    } else {
      setInsights([]);
    }
  }, [monthTx]);

  const expenses = monthTx.filter((t) => t.type === 'expense');

  // Category vs budget (multi-currency aware)
  const categoryBudgetData = useMemo(() => {
    const byCategory = groupBy(expenses, 'category');
    const categories = [...new Set([...Object.keys(byCategory), ...budgetsList.map((b) => b.category)])];
    return categories.map((catId) => {
      const cat = getCategoryById(catId);
      const spent = sumAmountsMultiCurrency(byCategory[catId] || [], currency, rates);
      const budget = budgetsList.find((b) => b.category === catId);
      return { name: getCategoryLabel(cat, t), spent, budget: budget?.amount || 0, icon: cat.icon, color: cat.color, catId };
    }).filter((d) => d.spent > 0 || d.budget > 0).sort((a, b) => b.spent - a.spent).slice(0, 10);
  }, [expenses, budgetsList, currency, rates]);

  // Daily spending (multi-currency aware)
  const dailySpending = useMemo(() => {
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    return days.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const dayExpenses = expenses.filter((t) => t.date === key);
      const total = sumAmountsMultiCurrency(dayExpenses, currency, rates);
      return { date: format(day, 'dd'), total };
    });
  }, [expenses, month, currency, rates]);

  // Weekly spending (aggregate daily into weeks)
  const weeklySpending = useMemo(() => {
    const weeks = {};
    const days = eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) });
    days.forEach((day) => {
      const weekStart = startOfWeek(day, { weekStartsOn: 1 });
      const weekLabel = `${format(weekStart, 'dd MMM')}`;
      const key = format(day, 'yyyy-MM-dd');
      const dayExpenses = expenses.filter((t) => t.date === key);
      const total = sumAmountsMultiCurrency(dayExpenses, currency, rates);
      if (!weeks[weekLabel]) weeks[weekLabel] = { week: weekLabel, total: 0 };
      weeks[weekLabel].total += total;
    });
    return Object.values(weeks);
  }, [expenses, month, currency, rates]);

  // Category trends (current month vs previous month)
  const categoryTrends = useMemo(() => {
    const prevStart = startOfMonth(subMonths(month, 1));
    const prevEnd = endOfMonth(subMonths(month, 1));
    let prevTx = allTx.filter((t) => { const d = new Date(t.date); return d >= prevStart && d <= prevEnd && t.type === 'expense'; });
    if (scopeFilter !== 'all') prevTx = prevTx.filter((t) => (t.scope || 'personal') === scopeFilter);

    const prevByCategory = groupBy(prevTx, 'category');
    const currByCategory = groupBy(expenses, 'category');
    const allCats = new Set([...Object.keys(prevByCategory), ...Object.keys(currByCategory)]);

    const trends = [];
    for (const catId of allCats) {
      const prev = sumAmountsMultiCurrency(prevByCategory[catId] || [], currency, rates);
      const curr = sumAmountsMultiCurrency(currByCategory[catId] || [], currency, rates);
      if (prev === 0 && curr === 0) continue;
      const change = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;
      const cat = getCategoryById(catId);
      trends.push({ catId, name: getCategoryLabel(cat, t), icon: cat.icon, prev, curr, change });
    }

    const rising = trends.filter(t => t.change > 5).sort((a, b) => b.change - a.change).slice(0, 3);
    const falling = trends.filter(t => t.change < -5).sort((a, b) => a.change - b.change).slice(0, 3);
    return { rising, falling };
  }, [expenses, allTx, month, scopeFilter, currency, rates, t]);

  // Top merchants (multi-currency aware)
  const topMerchants = useMemo(() => {
    const grouped = groupBy(expenses, (tx) => tx.merchant || t('common.unknown'));
    return Object.entries(grouped)
      .map(([merchant, txs]) => ({ merchant, total: sumAmountsMultiCurrency(txs, currency, rates), count: txs.length }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [expenses, currency, rates]);

  // Tag stats
  const tagStats = useMemo(() => getTagStats(expenses), [expenses]);

  // Summary stats (multi-currency aware)
  const totalSpent = sumAmountsMultiCurrency(expenses, currency, rates);
  const totalIncome = sumAmountsMultiCurrency(monthTx.filter((t) => t.type === 'income'), currency, rates);
  const now = new Date();
  const isCurrentMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const daysElapsed = isCurrentMonth
    ? now.getDate()
    : new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const dailyAvg = daysElapsed > 0 ? totalSpent / daysElapsed : 0;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const daysLeft = isCurrentMonth ? daysInMonth - now.getDate() : 0;
  const projected = isCurrentMonth ? totalSpent + dailyAvg * Math.max(daysLeft, 0) : totalSpent;
  const totalBudget = sumBy(budgetsList, 'amount');

  const insightTabs = useMemo(() => [
    { to: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
    { to: '/review', labelKey: 'nav.review', icon: FileText },
  ], []);

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <PageTabs tabs={insightTabs} />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('analytics.title')}</h1>
          <HelpButton section="analytics" />
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Scope filter pills */}
      <div className="flex gap-1.5">
        {[
          { id: 'all', label: t('household.scopeAll') },
          { id: 'personal', label: t('household.scopePersonal'), icon: User },
          { id: 'household', label: t('household.scopeHousehold'), icon: Home },
        ].map((s) => (
          <button
            key={s.id}
            onClick={() => setScopeFilter(s.id)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all flex items-center gap-1 ${
              scopeFilter === s.id
                ? 'bg-accent-50 border-accent-300 text-accent-700 shadow-sm dark:bg-accent-500/10 dark:border-accent-500/30 dark:text-accent-300'
                : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
            }`}
          >
            {s.icon && <s.icon size={12} />}
            {s.label}
          </button>
        ))}
      </div>

      {monthTx.length === 0 && (
        <EmptyState
          icon={BarChart2}
          title={t('analytics.emptyTitle')}
          description={t('analytics.emptyDesc')}
          action={t('analytics.emptyAction')}
          onAction={() => window.location.href = '/add'}
        />
      )}

      {monthTx.length > 0 && <>
      {/* Smart summary */}
      <div className="card">
        <h3 className="section-title">{t('analytics.smartSummary')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><p className="text-cream-500 text-xs">{t('analytics.totalTransactions')}</p><p className="stat-value text-lg">{monthTx.length}</p></div>
          <div><p className="text-cream-500 text-xs">{t('analytics.totalSpent')}</p><p className="stat-value text-lg">{formatCurrency(totalSpent, currency)}</p></div>
          <div><p className="text-cream-500 text-xs">{t('analytics.dailyAvg')}</p><p className="stat-value text-lg">{formatCurrency(dailyAvg, currency)}</p></div>
          <div><p className="text-cream-500 text-xs">{t('analytics.projectedTotal')}</p><p className="stat-value text-lg">{formatCurrency(projected, currency)}</p></div>
        </div>
        {totalBudget > 0 && (
          <p className="text-xs text-cream-500 mt-3">
            {projected > totalBudget
              ? t('analytics.overBudgetPace', { amount: formatCurrency(projected - totalBudget, currency) })
              : t('analytics.underBudgetPace', { amount: formatCurrency(totalBudget - projected, currency) })}
          </p>
        )}
        {daysLeft > 0 && totalBudget > totalSpent && (
          <p className="text-xs text-success mt-1">
            {t('analytics.safeToSpend', { amount: formatCurrency((totalBudget - totalSpent) / daysLeft, currency) })}
          </p>
        )}
      </div>

      {/* Category vs budget */}
      <div className="card">
        <h3 className="section-title">{t('analytics.categoryVsBudget')}</h3>
        <p className="text-xs text-cream-400 mb-2">{t('analytics.clickCategory')}</p>
        {categoryBudgetData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryBudgetData} layout="vertical" margin={{ left: 60 }} onClick={(data) => {
              if (data && data.activePayload && data.activePayload[0]) {
                const catId = data.activePayload[0].payload.catId;
                setSelectedCategory(catId === selectedCategory ? null : catId);
              }
            }} style={{ cursor: 'pointer' }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--grid-line)" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={60} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
              <Bar dataKey="spent" fill="#1B7A6E" radius={[0, 4, 4, 0]} name={t('analytics.spent')} />
              <Bar dataKey="budget" fill="#E6E2DB" radius={[0, 4, 4, 0]} name={t('analytics.budget')} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">{t('analytics.noData')}</p>}
      </div>

      {/* Subcategory Drill-Down */}
      {selectedCategory && (() => {
        const subcats = subcategories[selectedCategory] || [];
        if (!subcats.length) return null;
        const subcatData = subcats.map(sub => {
          const spent = monthTx
            .filter(tx => tx.subcategory === sub.id && tx.type === 'expense')
            .reduce((s, tx) => s + getDisplayAmount(tx.amount, tx.currency, currency, rates).convertedAmount, 0);
          return { name: t('subcategories.' + sub.id) || sub.name, spent, id: sub.id, icon: sub.icon };
        }).filter(s => s.spent > 0).sort((a, b) => b.spent - a.spent);

        const totalCatSpent = subcatData.reduce((s, d) => s + d.spent, 0);

        return (
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-title mb-0">
                {getCategoryById(selectedCategory)?.icon} {t('categories.' + selectedCategory)} — {t('analytics.subcategories')}
              </h3>
              <button onClick={() => setSelectedCategory(null)} className="text-xs text-accent-500 hover:text-accent-600 font-medium transition-colors">
                ← {t('common.back')}
              </button>
            </div>
            {subcatData.length > 0 ? (
              <div className="space-y-2">
                {subcatData.map(sub => {
                  const pct = totalCatSpent > 0 ? (sub.spent / totalCatSpent) * 100 : 0;
                  return (
                    <div key={sub.id} className="flex items-center gap-3">
                      <span className="text-base w-6 text-center">{sub.icon}</span>
                      <span className="text-sm flex-1 min-w-0 truncate">{sub.name}</span>
                      <div className="w-24 h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden hidden sm:block">
                        <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="font-medium text-sm money whitespace-nowrap">{formatCurrency(sub.spent, currency)}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-cream-500 text-center py-4">{t('analytics.noData')}</p>
            )}
          </div>
        );
      })()}

      {/* Daily/weekly spending pattern */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title mb-0">{t('analytics.spendingPattern')}</h3>
          <div className="flex gap-1 bg-cream-200 dark:bg-dark-border rounded-lg p-0.5">
            {['day', 'week'].map((v) => (
              <button key={v} onClick={() => setSpendingView(v)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                  spendingView === v
                    ? 'bg-white dark:bg-dark-card shadow-sm text-cream-900 dark:text-dark-text'
                    : 'text-cream-500 hover:text-cream-700'
                }`}>
                {t(`analytics.${v}View`)}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={spendingView === 'week' ? weeklySpending : dailySpending}>
            <XAxis dataKey={spendingView === 'week' ? 'week' : 'date'} tick={{ fontSize: 9 }} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
            <Bar dataKey="total" fill="#1B7A6E" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Trends */}
      {(categoryTrends.rising.length > 0 || categoryTrends.falling.length > 0) && (
        <div className="card">
          <h3 className="section-title">{t('analytics.categoryTrends')}</h3>
          <p className="text-xs text-cream-500 mb-3">{t('analytics.vsLastMonth')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {categoryTrends.rising.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-danger mb-2 flex items-center gap-1">
                  <TrendingUp size={12} /> {t('analytics.spendingUp')}
                </p>
                <div className="space-y-2">
                  {categoryTrends.rising.map((c) => (
                    <div key={c.catId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm">{c.icon}</span>
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="text-xs font-medium text-danger shrink-0">+{Math.round(c.change)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {categoryTrends.falling.length > 0 && (
              <div>
                <p className="text-[11px] font-medium text-success mb-2 flex items-center gap-1">
                  <TrendingDown size={12} /> {t('analytics.spendingDown')}
                </p>
                <div className="space-y-2">
                  {categoryTrends.falling.map((c) => (
                    <div key={c.catId} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="text-sm">{c.icon}</span>
                        <span className="truncate">{c.name}</span>
                      </span>
                      <span className="text-xs font-medium text-success shrink-0">{Math.round(c.change)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Smart Insights */}
      {insights.length > 0 && (
        <div className="card border-info/20 bg-info/5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={16} className="text-info" />
            <h3 className="section-title mb-0">{t('analytics.smartInsights')}</h3>
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
        <h3 className="section-title">{t('analytics.topMerchants')}</h3>
        {topMerchants.length > 0 ? (
          <div className="space-y-2">
            {topMerchants.map((m, i) => (
              <div key={m.merchant} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <span className="text-xs text-cream-400 w-5">{i + 1}.</span>
                  <span className="font-medium">{m.merchant}</span>
                  <span className="text-xs text-cream-400">({m.count}x)</span>
                </span>
                <span className="stat-value text-sm">{formatCurrency(m.total, currency)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-cream-500">{t('analytics.noData')}</p>}
      </div>

      {/* Spending by tag */}
      {tagStats.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Hash size={16} className="text-accent" />
            <h3 className="section-title mb-0">{t('analytics.spendingByTag')}</h3>
          </div>
          <div className="space-y-2">
            {tagStats.slice(0, 10).map((ts, i) => {
              const pct = totalSpent > 0 ? (ts.total / totalSpent) * 100 : 0;
              return (
                <div key={ts.tag} className="flex items-center gap-3">
                  <span className="text-xs text-cream-400 w-5">{i + 1}.</span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300 text-xs font-medium">
                    <Hash size={10} className="opacity-60" />{ts.tag}
                  </span>
                  <div className="flex-1 h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                  <div className="text-right min-w-[80px]">
                    <span className="text-sm money font-medium">{formatCurrency(ts.total, currency)}</span>
                    <span className="text-[10px] text-cream-400 ml-1">({ts.count}x)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </>}
    </div>
  );
}
