import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import { useTheme } from '../contexts/ThemeContext';
import { Search, ArrowRight, Home, PlusCircle, List, Wallet, Target, RotateCcw, Calendar, TrendingUp, BarChart3, PieChart, Settings, Users, Heart, Sparkles, Receipt, FileText, CreditCard, Users2, MessageSquare, Zap, Camera, Upload, Moon, Download, HelpCircle } from 'lucide-react';

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
  { path: '/family', label: 'nav.household', icon: Users2, keywords: ['family', 'shared', 'familie', 'household', 'comun', 'cheltuieli comune', 'gospodărie'] },
  { path: '/settings', label: 'nav.settings', icon: Settings, keywords: ['settings', 'setări', 'config'] },
  { path: '/feedback', label: 'nav.feedback', icon: MessageSquare, keywords: ['feedback', 'bug', 'suggest'] },
  { path: '/guide', label: 'nav.guide', icon: HelpCircle, keywords: ['help', 'guide', 'ghid', 'ajutor', 'faq', 'tips', 'sfaturi', 'how', 'cum'] },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toggleTheme } = useTheme();

  const ACTIONS = useMemo(() => [
    { id: 'quick-add', label: t('commandPalette.quickAdd'), icon: Zap, keywords: ['quick', 'add', 'expense', 'fast', 'cheltuiala'], action: () => navigate('/add?tab=nlp') },
    { id: 'scan-receipt', label: t('commandPalette.scanReceipt'), icon: Camera, keywords: ['scan', 'receipt', 'photo', 'bon', 'scanare'], action: () => navigate('/add?tab=receipt') },
    { id: 'import-csv', label: t('commandPalette.importCsv'), icon: Upload, keywords: ['import', 'csv', 'bank', 'statement'], action: () => navigate('/add?tab=import') },
    { id: 'toggle-dark', label: t('commandPalette.toggleDark'), icon: Moon, keywords: ['dark', 'light', 'theme', 'tema', 'mod'], action: () => toggleTheme() },
    { id: 'export-data', label: t('commandPalette.exportData'), icon: Download, keywords: ['export', 'backup', 'download', 'salvare'], action: () => navigate('/settings') },
  ], [t, navigate, toggleTheme]);

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

  // Build combined results with section markers
  const { flatItems, pageCount, actionCount } = useMemo(() => {
    const q = query.toLowerCase().trim();

    const filteredPages = q
      ? PAGES.filter(p => {
          const label = t(p.label).toLowerCase();
          return label.includes(q) || p.keywords.some(k => k.includes(q)) || p.path.includes(q);
        })
      : PAGES;

    const filteredActions = q
      ? ACTIONS.filter(a => {
          const label = a.label.toLowerCase();
          return label.includes(q) || a.keywords.some(k => k.includes(q));
        })
      : ACTIONS;

    // Build flat list: actions first, then pages
    const items = [];
    filteredActions.forEach((a) => items.push({ type: 'action', ...a }));
    filteredPages.forEach((p) => items.push({ type: 'page', ...p }));

    return { flatItems: items, pageCount: filteredPages.length, actionCount: filteredActions.length };
  }, [query, t, ACTIONS]);

  const handleSelect = (item) => {
    if (item.type === 'action' && item.action) {
      item.action();
    } else if (item.path) {
      navigate(item.path);
    }
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && flatItems[activeIndex]) {
      handleSelect(flatItems[activeIndex]);
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
        className="relative w-full max-w-lg mx-4 bg-white dark:bg-dark-card rounded-lg shadow-lg border border-cream-200 dark:border-dark-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-cream-200 dark:border-dark-border">
          <Search size={18} className="text-cream-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label={t('commandPalette.placeholder') || 'Search pages'}
            aria-expanded={flatItems.length > 0}
            aria-controls={listboxId}
            aria-activedescendant={flatItems[activeIndex] ? `cmd-option-${flatItems[activeIndex].id || flatItems[activeIndex].path}` : undefined}
            className="flex-1 bg-transparent outline-none text-sm text-cream-900 dark:text-cream-100 placeholder:text-cream-400"
            placeholder={t('commandPalette.placeholder') || 'Search pages...'}
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-cream-400 bg-cream-100 dark:bg-dark-border rounded">ESC</kbd>
        </div>
        <div id={listboxId} role="listbox" aria-label={t('commandPalette.results') || 'Search results'} className="max-h-[300px] overflow-y-auto py-1">
          {flatItems.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-cream-400" role="status">{t('commandPalette.noResults') || 'No results found'}</div>
          ) : (
            <>
              {/* Actions section */}
              {actionCount > 0 && (
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cream-400">{t('commandPalette.actions')}</span>
                </div>
              )}
              {flatItems.slice(0, actionCount).map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    id={`cmd-option-${item.id}`}
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${i === activeIndex ? 'bg-cream-100 dark:bg-dark-border text-cream-900 dark:text-cream-100' : 'text-cream-600 dark:text-cream-400 hover:bg-cream-50 dark:hover:bg-dark-border/50'}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(i)}
                  >
                    <Icon size={16} className="shrink-0 text-accent" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    <Zap size={10} className="opacity-30" aria-hidden="true" />
                  </button>
                );
              })}
              {/* Pages section */}
              {pageCount > 0 && (
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cream-400">{t('commandPalette.pages')}</span>
                </div>
              )}
              {flatItems.slice(actionCount).map((item, idx) => {
                const Icon = item.icon;
                const globalIdx = actionCount + idx;
                return (
                  <button
                    key={item.path}
                    id={`cmd-option-${item.path}`}
                    role="option"
                    aria-selected={globalIdx === activeIndex}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${globalIdx === activeIndex ? 'bg-cream-100 dark:bg-dark-border text-cream-900 dark:text-cream-100' : 'text-cream-600 dark:text-cream-400 hover:bg-cream-50 dark:hover:bg-dark-border/50'}`}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(globalIdx)}
                  >
                    <Icon size={16} className="shrink-0" aria-hidden="true" />
                    <span className="flex-1">{t(item.label)}</span>
                    <ArrowRight size={12} className="opacity-30" aria-hidden="true" />
                  </button>
                );
              })}
            </>
          )}
        </div>
        <div className="px-4 py-2 border-t border-cream-200 dark:border-dark-border flex items-center gap-4 text-[10px] text-cream-400" aria-hidden="true">
          <span>&uarr;&darr; navigate</span>
          <span>&crarr; open</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
