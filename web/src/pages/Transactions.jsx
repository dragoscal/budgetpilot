import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import HelpButton from '../components/HelpButton';
import { sortByDate, formatCurrency, sumBy, sumAmountsMultiCurrency } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import TransactionRow from '../components/TransactionRow';
import TransactionEditModal from '../components/TransactionEditModal';
import SearchFilter from '../components/SearchFilter';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonRow } from '../components/LoadingSkeleton';
import { SORT_OPTIONS, CATEGORIES } from '../lib/constants';
import { checkDuplicate } from '../lib/smartFeatures';
import { Receipt, Download, Trash2, Tag, Hash, X, User, Home } from 'lucide-react';

const PAGE_SIZE = 30;

export default function Transactions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, effectiveUserId } = useAuth();
  const { t } = useTranslation();
  const currency = user?.defaultCurrency || 'RON';
  const [allTx, setAllTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState([]);
  const [dateFilter, setDateFilter] = useState('all');
  const [amountMin, setAmountMin] = useState('');
  const [amountMax, setAmountMax] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [scopeFilter, setScopeFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editTx, setEditTx] = useState(null);
  const [deleteTx, setDeleteTx] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showAllTags, setShowAllTags] = useState(false);
  const [rates, setRates] = useState(null);

  useEffect(() => { loadTransactions(); getCachedRates().then(setRates); }, [effectiveUserId]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await txApi.getAll({ userId: effectiveUserId });
      setAllTx(data);
    } catch (err) {
      toast.error(t('transactions.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  // Compute unique tags from all transactions for tag filter
  const availableTags = useMemo(() => {
    const tagMap = new Map();
    for (const t of allTx) {
      if (!t.tags || !Array.isArray(t.tags)) continue;
      for (const tag of t.tags) {
        const normalized = tag.toLowerCase().trim();
        if (normalized) tagMap.set(normalized, (tagMap.get(normalized) || 0) + 1);
      }
    }
    return Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }, [allTx]);

  const filtered = useMemo(() => {
    let result = [...allTx];

    // Scope filter
    if (scopeFilter !== 'all') {
      result = result.filter(t => (t.scope || 'personal') === scopeFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateFilter === '7d') cutoff.setDate(now.getDate() - 7);
      else if (dateFilter === '30d') cutoff.setDate(now.getDate() - 30);
      else if (dateFilter === '90d') cutoff.setDate(now.getDate() - 90);
      else if (dateFilter === 'thisMonth') {
        cutoff.setDate(1);
        cutoff.setHours(0, 0, 0, 0);
      }
      result = result.filter(t => new Date(t.date) >= cutoff);
    }

    if (search) {
      const q = search.toLowerCase();
      result = result.filter((t) =>
        (t.merchant || '').toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))
      );
    }
    if (categoryFilter) result = result.filter((t) => t.category === categoryFilter);
    if (typeFilter) result = result.filter((t) => t.type === typeFilter);
    if (tagFilter.length > 0) {
      result = result.filter((t) =>
        tagFilter.every((ft) => (t.tags || []).some((tt) => tt.toLowerCase() === ft))
      );
    }

    // Amount range filter
    if (amountMin !== '') {
      const min = Number(amountMin);
      if (!isNaN(min)) result = result.filter((t) => t.amount >= min);
    }
    if (amountMax !== '') {
      const max = Number(amountMax);
      if (!isNaN(max)) result = result.filter((t) => t.amount <= max);
    }

    // Sort
    const [sortKey, sortDir] = sort.split('-');
    if (sortKey === 'date') {
      result = sortByDate(result, 'date', sortDir);
    } else if (sortKey === 'amount') {
      result.sort((a, b) => sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount);
    } else if (sortKey === 'merchant') {
      result.sort((a, b) => sortDir === 'desc'
        ? (b.merchant || '').localeCompare(a.merchant || '')
        : (a.merchant || '').localeCompare(b.merchant || ''));
    }

    return result;
  }, [allTx, search, categoryFilter, typeFilter, tagFilter, sort, dateFilter, amountMin, amountMax, scopeFilter]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore = paginated.length < filtered.length;

  const totalExpenses = sumAmountsMultiCurrency(filtered.filter((t) => t.type === 'expense'), currency, rates);
  const totalIncome = sumAmountsMultiCurrency(filtered.filter((t) => t.type === 'income'), currency, rates);

  const handleDelete = async () => {
    if (!deleteTx) return;
    const txToDelete = { ...deleteTx };
    // Immediately remove from UI (soft delete)
    setAllTx((prev) => prev.filter((t) => t.id !== txToDelete.id));
    setDeleteTx(null);

    // Show undo toast — only permanently delete after timeout
    toast.undo(t('transactions.deleted', { name: txToDelete.merchant || t('common.transaction') }), {
      onUndo: () => {
        // Restore the transaction in UI and re-save to DB
        setAllTx((prev) => [...prev, txToDelete]);
        txApi.update(txToDelete.id, txToDelete).catch(() => {});
      },
      onExpire: () => {
        // Permanently delete from DB
        txApi.remove(txToDelete.id).catch(() => {});
      },
      duration: 5000,
    });
  };

  const handleEdit = async (updated) => {
    try {
      // Check for duplicates (excluding the transaction being edited)
      const dupes = await checkDuplicate(updated);
      const realDupes = dupes.filter(d => d.transaction.id !== updated.id && d.confidence >= 0.7);
      if (realDupes.length > 0) {
        const proceed = confirm(t('transactions.duplicateWarning', { merchant: realDupes[0].transaction.merchant, date: realDupes[0].transaction.date }));
        if (!proceed) return;
      }
      await txApi.update(updated.id, updated);
      setAllTx((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      setEditTx(null);
      toast.success(t('transactions.updated'));
    } catch (err) {
      toast.error(t('transactions.failedUpdate'));
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(t('transactions.bulkDeleteConfirm', { count: selected.size }))) return;
    try {
      await Promise.all([...selected].map(id => txApi.remove(id)));
      setAllTx((prev) => prev.filter((t) => !selected.has(t.id)));
      setSelected(new Set());
      toast.success(t('transactions.bulkDeleted', { count: selected.size }));
    } catch (err) {
      toast.error(t('transactions.failedDelete'));
    }
  };

  const handleSelect = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const [showBatchCategory, setShowBatchCategory] = useState(false);

  const handleBatchCategorize = async (newCategory) => {
    if (selected.size === 0) return;
    try {
      const updates = [...selected].map(id => {
        const tx = allTx.find(t => t.id === id);
        return tx ? txApi.update(id, { ...tx, category: newCategory }) : Promise.resolve();
      });
      await Promise.all(updates);
      setAllTx((prev) => prev.map((t) => selected.has(t.id) ? { ...t, category: newCategory } : t));
      toast.success(t('transactions.recategorized', { count: selected.size }));
      setSelected(new Set());
      setShowBatchCategory(false);
    } catch (err) {
      toast.error(t('transactions.failedCategorize'));
    }
  };

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Merchant', 'Category', 'Amount', 'Currency', 'Description', 'Tags', 'Scope'];
    const rows = filtered.map((t) => [
      t.date, t.type, t.merchant, t.category, t.amount, t.currency, t.description, (t.tags || []).join(';'), t.scope || 'personal',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('transactions.csvExported'));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('transactions.title')}</h1>
          <HelpButton section="transactions" />
        </div>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <>
              <div className="relative">
                <button onClick={() => setShowBatchCategory(!showBatchCategory)} className="btn-secondary text-xs flex items-center gap-1">
                  <Tag size={14} /> {t('transactions.categorize', { count: selected.size })}
                </button>
                {showBatchCategory && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-xl overflow-hidden z-50" style={{ minWidth: '200px', maxHeight: '320px' }}>
                    <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          onClick={() => handleBatchCategorize(cat.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left"
                        >
                          <span>{cat.icon}</span>
                          <span>{t(`categories.${cat.id}`)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={handleBulkDelete} className="btn-danger text-xs flex items-center gap-1">
                <Trash2 size={14} /> {t('transactions.bulkDelete', { count: selected.size })}
              </button>
            </>
          )}
          <button onClick={exportCSV} className="btn-ghost text-xs flex items-center gap-1">
            <Download size={14} /> {t('transactions.exportCsv')}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-cream-500">{filtered.length} {t('common.transactions')}</span>
        <span className="text-danger money">-{formatCurrency(totalExpenses, currency)}</span>
        <span className="text-income money">+{formatCurrency(totalIncome, currency)}</span>
      </div>

      <SearchFilter
        search={search} onSearch={setSearch}
        category={categoryFilter} onCategory={setCategoryFilter}
        type={typeFilter} onType={setTypeFilter}
      />

      {/* Scope filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-cream-500">{t('household.title')}</span>
        <div className="flex gap-1.5">
          {[
            { id: 'all', label: t('household.scopeAll') },
            { id: 'personal', label: t('household.scopePersonal'), icon: User },
            { id: 'household', label: t('household.scopeHousehold'), icon: Home },
          ].map((s) => (
            <button
              key={s.id}
              onClick={() => setScopeFilter(s.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors flex items-center gap-1 ${
                scopeFilter === s.id
                  ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                  : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              {s.icon && <s.icon size={11} />}
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Amount range filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-cream-500">{t('transactions.amount')}</span>
        <input
          type="number"
          className="input w-24 text-xs py-1.5"
          placeholder={t('transactions.min')}
          value={amountMin}
          onChange={(e) => setAmountMin(e.target.value)}
          inputMode="decimal"
          min="0"
        />
        <span className="text-xs text-cream-400">—</span>
        <input
          type="number"
          className="input w-24 text-xs py-1.5"
          placeholder={t('transactions.max')}
          value={amountMax}
          onChange={(e) => setAmountMax(e.target.value)}
          inputMode="decimal"
          min="0"
        />
        {(amountMin || amountMax) && (
          <button
            onClick={() => { setAmountMin(''); setAmountMax(''); }}
            className="p-1 rounded-full text-cream-400 hover:text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border transition-colors"
            title={t('transactions.clearAmountFilter')}
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-cream-500 shrink-0">{t('transactions.period')}</span>
        <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-x-auto scrollbar-hide">
          {[
            { id: 'all', label: t('common.all') },
            { id: 'thisMonth', label: t('transactions.thisMonth') },
            { id: '7d', label: '7d' },
            { id: '30d', label: '30d' },
            { id: '90d', label: '90d' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id)}
              className={`px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                dateFilter === f.id
                  ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                  : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto text-xs" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Tag filter chips */}
        {availableTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Hash size={14} className="text-cream-400" />
            {(showAllTags ? availableTags : availableTags.slice(0, 12)).map(({ tag, count }) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter((prev) =>
                  prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                )}
                className={`px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors ${
                  tagFilter.includes(tag)
                    ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                    : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
                }`}
              >
                {tag} <span className="opacity-50">{count}</span>
              </button>
            ))}
            {availableTags.length > 12 && (
              <button onClick={() => setShowAllTags(!showAllTags)} className="text-xs text-accent-500 hover:text-accent-600">
                {showAllTags ? t('common.showLess') : t('transactions.moreCount', { count: availableTags.length - 12 })}
              </button>
            )}
            {tagFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setTagFilter([])}
                className="p-1 rounded-full text-cream-400 hover:text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border transition-colors"
                title={t('transactions.clearTagFilter')}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Transaction list */}
      <div className="card p-0">
        {loading ? (
          <div>{[1, 2, 3, 4, 5].map((i) => <SkeletonRow key={i} />)}</div>
        ) : paginated.length > 0 ? (
          <>
            <div className="divide-y divide-cream-100 dark:divide-dark-border">
              {paginated.map((tx) => (
                <TransactionRow
                  key={tx.id}
                  transaction={tx}
                  onEdit={setEditTx}
                  onDelete={setDeleteTx}
                  selected={selected.has(tx.id)}
                  onSelect={handleSelect}
                />
              ))}
            </div>
            {hasMore && (
              <button onClick={() => setPage((p) => p + 1)} className="w-full py-3 text-sm text-cream-500 hover:text-cream-700 border-t border-cream-100 dark:border-dark-border">
                {t('common.loadMore', { count: filtered.length - paginated.length })}
              </button>
            )}
          </>
        ) : (
          <EmptyState
            icon={Receipt}
            title={t('transactions.noFound')}
            description={search || categoryFilter || typeFilter || tagFilter.length > 0 || dateFilter !== 'all' || amountMin || amountMax || scopeFilter !== 'all' ? t('transactions.adjustFilters') : t('transactions.addFirst')}
            action={!search && !categoryFilter && tagFilter.length === 0 && dateFilter === 'all' && !amountMin && !amountMax && scopeFilter === 'all' ? t('transactions.addTransaction') : undefined}
            onAction={() => navigate('/add')}
          />
        )}
      </div>

      {/* Edit modal */}
      <TransactionEditModal
        transaction={editTx}
        open={!!editTx}
        onClose={() => setEditTx(null)}
        onSave={handleEdit}
      />

      {/* Delete confirmation */}
      <Modal open={!!deleteTx} onClose={() => setDeleteTx(null)} title={t('transactions.deleteTransaction')}>
        <p className="text-sm mb-4">
          {t('transactions.deleteConfirm', { merchant: deleteTx?.merchant || 'this' })}{' '}
          <strong className="money">{deleteTx && formatCurrency(deleteTx.amount, deleteTx.currency)}</strong>?
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setDeleteTx(null)} className="btn-secondary">{t('common.cancel')}</button>
          <button onClick={handleDelete} className="btn-danger">{t('common.delete')}</button>
        </div>
      </Modal>
    </div>
  );
}
