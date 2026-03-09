import { useState, useEffect, useMemo } from 'react';
import { transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { sortByDate, formatCurrency, sumBy } from '../lib/helpers';
import TransactionRow from '../components/TransactionRow';
import SearchFilter from '../components/SearchFilter';
import Modal from '../components/Modal';
import ManualForm from '../components/ManualForm';
import EmptyState from '../components/EmptyState';
import { SkeletonRow } from '../components/LoadingSkeleton';
import { SORT_OPTIONS } from '../lib/constants';
import { Receipt, Download, Trash2, Tag } from 'lucide-react';

const PAGE_SIZE = 30;

export default function Transactions() {
  const { toast } = useToast();
  const [allTx, setAllTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [page, setPage] = useState(1);
  const [editTx, setEditTx] = useState(null);
  const [deleteTx, setDeleteTx] = useState(null);
  const [selected, setSelected] = useState(new Set());

  useEffect(() => { loadTransactions(); }, []);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const data = await txApi.getAll({ userId: 'local' });
      setAllTx(data);
    } catch (err) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let result = [...allTx];

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

    // Sort
    const [sortKey, sortDir] = sort.split('-');
    if (sortKey === 'date') {
      result = sortByDate(result, 'date', sortDir);
    } else if (sortKey === 'amount') {
      result.sort((a, b) => sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount);
    } else if (sortKey === 'merchant') {
      result.sort((a, b) => (a.merchant || '').localeCompare(b.merchant || ''));
    }

    return result;
  }, [allTx, search, categoryFilter, typeFilter, sort]);

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
    try {
      for (const id of selected) {
        await txApi.remove(id);
      }
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
        <span className="text-danger money">-{formatCurrency(totalExpenses, 'RON')}</span>
        <span className="text-income money">+{formatCurrency(totalIncome, 'RON')}</span>
      </div>

      <SearchFilter
        search={search} onSearch={setSearch}
        category={categoryFilter} onCategory={setCategoryFilter}
        type={typeFilter} onType={setTypeFilter}
      />

      <div className="flex gap-2">
        <select className="input w-auto text-xs" value={sort} onChange={(e) => setSort(e.target.value)}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
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
            description={search || categoryFilter || typeFilter ? 'Try adjusting your filters' : 'Add your first transaction to get started'}
            action={!search && !categoryFilter ? 'Add transaction' : undefined}
            onAction={() => window.location.href = '/add'}
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
