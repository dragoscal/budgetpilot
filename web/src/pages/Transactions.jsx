import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { transactions as txApi, undoImportBatch, getLastImportBatch } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import HelpButton from '../components/HelpButton';
import { sortByDate, formatCurrency, sumAmountsMultiCurrency, getCategoryById } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import TransactionRow from '../components/TransactionRow';
import TransactionEditModal from '../components/TransactionEditModal';
import SearchFilter from '../components/SearchFilter';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonRow } from '../components/LoadingSkeleton';
import { SORT_OPTIONS } from '../lib/constants';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';
import { checkDuplicate, auditTransactions, learnCategory } from '../lib/smartFeatures';
import { Receipt, Download, Tag, Hash, X, User, Home, Undo2, CheckSquare, Zap, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, AlertCircle, ArrowRight, Link } from 'lucide-react';
import QuickAdd from '../components/QuickAdd';
import BatchToolbar from '../components/BatchToolbar';
import { correlateTransactions } from '../lib/transactionCorrelation';

const PAGE_SIZE = 30;

function generatePageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

export default function Transactions() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, effectiveUserId } = useAuth();
  const { t } = useTranslation();
  const { categories } = useCategories();
  const currency = user?.defaultCurrency || 'RON';
  const [allTx, setAllTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState([]);
  const [dateFilter, setDateFilter] = useState('all');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
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
  const [lastBatch, setLastBatch] = useState(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [auditResult, setAuditResult] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [correlationResult, setCorrelationResult] = useState(null);
  const [correlating, setCorrelating] = useState(false);
  const [selectAllFiltered, setSelectAllFiltered] = useState(false);

  const handleAudit = async () => {
    setAuditing(true);
    try {
      const result = await auditTransactions(effectiveUserId);
      setAuditResult(result);
    } catch (err) {
      toast.error(t('transactions.auditFailed'));
    } finally {
      setAuditing(false);
    }
  };

  const handleCorrelate = async () => {
    setCorrelating(true);
    try {
      const result = correlateTransactions(allTx);
      setCorrelationResult(result);
    } catch (err) {
      toast.error(t('transactions.correlationFailed'));
    } finally {
      setCorrelating(false);
    }
  };

  const handleMergeCorrelation = async (match) => {
    try {
      // Keep the import transaction, merge description/tags from manual, delete manual
      const merged = {
        ...match.import,
        description: [match.import.description, match.manual.description].filter(Boolean).join(' | '),
        tags: [...new Set([...(match.import.tags || []), ...(match.manual.tags || [])])],
      };
      await txApi.update(match.import.id, merged);
      await txApi.remove(match.manual.id);
      setAllTx(prev => prev.filter(t => t.id !== match.manual.id).map(t => t.id === match.import.id ? merged : t));
      setCorrelationResult(prev => ({
        ...prev,
        matches: prev.matches.filter(m => m.manual.id !== match.manual.id),
      }));
      toast.success(t('transactions.merged'));
    } catch (err) {
      toast.error(t('common.error'));
    }
  };

  const handleApplyCategorySuggestion = async (suggestion) => {
    try {
      const tx = allTx.find(t => t.id === suggestion.transactionId);
      if (!tx) return;
      await txApi.update(tx.id, { ...tx, category: suggestion.suggestedCategory });
      setAllTx((prev) => prev.map((t) => t.id === tx.id ? { ...t, category: suggestion.suggestedCategory } : t));
      setAuditResult((prev) => ({
        ...prev,
        categorySuggestions: prev.categorySuggestions.filter(s => s.transactionId !== suggestion.transactionId),
      }));
      toast.success(t('transactions.categoryUpdated'));
    } catch (err) {
      toast.error(t('common.error'));
    }
  };

  const handleDeleteDuplicate = async (txId) => {
    try {
      await txApi.remove(txId);
      setAllTx((prev) => prev.filter((t) => t.id !== txId));
      // Update audit results
      setAuditResult((prev) => ({
        ...prev,
        duplicates: prev.duplicates.map(g => ({
          ...g,
          transactions: g.transactions.filter(t => t.id !== txId),
        })).filter(g => g.transactions.length > 1),
      }));
      toast.success(t('transactions.deleted', { name: '' }));
    } catch (err) {
      toast.error(t('common.error'));
    }
  };

  const loadVersion = useRef(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;

    const load = async () => {
      setLoading(true);
      try {
        const data = await txApi.getAll({ userId: effectiveUserId });
        if (loadVersion.current !== version) return; // Stale
        setAllTx(data);
      } catch (err) {
        if (loadVersion.current === version) toast.error(t('transactions.failedLoad'));
      } finally {
        if (loadVersion.current === version) setLoading(false);
      }
    };

    load();
    getCachedRates().then(setRates);
    getLastImportBatch().then(setLastBatch).catch(() => {});
  }, [effectiveUserId]);

  const loadTransactions = async () => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await txApi.getAll({ userId: effectiveUserId });
      if (loadVersion.current !== version) return;
      setAllTx(data);
    } catch (err) {
      if (loadVersion.current === version) toast.error(t('transactions.failedLoad'));
    } finally {
      if (loadVersion.current === version) setLoading(false);
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

  // Reset page to 1 and clear selection whenever any filter changes
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setSelectAllFiltered(false);
  }, [search, categoryFilter, typeFilter, tagFilter, dateFilter, customDateFrom, customDateTo, amountMin, amountMax, scopeFilter, sort]);

  const filtered = useMemo(() => {
    let result = [...allTx];

    // Scope filter
    if (scopeFilter !== 'all') {
      result = result.filter(t => (t.scope || 'personal') === scopeFilter);
    }

    // Date filter
    if (dateFilter === 'custom') {
      if (customDateFrom) result = result.filter(t => t.date >= customDateFrom);
      if (customDateTo) result = result.filter(t => t.date <= customDateTo);
    } else if (dateFilter !== 'all') {
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
  }, [allTx, search, categoryFilter, typeFilter, tagFilter, sort, dateFilter, customDateFrom, customDateTo, amountMin, amountMax, scopeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [filtered, safePage]);

  const totalExpenses = sumAmountsMultiCurrency(filtered.filter((t) => t.type === 'expense'), currency, rates);
  const totalIncome = sumAmountsMultiCurrency(filtered.filter((t) => t.type === 'income'), currency, rates);

  const handleDelete = async () => {
    if (!deleteTx) return;
    const txToDelete = { ...deleteTx };
    // Immediately remove from UI
    setAllTx((prev) => prev.filter((t) => t.id !== txToDelete.id));
    setDeleteTx(null);

    // Delete from server immediately (no delay — prevents ghost returns on refresh)
    try {
      await txApi.remove(txToDelete.id);
    } catch (err) {
      // Restore on failure
      setAllTx((prev) => sortByDate([...prev, txToDelete]));
      toast.error(t('common.error'));
      return;
    }

    // Undo toast: re-create if user wants it back
    toast.undo(t('transactions.deleted', { name: txToDelete.merchant || t('common.transaction') }), {
      onUndo: async () => {
        try {
          const { deletedAt, ...clean } = txToDelete;
          await txApi.create(clean);
          setAllTx((prev) => sortByDate([...prev, txToDelete]));
        } catch (err) {
          toast.error(t('common.error'));
        }
      },
      duration: 5000,
    });
  };

  const handleEdit = async (updated) => {
    try {
      // Check for duplicates (excluding the transaction being edited)
      const dupes = await checkDuplicate(updated, effectiveUserId);
      const realDupes = dupes.filter(d => d.transaction.id !== updated.id && d.confidence >= 0.7);
      if (realDupes.length > 0) {
        const proceed = confirm(t('transactions.duplicateWarning', { merchant: realDupes[0].transaction.merchant, date: realDupes[0].transaction.date }));
        if (!proceed) return;
      }

      // Capture original category before update for propagation check
      const original = allTx.find(tx => tx.id === updated.id);
      const categoryChanged = original && updated.category && original.category !== updated.category;
      const merchant = updated.merchant || original?.merchant;

      await txApi.update(updated.id, updated);
      setAllTx((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
      setEditTx(null);

      // Category propagation: offer to re-categorize all matching merchant transactions
      if (categoryChanged && merchant) {
        const matchingTxs = allTx.filter(tx =>
          tx.id !== updated.id &&
          tx.merchant && tx.merchant.toLowerCase() === merchant.toLowerCase() &&
          tx.category !== updated.category
        );
        if (matchingTxs.length > 0) {
          const catObj = getCategoryById(updated.category);
          const catName = getCategoryLabel(catObj, t);
          // Capture only IDs to avoid stale closure over full transaction objects
          const matchingIds = new Set(matchingTxs.map(tx => tx.id));
          const newCategory = updated.category;
          const newSubcategory = updated.subcategory || null;
          toast.action(
            t('transactions.categoryPropagation', { category: catName, merchant, count: matchingTxs.length }),
            {
              actionLabel: t('transactions.applyToAll', { count: matchingTxs.length }),
              onAction: async () => {
                try {
                  await Promise.all([...matchingIds].map(id =>
                    txApi.update(id, { category: newCategory, subcategory: newSubcategory })
                  ));
                  setAllTx(prev => prev.map(tx =>
                    matchingIds.has(tx.id)
                      ? { ...tx, category: newCategory, subcategory: newSubcategory }
                      : tx
                  ));
                  toast.success(t('transactions.recategorized', { count: matchingIds.size }));
                } catch (err) {
                  toast.error(t('transactions.failedCategorize'));
                }
              },
            }
          );
        } else {
          toast.success(t('transactions.updated'));
        }
      } else {
        toast.success(t('transactions.updated'));
      }
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
    setSelectAllFiltered(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const handleSelectAll = (checked) => {
    setSelectAllFiltered(false);
    if (checked) {
      setSelected(new Set(paginated.map((tx) => tx.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectAllFiltered(true);
    setSelected(new Set(filtered.map((tx) => tx.id)));
  };

  const handleClearSelection = () => {
    setSelected(new Set());
    setSelectAllFiltered(false);
  };

  // Batch date change handler
  const handleBatchDate = async (newDate) => {
    if (selected.size === 0) return;
    try {
      const selectedTxs = [...selected].map(id => allTx.find(t => t.id === id)).filter(Boolean);
      await Promise.all(selectedTxs.map(tx => txApi.update(tx.id, { ...tx, date: newDate })));
      setAllTx((prev) => prev.map((t) => selected.has(t.id) ? { ...t, date: newDate } : t));
      toast.success(t('batch.dateUpdated', { count: selected.size }));
      handleClearSelection();
    } catch (err) {
      toast.error(t('common.error'));
    }
  };

  // Batch tag add handler
  const handleBatchTagAdd = async (tag) => {
    if (selected.size === 0) return;
    try {
      const selectedTxs = [...selected].map(id => allTx.find(t => t.id === id)).filter(Boolean);
      const updates = selectedTxs.map(tx => {
        const tags = [...new Set([...(tx.tags || []), tag])];
        return txApi.update(tx.id, { ...tx, tags });
      });
      await Promise.all(updates);
      setAllTx((prev) => prev.map((t) =>
        selected.has(t.id) ? { ...t, tags: [...new Set([...(t.tags || []), tag])] } : t
      ));
      toast.success(t('batch.tagAdded', { tag, count: selected.size }));
      handleClearSelection();
    } catch (err) {
      toast.error(t('common.error'));
    }
  };

  // Batch tag remove handler
  const handleBatchTagRemove = async (tag) => {
    if (selected.size === 0) return;
    try {
      const selectedTxs = [...selected].map(id => allTx.find(t => t.id === id)).filter(Boolean);
      const updates = selectedTxs.map(tx => {
        const tags = (tx.tags || []).filter(t => t.toLowerCase() !== tag.toLowerCase());
        return txApi.update(tx.id, { ...tx, tags });
      });
      await Promise.all(updates);
      setAllTx((prev) => prev.map((t) =>
        selected.has(t.id) ? { ...t, tags: (t.tags || []).filter(tg => tg.toLowerCase() !== tag.toLowerCase()) } : t
      ));
      toast.success(t('batch.tagRemoved', { tag, count: selected.size }));
      handleClearSelection();
    } catch (err) {
      toast.error(t('common.error'));
    }
  };

  // Batch export selected transactions as CSV
  const handleBatchExport = () => {
    if (selected.size === 0) return;
    const selectedTxs = [...selected].map(id => allTx.find(t => t.id === id)).filter(Boolean);
    const headers = ['Date', 'Type', 'Merchant', 'Category', 'Amount', 'Currency', 'Description', 'Tags', 'Scope'];
    const rows = selectedTxs.map((t) => [
      t.date, t.type, t.merchant, t.category, t.amount, t.currency, t.description, (t.tags || []).join(';'), t.scope || 'personal',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transactions-selected_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t('batch.exported', { count: selected.size }));
  };

  const handleUndoLastImport = async () => {
    if (!lastBatch) return;
    if (!confirm(t('transactions.undoImportConfirm', { count: lastBatch.count }))) return;
    try {
      await undoImportBatch(lastBatch.batchId);
      setLastBatch(null);
      await loadTransactions();
      toast.success(t('transactions.undoImportSuccess', { count: lastBatch.count }));
    } catch (err) {
      toast.error(t('transactions.undoImportFailed'));
    }
  };

  const handleBatchCategorize = async (newCategory) => {
    if (selected.size === 0) return;
    try {
      const selectedTxs = [...selected].map(id => allTx.find(t => t.id === id)).filter(Boolean);
      const updates = selectedTxs.map(tx =>
        txApi.update(tx.id, { ...tx, category: newCategory })
      );
      await Promise.all(updates);
      setAllTx((prev) => prev.map((t) => selected.has(t.id) ? { ...t, category: newCategory } : t));

      // Learn category for each unique merchant in the batch
      const uniqueMerchants = new Set(selectedTxs.map(tx => tx.merchant).filter(Boolean));
      for (const merchant of uniqueMerchants) {
        learnCategory(merchant, newCategory, null);
      }

      toast.success(t('transactions.recategorized', { count: selected.size }));
      handleClearSelection();
    } catch (err) {
      toast.error(t('transactions.failedCategorize'));
    }
  };

  const exportCSV = () => {
    const headers = ['Date', 'Type', 'Merchant', 'Category', 'Amount', 'Currency', 'Description', 'Tags', 'Scope'];
    const rows = filtered.map((t) => [
      t.date, t.type, t.merchant, t.category, t.amount, t.currency, t.description, (t.tags || []).join(';'), t.scope || 'personal',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
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
          {lastBatch && (
            <button onClick={handleUndoLastImport} className="btn-ghost text-xs flex items-center gap-1 text-warning">
              <Undo2 size={14} /> {t('transactions.undoImport', { count: lastBatch.count })}
            </button>
          )}
          <button onClick={handleAudit} disabled={auditing || loading} className="btn-ghost text-xs flex items-center gap-1">
            {auditing ? <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <Search size={14} />}
            {t('transactions.audit')}
          </button>
          <button onClick={handleCorrelate} disabled={correlating || loading} className="btn-ghost text-xs flex items-center gap-1">
            {correlating ? <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" /> : <Link size={14} />}
            {t('transactions.correlate')}
          </button>
          <button onClick={exportCSV} className="btn-ghost text-xs flex items-center gap-1">
            <Download size={14} /> {t('transactions.exportCsv')}
          </button>
        </div>
      </div>

      {/* Quick Add */}
      <div className="card !p-3">
        <button
          onClick={() => setShowQuickAdd(prev => !prev)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-success" />
            <span className="text-sm font-medium">{t('quickAdd.title')}</span>
          </div>
          <ChevronDown size={14} className={`text-cream-400 transition-transform ${showQuickAdd ? 'rotate-180' : ''}`} />
        </button>
        {showQuickAdd && (
          <div className="mt-3 pt-3 border-t border-cream-200 dark:border-dark-border">
            <QuickAdd
              onResult={async (results) => {
                if (!results || results.length === 0) return;
                try {
                  let savedCount = 0;
                  for (const tx of results) {
                    await txApi.create(tx);
                    if (tx.merchant) learnCategory(tx.merchant, tx.category, tx.subcategory || null);
                    savedCount++;
                  }
                  toast.success(t('addTransaction.transactionsAdded').replace('{count}', savedCount));
                  setShowQuickAdd(false);
                  await loadTransactions();
                } catch (err) {
                  toast.error(err.message || t('common.error'));
                }
              }}
              onError={(msg) => toast.error(msg)}
            />
          </div>
        )}
      </div>

      {/* Audit Results */}
      {auditResult && (
        <div className="card !p-4 space-y-4 border-2 border-accent/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={16} className="text-accent" />
              <h3 className="text-sm font-semibold">{t('transactions.auditResults')}</h3>
              <span className="text-xs text-cream-400">({auditResult.totalScanned} {t('transactions.scanned')})</span>
            </div>
            <button onClick={() => setAuditResult(null)} className="p-1 rounded hover:bg-cream-100 dark:hover:bg-dark-border">
              <X size={14} className="text-cream-400" />
            </button>
          </div>

          {auditResult.duplicates.length === 0 && (auditResult.categorySuggestions?.length || 0) === 0 && (auditResult.unusualAmounts?.length || 0) === 0 && (auditResult.missingRecurring?.length || 0) === 0 ? (
            <p className="text-sm text-success flex items-center gap-2">
              <CheckSquare size={16} /> {t('transactions.auditClean')}
            </p>
          ) : (
            <>
              {/* Duplicates */}
              {auditResult.duplicates.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-danger mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    {t('transactions.auditDuplicates', { count: auditResult.duplicates.length })}
                  </p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {auditResult.duplicates.map((group, gi) => (
                      <div key={gi} className="p-2.5 rounded-lg bg-danger/5 border border-danger/10 space-y-1.5">
                        <p className="text-[10px] text-cream-500">{group.reason}</p>
                        {group.transactions.map((tx, ti) => (
                          <div key={tx.id} className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium truncate">{tx.merchant || '—'}</span>
                              <span className="money text-cream-500 shrink-0">{tx.amount?.toFixed(2)} {tx.currency}</span>
                              <span className="text-cream-400 shrink-0">{tx.date}</span>
                              <span className="text-[10px] text-cream-400">({tx.source})</span>
                            </div>
                            {ti > 0 && (
                              <button
                                onClick={() => handleDeleteDuplicate(tx.id)}
                                className="shrink-0 px-2 py-0.5 text-[10px] text-danger bg-danger/10 rounded hover:bg-danger/20"
                              >
                                {t('common.delete')}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Category suggestions */}
              {auditResult.categorySuggestions?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-accent mb-2 flex items-center gap-1.5">
                    <Tag size={14} />
                    {t('transactions.auditCategories', { count: auditResult.categorySuggestions.length })}
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditResult.categorySuggestions.map((s) => (
                      <div key={s.transactionId} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-accent/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{s.merchant}</span>
                          <span className="text-cream-400">{s.currentCategory}</span>
                          <ArrowRight size={10} className="text-cream-400 shrink-0" />
                          <span className="font-medium text-accent">{s.suggestedCategory}</span>
                        </div>
                        <button
                          onClick={() => handleApplyCategorySuggestion(s)}
                          className="shrink-0 px-2 py-0.5 text-[10px] text-accent bg-accent/10 rounded hover:bg-accent/20"
                        >
                          {t('transactions.applyCategory')}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unusual amounts */}
              {auditResult.unusualAmounts?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-warning mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    {t('transactions.unusualAmounts', { count: auditResult.unusualAmounts.length })}
                  </p>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {auditResult.unusualAmounts.map((u) => (
                      <div key={u.transactionId} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-warning/5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{u.merchant || '—'}</span>
                          <span className="money text-cream-500">{u.amount?.toFixed(2)} {u.currency}</span>
                          <span className="text-cream-400">{u.date}</span>
                        </div>
                        <span className="text-[10px] text-warning font-medium shrink-0">
                          {u.ratio}x {t('transactions.aboveMedian')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Missing recurring */}
              {auditResult.missingRecurring?.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-info mb-2 flex items-center gap-1.5">
                    <AlertCircle size={14} />
                    {t('transactions.missingRecurring', { count: auditResult.missingRecurring.length })}
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {auditResult.missingRecurring.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 text-xs p-2 rounded-lg bg-info/5">
                        <span className="font-medium truncate">{r.name}</span>
                        <span className="money text-cream-500 shrink-0">{r.amount?.toFixed(2)} {r.currency} — {t('recurring.dayBilling', { day: r.billingDay })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Correlation Results */}
      {correlationResult && (
        <div className="card !p-4 space-y-4 border-2 border-info/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link size={16} className="text-info" />
              <h3 className="text-sm font-semibold">{t('transactions.correlationResults')}</h3>
              <span className="text-xs text-cream-400">({correlationResult.matches.length} {t('transactions.matchesFound')})</span>
            </div>
            <button onClick={() => setCorrelationResult(null)} className="p-1 rounded hover:bg-cream-100 dark:hover:bg-dark-border">
              <X size={14} className="text-cream-400" />
            </button>
          </div>

          {correlationResult.matches.length === 0 ? (
            <p className="text-sm text-cream-500 flex items-center gap-2">
              <CheckSquare size={16} className="text-success" /> {t('transactions.noCorrelations')}
            </p>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {correlationResult.matches.map((match, i) => (
                <div key={i} className="p-3 rounded-lg bg-info/5 border border-info/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-info uppercase tracking-wider">
                      {Math.round(match.confidence * 100)}% {t('transactions.matchConfidence')}
                    </span>
                    <div className="flex gap-1.5">
                      <button onClick={() => handleMergeCorrelation(match)}
                        className="px-2 py-0.5 text-[10px] font-medium text-white bg-info rounded hover:bg-info/80">
                        {t('transactions.merge')}
                      </button>
                      <button onClick={() => setCorrelationResult(prev => ({
                        ...prev,
                        matches: prev.matches.filter((_, j) => j !== i),
                      }))}
                        className="px-2 py-0.5 text-[10px] text-cream-500 bg-cream-100 dark:bg-dark-border rounded hover:bg-cream-200">
                        {t('transactions.notAMatch')}
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border">
                      <p className="text-[10px] text-cream-400 mb-1">{match.manual.source || 'manual'}</p>
                      <p className="font-medium truncate">{match.manual.merchant || '—'}</p>
                      <p className="money text-cream-500">{match.manual.amount?.toFixed(2)} {match.manual.currency} · {match.manual.date}</p>
                    </div>
                    <div className="p-2 rounded bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border">
                      <p className="text-[10px] text-cream-400 mb-1">{t('transactions.import')}</p>
                      <p className="font-medium truncate">{match.import.merchant || '—'}</p>
                      <p className="money text-cream-500">{match.import.amount?.toFixed(2)} {match.import.currency} · {match.import.date}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-cream-500 shrink-0">{t('transactions.period')}</span>
        <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-x-auto scrollbar-hide">
          {[
            { id: 'all', label: t('common.all') },
            { id: 'thisMonth', label: t('transactions.thisMonth') },
            { id: '7d', label: '7d' },
            { id: '30d', label: '30d' },
            { id: '90d', label: '90d' },
            { id: 'custom', label: t('transactions.custom') },
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
        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" className="input text-xs w-auto py-1.5" value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)} />
            <span className="text-xs text-cream-400">→</span>
            <input type="date" className="input text-xs w-auto py-1.5" value={customDateTo}
              onChange={(e) => setCustomDateTo(e.target.value)} />
            {(customDateFrom || customDateTo) && (
              <button onClick={() => { setCustomDateFrom(''); setCustomDateTo(''); }}
                className="p-1 rounded-full text-cream-400 hover:text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border transition-colors">
                <X size={12} />
              </button>
            )}
          </div>
        )}
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
            {/* Select All header */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-cream-100 dark:border-dark-border bg-cream-50/50 dark:bg-dark-border/30">
              <input
                type="checkbox"
                checked={paginated.length > 0 && (selectAllFiltered ? selected.size === filtered.length : paginated.every(tx => selected.has(tx.id)))}
                ref={(el) => {
                  if (el) el.indeterminate = selected.size > 0 && selected.size < (selectAllFiltered ? filtered.length : paginated.length);
                }}
                onChange={(e) => handleSelectAll(e.target.checked)}
                className="w-4 h-4 rounded border-cream-300 dark:border-dark-border text-accent focus:ring-accent/30"
              />
              <span className="text-xs text-cream-500">
                {selected.size > 0
                  ? t('transactions.selectedCount', { count: selected.size })
                  : t('transactions.selectAll')}
              </span>
            </div>
            {/* Select all filtered banner */}
            {selected.size > 0 && selected.size === paginated.length && !selectAllFiltered && filtered.length > paginated.length && (
              <div className="px-4 py-2 bg-accent/5 border-b border-cream-100 dark:border-dark-border text-center">
                <span className="text-xs text-cream-600 dark:text-cream-400">
                  {t('batch.allPageSelected', { count: paginated.length })}{' '}
                  <button
                    onClick={handleSelectAllFiltered}
                    className="text-accent font-medium hover:underline"
                  >
                    {t('batch.selectAllFiltered', { count: filtered.length })}
                  </button>
                </span>
              </div>
            )}
            {selectAllFiltered && (
              <div className="px-4 py-2 bg-accent/10 border-b border-cream-100 dark:border-dark-border text-center">
                <span className="text-xs text-accent font-medium">
                  {t('batch.allFilteredSelected', { count: filtered.length })}{' '}
                  <button
                    onClick={handleClearSelection}
                    className="text-cream-500 hover:underline"
                  >
                    {t('batch.clearSelection')}
                  </button>
                </span>
              </div>
            )}
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
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 py-3 border-t border-cream-100 dark:border-dark-border">
                <button disabled={safePage <= 1} onClick={() => setPage(1)} className="pagination-btn">
                  <ChevronsLeft size={14} />
                </button>
                <button disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))} className="pagination-btn">
                  <ChevronLeft size={14} />
                </button>
                {generatePageNumbers(safePage, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`e${i}`} className="px-1 text-cream-400 text-xs">…</span>
                  ) : (
                    <button key={p} onClick={() => setPage(p)}
                      className={`pagination-btn ${p === safePage ? 'pagination-btn-active' : ''}`}>
                      {p}
                    </button>
                  )
                )}
                <button disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))} className="pagination-btn">
                  <ChevronRight size={14} />
                </button>
                <button disabled={safePage >= totalPages} onClick={() => setPage(totalPages)} className="pagination-btn">
                  <ChevronsRight size={14} />
                </button>
                <span className="text-[11px] text-cream-400 ml-2">
                  {t('transactions.pageInfo', { current: safePage, total: totalPages, count: filtered.length })}
                </span>
              </div>
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

      {/* Floating batch toolbar */}
      <BatchToolbar
        selectedCount={selected.size}
        onClearSelection={handleClearSelection}
        onBatchCategory={handleBatchCategorize}
        onBatchDate={handleBatchDate}
        onBatchTagAdd={handleBatchTagAdd}
        onBatchTagRemove={handleBatchTagRemove}
        onBatchExport={handleBatchExport}
        onBulkDelete={handleBulkDelete}
      />
    </div>
  );
}
