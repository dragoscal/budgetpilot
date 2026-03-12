import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { feedbackApi } from '../lib/api';
import {
  MessageSquare, Bug, Lightbulb, Send, X, Loader2, ChevronRight,
} from 'lucide-react';

export default function FeedbackFAB() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();
  const { t } = useTranslation();
  const location = useLocation();
  const modalRef = useRef(null);
  const inputRef = useRef(null);

  const hidden = location.pathname === '/feedback';

  const TYPES = [
    { id: 'bug', label: t('feedback.bugReport'), icon: Bug, color: 'text-danger', bg: 'bg-danger/10' },
    { id: 'suggestion', label: t('feedback.suggestion'), icon: Lightbulb, color: 'text-warning', bg: 'bg-warning/10' },
    { id: 'other', label: t('feedback.otherLabel'), icon: MessageSquare, color: 'text-info', bg: 'bg-info/10' },
  ];

  // Focus title input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
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
      }
    };
    // Delay to avoid catching the FAB click/touch itself
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

  // Don't show FAB on the dedicated feedback page (after hooks to preserve hook order)
  if (hidden) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(t('feedback.enterTitle'));
      return;
    }

    setSubmitting(true);
    try {
      await feedbackApi.submit({
        type,
        title: title.trim(),
        description: description.trim() || null,
        screenshot: null,
        page: location.pathname,
      });
      toast.success(t('feedback.thankYou'));
      setTitle('');
      setDescription('');
      setType('bug');
      setOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setTitle('');
    setDescription('');
    setType('bug');
  };

  return (
    <>
      {/* FAB Button */}
      <button
        onClick={() => setOpen(true)}
        className={`fixed z-50 bottom-[5.5rem] right-3 md:bottom-6 md:right-6 w-10 h-10 md:w-12 md:h-12 rounded-full bg-accent-600 hover:bg-accent-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center group ${open ? 'scale-0 opacity-0' : 'scale-100 opacity-80 hover:opacity-100'}`}
        aria-label={t('feedback.title')}
        title={t('feedback.title')}
      >
        <MessageSquare size={20} className="group-hover:scale-110 transition-transform" />
      </button>

      {/* Compact Feedback Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end md:items-end justify-end pointer-events-none">
          {/* Backdrop for mobile */}
          <div
            className="fixed inset-0 bg-black/40 pointer-events-auto md:hidden"
            onClick={resetAndClose}
          />
          <div
            ref={modalRef}
            className="pointer-events-auto relative z-10 w-full md:w-96 md:max-w-[calc(100vw-2rem)] mb-0 md:mb-6 md:mr-6 bg-white dark:bg-dark-card rounded-t-2xl md:rounded-2xl shadow-2xl border border-cream-200 dark:border-dark-border animate-slide-up md:animate-fadeUp overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-dark-border">
              <div className="flex items-center gap-2">
                <MessageSquare size={16} className="text-accent-600" />
                <h3 className="text-sm font-semibold text-cream-900 dark:text-cream-100">
                  {t('feedback.title')}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href="/feedback"
                  className="text-[10px] text-accent-600 hover:text-accent-700 flex items-center gap-0.5"
                  onClick={() => setOpen(false)}
                >
                  {t('common.viewAll')}
                  <ChevronRight size={10} />
                </a>
                <button
                  onClick={resetAndClose}
                  className="p-1 rounded-lg hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-cream-400 hover:text-cream-600"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-4 space-y-3">
              {/* Type selector - compact */}
              <div className="flex gap-1.5">
                {TYPES.map((tp) => (
                  <button
                    key={tp.id}
                    type="button"
                    onClick={() => setType(tp.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      type === tp.id
                        ? `${tp.bg} ${tp.color} ring-1 ring-current`
                        : 'text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
                    }`}
                  >
                    <tp.icon size={12} />
                    {tp.label}
                  </button>
                ))}
              </div>

              {/* Title */}
              <input
                ref={inputRef}
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? t('feedback.bugPlaceholder')
                    : type === 'suggestion'
                    ? t('feedback.suggestionPlaceholder')
                    : t('feedback.otherPlaceholder')
                }
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500"
                maxLength={200}
              />

              {/* Description */}
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? t('feedback.bugDetailsPlaceholder')
                    : t('feedback.ideaDetailsPlaceholder')
                }
                rows={3}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg text-sm focus:outline-none focus:ring-2 focus:ring-accent-500/20 focus:border-accent-500 resize-none"
                maxLength={2000}
              />

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="btn-primary w-full flex items-center justify-center gap-2 py-2.5 text-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {t('feedback.submitting')}
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    {t('feedback.submitFeedback')}
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
