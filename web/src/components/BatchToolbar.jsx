import { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { useCategories } from '../hooks/useCategories';
import { getCategoryLabel } from '../lib/categoryManager';
import { Tag, Calendar, Hash, Download, Trash2, X, Plus, Minus } from 'lucide-react';

export default function BatchToolbar({
  selectedCount,
  onClearSelection,
  onBatchCategory,
  onBatchDate,
  onBatchTagAdd,
  onBatchTagRemove,
  onBatchExport,
  onBulkDelete,
}) {
  const { t } = useTranslation();
  const { categories } = useCategories();
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagMode, setTagMode] = useState('add'); // 'add' | 'remove'
  const [tagValue, setTagValue] = useState('');
  const [dateValue, setDateValue] = useState('');

  const toolbarRef = useRef(null);

  // Close popovers when clicking outside the toolbar
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target)) {
        closeAll();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (selectedCount === 0) return null;

  const handleTagSubmit = (e) => {
    e.preventDefault();
    const tag = tagValue.trim().toLowerCase();
    if (!tag) return;
    if (tagMode === 'add') {
      onBatchTagAdd?.(tag);
    } else {
      onBatchTagRemove?.(tag);
    }
    setTagValue('');
    setShowTagInput(false);
  };

  const handleDateSubmit = (e) => {
    e.preventDefault();
    if (!dateValue) return;
    onBatchDate?.(dateValue);
    setDateValue('');
    setShowDatePicker(false);
  };

  const closeAll = () => {
    setShowCategoryPicker(false);
    setShowDatePicker(false);
    setShowTagInput(false);
  };

  return (
    <div ref={toolbarRef} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
      <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-cream-900/95 dark:bg-cream-100/95 text-white dark:text-cream-900 shadow-2xl backdrop-blur-sm border border-cream-700/30 dark:border-cream-300/30">
        {/* Selection count */}
        <span className="text-sm font-medium whitespace-nowrap">
          {t('batch.selectedCount', { count: selectedCount })}
        </span>

        <div className="w-px h-6 bg-white/20 dark:bg-cream-900/20" />

        {/* Category */}
        <div className="relative">
          <button
            onClick={() => { closeAll(); setShowCategoryPicker(!showCategoryPicker); }}
            className="p-2 rounded-lg hover:bg-white/10 dark:hover:bg-cream-900/10 transition-colors"
            title={t('batch.changeCategory')}
          >
            <Tag size={16} />
          </button>
          {showCategoryPicker && (
            <div className="absolute bottom-full mb-2 left-0 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-xl overflow-hidden z-50" style={{ minWidth: '220px', maxHeight: '320px' }}>
              <div className="p-2 border-b border-cream-100 dark:border-dark-border">
                <p className="text-xs font-medium text-cream-600 dark:text-cream-400">{t('batch.changeCategory')}</p>
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: '280px' }}>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => { onBatchCategory?.(cat.id); setShowCategoryPicker(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-cream-900 dark:text-cream-100 hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left"
                  >
                    <span>{cat.icon}</span>
                    <span>{getCategoryLabel(cat, t)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Date */}
        <div className="relative">
          <button
            onClick={() => { closeAll(); setShowDatePicker(!showDatePicker); }}
            className="p-2 rounded-lg hover:bg-white/10 dark:hover:bg-cream-900/10 transition-colors"
            title={t('batch.changeDate')}
          >
            <Calendar size={16} />
          </button>
          {showDatePicker && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-xl p-3 z-50">
              <p className="text-xs font-medium text-cream-600 dark:text-cream-400 mb-2">{t('batch.changeDate')}</p>
              <form onSubmit={handleDateSubmit} className="flex items-center gap-2">
                <input
                  type="date"
                  value={dateValue}
                  onChange={(e) => setDateValue(e.target.value)}
                  className="input text-xs py-1.5"
                  autoFocus
                />
                <button type="submit" className="btn-primary text-xs py-1.5 px-3">{t('common.save')}</button>
              </form>
            </div>
          )}
        </div>

        {/* Tags */}
        <div className="relative">
          <button
            onClick={() => { closeAll(); setShowTagInput(!showTagInput); }}
            className="p-2 rounded-lg hover:bg-white/10 dark:hover:bg-cream-900/10 transition-colors"
            title={t('batch.manageTags')}
          >
            <Hash size={16} />
          </button>
          {showTagInput && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-xl p-3 z-50" style={{ minWidth: '240px' }}>
              <p className="text-xs font-medium text-cream-600 dark:text-cream-400 mb-2">{t('batch.manageTags')}</p>
              <div className="flex gap-1 mb-2">
                <button
                  type="button"
                  onClick={() => setTagMode('add')}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    tagMode === 'add' ? 'bg-success/10 text-success' : 'text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
                  }`}
                >
                  <Plus size={12} /> {t('batch.addTag')}
                </button>
                <button
                  type="button"
                  onClick={() => setTagMode('remove')}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                    tagMode === 'remove' ? 'bg-danger/10 text-danger' : 'text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
                  }`}
                >
                  <Minus size={12} /> {t('batch.removeTag')}
                </button>
              </div>
              <form onSubmit={handleTagSubmit} className="flex items-center gap-2">
                <input
                  type="text"
                  value={tagValue}
                  onChange={(e) => setTagValue(e.target.value)}
                  placeholder={t('batch.tagPlaceholder')}
                  className="input text-xs py-1.5 flex-1"
                  autoFocus
                />
                <button type="submit" className="btn-primary text-xs py-1.5 px-3">
                  {tagMode === 'add' ? t('common.add') : t('batch.remove')}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Export */}
        <button
          onClick={() => { closeAll(); onBatchExport?.(); }}
          className="p-2 rounded-lg hover:bg-white/10 dark:hover:bg-cream-900/10 transition-colors"
          title={t('batch.exportSelected')}
        >
          <Download size={16} />
        </button>

        <div className="w-px h-6 bg-white/20 dark:bg-cream-900/20" />

        {/* Delete */}
        <button
          onClick={() => { closeAll(); onBulkDelete?.(); }}
          className="p-2 rounded-lg hover:bg-danger/20 text-danger transition-colors"
          title={t('batch.deleteSelected')}
        >
          <Trash2 size={16} />
        </button>

        {/* Clear selection */}
        <button
          onClick={onClearSelection}
          className="p-2 rounded-lg hover:bg-white/10 dark:hover:bg-cream-900/10 transition-colors"
          title={t('batch.clearSelection')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
