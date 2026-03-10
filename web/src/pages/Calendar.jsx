import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi, recurring as recurringApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { formatCurrency, getCategoryById, sumBy, sortByDate } from '../lib/helpers';
import MonthPicker from '../components/MonthPicker';
import Modal from '../components/Modal';
import TransactionRow from '../components/TransactionRow';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, getDay, isToday } from 'date-fns';

export default function CalendarPage() {
  const { user, effectiveUserId } = useAuth();
  const [month, setMonth] = useState(new Date());
  const [transactions, setTransactions] = useState([]);
  const [recurringItems, setRecurring] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [loading, setLoading] = useState(true);

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
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    })();
  }, [month]);

  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(month), end: endOfMonth(month) }), [month]);

  // Build day data
  const dayData = useMemo(() => {
    const map = {};
    for (const day of days) {
      const key = format(day, 'yyyy-MM-dd');
      const dayNum = day.getDate();
      const dayTx = transactions.filter((t) => t.date === key);
      const dayBills = recurringItems.filter((r) => (r.billingDay || 1) === dayNum);
      const total = sumBy(dayTx.filter((t) => t.type === 'expense'), 'amount');
      map[key] = { day, dayNum, transactions: dayTx, bills: dayBills, total, count: dayTx.length };
    }
    return map;
  }, [days, transactions, recurringItems]);

  // Calculate starting offset (Monday = 0)
  const firstDayOfWeek = getDay(startOfMonth(month));
  const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Shift Sunday to end

  const selectedDayData = selectedDay ? dayData[selectedDay] : null;

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Calendar</h1>
        <MonthPicker value={month} onChange={setMonth} />
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-cream-500 py-1">{d}</div>
        ))}

        {/* Empty cells for offset */}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square" />
        ))}

        {/* Day cells */}
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd');
          const data = dayData[key];
          const today = isToday(day);
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(key)}
              className={`aspect-square p-1 rounded-xl text-left flex flex-col transition-colors ${
                today
                  ? 'ring-2 ring-success bg-success/5'
                  : selectedDay === key
                    ? 'bg-cream-200 dark:bg-dark-border'
                    : 'hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              <span className={`text-xs font-medium ${today ? 'text-success' : ''}`}>{data.dayNum}</span>
              {data.total > 0 && (
                <span className="text-[9px] text-danger font-medium money mt-auto">
                  -{formatCurrency(data.total, currency).replace(/\s/g, '')}
                </span>
              )}
              {data.bills.length > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {data.bills.slice(0, 2).map((b) => (
                    <span key={b.id} className="w-1.5 h-1.5 rounded-full bg-warning" title={b.name} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Day detail modal */}
      <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(new Date(selectedDay), 'EEEE, dd MMMM yyyy') : ''} wide>
        {selectedDayData && (
          <div className="space-y-4">
            {selectedDayData.bills.length > 0 && (
              <div>
                <h4 className="section-title">Bills due</h4>
                {selectedDayData.bills.map((b) => {
                  const cat = getCategoryById(b.category);
                  return (
                    <div key={b.id} className="flex items-center justify-between py-1.5 text-sm">
                      <span>{cat.icon} {b.name}</span>
                      <span className="money font-medium">{formatCurrency(b.amount, b.currency || currency)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {selectedDayData.transactions.length > 0 ? (
              <div>
                <h4 className="section-title">Transactions</h4>
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {sortByDate(selectedDayData.transactions).map((tx) => <TransactionRow key={tx.id} transaction={tx} />)}
                </div>
              </div>
            ) : (
              <p className="text-sm text-cream-500 text-center py-6">No transactions on this day</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
