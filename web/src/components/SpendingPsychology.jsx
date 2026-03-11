import { useMemo } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/helpers';
import { Brain, Sun, Moon, Sunset, Coffee, Calendar, Zap, TrendingUp } from 'lucide-react';

/**
 * Spending Psychology Insights — Dashboard widget.
 * Analyses behavioral patterns in the user's transactions.
 */
export default function SpendingPsychology({ transactions, currency, hidden }) {
  const { t } = useTranslation();

  const insights = useMemo(() => {
    if (!transactions || transactions.length === 0) return [];

    const expenses = transactions.filter((tx) => tx.type === 'expense');
    if (expenses.length < 5) return []; // need enough data

    const result = [];
    const totalSpent = expenses.reduce((s, tx) => s + tx.amount, 0);

    // ── Weekend vs Weekday ──────────────────────────────────
    let weekdayTotal = 0, weekdayCount = 0;
    let weekendTotal = 0, weekendCount = 0;
    expenses.forEach((tx) => {
      const dow = new Date(tx.date).getDay();
      if (dow === 0 || dow === 6) {
        weekendTotal += tx.amount;
        weekendCount++;
      } else {
        weekdayTotal += tx.amount;
        weekdayCount++;
      }
    });

    if (weekendCount > 0 && weekdayCount > 0) {
      const weekendAvg = weekendTotal / weekendCount;
      const weekdayAvg = weekdayTotal / weekdayCount;
      const ratio = weekdayAvg > 0 ? weekendAvg / weekdayAvg : 0;
      if (ratio > 1.3) {
        result.push({
          id: 'weekend',
          icon: Calendar,
          color: 'text-warning',
          bg: 'bg-warning/8',
          label: t('psychology.weekendSpender'),
          detail: t('psychology.weekendDetail', { pct: Math.round((ratio - 1) * 100) }),
        });
      } else if (ratio < 0.7) {
        result.push({
          id: 'weekday',
          icon: Coffee,
          color: 'text-info',
          bg: 'bg-info/8',
          label: t('psychology.weekdaySpender'),
          detail: t('psychology.weekdayDetail', { pct: Math.round((1 - ratio) * 100) }),
        });
      }
    }

    // ── Impulse detection (small frequent purchases) ────────
    const smallThreshold = totalSpent * 0.02; // <2% of total per tx
    const smallTx = expenses.filter((tx) => tx.amount <= Math.max(smallThreshold, 15));
    const smallTotal = smallTx.reduce((s, tx) => s + tx.amount, 0);
    const smallPct = totalSpent > 0 ? Math.round((smallTotal / totalSpent) * 100) : 0;
    if (smallTx.length >= 5 && smallPct >= 10) {
      result.push({
        id: 'impulse',
        icon: Zap,
        color: 'text-danger',
        bg: 'bg-danger/8',
        label: t('psychology.impulseAlert'),
        detail: t('psychology.impulseDetail', { count: smallTx.length, pct: smallPct }),
      });
    }

    // ── Time-of-day patterns ────────────────────────────────
    // Only analyse if transactions have a createdAt timestamp with time info
    const withTime = expenses.filter((tx) => {
      const ts = tx.createdAt || tx.date;
      return ts && ts.includes('T');
    });
    if (withTime.length >= 5) {
      const buckets = { morning: 0, afternoon: 0, evening: 0, night: 0 };
      withTime.forEach((tx) => {
        const h = new Date(tx.createdAt || tx.date).getHours();
        if (h >= 5 && h < 12) buckets.morning++;
        else if (h >= 12 && h < 17) buckets.afternoon++;
        else if (h >= 17 && h < 21) buckets.evening++;
        else buckets.night++;
      });
      const maxBucket = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0];
      const maxPct = Math.round((maxBucket[1] / withTime.length) * 100);
      if (maxPct >= 40) {
        const icons = { morning: Sun, afternoon: Sunset, evening: Moon, night: Moon };
        result.push({
          id: 'timeOfDay',
          icon: icons[maxBucket[0]] || Sun,
          color: 'text-accent-600 dark:text-accent-400',
          bg: 'bg-accent-600/8',
          label: t(`psychology.${maxBucket[0]}Spender`),
          detail: t('psychology.timeDetail', { pct: maxPct }),
        });
      }
    }

    // ── Spending velocity (acceleration) ────────────────────
    if (expenses.length >= 10) {
      const sorted = [...expenses].sort((a, b) => a.date.localeCompare(b.date));
      const mid = Math.floor(sorted.length / 2);
      const firstHalf = sorted.slice(0, mid).reduce((s, tx) => s + tx.amount, 0);
      const secondHalf = sorted.slice(mid).reduce((s, tx) => s + tx.amount, 0);
      if (firstHalf > 0 && secondHalf > firstHalf * 1.4) {
        result.push({
          id: 'accelerating',
          icon: TrendingUp,
          color: 'text-danger',
          bg: 'bg-danger/8',
          label: t('psychology.accelerating'),
          detail: t('psychology.acceleratingDetail'),
        });
      }
    }

    return result.slice(0, 3); // max 3 insights
  }, [transactions, currency, t]);

  if (insights.length === 0) return null;

  return (
    <div className="card !p-3 md:!p-5">
      <div className="flex items-center gap-2 mb-3">
        <Brain size={14} className="text-purple-500" />
        <h3 className="section-title mb-0">{t('psychology.title')}</h3>
      </div>
      <div className="space-y-2">
        {insights.map((ins) => {
          const Icon = ins.icon;
          return (
            <div key={ins.id} className={`flex items-start gap-3 p-2.5 rounded-xl ${ins.bg} border border-cream-200/50 dark:border-dark-border`}>
              <div className={`mt-0.5 ${ins.color}`}>
                <Icon size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{ins.label}</p>
                <p className="text-[11px] text-cream-500 dark:text-cream-400 mt-0.5">{ins.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
