import { useState, useEffect } from 'react';
import { useFamily } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { sharedExpenses as sharedApi } from '../lib/api';
import { generateId, formatCurrency, getCategoryById } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import Modal from './Modal';
import SplitCalculator from './SplitCalculator';

/**
 * Modal to split a transaction among family members
 * @param {{ open: boolean, onClose: Function, transaction: Object, onSaved: Function }} props
 */
export default function SplitExpenseModal({ open, onClose, transaction, onSaved }) {
  const { t } = useTranslation();
  const { activeFamily, members, myMembership } = useFamily();
  const { effectiveUserId } = useAuth();
  const { toast } = useToast();
  const [splits, setSplits] = useState([]);
  const [splitType, setSplitType] = useState('equal');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [alreadySplit, setAlreadySplit] = useState(false);
  const [paidBy, setPaidBy] = useState(effectiveUserId);

  const isViewer = myMembership?.role === 'viewer';

  // Initialize splits when modal opens + check for duplicates
  useEffect(() => {
    if (open && members.length > 0 && transaction) {
      (async () => {
        try {
          const existing = await sharedApi.getAll({ familyId: activeFamily?.id });
          const dup = existing.find((e) => e.transactionId === transaction.id);
          setAlreadySplit(!!dup);
        } catch (err) {
          console.error('Failed to check existing split:', err);
          setAlreadySplit(false);
        }
      })();

      const perPerson = Math.round((transaction.amount / members.length) * 100) / 100;
      const remainder = Math.round((transaction.amount - perPerson * members.length) * 100) / 100;

      setPaidBy(effectiveUserId);
      setSplits(members.map((m, i) => ({
        userId: m.userId,
        amount: i === 0 ? perPerson + remainder : perPerson,
        percentage: Math.round((100 / members.length) * 100) / 100,
        settled: m.userId === effectiveUserId,
      })));
      setDescription(transaction.description || `${transaction.merchant} - ${transaction.category}`);
    }
  }, [open, members, transaction, effectiveUserId, activeFamily]);

  const handleSplitChange = (newSplits, type) => {
    setSplits(newSplits.map((s) => ({
      ...s,
      settled: s.userId === paidBy ? true : s.settled,
    })));
    setSplitType(type);
  };

  const handleSave = async () => {
    if (!activeFamily || !transaction) return;

    if (alreadySplit) {
      toast.error(t('split.alreadySplit'));
      return;
    }

    const totalAllocated = splits.reduce((s, sp) => s + sp.amount, 0);
    if (Math.abs(totalAllocated - transaction.amount) > 0.01) {
      toast.error(t('split.mustAddUp'));
      return;
    }

    setSaving(true);
    try {
      const sharedExpense = {
        id: generateId(),
        familyId: activeFamily.id,
        transactionId: transaction.id,
        paidByUserId: paidBy,
        totalAmount: transaction.amount,
        currency: transaction.currency || 'RON',
        splitType,
        splits,
        description,
        date: transaction.date,
        category: transaction.category,
        merchant: transaction.merchant,
        createdAt: new Date().toISOString(),
      };

      await sharedApi.create(sharedExpense);
      toast.success(t('split.saved'));
      onSaved?.(sharedExpense);
      onClose();
    } catch (err) {
      toast.error(t('split.failedSave'));
    } finally {
      setSaving(false);
    }
  };

  if (!transaction || !activeFamily) return null;

  return (
    <Modal open={open} onClose={onClose} title={t('split.splitExpense')}>
      <div className="space-y-4">
        {isViewer && (
          <div className="p-3 rounded-xl bg-cream-100 dark:bg-dark-border text-cream-500 text-sm font-medium text-center">
            {t('family.viewerRestricted')}
          </div>
        )}

        {alreadySplit && (
          <div className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning text-sm font-medium flex items-center gap-2">
            <span>&#9888;&#65039;</span> {t('split.duplicateWarning')}
          </div>
        )}

        <div className="flex items-center justify-between p-3 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border">
          <div>
            <p className="text-sm font-medium">{transaction.merchant}</p>
            <p className="text-xs text-cream-500">{transaction.date} · {getCategoryLabel(getCategoryById(transaction.category), t)}</p>
          </div>
          <p className="text-lg font-heading font-bold money">
            {formatCurrency(transaction.amount, transaction.currency)}
          </p>
        </div>

        {/* Paid by selector */}
        <div>
          <label className="label">{t('split.paidBy')}</label>
          <select
            className="input"
            value={paidBy}
            onChange={(e) => setPaidBy(e.target.value)}
            disabled={isViewer}
          >
            {members.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.emoji} {m.displayName}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-cream-500">
          {t('split.splitWith', { name: activeFamily.name })}
        </p>

        <div>
          <label className="label">{t('common.description')}</label>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('split.whatWasThis')}
          />
        </div>

        <SplitCalculator
          members={members}
          totalAmount={transaction.amount}
          currency={transaction.currency || 'RON'}
          splits={splits}
          onChange={handleSplitChange}
        />

        <button
          onClick={handleSave}
          disabled={saving || alreadySplit || isViewer}
          className="btn-primary w-full"
        >
          {saving ? t('common.saving') : isViewer ? t('family.viewerRestricted') : alreadySplit ? t('split.alreadySplitBtn') : t('split.saveSplit')}
        </button>
      </div>
    </Modal>
  );
}
