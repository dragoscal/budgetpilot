import { useState, useEffect, useRef } from 'react';
import { goals as goalsApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import HelpButton from '../components/HelpButton';
import { GOAL_TYPES, CURRENCIES } from '../lib/constants';
import { generateId, formatCurrency } from '../lib/helpers';
import GoalCard from '../components/GoalCard';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Target, Plus } from 'lucide-react';

export default function Goals() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [goalsList, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState(null);
  const [fundGoal, setFundGoal] = useState(null);
  const [fundAmount, setFundAmount] = useState('');

  // Form
  const [form, setForm] = useState({ name: '', type: 'save_up', targetAmount: '', currentAmount: '0', targetDate: '', currency: user?.defaultCurrency || 'RON', icon: '🎯', color: '#059669', interestRate: '', minimumPayment: '' });

  const currency = user?.defaultCurrency || 'RON';
  const loadVersion = useRef(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    const load = async () => {
      setLoading(true);
      try {
        const data = await goalsApi.getAll({ userId: effectiveUserId });
        if (loadVersion.current !== version) return;
        setGoals(data);
      } catch (err) {
        if (loadVersion.current === version) toast.error(t('goals.failedLoad'));
      } finally {
        if (loadVersion.current === version) setLoading(false);
      }
    };
    load();
  }, [effectiveUserId]);

  const loadGoals = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await goalsApi.getAll({ userId: effectiveUserId });
      if (loadVersion.current !== version) return;
      setGoals(data);
    } catch (err) {
      if (loadVersion.current === version) toast.error(t('goals.failedLoad'));
    } finally {
      if (loadVersion.current === version) setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.targetAmount || Number(form.targetAmount) <= 0) {
      toast.error(t('goals.nameRequired'));
      return;
    }
    try {
      const goalData = {
        ...form,
        targetAmount: Number(form.targetAmount),
        currentAmount: Number(form.currentAmount) || 0,
        interestRate: form.interestRate ? Number(form.interestRate) : undefined,
        minimumPayment: form.minimumPayment ? Number(form.minimumPayment) : undefined,
        userId: effectiveUserId,
      };
      if (editGoal) {
        await goalsApi.update(editGoal.id, goalData);
        toast.success(t('goals.updated'));
      } else {
        await goalsApi.create({ id: generateId(), ...goalData, createdAt: new Date().toISOString() });
        toast.success(t('goals.created'));
      }
      setShowForm(false);
      setEditGoal(null);
      resetForm();
      loadGoals();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleAddFunds = async () => {
    if (!fundGoal || !fundAmount || Number(fundAmount) <= 0) return;
    try {
      const newAmount = (fundGoal.currentAmount || 0) + Number(fundAmount);
      await goalsApi.update(fundGoal.id, { currentAmount: newAmount });
      toast.success(t('goals.addedFundsTo', { amount: formatCurrency(Number(fundAmount), fundGoal.currency || currency), name: fundGoal.name }));
      setFundGoal(null);
      setFundAmount('');
      loadGoals();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDelete = async (goal) => {
    try {
      await goalsApi.remove(goal.id);
      toast.success(t('goals.deleted'));
      loadGoals();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleEdit = (goal) => {
    setEditGoal(goal);
    setForm({ name: goal.name, type: goal.type, targetAmount: goal.targetAmount.toString(), currentAmount: (goal.currentAmount || 0).toString(), targetDate: goal.targetDate || '', currency: goal.currency || currency, icon: goal.icon || '🎯', color: goal.color || '#059669', interestRate: goal.interestRate?.toString() || '', minimumPayment: goal.minimumPayment?.toString() || '' });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({ name: '', type: 'save_up', targetAmount: '', currentAmount: '0', targetDate: '', currency, icon: '🎯', color: '#059669', interestRate: '', minimumPayment: '' });
  };

  const saveUpGoals = goalsList.filter((g) => g.type === 'save_up');
  const payDownGoals = goalsList.filter((g) => g.type === 'pay_down');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('goals.savingsGoals')}</h1>
          <HelpButton section="goals" />
        </div>
        <button onClick={() => { resetForm(); setEditGoal(null); setShowForm(true); }} className="btn-primary text-xs flex items-center gap-1">
          <Plus size={14} /> {t('goals.newGoal')}
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[1, 2].map((i) => <div key={i} className="card shimmer h-48" />)}</div>
      ) : goalsList.length > 0 ? (
        <>
          {saveUpGoals.length > 0 && (
            <div>
              <h3 className="section-title">{t('goals.saveUp')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {saveUpGoals.map((g) => <GoalCard key={g.id} goal={g} onEdit={handleEdit} onDelete={handleDelete} onAddFunds={setFundGoal} />)}
              </div>
            </div>
          )}
          {payDownGoals.length > 0 && (
            <div>
              <h3 className="section-title">{t('goals.payDown')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {payDownGoals.map((g) => <GoalCard key={g.id} goal={g} onEdit={handleEdit} onDelete={handleDelete} onAddFunds={setFundGoal} />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={Target} title={t('goals.noGoals')} description={t('goals.noGoalsMotivation')} action={t('goals.createAGoal')} onAction={() => setShowForm(true)} />
      )}

      {/* Create/Edit Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditGoal(null); }} title={editGoal ? t('goals.editGoal') : t('goals.newGoal')}>
        <div className="space-y-4">
          <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
            {Object.entries(GOAL_TYPES).map(([key, { label }]) => (
              <button key={key} type="button" onClick={() => setForm((f) => ({ ...f, type: key }))} className={`flex-1 py-2 text-sm font-medium ${form.type === key ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900' : 'text-cream-600 hover:bg-cream-100'}`}>
                {t(`goalTypes.${key}`)}
              </button>
            ))}
          </div>
          <div><label className="label">{t('goals.name')}</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('goals.emergencyFundPlaceholder')} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t('goals.targetAmount')}</label><input type="number" className="input" value={form.targetAmount} onChange={(e) => setForm((f) => ({ ...f, targetAmount: e.target.value }))} placeholder="0" inputMode="decimal" /></div>
            <div><label className="label">{t('goals.currentAmount')}</label><input type="number" className="input" value={form.currentAmount} onChange={(e) => setForm((f) => ({ ...f, currentAmount: e.target.value }))} placeholder="0" inputMode="decimal" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('common.currency')}</label>
              <select className="input" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
              </select>
            </div>
            <div><label className="label">{t('goals.deadline')}</label><input type="date" className="input" value={form.targetDate} onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))} /></div>
          </div>
          {form.type === 'pay_down' && (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">{t('goals.interestRate')}</label><input type="number" className="input" value={form.interestRate} onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))} step="0.1" /></div>
              <div><label className="label">{t('goals.minPayment')}</label><input type="number" className="input" value={form.minimumPayment} onChange={(e) => setForm((f) => ({ ...f, minimumPayment: e.target.value }))} /></div>
            </div>
          )}
          <div className="space-y-2">
            <label className="label">{t('goals.icon')}</label>
            <div className="flex flex-wrap gap-1.5">
              {['🎯', '🏠', '🚗', '✈️', '💻', '📱', '🎓', '💍', '👶', '🏖️', '💰', '🛡️', '🎁', '🐶', '🏋️', '📚', '🎵', '⚽', '🩺', '🔧'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, icon: emoji }))}
                  className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all ${
                    form.icon === emoji
                      ? 'bg-accent/15 ring-2 ring-accent scale-110'
                      : 'bg-cream-100 dark:bg-dark-border hover:bg-cream-200 dark:hover:bg-cream-700'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{t('goals.color')}</label>
            <input type="color" className="input h-10" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
          </div>
          <button onClick={handleSave} className="btn-primary w-full">{editGoal ? t('goals.update') : t('goals.create')}</button>
        </div>
      </Modal>

      {/* Add funds modal */}
      <Modal open={!!fundGoal} onClose={() => { setFundGoal(null); setFundAmount(''); }} title={t('goals.addFundsTo', { name: fundGoal?.name || '' })}>
        <div className="space-y-4">
          <div><label className="label">{t('common.amount')}</label><input type="number" className="input" value={fundAmount} onChange={(e) => setFundAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoFocus /></div>
          <button onClick={handleAddFunds} className="btn-primary w-full">{t('goals.addFunds')}</button>
        </div>
      </Modal>
    </div>
  );
}
