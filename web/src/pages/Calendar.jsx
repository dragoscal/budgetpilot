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
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, isToday, startOfWeek, endOfWeek, isSameWeek } from 'date-fns';
import HelpButton from '../components/HelpButton';
import { TrendingDown, TrendingUp, Flame, Zap, Star } from 'lucide-react';

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
  // Generate a stable color from category name
  const hash = (cat.name || catId).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 60%, 50%)`;
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
      // Unique category IDs for dot indicators
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

    // No-spend streak (count consecutive no-spend days ending today or yesterday)
    let streak = 0;
    for (let i = pastDays.length - 1; i >= 0; i--) {
      const key = format(pastDays[i], 'yyyy-MM-dd');
      if (dayData[key]?.expenseTotal === 0) streak++;
      else break;
    }

    // Busiest day
    const busiestDay = Object.values(dayData).reduce((max, d) => d.expenseTotal > max.expenseTotal ? d : max, { expenseTotal: 0 });

    return { totalExpenses, totalIncome, noSpendDays, streak, txCount: transactions.length, busiestDay, pastDayCount: pastDays.length };
  }, [transactions, days, dayData, currency, rates]);

  // Weekly summaries
  const weeklySummaries = useMemo(() => {
    const weeks = [];
    let weekStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const monthEnd = endOfMonth(month);
    while (weekStart <= monthEnd) {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekDays = days.filter((d) => isSameWeek(d, weekStart, { weekStartsOn: 1 }));
      const weekTx = transactions.filter((t) => weekDays.some((d) => format(d, 'yyyy-MM-dd') === t.date));
      const weekExpenses = sumAmountsMultiCurrency(weekTx.filter((t) => t.type === 'expense'), currency, rates);
      const dailyAmounts = weekDays.map((d) => {
        const key = format(d, 'yyyy-MM-dd');
        return dayData[key]?.expenseTotal || 0;
      });
      if (weekDays.length > 0) {
        weeks.push({
          label: `${format(weekDays[0], 'MMM d')}–${format(weekDays[weekDays.length - 1], 'd')}`,
          total: weekExpenses,
          avg: weekDays.length > 0 ? weekExpenses / weekDays.length : 0,
          dailyAmounts,
          txCount: weekTx.length,
        });
      }
      weekStart = new Date(weekEnd.getTime() + 86400000);
    }
    return weeks;
  }, [days, transactions, dayData, month, currency, rates]);

  // Max expense for heatmap
  const maxExpense = useMemo(() => Math.max(...Object.values(dayData).map((d) => d.expenseTotal), 1), [dayData]);

  // Starting offset (Monday = 0)
  const firstDayOfWeek = getDay(startOfMonth(month));
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const selectedDayData = selectedDay ? dayData[selectedDay] : null;

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('calendar.title')}</h1>
          <HelpButton section="calendar" />
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Top stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={12} className="text-danger" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('calendar.totalSpent')}</p>
          </div>
          <p className="font-heading font-bold text-base money text-danger">{formatCurrency(monthStats.totalExpenses, currency)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-income" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('calendar.totalIncome')}</p>
          </div>
          <p className="font-heading font-bold text-base money text-income">{formatCurrency(monthStats.totalIncome, currency)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={12} className="text-accent" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('calendar.dailyAvg')}</p>
          </div>
          <p className="font-heading font-bold text-base money">
            {formatCurrency(monthStats.pastDayCount > 0 ? monthStats.totalExpenses / monthStats.pastDayCount : 0, currency)}
          </p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={12} className="text-success" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('calendar.noSpendDays')}</p>
          </div>
          <p className="font-heading font-bold text-base text-success">{monthStats.noSpendDays}</p>
        </div>
      </div>

      {/* No-spend streak banner */}
      {monthStats.streak >= 2 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-success/10 to-accent/10 border border-success/20">
          <div className="w-10 h-10 rounded-xl bg-success/15 flex items-center justify-center shrink-0">
            <Star size={20} className="text-success" />
          </div>
          <div>
            <p className="text-sm font-bold text-success">{t('calendar.streakTitle', { count: monthStats.streak })}</p>
            <p className="text-[11px] text-cream-500">{t('calendar.streakDesc')}</p>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="card p-3 sm:p-4">
        {/* Day names */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun')].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-cream-400 uppercase tracking-wider py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const data = dayData[key];
            const today = isToday(day);
            const isFuture = day > new Date();
            const isPast = !isFuture && !today;
            const hasExpenses = data.expenseTotal > 0;
            const hasIncome = data.incomeTotal > 0;
            const hasBills = data.bills.length > 0;
            const isNoSpend = isPast && !hasExpenses;
            const intensity = hasExpenses ? Math.min(data.expenseTotal / maxExpense, 1) : 0;

            // Heatmap: red gradient for expenses, soft green for no-spend past days
            let bgStyle = undefined;
            if (hasExpenses && !today) {
              bgStyle = { backgroundColor: `rgba(225, 29, 72, ${0.05 + intensity * 0.15})` };
            } else if (isNoSpend && !today) {
              bgStyle = { backgroundColor: 'rgba(5, 150, 105, 0.04)' };
            }

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className={`aspect-square p-0.5 sm:p-1 rounded-xl text-left flex flex-col transition-all relative overflow-hidden ${
                  today
                    ? 'ring-2 ring-accent bg-accent/5'
                    : selectedDay === key
                      ? 'ring-2 ring-accent/50 bg-cream-100 dark:bg-dark-border'
                      : isFuture
                        ? 'opacity-35 hover:opacity-60'
                        : 'hover:ring-1 hover:ring-cream-300 dark:hover:ring-dark-border'
                }`}
                style={bgStyle}
              >
                {/* Day number + no-spend star */}
                <div className="flex items-center justify-between w-full">
                  <span className={`text-[11px] font-bold ${
                    today ? 'text-accent' : hasExpenses ? 'text-cream-700 dark:text-cream-200' : isNoSpend ? 'text-success/70' : 'text-cream-400'
                  }`}>
                    {data.dayNum}
                  </span>
                  {isNoSpend && (
                    <span className="text-[8px] text-success">✓</span>
                  )}
                </div>

                {/* Amount */}
                <div className="mt-auto w-full">
                  {hasExpenses && (
                    <span className="block text-[7px] sm:text-[8px] text-danger font-bold money truncate leading-tight">
                      {formatCurrency(data.expenseTotal, currency).replace(/\s/g, '')}
                    </span>
                  )}
                  {hasIncome && (
                    <span className="block text-[7px] sm:text-[8px] text-income font-bold money truncate leading-tight">
                      +{formatCurrency(data.incomeTotal, currency).replace(/\s/g, '')}
                    </span>
                  )}
                </div>

                {/* Category dots + bill indicator */}
                {(data.categories.length > 0 || hasBills) && (
                  <div className="flex items-center gap-[2px] mt-[1px]">
                    {hasBills && (
                      <span className="w-[5px] h-[5px] rounded-full bg-warning shrink-0 ring-1 ring-warning/30" />
                    )}
                    {data.categories.slice(0, 4).map((catId, i) => (
                      <span
                        key={i}
                        className="w-[5px] h-[5px] rounded-full shrink-0"
                        style={{ backgroundColor: getCatColor(catId) }}
                      />
                    ))}
                    {data.categories.length > 4 && (
                      <span className="text-[6px] text-cream-400">+{data.categories.length - 4}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-3 pt-3 border-t border-cream-100 dark:border-dark-border">
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="w-3 h-3 rounded bg-danger/15" /> {t('calendar.spending')}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="w-3 h-3 rounded bg-success/10 flex items-center justify-center text-[6px] text-success">✓</div> {t('calendar.noSpend')}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="w-[5px] h-[5px] rounded-full bg-warning" /> {t('calendar.billsDue')}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="flex gap-[2px]">
              <div className="w-[5px] h-[5px] rounded-full bg-danger" />
              <div className="w-[5px] h-[5px] rounded-full bg-accent" />
              <div className="w-[5px] h-[5px] rounded-full bg-success" />
            </div>
            {t('calendar.categories')}
          </div>
        </div>
      </div>

      {/* Weekly summaries */}
      {weeklySummaries.length > 0 && (
        <div className="card p-3 sm:p-4">
          <h3 className="section-title">{t('calendar.weeklySummary')}</h3>
          <div className="space-y-3">
            {weeklySummaries.map((week, wi) => {
              const sparkMax = Math.max(...week.dailyAmounts, 1);
              return (
                <div key={wi} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-cream-600 dark:text-cream-300">{week.label}</p>
                    <p className="text-[10px] text-cream-400">{week.txCount} {t('calendar.transactionsTitle').toLowerCase()}</p>
                  </div>
                  {/* Mini sparkline */}
                  <div className="flex items-end gap-[2px] h-5 shrink-0">
                    {week.dailyAmounts.map((amt, di) => (
                      <div
                        key={di}
                        className="w-[4px] rounded-t-sm transition-all"
                        style={{
                          height: `${Math.max((amt / sparkMax) * 100, amt > 0 ? 15 : 4)}%`,
                          backgroundColor: amt > 0 ? `rgba(225, 29, 72, ${0.3 + (amt / sparkMax) * 0.7})` : 'rgba(0,0,0,0.06)',
                        }}
                      />
                    ))}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-heading font-bold money text-danger">{formatCurrency(week.total, currency)}</p>
                    <p className="text-[10px] text-cream-400">{t('calendar.avgPerDay', { amount: formatCurrency(week.avg, currency) })}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Busiest day highlight */}
      {monthStats.busiestDay.expenseTotal > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-danger/5 border border-danger/10">
          <span className="text-xl">💸</span>
          <div className="flex-1">
            <p className="text-xs font-medium text-cream-600 dark:text-cream-300">
              {t('calendar.busiestDay', { date: format(monthStats.busiestDay.day, 'EEEE, MMM d') })}
            </p>
            <p className="text-sm font-heading font-bold money text-danger">{formatCurrency(monthStats.busiestDay.expenseTotal, currency)}</p>
          </div>
        </div>
      )}

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
                    {/* Category breakdown in modal */}
                    <div className="flex gap-1 mt-2">
                      {selectedDayData.categories.map((catId, i) => {
                        const cat = getCategoryById(catId);
                        return (
                          <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-dark-border" style={{ borderLeft: `2px solid ${getCatColor(catId)}` }}>
                            {cat.icon} {cat.name}
                          </span>
                        );
                      })}
                    </div>
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
