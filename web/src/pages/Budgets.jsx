import { useState, useEffect, useMemo } from 'react';
import { budgets as budgetsApi, transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIES, CURRENCIES } from '../lib/constants';
import { generateId, formatCurrency, percentOf, sumBy, getDaysRemaining, formatDateISO } from '../lib/helpers';
import BudgetBar from '../components/BudgetBar';
import CategoryPicker from '../components/CategoryPicker';
import MonthPicker from '../components/MonthPicker';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonCard } from '../components/LoadingSkeleton';
import { PiggyBank, Plus } from 'lucide-react';
import { startOfMonth, endOfMonth, format } from 'date-fns';

export default function Budgets() {
  const { user } = useAuth();
  const { toast } = useToast();
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

  useEffect(() => { loadData(); }, [month]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [budgets, allTx] = await Promise.all([
        budgetsApi.getAll({ userId: 'local' }),
        txApi.getAll({ userId: 'local' }),
      ]);
      const start = startOfMonth(month);
      const end = endOfMonth(month);
      const monthTx = allTx.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end && t.type === 'expense';
      });
      setBudgets(budgets.filter((b) => !b.month || b.month === monthKey));
      setTransactions(monthTx);
    } catch (err) {
      toast.error('Failed to load budgets');
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
      toast.error('Please fill in category and amount');
      return;
    }
    try {
      if (editBudget) {
        await budgetsApi.update(editBudget.id, {
          amount: Number(formAmount),
          rollover: formRollover,
        });
        toast.success('Budget updated');
      } else {
        await budgetsApi.create({
          id: generateId(),
          category: formCategory,
          amount: Number(formAmount),
          currency,
          rollover: formRollover,
          month: monthKey,
          userId: 'local',
          createdAt: new Date().toISOString(),
        });
        toast.success('Budget created');
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
      toast.success('Budget removed');
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
        <h1 className="page-title mb-0">Budgets</h1>
        <div className="flex items-center gap-2">
          <MonthPicker value={month} onChange={setMonth} />
          <button onClick={() => { resetForm(); setEditBudget(null); setShowAdd(true); }} className="btn-primary text-xs flex items-center gap-1 shrink-0">
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Overall progress */}
      {budgetData.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall budget</span>
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
            <span>{overallPct}% used</span>
            <span>{daysLeft} days remaining</span>
          </div>
          {totalBudget > totalSpent && (
            <p className="text-xs text-cream-500 mt-1">
              {formatCurrency((totalBudget - totalSpent) / daysLeft, currency)}/day safe to spend
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
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(b)} className="p-1 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400 text-xs">Edit</button>
                <button onClick={() => handleDelete(b.id)} className="p-1 rounded-lg hover:bg-danger/10 text-cream-400 hover:text-danger text-xs">Del</button>
              </div>
              {b.rollover && (
                <span className="absolute top-3 right-3 text-[10px] text-cream-400 group-hover:hidden">Rollover</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={PiggyBank}
          title="No budgets set"
          description="Create monthly budgets to track your spending by category"
          action="Create budget"
          onAction={() => setShowAdd(true)}
        />
      )}

      {/* Unbudgeted income */}
      {budgetData.length > 0 && (
        <div className="card">
          <h3 className="section-title">Zero-based view</h3>
          <p className="text-sm text-cream-600 dark:text-cream-400">
            Unbudgeted categories have no spending limit. Set budgets for all categories for a zero-based budget.
          </p>
          <p className="text-xs text-cream-500 mt-2">
            {availableCategories.length} categories without budgets
          </p>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={showAdd} onClose={() => { setShowAdd(false); setEditBudget(null); }} title={editBudget ? 'Edit budget' : 'New budget'}>
        <div className="space-y-4">
          <div>
            {editBudget ? (
              <>
                <label className="label">Category</label>
                <p className="text-sm font-medium">{CATEGORIES.find((c) => c.id === formCategory)?.icon} {CATEGORIES.find((c) => c.id === formCategory)?.name}</p>
              </>
            ) : (
              <CategoryPicker
                label="Category"
                value={formCategory || 'other'}
                onChange={(catId) => setFormCategory(catId)}
                showSubcategories={false}
                exclude={['income', 'transfer', ...Array.from(usedCategories)]}
              />
            )}
          </div>
          <div>
            <label className="label">Monthly budget ({currency})</label>
            <input type="number" className="input" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} placeholder="0.00" min="0" inputMode="decimal" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={formRollover} onChange={(e) => setFormRollover(e.target.checked)} className="w-4 h-4 rounded" />
            <span className="text-sm">Rollover unspent to next month</span>
          </label>
          <button onClick={handleSave} className="btn-primary w-full">{editBudget ? 'Update' : 'Create budget'}</button>
        </div>
      </Modal>
    </div>
  );
}
