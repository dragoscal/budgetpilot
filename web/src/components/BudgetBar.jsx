import { getCategoryById, formatCurrency, percentOf } from '../lib/helpers';

export default function BudgetBar({ category, spent, budgeted, currency = 'RON', compact = false }) {
  const cat = getCategoryById(category);
  const pct = percentOf(spent, budgeted);
  const remaining = budgeted - spent;
  const barColor = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-success';

  if (compact) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5">
            <span>{cat.icon}</span>
            <span className="font-medium">{cat.name}</span>
          </span>
          <span className="text-cream-500">{pct}%</span>
        </div>
        <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{cat.icon}</span>
          <div>
            <p className="font-medium text-sm">{cat.name}</p>
            <p className="text-xs text-cream-500">
              {formatCurrency(spent, currency)} / {formatCurrency(budgeted, currency)}
            </p>
          </div>
        </div>
        <span className={`text-sm font-heading font-bold ${pct >= 100 ? 'text-danger' : pct >= 80 ? 'text-warning' : 'text-success'}`}>
          {pct}%
        </span>
      </div>
      <div className="h-2 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <p className="text-xs text-cream-500 mt-2">
        {remaining >= 0
          ? `${formatCurrency(remaining, currency)} remaining`
          : `${formatCurrency(Math.abs(remaining), currency)} over budget`}
      </p>
    </div>
  );
}
