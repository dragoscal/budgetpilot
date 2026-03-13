import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

/* ─── Compact currency — strip trailing ,00 / .00 for whole amounts ─── */
function fmtAmt(amount, currency, { compact = false } = {}) {
  const full = formatCurrency(amount, currency);
  const stripped = full.replace(/[,.]00(?=\s|$)/, '');
  return compact ? stripped.replace(/\s/g, '') : stripped;
}

/* ─── Chip amount — number only, no currency symbol (for tight grid cells) ─── */
function chipAmt(amount, currency) {
  const full = fmtAmt(amount, currency, { compact: true });
  return full.replace(/[^\d.,]/g, '');
}

/* ─── Sub-components ──────────────────────────────────────── */

function ViewToggle({ viewMode, setViewMode, t }) {
  return (
    <div className="flex rounded-lg border border-cream-200 dark:border-cream-700 overflow-hidden text-xs">
      <button onClick={() => setViewMode('month')}
        className={`px-2.5 sm:px-3 py-1.5 font-medium transition-colors flex items-center gap-1 ${
          viewMode === 'month'
            ? 'bg-accent-600 text-white dark:bg-accent-500'
            : 'text-cream-600 hover:bg-cream-100 dark:text-cream-400 dark:hover:bg-cream-800'
        }`}>
        <CalendarDays size={13} />
        <span className="hidden sm:inline">{t('calendar.monthView')}</span>
      </button>
      <button onClick={() => setViewMode('week')}
        className={`px-2.5 sm:px-3 py-1.5 font-medium transition-colors flex items-center gap-1 ${
          viewMode === 'week'
            ? 'bg-accent-600 text-white dark:bg-accent-500'
            : 'text-cream-600 hover:bg-cream-100 dark:text-cream-400 dark:hover:bg-cream-800'
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
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-cream-800 text-cream-500 transition-colors">
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium min-w-[160px] text-center">{label}</span>
      <button onClick={() => onChange(addWeeks(weekStart, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-cream-800 text-cream-500 transition-colors">
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function CalendarStats({ monthStats, currency, t }) {
  const items = [
    { icon: TrendingDown, label: t('calendar.totalSpent'), value: fmtAmt(monthStats.totalExpenses, currency), color: 'text-danger', bg: 'bg-danger/8' },
    { icon: TrendingUp, label: t('calendar.totalIncome'), value: fmtAmt(monthStats.totalIncome, currency), color: 'text-success', bg: 'bg-success/8' },
    { icon: Zap, label: t('calendar.dailyAvg'), value: fmtAmt(monthStats.pastDayCount > 0 ? monthStats.totalExpenses / monthStats.pastDayCount : 0, currency), color: 'text-accent-600 dark:text-accent-400', bg: 'bg-accent-50 dark:bg-accent-500/10' },
    { icon: Flame, label: t('calendar.noSpendDays'), value: monthStats.noSpendDays, color: 'text-success', bg: 'bg-success/8' },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
      {items.map((item, i) => (
        <div key={i} className="card !p-3 sm:!p-4">
          <div className="flex items-center gap-2 mb-1.5">
            <div className={`w-6 h-6 rounded-md ${item.bg} flex items-center justify-center shrink-0`}>
              <item.icon size={13} strokeWidth={1.5} className={item.color} />
            </div>
            <p className="text-[10px] sm:text-[11px] text-cream-500 uppercase tracking-wider font-semibold truncate">
              {item.label}
            </p>
          </div>
          <p className={`stat-value text-base sm:text-lg leading-tight ${item.color}`}>
            {item.value}
          </p>
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
    <div className="card !p-4 space-y-4 animate-fadeUp">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] text-cream-500 uppercase tracking-wider font-medium">{format(dayDate, 'EEEE')}</p>
          <p className="font-bold text-base">{format(dayDate, 'dd MMMM yyyy')}</p>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-cream-800 text-cream-400 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Summary */}
      {(dayData.expenseTotal > 0 || dayData.incomeTotal > 0) && (
        <div className="flex gap-2">
          {dayData.expenseTotal > 0 && (
            <div className="flex-1 p-2.5 rounded-lg bg-danger/5 border border-danger/10">
              <p className="text-[10px] text-cream-500 uppercase font-medium">{t('calendar.expenses')}</p>
              <p className="stat-value text-sm text-danger mt-0.5">{fmtAmt(dayData.expenseTotal, currency)}</p>
            </div>
          )}
          {dayData.incomeTotal > 0 && (
            <div className="flex-1 p-2.5 rounded-lg bg-success/5 border border-success/10">
              <p className="text-[10px] text-cream-500 uppercase font-medium">{t('calendar.income')}</p>
              <p className="stat-value text-sm text-success mt-0.5">{fmtAmt(dayData.incomeTotal, currency)}</p>
            </div>
          )}
        </div>
      )}

      {/* No-spend */}
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
              const isPaid = dayData.transactions.some(tx =>
                tx.recurringId === b.id ||
                (tx.source === 'recurring' && tx.merchant === (b.name || b.merchant) && Math.abs(tx.amount - b.amount) < 0.01)
              );
              return (
                <div key={b.id} className="flex items-center justify-between py-2 px-2.5 rounded-lg bg-cream-50 dark:bg-cream-800/30 text-sm">
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    {isAuto ? <Landmark size={13} className="text-accent-600 dark:text-accent-400 shrink-0" /> : <Bell size={13} className="text-warning shrink-0" />}
                    <span className="truncate">{cat.icon} {b.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium shrink-0 ${isAuto ? 'bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400' : 'bg-warning/10 text-warning'}`}>
                      {isAuto ? t('recurring.autoLabel') : t('recurring.manualLabel')}
                    </span>
                    {isPaid ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-success/10 text-success flex items-center gap-0.5 shrink-0">
                        <CheckCircle2 size={10} /> {t('calendar.billPaid')}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium bg-cream-200 dark:bg-cream-800 text-cream-500 shrink-0">
                        {t('calendar.billPending')}
                      </span>
                    )}
                  </span>
                  <span className="money font-bold text-sm shrink-0 ml-2">{fmtAmt(b.amount, b.currency || currency)}</span>
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
          <div className="divide-y divide-cream-100 dark:divide-cream-800">
            {sortByDate(dayData.transactions).map((tx) => <TransactionRow key={tx.id} transaction={tx} />)}
          </div>
        </div>
      )}

      {dayData.transactions.length === 0 && dayData.bills.length === 0 && !isPast && (
        <p className="text-sm text-cream-400 text-center py-6">{t('calendar.nothingPlanned')}</p>
      )}

      {dayData.transactions.length === 0 && dayData.bills.length === 0 && isPast && !noSpend && (
        <p className="text-sm text-cream-500 text-center py-4">{t('calendar.noTransactions')}</p>
      )}

      {/* Categories */}
      {dayData.categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-cream-100 dark:border-cream-800">
          {dayData.categories.map((catId, i) => {
            const cat = getCategoryById(catId);
            return (
              <span key={i} className="text-[11px] px-2 py-0.5 rounded-md bg-cream-100 dark:bg-cream-800 text-cream-600 dark:text-cream-400">
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
      <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden max-h-[80vh] overflow-y-auto bg-white dark:bg-dark-card border-t border-cream-200 dark:border-cream-800 rounded-t-xl shadow-lg animate-slide-up">
        <div className="flex justify-center pt-3 pb-1 sticky top-0 bg-white dark:bg-dark-card z-10">
          <div className="w-10 h-1 rounded-full bg-cream-300 dark:bg-cream-700" />
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
  const loadVersion = useRef(0);

  /* ─── Data fetching ─── */
  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    (async () => {
      setLoading(true);
      try {
        const [allTx, rec] = await Promise.all([
          txApi.getAll({ userId: effectiveUserId }),
          recurringApi.getAll({ userId: effectiveUserId }),
        ]);
        if (loadVersion.current !== version) return;
        const start = startOfMonth(month);
        const end = endOfMonth(month);
        setTransactions(allTx.filter((t) => { const d = new Date(t.date); return d >= start && d <= end; }));
        setRecurring(rec.filter((r) => r.active !== false));
        getCachedRates().then(setRates).catch(() => {});
      } catch (err) { if (loadVersion.current === version) console.error(err); }
      finally { if (loadVersion.current === version) setLoading(false); }
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
      const currentMonthNum = month.getMonth();
      const dayBills = recurringItems.filter((r) => {
        if ((r.billingDay || 1) !== dayNum) return false;
        if (['annual', 'semiannual', 'biannual'].includes(r.frequency)) {
          const bm = (r.billingMonth || 1) - 1;
          if (r.frequency === 'annual' && currentMonthNum !== bm) return false;
          if (r.frequency === 'semiannual' && currentMonthNum !== bm && currentMonthNum !== (bm + 6) % 12) return false;
          if (r.frequency === 'biannual' && currentMonthNum !== bm && currentMonthNum !== (bm + 24) % 12) return false;
        }
        return true;
      });
      const expenses = dayTx.filter((t) => t.type === 'expense');
      const expenseTotal = sumAmountsMultiCurrency(expenses, currency, rates);
      const incomeTotal = sumAmountsMultiCurrency(dayTx.filter((t) => t.type === 'income'), currency, rates);
      const categories = [...new Set(expenses.map((t) => t.category))];
      map[key] = {
        day, dayNum, transactions: dayTx,
        bills: dayBills,
        autoDebitBills: dayBills.filter((r) => r.autoDebit),
        manualBills: dayBills.filter((r) => !r.autoDebit),
        expenseTotal, incomeTotal, count: dayTx.length, categories,
      };
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

  /* ─── Grid layout ─── */
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

  const weekDays = useMemo(() => eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) }), [weekStart]);

  const selectedDayData = selectedDay ? dayData[selectedDay] : null;

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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="page-title !mb-0">{t('calendar.title')}</h1>
          <HelpButton section="calendar" />
        </div>
        <div className="flex items-center gap-3">
          <ViewToggle viewMode={viewMode} setViewMode={setViewMode} t={t} />
          {viewMode === 'month'
            ? <MonthPicker value={month} onChange={handleMonthChange} />
            : <WeekPicker weekStart={weekStart} onChange={setWeekStart} />
          }
        </div>
      </div>

      {/* ─── Stats ─── */}
      <CalendarStats monthStats={monthStats} currency={currency} t={t} />

      {/* ─── Streak ─── */}
      {monthStats.streak >= 2 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-success/5 border border-success/15">
          <Star size={16} className="text-success shrink-0" />
          <div>
            <p className="text-sm font-semibold text-success">{t('calendar.streakTitle', { count: monthStats.streak })}</p>
            <p className="text-[11px] text-cream-500">{t('calendar.streakDesc')}</p>
          </div>
        </div>
      )}

      {/* ─── Grid + detail panel ─── */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0">
          <div className="card !p-2 sm:!p-3 overflow-hidden">
            {viewMode === 'month' ? (
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 mb-1">
                  {dayNames.map((d, i) => (
                    <div key={d} className={`text-center text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider py-2 ${
                      i >= 5 ? 'text-cream-300 dark:text-cream-600' : 'text-cream-400 dark:text-cream-500'
                    }`}>{d}</div>
                  ))}
                </div>

                {/* Grid */}
                <div className={`transition-all duration-150 ${
                  monthTransition === 'left' ? 'opacity-0 -translate-x-2' :
                  monthTransition === 'right' ? 'opacity-0 translate-x-2' :
                  'opacity-100 translate-x-0'
                }`}>
                  {gridRows.map((rowDays, ri) => (
                    <div key={ri} className="grid grid-cols-7">
                      {rowDays.map((day, ci) => {
                        if (!day) {
                          return <div key={`e-${ri}-${ci}`} className="aspect-square sm:aspect-auto sm:h-24 lg:h-28" />;
                        }

                        const key = format(day, 'yyyy-MM-dd');
                        const data = dayData[key];
                        const today = isToday(day);
                        const isFuture = day > new Date();
                        const isPast = !isFuture && !today;
                        const hasExpenses = data.expenseTotal > 0;
                        const hasIncome = data.incomeTotal > 0;
                        const isNoSpend = isPast && !hasExpenses;
                        const isSelected = selectedDay === key;
                        const hasBills = data.bills.length > 0;

                        return (
                          <button
                            key={key}
                            onClick={() => handleDayClick(key)}
                            className={`
                              aspect-square sm:aspect-auto sm:h-24 lg:h-28
                              p-1 sm:p-1.5 lg:p-2
                              text-left flex flex-col
                              transition-colors duration-100
                              border border-transparent
                              ${today ? 'bg-accent-50/60 dark:bg-accent-500/[0.08]' : ''}
                              ${isSelected ? 'bg-accent-50 dark:bg-accent-500/10 border-accent-300 dark:border-accent-500/30' : ''}
                              ${!today && !isSelected ? 'hover:bg-cream-50 dark:hover:bg-cream-800/30' : ''}
                              ${isFuture ? 'opacity-35' : ''}
                            `}
                            style={{
                              borderBottom: ri < gridRows.length - 1 ? '1px solid var(--grid-line, #f1f5f9)' : 'none',
                              borderRight: ci < 6 ? '1px solid var(--grid-line, #f1f5f9)' : 'none',
                            }}
                          >
                            {/* Day number row */}
                            <div className="flex items-center justify-between w-full shrink-0">
                              {today ? (
                                <span className="w-6 h-6 rounded-full bg-accent-600 dark:bg-accent-500 text-white flex items-center justify-center text-[11px] font-bold">
                                  {data.dayNum}
                                </span>
                              ) : (
                                <span className={`text-[11px] sm:text-xs font-semibold ${
                                  hasExpenses ? 'text-cream-800 dark:text-cream-100' : isNoSpend ? 'text-success/50' : 'text-cream-400 dark:text-cream-500'
                                }`}>
                                  {data.dayNum}
                                </span>
                              )}
                              {hasBills && (
                                <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                              )}
                            </div>

                            {/* Content area */}
                            <div className="flex-1 flex flex-col justify-center w-full mt-0.5 min-h-0 overflow-hidden">
                              {/* Mobile: just amounts */}
                              <div className="sm:hidden flex flex-col items-start gap-px">
                                {hasExpenses && (
                                  <span className="text-[10px] font-bold money text-cream-800 dark:text-cream-100 leading-tight truncate w-full">
                                    {chipAmt(data.expenseTotal, currency)}
                                  </span>
                                )}
                                {hasIncome && (
                                  <span className="text-[9px] font-bold money text-success leading-tight truncate w-full">
                                    +{chipAmt(data.incomeTotal, currency)}
                                  </span>
                                )}
                              </div>

                              {/* Desktop: icon + amount list */}
                              <div className="hidden sm:flex sm:flex-col gap-px overflow-hidden">
                                {data.transactions.slice(0, 3).map((tx) => {
                                  const isIncome = tx.type === 'income';
                                  const cat = getCategoryById(tx.category);
                                  return (
                                    <div key={tx.id} className="flex items-center gap-1 text-[10px] lg:text-[11px] leading-tight">
                                      <span className="shrink-0 text-[9px]">{cat?.icon}</span>
                                      <span className={`shrink-0 font-bold money ${isIncome ? 'text-success' : 'text-cream-800 dark:text-cream-200'}`}>
                                        {isIncome ? '+' : ''}{chipAmt(tx.amount, tx.currency || currency)}
                                      </span>
                                    </div>
                                  );
                                })}
                                {data.transactions.length > 3 && (
                                  <span className="text-[9px] text-cream-400 font-medium">+{data.transactions.length - 3}</span>
                                )}
                              </div>
                            </div>

                            {/* Bottom: total bar for desktop */}
                            {hasExpenses && (
                              <div className="hidden sm:block mt-auto pt-0.5">
                                <span className="text-[10px] font-bold money text-danger leading-none">
                                  -{chipAmt(data.expenseTotal, currency)}
                                </span>
                              </div>
                            )}

                            {/* No-spend badge */}
                            {isNoSpend && data.transactions.length === 0 && (
                              <div className="mt-auto">
                                <CheckCircle2 size={10} className="text-success/30" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* ─── Week View ─── */
              <>
                {/* Day headers */}
                <div className="grid grid-cols-7 gap-1 mb-2 pb-2 border-b border-cream-100 dark:border-cream-800">
                  {weekDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const isDay = isToday(day);
                    return (
                      <div key={key} className="text-center py-1">
                        <p className="text-[10px] sm:text-xs uppercase text-cream-400 tracking-wider font-semibold">
                          {format(day, 'EEE')}
                        </p>
                        {isDay ? (
                          <span className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent-600 dark:bg-accent-500 text-white text-xs sm:text-sm font-bold mt-0.5">
                            {format(day, 'd')}
                          </span>
                        ) : (
                          <p className="text-sm sm:text-base font-bold mt-0.5 text-cream-700 dark:text-cream-200">{format(day, 'd')}</p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Week columns */}
                <div className="grid grid-cols-7 gap-1" style={{ minHeight: '20rem' }}>
                  {weekDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const data = dayData[key];
                    const isSelected = selectedDay === key;
                    const isDay = isToday(day);
                    const isFuture = day > new Date();

                    if (!data) {
                      return (
                        <button key={key} onClick={() => handleDayClick(key)}
                          className="rounded-lg bg-cream-50/30 dark:bg-cream-800/10 p-1.5 text-left opacity-40">
                          <p className="text-xs text-cream-400 text-center">{format(day, 'd')}</p>
                        </button>
                      );
                    }

                    return (
                      <button
                        key={key}
                        onClick={() => handleDayClick(key)}
                        className={`rounded-lg p-1.5 sm:p-2 text-left flex flex-col gap-1 transition-colors border ${
                          isSelected ? 'border-accent-300 dark:border-accent-500/30 bg-accent-50/50 dark:bg-accent-500/10' :
                          isDay ? 'border-accent-200/50 dark:border-accent-500/10 bg-accent-50/20' :
                          isFuture ? 'border-transparent opacity-40' :
                          'border-transparent hover:bg-cream-50 dark:hover:bg-cream-800/30'
                        }`}
                      >
                        {/* Transaction list — icon + amount */}
                        <div className="hidden sm:flex sm:flex-col gap-0.5">
                          {data.bills.map((b) => {
                            const cat = getCategoryById(b.category);
                            return (
                              <div key={b.id} className="flex items-center gap-1.5 text-[11px]">
                                <span className="shrink-0 text-[10px]">{cat?.icon || '📋'}</span>
                                <span className="font-bold money shrink-0 text-cream-800 dark:text-cream-200">{chipAmt(b.amount, b.currency || currency)}</span>
                                <Bell size={8} className="text-warning shrink-0 ml-auto" />
                              </div>
                            );
                          })}
                          {sortByDate(data.transactions, 'date', 'asc').map((tx) => {
                            const isIncome = tx.type === 'income';
                            const cat = getCategoryById(tx.category);
                            return (
                              <div key={tx.id} className="flex items-center gap-1.5 text-[11px]">
                                <span className="shrink-0 text-[10px]">{cat?.icon}</span>
                                <span className={`font-bold money shrink-0 ${isIncome ? 'text-success' : 'text-cream-800 dark:text-cream-200'}`}>
                                  {isIncome ? '+' : ''}{chipAmt(tx.amount, tx.currency || currency)}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        {/* Mobile summary */}
                        <div className="sm:hidden flex flex-col items-center justify-center flex-1 gap-0.5">
                          {data.expenseTotal > 0 && (
                            <span className="text-[10px] font-bold money text-danger">{chipAmt(data.expenseTotal, currency)}</span>
                          )}
                          {data.count > 0 && (
                            <span className="text-[9px] text-cream-400">{data.count} tx</span>
                          )}
                        </div>

                        {/* Daily total */}
                        {data.expenseTotal > 0 && (
                          <div className="mt-auto pt-1 border-t border-cream-100 dark:border-cream-800 hidden sm:block">
                            <span className="text-[10px] font-bold money text-danger">
                              -{fmtAmt(data.expenseTotal, currency, { compact: true })}
                            </span>
                          </div>
                        )}

                        {data.expenseTotal === 0 && data.transactions.length === 0 && !isFuture && (
                          <div className="flex items-center justify-center flex-1">
                            <CheckCircle2 size={14} className="text-success/30" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* ─── Week totals footer ─── */}
                {(() => {
                  const weekExpenses = weekDays.flatMap((d) => {
                    const key = format(d, 'yyyy-MM-dd');
                    return dayData[key]?.transactions.filter((tx) => tx.type === 'expense') || [];
                  });
                  const weekIncome = weekDays.flatMap((d) => {
                    const key = format(d, 'yyyy-MM-dd');
                    return dayData[key]?.transactions.filter((tx) => tx.type === 'income') || [];
                  });
                  const totalExp = sumAmountsMultiCurrency(weekExpenses, currency, rates);
                  const totalInc = sumAmountsMultiCurrency(weekIncome, currency, rates);
                  const net = totalInc - totalExp;
                  if (totalExp === 0 && totalInc === 0) return null;
                  return (
                    <div className="mt-3 pt-3 border-t border-cream-200 dark:border-cream-700 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-4">
                        <span className="text-cream-500 font-medium">{t('calendar.weekTotal')}</span>
                        {totalExp > 0 && <span className="font-bold money text-danger">-{fmtAmt(totalExp, currency)}</span>}
                        {totalInc > 0 && <span className="font-bold money text-success">+{fmtAmt(totalInc, currency)}</span>}
                      </div>
                      <span className={`font-bold money ${net >= 0 ? 'text-success' : 'text-danger'}`}>
                        {t('calendar.net')}: {net >= 0 ? '+' : ''}{fmtAmt(Math.abs(net), currency)}
                      </span>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>

        {/* ─── Desktop side panel ─── */}
        <div className={`hidden lg:block w-80 shrink-0 sticky top-4 transition-all duration-200 ${
          selectedDay ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
        }`}>
          {selectedDay && (
            <DayDetailPanel dayData={selectedDayData} selectedDay={selectedDay} currency={currency} t={t} onClose={() => setSelectedDay(null)} />
          )}
        </div>
      </div>

      {/* ─── Mobile bottom sheet ─── */}
      <MobileBottomSheet open={!!selectedDay} onClose={() => setSelectedDay(null)}>
        <DayDetailPanel dayData={selectedDayData} selectedDay={selectedDay} currency={currency} t={t} onClose={() => setSelectedDay(null)} />
      </MobileBottomSheet>
    </div>
  );
}
