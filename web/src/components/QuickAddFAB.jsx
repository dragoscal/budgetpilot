import { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import { Zap, X, ArrowRight, Loader2 } from 'lucide-react';

const HIDDEN_PATHS = ['/add', '/login', '/register', '/onboarding'];

export default function QuickAddFAB() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const modalRef = useRef(null);
  const inputRef = useRef(null);

  const hidden = HIDDEN_PATHS.includes(location.pathname);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && open) {
        setOpen(false);
        setText('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  // Close on click/touch outside
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setOpen(false);
        setText('');
      }
    };
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handler);
      document.addEventListener('touchstart', handler, { passive: true });
    }, 50);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  // Don't show on certain pages (after all hooks to preserve hook order)
  if (hidden) return null;

  const handleSubmit = () => {
    if (!text.trim()) return;
    setLoading(true);
    // Navigate to /add with the text pre-filled — reuses existing AddTransaction NLP flow
    navigate('/add?tab=quick&text=' + encodeURIComponent(text.trim()));
    setOpen(false);
    setText('');
    setLoading(false);
  };

  const examples = ['12.50 Uber taxi', 'Netflix 15', '25 eur coffee'];

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed z-50 bottom-[5.5rem] right-14 md:bottom-6 md:right-20 w-10 h-10 md:w-12 md:h-12 rounded-full bg-success hover:bg-success/90 text-white shadow-lg transition-all duration-200 flex items-center justify-center group ${open ? 'scale-0 opacity-0' : 'scale-100 opacity-80 hover:opacity-100'}`}
        aria-label={t('quickAdd.fabTooltip')}
        title={t('quickAdd.fabTooltip')}
      >
        <Zap size={20} className="group-hover:scale-110 transition-transform" />
      </button>

      {/* Compact Quick-Add Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-end justify-end pointer-events-none">
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 bg-black/40 pointer-events-auto md:hidden"
            onClick={() => { setOpen(false); setText(''); }}
          />
          <div
            ref={modalRef}
            className="pointer-events-auto relative z-10 w-full md:w-96 md:max-w-[calc(100vw-2rem)] mb-0 md:mb-6 md:mr-6 bg-white dark:bg-dark-card rounded-t-2xl md:rounded-lg shadow-lg border border-cream-200 dark:border-dark-border animate-slide-up md:animate-fadeUp overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-dark-border">
              <div className="flex items-center gap-2">
                <Zap size={16} className="text-success" />
                <h3 className="text-sm font-semibold text-cream-900 dark:text-cream-100">
                  {t('quickAdd.fabTitle')}
                </h3>
              </div>
              <button
                onClick={() => { setOpen(false); setText(''); }}
                className="p-1 rounded-lg hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-cream-400 hover:text-cream-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* Input */}
            <div className="p-4 space-y-3">
              <div className="relative flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
                  placeholder={t('quickAdd.inputPlaceholder')}
                  className="flex-1 px-3 py-2.5 rounded-xl border border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg text-sm focus:outline-none focus:ring-2 focus:ring-success/20 focus:border-success"
                  disabled={loading}
                />
                <button
                  onClick={handleSubmit}
                  disabled={loading || !text.trim()}
                  className="px-4 py-2.5 rounded-xl bg-success hover:bg-success/90 text-white text-sm font-medium disabled:opacity-30 transition-colors flex items-center gap-1.5"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
                </button>
              </div>

              {/* Quick examples */}
              <div className="flex flex-wrap gap-1.5">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => { setText(ex); }}
                    className="px-2.5 py-1 rounded-full text-[11px] border border-cream-200 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>

              <p className="text-[10px] text-cream-400 text-center">
                {t('quickAdd.fabHint')}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
