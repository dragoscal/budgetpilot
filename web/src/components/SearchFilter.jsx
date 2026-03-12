import { useState, useRef, useEffect } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';

function CategoryDropdown({ value, onChange }) {
  const { t } = useTranslation();
  const { categories } = useCategories();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = value ? categories.find((c) => c.id === value) : null;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="input w-auto min-w-[130px] flex items-center gap-2 text-left"
      >
        {current ? (
          <>
            <span className="shrink-0">{current.icon}</span>
            <span className="truncate text-sm">{getCategoryLabel(current, t)}</span>
          </>
        ) : (
          <span className="text-cream-400 text-sm">{t('filter.allCategories')}</span>
        )}
        <ChevronDown size={14} className="ml-auto text-cream-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 right-0 sm:left-0 top-full mt-1 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-xl overflow-hidden" style={{ minWidth: '200px', maxHeight: '320px' }}>
          <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left ${
                !value ? 'bg-cream-100 dark:bg-dark-border font-medium' : ''
              }`}
            >
              <span className="text-cream-400">{t('filter.allCategories')}</span>
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => { onChange(cat.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left ${
                  value === cat.id ? 'bg-cream-100 dark:bg-dark-border font-medium' : ''
                }`}
              >
                <span>{cat.icon}</span>
                <span>{getCategoryLabel(cat, t)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchFilter({ search, onSearch, category, onCategory, type, onType, showFilters = true }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <div className="relative flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
        <input
          type="text"
          className="input pl-9 pr-8"
          placeholder={t('filter.searchTransactions')}
          value={search}
          onChange={(e) => onSearch(e.target.value)}
        />
        {search && (
          <button onClick={() => onSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-400 hover:text-cream-600">
            <X size={14} />
          </button>
        )}
      </div>
      {showFilters && (
        <div className="flex gap-2">
          <CategoryDropdown value={category} onChange={onCategory} />
          <select className="input w-auto min-w-[110px]" value={type} onChange={(e) => onType(e.target.value)}>
            <option value="">{t('filter.allTypes')}</option>
            <option value="expense">{t('filter.expenses')}</option>
            <option value="income">{t('filter.income')}</option>
            <option value="transfer">{t('filter.transfers')}</option>
          </select>
        </div>
      )}
    </div>
  );
}
