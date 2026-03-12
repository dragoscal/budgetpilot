import { useState, useEffect } from 'react';
import Modal from './Modal';
import { CATEGORIES, CURRENCIES } from '../lib/constants';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { todayLocal } from '../lib/helpers';
import { learnCategory } from '../lib/smartFeatures';
import { User, Home } from 'lucide-react';

export default function TransactionEditModal({ transaction, open, onClose, onSave }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState({});

  useEffect(() => {
    if (transaction) {
      setForm({
        merchant: transaction.merchant || '',
        amount: transaction.amount || 0,
        currency: transaction.currency || 'RON',
        category: transaction.category || 'other',
        type: transaction.type || 'expense',
        date: transaction.date || todayLocal(),
        description: transaction.description || '',
        scope: transaction.scope || 'personal',
      });
    }
  }, [transaction]);

  const handleSave = () => {
    if (!form.merchant.trim() || !form.amount) return;

    const categoryChanged = transaction && form.category !== transaction.category;
    const merchantExists = form.merchant && form.merchant.trim().length > 0;

    onSave({
      ...transaction,
      ...form,
      amount: Math.abs(Number(form.amount)),
      updatedAt: new Date().toISOString(),
    });

    // Learn this categorization immediately, offer undo to cancel learning
    if (categoryChanged && merchantExists) {
      const merchant = form.merchant.trim();
      const newCategory = form.category;
      const catObj = CATEGORIES.find((c) => c.id === newCategory);
      const catName = catObj ? `${catObj.icon} ${t('categories.' + newCategory)}` : newCategory;

      // Learn immediately
      learnCategory(merchant, newCategory);

      toast.undo(
        t('categories.alwaysCategorize', { merchant, category: catName }),
        {
          onUndo: async () => {
            // Undo the learning by importing removeLearnedCategory
            const { removeLearnedCategory } = await import('../lib/smartFeatures');
            await removeLearnedCategory(merchant);
          },
          duration: 6000,
        }
      );
    }

    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={t('transactions.editTransaction')}>
      <div className="space-y-3">
        <div>
          <label className="label">{t('transactions.merchant')}</label>
          <input className="input" value={form.merchant || ''} onChange={e => setForm(f => ({...f, merchant: e.target.value}))} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t('transactions.amount')}</label>
            <input className="input" type="number" step="0.01" value={form.amount || ''} onChange={e => setForm(f => ({...f, amount: e.target.value}))} />
          </div>
          <div>
            <label className="label">{t('common.currency')}</label>
            <select className="input" value={form.currency || 'RON'} onChange={e => setForm(f => ({...f, currency: e.target.value}))}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('transactions.type')}</label>
            <select className="input" value={form.type || 'expense'} onChange={e => setForm(f => ({...f, type: e.target.value}))}>
              <option value="expense">{t('transactions.expense')}</option>
              <option value="income">{t('transactions.income')}</option>
              <option value="transfer">{t('transactions.transfer')}</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">{t('transactions.category')}</label>
          <select className="input" value={form.category || 'other'} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.icon} {t('categories.' + c.id)}</option>)}
          </select>
        </div>
        <div>
          <label className="label">{t('transactions.date')}</label>
          <input className="input" type="date" value={form.date || ''} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
        </div>
        <div>
          <label className="label">{t('transactions.description')}</label>
          <input className="input" value={form.description || ''} onChange={e => setForm(f => ({...f, description: e.target.value}))} />
        </div>
        {transaction?.originalText && (
          <div>
            <label className="label">{t('transactions.originalInput')}</label>
            <p className="text-sm text-cream-500 dark:text-cream-400 italic px-3 py-2 rounded-xl bg-cream-100 dark:bg-dark-border">
              &ldquo;{transaction.originalText}&rdquo;
            </p>
          </div>
        )}
        {/* Scope toggle */}
        <div>
          <label className="label">{t('household.title')}</label>
          <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
            {[
              { id: 'personal', label: t('household.personal'), icon: User },
              { id: 'household', label: t('household.household'), icon: Home },
            ].map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setForm(f => ({ ...f, scope: s.id }))}
                className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                  (form.scope || 'personal') === s.id
                    ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                    : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
                }`}
              >
                <s.icon size={14} />
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
          <button onClick={handleSave} className="btn-primary flex-1">{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}
