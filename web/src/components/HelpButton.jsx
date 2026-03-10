import { useState, useRef, useEffect } from 'react';
import { HelpCircle, X, ChevronRight, Lightbulb } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';

// Tips config: each page has 3 tips
const PAGE_TIPS = {
  dashboard: { tips: 3, guide: 'dashboard' },
  transactions: { tips: 3, guide: 'transactions' },
  budgets: { tips: 3, guide: 'budgets' },
  goals: { tips: 3, guide: 'goals' },
  recurring: { tips: 3, guide: 'recurring' },
  loans: { tips: 3, guide: 'loans' },
  calendar: { tips: 3, guide: 'calendar' },
  cashflow: { tips: 3, guide: 'cashflow' },
  networth: { tips: 3, guide: 'networth' },
  analytics: { tips: 3, guide: 'analytics' },
  reports: { tips: 3, guide: 'reports' },
  family: { tips: 3, guide: 'family' },
  people: { tips: 3, guide: 'family' },
  wishlist: { tips: 3, guide: 'goals' },
  challenges: { tips: 3, guide: 'goals' },
  receipts: { tips: 3, guide: 'transactions' },
  review: { tips: 3, guide: 'analytics' },
  settings: { tips: 3, guide: 'start' },
};

export default function HelpButton({ section, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { t } = useTranslation();

  const config = PAGE_TIPS[section] || { tips: 3, guide: section };

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const tips = [];
  for (let i = 1; i <= config.tips; i++) {
    const tip = t(`tips.${section}.${i}`);
    if (tip && !tip.startsWith('tips.')) tips.push(tip);
  }

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
          open
            ? 'bg-accent-100 dark:bg-accent-500/20 text-accent-600 dark:text-accent-400'
            : 'bg-cream-100 dark:bg-dark-border text-cream-400 hover:text-accent-600 dark:hover:text-accent-400'
        }`}
        aria-label={t('nav.guide')}
        aria-expanded={open}
      >
        <HelpCircle size={14} />
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-72 sm:w-80 bg-white dark:bg-dark-card rounded-xl shadow-2xl border border-cream-200 dark:border-dark-border z-50 animate-fadeUp overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-cream-100 dark:border-dark-border bg-cream-50 dark:bg-dark-bg/50">
            <div className="flex items-center gap-1.5">
              <Lightbulb size={13} className="text-warning" />
              <span className="text-xs font-semibold text-cream-700 dark:text-cream-200">
                {t('tips.title')}
              </span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 rounded hover:bg-cream-200 dark:hover:bg-dark-border transition-colors"
            >
              <X size={12} className="text-cream-400" />
            </button>
          </div>

          {/* Tips list */}
          <div className="px-3 py-2 space-y-2">
            {tips.map((tip, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="mt-0.5 w-4 h-4 rounded-full bg-accent-50 dark:bg-accent-500/15 text-accent-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                  {i + 1}
                </span>
                <p className="text-[11px] text-cream-600 dark:text-cream-400 leading-relaxed">
                  {tip}
                </p>
              </div>
            ))}
          </div>

          {/* Footer link */}
          <div className="px-3 py-2 border-t border-cream-100 dark:border-dark-border">
            <Link
              to={`/guide#${config.guide}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-[10px] font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
            >
              {t('tips.seeFullGuide')}
              <ChevronRight size={10} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
