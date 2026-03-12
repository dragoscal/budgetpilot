import { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

export default function Modal({ open, onClose, title, children, wide = false }) {
  const overlayRef = useRef(null);
  const dialogRef = useRef(null);
  const titleId = useId();

  // Escape key + body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      const handler = (e) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', handler);
      return () => {
        document.body.style.overflow = '';
        window.removeEventListener('keydown', handler);
      };
    }
  }, [open, onClose]);

  // Focus trap — keep Tab cycling within the modal
  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

    const handleTab = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = [...dialog.querySelectorAll(focusableSelector)];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    dialog.addEventListener('keydown', handleTab);
    // Auto-focus first focusable element
    const first = dialog.querySelector(focusableSelector);
    if (first) first.focus();

    return () => dialog.removeEventListener('keydown', handleTab);
  }, [open]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeUp"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[85vh] flex flex-col`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-cream-200 dark:border-dark-border shrink-0">
          <h3 id={titleId} className="font-heading font-semibold text-lg">{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="p-1 rounded-lg text-cream-500 hover:bg-cream-200 dark:hover:bg-dark-border transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-4 overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
