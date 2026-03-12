import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { formatCurrency, generateId, getCategoryById } from '../../lib/helpers';
import { lastDayOfMonth, MONTH_NAMES_RO } from '../../lib/spreadsheetParser';
import { ChevronLeft, ChevronDown, ChevronUp, X, Download, AlertTriangle, Info } from 'lucide-react';

export default function StepPreview({ extractedData, categoryMappings, personMappings, year, currency, effectiveUserId, transactions, setTransactions, onNext, onBack }) {
  const { t } = useTranslation();
  const [expandedMonths, setExpandedMonths] = useState({});
  const [buildWarnings, setBuildWarnings] = useState([]);

  // Generate transactions on mount / when deps change
  useEffect(() => {
    const txs = [];
    const warnings = [];
    let droppedZeroAmount = 0;
    let droppedNoPerson = 0;
    let droppedInvalidMonth = 0;
    const unmappedPersonCounts = {};

    for (const row of extractedData) {
      if (!row.amount || row.amount === 0) {
        droppedZeroAmount++;
        continue;
      }

      const key = row.originalCategory.toLowerCase();
      const mappedCategory = categoryMappings[key] || 'other';
      const mappedPerson = personMappings[row.person];
      if (!mappedPerson) {
        droppedNoPerson++;
        unmappedPersonCounts[row.person] = (unmappedPersonCounts[row.person] || 0) + 1;
        continue;
      }

      // Validate month is in range
      if (!row.month || row.month < 1 || row.month > 12) {
        droppedInvalidMonth++;
        continue;
      }

      const date = lastDayOfMonth(year, row.month);
      const monthName = MONTH_NAMES_RO[row.month] || row.monthName;

      // Validate the mapped category exists in the app
      const catObj = getCategoryById(mappedCategory);
      const safeCategory = catObj ? mappedCategory : 'other';

      txs.push({
        id: generateId(),
        type: safeCategory === 'income' ? 'income' : 'expense',
        merchant: row.originalCategory,
        amount: Math.abs(row.amount),
        currency,
        category: safeCategory,
        subcategory: null,
        date,
        description: `${row.originalCategory} - ${row.person} (${monthName})`.substring(0, 200),
        source: 'spreadsheet-import',
        scope: mappedPerson.type === 'member' ? 'household' : 'personal',
        paidBy: mappedPerson.userId || effectiveUserId,
        splitType: null,
        beneficiaries: [],
        tags: JSON.stringify(['import', monthName.toLowerCase()]),
        userId: effectiveUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Extra display fields (not saved)
        _personName: row.person,
        _monthName: monthName,
        _monthNumber: row.month,
      });
    }

    // Build warning list
    if (droppedZeroAmount > 0) warnings.push(t('import.droppedZeroAmount', { count: droppedZeroAmount }) || `${droppedZeroAmount} rows skipped (zero or missing amount)`);
    if (droppedNoPerson > 0) {
      const personDetails = Object.entries(unmappedPersonCounts).map(([name, count]) => `"${name}" (${count})`).join(', ');
      warnings.push(
        (t('import.droppedNoPerson', { count: droppedNoPerson }) || `${droppedNoPerson} rows skipped (unmapped person)`)
        + ` — ${personDetails}`
      );
    }
    if (droppedInvalidMonth > 0) warnings.push(t('import.droppedInvalidMonth', { count: droppedInvalidMonth }) || `${droppedInvalidMonth} rows skipped (invalid month)`);

    setBuildWarnings(warnings);
    setTransactions(txs);

    // Expand all months by default
    const months = {};
    txs.forEach((tx) => { months[tx._monthNumber] = true; });
    setExpandedMonths(months);
  }, [extractedData, categoryMappings, personMappings, year, currency, effectiveUserId]);

  // Group by month
  const groupedByMonth = useMemo(() => {
    const groups = {};
    transactions.forEach((tx) => {
      const m = tx._monthNumber;
      if (!groups[m]) groups[m] = { monthName: tx._monthName, monthNumber: m, transactions: [] };
      groups[m].transactions.push(tx);
    });
    return Object.values(groups).sort((a, b) => a.monthNumber - b.monthNumber);
  }, [transactions]);

  const toggleMonth = (m) => {
    setExpandedMonths((prev) => ({ ...prev, [m]: !prev[m] }));
  };

  const toggleAll = () => {
    const allExpanded = groupedByMonth.every((g) => expandedMonths[g.monthNumber]);
    const next = {};
    groupedByMonth.forEach((g) => { next[g.monthNumber] = !allExpanded; });
    setExpandedMonths(next);
  };

  const removeTransaction = (id) => {
    setTransactions((prev) => prev.filter((tx) => tx.id !== id));
  };

  // Totals
  const grandTotal = transactions.reduce((s, tx) => s + tx.amount, 0);
  const personTotals = useMemo(() => {
    const totals = {};
    transactions.forEach((tx) => {
      const name = tx._personName;
      totals[name] = (totals[name] || 0) + tx.amount;
    });
    return totals;
  }, [transactions]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="section-title">{t('import.preview')}</h3>
        <p className="text-xs text-cream-500">{t('import.previewHint')}</p>
      </div>

      {/* Warnings about dropped rows */}
      {buildWarnings.length > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-warning/8 border border-warning/25">
          <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
          <div className="text-xs text-warning space-y-1.5">
            <p className="font-semibold text-sm">{t('import.droppedRowsTitle') || 'Some rows were excluded'}</p>
            {buildWarnings.map((w, i) => <p key={i}>{w}</p>)}
            <p className="text-cream-500 text-[11px]">{t('import.droppedRowsHint') || 'Go back to the person mapping step to map any missing persons.'}</p>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="px-3 py-1.5 rounded-lg bg-cream-100 dark:bg-dark-border">
          <span className="text-cream-500 text-xs">{t('import.transactionCount', { count: transactions.length })}</span>
        </div>
        {Object.entries(personTotals).map(([name, total]) => (
          <div key={name} className="px-3 py-1.5 rounded-lg bg-cream-100 dark:bg-dark-border">
            <span className="text-xs">{t('import.personTotal', { name, amount: formatCurrency(total, currency) })}</span>
          </div>
        ))}
        <div className="px-3 py-1.5 rounded-lg bg-accent-50 dark:bg-accent-500/10 font-medium">
          <span className="text-xs text-accent-700 dark:text-accent-300">{t('import.grandTotal', { amount: formatCurrency(grandTotal, currency) })}</span>
        </div>
      </div>

      {/* Grouped transactions */}
      {groupedByMonth.length > 0 && (
        <div className="flex justify-end">
          <button onClick={toggleAll} className="btn-ghost text-xs">
            {groupedByMonth.every((g) => expandedMonths[g.monthNumber])
              ? (t('import.collapseAll') || 'Collapse all')
              : (t('import.expandAll') || 'Expand all')}
          </button>
        </div>
      )}

      <div className="space-y-3">
        {groupedByMonth.map((group) => {
          const expanded = expandedMonths[group.monthNumber];
          const monthTotal = group.transactions.reduce((s, tx) => s + tx.amount, 0);

          return (
            <div key={group.monthNumber} className="border border-cream-200 dark:border-dark-border rounded-xl overflow-hidden">
              {/* Month header */}
              <button
                onClick={() => toggleMonth(group.monthNumber)}
                className="w-full flex items-center justify-between px-4 py-3 bg-cream-50 dark:bg-dark-card hover:bg-cream-100 dark:hover:bg-dark-border transition-colors"
              >
                <div className="flex items-center gap-2">
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span className="text-sm font-medium">
                    {t('import.monthGroup', { month: group.monthName, year })}
                  </span>
                  <span className="text-xs text-cream-400">({group.transactions.length})</span>
                </div>
                <span className="text-sm font-medium money">{formatCurrency(monthTotal, currency)}</span>
              </button>

              {/* Transactions */}
              {expanded && (
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {group.transactions.map((tx) => {
                    const cat = getCategoryById(tx.category) || { icon: '❓', name: 'other' };
                    return (
                      <div key={tx.id} className="flex items-center gap-3 px-4 py-2 text-xs hover:bg-cream-50 dark:hover:bg-dark-card/50">
                        <span className="text-base w-6 text-center">{cat.icon}</span>
                        <span className="flex-1 min-w-0 truncate capitalize">{tx.merchant}</span>
                        <span className="text-cream-500 w-16 truncate">{tx._personName}</span>
                        <span className="text-cream-400">{tx.date}</span>
                        <span className="font-mono font-medium w-20 text-right money">{formatCurrency(tx.amount, currency)}</span>
                        <button
                          onClick={() => removeTransaction(tx.id)}
                          className="p-1 rounded-full hover:bg-danger/10 text-cream-400 hover:text-danger"
                          title={t('import.removeTransaction')}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {transactions.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-8 text-cream-400">
          <Info size={24} />
          <p className="text-sm">{t('import.noTransactions') || 'No transactions to import. Go back and check your mappings.'}</p>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1">
          <ChevronLeft size={16} /> {t('common.back')}
        </button>
        <button onClick={onNext} disabled={transactions.length === 0} className="btn-primary flex items-center gap-2">
          <Download size={16} /> {t('import.importAll', { count: transactions.length })}
        </button>
      </div>
    </div>
  );
}
