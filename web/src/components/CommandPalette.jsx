import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import { Search, ArrowRight, Home, PlusCircle, List, Wallet, Target, RotateCcw, Calendar, TrendingUp, BarChart3, PieChart, Settings, Users, Heart, Sparkles, Receipt, FileText, CreditCard, Users2, MessageSquare } from 'lucide-react';

const PAGES = [
  { path: '/', label: 'nav.dashboard', icon: Home, keywords: ['home', 'dashboard', 'panou'] },
  { path: '/add', label: 'nav.addTransaction', icon: PlusCircle, keywords: ['add', 'new', 'adaugă', 'transaction'] },
  { path: '/transactions', label: 'nav.transactions', icon: List, keywords: ['transactions', 'history', 'tranzacții'] },
  { path: '/budgets', label: 'nav.budgets', icon: Wallet, keywords: ['budgets', 'bugete'] },
  { path: '/goals', label: 'nav.goals', icon: Target, keywords: ['goals', 'savings', 'obiective'] },
  { path: '/recurring', label: 'nav.recurring', icon: RotateCcw, keywords: ['recurring', 'subscriptions', 'bills', 'recurente'] },
  { path: '/calendar', label: 'nav.calendar', icon: Calendar, keywords: ['calendar'] },
  { path: '/cashflow', label: 'nav.cashflow', icon: TrendingUp, keywords: ['cashflow', 'forecast', 'flux'] },
  { path: '/networth', label: 'nav.networth', icon: BarChart3, keywords: ['networth', 'accounts', 'avere'] },
  { path: '/analytics', label: 'nav.analytics', icon: PieChart, keywords: ['analytics', 'reports', 'analiză'] },
  { path: '/loans', label: 'nav.loans', icon: CreditCard, keywords: ['loans', 'credit', 'împrumuturi'] },
  { path: '/people', label: 'nav.people', icon: Users, keywords: ['people', 'debts', 'persoane', 'datorii'] },
  { path: '/wishlist', label: 'nav.wishlist', icon: Heart, keywords: ['wishlist', 'dorințe'] },
  { path: '/challenges', label: 'nav.challenges', icon: Sparkles, keywords: ['challenges', 'provocări'] },
  { path: '/receipts', label: 'nav.receipts', icon: Receipt, keywords: ['receipts', 'bonuri'] },
  { path: '/reports', label: 'nav.reports', icon: FileText, keywords: ['reports', 'export', 'rapoarte'] },
  { path: '/review', label: 'nav.monthlyReview', icon: BarChart3, keywords: ['review', 'monthly', 'revizuire'] },
  { path: '/family', label: 'nav.family', icon: Users2, keywords: ['family', 'shared', 'familie'] },
  { path: '/settings', label: 'nav.settings', icon: Settings, keywords: ['settings', 'setări', 'config'] },
  { path: '/feedback', label: 'nav.feedback', icon: MessageSquare, keywords: ['feedback', 'bug', 'suggest'] },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(prev => !prev);
        setQuery('');
        setActiveIndex(0);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const results = useMemo(() => {
    if (!query.trim()) return PAGES;
    const q = query.toLowerCase();
    return PAGES.filter(p => {
      const label = t(p.label).toLowerCase();
      return label.includes(q) || p.keywords.some(k => k.includes(q)) || p.path.includes(q);
    });
  }, [query, t]);

  const handleSelect = (path) => {
    navigate(path);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && results[activeIndex]) {
      handleSelect(results[activeIndex].path);
    }
  };

  if (!open) return null;

  const listboxId = 'command-palette-listbox';

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]" onClick={() => setOpen(false)}>
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('commandPalette.title') || 'Command palette'}
        className="relative w-full max-w-lg mx-4 bg-white dark:bg-dark-card rounded-2xl shadow-2xl border border-cream-200 dark:border-dark-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-cream-200 dark:border-dark-border">
          <Search size={18} className="text-cream-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label={t('commandPalette.placeholder') || 'Search pages'}
            aria-expanded={results.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={results[activeIndex] ? `cmd-option-${results[activeIndex].path}` : undefined}
            className="flex-1 bg-transparent outline-none text-sm text-cream-900 dark:text-cream-100 placeholder:text-cream-400"
            placeholder={t('commandPalette.placeholder') || 'Search pages...'}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-cream-400 bg-cream-100 dark:bg-dark-border rounded">ESC</kbd>
        </div>
        <div id={listboxId} role="listbox" aria-label={t('commandPalette.results') || 'Search results'} className="max-h-[300px] overflow-y-auto py-1">
          {results.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-cream-400" role="status">{t('commandPalette.noResults') || 'No results found'}</div>
          ) : results.map((item, i) => {
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                id={`cmd-option-${item.path}`}
                role="option"
                aria-selected={i === activeIndex}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${i === activeIndex ? 'bg-cream-100 dark:bg-dark-border text-cream-900 dark:text-cream-100' : 'text-cream-600 dark:text-cream-400 hover:bg-cream-50 dark:hover:bg-dark-border/50'}`}
                onClick={() => handleSelect(item.path)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                <Icon size={16} className="shrink-0" aria-hidden="true" />
                <span className="flex-1">{t(item.label)}</span>
                <ArrowRight size={12} className="opacity-30" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2 border-t border-cream-200 dark:border-dark-border flex items-center gap-4 text-[10px] text-cream-400" aria-hidden="true">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
