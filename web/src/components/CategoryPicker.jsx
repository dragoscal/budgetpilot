import { useState, useEffect, useRef } from 'react';
import { CATEGORIES, SUBCATEGORIES } from '../lib/constants';
import { getSubcategoryById, getCategoryById } from '../lib/helpers';
import { Search, ChevronRight, ChevronLeft, X } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

const RECENT_KEY = 'bp_recentCategories';
const MAX_RECENT = 5;

function getRecentPicks() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, MAX_RECENT);
  } catch {
    // Intentionally swallowed — localStorage read fallback returns empty array
    return [];
  }
}

function saveRecentPick(categoryId, subcategoryId) {
  const key = subcategoryId || categoryId;
  const recent = getRecentPicks().filter((r) => r.key !== key);
  recent.unshift({ key, categoryId, subcategoryId: subcategoryId || null });
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

export default function CategoryPicker({
  value,
  subcategoryValue = null,
  onChange,
  showSubcategories = true,
  exclude = [],
  compact = false,
  label = null,
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedParent, setExpandedParent] = useState(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  const currentCat = getCategoryById(value);
  const currentSub = subcategoryValue ? getSubcategoryById(subcategoryValue) : null;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) &&
          triggerRef.current && !triggerRef.current.contains(e.target)) {
        setOpen(false);
        setSearch('');
        setExpandedParent(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') { setOpen(false); setSearch(''); setExpandedParent(null); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const filteredCategories = CATEGORIES.filter((c) => !exclude.includes(c.id));
  const lowerSearch = search.toLowerCase();

  // Filter categories and subcategories by search (search both translated and original names)
  const searchResults = [];
  if (lowerSearch) {
    for (const cat of filteredCategories) {
      const catName = t(`categories.${cat.id}`);
      if (catName.toLowerCase().includes(lowerSearch) || cat.name.toLowerCase().includes(lowerSearch)) {
        searchResults.push({ type: 'category', ...cat, translatedName: catName });
      }
      if (showSubcategories && SUBCATEGORIES[cat.id]) {
        for (const sub of SUBCATEGORIES[cat.id]) {
          const subName = t(`subcategories.${sub.id}`);
          if (subName.toLowerCase().includes(lowerSearch) || sub.name.toLowerCase().includes(lowerSearch)) {
            searchResults.push({ type: 'subcategory', parentId: cat.id, parentIcon: cat.icon, parentName: catName, ...sub, translatedName: subName });
          }
        }
      }
    }
  }

  const recentPicks = getRecentPicks().filter((r) => !exclude.includes(r.categoryId));

  const handleSelect = (categoryId, subcategoryId = null) => {
    saveRecentPick(categoryId, subcategoryId);
    onChange(categoryId, subcategoryId);
    setOpen(false);
    setSearch('');
    setExpandedParent(null);
  };

  const handleCategoryClick = (cat) => {
    if (showSubcategories && SUBCATEGORIES[cat.id]?.length > 0) {
      setExpandedParent(cat.id);
    } else {
      handleSelect(cat.id);
    }
  };

  return (
    <div className="relative">
      {label && <label className="label">{label}</label>}

      {/* Trigger */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-left transition-colors rounded-lg border border-cream-200 dark:border-dark-border hover:border-cream-400 dark:hover:border-cream-600 bg-white dark:bg-dark-card ${
          compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-sm w-full'
        }`}
      >
        <span className="shrink-0">{currentSub?.icon || currentCat.icon}</span>
        <span className="truncate font-medium">
          {currentSub ? t(`subcategories.${currentSub.id}`) : t(`categories.${currentCat.id}`)}
        </span>
        <ChevronRight size={compact ? 10 : 14} className="ml-auto text-cream-400 shrink-0" />
      </button>

      {/* Picker Panel */}
      {open && (
        <div
          ref={panelRef}
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-xl overflow-hidden"
          style={{ minWidth: '240px', maxHeight: '340px' }}
        >
          {/* Search */}
          <div className="p-2 border-b border-cream-100 dark:border-dark-border">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-cream-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => { setSearch(e.target.value); setExpandedParent(null); }}
                placeholder={t('filter.searchCategories')}
                className="w-full pl-8 pr-8 py-1.5 text-sm bg-cream-50 dark:bg-dark-bg rounded-lg border-0 outline-none focus:ring-1 focus:ring-cream-400 placeholder:text-cream-400"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-cream-400 hover:text-cream-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
            {/* Search results */}
            {lowerSearch ? (
              searchResults.length > 0 ? (
                <div className="p-1">
                  {searchResults.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => item.type === 'subcategory'
                        ? handleSelect(item.parentId, item.id)
                        : handleSelect(item.id)
                      }
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left"
                    >
                      <span>{item.icon}</span>
                      <span className="font-medium">{item.translatedName}</span>
                      {item.type === 'subcategory' && (
                        <span className="text-[10px] text-cream-400 ml-auto">{item.parentName}</span>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center text-sm text-cream-400">{t('common.noResults')}</div>
              )
            ) : expandedParent ? (
              /* Subcategory view */
              <div className="p-1">
                <button
                  type="button"
                  onClick={() => setExpandedParent(null)}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left text-cream-500"
                >
                  <ChevronLeft size={14} />
                  <span>{t('common.back')}</span>
                </button>

                {/* Select parent as-is */}
                <button
                  type="button"
                  onClick={() => handleSelect(expandedParent)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left font-medium ${
                    value === expandedParent && !subcategoryValue ? 'bg-cream-100 dark:bg-dark-border' : ''
                  }`}
                >
                  <span>{getCategoryById(expandedParent).icon}</span>
                  <span>{t(`categories.${expandedParent}`)} ({t('common.general')})</span>
                </button>

                <div className="mx-3 my-1 border-t border-cream-100 dark:border-dark-border" />

                {(SUBCATEGORIES[expandedParent] || []).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleSelect(expandedParent, sub.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left ${
                      subcategoryValue === sub.id ? 'bg-cream-100 dark:bg-dark-border' : ''
                    }`}
                  >
                    <span>{sub.icon}</span>
                    <span>{t(`subcategories.${sub.id}`)}</span>
                  </button>
                ))}
              </div>
            ) : (
              /* Main category list */
              <div className="p-1">
                {/* Recent picks */}
                {recentPicks.length > 0 && (
                  <>
                    <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-cream-400 uppercase tracking-wider">{t('common.recent')}</p>
                    {recentPicks.map((r) => {
                      const cat = getCategoryById(r.categoryId);
                      const sub = r.subcategoryId ? getSubcategoryById(r.subcategoryId) : null;
                      return (
                        <button
                          key={r.key}
                          type="button"
                          onClick={() => handleSelect(r.categoryId, r.subcategoryId)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left"
                        >
                          <span>{sub?.icon || cat.icon}</span>
                          <span>{sub ? t(`subcategories.${sub.id}`) : t(`categories.${cat.id}`)}</span>
                          {sub && <span className="text-[10px] text-cream-400 ml-auto">{t(`categories.${cat.id}`)}</span>}
                        </button>
                      );
                    })}
                    <div className="mx-3 my-1 border-t border-cream-100 dark:border-dark-border" />
                  </>
                )}

                {/* All categories */}
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-cream-400 uppercase tracking-wider">{t('filter.allCategories')}</p>
                {filteredCategories.map((cat) => {
                  const hasSubs = showSubcategories && SUBCATEGORIES[cat.id]?.length > 0;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleCategoryClick(cat)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left ${
                        value === cat.id && !subcategoryValue ? 'bg-cream-100 dark:bg-dark-border' : ''
                      }`}
                    >
                      <span>{cat.icon}</span>
                      <span className="font-medium">{t(`categories.${cat.id}`)}</span>
                      {hasSubs && <ChevronRight size={12} className="ml-auto text-cream-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
