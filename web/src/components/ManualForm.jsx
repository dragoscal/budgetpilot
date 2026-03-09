import { useState, useEffect, useRef } from 'react';
import { CATEGORIES, CURRENCIES, TRANSACTION_TYPES } from '../lib/constants';
import { generateId, formatDateISO } from '../lib/helpers';
import { getMerchantSuggestions, inferCategorySmart, learnCategory } from '../lib/smartFeatures';
import CategoryPicker from './CategoryPicker';

export default function ManualForm({ onSubmit, initial = {}, submitLabel = 'Add transaction' }) {
  const [type, setType] = useState(initial.type || 'expense');
  const [merchant, setMerchant] = useState(initial.merchant || '');
  const [amount, setAmount] = useState(initial.amount || '');
  const [currency, setCurrency] = useState(initial.currency || 'RON');
  const [category, setCategory] = useState(initial.category || 'other');
  const [subcategory, setSubcategory] = useState(initial.subcategory || null);
  const [date, setDate] = useState(initial.date || formatDateISO(new Date()));
  const [description, setDescription] = useState(initial.description || '');
  const [tags, setTags] = useState(initial.tags?.join(', ') || '');

  // Autocomplete state
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [categoryAutoSet, setCategoryAutoSet] = useState(false);
  const merchantRef = useRef(null);
  const suggestionsRef = useRef(null);

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

  // Auto-detect category when merchant changes
  useEffect(() => {
    if (!merchant || initial.id) return;
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
  }, [merchant, initial.id, categoryAutoSet]);

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
    setCategoryAutoSet(false);
  };

  // Compute exclude list based on type
  const categoryExclude = type === 'income' ? CATEGORIES.filter(c => c.id !== 'income' && c.id !== 'other').map(c => c.id) :
                           type === 'transfer' ? CATEGORIES.filter(c => c.id !== 'transfer').map(c => c.id) :
                           ['income', 'transfer'];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    // Learn the category for this merchant
    if (merchant.trim()) {
      learnCategory(merchant.trim(), category, subcategory);
    }

    const transaction = {
      id: initial.id || generateId(),
      type,
      merchant: merchant.trim(),
      amount: Number(amount),
      currency,
      category,
      subcategory: subcategory || null,
      date,
      description: description.trim(),
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      source: initial.source || 'manual',
      userId: 'local',
      createdAt: initial.createdAt || new Date().toISOString(),
    };

    onSubmit(transaction);
    if (!initial.id) {
      setMerchant('');
      setAmount('');
      setDescription('');
      setTags('');
      setSubcategory(null);
      setCategoryAutoSet(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Type toggle */}
      <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
        {TRANSACTION_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 py-2 text-sm font-medium capitalize transition-colors ${
              type === t
                ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Merchant with autocomplete */}
        <div className="col-span-2 relative">
          <label className="label">Merchant / Source</label>
          <input
            ref={merchantRef}
            className="input"
            value={merchant}
            onChange={(e) => { setMerchant(e.target.value); setCategoryAutoSet(false); }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="e.g. Kaufland"
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
                  <span className="text-xs text-cream-500">{s.count}x · {s.category}</span>
                </button>
              ))}
            </div>
          )}
          {categoryAutoSet && !initial.id && (
            <p className="text-[10px] text-success mt-0.5">Auto-categorized as {category}</p>
          )}
        </div>

        <div>
          <label className="label">Amount</label>
          <input type="number" step="0.01" min="0" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" required />
        </div>
        <div>
          <label className="label">Currency</label>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>

        <div>
          <CategoryPicker
            label="Category"
            value={category}
            subcategoryValue={subcategory}
            onChange={handleCategoryChange}
            exclude={categoryExclude}
          />
        </div>
        <div>
          <label className="label">Date</label>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div className="col-span-2">
          <label className="label">Description / Note</label>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note" />
        </div>

        <div className="col-span-2">
          <label className="label">Tags (comma-separated)</label>
          <input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. vacation, business" />
        </div>
      </div>

      <button type="submit" className="btn-primary w-full">{submitLabel}</button>
    </form>
  );
}
