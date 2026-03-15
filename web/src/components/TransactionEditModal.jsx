import { useState, useEffect } from 'react';
import Modal from './Modal';
import { CURRENCIES } from '../lib/constants';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { todayLocal } from '../lib/helpers';
import { learnCategory } from '../lib/smartFeatures';
import { Eye, EyeOff } from 'lucide-react';
import { useFamily } from '../contexts/FamilyContext';
import CategoryPicker from './CategoryPicker';
import TagInput from './TagInput';
import { useAuth } from '../contexts/AuthContext';

export default function TransactionEditModal({ transaction, open, onClose, onSave }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { categories } = useCategories();
  const { effectiveUserId } = useAuth();
  const familyCtx = useFamily();
  const isFamilyMode = familyCtx?.isFamilyMode
  const resolveVisibility = familyCtx?.resolveVisibility
  const [form, setForm] = useState({});

  useEffect(() => {
    if (transaction) {
      setForm({
        merchant: transaction.merchant || '',
        amount: transaction.amount || 0,
        currency: transaction.currency || 'RON',
        category: transaction.category || 'other',
        subcategory: transaction.subcategory || null,
        type: transaction.type || 'expense',
        date: transaction.date || todayLocal(),
        description: transaction.description || '',
        tags: transaction.tags || [],
        visibility: transaction.visibility || null,
      });
    }
  }, [transaction]);

  // Auto-resolve visibility when category changes in family mode
  useEffect(() => {
    if (isFamilyMode && form.category) {
      setForm(f => ({ ...f, visibility: resolveVisibility(f.category) }))
    }
  }, [form.category, isFamilyMode, resolveVisibility])

  const handleSave = () => {
    if (!form.amount) return;

    const categoryChanged = transaction && form.category !== transaction.category;
    const subcategoryChanged = transaction && form.subcategory !== transaction.subcategory;
    const merchantExists = form.merchant && form.merchant.trim().length > 0;

    onSave({
      ...transaction,
      ...form,
      amount: Math.abs(Number(form.amount)),
      subcategory: form.subcategory || null,
      tags: (form.tags || []).filter(Boolean),
      updatedAt: new Date().toISOString(),
    });

    // Learn this categorization immediately, offer undo to cancel learning
    if ((categoryChanged || subcategoryChanged) && merchantExists) {
      const merchant = form.merchant.trim();
      const newCategory = form.category;
      const catObj = categories.find((c) => c.id === newCategory);
      const catName = catObj ? `${catObj.icon} ${getCategoryLabel(catObj, t)}` : newCategory;

      // Learn immediately (with subcategory)
      learnCategory(merchant, newCategory, form.subcategory || null);

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
          <CategoryPicker
            label={t('transactions.category')}
            value={form.category || 'other'}
            subcategoryValue={form.subcategory || null}
            onChange={(catId, subId) => setForm(f => ({...f, category: catId, subcategory: subId || null}))}
            exclude={form.type === 'income' ? categories.filter(c => c.id !== 'income' && c.id !== 'other').map(c => c.id)
                   : form.type === 'transfer' ? categories.filter(c => c.id !== 'transfer').map(c => c.id)
                   : ['income', 'transfer']}
          />
        </div>
        <div>
          <label className="label">{t('transactions.date')}</label>
          <input className="input" type="date" value={form.date || ''} onChange={e => setForm(f => ({...f, date: e.target.value}))} />
        </div>
        <div>
          <label className="label">{t('transactions.description')}</label>
          <input className="input" value={form.description || ''} onChange={e => setForm(f => ({...f, description: e.target.value}))} placeholder={t('manualForm.optionalNote')} />
        </div>
        <div>
          <TagInput tags={form.tags || []} onChange={(tags) => setForm(f => ({...f, tags}))} userId={effectiveUserId} />
        </div>
        {transaction?.originalText && (
          <div>
            <label className="label">{t('transactions.originalInput')}</label>
            <p className="text-sm text-cream-500 dark:text-cream-400 italic px-3 py-2 rounded-xl bg-cream-100 dark:bg-dark-border">
              &ldquo;{transaction.originalText}&rdquo;
            </p>
          </div>
        )}
        {/* Visibility toggle (family mode only) */}
        {isFamilyMode && (
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setForm(f => ({
                ...f,
                visibility: (f.visibility ?? 'family') === 'private' ? 'family' : 'private'
              }))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                (form.visibility ?? 'family') === 'private'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
              }`}
            >
              {(form.visibility ?? 'family') === 'private' ? <EyeOff size={14} /> : <Eye size={14} />}
              {(form.visibility ?? 'family') === 'private' ? t('family.visibility.private') : t('family.visibility.family')}
            </button>
          </div>
        )}
        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="btn-secondary flex-1">{t('common.cancel')}</button>
          <button onClick={handleSave} className="btn-primary flex-1">{t('common.save')}</button>
        </div>
      </div>
    </Modal>
  );
}
