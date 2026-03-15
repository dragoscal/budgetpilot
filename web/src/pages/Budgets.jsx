import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { budgets as budgetsApi, transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import HelpButton from '../components/HelpButton';
import { BUDGET_TEMPLATES } from '../lib/constants';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';
import { generateId, formatCurrency, percentOf, sumBy, sumAmountsMultiCurrency, getDaysRemaining, getCategoryById } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import BudgetBar from '../components/BudgetBar';
import CategoryPicker from '../components/CategoryPicker';
import MonthPicker from '../components/MonthPicker';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonCard } from '../components/LoadingSkeleton';
import { PiggyBank, Plus, Users, ArrowRightLeft, LayoutTemplate, Eye, Check, Target, Copy } from 'lucide-react';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import { useFamily } from '../contexts/FamilyContext';

export default function Budgets() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isFamilyMode, activeFamily, members, familyFeed, loadFamilyFeed } = useFamily();
  const { categories } = useCategories();
  const [viewMode, setViewMode] = useState('personal'); // 'personal' | 'family'
  const [month, setMonth] = useState(new Date());
  const [budgetsList, setBudgets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [allMonthTransactions, setAllMonthTransactions] = useState([]); // includes income
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editBudget, setEditBudget] = useState(null);
  const [prevMonthTransactions, setPrevMonthTransactions] = useState([]);
  const [showTemplate, setShowTemplate] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templatePreview, setTemplatePreview] = useState(null);
  const [quickAddAmounts, setQuickAddAmounts] = useState({});
  const [rates, setRates] = useState(null);

  // Form state
  const [formCategory, setFormCategory] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formRollover, setFormRollover] = useState(false);

  const currency = user?.defaultCurrency || 'RON';
  const monthKey = format(month, 'yyyy-MM');
  const prevMonthKey = format(subMonths(month, 1), 'yyyy-MM');
  const allBudgetsRef = useRef([]);
  const loadVersion = useRef(0);

  const loadData = useCallback(async () => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const isFamily = viewMode === 'family' && isFamilyMode;

      // Load family feed for the current month when in family view
      if (isFamily) {
        const feedStart = format(startOfMonth(month), 'yyyy-MM-dd')
        const feedEnd = format(endOfMonth(month), 'yyyy-MM-dd')
        await loadFamilyFeed(feedStart, feedEnd)
      }

      const [budgets, ownTx] = await Promise.all([
        budgetsApi.getAll(isFamily ? {} : { userId: effectiveUserId }),
        txApi.getAll({ userId: effectiveUserId }),
      ]);
      if (loadVersion.current !== version) return;

      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const prevStart = startOfMonth(subMonths(month, 1));
      const prevEnd = endOfMonth(subMonths(month, 1));

      const filterByRange = (tx, s, e) => {
        const d = new Date(tx.date);
        return d >= s && d <= e;
      };
      const filterExpense = (tx, s, e) => filterByRange(tx, s, e) && tx.type === 'expense';

      // In family mode, merge own transactions + familyFeed (deduplicated)
      let allTx = ownTx
      if (isFamily) {
        const myIds = new Set(ownTx.map(tx => tx.id))
        allTx = [...ownTx]
        for (const tx of familyFeed) {
          if (!myIds.has(tx.id)) allTx.push(tx)
        }
      }

      const monthTx = allTx.filter((tx) => filterExpense(tx, start, end));
      const allMonthTx = allTx.filter((tx) => filterByRange(tx, start, end));
      const prevTx = ownTx.filter((tx) => filterExpense(tx, prevStart, prevEnd));

      // Store all budgets for cross-month features (copy last month)
      allBudgetsRef.current = budgets;

      // Filter budgets
      const filteredBudgets = isFamily
        ? budgets.filter((b) => b.familyId === activeFamily?.id && (!b.month || b.month === monthKey))
        : budgets.filter((b) => !b.familyId && (!b.month || b.month === monthKey));

      setBudgets(filteredBudgets);
      setTransactions(monthTx);
      setAllMonthTransactions(allMonthTx);
      setPrevMonthTransactions(prevTx);
      getCachedRates().then(setRates).catch(() => {});
    } catch (err) {
      if (loadVersion.current === version) toast.error(t('budgets.failedLoad'));
    } finally {
      if (loadVersion.current === version) setLoading(false);
    }
  }, [month, viewMode, effectiveUserId, isFamilyMode, activeFamily, members, familyFeed, loadFamilyFeed]);

  useEffect(() => { loadData(); }, [loadData]);

  const budgetData = useMemo(() => {
    return budgetsList.map((b) => {
      const budgetCurrency = b.currency || currency;
      const catTx = transactions.filter((tx) => tx.category === b.category);
      const spent = sumAmountsMultiCurrency(catTx, budgetCurrency, rates);

      // Rollover: carry over unused budget from previous month
      let rolloverAmount = 0;
      if (b.rollover) {
        const prevCatTx = prevMonthTransactions.filter((tx) => tx.category === b.category);
        const prevSpent = sumAmountsMultiCurrency(prevCatTx, budgetCurrency, rates);
        const prevRemaining = b.amount - prevSpent;
        rolloverAmount = prevRemaining > 0 ? prevRemaining : 0;
      }

      const effectiveBudget = b.amount + rolloverAmount;
      return {
        ...b,
        spent,
        rolloverAmount,
        effectiveBudget,
        pct: percentOf(spent, effectiveBudget),
        remaining: effectiveBudget - spent,
      };
    }).sort((a, b) => b.pct - a.pct);
  }, [budgetsList, transactions, prevMonthTransactions, rates, currency]);

  const totalBudget = sumBy(budgetsList, 'amount');
  const totalSpent = sumAmountsMultiCurrency(transactions, currency, rates);
  const overallPct = percentOf(totalSpent, totalBudget);
  const daysLeft = getDaysRemaining(month);

  // Compute total income for the selected month
  const totalIncome = useMemo(() => {
    return sumAmountsMultiCurrency(allMonthTransactions.filter((tx) => tx.type === 'income'), currency, rates);
  }, [allMonthTransactions, currency, rates]);

  const toBeBudgeted = totalIncome - totalBudget;

  const handleSave = async () => {
    if (!formCategory || !formAmount || Number(formAmount) <= 0) {
      toast.error(t('budgets.fillRequired'));
      return;
    }
    try {
      if (editBudget) {
        await budgetsApi.update(editBudget.id, {
          amount: Number(formAmount),
          rollover: formRollover,
        });
        toast.success(t('budgets.updated'));
      } else {
        const isFamily = viewMode === 'family' && isFamilyMode;
        await budgetsApi.create({
          id: generateId(),
          category: formCategory,
          amount: Number(formAmount),
          currency,
          rollover: formRollover,
          month: monthKey,
          userId: effectiveUserId,
          familyId: isFamily ? activeFamily?.id : null,
          createdAt: new Date().toISOString(),
        });
        toast.success(t('budgets.created'));
      }
      setShowAdd(false);
      setEditBudget(null);
      resetForm();
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleEdit = (b) => {
    setEditBudget(b);
    setFormCategory(b.category);
    setFormAmount(b.amount.toString());
    setFormRollover(b.rollover || false);
    setShowAdd(true);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('budgets.deleteConfirm'))) return;
    try {
      await budgetsApi.remove(id);
      toast.success(t('budgets.removed'));
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const resetForm = () => {
    setFormCategory('');
    setFormAmount('');
    setFormRollover(false);
  };

  const usedCategories = new Set(budgetsList.map((b) => b.category));
  const availableCategories = categories.filter((c) => c.id !== 'income' && c.id !== 'transfer' && !usedCategories.has(c.id));

  // ─── Template logic ─────────────────────────────────
  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    if (totalIncome <= 0) {
      setTemplatePreview(null);
      return;
    }
    // Calculate per-category amounts
    const preview = [];
    const { buckets, mapping } = template;

    // Group categories by bucket
    const bucketCategories = {};
    for (const [bucketName] of Object.entries(buckets)) {
      bucketCategories[bucketName] = [];
    }

    // Map categories that are in mapping
    const budgetableCats = categories.filter((c) => c.id !== 'income' && c.id !== 'transfer');
    for (const cat of budgetableCats) {
      const bucket = mapping[cat.id] || (template.id === '80-20' ? 'spending' : null);
      if (bucket && bucketCategories[bucket]) {
        bucketCategories[bucket].push(cat.id);
      }
    }

    // Distribute amounts
    for (const [bucketName, pct] of Object.entries(buckets)) {
      const bucketAmount = totalIncome * pct / 100;
      const cats = bucketCategories[bucketName];
      if (!cats || cats.length === 0) continue;
      const perCat = Math.round(bucketAmount / cats.length);
      for (const catId of cats) {
        if (!usedCategories.has(catId)) {
          preview.push({ category: catId, amount: perCat, bucket: bucketName });
        }
      }
    }

    setTemplatePreview(preview);
  };

  const handleApplyTemplate = async () => {
    if (!templatePreview || templatePreview.length === 0) return;
    try {
      const isFamily = viewMode === 'family' && isFamilyMode;
      for (const item of templatePreview) {
        await budgetsApi.create({
          id: generateId(),
          category: item.category,
          amount: item.amount,
          currency,
          rollover: false,
          month: monthKey,
          userId: effectiveUserId,
          familyId: isFamily ? activeFamily?.id : null,
          createdAt: new Date().toISOString(),
        });
      }
      toast.success(t('budgets.templateApplied'));
      setShowTemplate(false);
      setSelectedTemplate(null);
      setTemplatePreview(null);
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Quick-add for unbudgeted categories
  const handleQuickAdd = async (catId) => {
    const amount = Number(quickAddAmounts[catId]);
    if (!amount || amount <= 0) return;
    try {
      const isFamily = viewMode === 'family' && isFamilyMode;
      await budgetsApi.create({
        id: generateId(),
        category: catId,
        amount,
        currency,
        rollover: false,
        month: monthKey,
        userId: effectiveUserId,
        familyId: isFamily ? activeFamily?.id : null,
        createdAt: new Date().toISOString(),
      });
      toast.success(t('budgets.created'));
      setQuickAddAmounts((prev) => { const n = { ...prev }; delete n[catId]; return n; });
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ─── Copy Last Month ─────────────────────────────────
  const prevMonthBudgets = useMemo(() => {
    const isFamily = viewMode === 'family' && isFamilyMode;
    return allBudgetsRef.current.filter((b) => {
      if (isFamily) return b.familyId === activeFamily?.id && b.month === prevMonthKey;
      return !b.familyId && b.month === prevMonthKey;
    });
  }, [budgetsList, viewMode, isFamilyMode, activeFamily, prevMonthKey]);

  const canCopyLastMonth = prevMonthBudgets.length > 0 && prevMonthBudgets.some((b) => !usedCategories.has(b.category));

  const handleCopyLastMonth = async () => {
    const toCopy = prevMonthBudgets.filter((b) => !usedCategories.has(b.category));
    if (toCopy.length === 0) { toast.error(t('budgets.nothingToCopy')); return; }
    try {
      const isFamily = viewMode === 'family' && isFamilyMode;
      for (const b of toCopy) {
        await budgetsApi.create({
          id: generateId(),
          category: b.category,
          amount: b.amount,
          currency: b.currency || currency,
          rollover: b.rollover || false,
          month: monthKey,
          userId: effectiveUserId,
          familyId: isFamily ? activeFamily?.id : null,
          createdAt: new Date().toISOString(),
        });
      }
      toast.success(t('budgets.copiedFromLastMonth', { count: toCopy.length, month: format(subMonths(month, 1), 'MMMM') }));
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('budgets.title')}</h1>
          <HelpButton section="budgets" />
        </div>
        <div className="flex items-center gap-2">
          {isFamilyMode && (
            <div className="flex rounded-lg border border-cream-300 dark:border-dark-border overflow-hidden text-xs shrink-0">
              <button
                onClick={() => setViewMode('personal')}
                className={`px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${viewMode === 'personal' ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900' : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'}`}
              >
                {t('budgets.personal')}
              </button>
              <button
                onClick={() => setViewMode('family')}
                className={`px-3 py-1.5 font-medium transition-colors flex items-center gap-1 whitespace-nowrap ${viewMode === 'family' ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900' : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'}`}
              >
                <Users size={12} /> {t('budgets.family')}
              </button>
            </div>
          )}
          <MonthPicker value={month} onChange={setMonth} />
          <button
            onClick={() => { setSelectedTemplate(null); setTemplatePreview(null); setShowTemplate(true); }}
            className="btn-secondary text-xs flex items-center gap-1 shrink-0"
          >
            <LayoutTemplate size={14} /> {t('budgets.useTemplate')}
          </button>
          {canCopyLastMonth && (
            <button onClick={handleCopyLastMonth} className="btn-secondary text-xs flex items-center gap-1 shrink-0">
              <Copy size={14} /> {t('budgets.copyLastMonth')}
            </button>
          )}
          <button onClick={() => { resetForm(); setEditBudget(null); setShowAdd(true); }} className="btn-primary text-xs flex items-center gap-1 shrink-0">
            <Plus size={14} /> {t('common.add')}
          </button>
        </div>
      </div>

      {/* To Be Budgeted card */}
      {!loading && (totalIncome > 0 || budgetData.length > 0) && (
        <div className={`card border-2 ${
          Math.abs(toBeBudgeted) <= 1
            ? 'border-success/40 bg-success/5'
            : toBeBudgeted > 0
              ? 'border-warning/40 bg-warning/5'
              : 'border-danger/40 bg-danger/5'
        }`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-cream-600 dark:text-cream-400 uppercase tracking-wide">
                {t('budgets.toBeBudgeted')}
              </p>
              <p className={`text-2xl stat-value ${
                Math.abs(toBeBudgeted) <= 1
                  ? 'text-success'
                  : toBeBudgeted > 0
                    ? 'text-warning'
                    : 'text-danger'
              }`}>
                {formatCurrency(toBeBudgeted, currency)}
              </p>
            </div>
            <div className="text-right text-xs text-cream-500">
              <p>{t('budgets.basedOnIncome', { amount: formatCurrency(totalIncome, currency) })}</p>
              <p>
                {Math.abs(toBeBudgeted) <= 1
                  ? t('budgets.fullyAllocated')
                  : toBeBudgeted > 0
                    ? t('budgets.unallocated')
                    : t('budgets.overBudgeted')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Overall progress */}
      {budgetData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('budgets.overallBudget')}</span>
            <span className="text-sm stat-value">
              {formatCurrency(totalSpent, currency)} / {formatCurrency(totalBudget, currency)}
            </span>
          </div>
          <div className="h-3 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                overallPct >= 100 ? 'bg-danger' : overallPct >= 80 ? 'bg-warning' : 'bg-accent-600 dark:bg-accent-500'
              }`}
              style={{ width: `${Math.min(overallPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-cream-500">
            <span className={`font-body font-bold ${overallPct >= 100 ? 'text-danger' : overallPct >= 80 ? 'text-warning' : ''}`}>{t('budgets.pctUsed', { pct: overallPct })}</span>
            <span>{t('budgets.daysRemaining', { count: daysLeft })}</span>
          </div>
          {totalBudget > totalSpent && daysLeft > 0 && (
            <p className="text-xs text-cream-500 mt-1">
              {t('budgets.safeToSpendPerDay', { amount: formatCurrency((totalBudget - totalSpent) / daysLeft, currency) })}
            </p>
          )}
        </div>
      )}

      {/* Celebration / Empathetic banners */}
      {budgetData.length > 0 && budgetData.every((b) => b.pct < 80) && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-success/10 border border-success/20">
          <Target size={18} className="text-success shrink-0" />
          <div>
            <p className="text-sm font-medium text-success">{t('budgets.onTrack')}</p>
            <p className="text-xs text-success/80">{t('budgets.onTrackMessage')}</p>
          </div>
        </div>
      )}
      {budgetData.filter((b) => b.pct > 100).map((b) => (
        <div key={`over-${b.id}`} className="flex items-center gap-3 p-3 rounded-xl bg-warning/10 border border-warning/20">
          <PiggyBank size={18} className="text-warning shrink-0" />
          <div>
            <p className="text-sm font-medium text-warning">
              {t('budgets.overBudgetEmpathetic', { category: getCategoryLabel(getCategoryById(b.category), t) })}
            </p>
            <p className="text-xs text-warning/80">{t('budgets.reallocateSuggestion')}</p>
          </div>
        </div>
      ))}

      {/* Budget grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : budgetData.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {budgetData.map((b) => (
            <div key={b.id} className="relative group">
              <BudgetBar category={b.category} spent={b.spent} budgeted={b.effectiveBudget} currency={b.currency || currency} />
              {b.rolloverAmount > 0 && (
                <div className="flex items-center gap-1 mt-1 px-3 pb-1 text-[11px] text-accent-600 dark:text-accent-400">
                  <ArrowRightLeft size={11} />
                  <span>{t('budgets.rolloverAmount', { amount: formatCurrency(b.rolloverAmount, b.currency || currency) })}</span>
                </div>
              )}
              <div className="absolute top-2 right-2 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(b)} className="p-1 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 text-xs">{t('common.edit')}</button>
                <button onClick={() => handleDelete(b.id)} className="p-1 rounded-lg hover:bg-danger/10 text-cream-400 hover:text-danger text-xs">{t('common.delete')}</button>
              </div>
              {!!b.rollover && !b.rolloverAmount && (
                <span className="absolute bottom-2 right-3 text-[10px] text-cream-400 sm:bottom-auto sm:top-3 sm:right-3 sm:group-hover:hidden">{t('budgets.rollover')}</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={PiggyBank}
          title={t('budgets.noBudgetsSet')}
          description={t('budgets.noBudgetsSetDesc')}
          action={t('budgets.createFirst')}
          onAction={() => setShowAdd(true)}
        />
      )}

      {/* Unbudgeted categories with quick-add */}
      {budgetData.length > 0 && toBeBudgeted > 1 && availableCategories.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('budgets.quickAllocate')}</h3>
          <p className="text-xs text-cream-500 mb-3">
            {t('budgets.categoriesWithoutBudgets', { count: availableCategories.length })}
          </p>
          <div className="space-y-2">
            {availableCategories.slice(0, 8).map((cat) => (
              <div key={cat.id} className="flex items-center gap-2">
                <span className="text-base w-6 text-center">{cat.icon}</span>
                <span className="text-sm flex-1 truncate">{getCategoryLabel(cat, t)}</span>
                <input
                  type="number"
                  className="input w-24 text-xs"
                  placeholder="0"
                  value={quickAddAmounts[cat.id] || ''}
                  onChange={(e) => setQuickAddAmounts((prev) => ({ ...prev, [cat.id]: e.target.value }))}
                  inputMode="decimal"
                  min="0"
                />
                <button
                  onClick={() => handleQuickAdd(cat.id)}
                  disabled={!quickAddAmounts[cat.id] || Number(quickAddAmounts[cat.id]) <= 0}
                  className="btn-primary text-xs px-2 py-1 disabled:opacity-40"
                >
                  <Plus size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Fully allocated message */}
      {budgetData.length > 0 && Math.abs(toBeBudgeted) <= 1 && (
        <div className="card border border-success/20 bg-success/5">
          <p className="text-sm text-success font-medium text-center">
            {t('budgets.fullyAllocated')}
          </p>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditBudget(null); }} title={editBudget ? t('budgets.editBudget') : t('budgets.newBudget')}>
        <div className="space-y-4">
          <div>
            {editBudget ? (
              <>
                <label className="label">{t('budgets.category')}</label>
                <p className="text-sm font-medium">{categories.find((c) => c.id === formCategory)?.icon} {getCategoryLabel(categories.find((c) => c.id === formCategory), t)}</p>
              </>
            ) : (
              <CategoryPicker
                label={t('budgets.category')}
                value={formCategory || 'other'}
                onChange={(catId) => setFormCategory(catId)}
                showSubcategories={false}
                exclude={['income', 'transfer', ...Array.from(usedCategories)]}
              />
            )}
          </div>
          <div>
            <label className="label">{t('budgets.monthlyBudgetCurrency', { currency })}</label>
            <input type="number" className="input" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" min="0" inputMode="decimal" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formRollover} onChange={(e) => setFormRollover(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm">{t('budgets.rolloverLabel')}</span>
          </label>
          <button onClick={handleSave} className="btn-primary w-full">{editBudget ? t('budgets.update') : t('budgets.createFirst')}</button>
        </div>
      </Modal>

      {/* Template Modal */}
      <Modal open={showTemplate} onClose={() => { setShowTemplate(false); setSelectedTemplate(null); setTemplatePreview(null); }} title={t('budgets.selectTemplate')}>
        <div className="space-y-4">
          {totalIncome <= 0 && (
            <div className="p-3 rounded-xl bg-warning/10 border border-warning/20 text-sm text-warning">
              {t('budgets.noIncomeForTemplate')}
            </div>
          )}
          {totalIncome > 0 && (
            <p className="text-xs text-cream-500">
              {t('budgets.basedOnIncome', { amount: formatCurrency(totalIncome, currency) })}
            </p>
          )}

          {/* Template cards */}
          <div className="space-y-2">
            {BUDGET_TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.id}
                onClick={() => handleSelectTemplate(tmpl)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selectedTemplate?.id === tmpl.id
                    ? 'border-accent-400 bg-accent-50/50 shadow-sm dark:border-accent-500/50 dark:bg-accent-500/5'
                    : 'border-cream-200 hover:border-accent-300 dark:border-dark-border dark:hover:border-accent-500/30'
                }`}
              >
                <p className="text-sm font-semibold">{tmpl.name}</p>
                <p className="text-xs text-cream-500 mt-0.5">{tmpl.description}</p>
                <div className="flex gap-2 mt-2">
                  {Object.entries(tmpl.buckets).map(([name, pct]) => (
                    <span key={name} className="text-[11px] px-2 py-0.5 rounded-full bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-400">
                      {pct}% {name}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* Preview */}
          {templatePreview && templatePreview.length > 0 && (
            <div className="border-t border-cream-200 dark:border-dark-border pt-3">
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1">
                <Eye size={14} /> {t('budgets.preview')}
              </h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {templatePreview.map((item) => {
                  const cat = categories.find((c) => c.id === item.category);
                  return (
                    <div key={item.category} className="flex items-center justify-between text-sm">
                      <span>{cat?.icon} {getCategoryLabel(cat, t)}</span>
                      <span className="font-medium">{formatCurrency(item.amount, currency)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-sm font-bold mt-2 pt-2 border-t border-cream-200 dark:border-dark-border">
                <span>{t('common.total')}</span>
                <span>{formatCurrency(templatePreview.reduce((s, i) => s + i.amount, 0), currency)}</span>
              </div>
            </div>
          )}

          {templatePreview && templatePreview.length === 0 && selectedTemplate && (
            <p className="text-xs text-cream-500">{t('budgets.noCategoryBudgets')}</p>
          )}

          <button
            onClick={handleApplyTemplate}
            disabled={!templatePreview || templatePreview.length === 0}
            className="btn-primary w-full flex items-center justify-center gap-1 disabled:opacity-50"
          >
            <Check size={14} /> {t('budgets.applyTemplate')}
          </button>
        </div>
      </Modal>
    </div>
  );
}
