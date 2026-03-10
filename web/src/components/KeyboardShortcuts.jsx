import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { X, Command } from 'lucide-react';

const SHORTCUTS = [
  { key: 'n', label: 'Quick Add', path: '/add?tab=quick' },
  { key: 's', label: 'Scan Receipt', path: '/add?tab=receipt' },
  { key: 'd', label: 'Dashboard', path: '/' },
  { key: 't', label: 'Transactions', path: '/transactions' },
  { key: 'b', label: 'Budgets', path: '/budgets' },
  { key: 'r', label: 'Recurring', path: '/recurring' },
  { key: 'a', label: 'Analytics', path: '/analytics' },
  { key: '/', label: 'Search', path: '/transactions', focus: true },
  { key: '?', label: 'Show shortcuts', action: 'help' },
];

export default function KeyboardShortcuts() {
  const navigate = useNavigate();
  const location = useLocation();
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const handler = (e) => {
      // Don't fire in inputs, textareas, selects, or contenteditable
      const tag = e.target.tagName;
      const editable = e.target.isContentEditable;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) return;

      // Don't fire with ctrl/cmd/alt modifiers (except for ?)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key.toLowerCase();

      if (key === 'escape') {
        if (showHelp) { setShowHelp(false); e.preventDefault(); }
        return;
      }

      // ? to toggle help
      if (e.key === '?' || (e.shiftKey && key === '/')) {
        e.preventDefault();
        setShowHelp((s) => !s);
        return;
      }

      const shortcut = SHORTCUTS.find((s) => s.key === key && s.action !== 'help');
      if (!shortcut) return;

      e.preventDefault();

      if (shortcut.focus && location.pathname === '/transactions') {
        // Focus the search input
        const searchInput = document.querySelector('input[placeholder*="Search"]');
        if (searchInput) searchInput.focus();
      } else {
        navigate(shortcut.path);
        if (shortcut.focus) {
          // Focus search after navigation
          setTimeout(() => {
            const searchInput = document.querySelector('input[placeholder*="Search"]');
            if (searchInput) searchInput.focus();
          }, 100);
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate, location, showHelp]);

  if (!showHelp) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={() => setShowHelp(false)}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white dark:bg-dark-card rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-fadeUp"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Command size={18} className="text-accent-600" />
            <h3 className="text-base font-heading font-bold">Keyboard shortcuts</h3>
          </div>
          <button onClick={() => setShowHelp(false)} className="p-1 rounded-lg hover:bg-cream-100 dark:hover:bg-dark-border text-cream-400">
            <X size={16} />
          </button>
        </div>
        <div className="space-y-1.5">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-1.5">
              <span className="text-sm text-cream-700 dark:text-cream-300">{s.label}</span>
              <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-cream-100 dark:bg-dark-border text-xs font-mono font-semibold rounded-lg border border-cream-200 dark:border-cream-700 text-cream-600 dark:text-cream-400">
                {s.key === '/' ? '/' : s.key === '?' ? '?' : s.key.toUpperCase()}
              </kbd>
            </div>
          ))}
          <div className="flex items-center justify-between py-1.5">
            <span className="text-sm text-cream-700 dark:text-cream-300">Close modal / menu</span>
            <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 bg-cream-100 dark:bg-dark-border text-xs font-mono font-semibold rounded-lg border border-cream-200 dark:border-cream-700 text-cream-600 dark:text-cream-400">
              Esc
            </kbd>
          </div>
        </div>
        <p className="text-[10px] text-cream-400 mt-4 text-center">Press <kbd className="font-mono">?</kbd> anytime to toggle this panel</p>
      </div>
    </div>
  );
}
