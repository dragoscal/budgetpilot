import { useState, useEffect, useRef } from 'react';
import { CATEGORIES, CURRENCIES, TRANSACTION_TYPES } from '../lib/constants';
import { generateId, formatDateISO, validateTransaction, parseLocalNumber } from '../lib/helpers';
import { getMerchantSuggestions, inferCategorySmart, learnCategory } from '../lib/smartFeatures';
import { getAll } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useFamily } from '../contexts/FamilyContext';
import { User, Home } from 'lucide-react';
import CategoryPicker from './CategoryPicker';
import TagInput from './TagInput';

export default function ManualForm({ onSubmit, initial = {}, submitLabel }) {
  const { effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const familyCtx = useFamily();
  const activeFamily = familyCtx?.activeFamily;
  const familyMembers = familyCtx?.members || [];

  const [type, setType] = useState(initial.type || 'expense');
  const [merchant, setMerchant] = useState(initial.merchant || '');
  const [amount, setAmount] = useState(initial.amount || '');
  const [currency, setCurrency] = useState(initial.currency || 'RON');
  const [category, setCategory] = useState(initial.category || 'other');
  const [subcategory, setSubcategory] = useState(initial.subcategory || null);
  const [date, setDate] = useState(initial.date || formatDateISO(new Date()));
  const [description, setDescription] = useState(initial.description || '');
  const [tags, setTags] = useState(initial.tags || []);
  const [accountId, setAccountId] = useState(initial.accountId || '');
  const [accounts, setAccounts] = useState([]);

  // Scope: personal or household
  const [scope, setScope] = useState(initial.scope || 'personal');
  const [paidBy, setPaidBy] = useState(initial.paidBy || effectiveUserId);
  const [splitType, setSplitType] = useState(initial.splitType || 'equal');
  const [customSplits, setCustomSplits] = useState(() => {
    if (initial.beneficiaries) {
      const map = {};
      initial.beneficiaries.forEach(b => { map[b.userId] = b.amount || 0; });
      return map;
    }
    return {};
  });

  // Load accounts from IndexedDB
  useEffect(() => {
    getAll('accounts').then(setAccounts).catch(() => setAccounts([]));
  }, []);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [categoryAutoSet, setCategoryAutoSet] = useState(false);
  const merchantRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Type label map
  const typeLabels = {
    expense: t('manualForm.expense'),
    income: t('manualForm.income'),
    transfer: t('manualForm.transfer'),
  };

  // Fetch merchant suggestions as user types
  useEffect(() => {
    if (merchant.length < 1) { setSuggestions([]); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const results = await getMerchantSuggestions(merchant);
      if (!cancelled) {
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [merchant]);

  // Auto-detect category when merchant changes (skip for income — income has its own category)
  useEffect(() => {
    if (!merchant || initial.id || type === 'income' || categoryAutoSet) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const inferred = await inferCategorySmart(merchant);
      if (!cancelled && inferred.category !== 'other' && !categoryAutoSet) {
        setCategory(inferred.category);
        if (inferred.subcategory) setSubcategory(inferred.subcategory);
        setCategoryAutoSet(true);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [merchant, initial.id, categoryAutoSet, type]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
          merchantRef.current && !merchantRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectSuggestion = (s) => {
    setMerchant(s.merchant);
    setCategory(s.category);
    if (s.lastAmount && !amount) setAmount(s.lastAmount.toString());
    if (s.currency) setCurrency(s.currency);
    setCategoryAutoSet(true);
    setShowSuggestions(false);
  };

  const handleCategoryChange = (catId, subId) => {
    setCategory(catId);
    setSubcategory(subId || null);
    setCategoryAutoSet(true);  // Mark as user-selected to prevent auto-override
  };

  // Compute exclude list based on type
  const categoryExclude = type === 'income' ? CATEGORIES.filter(c => c.id !== 'income' && c.id !== 'other').map(c => c.id) :
                           type === 'transfer' ? CATEGORIES.filter(c => c.id !== 'transfer').map(c => c.id) :
                           ['income', 'transfer'];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseLocalNumber(amount) <= 0) return;

    // Learn the category for this merchant
    if (merchant.trim()) {
      learnCategory(merchant.trim(), category, subcategory);
    }

    // Build beneficiaries for household split
    let beneficiaries = null;
    if (scope === 'household' && activeFamily && familyMembers.length > 0) {
      const numAmount = Number(amount);
      if (splitType === 'equal') {
        const share = numAmount / familyMembers.length;
        beneficiaries = familyMembers.map(m => ({ userId: m.userId, amount: Math.round(share * 100) / 100 }));
      } else if (splitType === 'cover') {
        beneficiaries = familyMembers.map(m => ({ userId: m.userId, amount: m.userId === (paidBy || effectiveUserId) ? numAmount : 0 }));
      } else if (splitType === 'custom') {
        beneficiaries = familyMembers.map(m => ({ userId: m.userId, amount: Number(customSplits[m.userId]) || 0 }));
      }
    }

    const transaction = {
      id: initial.id || generateId(),
      type,
      merchant: merchant.trim(),
      amount: parseLocalNumber(amount),
      currency,
      category,
      subcategory: subcategory || null,
      date,
      description: description.trim(),
      tags: tags.filter(Boolean),
      accountId: accountId || null,
      scope,
      paidBy: scope === 'household' ? (paidBy || effectiveUserId) : null,
      splitType: scope === 'household' && activeFamily ? splitType : null,
      beneficiaries: scope === 'household' ? beneficiaries : null,
      source: initial.source || 'manual',
      userId: effectiveUserId,
      createdAt: initial.createdAt || new Date().toISOString(),
    };

    const validation = validateTransaction(transaction);
    if (!validation.valid) {
      toast.error(validation.errors[0]);
      return;
    }

    onSubmit(transaction);
    if (!initial.id) {
      setMerchant('');
      setAmount('');
      setDescription('');
      setTags([]);
      setAccountId('');
      setSubcategory(null);
      setCategoryAutoSet(false);
      setScope('personal');
      setPaidBy(effectiveUserId);
      setSplitType('equal');
      setCustomSplits({});
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type toggle */}
      <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
        {TRANSACTION_TYPES.map((txType) => (
          <button
            key={txType}
            type="button"
            onClick={() => setType(txType)}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              type === txType
                ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
            }`}
          >
            {typeLabels[txType] || txType}
          </button>
        ))}
      </div>

      {/* Scope toggle: Personal / Household */}
      <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
        {[
          { id: 'personal', label: t('household.personal'), icon: User },
          { id: 'household', label: t('household.household'), icon: Home },
        ].map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setScope(s.id)}
            className={`flex-1 py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
              scope === s.id
                ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
            }`}
          >
            <s.icon size={14} />
            {s.label}
          </button>
        ))}
      </div>

      {/* Household split options */}
      {scope === 'household' && activeFamily && familyMembers.length > 0 && (
        <div className="space-y-3 p-3 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border">
          {/* Paid by */}
          <div>
            <label className="label">{t('household.paidBy')}</label>
            <select className="input" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
              {familyMembers.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.emoji} {m.displayName} {m.userId === effectiveUserId ? `(${t('family.you')})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Split type chips */}
          <div className="flex gap-2 flex-wrap">
            {[
              { id: 'equal', label: t('household.splitEqually') },
              { id: 'cover', label: t('household.illCoverIt') },
              { id: 'custom', label: t('household.customSplit') },
            ].map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => setSplitType(st.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  splitType === st.id
                    ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                    : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Custom split inputs */}
          {splitType === 'custom' && (
            <div className="space-y-2">
              {familyMembers.map((m) => (
                <div key={m.userId} className="flex items-center gap-2">
                  <span className="text-sm min-w-0 w-20 sm:w-24 truncate shrink-0">{m.emoji} {m.displayName}</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input flex-1 text-sm py-1.5"
                    placeholder="0.00"
                    value={customSplits[m.userId] || ''}
                    onChange={(e) => setCustomSplits(prev => ({ ...prev, [m.userId]: e.target.value }))}
                    inputMode="decimal"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* No family info */}
      {scope === 'household' && !activeFamily && (
        <p className="text-xs text-cream-500 px-1">{t('household.noFamily')}</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {/* Merchant with autocomplete */}
        <div className="col-span-2 relative">
          <label className="label">{t('manualForm.merchant')}</label>
          <input
            ref={merchantRef}
            className="input"
            value={merchant}
            onChange={(e) => { setMerchant(e.target.value); setCategoryAutoSet(false); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder={t('manualForm.merchantPlaceholderShort')}
            autoComplete="off"
          />
          {showSuggestions && suggestions.length > 0 && (
            <div ref={suggestionsRef} className="absolute z-30 left-0 right-0 top-full mt-1 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => selectSuggestion(s)}
                  className="w-full px-3 py-2 text-left hover:bg-cream-100 dark:hover:bg-dark-border flex items-center justify-between text-sm transition-colors"
                >
                  <span className="font-medium">{s.merchant}</span>
                  <span className="text-xs text-cream-500">{s.count}x · {t(`categories.${s.category}`)}</span>
                </button>
              ))}
            </div>
          )}
          {categoryAutoSet && !initial.id && (
            <p className="text-[10px] text-success mt-0.5">{t('manualForm.autoCategorized').replace('{category}', t(`categories.${category}`))}</p>
          )}
        </div>

        <div>
          <label className="label">{t('manualForm.amount')}</label>
          <input type="text" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" required />
        </div>
        <div>
          <label className="label">{t('manualForm.currency')}</label>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>

        <div>
          <CategoryPicker
            label={t('manualForm.category')}
            value={category}
            subcategoryValue={subcategory}
            onChange={handleCategoryChange}
            exclude={categoryExclude}
          />
        </div>
        <div>
          <label className="label">{t('manualForm.date')}</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="col-span-2">
          <label className="label">{t('manualForm.descriptionNote')}</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('manualForm.optionalNote')} />
        </div>

        <div className="col-span-2">
          <TagInput tags={tags} onChange={setTags} userId={effectiveUserId} />
        </div>

        {accounts.length > 0 && (
          <div className="col-span-2">
            <label className="label">{t('manualForm.account')}</label>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">{t('manualForm.selectAccount')}</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <button type="submit" className="btn-primary w-full">{submitLabel || t('manualForm.addTransaction')}</button>
    </form>
  );
}
