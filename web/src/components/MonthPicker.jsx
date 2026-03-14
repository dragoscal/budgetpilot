import { format, addMonths, subMonths } from 'date-fns';
import { ro, enUS } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

export default function MonthPicker({ value, onChange }) {
  const { t, language } = useTranslation();
  const locale = language === 'ro' ? ro : enUS;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(subMonths(value, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 transition-colors"
        aria-label={t('common.previousMonth')}
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium min-w-[120px] text-center">
        {format(value, 'MMMM yyyy', { locale })}
      </span>
      <button
        onClick={() => onChange(addMonths(value, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 transition-colors"
        aria-label={t('common.nextMonth')}
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
