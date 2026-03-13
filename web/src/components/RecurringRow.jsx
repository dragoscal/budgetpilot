import { getCategoryById, formatCurrency, getFrequencyById, calcMonthlyEquivalent, calcAnnualEquivalent, getRecurringPaymentStats, formatDate } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import { useTranslation } from '../contexts/LanguageContext';
import { Edit3, Trash2, Pause, Play, Landmark, Bell, XCircle, RotateCcw } from 'lucide-react';

export default function RecurringRow({ item, onEdit, onDelete, onToggle, onCancel, onReactivate, allTransactions, cancelled }) {
  const { t } = useTranslation();
  const cat = getCategoryById(item.category);
  const freq = getFrequencyById(item.frequency || 'monthly');
  const billingDay = item.billingDay || 1;
  const now = new Date();
  const today = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // Calculate daysUntil based on frequency
  let daysUntil;
  if (item.frequency === 'weekly') {
    // Weekly: find next occurrence within 7 days from last billing weekday
    daysUntil = billingDay >= today ? billingDay - today : 7 - (today - billingDay) % 7;
    if (daysUntil > 7) daysUntil = daysUntil % 7;
  } else if (item.frequency === 'biweekly') {
    daysUntil = billingDay >= today ? billingDay - today : 14 - (today - billingDay) % 14;
    if (daysUntil > 14) daysUntil = daysUntil % 14;
  } else if (item.frequency === 'daily') {
    daysUntil = 0; // always due
  } else if (['annual', 'semiannual', 'biannual'].includes(item.frequency)) {
    // For annual+ : check billingMonth first
    const billingMonth = (item.billingMonth || 1) - 1; // 0-indexed
    const currentMonth = now.getMonth();
    if (currentMonth === billingMonth) {
      daysUntil = billingDay >= today ? billingDay - today : daysInMonth - today + billingDay;
    } else {
      // Not in billing month — compute months until
      const monthsAway = billingMonth > currentMonth ? billingMonth - currentMonth : 12 - currentMonth + billingMonth;
      daysUntil = monthsAway * 30 + billingDay; // approximate
    }
  } else {
    // Monthly / quarterly (default)
    daysUntil = billingDay >= today ? billingDay - today : daysInMonth - today + billingDay;
  }

  const isNear = daysUntil <= 3 && item.active !== false && !cancelled;

  const isMonthly = !item.frequency || item.frequency === 'monthly';
  const monthlyEq = calcMonthlyEquivalent(item.amount, item.frequency || 'monthly');
  const annualEq = calcAnnualEquivalent(item.amount, item.frequency || 'monthly');

  // Payment stats
  const stats = allTransactions ? getRecurringPaymentStats(item, allTransactions) : null;

  // Format per-period label
  const periodLabel = (() => {
    switch (item.frequency) {
      case 'weekly': return t('recurring.perWk');
      case 'biweekly': return t('recurring.per2Wk');
      case 'quarterly': return t('recurring.perQtr');
      case 'semiannual': return t('recurring.per6Mo');
      case 'annual': return t('recurring.perYr');
      default: return t('recurring.perMo');
    }
  })();

  return (
    <div className={`flex items-center gap-3 py-3 px-4 hover:bg-cream-50 dark:hover:bg-dark-border/50 rounded-xl transition-colors group ${cancelled ? 'opacity-70' : ''}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-cream-100 dark:bg-dark-border shrink-0 ${
        item.active === false || cancelled ? 'opacity-50' : ''
      }`}>
        {cat.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className={`text-sm font-medium truncate ${item.active === false && !cancelled ? 'line-through text-cream-500' : ''} ${cancelled ? 'line-through text-cream-400' : ''}`}>
            {item.name}
          </p>
          {item.autoDebit ? (
            <span className="px-1.5 py-0.5 rounded bg-accent/10 text-accent text-[10px] font-medium flex items-center gap-0.5">
              <Landmark size={10} /> {t('recurring.autoLabel')}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[10px] font-medium flex items-center gap-0.5">
              <Bell size={10} /> {t('recurring.manualLabel')}
            </span>
          )}
          {isNear && (
            <span className="px-1.5 py-0.5 rounded bg-warning/10 text-warning text-[10px] font-medium">
              {daysUntil === 0 ? t('recurring.todayLabel') : t('recurring.inDays', { count: daysUntil })}
            </span>
          )}
          {!!item.isVariable && (
            <span className="px-1.5 py-0.5 rounded bg-info/10 text-info text-[10px] font-medium">
              {t('recurring.variable')}
            </span>
          )}
          {!isMonthly && !cancelled && (
            <span className="px-1.5 py-0.5 rounded bg-cream-200 dark:bg-dark-border text-cream-600 dark:text-cream-400 text-[10px] font-medium">
              {t(`frequencies.${item.frequency}`)}
            </span>
          )}
        </div>
        <p className="text-xs text-cream-500">
          {getCategoryLabel(cat, t)} · {['annual', 'semiannual', 'biannual'].includes(item.frequency)
            ? `${new Date(2026, (item.billingMonth || 1) - 1).toLocaleString(undefined, { month: 'short' })} ${billingDay}`
            : t('recurring.dayBilling', { day: billingDay })}
          {item.endDate && <span className="ml-1">· {t('recurring.ends', { date: item.endDate })}</span>}
        </p>
        {/* Status info */}
        {item.status === 'paused' && item.pausedAt && (
          <p className="text-[11px] text-warning font-medium mt-0.5">
            {t('recurring.pausedSince', { date: formatDate(item.pausedAt, 'dd MMM yyyy') })}
          </p>
        )}
        {cancelled && item.cancelledAt && (
          <p className="text-[11px] text-danger font-medium mt-0.5">
            {t('recurring.cancelledOn', { date: formatDate(item.cancelledAt, 'dd MMM yyyy') })}
          </p>
        )}
        {/* Payment stats */}
        {stats && stats.paymentCount > 0 && (
          <p className="text-[11px] text-cream-400 mt-0.5">
            {t('recurring.payments', { count: stats.paymentCount })} · {t('recurring.totalSpent')}: {formatCurrency(stats.totalSpent, item.currency)}
            {stats.lastPayment && <span> · {t('recurring.lastPayment', { date: formatDate(stats.lastPayment, 'dd MMM') })}</span>}
          </p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-heading font-bold money ${cancelled ? 'text-cream-400' : ''}`}>
          {item.isVariable && item.amount ? '~' : ''}{item.amount ? formatCurrency(item.amount, item.currency) : t('recurring.variable')}<span className="text-[10px] text-cream-400 font-normal">{periodLabel}</span>
        </p>
        {!cancelled && (
          !isMonthly ? (
            <p className="text-[10px] text-cream-400">
              ~{formatCurrency(monthlyEq, item.currency)}{t('recurring.perMo')} · {formatCurrency(annualEq, item.currency)}{t('recurring.perYr')}
            </p>
          ) : (
            <p className="text-[10px] text-cream-400">{formatCurrency(annualEq, item.currency)}{t('recurring.perYr')}</p>
          )
        )}
      </div>
      <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
        {/* Reactivate button for cancelled items */}
        {cancelled && onReactivate && (
          <button
            onClick={() => onReactivate(item)}
            className="px-2 py-1.5 rounded-lg bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors flex items-center gap-1"
            title={t('recurring.reactivate')}
          >
            <RotateCcw size={12} /> {t('recurring.reactivate')}
          </button>
        )}
        {/* Active/Paused item actions */}
        {!cancelled && (
          <>
            {onToggle && (
              <button
                onClick={() => onToggle(item)}
                className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500"
                title={item.active === false ? t('recurring.resume') : t('recurring.pause')}
              >
                {item.active === false ? <Play size={14} /> : <Pause size={14} />}
              </button>
            )}
            {onCancel && (
              <button
                onClick={() => onCancel(item)}
                className="p-1.5 rounded-lg hover:bg-danger/10 text-cream-500 hover:text-danger"
                title={t('recurring.cancelSubscription')}
              >
                <XCircle size={14} />
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
          </>
        )}
      </div>
    </div>
  );
}
