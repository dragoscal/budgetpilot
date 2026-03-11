import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { getSetting } from '../../lib/storage';
import { settings as settingsApi } from '../../lib/api';
import { CATEGORIES } from '../../lib/constants';
import { getCategoryById } from '../../lib/helpers';
import { ChevronRight, ChevronLeft, Save } from 'lucide-react';

export default function StepMapCategories({ extractedData, categoryMappings, setCategoryMappings, aiSuggestions, onNext, onBack }) {
  const { t } = useTranslation();
  const [saveMappings, setSaveMappings] = useState(true);
  const [mappingSources, setMappingSources] = useState({}); // track origin: 'saved' | 'ai' | 'manual'

  // Get unique categories from extracted data
  const uniqueCategories = useMemo(() => {
    const cats = new Set();
    extractedData.forEach((row) => cats.add(row.originalCategory.toLowerCase()));
    return [...cats].sort();
  }, [extractedData]);

  // Load saved mappings on mount
  useEffect(() => {
    (async () => {
      const saved = await getSetting('spreadsheetCategoryMappings');
      if (saved && typeof saved === 'object') {
        const newMappings = { ...categoryMappings };
        const newSources = {};

        for (const cat of uniqueCategories) {
          const key = cat.toLowerCase();
          if (saved[key]) {
            newMappings[key] = saved[key];
            newSources[key] = 'saved';
          } else if (aiSuggestions[key]) {
            newMappings[key] = aiSuggestions[key];
            newSources[key] = 'ai';
          } else if (!newMappings[key]) {
            newMappings[key] = 'other';
            newSources[key] = 'ai';
          }
        }
        setCategoryMappings(newMappings);
        setMappingSources(newSources);
      } else {
        // No saved mappings — use AI suggestions
        const newSources = {};
        for (const cat of uniqueCategories) {
          newSources[cat.toLowerCase()] = aiSuggestions[cat.toLowerCase()] ? 'ai' : 'manual';
        }
        setMappingSources(newSources);
      }
    })();
  }, []);

  const handleChange = (originalCat, appCat) => {
    setCategoryMappings((prev) => ({ ...prev, [originalCat.toLowerCase()]: appCat }));
    setMappingSources((prev) => ({ ...prev, [originalCat.toLowerCase()]: 'manual' }));
  };

  const handleNext = async () => {
    if (saveMappings) {
      try {
        await settingsApi.set('spreadsheetCategoryMappings', categoryMappings);
      } catch (err) {
        console.warn('Failed to save category mappings:', err);
      }
    }
    onNext();
  };

  // Count items per category
  const categoryCounts = useMemo(() => {
    const counts = {};
    extractedData.forEach((row) => {
      const key = row.originalCategory.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, [extractedData]);

  const expenseCategories = CATEGORIES.filter((c) => c.id !== 'income' && c.id !== 'transfer');

  return (
    <div className="space-y-5">
      <div>
        <h3 className="section-title">{t('import.mapCategories')}</h3>
        <p className="text-xs text-cream-500">{t('import.mapCategoriesHint')}</p>
      </div>

      {/* Mapping table */}
      <div className="space-y-2">
        {uniqueCategories.map((cat) => {
          const key = cat.toLowerCase();
          const mapped = categoryMappings[key] || 'other';
          const source = mappingSources[key];
          const catObj = getCategoryById(mapped);
          const count = categoryCounts[key] || 0;

          return (
            <div key={cat} className="flex items-center gap-3 p-2.5 rounded-xl bg-cream-50 dark:bg-dark-card border border-cream-200 dark:border-dark-border">
              {/* Original name */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate capitalize">{cat}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-cream-400">{count}x</span>
                  {source === 'saved' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">{t('import.savedMapping')}</span>
                  )}
                  {source === 'ai' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent-600 dark:text-accent-400 font-medium">{t('import.aiSuggested')}</span>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <span className="text-cream-300 text-lg">→</span>

              {/* App category picker */}
              <div className="w-44">
                <select
                  className="input text-sm py-1.5"
                  value={mapped}
                  onChange={(e) => handleChange(cat, e.target.value)}
                >
                  {expenseCategories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {t(`categories.${c.id}`)}</option>
                  ))}
                  <option value="income">💰 {t('categories.income')}</option>
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Save checkbox */}
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          checked={saveMappings}
          onChange={(e) => setSaveMappings(e.target.checked)}
          className="w-4 h-4 rounded border-cream-300 accent-accent-600"
        />
        <Save size={14} className="text-cream-400" />
        {t('import.saveMappings')}
      </label>

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1">
          <ChevronLeft size={16} /> {t('common.back')}
        </button>
        <button onClick={handleNext} className="btn-primary flex items-center gap-2">
          {t('common.next')} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
