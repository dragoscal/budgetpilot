import { useState, useMemo } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { formatCurrency } from '../../lib/helpers';
import { getCategoryById } from '../../lib/helpers';
import EmptyState from '../EmptyState';
import { Receipt, Search } from 'lucide-react';

export default function FamilyAllExpenses() {
  const { t } = useTranslation();
  const { activeFamily, members, familyTransactions, familyTransactionsLoading } = useFamily();
  const currency = activeFamily?.defaultCurrency || 'RON';

  const [scopeFilter, setScopeFilter] = useState('all'); // all | personal | household
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const toggleMember = (userId) => {
    setSelectedMembers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const filteredTx = useMemo(() => {
    let txs = [...familyTransactions];

    // Scope filter
    if (scopeFilter === 'personal') {
      txs = txs.filter((tx) => tx.scope !== 'household');
    } else if (scopeFilter === 'household') {
      txs = txs.filter((tx) => tx.scope === 'household');
    }

    // Member filter
    if (selectedMembers.size > 0) {
      txs = txs.filter((tx) => selectedMembers.has(tx.userId));
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      txs = txs.filter((tx) =>
        (tx.merchant || '').toLowerCase().includes(q) ||
        (tx.description || '').toLowerCase().includes(q) ||
        (tx.category || '').toLowerCase().includes(q)
      );
    }

    // Date range
    if (dateFrom) txs = txs.filter((tx) => tx.date >= dateFrom);
    if (dateTo) txs = txs.filter((tx) => tx.date <= dateTo);

    // Sort newest first
    txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    return txs;
  }, [familyTransactions, scopeFilter, selectedMembers, searchQuery, dateFrom, dateTo]);

  const getMemberInfo = (userId) => {
    const m = members.find((m) => m.userId === userId);
    return m ? { emoji: m.emoji || '👤', name: m.displayName || 'Member' } : { emoji: '👤', name: 'Member' };
  };

  if (familyTransactionsLoading) {
    return <div className="card animate-pulse"><div className="h-48 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Scope filter chips */}
      <div className="flex gap-2">
        {['all', 'personal', 'household'].map((scope) => (
          <button
            key={scope}
            onClick={() => setScopeFilter(scope)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              scopeFilter === scope
                ? 'bg-accent text-white'
                : 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-400 hover:bg-cream-200'
            }`}
          >
            {t(`family.filter${scope.charAt(0).toUpperCase() + scope.slice(1)}`)}
          </button>
        ))}
      </div>

      {/* Member filter pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {members.map((m) => (
          <button
            key={m.userId}
            onClick={() => toggleMember(m.userId)}
            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              selectedMembers.has(m.userId)
                ? 'bg-accent-100 dark:bg-accent-500/20 text-accent-700 dark:text-accent-300 ring-1 ring-accent'
                : 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-400'
            }`}
          >
            <span>{m.emoji || '👤'}</span>
            <span>{m.displayName || 'Member'}</span>
          </button>
        ))}
      </div>

      {/* Search + date filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
          <input
            className="input pl-9 text-sm"
            placeholder={t('family.searchTransactions')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <input type="date" className="input text-xs" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" className="input text-xs" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-cream-500">
        {t('family.showingCount', { count: filteredTx.length })}
      </p>

      {/* Transaction list */}
      {filteredTx.length > 0 ? (
        <div className="space-y-2">
          {filteredTx.slice(0, 100).map((tx) => {
            const member = getMemberInfo(tx.userId);
            const cat = getCategoryById(tx.category);
            return (
              <div key={tx.id} className="card p-3">
                <div className="flex items-center gap-3">
                  <span className="text-lg shrink-0">{member.emoji}</span>
                  <span className="text-lg shrink-0">{cat.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{tx.merchant || tx.description || t(`categories.${tx.category}`)}</p>
                      {tx.scope === 'household' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent-100 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300 font-medium">
                          {t('family.filterHousehold')}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-cream-500">{member.name} · {tx.date}</p>
                  </div>
                  <span className={`text-sm font-heading font-bold money ${tx.type === 'income' ? 'text-income' : 'text-danger'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency || currency)}
                  </span>
                </div>
              </div>
            );
          })}
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
