import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info, Undo2 } from 'lucide-react';

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
  undo: Undo2,
};

const COLORS = {
  success: 'bg-success/10 text-success border-success/20',
  error: 'bg-danger/10 text-danger border-danger/20',
  warning: 'bg-warning/10 text-warning border-warning/20',
  info: 'bg-info/10 text-info border-info/20',
  undo: 'bg-cream-900/90 text-white border-cream-700/30 dark:bg-cream-100/90 dark:text-cream-900 dark:border-cream-300/30',
};

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();
  const { t } = useTranslation();

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((item) => {
        const Icon = ICONS[item.type] || Info;
        return (
          <div
            key={item.id}
            className={`animate-slideIn flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-sm ${COLORS[item.type] || COLORS.info}`}
          >
            <Icon size={18} className="mt-0.5 shrink-0" />
            <p className="text-sm flex-1">{item.message}</p>
            {item.type === 'undo' && item.onUndo && (
              <button
                onClick={() => { item.onUndo(); removeToast(item.id); }}
                className="shrink-0 px-2.5 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-xs font-bold uppercase tracking-wider transition-colors"
              >
                {t('common.undo')}
              </button>
            )}
            <button onClick={() => removeToast(item.id)} className="shrink-0 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
