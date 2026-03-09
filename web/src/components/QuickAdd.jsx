import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { processNaturalLanguage } from '../lib/ai';

const EXAMPLES = [
  '45 lei Bolt taxi',
  'netflix 55 lei',
  'salary 8000 lei',
  '150 lei dinner with friends',
  'rent 2000 lei',
  '25 eur coffee shop',
];

export default function QuickAdd({ onResult, onError }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (input) => {
    const value = input || text;
    if (!value.trim()) return;

    setLoading(true);
    try {
      const results = await processNaturalLanguage(value.trim());
      onResult?.(results.map((t) => ({ ...t, source: 'nlp' })));
      setText('');
    } catch (err) {
      onError?.(err.message || 'Failed to parse input');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type="text"
          className="input pr-12"
          placeholder="Type an expense... e.g. '45 lei Bolt taxi'"
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
