import { format, addMonths, subMonths } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function MonthPicker({ value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(subMonths(value, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 transition-colors"
      >
        <ChevronLeft size={18} />
      </button>
      <span className="text-sm font-medium min-w-[120px] text-center">
        {format(value, 'MMMM yyyy')}
      </span>
      <button
        onClick={() => onChange(addMonths(value, 1))}
        className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 transition-colors"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
