import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency, getCategoryById, sortByDate, sumAmountsMultiCurrency, sumBy } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import MonthPicker from '../components/MonthPicker';
import Modal from '../components/Modal';
import TransactionRow from '../components/TransactionRow';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, isToday, isSameDay } from 'date-fns';
import HelpButton from '../components/HelpButton';
import { TrendingDown, TrendingUp, Flame, CalendarDays } from 'lucide-react';

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

  // Build day data (multi-currency aware)
  const dayData = useMemo(() => {
    const map = {};
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      const dayNum = day.getDate();
      const dayTx = transactions.filter((t) => t.date === key);
      const dayBills = recurringItems.filter((r) => (r.billingDay || 1) === dayNum);
      const expenseTotal = sumAmountsMultiCurrency(dayTx.filter((t) => t.type === 'expense'), currency, rates);
      const incomeTotal = sumAmountsMultiCurrency(dayTx.filter((t) => t.type === 'income'), currency, rates);
      map[key] = { day, dayNum, transactions: dayTx, bills: dayBills, expenseTotal, incomeTotal, count: dayTx.length };
    }
    return map;
  }, [days, transactions, recurringItems, currency, rates]);

  // Monthly summary stats
  const monthStats = useMemo(() => {
    const expenses = transactions.filter((t) => t.type === 'expense');
    const income = transactions.filter((t) => t.type === 'income');
    const totalExpenses = sumAmountsMultiCurrency(expenses, currency, rates);
    const totalIncome = sumAmountsMultiCurrency(income, currency, rates);
    const activeDays = new Set(expenses.map((t) => t.date)).size;
    const noSpendDays = days.filter((d) => {
      const key = format(d, 'yyyy-MM-dd');
      return dayData[key]?.expenseTotal === 0 && d <= new Date();
    }).length;
    const maxDay = Object.values(dayData).reduce((max, d) => d.expenseTotal > max.expenseTotal ? d : max, { expenseTotal: 0 });
    return { totalExpenses, totalIncome, activeDays, noSpendDays, txCount: transactions.length, maxDay };
  }, [transactions, days, dayData, currency, rates]);

  // Find max expense for heat intensity
  const maxExpense = useMemo(() => {
    return Math.max(...Object.values(dayData).map((d) => d.expenseTotal), 1);
  }, [dayData]);

  // Calculate starting offset (Monday = 0)
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

      {/* Month summary cards */}
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
            <CalendarDays size={12} className="text-accent" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('calendar.activeDays')}</p>
          </div>
          <p className="font-heading font-bold text-base">{monthStats.activeDays} <span className="text-xs font-normal text-cream-400">/ {days.length}</span></p>
        </div>
        <div className="card p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Flame size={12} className="text-success" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('calendar.noSpendDays')}</p>
          </div>
          <p className="font-heading font-bold text-base text-success">{monthStats.noSpendDays}</p>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card p-3 sm:p-4">
        {/* Day names */}
        <div className="grid grid-cols-7 gap-1 mb-2">
          {[t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat'), t('calendar.sun')].map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-cream-400 uppercase tracking-wider py-1">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {/* Empty cells for offset */}
          {Array.from({ length: offset }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {/* Day cells */}
          {days.map((day) => {
            const key = format(day, 'yyyy-MM-dd');
            const data = dayData[key];
            const today = isToday(day);
            const isFuture = day > new Date();
            const hasExpenses = data.expenseTotal > 0;
            const hasIncome = data.incomeTotal > 0;
            const hasBills = data.bills.length > 0;
            // Heat intensity for expense days (0 to 1)
            const intensity = hasExpenses ? Math.min(data.expenseTotal / maxExpense, 1) : 0;

            return (
              <button
                key={key}
                onClick={() => setSelectedDay(key)}
                className={`aspect-square p-1 sm:p-1.5 rounded-xl text-left flex flex-col transition-all relative ${
                  today
                    ? 'ring-2 ring-accent bg-accent/5'
                    : selectedDay === key
                      ? 'bg-cream-200 dark:bg-dark-border ring-1 ring-cream-300 dark:ring-dark-border'
                      : isFuture
                        ? 'opacity-40 hover:opacity-70'
                        : 'hover:bg-cream-50 dark:hover:bg-dark-border/50'
                }`}
                style={hasExpenses && !today ? {
                  backgroundColor: `rgba(225, 29, 72, ${0.04 + intensity * 0.12})`,
                } : undefined}
              >
                <span className={`text-xs font-semibold ${
                  today ? 'text-accent' : hasExpenses ? 'text-cream-700 dark:text-cream-200' : 'text-cream-500'
                }`}>
                  {data.dayNum}
                </span>

                <div className="mt-auto w-full space-y-0.5">
                  {hasExpenses && (
                    <span className="block text-[8px] sm:text-[9px] text-danger font-bold money truncate leading-tight">
                      -{formatCurrency(data.expenseTotal, currency).replace(/\s/g, '')}
                    </span>
                  )}
                  {hasIncome && (
                    <span className="block text-[8px] sm:text-[9px] text-income font-bold money truncate leading-tight">
                      +{formatCurrency(data.incomeTotal, currency).replace(/\s/g, '')}
                    </span>
                  )}
                </div>

                {/* Indicators row */}
                {(hasBills || data.count > 1) && (
                  <div className="flex items-center gap-0.5 mt-0.5">
                    {hasBills && (
                      <span className="w-1.5 h-1.5 rounded-full bg-warning shrink-0" />
                    )}
                    {data.count > 1 && (
                      <span className="text-[7px] text-cream-400 font-medium">{data.count}tx</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-cream-100 dark:border-dark-border">
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="w-2 h-2 rounded-full bg-danger/30" /> {t('calendar.expenses')}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="w-2 h-2 rounded-full bg-income" /> {t('calendar.income')}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="w-2 h-2 rounded-full bg-warning" /> {t('calendar.billsDue')}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-cream-400">
            <div className="w-2.5 h-2.5 rounded ring-2 ring-accent" /> {t('calendar.today')}
          </div>
        </div>
      </div>

      {/* Day detail modal */}
      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(new Date(selectedDay), 'EEEE, dd MMMM yyyy') : ''} wide>
        {selectedDayData && (
          <div className="space-y-4">
            {/* Day summary */}
            {(selectedDayData.expenseTotal > 0 || selectedDayData.incomeTotal > 0) && (
              <div className="flex gap-3">
                {selectedDayData.expenseTotal > 0 && (
                  <div className="flex-1 p-3 rounded-xl bg-danger/5">
                    <p className="text-[10px] text-cream-500 uppercase">{t('calendar.expenses')}</p>
                    <p className="font-heading font-bold text-lg money text-danger">{formatCurrency(selectedDayData.expenseTotal, currency)}</p>
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
            ) : (
              <p className="text-sm text-cream-500 text-center py-6">{t('calendar.noTransactions')}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
