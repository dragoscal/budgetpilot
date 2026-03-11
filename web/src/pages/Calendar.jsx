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
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, isToday, startOfWeek } from 'date-fns';
import HelpButton from '../components/HelpButton';
import { TrendingDown, TrendingUp, Zap, Flame, Star } from 'lucide-react';

// Category color palette
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

  // Weekly totals
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

  const maxExpense = useMemo(() => Math.max(...Object.values(dayData).map((d) => d.expenseTotal), 1), [dayData]);

  const firstDayOfWeek = getDay(startOfMonth(month));
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  // Build grid rows
  const gridRows = useMemo(() => {
    const cells = [...Array(offset).fill(null), ...days];
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const rowDays = cells.slice(i, i + 7);
      while (rowDays.length < 7) rowDays.push(null);
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('calendar.title')}</h1>
          <HelpButton section="calendar" />
        </div>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={14} className="text-danger" />
            <p className="text-[11px] text-cream-500 uppercase tracking-wider">{t('calendar.totalSpent')}</p>
          </div>
          <p className="font-heading font-bold text-base money text-danger">{formatCurrency(monthStats.totalExpenses, currency)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={14} className="text-income" />
            <p className="text-[11px] text-cream-500 uppercase tracking-wider">{t('calendar.totalIncome')}</p>
          </div>
          <p className="font-heading font-bold text-base money text-income">{formatCurrency(monthStats.totalIncome, currency)}</p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={14} className="text-accent" />
            <p className="text-[11px] text-cream-500 uppercase tracking-wider">{t('calendar.dailyAvg')}</p>
          </div>
          <p className="font-heading font-bold text-base money">
            {formatCurrency(monthStats.pastDayCount > 0 ? monthStats.totalExpenses / monthStats.pastDayCount : 0, currency)}
          </p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={14} className="text-success" />
            <p className="text-[11px] text-cream-500 uppercase tracking-wider">{t('calendar.noSpendDays')}</p>
          </div>
          <p className="font-heading font-bold text-base text-success">{monthStats.noSpendDays}</p>
        </div>
      </div>

      {/* Streak banner */}
      {monthStats.streak >= 2 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-success/10 to-accent/10 border border-success/20">
          <Star size={18} className="text-success shrink-0" />
          <div>
            <p className="text-sm font-bold text-success">{t('calendar.streakTitle', { count: monthStats.streak })}</p>
            <p className="text-[11px] text-cream-500">{t('calendar.streakDesc')}</p>
          </div>
        </div>
      )}

      {/* Calendar grid */}
      <div className="card p-3 sm:p-5">
        {/* Day name headers */}
        <div className="grid grid-cols-[repeat(7,1fr)_4.5rem] gap-1 mb-1">
          {[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun')].map((d) => (
            <div key={d} className="text-center text-[11px] font-semibold text-cream-400 uppercase tracking-wider py-1.5">{d}</div>
          ))}
          <div className="text-center text-[11px] font-semibold text-cream-400 uppercase tracking-wider py-1.5">{t('calendar.week')}</div>
        </div>

        {/* Grid rows */}
        <div className="space-y-1">
          {gridRows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-[repeat(7,1fr)_4.5rem] gap-1">
              {row.days.map((day, ci) => {
                if (!day) {
                  return <div key={`empty-${ri}-${ci}`} className="h-16 sm:h-[4.5rem] rounded-lg bg-cream-50/50 dark:bg-dark-border/20" />;
                }

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

                let bgStyle = undefined;
                if (hasExpenses && !today) {
                  bgStyle = { backgroundColor: `rgba(225, 29, 72, ${0.04 + intensity * 0.12})` };
                } else if (isNoSpend && !today) {
                  bgStyle = { backgroundColor: 'rgba(5, 150, 105, 0.04)' };
                }

                return (
                  <button
                    key={key}
                    onClick={() => setSelectedDay(key)}
                    className={`h-16 sm:h-[4.5rem] p-1.5 rounded-lg text-left flex flex-col transition-all relative ${
                      today
                        ? 'ring-2 ring-accent bg-accent/5'
                        : selectedDay === key
                          ? 'ring-2 ring-accent/40 bg-cream-50 dark:bg-dark-border/50'
                          : isFuture
                            ? 'opacity-35'
                            : 'hover:bg-cream-100/60 dark:hover:bg-dark-border/40'
                    } ${!bgStyle && !today ? 'bg-white dark:bg-dark-card' : ''}`}
                    style={bgStyle}
                  >
                    {/* Day number row */}
                    <div className="flex items-center justify-between w-full">
                      <span className={`text-xs font-bold ${
                        today ? 'text-accent' : hasExpenses ? 'text-cream-800 dark:text-cream-100' : isNoSpend ? 'text-success/80' : 'text-cream-400'
                      }`}>
                        {data.dayNum}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {hasBills && <span className="w-1.5 h-1.5 rounded-full bg-warning" />}
                        {isNoSpend && <span className="text-[9px] text-success font-medium">✓</span>}
                      </div>
                    </div>

                    {/* Bottom area: amount + dots */}
                    <div className="mt-auto w-full space-y-0.5">
                      {hasExpenses && (
                        <span className="block text-[10px] sm:text-[11px] text-danger font-bold money truncate leading-tight">
                          {formatCurrency(data.expenseTotal, currency).replace(/\s/g, '')}
                        </span>
                      )}
                      {hasIncome && (
                        <span className="block text-[10px] sm:text-[11px] text-income font-bold money truncate leading-tight">
                          +{formatCurrency(data.incomeTotal, currency).replace(/\s/g, '')}
                        </span>
                      )}
                      {data.categories.length > 0 && (
                        <div className="flex items-center gap-[3px]">
                          {data.categories.slice(0, 4).map((catId, i) => (
                            <span key={i} className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getCatColor(catId) }} />
                          ))}
                          {data.categories.length > 4 && <span className="text-[8px] text-cream-400">+{data.categories.length - 4}</span>}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

              {/* Weekly total */}
              <div className="h-16 sm:h-[4.5rem] rounded-lg bg-cream-50 dark:bg-dark-border/30 flex flex-col items-center justify-center px-1">
                {row.weekTotal > 0 ? (
                  <span className="text-[11px] font-bold money text-danger text-center leading-tight">
                    {formatCurrency(row.weekTotal, currency).replace(/\s/g, '')}
                  </span>
                ) : (
                  <span className="text-xs text-cream-300">—</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-center gap-4 mt-4 pt-3 border-t border-cream-100 dark:border-dark-border">
          <div className="flex items-center gap-1.5 text-[11px] text-cream-400">
            <div className="w-3 h-3 rounded bg-danger/12" /> {t('calendar.spending')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-cream-400">
            <div className="w-3 h-3 rounded bg-success/10 flex items-center justify-center text-[7px] text-success">✓</div> {t('calendar.noSpend')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-cream-400">
            <div className="w-1.5 h-1.5 rounded-full bg-warning" /> {t('calendar.billsDue')}
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-cream-400">
            <div className="flex gap-[3px]">
              <div className="w-1.5 h-1.5 rounded-full bg-danger" />
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
              <div className="w-1.5 h-1.5 rounded-full bg-success" />
            </div>
            {t('calendar.categories')}
          </div>
        </div>
      </div>

      {/* Day detail modal */}
      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(new Date(selectedDay), 'EEEE, dd MMMM yyyy') : ''} wide>
        {selectedDayData && (
          <div className="space-y-4">
            {(selectedDayData.expenseTotal > 0 || selectedDayData.incomeTotal > 0) && (
              <div className="flex gap-3">
                {selectedDayData.expenseTotal > 0 && (
                  <div className="flex-1 p-3 rounded-xl bg-danger/5">
                    <p className="text-[11px] text-cream-500 uppercase">{t('calendar.expenses')}</p>
                    <p className="font-heading font-bold text-lg money text-danger">{formatCurrency(selectedDayData.expenseTotal, currency)}</p>
                    {selectedDayData.categories.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {selectedDayData.categories.map((catId, i) => {
                          const cat = getCategoryById(catId);
                          return (
                            <span key={i} className="text-[11px] px-1.5 py-0.5 rounded-full bg-white/60 dark:bg-dark-border" style={{ borderLeft: `2px solid ${getCatColor(catId)}` }}>
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
                    <p className="text-[11px] text-cream-500 uppercase">{t('calendar.income')}</p>
                    <p className="font-heading font-bold text-lg money text-income">{formatCurrency(selectedDayData.incomeTotal, currency)}</p>
                  </div>
                )}
              </div>
            )}

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
