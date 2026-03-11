import { useState, useMemo } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { formatCurrency, sumBy } from '../../lib/helpers';
import { getCategoryById } from '../../lib/helpers';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  LineChart, Line,
} from 'recharts';

const COLORS = ['#e11d48', '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777'];

export default function FamilyCompare() {
  const { t } = useTranslation();
  const { activeFamily, members, familyTransactions, familyTransactionsLoading } = useFamily();
  const currency = activeFamily?.defaultCurrency || 'RON';

  const safeName = (m) => m.displayName || 'Member';
  const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));

  // Generate last 12 months for selector
  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      opts.push({ value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy') });
    }
    return opts;
  }, []);

  // Filter transactions for selected month
  const monthTx = useMemo(() => {
    const mStart = startOfMonth(new Date(selectedMonth + '-01'));
    const mEnd = endOfMonth(mStart);
    return familyTransactions.filter((tx) => {
      const d = new Date(tx.date);
      return d >= mStart && d <= mEnd && tx.type === 'expense';
    });
  }, [familyTransactions, selectedMonth]);

  // Contribution ratio data
  const contributionData = useMemo(() => {
    const total = sumBy(monthTx, 'amount');
    if (total === 0) return [];
    return members.map((m, i) => {
      const spent = sumBy(monthTx.filter((tx) => tx.userId === m.userId), 'amount');
      return {
        name: `${m.emoji || '👤'} ${m.displayName || 'Member'}`,
        value: spent,
        pct: total > 0 ? ((spent / total) * 100).toFixed(1) : 0,
        color: COLORS[i % COLORS.length],
      };
    }).filter((d) => d.value > 0);
  }, [monthTx, members]);

  // Per-member spending cards
  const memberSpending = useMemo(() => {
    const totalHousehold = sumBy(monthTx, 'amount');
    return members.map((m, i) => {
      const mTx = monthTx.filter((tx) => tx.userId === m.userId);
      const total = sumBy(mTx, 'amount');
      // Top categories
      const catMap = {};
      for (const tx of mTx) {
        catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
      }
      const topCats = Object.entries(catMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([cat, amount]) => ({ cat, amount, info: getCategoryById(cat) }));

      return {
        member: m,
        total,
        pctOfHousehold: totalHousehold > 0 ? ((total / totalHousehold) * 100).toFixed(1) : 0,
        topCats,
        color: COLORS[i % COLORS.length],
      };
    });
  }, [monthTx, members]);

  // Category comparison data (grouped bar)
  const categoryComparison = useMemo(() => {
    const catSet = new Set();
    const memberCats = {};
    for (const m of members) {
      memberCats[m.userId] = {};
      for (const tx of monthTx.filter((tx) => tx.userId === m.userId)) {
        catSet.add(tx.category);
        memberCats[m.userId][tx.category] = (memberCats[m.userId][tx.category] || 0) + tx.amount;
      }
    }
    return Array.from(catSet)
      .map((cat) => {
        const entry = { category: getCategoryById(cat).icon + ' ' + (getCategoryById(cat).name || cat) };
        for (const m of members) {
          entry[safeName(m)] = memberCats[m.userId]?.[cat] || 0;
        }
        return entry;
      })
      .sort((a, b) => {
        const totalA = members.reduce((s, m) => s + (a[safeName(m)] || 0), 0);
        const totalB = members.reduce((s, m) => s + (b[safeName(m)] || 0), 0);
        return totalB - totalA;
      })
      .slice(0, 8);
  }, [monthTx, members]);

  // Monthly trends (last 6 months)
  const monthlyTrends = useMemo(() => {
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const ms = startOfMonth(d);
      const me = endOfMonth(d);
      const entry = { month: format(d, 'MMM') };
      for (const m of members) {
        entry[safeName(m)] = sumBy(
          familyTransactions.filter((tx) => {
            const td = new Date(tx.date);
            return td >= ms && td <= me && tx.type === 'expense' && tx.userId === m.userId;
          }),
          'amount'
        );
      }
      data.push(entry);
    }
    return data;
  }, [familyTransactions, members]);

  if (familyTransactionsLoading) {
    return <div className="card animate-pulse"><div className="h-64 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Month selector */}
      <select
        value={selectedMonth}
        onChange={(e) => setSelectedMonth(e.target.value)}
        className="input text-sm w-auto"
      >
        {monthOptions.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {/* Contribution ratio bar */}
      {contributionData.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('family.contributionRatio')}</h3>
          <div className="flex rounded-full overflow-hidden h-6 bg-cream-100 dark:bg-dark-border">
            {contributionData.map((d, i) => (
              <div
                key={i}
                className="h-full flex items-center justify-center text-[10px] font-bold text-white"
                style={{ width: `${d.pct}%`, backgroundColor: d.color, minWidth: d.pct > 5 ? 'auto' : '0' }}
                title={`${d.name}: ${d.pct}%`}
              >
                {Number(d.pct) > 10 ? `${d.pct}%` : ''}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {contributionData.map((d, i) => (
              <div key={i} className="flex items-center gap-1.5 text-xs">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                <span>{d.name}</span>
                <span className="text-cream-400">{d.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-member spending cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {memberSpending.map((ms) => (
          <div key={ms.member.userId} className="card" style={{ borderLeftColor: ms.color, borderLeftWidth: 3 }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{ms.member.emoji || '👤'}</span>
              <span className="font-medium text-sm">{ms.member.displayName || 'Member'}</span>
            </div>
            <p className="font-heading font-bold text-lg money">{formatCurrency(ms.total, currency)}</p>
            <p className="text-[10px] text-cream-400">{ms.pctOfHousehold}% {t('family.ofHousehold')}</p>
            {ms.topCats.length > 0 && (
              <div className="mt-2 space-y-1">
                {ms.topCats.map((c) => (
                  <div key={c.cat} className="flex items-center justify-between text-xs">
                    <span>{c.info.icon} {c.info.name || c.cat}</span>
                    <span className="money">{formatCurrency(c.amount, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Category comparison chart */}
      {categoryComparison.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('family.spendingByCategory')}</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={categoryComparison} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis type="number" tickFormatter={(v) => formatCurrency(v, currency)} tick={{ fontSize: 10 }} />
              <YAxis dataKey="category" type="category" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(v, currency)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {members.map((m, i) => (
                <Bar key={m.userId} dataKey={safeName(m)} fill={COLORS[i % COLORS.length]} radius={[0, 4, 4, 0]} />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly trends */}
      {monthlyTrends.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('family.monthlyTrends')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyTrends}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => formatCurrency(v, currency)} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => formatCurrency(v, currency)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              {members.map((m, i) => (
                <Line
                  key={m.userId}
                  type="monotone"
                  dataKey={safeName(m)}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {monthTx.length === 0 && (
        <div className="card text-center py-8">
          <p className="text-sm text-cream-400">{t('family.noDataForMonth')}</p>
        </div>
      )}
    </div>
  );
}
