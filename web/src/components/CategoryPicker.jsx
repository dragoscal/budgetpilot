import { useState, useEffect, useRef } from 'react';
import { getSubcategoryById, getCategoryById } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import { useCategories } from '../hooks/useCategories';
import { Search, ChevronRight, ChevronLeft, X, Sparkles } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

const RECENT_KEY = 'bp_recentCategories';
const MAX_RECENT = 5;

function getRecentPicks() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecentPick(categoryId, subcategoryId) {
  const key = subcategoryId || categoryId;
  const recent = getRecentPicks().filter((r) => r.key !== key);
  recent.unshift({ key, categoryId, subcategoryId: subcategoryId || null });
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

/** Translate category name — custom categories use .name, built-in use t() */
function catLabel(cat, t) {
  return getCategoryLabel(cat, t);
}

/** Translate subcategory name — custom uses .name, built-in uses t() */
function subLabel(sub, t) {
  if (!sub) return '';
  if (sub.id?.startsWith('custom_')) return sub.name;
  const translated = t(`subcategories.${sub.id}`);
  return translated === `subcategories.${sub.id}` ? sub.name : translated;
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
  const { categories, subcategories } = useCategories();
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

  const filteredCategories = categories.filter((c) => !exclude.includes(c.id));
  const lowerSearch = search.toLowerCase();

  // Filter categories and subcategories by search
  const searchResults = [];
  if (lowerSearch) {
    for (const cat of filteredCategories) {
      const translatedName = catLabel(cat, t);
      if (translatedName.toLowerCase().includes(lowerSearch) || cat.name.toLowerCase().includes(lowerSearch)) {
        searchResults.push({ type: 'category', ...cat, translatedName });
      }
      if (showSubcategories && subcategories[cat.id]) {
        for (const sub of subcategories[cat.id]) {
          const translatedSub = subLabel(sub, t);
          if (translatedSub.toLowerCase().includes(lowerSearch) || sub.name.toLowerCase().includes(lowerSearch)) {
            searchResults.push({ type: 'subcategory', parentId: cat.id, parentIcon: cat.icon, parentName: translatedName, ...sub, translatedName: translatedSub });
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
    if (showSubcategories && subcategories[cat.id]?.length > 0) {
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
          {currentSub ? subLabel(currentSub, t) : catLabel(currentCat, t)}
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
                      {item.isCustom && <Sparkles size={10} className="text-accent-500 shrink-0" />}
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
                  <span>{catLabel(getCategoryById(expandedParent), t)} ({t('common.general')})</span>
                </button>

                <div className="mx-3 my-1 border-t border-cream-100 dark:border-dark-border" />

                {(subcategories[expandedParent] || []).map((sub) => (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => handleSelect(expandedParent, sub.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left ${
                      subcategoryValue === sub.id ? 'bg-cream-100 dark:bg-dark-border' : ''
                    }`}
                  >
                    <span>{sub.icon}</span>
                    <span>{subLabel(sub, t)}</span>
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
                          <span>{sub ? subLabel(sub, t) : catLabel(cat, t)}</span>
                          {sub && <span className="text-[10px] text-cream-400 ml-auto">{catLabel(cat, t)}</span>}
                        </button>
                      );
                    })}
                    <div className="mx-3 my-1 border-t border-cream-100 dark:border-dark-border" />
                  </>
                )}

                {/* All categories */}
                <p className="px-3 pt-2 pb-1 text-[10px] font-bold text-cream-400 uppercase tracking-wider">{t('filter.allCategories')}</p>
                {filteredCategories.map((cat) => {
                  const hasSubs = showSubcategories && subcategories[cat.id]?.length > 0;
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
                      <span className="font-medium">{catLabel(cat, t)}</span>
                      {cat.isCustom && <Sparkles size={10} className="text-accent-500 shrink-0" />}
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
