import { getCategoryById, formatCurrency, percentOf } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import { useHideAmounts } from '../contexts/SettingsContext';
import { useTranslation } from '../contexts/LanguageContext';

export default function BudgetBar({ category, spent, budgeted, currency = 'RON', compact = false, hide: hideProp }) {
  const { t } = useTranslation();
  const { shouldHide } = useHideAmounts();
  const hide = hideProp !== undefined ? hideProp : shouldHide('expense');
  const cat = getCategoryById(category);
  const pct = percentOf(spent, budgeted);
  const remaining = budgeted - spent;
  const barColor = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-accent-600 dark:bg-accent-500';
  const barWidth = `${Math.min(pct, 100)}%`;

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <span>{cat.icon}</span>
            <span className="font-medium">{getCategoryLabel(cat, t)}</span>
          </span>
          <span className={`font-body font-bold ${pct >= 100 ? 'text-danger' : pct >= 80 ? 'text-warning' : 'text-cream-500'}`}>{pct}%</span>
        </div>
        <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: barWidth }} />
        </div>
      </div>
    );
  }

  return (
    <div className={`card ${pct >= 100 ? 'border-danger/30' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
            style={{ backgroundColor: cat.color ? `${cat.color}12` : undefined }}
          >
            {cat.icon}
          </div>
          <div>
            <p className="font-medium text-sm">{getCategoryLabel(cat, t)}</p>
            <p className="text-xs text-cream-500">
              {formatCurrency(spent, currency, { hide })} / {formatCurrency(budgeted, currency, { hide })}
            </p>
          </div>
        </div>
        <span className={`text-sm stat-value px-2 py-0.5 rounded-md ${
          pct >= 100 ? 'bg-danger-light text-danger' : pct >= 80 ? 'bg-warning-light text-warning' : 'bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400'
        }`}>
          {pct}%
        </span>
      </div>
      <div className="h-1 bg-cream-200 dark:bg-cream-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-300`} style={{ width: barWidth }} />
      </div>
      <p className="text-xs text-cream-500 mt-2">
        {remaining >= 0
          ? t('budgets.remainingAmount', { amount: formatCurrency(remaining, currency, { hide }) })
          : t('budgets.overAmount', { amount: formatCurrency(Math.abs(remaining), currency, { hide }) })}
      </p>
    </div>
  );
}
