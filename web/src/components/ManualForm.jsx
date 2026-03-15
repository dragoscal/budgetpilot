import { useState, useEffect, useRef, useCallback } from 'react';
import { CURRENCIES, TRANSACTION_TYPES } from '../lib/constants';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';
import { useClickOutside } from '../hooks/useClickOutside';
import { generateId, formatDateISO, validateTransaction, parseLocalNumber, getCategoryById } from '../lib/helpers';
import { getMerchantSuggestions, inferCategorySmart, learnCategory } from '../lib/smartFeatures';
import { getAll } from '../lib/storage';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { useFamily } from '../contexts/FamilyContext';
import { Eye, EyeOff } from 'lucide-react';
import CategoryPicker from './CategoryPicker';
import TagInput from './TagInput';

export default function ManualForm({ onSubmit, initial = {}, submitLabel }) {
  const { categories } = useCategories();
  const { effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const familyCtx = useFamily();

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

  // Visibility: controlled by family privacy rules + manual toggle
  const [visibility, setVisibility] = useState(initial.visibility || null);

  // Auto-set visibility when category changes (only in family mode)
  const isFamilyMode = familyCtx?.isFamilyMode
  const resolveVisibility = familyCtx?.resolveVisibility
  useEffect(() => {
    if (isFamilyMode && category) {
      setVisibility(resolveVisibility(category))
    }
  }, [category, isFamilyMode, resolveVisibility])

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
      const results = await getMerchantSuggestions(merchant, effectiveUserId);
      if (!cancelled) {
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
      }
    }, 150);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [merchant, effectiveUserId]);

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
  const closeSuggestions = useCallback(() => setShowSuggestions(false), []);
  useClickOutside(suggestionsRef, closeSuggestions, true, { ignoreRef: merchantRef });

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
  const categoryExclude = type === 'income' ? categories.filter(c => c.id !== 'income' && c.id !== 'other').map(c => c.id) :
                           type === 'transfer' ? categories.filter(c => c.id !== 'transfer').map(c => c.id) :
                           ['income', 'transfer'];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || parseLocalNumber(amount) <= 0) return;

    // Learn the category for this merchant
    if (merchant.trim()) {
      learnCategory(merchant.trim(), category, subcategory);
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
      visibility: isFamilyMode ? (visibility ?? 'family') : null,
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
      setVisibility(null);
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

      {/* Visibility toggle (family mode only) */}
      {isFamilyMode && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setVisibility(v => (v ?? 'family') === 'private' ? 'family' : 'private')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
              (visibility ?? 'family') === 'private'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
            }`}
          >
            {(visibility ?? 'family') === 'private' ? <EyeOff size={14} /> : <Eye size={14} />}
            {(visibility ?? 'family') === 'private' ? t('family.visibility.private') : t('family.visibility.family')}
          </button>
        </div>
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
                  <span className="text-xs text-cream-500">{s.count}x · {getCategoryLabel(getCategoryById(s.category), t)}</span>
                </button>
              ))}
            </div>
          )}
          {categoryAutoSet && !initial.id && (
            <p className="text-[10px] text-success mt-0.5">{t('manualForm.autoCategorized').replace('{category}', getCategoryLabel(getCategoryById(category), t))}</p>
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
