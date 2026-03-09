import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { transactions as txApi } from '../lib/api';
import { formatCurrency, getCategoryById, getMonthRange, generateId } from '../lib/helpers';
import { CATEGORIES } from '../lib/constants';
import { checkDuplicate, checkBudgetAlerts, learnCategory } from '../lib/smartFeatures';
import { getTransactionsByDateRange, saveDraft, getDrafts, deleteDraft } from '../lib/storage';
import ReceiptScanner from '../components/ReceiptScanner';
import QuickAdd from '../components/QuickAdd';
import ManualForm from '../components/ManualForm';
import CategoryPicker from '../components/CategoryPicker';
import BankStatementUpload from '../components/BankStatementUpload';
import {
  Camera, Zap, PenLine, ChevronDown, ChevronUp, Check, X,
  AlertTriangle, ShoppingBag, AlertCircle, Info, Eye,
  Plus, Minus, Trash2, Undo2, Pencil, Clock, FileText, Building2,
} from 'lucide-react';

export default function AddTransaction() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('quick');
  const [showManual, setShowManual] = useState(false);
  const [pendingResults, setPendingResults] = useState(null);
  const [receiptMeta, setReceiptMeta] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [pendingSave, setPendingSave] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});

  // Inline editing state
  const [editingField, setEditingField] = useState(null); // { txIdx, field, itemIdx? }
  const [editValue, setEditValue] = useState('');
  const editRef = useRef(null);

  // Undo state for deleted items
  const [deletedItem, setDeletedItem] = useState(null); // { txIdx, itemIdx, item, timeout }

  // Add new item state
  const [addingItem, setAddingItem] = useState(null); // txIdx or null
  const [newItem, setNewItem] = useState({ name: '', price: '', qty: '1', category: 'other' });

  // Draft state
  const [drafts, setDrafts] = useState([]);
  const [showDrafts, setShowDrafts] = useState(false);

  // Focus edit input when it appears
  useEffect(() => {
    if (editRef.current) editRef.current.focus();
  }, [editingField]);

  // Load drafts on mount
  const loadDrafts = useCallback(async () => {
    try {
      const d = await getDrafts();
      setDrafts(d);
    } catch (e) { /* silently fail */ }
  }, []);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);

  const handleAIResult = async (results) => {
    let txns;
    if (results.transactions) {
      txns = results.transactions;
      setReceiptMeta({
        receipt: results.receipt,
        warnings: results.warnings || [],
        summary: results.summary || '',
        hasItemsToReview: results.hasItemsToReview || false,
      });
    } else if (Array.isArray(results)) {
      txns = results;
      setReceiptMeta(null);
    } else {
      txns = [results];
      setReceiptMeta(null);
    }

    // Check duplicates for each transaction
    const enriched = [];
    for (const tx of txns) {
      const dupes = await checkDuplicate(tx);
      enriched.push({
        ...tx,
        _duplicate: dupes.length > 0 && dupes[0].confidence >= 0.6 ? dupes[0] : null,
        _dismissed: false,
      });
    }
    setPendingResults(enriched);
  };

  const handleSaveResults = async () => {
    if (!pendingResults) return;
    try {
      const toSave = pendingResults.filter((tx) => !tx._dismissed);
      for (const tx of toSave) {
        const { _duplicate, _dismissed, ...clean } = tx;
        await txApi.create(clean);
        if (clean.merchant) learnCategory(clean.merchant, clean.category, clean.subcategory || null);
      }
      toast.success(`${toSave.length} transaction${toSave.length > 1 ? 's' : ''} added!`);
      await showBudgetAlerts();
      setPendingResults(null);
      setReceiptMeta(null);
      navigate('/transactions');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleManualSubmit = async (tx) => {
    const dupes = await checkDuplicate(tx);
    if (dupes.length > 0 && dupes[0].confidence >= 0.6) {
      setDuplicateWarning(dupes[0]);
      setPendingSave(tx);
      return;
    }
    await saveTransaction(tx);
  };

  const saveTransaction = async (tx) => {
    try {
      await txApi.create(tx);
      toast.success('Transaction added!');
      await showBudgetAlerts();
      navigate('/transactions');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const confirmSaveDespiteDuplicate = async () => {
    if (pendingSave) {
      try {
        await saveTransaction(pendingSave);
      } catch (err) {
        toast.error(err.message || 'Failed to save');
      }
      setDuplicateWarning(null);
      setPendingSave(null);
    }
  };

  const cancelDuplicate = () => {
    setDuplicateWarning(null);
    setPendingSave(null);
  };

  const showBudgetAlerts = async () => {
    try {
      const { start, end } = getMonthRange(new Date());
      const monthTx = await getTransactionsByDateRange(start, end);
      const alerts = await checkBudgetAlerts(monthTx);
      for (const alert of alerts) {
        if (alert.type === 'over') toast.error(alert.message);
        else toast.warning(alert.message);
      }
    } catch (e) { /* silently fail */ }
  };

  const handleError = (msg) => toast.error(msg);

  // ─── DRAFT SAVE / LOAD / DELETE ────────────────────────
  const handleSaveForLater = async () => {
    if (!pendingResults) return;
    try {
      const merchant = pendingResults[0]?.merchant || 'Receipt';
      const date = pendingResults[0]?.date || new Date().toISOString().slice(0, 10);
      const totalAmount = pendingResults
        .filter(t => !t._dismissed)
        .reduce((s, t) => s + (t.amount || 0), 0);
      const currency = pendingResults[0]?.currency || 'RON';

      const draft = {
        id: generateId(),
        savedAt: new Date().toISOString(),
        label: `${merchant} — ${date}`,
        merchant,
        date,
        totalAmount,
        currency,
        transactionCount: pendingResults.filter(t => !t._dismissed).length,
        transactions: pendingResults,
        receiptMeta: receiptMeta || null,
      };

      await saveDraft(draft);
      toast.success('Saved as draft — come back anytime to review');
      setPendingResults(null);
      setReceiptMeta(null);
      await loadDrafts();
    } catch (err) {
      toast.error('Failed to save draft: ' + err.message);
    }
  };

  const handleLoadDraft = async (draft) => {
    setPendingResults(draft.transactions);
    setReceiptMeta(draft.receiptMeta || null);
    // Delete the draft from storage since it's now loaded
    await deleteDraft(draft.id);
    await loadDrafts();
    setShowDrafts(false);
    toast.info('Draft loaded — edit and save when ready');
  };

  const handleDeleteDraft = async (id, e) => {
    e.stopPropagation();
    await deleteDraft(id);
    toast.success('Draft removed');
    await loadDrafts();
  };

  // ─── INLINE EDITING ────────────────────────────────────
  const startEdit = (txIdx, field, currentValue, itemIdx = undefined) => {
    setEditingField({ txIdx, field, itemIdx });
    setEditValue(String(currentValue ?? ''));
  };

  const commitEdit = () => {
    if (!editingField) return;
    const { txIdx, field, itemIdx } = editingField;

    if (itemIdx !== undefined) {
      // Editing an item field
      const val = field === 'price' || field === 'qty' ? Number(editValue) || 0 : editValue;
      updatePendingItem(txIdx, itemIdx, { [field]: val });
      // Recalculate transaction total from items
      recalcTxTotal(txIdx);
    } else {
      // Editing a transaction field
      const val = field === 'amount' ? Number(editValue) || 0 : editValue;
      updatePending(txIdx, { [field]: val });
    }

    setEditingField(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  const isEditing = (txIdx, field, itemIdx) => {
    if (!editingField) return false;
    return editingField.txIdx === txIdx &&
           editingField.field === field &&
           editingField.itemIdx === itemIdx;
  };

  // ─── UPDATE HELPERS ────────────────────────────────────
  const updatePending = (idx, changes) => {
    setPendingResults((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, ...changes } : t))
    );
  };

  const updatePendingItem = (txIdx, itemIdx, changes) => {
    setPendingResults((prev) =>
      prev.map((t, i) => {
        if (i !== txIdx) return t;
        const newItems = t.items.map((item, j) =>
          j === itemIdx ? { ...item, ...changes } : item
        );
        return { ...t, items: newItems };
      })
    );
  };

  const recalcTxTotal = (txIdx) => {
    setPendingResults((prev) =>
      prev.map((t, i) => {
        if (i !== txIdx || !t.items?.length) return t;
        const total = t.items.reduce((s, item) => s + (item.price * (item.qty || 1)), 0);
        return { ...t, amount: Math.round(total * 100) / 100 };
      })
    );
  };

  const removePending = (idx) => {
    setPendingResults((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setReceiptMeta(null);
      return next.length > 0 ? next : null;
    });
  };

  // ─── ITEM CRUD ─────────────────────────────────────────
  const deleteItem = (txIdx, itemIdx) => {
    const item = pendingResults[txIdx].items[itemIdx];
    // Store for undo
    if (deletedItem?.timeout) clearTimeout(deletedItem.timeout);

    const timeout = setTimeout(() => {
      setDeletedItem(null);
    }, 5000);

    setDeletedItem({ txIdx, itemIdx, item, timeout });

    // Remove from items
    setPendingResults((prev) =>
      prev.map((t, i) => {
        if (i !== txIdx) return t;
        const newItems = t.items.filter((_, j) => j !== itemIdx);
        const total = newItems.reduce((s, it) => s + (it.price * (it.qty || 1)), 0);
        return { ...t, items: newItems, amount: Math.round(total * 100) / 100 };
      })
    );
  };

  const undoDelete = () => {
    if (!deletedItem) return;
    const { txIdx, itemIdx, item, timeout } = deletedItem;
    clearTimeout(timeout);

    setPendingResults((prev) =>
      prev.map((t, i) => {
        if (i !== txIdx) return t;
        const newItems = [...t.items];
        newItems.splice(itemIdx, 0, item);
        const total = newItems.reduce((s, it) => s + (it.price * (it.qty || 1)), 0);
        return { ...t, items: newItems, amount: Math.round(total * 100) / 100 };
      })
    );
    setDeletedItem(null);
  };

  const addItem = (txIdx) => {
    if (!newItem.name || !newItem.price) return;
    setPendingResults((prev) =>
      prev.map((t, i) => {
        if (i !== txIdx) return t;
        const item = {
          name: newItem.name,
          price: Number(newItem.price) || 0,
          qty: Number(newItem.qty) || 1,
          unitPrice: Number(newItem.price) || 0,
          category: newItem.category,
          confidence: 1,
          needsReview: false,
        };
        const newItems = [...t.items, item];
        const total = newItems.reduce((s, it) => s + (it.price * (it.qty || 1)), 0);
        return { ...t, items: newItems, amount: Math.round(total * 100) / 100 };
      })
    );
    setNewItem({ name: '', price: '', qty: '1', category: 'other' });
    setAddingItem(null);
  };

  const toggleItemsExpand = (idx) => {
    setExpandedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // ─── CONFIDENCE HELPERS ────────────────────────────────
  const getConfidenceDot = (conf) => {
    if (conf >= 0.80) return { color: 'bg-success', label: 'High confidence' };
    if (conf >= 0.60) return { color: 'bg-warning', label: 'Uncertain' };
    return { color: 'bg-danger', label: 'Low confidence' };
  };

  const tabs = [
    { id: 'quick', label: 'Quick Add', icon: Zap },
    { id: 'receipt', label: 'Receipt', icon: Camera },
    { id: 'bank', label: 'Statement', icon: Building2 },
  ];

  const reviewItemsCount = pendingResults
    ? pendingResults.reduce((sum, tx) => sum + (tx.items?.filter(i => i.needsReview)?.length || 0), 0)
    : 0;

  const formatDraftAge = (isoDate) => {
    const diff = Date.now() - new Date(isoDate).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  };

  // ─── QTY +/- HELPERS ─────────────────────────────────────
  const adjustQty = (txIdx, itemIdx, delta) => {
    const item = pendingResults[txIdx].items[itemIdx];
    const newQty = Math.max(1, (item.qty || 1) + delta);
    updatePendingItem(txIdx, itemIdx, { qty: newQty });
    recalcTxTotal(txIdx);
  };

  // ─── RENDER INLINE EDIT ────────────────────────────────
  const renderEditableText = (txIdx, field, value, className = '', itemIdx = undefined) => {
    if (isEditing(txIdx, field, itemIdx)) {
      const type = field === 'amount' || field === 'price' || field === 'qty' ? 'number' : field === 'date' ? 'date' : 'text';
      return (
        <input
          ref={editRef}
          type={type}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleEditKeyDown}
          className={`bg-white dark:bg-dark-card border-2 border-indigo-400 dark:border-indigo-500 rounded-lg px-2 py-1 outline-none shadow-sm ${className}`}
          step={type === 'number' ? '0.01' : undefined}
          inputMode={type === 'number' ? 'decimal' : undefined}
        />
      );
    }
    return (
      <span
        onClick={() => startEdit(txIdx, field, value, itemIdx)}
        className={`cursor-pointer group/edit inline-flex items-center gap-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-800 rounded-lg px-1.5 py-0.5 transition-all ${className}`}
        title="Tap to edit"
      >
        {value || '—'}
        <Pencil size={10} className="text-cream-300 dark:text-cream-600 group-hover/edit:text-indigo-400 shrink-0 transition-colors" />
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <h1 className="page-title">Add Transaction</h1>

      {/* Tab selector */}
      <div className="flex gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                : 'bg-cream-200 text-cream-700 hover:bg-cream-300 dark:bg-dark-border dark:text-cream-500'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Saved Drafts */}
      {drafts.length > 0 && (
        <div className="card border-info/20 bg-info/5">
          <button
            onClick={() => setShowDrafts(!showDrafts)}
            className="flex items-center justify-between w-full"
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-info">
              <FileText size={16} />
              Saved drafts
              <span className="text-[10px] font-medium bg-info/15 text-info px-1.5 py-0.5 rounded-full">
                {drafts.length}
              </span>
            </span>
            {showDrafts ? <ChevronUp size={16} className="text-info" /> : <ChevronDown size={16} className="text-info" />}
          </button>

          {showDrafts && (
            <div className="mt-3 space-y-2">
              {drafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => handleLoadDraft(draft)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border hover:border-info/40 cursor-pointer transition-all group"
                >
                  <span className="text-lg">🧾</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{draft.label}</p>
                    <p className="text-[11px] text-cream-500">
                      {draft.transactionCount} transaction{draft.transactionCount !== 1 ? 's' : ''}
                      {' · '}
                      {formatCurrency(draft.totalAmount, draft.currency)}
                      {' · saved '}
                      {formatDraftAge(draft.savedAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteDraft(draft.id, e)}
                    className="p-1.5 rounded-lg sm:opacity-0 sm:group-hover:opacity-100 hover:bg-danger/10 text-cream-400 hover:text-danger transition-all shrink-0"
                    title="Delete draft"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronDown size={14} className="text-cream-400 rotate-[-90deg] shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick Add */}
      {activeTab === 'quick' && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">Natural language input</h3>
          <QuickAdd onResult={handleAIResult} onError={handleError} />
        </div>
      )}

      {/* Receipt Scanner */}
      {activeTab === 'receipt' && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">Scan receipt</h3>
          <ReceiptScanner onResult={handleAIResult} onError={handleError} />
        </div>
      )}

      {/* Bank Statement Upload */}
      {activeTab === 'bank' && (
        <div className="card">
          <h3 className="text-sm font-semibold mb-3">Import bank statement</h3>
          <BankStatementUpload onResult={handleAIResult} onError={handleError} />
        </div>
      )}

      {/* Receipt Summary & Warnings */}
      {receiptMeta && (
        <div className="space-y-3">
          {receiptMeta.receipt?.store && (
            <div className="card bg-cream-50 dark:bg-dark-card border border-cream-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🧾</span>
                <div>
                  <p className="font-medium text-sm">{receiptMeta.receipt.store}</p>
                  <p className="text-xs text-cream-500">
                    {receiptMeta.receipt.date}
                    {receiptMeta.receipt.time && ` at ${receiptMeta.receipt.time}`}
                    {receiptMeta.receipt.paymentMethod && receiptMeta.receipt.paymentMethod !== 'unknown' && ` · ${receiptMeta.receipt.paymentMethod}`}
                  </p>
                </div>
                {receiptMeta.receipt.total && (
                  <p className="ml-auto font-heading font-bold money">
                    {formatCurrency(receiptMeta.receipt.total, receiptMeta.receipt.currency || 'RON')}
                  </p>
                )}
              </div>
            </div>
          )}

          {receiptMeta.summary && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-info/5 border border-info/20">
              <Info size={14} className="text-info mt-0.5 shrink-0" />
              <p className="text-xs text-cream-600 dark:text-cream-400">{receiptMeta.summary}</p>
            </div>
          )}

          {receiptMeta.warnings?.length > 0 && (
            <div className="space-y-2">
              {receiptMeta.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-warning/5 border border-warning/20">
                  <AlertTriangle size={14} className="text-warning mt-0.5 shrink-0" />
                  <p className="text-xs text-cream-600 dark:text-cream-400">{w}</p>
                </div>
              ))}
            </div>
          )}

          {receiptMeta.hasItemsToReview && reviewItemsCount > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-warning/5 border border-warning/20">
              <Eye size={14} className="text-warning" />
              <p className="text-xs font-medium text-warning">
                {reviewItemsCount} item{reviewItemsCount > 1 ? 's' : ''} need your review — expand items below to check
              </p>
            </div>
          )}
        </div>
      )}

      {/* Undo delete banner */}
      {deletedItem && (
        <div className="flex items-center justify-between p-3 rounded-xl bg-cream-100 dark:bg-dark-border border border-cream-200 dark:border-dark-border animate-fadeUp">
          <span className="text-sm text-cream-600 dark:text-cream-400">
            Removed "{deletedItem.item.name}"
          </span>
          <button
            onClick={undoDelete}
            className="flex items-center gap-1 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            <Undo2 size={14} /> Undo
          </button>
        </div>
      )}

      {/* ═══════ AI REVIEW WITH ENHANCED RECEIPT ═══════ */}
      {pendingResults && pendingResults.length > 0 && (
        <div className="card border-success/30 bg-success-light/30">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold">Review & confirm</h3>
            <div className="flex gap-2">
              <button onClick={() => { setPendingResults(null); setReceiptMeta(null); }} className="btn-ghost text-xs flex items-center gap-1">
                <X size={14} /> Discard
              </button>
              <button onClick={handleSaveForLater} className="btn-ghost text-xs flex items-center gap-1 text-info border-info/30 hover:bg-info/10">
                <Clock size={14} /> Later
              </button>
              <button onClick={handleSaveResults} className="btn-primary text-xs flex items-center gap-1">
                <Check size={14} /> Save {pendingResults.filter(t => !t._dismissed).length > 1 ? `all (${pendingResults.filter(t => !t._dismissed).length})` : ''}
              </button>
            </div>
          </div>
          <p className="text-[10px] text-cream-400 dark:text-cream-600 mb-3 flex items-center gap-1">
            <Pencil size={10} /> Tap any value to edit — merchant, date, amount, item names, prices, quantities
          </p>

          <div className="space-y-3">
            {pendingResults.map((tx, idx) => {
              if (tx._dismissed) return null;
              const cat = getCategoryById(tx.category);
              const hasItems = tx.items && tx.items.length > 0;
              const needsReviewItems = hasItems ? tx.items.filter(i => i.needsReview) : [];

              // Running total for items
              const itemsTotal = hasItems ? tx.items.reduce((s, it) => s + (it.price * (it.qty || 1)), 0) : 0;
              const receiptTotal = receiptMeta?.receipt?.total;
              const mismatch = receiptTotal && hasItems && Math.abs(itemsTotal - receiptTotal) / receiptTotal > 0.02;

              return (
                <div key={idx} className={`bg-white dark:bg-dark-card rounded-xl p-4 border ${
                  tx.needsReview ? 'border-warning/40' : 'border-cream-200 dark:border-dark-border'
                }`}>
                  {/* Transaction header - editable */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-lg shrink-0">{cat.icon}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {renderEditableText(idx, 'merchant', tx.merchant || 'Unknown')}
                        </div>
                        <div className="flex items-center gap-1 text-xs text-cream-500">
                          {renderEditableText(idx, 'date', tx.date, 'text-xs')}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className={`font-heading font-bold money ${tx.type === 'income' ? 'text-income' : 'text-danger'}`}>
                        {tx.type === 'income' ? '+' : '-'}
                        {renderEditableText(idx, 'amount', tx.amount, 'text-sm font-bold w-20 text-right')}
                        {!isEditing(idx, 'amount') && (
                          <span className="text-xs font-normal text-cream-400 ml-0.5">{tx.currency}</span>
                        )}
                      </div>
                      <button onClick={() => removePending(idx)} className="p-1 rounded hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400">
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Confidence dot */}
                  {tx.confidence && tx.confidence < 0.95 && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <div className={`w-2 h-2 rounded-full ${getConfidenceDot(tx.confidence).color}`} title={getConfidenceDot(tx.confidence).label} />
                      <span className="text-[10px] text-cream-400">{getConfidenceDot(tx.confidence).label}</span>
                    </div>
                  )}

                  {tx.description && <p className="text-xs text-cream-500 mt-1">{tx.description}</p>}

                  {/* Duplicate warning */}
                  {tx._duplicate && (
                    <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-warning/8 border border-warning/20">
                      <AlertTriangle size={12} className="text-warning shrink-0" />
                      <span className="text-[11px] text-warning flex-1">
                        Possible duplicate: {tx._duplicate.reason}
                      </span>
                      <button
                        onClick={() => updatePending(idx, { _dismissed: true })}
                        className="text-[10px] font-medium text-danger hover:underline"
                      >
                        Skip
                      </button>
                      <button
                        onClick={() => updatePending(idx, { _duplicate: null })}
                        className="text-[10px] font-medium text-cream-500 hover:underline"
                      >
                        Keep
                      </button>
                    </div>
                  )}

                  {/* Needs review badge */}
                  {tx.needsReview && needsReviewItems.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg bg-warning/10 w-fit">
                      <AlertCircle size={12} className="text-warning" />
                      <span className="text-[10px] font-medium text-warning">
                        {needsReviewItems.length} item{needsReviewItems.length !== 1 ? 's' : ''} flagged for review
                      </span>
                    </div>
                  )}

                  {/* Receipt Items */}
                  {hasItems && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggleItemsExpand(idx)}
                        className="flex items-center gap-1 text-xs text-info hover:underline"
                      >
                        <ShoppingBag size={12} />
                        {tx.items.length} items
                        {needsReviewItems.length > 0 && (
                          <span className="text-warning ml-1">({needsReviewItems.length} to review)</span>
                        )}
                        {expandedItems[idx] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>

                      {expandedItems[idx] && (
                        <div className="mt-2 bg-cream-50 dark:bg-dark-bg rounded-lg p-3 space-y-1">
                          {tx.items.map((item, itemIdx) => {
                            const dot = getConfidenceDot(item.confidence || 0.8);
                            return (
                              <div key={itemIdx} className={`flex items-center gap-2 text-xs p-2 rounded-lg group ${
                                item.needsReview ? 'bg-warning/5 border border-warning/20' : 'hover:bg-cream-100 dark:hover:bg-dark-border'
                              }`}>
                                {/* Confidence dot */}
                                {item.needsReview && (
                                  <div className={`w-1.5 h-1.5 rounded-full ${dot.color} shrink-0`} title={dot.label} />
                                )}

                                {/* Qty with +/- */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    onClick={() => adjustQty(idx, itemIdx, -1)}
                                    className="w-6 h-6 rounded flex items-center justify-center text-cream-400 hover:bg-cream-200 dark:hover:bg-dark-border hover:text-cream-700 transition-colors"
                                    title="Decrease quantity"
                                  >
                                    <Minus size={10} />
                                  </button>
                                  <span
                                    onClick={() => startEdit(idx, 'qty', item.qty || 1, itemIdx)}
                                    className="w-7 text-center text-xs font-medium text-cream-600 dark:text-cream-400 cursor-pointer hover:text-indigo-500 transition-colors"
                                    title="Tap to type quantity"
                                  >
                                    {isEditing(idx, 'qty', itemIdx) ? (
                                      <input
                                        ref={editRef}
                                        type="number"
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={handleEditKeyDown}
                                        className="w-7 bg-white dark:bg-dark-card border-2 border-indigo-400 rounded text-xs text-center py-0.5"
                                        min="1"
                                      />
                                    ) : (
                                      `${item.qty || 1}x`
                                    )}
                                  </span>
                                  <button
                                    onClick={() => adjustQty(idx, itemIdx, 1)}
                                    className="w-6 h-6 rounded flex items-center justify-center text-cream-400 hover:bg-cream-200 dark:hover:bg-dark-border hover:text-cream-700 transition-colors"
                                    title="Increase quantity"
                                  >
                                    <Plus size={10} />
                                  </button>
                                </div>

                                {/* Name - editable */}
                                <div className="flex-1 min-w-0">
                                  {renderEditableText(idx, 'name', item.name, 'text-xs text-cream-700 dark:text-cream-400 truncate block', itemIdx)}
                                </div>

                                {/* Item category */}
                                <CategoryPicker
                                  value={item.category || tx.category}
                                  onChange={(catId, subId) => updatePendingItem(idx, itemIdx, {
                                    category: catId,
                                    subcategory: subId || null,
                                    needsReview: false,
                                  })}
                                  compact
                                  exclude={['income', 'transfer']}
                                />

                                {/* Price - editable */}
                                <div className="shrink-0 w-16 text-right">
                                  {renderEditableText(idx, 'price', item.price, 'text-xs font-medium money w-14 text-right', itemIdx)}
                                </div>

                                {/* Delete item */}
                                <button
                                  onClick={() => deleteItem(idx, itemIdx)}
                                  className="p-1.5 rounded sm:opacity-0 sm:group-hover:opacity-100 hover:bg-danger/10 text-cream-300 dark:text-cream-600 hover:text-danger transition-all shrink-0"
                                  title="Remove item"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            );
                          })}

                          {/* Add item button / form */}
                          {addingItem === idx ? (
                            <div className="flex items-center gap-2 p-2 border-t border-cream-200 dark:border-dark-border mt-1 pt-2">
                              <input
                                value={newItem.name}
                                onChange={(e) => setNewItem(n => ({ ...n, name: e.target.value }))}
                                placeholder="Item name"
                                className="flex-1 text-xs bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded px-2 py-1"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === 'Enter') addItem(idx); if (e.key === 'Escape') setAddingItem(null); }}
                              />
                              <input
                                type="number"
                                value={newItem.price}
                                onChange={(e) => setNewItem(n => ({ ...n, price: e.target.value }))}
                                placeholder="Price"
                                className="w-16 text-xs bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded px-2 py-1"
                                step="0.01"
                                inputMode="decimal"
                                onKeyDown={(e) => { if (e.key === 'Enter') addItem(idx); }}
                              />
                              <button onClick={() => addItem(idx)} className="p-1 rounded bg-success/10 text-success hover:bg-success/20">
                                <Check size={14} />
                              </button>
                              <button onClick={() => setAddingItem(null)} className="p-1 rounded bg-cream-200 dark:bg-dark-border text-cream-500 hover:bg-cream-300">
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setAddingItem(idx)}
                              className="flex items-center gap-1 text-xs text-cream-500 hover:text-cream-700 dark:hover:text-cream-300 mt-1 px-2 py-1"
                            >
                              <Plus size={12} /> Add missed item
                            </button>
                          )}

                          {/* Running total */}
                          <div className="border-t border-cream-200 dark:border-dark-border mt-2 pt-2 flex items-center justify-between text-xs">
                            <span className="text-cream-500">Items total</span>
                            <span className="font-medium money">
                              {formatCurrency(itemsTotal, tx.currency)}
                            </span>
                          </div>
                          {mismatch && (
                            <div className="flex items-center gap-1 text-[10px] text-warning mt-1">
                              <AlertTriangle size={10} />
                              Items total doesn't match receipt total ({formatCurrency(receiptTotal, receiptMeta?.receipt?.currency || 'RON')})
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Transaction category - CategoryPicker */}
                  <div className="mt-3 flex items-center gap-2">
                    <label className="text-[10px] text-cream-400 shrink-0">Category:</label>
                    <CategoryPicker
                      value={tx.category}
                      subcategoryValue={tx.subcategory || null}
                      onChange={(catId, subId) => updatePending(idx, { category: catId, subcategory: subId || null })}
                      exclude={['income', 'transfer']}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Duplicate Warning */}
      {duplicateWarning && (
        <div className="card border-warning/30 bg-warning-light/30">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-warning" />
            <h3 className="text-sm font-semibold text-warning">Possible duplicate</h3>
          </div>
          <p className="text-xs text-cream-600 dark:text-cream-400 mb-2">
            {duplicateWarning.reason}: <strong>{duplicateWarning.transaction.merchant}</strong> — {formatCurrency(duplicateWarning.transaction.amount, duplicateWarning.transaction.currency)} on {duplicateWarning.transaction.date}
          </p>
          <div className="flex gap-2">
            <button onClick={cancelDuplicate} className="btn-ghost text-xs">Cancel</button>
            <button onClick={confirmSaveDespiteDuplicate} className="btn-primary text-xs">Save anyway</button>
          </div>
        </div>
      )}

      {/* Manual entry */}
      <div className="card">
        <button
          onClick={() => setShowManual(!showManual)}
          className="flex items-center justify-between w-full text-sm font-semibold"
        >
          <span className="flex items-center gap-2">
            <PenLine size={16} /> Manual entry
          </span>
          {showManual ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showManual && (
          <div className="mt-4">
            <ManualForm onSubmit={handleManualSubmit} />
          </div>
        )}
      </div>
    </div>
  );
}
