import { useState, useMemo } from 'react';
import { Equal, Percent, Sliders } from 'lucide-react';
import { formatCurrency } from '../lib/helpers';

const SPLIT_TYPES = [
  { id: 'equal', label: 'Equal', icon: Equal, description: 'Split equally among all' },
  { id: 'percentage', label: 'Percentage', icon: Percent, description: 'Custom % for each' },
  { id: 'custom', label: 'Custom', icon: Sliders, description: 'Set exact amounts' },
];

/**
 * @param {{ members: Array, totalAmount: number, currency: string, splits: Array, onChange: Function }} props
 */
export default function SplitCalculator({ members, totalAmount, currency, splits, onChange }) {
  const [splitType, setSplitType] = useState('equal');

  // When split type changes, recalculate
  const handleTypeChange = (type) => {
    setSplitType(type);

    if (type === 'equal') {
      const perPerson = Math.round((totalAmount / members.length) * 100) / 100;
      const remainder = Math.round((totalAmount - perPerson * members.length) * 100) / 100;
      const newSplits = members.map((m, i) => ({
        userId: m.userId,
        amount: i === 0 ? perPerson + remainder : perPerson,
        percentage: Math.round((100 / members.length) * 100) / 100,
        settled: false,
      }));
      onChange(newSplits, type);
    } else if (type === 'percentage') {
      const pct = Math.round((100 / members.length) * 100) / 100;
      const newSplits = members.map((m) => ({
        userId: m.userId,
        amount: Math.round((totalAmount * pct / 100) * 100) / 100,
        percentage: pct,
        settled: false,
      }));
      onChange(newSplits, type);
    } else {
      // Custom — start equal
      const perPerson = Math.round((totalAmount / members.length) * 100) / 100;
      const newSplits = members.map((m) => ({
        userId: m.userId,
        amount: perPerson,
        percentage: Math.round((100 / members.length) * 100) / 100,
        settled: false,
      }));
      onChange(newSplits, type);
    }
  };

  const handleAmountChange = (userId, value) => {
    const amount = parseFloat(value) || 0;
    const newSplits = splits.map((s) =>
      s.userId === userId ? { ...s, amount, percentage: totalAmount > 0 ? Math.round((amount / totalAmount) * 10000) / 100 : 0 } : s
    );
    onChange(newSplits, splitType);
  };

  const handlePercentChange = (userId, value) => {
    const pct = parseFloat(value) || 0;
    const amount = Math.round((totalAmount * pct / 100) * 100) / 100;
    const newSplits = splits.map((s) =>
      s.userId === userId ? { ...s, percentage: pct, amount } : s
    );
    onChange(newSplits, splitType);
  };

  const totalAllocated = splits.reduce((s, sp) => s + sp.amount, 0);
  const diff = Math.round((totalAmount - totalAllocated) * 100) / 100;

  const getMemberName = (userId) => {
    const m = members.find((m) => m.userId === userId);
    return m ? `${m.emoji} ${m.displayName}` : userId;
  };

  return (
    <div className="space-y-4">
      {/* Split type selector */}
      <div className="flex gap-2">
        {SPLIT_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTypeChange(t.id)}
            className={`flex-1 flex flex-col items-center gap-1 py-3 rounded-xl border text-xs font-medium transition-colors ${
              splitType === t.id
                ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
            }`}
          >
            <t.icon size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Split list */}
      <div className="space-y-2">
        {splits.map((split) => (
          <div key={split.userId} className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 dark:bg-dark-bg">
            <span className="text-sm font-medium min-w-[100px] truncate">
              {getMemberName(split.userId)}
            </span>

            {splitType === 'percentage' ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="input w-20 text-right text-sm"
                  value={split.percentage}
                  onChange={(e) => handlePercentChange(split.userId, e.target.value)}
                />
                <span className="text-xs text-cream-400">%</span>
                <span className="text-sm money ml-auto">{formatCurrency(split.amount, currency)}</span>
              </div>
            ) : splitType === 'custom' ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="input flex-1 text-right text-sm"
                  value={split.amount}
                  onChange={(e) => handleAmountChange(split.userId, e.target.value)}
                />
                <span className="text-xs text-cream-400">{currency}</span>
              </div>
            ) : (
              <span className="flex-1 text-right text-sm money font-medium">
                {formatCurrency(split.amount, currency)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Total check */}
      <div className={`flex items-center justify-between text-sm p-2 rounded-lg ${
        Math.abs(diff) < 0.01 ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
      }`}>
        <span>Total allocated</span>
        <span className="font-medium money">
          {formatCurrency(totalAllocated, currency)} / {formatCurrency(totalAmount, currency)}
          {Math.abs(diff) >= 0.01 && ` (${diff > 0 ? '+' : ''}${formatCurrency(diff, currency)} remaining)`}
        </span>
      </div>
    </div>
  );
}
