import { useState, useMemo } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { formatCurrency, sumBy, getCategoryById, percentOf } from '../../lib/helpers';
import { getCategoryLabel } from '../../lib/categoryManager';
import { startOfMonth, endOfMonth, format, isToday, isYesterday } from 'date-fns';
import EmptyState from '../EmptyState';
import { Receipt } from 'lucide-react';

export default function FamilyAllExpenses() {
  const { t } = useTranslation();
  const { effectiveUserId } = useAuth();
  const { activeFamily, members, familyTransactions, familyTransactionsLoading } = useFamily();
  const currency = activeFamily?.defaultCurrency || 'RON';

  const [filter, setFilter] = useState('all'); // all | ours | mine

  const now = new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);

  // This month's expenses for category breakdown
  const thisMonthExpenses = useMemo(() => {
    return familyTransactions.filter((tx) => {
      const d = new Date(tx.date);
      return d >= mStart && d <= mEnd && tx.type === 'expense';
    });
  }, [familyTransactions, mStart, mEnd]);

  // Filtered transactions
  const filteredTx = useMemo(() => {
    let txs = [...familyTransactions].filter((tx) => tx.type === 'expense');
    if (filter === 'ours') {
      txs = txs.filter((tx) => tx.scope === 'household');
    } else if (filter === 'mine') {
      txs = txs.filter((tx) => tx.userId === effectiveUserId);
    }
    txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return txs;
  }, [familyTransactions, filter, effectiveUserId]);

  // Category breakdown (top 6, this month, total household)
  const categoryBreakdown = useMemo(() => {
    const catMap = {};
    for (const tx of thisMonthExpenses) {
      catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
    }
    const total = sumBy(thisMonthExpenses, 'amount');
    return Object.entries(catMap)
      .map(([cat, amount]) => ({
        cat,
        amount,
        pct: percentOf(amount, total),
        info: getCategoryById(cat),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [thisMonthExpenses]);

  const totalThisMonth = sumBy(thisMonthExpenses, 'amount');

  // Group transactions by date
  const groupedTx = useMemo(() => {
    const groups = {};
    for (const tx of filteredTx.slice(0, 100)) {
      const dateKey = tx.date || 'unknown';
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(tx);
    }
    return Object.entries(groups).map(([date, txs]) => {
      const d = new Date(date + 'T00:00:00');
      let label = format(d, 'MMM d');
      if (isToday(d)) label = t('common.today');
      else if (isYesterday(d)) label = t('common.yesterday');
      return { date, label, txs };
    });
  }, [filteredTx]);

  const getMemberEmoji = (userId) => {
    const m = members.find((m) => m.userId === userId);
    return m?.emoji || '👤';
  };

  if (familyTransactionsLoading) {
    return <div className="card animate-pulse"><div className="h-48 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Category breakdown bars */}
      {categoryBreakdown.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('family.whereMoneyGoes')}</h3>
          <div className="space-y-2.5">
            {categoryBreakdown.map((c) => (
              <div key={c.cat}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-1.5">
                    <span>{c.info.icon}</span>
                    <span className="font-medium">{getCategoryLabel(c.info, t)}</span>
                  </span>
                  <span className="text-xs text-cream-500">
                    {formatCurrency(c.amount, currency)} · {c.pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-cream-100 dark:bg-dark-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-accent transition-all"
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          {totalThisMonth > 0 && (
            <p className="text-xs text-cream-400 mt-3 text-right">
              {formatCurrency(totalThisMonth, currency)} {t('family.spentThisMonth') || 'this month'}
            </p>
          )}
        </div>
      )}

      {/* Filter toggle: All / Ours / Mine */}
      <div className="flex gap-2">
        {['all', 'ours', 'mine'].map((f) => {
          const labels = {
            all: t('family.filterAll'),
            ours: t('family.filterOurs'),
            mine: t('family.filterMine'),
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-accent text-white'
                  : 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-400 hover:bg-cream-200'
              }`}
            >
              {labels[f]}
            </button>
          );
        })}
      </div>

      {/* Date-grouped transaction list */}
      {groupedTx.length > 0 ? (
        <div className="space-y-4">
          {groupedTx.map((group) => (
            <div key={group.date}>
              <p className="text-xs font-medium text-cream-400 uppercase tracking-wider mb-2">{group.label}</p>
              <div className="space-y-1.5">
                {group.txs.map((tx) => {
                  const cat = getCategoryById(tx.category);
                  return (
                    <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-cream-50 dark:bg-dark-bg">
                      <span className="text-lg shrink-0">{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">
                            {tx.merchant || tx.description || getCategoryLabel(cat, t)}
                          </p>
                          {tx.scope === 'household' && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-100 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300 font-medium shrink-0">
                              {t('family.filterHousehold')}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-cream-500">
                          <span className="inline-block w-3.5 text-center">{getMemberEmoji(tx.userId)}</span> {tx.date}
                        </p>
                      </div>
                      <span className="text-sm font-heading font-bold money text-danger shrink-0">
                        -{formatCurrency(tx.amount, tx.currency || currency)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Receipt}
          title={t('family.noTransactionsFound')}
          description={t('family.adjustFilters')}
        />
      )}
    </div>
  );
}
