import { useMemo } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { formatCurrency, sumBy } from '../../lib/helpers';
import { startOfMonth, endOfMonth } from 'date-fns';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { TrendingDown, TrendingUp, Wallet, Clock } from 'lucide-react';

const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];

export default function FamilyOverview() {
  const { t } = useTranslation();
  const { activeFamily, members, familyTransactions, familyTransactionsLoading } = useFamily();
  const currency = activeFamily?.defaultCurrency || 'RON';

  const now = new Date();
  const mStart = startOfMonth(now);
  const mEnd = endOfMonth(now);

  // Compute household stats
  const stats = useMemo(() => {
    const thisMonth = familyTransactions.filter((tx) => {
      const d = new Date(tx.date);
      return d >= mStart && d <= mEnd;
    });
    const income = sumBy(thisMonth.filter((tx) => tx.type === 'income'), 'amount');
    const expenses = sumBy(thisMonth.filter((tx) => tx.type === 'expense'), 'amount');
    return { income, expenses, savings: income - expenses, thisMonth };
  }, [familyTransactions, mStart, mEnd]);

  // Per-member contributions (expenses)
  const memberContributions = useMemo(() => {
    const data = [];
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const spent = sumBy(
        stats.thisMonth.filter((tx) => tx.userId === m.userId && tx.type === 'expense'),
        'amount'
      );
      if (spent > 0) {
        data.push({ name: `${m.emoji || '👤'} ${m.displayName || 'Member'}`, value: spent, color: COLORS[i % COLORS.length] });
      }
    }
    return data;
  }, [members, stats.thisMonth]);

  // Recent activity (last 10 across all members)
  const recentActivity = useMemo(() => {
    return [...familyTransactions]
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .slice(0, 10);
  }, [familyTransactions]);

  const getMemberInfo = (userId) => {
    const m = members.find((m) => m.userId === userId);
    return m ? { emoji: m.emoji || '👤', name: m.displayName || 'Member' } : { emoji: '👤', name: 'Member' };
  };

  if (familyTransactionsLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse"><div className="h-16 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={12} className="text-income" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('family.householdIncome')}</p>
          </div>
          <p className="font-heading font-bold text-lg money text-income">{formatCurrency(stats.income, currency)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingDown size={12} className="text-danger" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('family.householdExpenses')}</p>
          </div>
          <p className="font-heading font-bold text-lg money text-danger">{formatCurrency(stats.expenses, currency)}</p>
        </div>
        <div className="card">
          <div className="flex items-center gap-1.5 mb-1">
            <Wallet size={12} className="text-success" />
            <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('family.householdSavings')}</p>
          </div>
          <p className={`font-heading font-bold text-lg money ${stats.savings >= 0 ? 'text-success' : 'text-danger'}`}>
            {formatCurrency(stats.savings, currency)}
          </p>
        </div>
      </div>

      {/* Member contributions */}
      {memberContributions.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('family.memberContributions')}</h3>
          <div className="flex items-center gap-4">
            <div className="w-32 h-32 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={memberContributions} dataKey="value" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                    {memberContributions.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val) => formatCurrency(val, currency)}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {memberContributions.map((mc, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: mc.color }} />
                    <span className="font-medium">{mc.name}</span>
                  </div>
                  <span className="money font-medium">{formatCurrency(mc.value, currency)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2">
          <Clock size={14} /> {t('family.recentActivity')}
        </h3>
        {recentActivity.length > 0 ? (
          <div className="space-y-2">
            {recentActivity.map((tx) => {
              const member = getMemberInfo(tx.userId);
              return (
                <div key={tx.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-cream-50 dark:bg-dark-bg">
                  <span className="text-lg shrink-0">{member.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.merchant || tx.description || t('common.unknown')}</p>
                    <p className="text-[11px] text-cream-500">{member.name} · {tx.date}</p>
                  </div>
                  <span className={`text-sm font-heading font-bold money ${tx.type === 'income' ? 'text-income' : 'text-danger'}`}>
                    {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency || currency)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-cream-400 text-center py-4">{t('family.noRecentActivity')}</p>
        )}
      </div>
    </div>
  );
}
