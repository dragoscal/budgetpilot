import { useState, useEffect, useRef } from 'react';
import { recurring as recurringApi, transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import HelpButton from '../components/HelpButton';
import { RECURRING_FREQUENCIES } from '../lib/constants';
import { generateId, formatCurrency, getCategoryById, calcMonthlyEquivalent } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import { detectRecurringPatterns, auditSubscriptions } from '../lib/smartFeatures';
import { getSetting, setSetting } from '../lib/storage';
import RecurringRow from '../components/RecurringRow';
import CategoryPicker from '../components/CategoryPicker';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { RotateCcw, Plus, Sparkles, Check, X, Search, AlertTriangle, TrendingUp, Landmark, Bell, XCircle } from 'lucide-react';
import { SkeletonPage } from '../components/LoadingSkeleton';

// Categories that indicate a subscription (vs. a bill)
const SUBSCRIPTION_CATEGORIES = new Set([
  'subscriptions', 'entertainment',
  'subscriptions:streaming', 'subscriptions:music', 'subscriptions:software',
  'subscriptions:gaming', 'subscriptions:news',
  'entertainment:movies', 'entertainment:games',
]);

export default function Recurring() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [allTransactions, setAllTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [rates, setRates] = useState(null);
  const [cancelConfirm, setCancelConfirm] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [showScanResults, setShowScanResults] = useState(false);

  const defaultForm = { name: '', amount: '', currency: user?.defaultCurrency || 'RON', category: 'utilities', billingDay: '1', billingMonth: '1', frequency: 'monthly', endDate: '', autoDebit: false, isVariable: false, recurringType: 'bill' };
  const [form, setForm] = useState(defaultForm);

  const currency = user?.defaultCurrency || 'RON';
  const loadVersion = useRef(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    const load = async () => {
      setLoading(true);
      try {
        // Load persisted dismissed suggestions
        const dismissed = await getSetting('dismissedRecurringSuggestions');
        if (dismissed?.length) setDismissedSuggestions(new Set(dismissed));

        const [data, txData] = await Promise.all([
          recurringApi.getAll({ userId: effectiveUserId }),
          txApi.getAll({ userId: effectiveUserId }),
        ]);
        if (loadVersion.current !== version) return;
        setItems(data);
        setAllTransactions(txData);
        // Pass fresh server data directly — avoids race condition with IndexedDB background cache
        const patterns = await detectRecurringPatterns(effectiveUserId, txData, data);
        if (loadVersion.current !== version) return;
        setSuggestions(patterns);
        if (patterns.filter(s => s.merchant && s.confidence >= 0.6).length > 0) {
          setShowScanResults(true);
        }
        getCachedRates().then(setRates).catch(() => {});
      } catch (err) {
        if (loadVersion.current === version) toast.error(t('recurring.failedLoad'));
      } finally {
        if (loadVersion.current === version) setLoading(false);
      }
    };
    load();
  }, [effectiveUserId]);

  const loadItems = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const [data, txData] = await Promise.all([
        recurringApi.getAll({ userId: effectiveUserId }),
        txApi.getAll({ userId: effectiveUserId }),
      ]);
      if (loadVersion.current !== version) return;
      setItems(data);
      setAllTransactions(txData);
      const patterns = await detectRecurringPatterns(effectiveUserId);
      if (loadVersion.current !== version) return;
      setSuggestions(patterns);
      getCachedRates().then(setRates).catch(() => {});
    } catch (err) {
      if (loadVersion.current === version) toast.error(t('recurring.failedLoad'));
    } finally {
      if (loadVersion.current === version) setLoading(false);
    }
  };

  // 3-section split: active / paused / cancelled
  const activeItems = items.filter((i) => i.status !== 'cancelled' && i.status !== 'paused' && i.active !== false);
  const pausedItems = items.filter((i) => i.status !== 'cancelled' && (i.active === false || i.status === 'paused'));
  const cancelledItems = items.filter((i) => i.status === 'cancelled');

  // Frequency-aware monthly total (multi-currency) — split by type
  const calcMonthlyTotal = (itemList) => itemList.reduce((sum, item) => {
    const monthlyAmt = calcMonthlyEquivalent(item.amount, item.frequency || 'monthly');
    const itemCurrency = item.currency || currency;
    if (!rates || itemCurrency === currency) return sum + monthlyAmt;
    const fromRate = rates[itemCurrency];
    const toRate = rates[currency];
    if (!fromRate || !toRate) return sum + monthlyAmt;
    return sum + (monthlyAmt / fromRate) * toRate;
  }, 0);

  const activeBillsList = activeItems.filter(i => i.recurringType !== 'subscription');
  const activeSubsList = activeItems.filter(i => i.recurringType === 'subscription');
  const billsMonthly = calcMonthlyTotal(activeBillsList);
  const subsMonthly = calcMonthlyTotal(activeSubsList);
  const monthlyTotal = billsMonthly + subsMonthly;
  const annualTotal = monthlyTotal * 12;

  const activeSuggestions = suggestions.filter(
    (s) => s.merchant && !dismissedSuggestions.has(s.merchant.toLowerCase()) && s.confidence >= 0.6
  );

  const handleSave = async () => {
    if (!form.name || (!form.amount && !form.isVariable)) { toast.error(t('recurring.nameAndAmountRequired')); return; }
    const parsedAmount = Math.abs(Number(form.amount)) || 0;
    if (!form.isVariable && parsedAmount <= 0) { toast.error(t('recurring.nameAndAmountRequired')); return; }
    try {
      const data = {
        ...form,
        amount: parsedAmount,
        billingDay: Math.min(31, Math.max(1, Number(form.billingDay) || 1)),
        billingMonth: Math.min(12, Math.max(1, Number(form.billingMonth) || 1)),
        frequency: form.frequency || 'monthly',
        endDate: form.endDate || null,
        autoDebit: form.autoDebit ? 1 : 0,
        isVariable: form.isVariable ? 1 : 0,
        recurringType: form.recurringType || 'bill',
        active: true,
        userId: effectiveUserId,
      };
      if (editItem) {
        await recurringApi.update(editItem.id, data);
        toast.success(t('recurring.updated'));
      } else {
        await recurringApi.create({ id: generateId(), ...data, createdAt: new Date().toISOString() });
        toast.success(t('recurring.added'));
      }
      setShowForm(false);
      setEditItem(null);
      setForm({ ...defaultForm, currency });
      loadItems();
    } catch (err) { toast.error(err.message); }
  };

  const handleToggle = async (item) => {
    try {
      const isPaused = item.active === false || item.status === 'paused';
      if (isPaused) {
        // Resume
        await recurringApi.update(item.id, { active: true, status: 'active', pausedAt: null });
      } else {
        // Pause
        await recurringApi.update(item.id, { active: false, status: 'paused', pausedAt: new Date().toISOString() });
      }
      loadItems();
    } catch (err) {
      toast.error(err.message || t('recurring.failedToggle'));
    }
  };

  const handleCancel = async (item) => {
    try {
      await recurringApi.update(item.id, { status: 'cancelled', cancelledAt: new Date().toISOString(), active: false });
      setCancelConfirm(null);
      toast.success(t('recurring.cancelledMsg', { name: item.name }));
      loadItems();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleReactivate = async (item) => {
    try {
      await recurringApi.update(item.id, { status: 'active', cancelledAt: null, pausedAt: null, active: true });
      toast.success(t('recurring.reactivatedMsg', { name: item.name }));
      loadItems();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (item) => {
    try {
      await recurringApi.remove(item.id);
      toast.success(t('recurring.deletedMsg'));
      loadItems();
    } catch (err) {
      toast.error(err.message || t('recurring.failedDelete'));
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name,
      amount: item.amount ? item.amount.toString() : '',
      currency: item.currency || currency,
      category: item.category,
      billingDay: (item.billingDay || 1).toString(),
      billingMonth: (item.billingMonth || 1).toString(),
      frequency: item.frequency || 'monthly',
      endDate: item.endDate || '',
      autoDebit: !!item.autoDebit,
      isVariable: !!item.isVariable,
      recurringType: item.recurringType || 'bill',
    });
    setShowForm(true);
  };

  const acceptSuggestion = async (suggestion) => {
    try {
      await recurringApi.create({
        id: generateId(),
        name: suggestion.merchant,
        merchant: suggestion.merchant,
        amount: suggestion.amount,
        currency: suggestion.currency,
        category: suggestion.category,
        billingDay: suggestion.billingDay,
        billingMonth: suggestion.billingMonth || 1,
        frequency: suggestion.frequency || 'monthly',
        active: true,
        userId: effectiveUserId,
        autoDetected: true,
        isVariable: suggestion.isVariable ? 1 : 0,
        recurringType: SUBSCRIPTION_CATEGORIES.has(suggestion.category) ? 'subscription' : 'bill',
        createdAt: new Date().toISOString(),
      });
      toast.success(t('recurring.addedAsRecurring', { name: suggestion.merchant }));
      const next = new Set([...dismissedSuggestions, suggestion.merchant.toLowerCase()]);
      setDismissedSuggestions(next);
      setSetting('dismissedRecurringSuggestions', [...next]);
      loadItems();
    } catch (err) { toast.error(err.message); }
  };

  const dismissSuggestion = (suggestion) => {
    const next = new Set([...dismissedSuggestions, suggestion.merchant.toLowerCase()]);
    setDismissedSuggestions(next);
    setSetting('dismissedRecurringSuggestions', [...next]);
  };

  const handleScanTransactions = async () => {
    setScanning(true);
    try {
      // Re-fetch fresh data from server to ensure we scan the latest transactions
      const [freshRecurring, freshTx] = await Promise.all([
        recurringApi.getAll({ userId: effectiveUserId }),
        txApi.getAll({ userId: effectiveUserId }),
      ]);
      setItems(freshRecurring);
      setAllTransactions(freshTx);
      const patterns = await detectRecurringPatterns(effectiveUserId, freshTx, freshRecurring);
      setSuggestions(patterns);
      setShowScanResults(true);
      const filtered = patterns.filter(s => s.merchant && !dismissedSuggestions.has(s.merchant.toLowerCase()) && s.confidence >= 0.6);
      if (filtered.length === 0) {
        toast.info(t('recurring.scanNoResults'));
      }
    } catch {
      toast.error(t('recurring.scanFailed'));
    } finally {
      setScanning(false);
    }
  };

  const openNewForm = () => {
    setEditItem(null);
    setForm({ ...defaultForm, currency });
    setShowForm(true);
  };

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('recurring.recurringAndSubscriptions')}</h1>
          <HelpButton section="recurring" />
        </div>
        <button onClick={openNewForm} className="btn-primary text-xs flex items-center gap-1">
          <Plus size={14} /> {t('common.add')}
        </button>
      </div>

      {/* Summary -- split by type */}
      <div className="grid grid-cols-2 gap-3">
        {/* Bills card */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center">
              <Bell size={16} className="text-warning" />
            </div>
            <div>
              <p className="text-[11px] text-cream-500 font-medium">{t('recurring.billsSection')}</p>
              <p className="text-[10px] text-cream-400">{activeBillsList.length} {t('recurring.active').toLowerCase()}</p>
            </div>
          </div>
          <p className="text-lg font-heading font-bold money">{formatCurrency(Math.round(billsMonthly * 100) / 100, currency)}<span className="text-[10px] text-cream-400 font-normal">{t('recurring.perMo')}</span></p>
          <p className="text-[11px] text-cream-400 money">{formatCurrency(Math.round(billsMonthly * 12 * 100) / 100, currency)}{t('recurring.perYr')}</p>
        </div>
        {/* Subscriptions card */}
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
              <RotateCcw size={16} className="text-accent" />
            </div>
            <div>
              <p className="text-[11px] text-cream-500 font-medium">{t('recurring.subscriptionsSection')}</p>
              <p className="text-[10px] text-cream-400">{activeSubsList.length} {t('recurring.active').toLowerCase()}</p>
            </div>
          </div>
          <p className="text-lg font-heading font-bold money">{formatCurrency(Math.round(subsMonthly * 100) / 100, currency)}<span className="text-[10px] text-cream-400 font-normal">{t('recurring.perMo')}</span></p>
          <p className="text-[11px] text-cream-400 money">{formatCurrency(Math.round(subsMonthly * 12 * 100) / 100, currency)}{t('recurring.perYr')}</p>
        </div>
      </div>
      {/* Total bar */}
      <div className="card !py-2.5 flex items-center justify-between">
        <p className="text-xs text-cream-500 font-medium">{t('recurring.totalRecurring')}</p>
        <div className="flex items-center gap-3">
          <span className="text-sm font-heading font-bold money">{formatCurrency(Math.round(monthlyTotal * 100) / 100, currency)}<span className="text-[10px] text-cream-400 font-normal">{t('recurring.perMo')}</span></span>
          <span className="text-xs text-cream-400">·</span>
          <span className="text-sm font-heading font-bold money">{formatCurrency(Math.round(annualTotal * 100) / 100, currency)}<span className="text-[10px] text-cream-400 font-normal">{t('recurring.perYr')}</span></span>
        </div>
      </div>

      {/* Scan for Recurring */}
      <div className="card border-accent/20">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center">
              <Search size={16} className="text-accent" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{t('recurring.scanTitle')}</h3>
              <p className="text-xs text-cream-500">{t('recurring.scanDesc')}</p>
            </div>
          </div>
          <button
            onClick={handleScanTransactions}
            disabled={scanning}
            className="btn-primary text-xs flex items-center gap-1.5"
          >
            {scanning ? (
              <>
                <RotateCcw size={12} className="animate-spin" />
                {t('recurring.analyzing')}
              </>
            ) : (
              <>
                <Search size={12} />
                {t('recurring.scanButton')}
              </>
            )}
          </button>
        </div>

        {/* Scan results */}
        {showScanResults && (
          <div className="mt-3">
            {activeSuggestions.length > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-accent" />
                  <p className="text-xs font-medium text-accent-700 dark:text-accent-300">
                    {t('recurring.patternsFound', { count: activeSuggestions.length })}
                  </p>
                </div>
                {activeSuggestions.map((s, i) => {
                  const cat = getCategoryById(s.category);
                  const freqLabel = s.frequency === 'weekly' ? t('recurring.weeksInRow', { count: s.consecutiveMonths })
                    : s.frequency === 'quarterly' ? t('recurring.quartersInRow', { count: s.consecutiveMonths })
                    : s.frequency === 'annual' ? t('recurring.yearsInRow', { count: s.consecutiveMonths })
                    : t('recurring.monthsInRow', { count: s.consecutiveMonths });
                  return (
                    <div key={i} className="flex items-center justify-between bg-white dark:bg-dark-card rounded-lg p-3 border border-cream-200 dark:border-dark-border">
                      <div className="flex items-center gap-2">
                        <span>{cat.icon}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium">{s.merchant}</p>
                            {s.frequency && s.frequency !== 'monthly' && (
                              <span className="px-1.5 py-0.5 rounded bg-cream-200 dark:bg-dark-border text-cream-600 dark:text-cream-400 text-[10px] font-medium">
                                {t(`frequencies.${s.frequency}`)}
                              </span>
                            )}
                            {!!s.isVariable && (
                              <span className="px-1.5 py-0.5 rounded bg-info/10 text-info text-[10px] font-medium">
                                {t('recurring.variable')}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-cream-500">
                            {s.isVariable
                              ? `${formatCurrency(s.amountMin, s.currency)} – ${formatCurrency(s.amountMax, s.currency)}`
                              : `~${formatCurrency(s.amount, s.currency)}`}
                            {' · '}{t('recurring.dayBilling', { day: s.billingDay })} · {freqLabel}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => acceptSuggestion(s)} className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors" title={t('recurring.addAsRecurring')}>
                          <Check size={14} />
                        </button>
                        <button onClick={() => dismissSuggestion(s)} className="p-1.5 rounded-lg bg-cream-200 dark:bg-dark-border text-cream-500 hover:bg-cream-300 transition-colors" title={t('recurring.dismiss')}>
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-success/5 border border-success/20">
                <Check size={14} className="text-success" />
                <p className="text-xs text-success font-medium">{t('recurring.allCaughtUp')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <>
          {/* Active Bills Section */}
          {activeBillsList.length > 0 && (
            <div>
              <h3 className="section-title flex items-center gap-2">📋 {t('recurring.billsSection')} <span className="text-cream-400 text-xs font-normal">({activeBillsList.length})</span></h3>
              <div className="card p-0">
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {activeBillsList.sort((a, b) => (a.billingDay || 1) - (b.billingDay || 1)).map((item) => (
                    <RecurringRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} onCancel={(i) => setCancelConfirm(i)} allTransactions={allTransactions} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Active Subscriptions Section */}
          {activeSubsList.length > 0 && (
            <div>
              <h3 className="section-title flex items-center gap-2">📺 {t('recurring.subscriptionsSection')} <span className="text-cream-400 text-xs font-normal">({activeSubsList.length})</span></h3>
              <div className="card p-0">
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {activeSubsList.sort((a, b) => (a.billingDay || 1) - (b.billingDay || 1)).map((item) => (
                    <RecurringRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} onCancel={(i) => setCancelConfirm(i)} allTransactions={allTransactions} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Paused Section */}
          {pausedItems.length > 0 && (
            <div>
              <h3 className="section-title flex items-center gap-2">{t('recurring.paused')} <span className="text-cream-400 text-xs font-normal">({pausedItems.length})</span></h3>
              <div className="card p-0">
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {pausedItems.map((item) => (
                    <RecurringRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} onCancel={(i) => setCancelConfirm(i)} allTransactions={allTransactions} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cancelled Section */}
          {cancelledItems.length > 0 && (
            <div>
              <h3 className="section-title flex items-center gap-2 text-cream-400">{t('recurring.cancelledSection')} <span className="text-cream-400 text-xs font-normal">({cancelledItems.length})</span></h3>
              <div className="card p-0 opacity-75">
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {cancelledItems.map((item) => (
                    <RecurringRow key={item.id} item={item} onReactivate={handleReactivate} allTransactions={allTransactions} cancelled />
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      ) : !loading && activeSuggestions.length === 0 ? (
        <EmptyState icon={RotateCcw} title={t('recurring.noRecurringItems')} description={t('recurring.noRecurringItemsDesc')} action={t('recurring.addRecurring')} onAction={openNewForm} />
      ) : null}

      {/* Subscription Audit */}
      {items.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={14} className="text-accent-500" />
              <h3 className="section-title mb-0">{t('recurring.subscriptionAudit')}</h3>
            </div>
            <button
              onClick={async () => {
                if (showAudit) { setShowAudit(false); return; }
                setAuditLoading(true);
                try {
                  const result = await auditSubscriptions(effectiveUserId);
                  setAudit(result);
                  setShowAudit(true);
                } catch { toast.error(t('recurring.auditFailed')); }
                finally { setAuditLoading(false); }
              }}
              className="btn-secondary text-xs flex items-center gap-1.5"
              disabled={auditLoading}
            >
              <Search size={12} />
              {auditLoading ? t('recurring.analyzing') : showAudit ? t('recurring.hideAudit') : t('recurring.runAudit')}
            </button>
          </div>

          {showAudit && audit && (
            <div className="mt-4 space-y-3">
              {/* Audit summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-cream-50 dark:bg-cream-800/20">
                  <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('recurring.auditMonthly')}</p>
                  <p className="text-sm font-heading font-bold money">{formatCurrency(audit.totalMonthly, currency)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-cream-50 dark:bg-cream-800/20">
                  <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('recurring.auditAnnual')}</p>
                  <p className="text-sm font-heading font-bold money">{formatCurrency(audit.totalAnnual, currency)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-cream-50 dark:bg-cream-800/20">
                  <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('recurring.auditIssues')}</p>
                  <p className={`text-sm font-heading font-bold ${audit.issueCount > 0 ? 'text-warning' : 'text-success'}`}>
                    {audit.issueCount}
                  </p>
                </div>
              </div>

              {/* Audit items */}
              <div className="space-y-2">
                {audit.items.map((item) => {
                  const cat = getCategoryById(item.category);
                  return (
                    <div key={item.id} className={`p-3 rounded-lg border ${item.issues.length > 0 ? 'border-warning/30 bg-warning/5' : 'border-cream-200 dark:border-dark-border'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <span className="text-sm font-medium">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium money">{formatCurrency(item.monthlyCost, item.currency)}{t('recurring.perMo')}</p>
                          <p className="text-[10px] text-cream-400">{formatCurrency(item.annualCost, item.currency)}{t('recurring.perYr')}</p>
                        </div>
                      </div>
                      {item.issues.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {item.issues.map((issue, j) => (
                            <div key={j} className="flex items-center gap-1.5 text-xs">
                              {issue.severity === 'warning' ? (
                                <AlertTriangle size={12} className="text-warning shrink-0" />
                              ) : (
                                <TrendingUp size={12} className="text-info shrink-0" />
                              )}
                              <span className={issue.severity === 'warning' ? 'text-warning' : 'text-info'}>{issue.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      <Modal open={!!cancelConfirm} onClose={() => setCancelConfirm(null)} title={t('recurring.confirmCancel')}>
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-danger/5 border border-danger/15">
            <XCircle size={20} className="text-danger shrink-0" />
            <div>
              <p className="text-sm font-medium">{cancelConfirm?.name}</p>
              <p className="text-xs text-cream-500">{formatCurrency(cancelConfirm?.amount || 0, cancelConfirm?.currency || currency)}</p>
            </div>
          </div>
          <p className="text-sm text-cream-600 dark:text-cream-400">{t('recurring.confirmCancelDesc')}</p>
          <div className="flex gap-2">
            <button onClick={() => setCancelConfirm(null)} className="btn-secondary flex-1">{t('common.cancel')}</button>
            <button onClick={() => handleCancel(cancelConfirm)} className="flex-1 px-4 py-2 rounded-xl bg-danger text-white text-sm font-medium hover:bg-danger/90 transition-colors">{t('recurring.cancelSubscription')}</button>
          </div>
        </div>
      </Modal>

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} title={editItem ? t('recurring.editRecurringTitle') : t('recurring.newRecurring')}>
        <div className="space-y-4">
          <div>
            <label className="label">{t('recurring.name')}</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('recurring.namePlaceholderShort')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('recurring.amount')}</label>
              <input type="number" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder={form.isVariable ? t('recurring.estimatedAmount') : '0.00'} inputMode="decimal" />
            </div>
            <div>
              <label className="label">{t('recurring.billingDay')}</label>
              <input type="number" className="input" min="1" max="31" value={form.billingDay} onChange={(e) => {
                const val = e.target.value;
                if (val === '') { setForm((f) => ({ ...f, billingDay: '' })); return; }
                const num = parseInt(val, 10);
                if (!isNaN(num)) setForm((f) => ({ ...f, billingDay: String(Math.min(31, Math.max(1, num))) }));
              }} />
            </div>
          </div>

          {/* Variable amount toggle */}
          <label className="flex items-center gap-2.5 text-sm cursor-pointer py-1">
            <input
              type="checkbox"
              checked={form.isVariable}
              onChange={(e) => setForm((f) => ({ ...f, isVariable: e.target.checked }))}
              className="w-4 h-4 rounded border-cream-300 text-accent focus:ring-accent/30"
            />
            <div>
              <span className="font-medium">{t('recurring.variableAmount')}</span>
              <p className="text-[11px] text-cream-400">{t('recurring.variableAmountDesc')}</p>
            </div>
          </label>

          {/* Recurring type: Bill vs Subscription */}
          <div>
            <label className="label">{t('recurring.recurringType')}</label>
            <select className="input" value={form.recurringType} onChange={(e) => setForm((f) => ({ ...f, recurringType: e.target.value }))}>
              <option value="bill">{t('recurring.typeBill')}</option>
              <option value="subscription">{t('recurring.typeSubscription')}</option>
            </select>
          </div>

          <div>
            <label className="label">{t('recurring.frequency')}</label>
            <select className="input" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
              {RECURRING_FREQUENCIES.map((freq) => (
                <option key={freq.id} value={freq.id}>{t(`frequencies.${freq.id}`)}</option>
              ))}
            </select>
          </div>

          {/* Billing month — shown for annual/semiannual/biannual frequencies */}
          {['annual', 'semiannual', 'biannual'].includes(form.frequency) && (
            <div>
              <label className="label">{t('recurring.billingMonth')}</label>
              <select className="input" value={form.billingMonth}
                onChange={(e) => setForm(f => ({ ...f, billingMonth: e.target.value }))}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={String(i + 1)}>
                    {new Date(2026, i).toLocaleString(undefined, { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <CategoryPicker
              label={t('recurring.category')}
              value={form.category}
              onChange={(catId) => setForm((f) => ({ ...f, category: catId }))}
              exclude={['income', 'transfer']}
            />
          </div>

          <div>
            <label className="label">{t('recurring.endDate')}</label>
            <input type="date" className="input" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-2">
              <Landmark size={16} className={form.autoDebit ? 'text-success' : 'text-cream-500'} />
              <div>
                <p className="text-sm font-medium">{t('recurring.autoDebit')}</p>
                <p className="text-[11px] text-cream-400">{t('recurring.autoDebitDesc')}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, autoDebit: !f.autoDebit }))}
              className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors shadow-inner ${
                form.autoDebit ? 'bg-success' : 'bg-cream-300 dark:bg-dark-border'
              }`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform flex items-center justify-center ${
                form.autoDebit ? 'translate-x-6' : 'translate-x-0.5'
              }`}>
                {!!form.autoDebit && (
                  <Check size={12} className="text-success" />
                )}
              </span>
            </button>
          </div>

          <button onClick={handleSave} className="btn-primary w-full">{editItem ? t('budgets.update') : t('common.add')}</button>
        </div>
      </Modal>
    </div>
  );
}
