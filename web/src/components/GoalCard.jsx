import { formatCurrency, percentOf } from '../lib/helpers';
import { useHideAmounts } from '../contexts/SettingsContext';
import { useTranslation } from '../contexts/LanguageContext';
import { differenceInMonths, differenceInDays, parseISO } from 'date-fns';
import { Target, CreditCard, Edit3, Trash2, Check } from 'lucide-react';

export default function GoalCard({ goal, onEdit, onDelete, onAddFunds, hide: hideProp }) {
  const { shouldHide } = useHideAmounts();
  const { t } = useTranslation();
  const hide = hideProp !== undefined ? hideProp : shouldHide('expense');
  const pct = percentOf(goal.currentAmount || 0, goal.targetAmount);
  const isSaveUp = goal.type === 'save_up';
  const remaining = goal.targetAmount - (goal.currentAmount || 0);

  // Calculate monthly needed and progress status
  let monthlyNeeded = 0;
  let status = 'on-track';
  if (goal.targetDate) {
    const targetDate = parseISO(goal.targetDate);
    const startDate = parseISO(goal.startDate || goal.createdAt || goal.targetDate);
    const monthsLeft = differenceInMonths(targetDate, new Date());
    const totalMonths = Math.max(1, differenceInMonths(targetDate, startDate));
    const elapsedMonths = differenceInMonths(new Date(), startDate);

    if (monthsLeft > 0) {
      monthlyNeeded = remaining / monthsLeft;
      // Expected progress based on time elapsed proportion
      const expectedPct = totalMonths > 0 ? Math.round((elapsedMonths / totalMonths) * 100) : 100;
      if (pct < expectedPct - 5) status = 'behind';
      else if (pct > expectedPct + 5) status = 'ahead';
    } else if (remaining > 0) {
      status = 'behind';
    }
  }

  // Countdown
  let countdown = null;
  if (goal.targetDate && remaining > 0) {
    const targetDate = parseISO(goal.targetDate);
    const dLeft = differenceInDays(targetDate, new Date());
    if (dLeft > 0) {
      countdown = dLeft < 60
        ? t('goals.daysLeft', { count: dLeft })
        : t('goals.monthsLeft', { count: differenceInMonths(targetDate, new Date()) });
    } else {
      countdown = t('goals.overdue');
    }
  }

  // Milestones at 25%, 50%, 75%
  const milestones = [25, 50, 75];

  const statusColors = {
    'on-track': 'text-success bg-success/10',
    behind: 'text-danger bg-danger/10',
    ahead: 'text-info bg-info/10',
  };

  return (
    <div className="card group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: (goal.color || '#4F46E5') + '15' }}>
            {goal.icon || (isSaveUp ? '🎯' : '💳')}
          </div>
          <div>
            <p className="font-medium text-sm">{goal.name}</p>
            <p className="text-xs text-cream-500">{isSaveUp ? t('goals.saveUp') : t('goals.payDown')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button onClick={() => onEdit(goal)} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500">
              <Edit3 size={14} />
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(goal)} className="p-1.5 rounded-lg hover:bg-danger/10 text-cream-500 hover:text-danger">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between mb-2">
        <span className="text-xl font-heading font-bold money">{formatCurrency(goal.currentAmount || 0, goal.currency, { hide })}</span>
        <span className="text-sm text-cream-500">{t('budgets.of')} {formatCurrency(goal.targetAmount, goal.currency, { hide })}</span>
      </div>

      <div className="relative h-2.5 bg-cream-200 dark:bg-dark-border rounded-full mb-2">
        <div
          className="h-full bg-success rounded-full transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: goal.color || '#059669' }}
        />
        {/* Milestone markers */}
        {milestones.map((m) => (
          <div
            key={m}
            className="absolute top-1/2 flex items-center justify-center"
            style={{ left: `${m}%`, transform: 'translate(-50%, -50%)' }}
          >
            {pct >= m ? (
              <div className="w-3.5 h-3.5 rounded-full bg-white dark:bg-dark-card border-2 flex items-center justify-center" style={{ borderColor: goal.color || '#059669' }}>
                <Check size={7} strokeWidth={3} style={{ color: goal.color || '#059669' }} />
              </div>
            ) : (
              <div className="w-2 h-2 rounded-full bg-cream-300 dark:bg-cream-600 border border-white dark:border-dark-card" />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full font-medium ${statusColors[status]}`}>
            {status === 'on-track' ? t('goals.onTrack') : status === 'behind' ? t('goals.behind') : t('goals.ahead')}
          </span>
          {countdown && (
            <span className="text-cream-400 text-[11px]">{countdown}</span>
          )}
        </div>
        <span className="text-cream-500">{t('goals.pctComplete', { pct })}</span>
      </div>

      {monthlyNeeded > 0 && (
        <p className="text-xs text-cream-500 mt-2">
          {t('goals.monthNeeded', { amount: formatCurrency(monthlyNeeded, goal.currency, { hide }) })}
        </p>
      )}

      {onAddFunds && (
        <button
          onClick={() => onAddFunds(goal)}
          className="btn-secondary w-full mt-3 text-xs"
        >
          {isSaveUp ? t('goals.addFunds') : t('goals.recordPayment')}
        </button>
      )}
    </div>
  );
}
