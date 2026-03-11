import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency, getCategoryById, sortByDate, sumAmountsMultiCurrency } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import MonthPicker from '../components/MonthPicker';
import Modal from '../components/Modal';
import TransactionRow from '../components/TransactionRow';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, isToday, isSameWeek, startOfWeek } from 'date-fns';
import HelpButton from '../components/HelpButton';
import { TrendingDown, TrendingUp, Zap, Flame } from 'lucide-react';

// Category color palette for dots
const CAT_COLORS = {
  food: '#e11d48', dining: '#e11d48', groceries: '#e11d48',
  transport: '#2563eb', housing: '#7c3aed', utilities: '#d97706',
  entertainment: '#db2777', shopping: '#059669', health: '#0891b2',
  education: '#6366f1', personal: '#8b5cf6', pets: '#f59e0b',
  travel: '#06b6d4', subscriptions: '#a855f7', gifts: '#ec4899',
};

function getCatColor(catId) {
  if (CAT_COLORS[catId]) return CAT_COLORS[catId];
  const cat = getCategoryById(catId);
  const hash = (cat.name || catId).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return `hsl(${hash % 360}, 60%, 50%)`;
}

export default function CalendarPage() {
  const { t } = useTranslation();
  const { user, effectiveUserId } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [recurringItems, setRecurring] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState(null);

  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [allTx, rec] = await Promise.all([
          txApi.getAll({ userId: effectiveUserId }),
          recurringApi.getAll({ userId: effectiveUserId }),
        ]);
        const start = startOfMonth(month);
        const end = endOfMonth(month);
        setTransactions(allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; }));
        setRecurring(rec.filter((r) => r.active !== false));
        getCachedRates().then(setRates).catch(() => {});
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [month, effectiveUserId]);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  // Build day data
  const dayData = useMemo(() => {
    const map = {};
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      const dayNum = day.getDate();
      const dayTx = transactions.filter((t) => t.date === key);
      const dayBills = recurringItems.filter((r) => (r.billingDay || 1) === dayNum);
      const expenses = dayTx.filter((t) => t.type === 'expense');
      const expenseTotal = sumAmountsMultiCurrency(expenses, currency, rates);
      const incomeTotal = sumAmountsMultiCurrency(dayTx.filter((t) => t.type === 'income'), currency, rates);
      const categories = [...new Set(expenses.map((t) => t.category))];
      map[key] = { day, dayNum, transactions: dayTx, bills: dayBills, expenseTotal, incomeTotal, count: dayTx.length, categories };
    }
    return map;
  }, [days, transactions, recurringItems, currency, rates]);

  // Monthly stats
  const monthStats = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === 'expense');
    const totalExpenses = sumAmountsMultiCurrency(expenses, currency, rates);
    const totalIncome = sumAmountsMultiCurrency(transactions.filter((t) => t.type === 'income'), currency, rates);
    const now = new Date();
    const pastDays = days.filter((d) => d <= now);
    const noSpendDays = pastDays.filter((d) => {
      const key = format(d, 'yyyy-MM-dd');
      return dayData[key]?.expenseTotal === 0;
    }).length;

    let streak = 0;
    for (let i = pastDays.length - 1; i >= 0; i--) {
      const key = format(pastDays[i], 'yyyy-MM-dd');
      if (dayData[key]?.expenseTotal === 0) streak++;
      else break;
    }

    return { totalExpenses, totalIncome, noSpendDays, streak, pastDayCount: pastDays.length };
  }, [transactions, days, dayData, currency, rates]);

  // Weekly totals — one per grid row
  const weeklyTotals = useMemo(() => {
    const totals = {};
    for (const day of days) {
      const ws = startOfWeek(day, { weekStartsOn: 1 });
      const wk = format(ws, 'yyyy-MM-dd');
      if (!totals[wk]) totals[wk] = 0;
      const key = format(day, 'yyyy-MM-dd');
      totals[wk] += dayData[key]?.expenseTotal || 0;
    }
    return totals;
  }, [days, dayData]);

  // Max expense for heatmap
  const maxExpense = useMemo(() => Math.max(...Object.values(dayData).map((d) => d.expenseTotal), 1), [dayData]);

  // Starting offset (Monday = 0)
  const firstDayOfWeek = getDay(startOfMonth(month));
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  // Build grid rows (weeks) for the 8-column layout
  const gridRows = useMemo(() => {
    const cells = [...Array(offset).fill(null), ...days];
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const rowDays = cells.slice(i, i + 7);
      // Pad last row
      while (rowDays.length < 7) rowDays.push(null);
      // Week total: sum expenses for real days in this row
      const realDays = rowDays.filter(Boolean);
      const weekKey = realDays.length > 0 ? format(startOfWeek(realDays[0], { weekStartsOn: 1 }), 'yyyy-MM-dd') : null;
      const weekTotal = weekKey ? (weeklyTotals[weekKey] || 0) : 0;
      rows.push({ days: rowDays, weekTotal });
    }
    return rows;
  }, [offset, days, weeklyTotals]);

  const selectedDayData = selectedDay ? dayData[selectedDay] : null;

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('calendar.title')}</h1>
          <HelpButton section="calendar" />
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Calendar card with integrated stats */}
      <div className="card p-3 sm:p-4">
        {/* Stats ribbon */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 pb-3 border-b border-cream-100 dark:border-dark-border">
          <div className="flex items-center gap-1.5">
            <TrendingDown size={12} className="text-danger" />
            <span className="text-xs text-cream-500">{t('calendar.spent')}</span>
            <span className="text-xs font-bold money text-danger">{formatCurrency(monthStats.totalExpenses, currency)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp size={12} className="text-income" />
            <span className="text-xs text-cream-500">{t('calendar.totalIncome')}</span>
            <span className="text-xs font-bold money text-income">{formatCurrency(monthStats.totalIncome, currency)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap size={12} className="text-accent" />
            <span className="text-xs text-cream-500">{t('calendar.dailyAvg')}</span>
            <span className="text-xs font-bold money">{formatCurrency(monthStats.pastDayCount > 0 ? monthStats.totalExpenses / monthStats.pastDayCount : 0, currency)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame size={12} className="text-success" />
            <span className="text-xs text-cream-500">{t('calendar.noSpendDays')}</span>
            <span className="text-xs font-bold text-success">{monthStats.noSpendDays}</span>
          </div>
          {monthStats.streak >= 2 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success">
              🔥 {monthStats.streak} {t('calendar.dayStreak')}
            </span>
          )}
        </div>

        {/* Day name headers — 8 columns (7 days + week total) */}
        <div className="grid grid-cols-[repeat(7,1fr)_auto] gap-px mb-px">
          {[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun')].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-cream-400 uppercase tracking-wider py-1">{d}</div>
          ))}
          <div className="w-14 sm:w-16 text-center text-[10px] font-semibold text-cream-400 uppercase tracking-wider py-1">{t('calendar.week')}</div>
        </div>

        {/* Grid rows */}
        <div className="border border-cream-200 dark:border-dark-border rounded-xl overflow-hidden">
          {gridRows.map((row, ri) => (
            <div key={ri} className={`grid grid-cols-[repeat(7,1fr)_auto] gap-px bg-cream-200 dark:bg-dark-border ${ri > 0 ? '' : ''}`}>
              {row.days.map((day, ci) => {
                if (!day) {
                  return <div key={`empty-${ri}-${ci}`} className="h-11 sm:h-14 bg-cream-50 dark:bg-dark-card" />;
                }

                const key = format(day, 'yyyy-MM-dd');
                const data = dayData[key];
                const today = isToday(day);
                const isFuture = day > new Date();
                const isPast = !isFuture && !today;
                const hasExpenses = data.expenseTotal > 0;
                const hasBills = data.bills.length > 0;
                const isNoSpend = isPast && !hasExpenses;
                const intensity = hasExpenses ? Math.min(data.expenseTotal / maxExpense, 1) : 0;

                let bgClass = 'bg-white dark:bg-dark-card';
                if (today) bgClass = 'bg-accent/5';
                else if (hasExpenses) bgClass = '';
                else if (isNoSpend) bgClass = '';

                let bgStyle = undefined;
                if (hasExpenses && !today) {
                  bgStyle = { backgroundColor: `rgba(225, 29, 72, ${0.03 + intensity * 0.12})` };
                } else if (isNoSpend && !today) {
                  bgStyle = { backgroundColor: 'rgba(5, 150, 105, 0.03)' };
                }

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(key)}
                    className={`h-11 sm:h-14 p-1 text-left flex flex-col transition-colors relative ${
                      today
                        ? 'ring-1 ring-inset ring-accent bg-accent/5'
                        : selectedDay === key
                          ? 'ring-1 ring-inset ring-accent/50'
                          : isFuture
                            ? 'opacity-40'
                            : 'hover:brightness-95 dark:hover:brightness-110'
                    } ${!hasExpenses && !isNoSpend && !today ? bgClass : ''}`}
                    style={bgStyle || (!bgStyle && !today ? undefined : undefined)}
                  >
                    {/* Day number + indicators */}
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-[11px] font-semibold leading-none ${
                        today ? 'text-accent' : hasExpenses ? 'text-cream-700 dark:text-cream-200' : isNoSpend ? 'text-success/70' : 'text-cream-400'
                      }`}>
                        {data.dayNum}
                      </span>
                      <div className="flex items-center gap-[2px]">
                        {hasBills && <span className="w-1 h-1 rounded-full bg-warning" />}
                        {isNoSpend && <span className="text-[7px] text-success leading-none">✓</span>}
                      </div>
                    </div>

                    {/* Amount + category dots */}
                    <div className="mt-auto w-full">
                      {hasExpenses && (
                        <span className="block text-[8px] sm:text-[9px] text-danger font-bold money truncate leading-tight">
                          {formatCurrency(data.expenseTotal, currency).replace(/\s/g, '')}
                        </span>
                      )}
                      {data.categories.length > 0 && (
                        <div className="flex items-center gap-[2px] mt-[1px]">
                          {data.categories.slice(0, 3).map((catId, i) => (
                            <span key={i} className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: getCatColor(catId) }} />
                          ))}
                          {data.categories.length > 3 && <span className="text-[6px] text-cream-400 leading-none">+{data.categories.length - 3}</span>}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Weekly total column */}
              <div className="w-14 sm:w-16 h-11 sm:h-14 bg-cream-50 dark:bg-dark-card flex flex-col items-center justify-center px-1">
                {row.weekTotal > 0 ? (
                  <span className="text-[9px] sm:text-[10px] font-bold money text-danger text-center leading-tight">
                    {formatCurrency(row.weekTotal, currency).replace(/\s/g, '')}
                  </span>
                ) : (
                  <span className="text-[9px] text-cream-300">—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-3 pt-2 border-t border-cream-100 dark:border-dark-border">
          <div className="flex items-center gap-1 text-[10px] text-cream-400">
            <div className="w-2.5 h-2.5 rounded-sm bg-danger/15" /> {t('calendar.spending')}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-cream-400">
            <span className="text-[7px] text-success">✓</span> {t('calendar.noSpend')}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-cream-400">
            <div className="w-1 h-1 rounded-full bg-warning" /> {t('calendar.billsDue')}
          </div>
          <div className="flex items-center gap-1 text-[10px] text-cream-400">
            <div className="flex gap-[2px]">
              <div className="w-1 h-1 rounded-full bg-danger" />
              <div className="w-1 h-1 rounded-full bg-accent" />
              <div className="w-1 h-1 rounded-full bg-success" />
            </div>
            {t('calendar.categories')}
          </div>
        </div>
      </div>

      {/* Day detail modal */}
      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(new Date(selectedDay), 'EEEE, dd MMMM yyyy') : ''} wide>
        {selectedDayData && (
          <div className="space-y-4">
            {/* Day summary cards */}
            {(selectedDayData.expenseTotal > 0 || selectedDayData.incomeTotal > 0) && (
              <div className="flex gap-3">
                {selectedDayData.expenseTotal > 0 && (
                  <div className="flex-1 p-3 rounded-xl bg-danger/5">
                    <p className="text-[10px] text-cream-500 uppercase">{t('calendar.expenses')}</p>
                    <p className="font-heading font-bold text-lg money text-danger">{formatCurrency(selectedDayData.expenseTotal, currency)}</p>
                    {selectedDayData.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedDayData.categories.map((catId, i) => {
                          const cat = getCategoryById(catId);
                          return (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-dark-border" style={{ borderLeft: `2px solid ${getCatColor(catId)}` }}>
                              {cat.icon} {cat.name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {selectedDayData.incomeTotal > 0 && (
                  <div className="flex-1 p-3 rounded-xl bg-income/5">
                    <p className="text-[10px] text-cream-500 uppercase">{t('calendar.income')}</p>
                    <p className="font-heading font-bold text-lg money text-income">{formatCurrency(selectedDayData.incomeTotal, currency)}</p>
                  </div>
                )}
              </div>
            )}

            {/* No-spend celebration */}
            {selectedDayData.expenseTotal === 0 && selectedDayData.incomeTotal === 0 && selectedDayData.day <= new Date() && (
              <div className="text-center py-4">
                <span className="text-3xl">🌟</span>
                <p className="text-sm font-medium text-success mt-1">{t('calendar.noSpendDay')}</p>
              </div>
            )}

            {selectedDayData.bills.length > 0 && (
              <div>
                <h4 className="section-title">{t('calendar.billsDue')}</h4>
                {selectedDayData.bills.map((b) => {
                  const cat = getCategoryById(b.category);
                  return (
                    <div key={b.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-warning" />
                        <span>{cat.icon} {b.name}</span>
                      </span>
                      <span className="money font-medium">{formatCurrency(b.amount, b.currency || currency)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedDayData.transactions.length > 0 ? (
              <div>
                <h4 className="section-title">{t('calendar.transactionsTitle')}</h4>
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {sortByDate(selectedDayData.transactions).map((tx) => <TransactionRow key={tx.id} transaction={tx} />)}
                </div>
              </div>
            ) : selectedDayData.bills.length === 0 && selectedDayData.day > new Date() ? (
              <p className="text-sm text-cream-500 text-center py-6">{t('calendar.noTransactions')}</p>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
