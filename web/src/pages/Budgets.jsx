import { useState, useEffect, useMemo } from 'react';
import { budgets as budgetsApi, transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { CATEGORIES, CURRENCIES } from '../lib/constants';
import { generateId, formatCurrency, percentOf, sumBy, getDaysRemaining, formatDateISO } from '../lib/helpers';
import BudgetBar from '../components/BudgetBar';
import CategoryPicker from '../components/CategoryPicker';
import MonthPicker from '../components/MonthPicker';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonCard } from '../components/LoadingSkeleton';
import { PiggyBank, Plus, Users } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { useFamily } from '../contexts/FamilyContext';

export default function Budgets() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const { isFamilyMode, activeFamily, members } = useFamily();
  const [viewMode, setViewMode] = useState('personal'); // 'personal' | 'family'
  const [month, setMonth] = useState(new Date());
  const [budgetsList, setBudgets] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editBudget, setEditBudget] = useState(null);

  // Form state
  const [formCategory, setFormCategory] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formRollover, setFormRollover] = useState(false);

  const currency = user?.defaultCurrency || 'RON';
  const monthKey = format(month, 'yyyy-MM');

  useEffect(() => { loadData(); }, [month, viewMode, effectiveUserId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const isFamily = viewMode === 'family' && isFamilyMode;
      const budgetFilter = isFamily && activeFamily
        ? { familyId: activeFamily.id }
        : { userId: effectiveUserId };

      const [budgets, allTx] = await Promise.all([
        budgetsApi.getAll(isFamily ? {} : { userId: effectiveUserId }),
        txApi.getAll(isFamily ? {} : { userId: effectiveUserId }),
      ]);

      const start = startOfMonth(month);
      const end = endOfMonth(month);

      // In family mode, aggregate all family members' expenses
      const familyUserIds = isFamily ? new Set(members.map((m) => m.userId)) : null;
      const monthTx = allTx.filter((t) => {
        const d = new Date(t.date);
        const inMonth = d >= start && d <= end && t.type === 'expense';
        if (!inMonth) return false;
        if (isFamily && familyUserIds) return familyUserIds.has(t.userId);
        return t.userId === effectiveUserId;
      });

      // Filter budgets
      const filteredBudgets = isFamily
        ? budgets.filter((b) => b.familyId === activeFamily?.id && (!b.month || b.month === monthKey))
        : budgets.filter((b) => !b.familyId && (!b.month || b.month === monthKey));

      setBudgets(filteredBudgets);
      setTransactions(monthTx);
    } catch (err) {
      toast.error(t('budgets.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const budgetData = useMemo(() => {
    return budgetsList.map((b) => {
      const spent = sumBy(transactions.filter((t) => t.category === b.category), 'amount');
      return { ...b, spent, pct: percentOf(spent, b.amount), remaining: b.amount - spent };
    }).sort((a, b) => b.pct - a.pct);
  }, [budgetsList, transactions]);

  const totalBudget = sumBy(budgetsList, 'amount');
  const totalSpent = sumBy(transactions, 'amount');
  const overallPct = percentOf(totalSpent, totalBudget);
  const daysLeft = getDaysRemaining(month);

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
  const availableCategories = CATEGORIES.filter((c) => c.id !== 'income' && c.id !== 'transfer' && !usedCategories.has(c.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title mb-0">{t('budgets.title')}</h1>
        <div className="flex items-center gap-2">
          {isFamilyMode && (
            <div className="flex rounded-lg border border-cream-300 dark:border-dark-border overflow-hidden text-xs">
              <button
                onClick={() => setViewMode('personal')}
                className={`px-3 py-1.5 font-medium transition-colors ${viewMode === 'personal' ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900' : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'}`}
              >
                {t('budgets.personal')}
              </button>
              <button
                onClick={() => setViewMode('family')}
                className={`px-3 py-1.5 font-medium transition-colors flex items-center gap-1 ${viewMode === 'family' ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900' : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'}`}
              >
                <Users size={12} /> {t('budgets.family')}
              </button>
            </div>
          )}
          <MonthPicker value={month} onChange={setMonth} />
          <button onClick={() => { resetForm(); setEditBudget(null); setShowAdd(true); }} className="btn-primary text-xs flex items-center gap-1 shrink-0">
            <Plus size={14} /> {t('common.add')}
          </button>
        </div>
      </div>

      {/* Overall progress */}
      {budgetData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{t('budgets.overallBudget')}</span>
            <span className="text-sm text-cream-500">
              {formatCurrency(totalSpent, currency)} / {formatCurrency(totalBudget, currency)}
            </span>
          </div>
          <div className="h-3 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                overallPct >= 100 ? 'bg-danger' : overallPct >= 80 ? 'bg-warning' : 'bg-success'
              }`}
              style={{ width: `${Math.min(overallPct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-cream-500">
            <span>{t('budgets.pctUsed', { pct: overallPct })}</span>
            <span>{t('budgets.daysRemaining', { count: daysLeft })}</span>
          </div>
          {totalBudget > totalSpent && (
            <p className="text-xs text-cream-500 mt-1">
              {t('budgets.safeToSpendPerDay', { amount: formatCurrency((totalBudget - totalSpent) / daysLeft, currency) })}
            </p>
          )}
        </div>
      )}

      {/* Budget grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : budgetData.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {budgetData.map((b) => (
            <div key={b.id} className="relative group">
              <BudgetBar category={b.category} spent={b.spent} budgeted={b.amount} currency={b.currency || currency} />
              <div className="absolute top-3 right-3 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(b)} className="p-1 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 text-xs">{t('common.edit')}</button>
                <button onClick={() => handleDelete(b.id)} className="p-1 rounded-lg hover:bg-danger/10 text-cream-400 hover:text-danger text-xs">{t('common.delete')}</button>
              </div>
              {b.rollover && (
                <span className="absolute top-3 right-3 text-[10px] text-cream-400 group-hover:hidden">{t('budgets.rollover')}</span>
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

      {/* Unbudgeted income */}
      {budgetData.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('budgets.zeroBasedView')}</h3>
          <p className="text-sm text-cream-600 dark:text-cream-400">
            {t('budgets.zeroBasedDesc')}
          </p>
          <p className="text-xs text-cream-500 mt-2">
            {t('budgets.categoriesWithoutBudgets', { count: availableCategories.length })}
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
                <p className="text-sm font-medium">{CATEGORIES.find((c) => c.id === formCategory)?.icon} {t(`categories.${formCategory}`)}</p>
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
    </div>
  );
}
