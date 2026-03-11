import { useState, useMemo } from 'react';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency } from '../lib/helpers';
import { Calculator, ChevronDown, ChevronUp, Snowflake, Flame, Trophy } from 'lucide-react';

/**
 * Debt Payoff Simulator — compares Snowball vs Avalanche strategies.
 * Snowball = pay smallest balance first (motivation).
 * Avalanche = pay highest interest first (saves money).
 */
export default function DebtPayoffSimulator({ loans, currency }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [extraPayment, setExtraPayment] = useState('');

  const activeLoans = useMemo(() =>
    loans.filter((l) => l.status === 'active' && l.remainingBalance > 0 && l.monthlyPayment > 0),
    [loans]
  );

  const simulation = useMemo(() => {
    if (activeLoans.length < 2) return null;

    const extra = Number(extraPayment) || 0;
    const totalMinPayment = activeLoans.reduce((s, l) => s + l.monthlyPayment, 0);

    const simulate = (sortFn) => {
      // Clone loans for simulation
      let debts = activeLoans.map((l) => ({
        id: l.id,
        name: l.name,
        balance: l.remainingBalance,
        rate: (l.interestRate || 0) / 100 / 12, // monthly rate
        minPayment: l.monthlyPayment,
      })).sort(sortFn);

      let totalInterest = 0;
      let months = 0;
      const maxMonths = 360; // 30 year cap
      const payoffOrder = [];

      while (debts.some((d) => d.balance > 0) && months < maxMonths) {
        months++;
        let availableExtra = extra;

        // First: apply minimum payments + interest to all debts
        debts.forEach((d) => {
          if (d.balance <= 0) return;
          const interest = d.balance * d.rate;
          totalInterest += interest;
          d.balance += interest;
          const payment = Math.min(d.minPayment, d.balance);
          d.balance -= payment;
          if (d.balance < 0.01) {
            d.balance = 0;
            availableExtra += d.minPayment; // freed payment rolls over
            payoffOrder.push({ name: d.name, month: months });
          }
        });

        // Then: apply extra to the target debt (first with balance > 0)
        for (const d of debts) {
          if (d.balance <= 0 || availableExtra <= 0) continue;
          const payment = Math.min(availableExtra, d.balance);
          d.balance -= payment;
          availableExtra -= payment;
          if (d.balance < 0.01) {
            d.balance = 0;
            payoffOrder.push({ name: d.name, month: months });
          }
        }
      }

      return { months, totalInterest, payoffOrder };
    };

    // Snowball: smallest balance first
    const snowball = simulate((a, b) => a.balance - b.balance);

    // Avalanche: highest interest rate first
    const avalanche = simulate((a, b) => b.rate - a.rate);

    // No-extra baseline (just min payments, no strategy)
    const baseline = simulate(() => 0);

    return { snowball, avalanche, baseline, totalMinPayment, extra };
  }, [activeLoans, extraPayment]);

  if (activeLoans.length < 2) return null;

  const winner = simulation
    ? simulation.avalanche.totalInterest <= simulation.snowball.totalInterest
      ? 'avalanche'
      : 'snowball'
    : null;

  const saved = simulation
    ? Math.abs(simulation.baseline.totalInterest - simulation[winner].totalInterest)
    : 0;

  return (
    <div className="card !p-3 md:!p-5">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Calculator size={16} className="text-accent-600 dark:text-accent-400" />
          <h3 className="section-title mb-0">{t('payoff.title')}</h3>
        </div>
        {open ? <ChevronUp size={16} className="text-cream-400" /> : <ChevronDown size={16} className="text-cream-400" />}
      </button>

      {open && simulation && (
        <div className="mt-4 space-y-4">
          {/* Extra payment input */}
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-cream-600 dark:text-cream-400 whitespace-nowrap">
              {t('payoff.extraMonthly')}
            </label>
            <input
              type="number"
              min="0"
              step="50"
              value={extraPayment}
              onChange={(e) => setExtraPayment(e.target.value)}
              placeholder="0"
              className="input !py-1.5 !text-sm w-28"
            />
          </div>

          {/* Comparison cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Snowball */}
            <div className={`rounded-xl border p-3 ${winner === 'snowball' ? 'border-accent-500 bg-accent-50/50 dark:bg-accent-900/10' : 'border-cream-200 dark:border-dark-border'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Snowflake size={14} className="text-info" />
                <span className="text-sm font-bold">{t('payoff.snowball')}</span>
                {winner === 'snowball' && <Trophy size={12} className="text-warning ml-auto" />}
              </div>
              <p className="text-xs text-cream-500 dark:text-cream-400 mb-2">{t('payoff.snowballDesc')}</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-cream-500">{t('payoff.months')}</span>
                  <span className="font-semibold">{simulation.snowball.months}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-cream-500">{t('payoff.totalInterest')}</span>
                  <span className="font-semibold text-danger">{formatCurrency(simulation.snowball.totalInterest, currency)}</span>
                </div>
              </div>
            </div>

            {/* Avalanche */}
            <div className={`rounded-xl border p-3 ${winner === 'avalanche' ? 'border-accent-500 bg-accent-50/50 dark:bg-accent-900/10' : 'border-cream-200 dark:border-dark-border'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Flame size={14} className="text-danger" />
                <span className="text-sm font-bold">{t('payoff.avalanche')}</span>
                {winner === 'avalanche' && <Trophy size={12} className="text-warning ml-auto" />}
              </div>
              <p className="text-xs text-cream-500 dark:text-cream-400 mb-2">{t('payoff.avalancheDesc')}</p>
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-cream-500">{t('payoff.months')}</span>
                  <span className="font-semibold">{simulation.avalanche.months}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-cream-500">{t('payoff.totalInterest')}</span>
                  <span className="font-semibold text-danger">{formatCurrency(simulation.avalanche.totalInterest, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Savings summary */}
          {saved > 1 && (
            <div className="text-center py-2 px-3 rounded-xl bg-success/8 border border-success/20">
              <p className="text-xs font-medium text-success">
                {t('payoff.savings', {
                  strategy: winner === 'avalanche' ? t('payoff.avalanche') : t('payoff.snowball'),
                  amount: formatCurrency(saved, currency),
                })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
