import { useState, useRef } from 'react';
import { ArrowRight, Loader2, Calendar } from 'lucide-react';
import { processNaturalLanguage } from '../lib/ai';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { todayLocal } from '../lib/helpers';

const EXAMPLES = [
  '12.50 Uber taxi',
  'Netflix 15',
  'salary 3000',
  '35 dinner #friends',
  'Maria 20 coffee',
  'debt Alex 50 pizza',
];

export default function QuickAdd({ onResult, onError, initialValue = '' }) {
  const { effectiveUserId } = useAuth();
  const { t } = useTranslation();
  const [text, setText] = useState(initialValue);
  const [loading, setLoading] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const dateRef = useRef(null);

  const handleSubmit = async (input) => {
    const value = input || text;
    if (!value.trim()) return;

    if (!navigator.onLine) {
      onError?.(t('quickAdd.offlineWarning') || 'Quick add requires an internet connection for AI parsing.');
      return;
    }

    setLoading(true);
    try {
      const results = await processNaturalLanguage(value.trim(), { userId: effectiveUserId });
      const dateOverride = customDate || todayLocal();
      onResult?.(results.map((r) => ({ ...r, date: dateOverride, source: 'nlp', visibility: null })));
      setText('');
      setCustomDate('');
    } catch (err) {
      onError?.(err.message || t('quickAdd.failedParse'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            className="input pr-12"
            placeholder={t('quickAdd.inputPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            disabled={loading}
          />
          <button
            onClick={() => handleSubmit()}
            disabled={loading || !text.trim()}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-cream-900 text-white hover:bg-cream-800 disabled:opacity-30 transition-colors dark:bg-cream-100 dark:text-cream-900"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
          </button>
        </div>
        <button
          type="button"
          onClick={() => dateRef.current?.showPicker?.() || dateRef.current?.focus()}
          className={`shrink-0 p-2.5 rounded-xl border transition-colors ${customDate ? 'border-accent bg-accent/10 text-accent' : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-200 dark:hover:bg-dark-border'}`}
          title={customDate || t('quickAdd.pickDate')}
        >
          <Calendar size={18} />
        </button>
        <input
          ref={dateRef}
          type="date"
          value={customDate}
          max={todayLocal()}
          onChange={(e) => setCustomDate(e.target.value)}
          className="sr-only"
          tabIndex={-1}
        />
      </div>
      {customDate && (
        <div className="flex items-center gap-2 text-xs text-accent">
          <Calendar size={12} />
          <span>{t('quickAdd.dateLabel').replace('{date}', new Date(customDate + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))}</span>
          <button onClick={() => setCustomDate('')} className="text-cream-500 hover:text-cream-700 underline">{t('quickAdd.clear')}</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => { setText(ex); handleSubmit(ex); }}
            disabled={loading}
            className="px-3 py-1 rounded-full text-xs border border-cream-300 dark:border-dark-border text-cream-600 dark:text-cream-500 hover:bg-cream-200 dark:hover:bg-dark-border transition-colors disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
