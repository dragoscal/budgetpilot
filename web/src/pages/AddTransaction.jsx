import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { transactions as txApi } from '../lib/api';
import { formatCurrency, getCategoryById, getMonthRange } from '../lib/helpers';
import { CATEGORIES } from '../lib/constants';
import { checkDuplicate, checkBudgetAlerts, learnCategory } from '../lib/smartFeatures';
import { getTransactionsByDateRange } from '../lib/storage';
import ReceiptScanner from '../components/ReceiptScanner';
import QuickAdd from '../components/QuickAdd';
import ManualForm from '../components/ManualForm';
import Modal from '../components/Modal';
import { Camera, Zap, PenLine, ChevronDown, ChevronUp, Check, X, AlertTriangle, ShoppingBag, AlertCircle, Info, Eye } from 'lucide-react';

export default function AddTransaction() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('quick');
  const [showManual, setShowManual] = useState(false);
  const [pendingResults, setPendingResults] = useState(null);
  const [receiptMeta, setReceiptMeta] = useState(null); // receipt info, warnings, summary
  const [editingIdx, setEditingIdx] = useState(null);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [pendingSave, setPendingSave] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});

  const handleAIResult = (results) => {
    // Handle enhanced receipt result format
    if (results.transactions) {
      setPendingResults(results.transactions);
      setReceiptMeta({
        receipt: results.receipt,
        warnings: results.warnings || [],
        summary: results.summary || '',
        hasItemsToReview: results.hasItemsToReview || false,
      });
    } else if (Array.isArray(results)) {
      setPendingResults(results);
      setReceiptMeta(null);
    } else {
      setPendingResults([results]);
      setReceiptMeta(null);
    }
  };

  const handleSaveResults = async () => {
    if (!pendingResults) return;
    try {
      for (const tx of pendingResults) {
        await txApi.create(tx);
        if (tx.merchant) learnCategory(tx.merchant, tx.category);
      }
      toast.success(`${pendingResults.length} transaction${pendingResults.length > 1 ? 's' : ''} added!`);
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

  const confirmSaveDespiteDuplicate = () => {
    if (pendingSave) {
      saveTransaction(pendingSave);
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
        if (alert.type === 'over') {
          toast.error(alert.message);
        } else {
          toast.warning(alert.message);
        }
      }
    } catch (e) { /* silently fail */ }
  };

  const handleError = (msg) => {
    toast.error(msg);
  };

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

  const removePending = (idx) => {
    setPendingResults((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) { setReceiptMeta(null); }
      return next.length > 0 ? next : null;
    });
  };

  const toggleItemsExpand = (idx) => {
    setExpandedItems((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 0.95) return 'text-success';
    if (conf >= 0.80) return 'text-info';
    if (conf >= 0.60) return 'text-warning';
    return 'text-danger';
  };

  const getConfidenceLabel = (conf) => {
    if (conf >= 0.95) return 'Very certain';
    if (conf >= 0.80) return 'Confident';
    if (conf >= 0.60) return 'Uncertain';
    return 'Low confidence';
  };

  const tabs = [
    { id: 'quick', label: 'Quick Add', icon: Zap },
    { id: 'receipt', label: 'Receipt', icon: Camera },
  ];

  const reviewItemsCount = pendingResults
    ? pendingResults.reduce((sum, tx) => sum + (tx.items?.filter(i => i.needsReview)?.length || 0), 0)
    : 0;

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

      {/* Receipt Summary & Warnings */}
      {receiptMeta && (
        <div className="space-y-3">
          {/* Store info */}
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

          {/* Summary */}
          {receiptMeta.summary && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-info/5 border border-info/20">
              <Info size={14} className="text-info mt-0.5 shrink-0" />
              <p className="text-xs text-cream-600 dark:text-cream-400">{receiptMeta.summary}</p>
            </div>
          )}

          {/* Warnings */}
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

          {/* Items needing review badge */}
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

      {/* AI Review with Enhanced Receipt Items */}
      {pendingResults && pendingResults.length > 0 && (
        <div className="card border-success/30 bg-success-light/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Review & confirm</h3>
            <div className="flex gap-2">
              <button onClick={() => { setPendingResults(null); setReceiptMeta(null); }} className="btn-ghost text-xs flex items-center gap-1">
                <X size={14} /> Discard
              </button>
              <button onClick={handleSaveResults} className="btn-primary text-xs flex items-center gap-1">
                <Check size={14} /> Save {pendingResults.length > 1 ? `all (${pendingResults.length})` : ''}
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {pendingResults.map((tx, idx) => {
              const cat = getCategoryById(tx.category);
              const hasItems = tx.items && tx.items.length > 0;
              const needsReviewItems = hasItems ? tx.items.filter(i => i.needsReview) : [];
              return (
                <div key={idx} className={`bg-white dark:bg-dark-card rounded-xl p-4 border ${
                  tx.needsReview ? 'border-warning/40' : 'border-cream-200 dark:border-dark-border'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cat.icon}</span>
                      <div>
                        <p className="text-sm font-medium">{tx.merchant || 'Unknown'}</p>
                        <p className="text-xs text-cream-500">{cat.name} · {tx.date}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className={`font-heading font-bold money ${tx.type === 'income' ? 'text-income' : 'text-danger'}`}>
                        {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                      </p>
                      <button onClick={() => removePending(idx)} className="p-1 rounded hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400">
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Confidence indicator */}
                  {tx.confidence && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            tx.confidence >= 0.80 ? 'bg-success' : tx.confidence >= 0.60 ? 'bg-warning' : 'bg-danger'
                          }`}
                          style={{ width: `${Math.round(tx.confidence * 100)}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-medium ${getConfidenceColor(tx.confidence)}`}>
                        {getConfidenceLabel(tx.confidence)}
                      </span>
                    </div>
                  )}

                  {tx.description && <p className="text-xs text-cream-500 mt-1">{tx.description}</p>}

                  {/* Needs review badge */}
                  {tx.needsReview && (
                    <div className="flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg bg-warning/10 w-fit">
                      <AlertCircle size={12} className="text-warning" />
                      <span className="text-[10px] font-medium text-warning">
                        {needsReviewItems.length} item{needsReviewItems.length !== 1 ? 's' : ''} flagged for review
                      </span>
                    </div>
                  )}

                  {/* Receipt Items Detail */}
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
                        <div className="mt-2 bg-cream-50 dark:bg-dark-bg rounded-lg p-3 space-y-2">
                          {tx.items.map((item, itemIdx) => (
                            <div key={itemIdx} className={`flex items-center gap-2 text-xs p-1.5 rounded-lg ${
                              item.needsReview ? 'bg-warning/5 border border-warning/20' : ''
                            }`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {item.needsReview && <AlertCircle size={10} className="text-warning shrink-0" />}
                                  <span className="text-cream-700 dark:text-cream-400 truncate">
                                    {item.qty > 1 ? `${item.qty}x ` : ''}{item.name}
                                  </span>
                                </div>
                              </div>
                              {/* Per-item category selector */}
                              <select
                                value={item.category}
                                onChange={(e) => updatePendingItem(idx, itemIdx, { category: e.target.value, needsReview: false })}
                                className={`text-[10px] bg-transparent border rounded px-1 py-0.5 max-w-[100px] ${
                                  item.needsReview ? 'border-warning/40' : 'border-cream-200 dark:border-dark-border'
                                }`}
                              >
                                {CATEGORIES.map((c) => (
                                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                ))}
                              </select>
                              <span className="font-medium money whitespace-nowrap">
                                {formatCurrency(item.price * (item.qty || 1), tx.currency)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Editable transaction category */}
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-[10px] text-cream-400">Category:</label>
                    <select
                      value={tx.category}
                      onChange={(e) => updatePending(idx, { category: e.target.value })}
                      className="text-xs bg-transparent border border-cream-200 dark:border-dark-border rounded px-1.5 py-0.5"
                    >
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
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
