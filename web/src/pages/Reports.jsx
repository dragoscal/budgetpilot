import { useState, useEffect, useMemo, useRef } from 'react';
import { transactions as txApi, budgets as budgetsApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency, sumBy, sumAmountsMultiCurrency, groupBy, getCategoryById } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import { generateCSV, downloadBlob } from '../lib/exportHelpers';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, PieChart, Pie } from 'recharts';
import { Download, Printer, Calendar, ClipboardList } from 'lucide-react';
import EmptyState from '../components/EmptyState';
import { getCachedRates } from '../lib/exchangeRates';
import { startOfMonth, endOfMonth, format, subMonths } from 'date-fns';
import HelpButton from '../components/HelpButton';

const PIE_COLORS = ['#4F46E5', '#059669', '#D97706', '#2563EB', '#7C3AED', '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#DC2626'];

export default function Reports() {
  const { effectiveUserId, user } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [allTx, setAllTx] = useState([]);
  const [budgetsList, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('spending');
  const [dateFrom, setDateFrom] = useState(format(subMonths(new Date(), 2), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [taxTags, setTaxTags] = useState(['business']);
  const [rates, setRates] = useState(null);
  const currency = user?.defaultCurrency || 'RON';

  const REPORT_TYPES = [
    { id: 'spending', label: t('reports.spendingSummary'), description: t('reports.spendingSummaryDesc') },
    { id: 'tax', label: t('reports.taxReport'), description: t('reports.taxReportDesc') },
    { id: 'trends', label: t('reports.monthlyTrends'), description: t('reports.monthlyTrendsDesc') },
  ];

  const loadVersion = useRef(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    (async () => {
      setLoading(true);
      try {
        const [tx, budgets, ratesData] = await Promise.all([
          txApi.getAll({ userId: effectiveUserId }),
          budgetsApi.getAll({ userId: effectiveUserId }),
          getCachedRates().catch(() => null),
        ]);
        if (loadVersion.current !== version) return;
        setAllTx(tx);
        setBudgets(budgets);
        if (ratesData) setRates(ratesData);
      } catch (err) {
        if (loadVersion.current === version) {
          console.error('Failed to load report data:', err);
          toast.error(t('reports.failedLoad') || 'Failed to load report data');
        }
      } finally { if (loadVersion.current === version) setLoading(false); }
    })();
  }, [effectiveUserId]);

  // Filter by date range
  const filtered = useMemo(() => {
    return allTx.filter((t) => t.date >= dateFrom && t.date <= dateTo);
  }, [allTx, dateFrom, dateTo]);

  const expenses = filtered.filter((t) => t.type === 'expense');
  const income = filtered.filter((t) => t.type === 'income');
  const totalExpenses = sumAmountsMultiCurrency(expenses, currency, rates);
  const totalIncome = sumAmountsMultiCurrency(income, currency, rates);

  // Category breakdown
  const categoryData = useMemo(() => {
    const byCategory = groupBy(expenses, 'category');
    return Object.entries(byCategory)
      .map(([catId, txs]) => {
        const cat = getCategoryById(catId);
        return { id: catId, name: getCategoryLabel(cat, t), icon: cat.icon, total: sumAmountsMultiCurrency(txs, currency, rates), count: txs.length };
      })
      .sort((a, b) => b.total - a.total);
  }, [expenses, t, currency, rates]);

  // Tax-filtered transactions
  const taxFiltered = useMemo(() => {
    return expenses.filter((t) =>
      (t.tags || []).some((tag) => taxTags.includes(tag.toLowerCase()))
    );
  }, [expenses, taxTags]);

  // Monthly trends (last 6 months)
  const monthlyTrends = useMemo(() => {
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(new Date(), i);
      const start = startOfMonth(m);
      const end = endOfMonth(m);
      const monthTx = allTx.filter((t) => {
        const d = new Date(t.date);
        return d >= start && d <= end;
      });
      months.push({
        month: format(m, 'MMM yy'),
        expenses: sumAmountsMultiCurrency(monthTx.filter((t) => t.type === 'expense'), currency, rates),
        income: sumAmountsMultiCurrency(monthTx.filter((t) => t.type === 'income'), currency, rates),
      });
    }
    return months;
  }, [allTx, currency, rates]);

  const handleExportCSV = () => {
    const data = reportType === 'tax' ? taxFiltered : filtered;
    const blob = generateCSV(data);
    downloadBlob(blob, `report_${reportType}_${dateFrom}_to_${dateTo}.csv`);
    toast.success(t('transactions.csvExported'));
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t('reports.title')}</h1>
        <div className="card animate-pulse"><div className="h-48 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>
      </div>
    );
  }

  if (allTx.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t('reports.title')}</h1>
        <EmptyState
          icon={ClipboardList}
          title={t('reports.emptyTitle') || 'No reports yet'}
          description={t('reports.emptyDesc') || 'Add some transactions first to generate reports and insights.'}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('reports.title')}</h1>
          <HelpButton section="reports" />
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="btn-ghost text-xs flex items-center gap-1">
            <Download size={14} /> {t('reports.csv')}
          </button>
          <button onClick={handlePrint} className="btn-ghost text-xs flex items-center gap-1">
            <Printer size={14} /> {t('reports.print')}
          </button>
        </div>
      </div>

      {/* Report type + date range */}
      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
          {REPORT_TYPES.map((r) => (
            <button
              key={r.id}
              onClick={() => setReportType(r.id)}
              className={`px-3 sm:px-4 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                reportType === r.id
                  ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                  : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Calendar size={14} className="text-cream-400 shrink-0" />
          <input type="date" className="input w-auto text-xs min-w-0" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="text-cream-400 text-xs">{t('reports.to')}</span>
          <input type="date" className="input w-auto text-xs min-w-0" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold">LUMET — {REPORT_TYPES.find((r) => r.id === reportType)?.label}</h1>
        <p className="text-sm text-gray-500">{dateFrom} {t('reports.to')} {dateTo}</p>
      </div>

      {/* SPENDING SUMMARY */}
      {reportType === 'spending' && (
        <>
          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="card !p-2.5 sm:!p-4">
              <p className="text-[10px] sm:text-xs text-cream-500">{t('reports.totalSpent')}</p>
              <p className="font-heading font-bold text-sm sm:text-lg money text-danger truncate">{formatCurrency(totalExpenses, currency)}</p>
            </div>
            <div className="card !p-2.5 sm:!p-4">
              <p className="text-[10px] sm:text-xs text-cream-500">{t('reports.totalIncome')}</p>
              <p className="font-heading font-bold text-sm sm:text-lg money text-income truncate">{formatCurrency(totalIncome, currency)}</p>
            </div>
            <div className="card !p-2.5 sm:!p-4">
              <p className="text-[10px] sm:text-xs text-cream-500">{t('reports.net')}</p>
              <p className={`font-heading font-bold text-sm sm:text-lg money truncate ${totalIncome - totalExpenses >= 0 ? 'text-success' : 'text-danger'}`}>
                {formatCurrency(totalIncome - totalExpenses, currency)}
              </p>
            </div>
          </div>

          {/* Category pie chart */}
          <div className="card">
            <h3 className="section-title">{t('reports.categoryBreakdown')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryData.length > 0 && (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={categoryData}
                      dataKey="total"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      label={({ percent }) => percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : ''}
                      labelLine={false}
                      fontSize={11}
                    >
                      {categoryData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(v, currency)} />
                  </PieChart>
                </ResponsiveContainer>
              )}

              <div className="space-y-2">
                {categoryData.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="truncate">{c.icon} {c.name}</span>
                      <span className="text-xs text-cream-400 shrink-0">({c.count})</span>
                    </span>
                    <span className="money font-medium shrink-0 text-xs sm:text-sm">{formatCurrency(c.total, currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* TAX REPORT */}
      {reportType === 'tax' && (
        <>
          <div className="card">
            <h3 className="section-title">{t('reports.taxRelevantTags')}</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {['business', 'medical', 'charity', 'education', 'work'].map((tag) => (
                <button
                  key={tag}
                  onClick={() => setTaxTags((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    taxTags.includes(tag)
                      ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                      : 'border-cream-300 dark:border-dark-border text-cream-500'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
            <p className="text-sm text-cream-500">
              {t('reports.taxTransactions', { count: taxFiltered.length })}{' '}
              <strong className="money">{formatCurrency(sumAmountsMultiCurrency(taxFiltered, currency, rates), currency)}</strong>
            </p>
          </div>

          {taxFiltered.length > 0 && (
            <div className="card p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cream-200 dark:border-dark-border">
                    <th className="text-left px-4 py-2 text-xs text-cream-500">{t('reports.dateHeader')}</th>
                    <th className="text-left px-4 py-2 text-xs text-cream-500">{t('reports.merchantHeader')}</th>
                    <th className="text-left px-4 py-2 text-xs text-cream-500">{t('reports.categoryHeader')}</th>
                    <th className="text-left px-4 py-2 text-xs text-cream-500">{t('reports.tagsHeader')}</th>
                    <th className="text-right px-4 py-2 text-xs text-cream-500">{t('reports.amountHeader')}</th>
                    <th className="text-left px-4 py-2 text-xs text-cream-500">{t('household.title')}</th>
                  </tr>
                </thead>
                <tbody>
                  {taxFiltered.map((tx) => (
                    <tr key={tx.id} className="border-b border-cream-100 dark:border-dark-border">
                      <td className="px-4 py-2">{tx.date}</td>
                      <td className="px-4 py-2 font-medium">{tx.merchant}</td>
                      <td className="px-4 py-2">{tx.category}</td>
                      <td className="px-4 py-2">{(tx.tags || []).map((tag) => `#${tag}`).join(' ')}</td>
                      <td className="px-4 py-2 text-right money">{formatCurrency(tx.amount, tx.currency)}</td>
                      <td className="px-4 py-2 text-xs">{tx.scope === 'household' ? t('household.household') : t('household.personal')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* MONTHLY TRENDS */}
      {reportType === 'trends' && (
        <div className="card">
          <h3 className="section-title">{t('reports.monthlyComparison')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyTrends}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)', fontSize: 12 }} formatter={(v) => formatCurrency(v, currency)} />
              <Bar dataKey="expenses" fill="#DC2626" name={t('reports.expenses')} radius={[4, 4, 0, 0]} />
              <Bar dataKey="income" fill="#059669" name={t('reports.income')} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
