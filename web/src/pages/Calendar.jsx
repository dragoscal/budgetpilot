import { useState, useEffect, useMemo, useCallback } from 'react';
import { transactions as txApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency, getCategoryById, sortByDate, sumAmountsMultiCurrency } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import MonthPicker from '../components/MonthPicker';
import TransactionRow from '../components/TransactionRow';
import { SkeletonPage } from '../components/LoadingSkeleton';
import {
  startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, isToday,
  startOfWeek, addDays, addWeeks, subWeeks,
} from 'date-fns';
import HelpButton from '../components/HelpButton';
import {
  TrendingDown, TrendingUp, Zap, Flame, Star, Landmark, Bell,
  CalendarDays, CalendarRange, ChevronLeft, ChevronRight, X, CheckCircle2,
} from 'lucide-react';

/* ─── Category color palette ─────────────────────────────────── */
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

/* ─── Inline sub-components ──────────────────────────────────── */

function TransactionChip({ tx, currency, className = '' }) {
  const cat = getCategoryById(tx.category);
  const isIncome = tx.type === 'income';
  const label = tx.merchant || tx.description || cat.name;
  return (
    <div className={`flex items-center gap-1 px-1 py-[2px] rounded text-[10px] font-medium truncate w-full leading-tight ${
      isIncome
        ? 'bg-success/10 text-success dark:bg-success/15'
        : 'bg-danger/8 text-danger/90 dark:bg-danger/12 dark:text-danger'
    } ${className}`}>
      <span className="truncate">{label}</span>
      <span className="ml-auto shrink-0 money text-[9px] font-bold">
        {isIncome ? '+' : ''}{formatCurrency(tx.amount, tx.currency || currency).replace(/\s/g, '')}
      </span>
    </div>
  );
}

function BillChip({ bill, currency, className = '' }) {
  const isAuto = !!bill.autoDebit;
  return (
    <div className={`flex items-center gap-1 px-1 py-[2px] rounded text-[10px] font-medium truncate w-full leading-tight border border-dashed ${
      isAuto
        ? 'bg-accent/5 border-accent/25 text-accent dark:bg-accent/10'
        : 'bg-warning/5 border-warning/25 text-warning dark:bg-warning/10'
    } ${className}`}>
      <span className="truncate">{bill.name}</span>
      <span className="ml-auto shrink-0 money text-[9px] font-bold">
        {formatCurrency(bill.amount, bill.currency || currency).replace(/\s/g, '')}
      </span>
    </div>
  );
}

function ViewToggle({ viewMode, setViewMode, t }) {
  return (
    <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden text-xs">
      <button onClick={() => setViewMode('month')}
        className={`px-2.5 sm:px-3 py-1.5 font-medium transition-colors flex items-center gap-1 ${
          viewMode === 'month'
            ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
            : 'text-cream-600 hover:bg-cream-100 dark:text-cream-400 dark:hover:bg-dark-border'
        }`}>
        <CalendarDays size={13} />
        <span className="hidden sm:inline">{t('calendar.monthView')}</span>
      </button>
      <button onClick={() => setViewMode('week')}
        className={`px-2.5 sm:px-3 py-1.5 font-medium transition-colors flex items-center gap-1 ${
          viewMode === 'week'
            ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
            : 'text-cream-600 hover:bg-cream-100 dark:text-cream-400 dark:hover:bg-dark-border'
        }`}>
        <CalendarRange size={13} />
        <span className="hidden sm:inline">{t('calendar.weekView')}</span>
      </button>
    </div>
  );
}

function WeekPicker({ weekStart, onChange }) {
  const end = addDays(weekStart, 6);
  const label = `${format(weekStart, 'MMM d')} – ${format(end, 'MMM d, yyyy')}`;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(subWeeks(weekStart, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 transition-colors">
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium min-w-[160px] text-center">{label}</span>
      <button onClick={() => onChange(addWeeks(weekStart, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 transition-colors">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function CalendarStats({ monthStats, currency, t }) {
  const items = [
    { icon: TrendingDown, label: t('calendar.totalSpent'), value: formatCurrency(monthStats.totalExpenses, currency), color: 'text-danger' },
    { icon: TrendingUp, label: t('calendar.totalIncome'), value: formatCurrency(monthStats.totalIncome, currency), color: 'text-income' },
    { icon: Zap, label: t('calendar.dailyAvg'), value: formatCurrency(monthStats.pastDayCount > 0 ? monthStats.totalExpenses / monthStats.pastDayCount : 0, currency), color: '' },
    { icon: Flame, label: t('calendar.noSpendDays'), value: monthStats.noSpendDays, color: 'text-success' },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
      {items.map((item, i) => (
        <div key={i} className="card !p-2 sm:!p-3">
          <div className="flex items-center gap-1 mb-0.5">
            <item.icon size={11} className={`shrink-0 ${item.color || 'text-accent'}`} />
            <p className="text-[8px] sm:text-[10px] text-cream-500 uppercase tracking-wider truncate">{item.label}</p>
          </div>
          <p className={`font-heading font-bold text-xs sm:text-base money ${item.color}`}>{item.value}</p>
        </div>
      ))}
    </div>
  );
}

function DayDetailPanel({ dayData, selectedDay, currency, t, onClose }) {
  if (!dayData) return null;
  const dayDate = new Date(selectedDay + 'T00:00:00');
  const isPast = dayDate <= new Date();
  const noSpend = isPast && dayData.expenseTotal === 0 && dayData.incomeTotal === 0;

  return (
    <div className="card p-4 space-y-4 animate-fadeUp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-cream-500 uppercase tracking-wider">{format(dayDate, 'EEEE')}</p>
          <p className="font-heading font-bold text-lg">{format(dayDate, 'dd MMMM yyyy')}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-dark-border text-cream-400 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Summary cards */}
      {(dayData.expenseTotal > 0 || dayData.incomeTotal > 0) && (
        <div className="flex gap-2">
          {dayData.expenseTotal > 0 && (
            <div className="flex-1 p-2.5 rounded-xl bg-danger/5 border border-danger/10">
              <p className="text-[10px] text-cream-500 uppercase">{t('calendar.expenses')}</p>
              <p className="font-heading font-bold text-base money text-danger">{formatCurrency(dayData.expenseTotal, currency)}</p>
            </div>
          )}
          {dayData.incomeTotal > 0 && (
            <div className="flex-1 p-2.5 rounded-xl bg-success/5 border border-success/10">
              <p className="text-[10px] text-cream-500 uppercase">{t('calendar.income')}</p>
              <p className="font-heading font-bold text-base money text-income">{formatCurrency(dayData.incomeTotal, currency)}</p>
            </div>
          )}
        </div>
      )}

      {/* No-spend celebration */}
      {noSpend && (
        <div className="text-center py-3">
          <span className="text-2xl">🌟</span>
          <p className="text-sm font-medium text-success mt-1">{t('calendar.noSpendDay')}</p>
        </div>
      )}

      {/* Bills */}
      {dayData.bills.length > 0 && (
        <div>
          <h4 className="section-title">{t('calendar.billsDue')}</h4>
          <div className="space-y-1.5">
            {dayData.bills.map((b) => {
              const cat = getCategoryById(b.category);
              const isAuto = !!b.autoDebit;
              // Check if this bill has been paid (transaction exists)
              const isPaid = dayData.transactions.some(tx =>
                tx.recurringId === b.id ||
                (tx.source === 'recurring' && tx.merchant === (b.name || b.merchant) && Math.abs(tx.amount - b.amount) < 0.01)
              );
              return (
                <div key={b.id} className="flex items-center justify-between py-2 px-2.5 rounded-xl bg-cream-50 dark:bg-dark-border/30 text-sm">
                  <span className="flex items-center gap-2">
                    {isAuto ? <Landmark size={13} className="text-accent" /> : <Bell size={13} className="text-warning" />}
                    <span>{cat.icon} {b.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${isAuto ? 'bg-accent/10 text-accent' : 'bg-warning/10 text-warning'}`}>
                      {isAuto ? t('recurring.autoLabel') : t('recurring.manualLabel')}
                    </span>
                    {isPaid ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-success/10 text-success flex items-center gap-0.5">
                        <CheckCircle2 size={10} /> {t('calendar.billPaid')}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-cream-200 dark:bg-dark-border text-cream-500">
                        {t('calendar.billPending')}
                      </span>
                    )}
                  </span>
                  <span className="money font-bold text-sm">{formatCurrency(b.amount, b.currency || currency)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transactions */}
      {dayData.transactions.length > 0 && (
        <div>
          <h4 className="section-title">{t('calendar.transactionsTitle')}</h4>
          <div className="divide-y divide-cream-100 dark:divide-dark-border">
            {sortByDate(dayData.transactions).map((tx) => <TransactionRow key={tx.id} transaction={tx} />)}
          </div>
        </div>
      )}

      {dayData.transactions.length === 0 && dayData.bills.length === 0 && !isPast && (
        <div className="text-center py-6">
          <p className="text-sm text-cream-400">{t('calendar.nothingPlanned')}</p>
        </div>
      )}

      {dayData.transactions.length === 0 && dayData.bills.length === 0 && isPast && !noSpend && (
        <p className="text-sm text-cream-500 text-center py-4">{t('calendar.noTransactions')}</p>
      )}

      {/* Category breakdown */}
      {dayData.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-cream-100 dark:border-dark-border">
          {dayData.categories.map((catId, i) => {
            const cat = getCategoryById(catId);
            return (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-full bg-cream-100 dark:bg-dark-border"
                style={{ borderLeft: `3px solid ${getCatColor(catId)}` }}>
                {cat.icon} {cat.name}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MobileBottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden max-h-[80vh] overflow-y-auto bg-white dark:bg-dark-card border-t border-cream-200 dark:border-dark-border rounded-t-2xl shadow-xl animate-slide-up">
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white dark:bg-dark-card z-10">
          <div className="w-10 h-1 rounded-full bg-cream-300 dark:bg-dark-border" />
        </div>
        <div className="px-4 pb-6">{children}</div>
      </div>
    </>
  );
}

/* ─── Main Calendar Page ─────────────────────────────────────── */

export default function CalendarPage() {
  const { t } = useTranslation();
  const { user, effectiveUserId } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [recurringItems, setRecurring] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rates, setRates] = useState(null);
  const [viewMode, setViewMode] = useState('month');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthTransition, setMonthTransition] = useState(null);

  const currency = user?.defaultCurrency || 'RON';

  /* ─── Data fetching ─── */
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

  /* ─── Derived data ─── */
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  const dayData = useMemo(() => {
    const map = {};
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      const dayNum = day.getDate();
      const dayTx = transactions.filter((t) => t.date === key);
      const dayBills = recurringItems.filter((r) => (r.billingDay || 1) === dayNum);
      const autoDebitBills = dayBills.filter((r) => r.autoDebit);
      const manualBills = dayBills.filter((r) => !r.autoDebit);
      const expenses = dayTx.filter((t) => t.type === 'expense');
      const expenseTotal = sumAmountsMultiCurrency(expenses, currency, rates);
      const incomeTotal = sumAmountsMultiCurrency(dayTx.filter((t) => t.type === 'income'), currency, rates);
      const categories = [...new Set(expenses.map((t) => t.category))];
      map[key] = { day, dayNum, transactions: dayTx, bills: dayBills, autoDebitBills, manualBills, expenseTotal, incomeTotal, count: dayTx.length, categories };
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

  const maxExpense = useMemo(() => Math.max(...Object.values(dayData).map((d) => d.expenseTotal), 1), [dayData]);

  /* ─── Grid rows (month view) ─── */
  const firstDayOfWeek = getDay(startOfMonth(month));
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1;

  const gridRows = useMemo(() => {
    const cells = [...Array(offset).fill(null), ...days];
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const rowDays = cells.slice(i, i + 7);
      while (rowDays.length < 7) rowDays.push(null);
      rows.push(rowDays);
    }
    return rows;
  }, [offset, days]);

  /* ─── Week view days ─── */
  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }), [weekStart]);

  const selectedDayData = selectedDay ? dayData[selectedDay] : null;

  /* ─── Handlers ─── */
  const handleDayClick = useCallback((key) => {
    setSelectedDay((prev) => prev === key ? null : key);
  }, []);

  const handleMonthChange = useCallback((newMonth) => {
    const dir = newMonth > month ? 'left' : 'right';
    setMonthTransition(dir);
    setTimeout(() => {
      setMonth(newMonth);
      setMonthTransition(null);
    }, 150);
  }, [month]);

  if (loading) return <SkeletonPage />;

  const dayNames = [t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun')];

  return (
    <div className="space-y-4">
      {/* ─── Header ─── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="page-title mb-0">{t('calendar.title')}</h1>
            <HelpButton section="calendar" />
          </div>
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} t={t} />
        </div>
        <div className="flex justify-end">
          {viewMode === 'month'
            ? <MonthPicker value={month} onChange={handleMonthChange} />
            : <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
          }
        </div>
      </div>

      {/* ─── Compact stats ─── */}
      <CalendarStats monthStats={monthStats} currency={currency} t={t} />

      {/* ─── Streak banner ─── */}
      {monthStats.streak >= 2 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-success/10 to-accent/10 border border-success/20">
          <Star size={18} className="text-success shrink-0" />
          <div>
            <p className="text-sm font-bold text-success">{t('calendar.streakTitle', { count: monthStats.streak })}</p>
            <p className="text-[11px] text-cream-500">{t('calendar.streakDesc')}</p>
          </div>
        </div>
      )}

      {/* ─── Main content: grid + detail panel ─── */}
      <div className="flex gap-4 items-start">
        {/* Calendar grid card */}
        <div className="flex-1 min-w-0">
          <div className="card p-1.5 sm:p-3 lg:p-4 overflow-hidden">
            {viewMode === 'month' ? (
              <>
                {/* Day name headers */}
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {dayNames.map((d) => (
                    <div key={d} className="text-center text-[10px] sm:text-[11px] font-semibold text-cream-400 uppercase tracking-wider py-1.5">{d}</div>
                  ))}
                </div>

                {/* Month grid with transition */}
                <div className={`transition-all duration-200 ${
                  monthTransition === 'left' ? 'opacity-0 -translate-x-3' :
                  monthTransition === 'right' ? 'opacity-0 translate-x-3' :
                  'opacity-100 translate-x-0'
                }`}>
                  <div className="space-y-1">
                    {gridRows.map((rowDays, ri) => (
                      <div key={ri} className="grid grid-cols-7 gap-1">
                        {rowDays.map((day, ci) => {
                          if (!day) {
                            return <div key={`e-${ri}-${ci}`} className="h-16 sm:h-24 lg:h-28 rounded-lg sm:rounded-xl bg-cream-50/30 dark:bg-dark-border/10" />;
                          }

                          const key = format(day, 'yyyy-MM-dd');
                          const data = dayData[key];
                          const today = isToday(day);
                          const isFuture = day > new Date();
                          const isPast = !isFuture && !today;
                          const hasExpenses = data.expenseTotal > 0;
                          const isNoSpend = isPast && !hasExpenses;
                          const isSelected = selectedDay === key;
                          const intensity = hasExpenses ? Math.min(data.expenseTotal / maxExpense, 1) : 0;

                          // Combine bills + transactions for chips
                          const allChips = [
                            ...data.bills.map((b) => ({ ...b, _type: 'bill' })),
                            ...data.transactions,
                          ];

                          let bgStyle;
                          if (!today && !isSelected && hasExpenses) {
                            bgStyle = { backgroundColor: `rgba(225, 29, 72, ${0.03 + intensity * 0.10})` };
                          } else if (!today && !isSelected && isNoSpend) {
                            bgStyle = { backgroundColor: 'rgba(5, 150, 105, 0.03)' };
                          }

                          const borderClass = today
                            ? 'border-accent/40'
                            : isSelected
                              ? 'border-accent/30'
                              : 'border-transparent hover:border-cream-200 dark:hover:border-dark-border';

                          const bgClass = today
                            ? 'bg-accent/5 dark:bg-accent/10'
                            : isSelected
                              ? 'bg-accent/[0.06] dark:bg-accent/10'
                              : isFuture
                                ? 'opacity-40'
                                : '';

                          return (
                            <button
                              key={key}
                              onClick={() => handleDayClick(key)}
                              className={`h-16 sm:h-24 lg:h-28 p-1 sm:p-1.5 rounded-lg sm:rounded-xl text-left flex flex-col transition-all duration-150 relative group border ${borderClass} ${bgClass}`}
                              style={bgStyle}
                            >
                              {/* Day number row */}
                              <div className="flex items-center justify-between w-full">
                                {today ? (
                                  <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-accent text-white flex items-center justify-center text-[9px] sm:text-[11px] font-bold leading-none">
                                    {data.dayNum}
                                  </span>
                                ) : (
                                  <span className={`text-[10px] sm:text-xs font-bold ${
                                    hasExpenses ? 'text-cream-800 dark:text-cream-100' : isNoSpend ? 'text-success/70' : 'text-cream-400'
                                  }`}>
                                    {data.dayNum}
                                  </span>
                                )}
                                {(data.bills.length > 0) && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                                )}
                              </div>

                              {/* Mobile: compact summary (no chips) */}
                              <div className="flex-1 flex flex-col justify-end w-full sm:hidden">
                                {hasExpenses && (
                                  <span className="text-[9px] text-danger font-bold money leading-tight">
                                    {formatCurrency(data.expenseTotal, currency).replace(/\s/g, '')}
                                  </span>
                                )}
                                {data.incomeTotal > 0 && (
                                  <span className="text-[9px] text-success font-bold money leading-tight">
                                    +{formatCurrency(data.incomeTotal, currency).replace(/\s/g, '')}
                                  </span>
                                )}
                                {allChips.length > 0 && (
                                  <span className="text-[8px] text-cream-400 font-medium">
                                    {allChips.length} {allChips.length === 1 ? 'tx' : 'txs'}
                                  </span>
                                )}
                              </div>

                              {/* Desktop: transaction chips */}
                              <div className="flex-1 space-y-[2px] overflow-hidden w-full hidden sm:flex sm:flex-col mt-0.5">
                                {allChips.slice(0, 2).map((chip, ci) => (
                                  chip._type === 'bill'
                                    ? <BillChip key={chip.id || ci} bill={chip} currency={currency} />
                                    : <TransactionChip key={chip.id || ci} tx={chip} currency={currency} />
                                ))}
                                {/* Third chip only on lg */}
                                {allChips[2] && (
                                  allChips[2]._type === 'bill'
                                    ? <BillChip key={allChips[2].id || 2} bill={allChips[2]} currency={currency} className="hidden lg:flex" />
                                    : <TransactionChip key={allChips[2].id || 2} tx={allChips[2]} currency={currency} className="hidden lg:flex" />
                                )}
                                {allChips.length > 2 && (
                                  <span className="text-[9px] font-medium text-accent lg:hidden">
                                    +{allChips.length - 2}
                                  </span>
                                )}
                                {allChips.length > 3 && (
                                  <span className="text-[9px] font-medium text-accent hidden lg:inline">
                                    +{allChips.length - 3}
                                  </span>
                                )}
                              </div>

                              {/* No-spend indicator */}
                              {isNoSpend && allChips.length === 0 && (
                                <div className="absolute bottom-1 right-1 sm:bottom-1 sm:right-1.5">
                                  <CheckCircle2 size={10} className="text-success/50" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              /* ─── Week View ─── */
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {weekDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const today = isToday(day);
                    return (
                      <div key={key} className="text-center py-1">
                        <p className="text-[9px] sm:text-[10px] uppercase text-cream-400 tracking-wider font-semibold">
                          {format(day, 'EEE')}
                        </p>
                        {today ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-accent text-white text-xs sm:text-sm font-bold mt-0.5">
                            {format(day, 'd')}
                          </span>
                        ) : (
                          <p className="text-xs sm:text-sm font-bold mt-0.5 text-cream-700 dark:text-cream-200">{format(day, 'd')}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Day columns */}
                <div className="grid grid-cols-7 gap-1" style={{ minHeight: '18rem' }}>
                  {weekDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const data = dayData[key];
                    const isSelected = selectedDay === key;
                    const today = isToday(day);
                    const isFuture = day > new Date();

                    // If day not in current month's data, show empty
                    if (!data) {
                      return (
                        <button key={key} onClick={() => handleDayClick(key)}
                          className="rounded-lg bg-cream-50/30 dark:bg-dark-border/10 p-1 text-left opacity-40">
                          <p className="text-[10px] text-cream-400 text-center">{format(day, 'd')}</p>
                        </button>
                      );
                    }

                    return (
                      <button
                        key={key}
                        onClick={() => handleDayClick(key)}
                        className={`rounded-lg p-1 sm:p-1.5 text-left flex flex-col gap-[2px] transition-all border ${
                          isSelected ? 'border-accent/30 bg-accent/5 dark:bg-accent/10' :
                          today ? 'border-accent/15 bg-accent/[0.02]' :
                          isFuture ? 'border-transparent opacity-40' :
                          'border-transparent hover:border-cream-200 dark:hover:border-dark-border bg-white dark:bg-dark-card'
                        }`}
                      >
                        {/* Chips — hidden on mobile, shown on sm+ */}
                        <div className="hidden sm:flex sm:flex-col gap-[2px]">
                          {data.bills.map((b) => <BillChip key={b.id} bill={b} currency={currency} />)}
                          {sortByDate(data.transactions, 'date', 'asc').map((tx) => (
                            <TransactionChip key={tx.id} tx={tx} currency={currency} />
                          ))}
                        </div>

                        {/* Mobile summary */}
                        <div className="sm:hidden flex flex-col items-center justify-center flex-1 gap-0.5">
                          {data.expenseTotal > 0 && (
                            <span className="text-[9px] font-bold money text-danger">
                              {formatCurrency(data.expenseTotal, currency).replace(/\s/g, '')}
                            </span>
                          )}
                          {data.count > 0 && (
                            <span className="text-[8px] text-cream-400">{data.count} tx</span>
                          )}
                        </div>

                        {/* Daily total — desktop */}
                        {data.expenseTotal > 0 && (
                          <div className="mt-auto pt-1 border-t border-cream-100 dark:border-dark-border hidden sm:block">
                            <span className="text-[10px] font-bold money text-danger">
                              {formatCurrency(data.expenseTotal, currency).replace(/\s/g, '')}
                            </span>
                          </div>
                        )}

                        {/* No spend */}
                        {data.expenseTotal === 0 && data.transactions.length === 0 && !isFuture && (
                          <div className="flex items-center justify-center flex-1">
                            <CheckCircle2 size={12} className="text-success/40" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* ─── Desktop side panel ─── */}
        <div className={`hidden lg:block w-80 shrink-0 sticky top-4 transition-all duration-300 ${
          selectedDay ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
        }`}>
          {selectedDay && (
            <DayDetailPanel
              dayData={selectedDayData}
              selectedDay={selectedDay}
              currency={currency}
              t={t}
              onClose={() => setSelectedDay(null)}
            />
          )}
        </div>
      </div>

      {/* ─── Mobile bottom sheet ─── */}
      <MobileBottomSheet open={!!selectedDay} onClose={() => setSelectedDay(null)}>
        <DayDetailPanel
          dayData={selectedDayData}
          selectedDay={selectedDay}
          currency={currency}
          t={t}
          onClose={() => setSelectedDay(null)}
        />
      </MobileBottomSheet>
    </div>
  );
}
