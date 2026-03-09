import { getCategoryById, formatCurrency, getFrequencyById, calcMonthlyEquivalent, calcAnnualEquivalent } from '../lib/helpers';
import { Edit3, Trash2, Pause, Play } from 'lucide-react';

export default function RecurringRow({ item, onEdit, onDelete, onToggle }) {
  const cat = getCategoryById(item.category);
  const freq = getFrequencyById(item.frequency || 'monthly');
  const billingDay = item.billingDay || 1;
  const today = new Date().getDate();
  const daysUntil = billingDay >= today ? billingDay - today : 30 - today + billingDay;
  const isNear = daysUntil <= 3 && item.active !== false;

  const isMonthly = !item.frequency || item.frequency === 'monthly';
  const monthlyEq = calcMonthlyEquivalent(item.amount, item.frequency || 'monthly');
  const annualEq = calcAnnualEquivalent(item.amount, item.frequency || 'monthly');

  // Format per-period label
  const periodLabel = (() => {
    switch (item.frequency) {
      case 'weekly': return '/wk';
      case 'biweekly': return '/2wk';
      case 'quarterly': return '/qtr';
      case 'semiannual': return '/6mo';
      case 'annual': return '/yr';
      default: return '/mo';
    }
  })();

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-cream-50 dark:hover:bg-dark-border/50 rounded-xl transition-colors group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-cream-100 dark:bg-dark-border shrink-0 ${
        item.active === false ? 'opacity-50' : ''
      }`}>
        {cat.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium truncate ${item.active === false ? 'line-through text-cream-500' : ''}`}>
            {item.name}
          </p>
          {isNear && (
            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[10px] font-medium">
              {daysUntil === 0 ? 'Today' : `In ${daysUntil}d`}
            </span>
          )}
          {!isMonthly && (
            <span className="px-1.5 py-0.5 rounded bg-cream-200 dark:bg-dark-border text-cream-600 dark:text-cream-400 text-[10px] font-medium">
              {freq.label}
            </span>
          )}
        </div>
        <p className="text-xs text-cream-500">
          {cat.name} · Day {billingDay}
          {item.endDate && <span className="ml-1">· ends {item.endDate}</span>}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-heading font-bold money">
          {formatCurrency(item.amount, item.currency)}<span className="text-[10px] text-cream-400 font-normal">{periodLabel}</span>
        </p>
        {!isMonthly ? (
          <p className="text-[10px] text-cream-400">
            ~{formatCurrency(monthlyEq, item.currency)}/mo · {formatCurrency(annualEq, item.currency)}/yr
          </p>
        ) : (
          <p className="text-[10px] text-cream-400">{formatCurrency(annualEq, item.currency)}/yr</p>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {onToggle && (
          <button
            onClick={() => onToggle(item)}
            className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500"
            title={item.active === false ? 'Resume' : 'Pause'}
          >
            {item.active === false ? <Play size={14} /> : <Pause size={14} />}
          </button>
        )}
        {onEdit && (
          <button onClick={() => onEdit(item)} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500">
            <Edit3 size={14} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(item)} className="p-1.5 rounded-lg hover:bg-danger/10 text-cream-500 hover:text-danger">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
