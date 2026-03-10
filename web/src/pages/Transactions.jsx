import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { sortByDate, formatCurrency, sumBy } from '../lib/helpers';
import TransactionRow from '../components/TransactionRow';
import SearchFilter from '../components/SearchFilter';
import Modal from '../components/Modal';
import ManualForm from '../components/ManualForm';
import EmptyState from '../components/EmptyState';
import { SkeletonRow } from '../components/LoadingSkeleton';
import { SORT_OPTIONS } from '../lib/constants';
import { Receipt, Download, Trash2, Tag, Hash, X } from 'lucide-react';

const PAGE_SIZE = 30;

export default function Transactions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, effectiveUserId } = useAuth();
  const currency = user?.defaultCurrency || 'RON';
  const [allTx, setAllTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState([]);
  const [dateFilter, setDateFilter] = useState('all');
  const [sort, setSort] = useState('date-desc');
  const [page, setPage] = useState(1);
  const [editTx, setEditTx] = useState(null);
  const [deleteTx, setDeleteTx] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showAllTags, setShowAllTags] = useState(false);

  useEffect(() => { loadTransactions(); }, [effectiveUserId]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await txApi.getAll({ userId: effectiveUserId });
      setAllTx(data);
    } catch (err) {
      toast.error('Failed to load transactions');
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
  }, [allTx, search, categoryFilter, typeFilter, tagFilter, sort, dateFilter]);

  const paginated = useMemo(() => filtered.slice(0, page * PAGE_SIZE), [filtered, page]);
  const hasMore = paginated.length < filtered.length;

  const totalExpenses = sumBy(filtered.filter((t) => t.type === 'expense'), 'amount');
  const totalIncome = sumBy(filtered.filter((t) => t.type === 'income'), 'amount');

  const handleDelete = async () => {
    if (!deleteTx) return;
    try {
      await txApi.remove(deleteTx.id);
      setAllTx((prev) => prev.filter((t) => t.id !== deleteTx.id));
      setDeleteTx(null);
      toast.success('Transaction deleted');
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleEdit = async (updated) => {
    try {
      await txApi.update(updated.id, updated);
      setAllTx((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      setEditTx(null);
      toast.success('Transaction updated');
    } catch (err) {
      toast.error('Failed to update');
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`Delete ${selected.size} transaction${selected.size > 1 ? 's' : ''}? This cannot be undone.`)) return;
    try {
      await Promise.all([...selected].map(id => txApi.remove(id)));
      setAllTx((prev) => prev.filter((t) => !selected.has(t.id)));
      setSelected(new Set());
      toast.success(`${selected.size} transactions deleted`);
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleSelect = (id, checked) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Merchant', 'Category', 'Amount', 'Currency', 'Description', 'Tags'];
    const rows = filtered.map((t) => [
      t.date, t.type, t.merchant, t.category, t.amount, t.currency, t.description, (t.tags || []).join(';'),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${c || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Transactions</h1>
        <div className="flex gap-2">
          {selected.size > 0 && (
            <button onClick={handleBulkDelete} className="btn-danger text-xs flex items-center gap-1">
              <Trash2 size={14} /> Delete ({selected.size})
            </button>
          )}
          <button onClick={exportCSV} className="btn-ghost text-xs flex items-center gap-1">
            <Download size={14} /> CSV
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-4 text-sm">
        <span className="text-cream-500">{filtered.length} transactions</span>
        <span className="text-danger money">-{formatCurrency(totalExpenses, currency)}</span>
        <span className="text-income money">+{formatCurrency(totalIncome, currency)}</span>
      </div>

      <SearchFilter
        search={search} onSearch={setSearch}
        category={categoryFilter} onCategory={setCategoryFilter}
        type={typeFilter} onType={setTypeFilter}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-cream-500">Period:</span>
        <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
          {[
            { id: 'all', label: 'All' },
            { id: 'thisMonth', label: 'This month' },
            { id: '7d', label: '7d' },
            { id: '30d', label: '30d' },
            { id: '90d', label: '90d' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
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
                {showAllTags ? 'Show less' : `+${availableTags.length - 12} more`}
              </button>
            )}
            {tagFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setTagFilter([])}
                className="p-1 rounded-full text-cream-400 hover:text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border transition-colors"
                title="Clear tag filter"
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
                Load more ({filtered.length - paginated.length} remaining)
              </button>
            )}
          </>
        ) : (
          <EmptyState
            icon={Receipt}
            title="No transactions found"
            description={search || categoryFilter || typeFilter || tagFilter.length > 0 || dateFilter !== 'all' ? 'Try adjusting your filters' : 'Add your first transaction to get started'}
            action={!search && !categoryFilter && tagFilter.length === 0 && dateFilter === 'all' ? 'Add transaction' : undefined}
            onAction={() => navigate('/add')}
          />
        )}
      </div>

      {/* Edit modal */}
      <Modal open={!!editTx} onClose={() => setEditTx(null)} title="Edit transaction">
        {editTx && <ManualForm initial={editTx} onSubmit={handleEdit} submitLabel="Save changes" />}
      </Modal>

      {/* Delete confirmation */}
      <Modal open={!!deleteTx} onClose={() => setDeleteTx(null)} title="Delete transaction">
        <p className="text-sm mb-4">
          Are you sure you want to delete the {deleteTx?.merchant || 'this'} transaction for{' '}
          <strong className="money">{deleteTx && formatCurrency(deleteTx.amount, deleteTx.currency)}</strong>?
        </p>
        <div className="flex gap-2 justify-end">
          <button onClick={() => setDeleteTx(null)} className="btn-secondary">Cancel</button>
          <button onClick={handleDelete} className="btn-danger">Delete</button>
        </div>
      </Modal>
    </div>
  );
}
