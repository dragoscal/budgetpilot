import { useState, useMemo, useCallback } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { sharedExpenses as sharedApi, settlementHistory as historyApi } from '../../lib/api';
import { getComprehensiveBalances, simplifyDebts, getMemberSummary } from '../../lib/settlement';
import { formatCurrency } from '../../lib/helpers';
import { generateId } from '../../lib/helpers';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, History } from 'lucide-react';

export default function FamilySettlements() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { effectiveUserId } = useAuth();
  const {
    activeFamily, members, sharedExpensesList, familyTransactions,
    familyTransactionsLoading, loadFamilyTransactions,
  } = useFamily();
  const currency = activeFamily?.defaultCurrency || 'RON';
  const isViewer = members.find((m) => m.userId === effectiveUserId)?.role === 'viewer';

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Compute comprehensive balances
  const householdTx = useMemo(
    () => familyTransactions.filter((tx) => tx.scope === 'household'),
    [familyTransactions]
  );

  const balances = useMemo(
    () => getComprehensiveBalances(sharedExpensesList, householdTx),
    [sharedExpensesList, householdTx]
  );
  const settlements = useMemo(() => simplifyDebts(balances), [balances]);
  const memberSummary = useMemo(() => getMemberSummary(sharedExpensesList), [sharedExpensesList]);
  const totalUnsettled = settlements.reduce((s, d) => s + d.amount, 0);

  const getMemberName = (userId) => {
    const m = members.find((m) => m.userId === userId);
    return m ? `${m.emoji || '👤'} ${m.displayName || 'Member'}` : 'Member';
  };

  const handleSettleDebt = useCallback(async (from, to, amount) => {
    // Mark all splits as settled between these two users
    const allShared = await sharedApi.getAll({ familyId: activeFamily.id });
    const updated = [];
    for (const exp of allShared) {
      if (exp.paidByUserId !== to) continue;
      const newSplits = exp.splits.map((s) =>
        s.userId === from && !s.settled ? { ...s, settled: true } : s
      );
      if (JSON.stringify(newSplits) !== JSON.stringify(exp.splits)) {
        const updatedExp = { ...exp, splits: newSplits };
        await sharedApi.update(updatedExp);
        updated.push(updatedExp);
      }
    }

    // Record in settlement history
    await historyApi.create({
      id: generateId(),
      familyId: activeFamily.id,
      fromUserId: from,
      toUserId: to,
      amount,
      settledAt: new Date().toISOString(),
      settledBy: effectiveUserId,
    });

    if (updated.length > 0) {
      toast.success(t('family.debtSettled'));
      loadFamilyTransactions();
    }
  }, [activeFamily, effectiveUserId, loadFamilyTransactions, toast, t]);

  const loadHistory = useCallback(async () => {
    if (historyLoaded) {
      setShowHistory(!showHistory);
      return;
    }
    try {
      const all = await historyApi.getAll();
      const familyHistory = all
        .filter((h) => h.familyId === activeFamily?.id)
        .sort((a, b) => (b.settledAt || '').localeCompare(a.settledAt || ''));
      setHistory(familyHistory);
      setHistoryLoaded(true);
      setShowHistory(true);
    } catch (err) {
      console.error('Failed to load settlement history:', err);
    }
  }, [activeFamily, historyLoaded, showHistory]);

  if (familyTransactionsLoading) {
    return <div className="card animate-pulse"><div className="h-32 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="card">
        <p className="text-xs text-cream-500 mb-1">{t('family.totalUnsettled')}</p>
        <p className={`font-heading font-bold text-2xl money ${totalUnsettled > 0 ? 'text-warning' : 'text-success'}`}>
          {formatCurrency(totalUnsettled, currency)}
        </p>
      </div>

      {/* Simplified debts */}
      {settlements.length > 0 ? (
        <div className="space-y-3">
          <h3 className="section-title">{t('family.simplifiedDebts')}</h3>
          {settlements.map((st, i) => (
            <div key={i} className="card p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{getMemberName(st.from)}</span>
                  <ArrowRight size={14} className="text-cream-400" />
                  <span className="font-medium">{getMemberName(st.to)}</span>
                </div>
                <p className="text-xs text-cream-400 mt-0.5">{t('family.owes')}</p>
              </div>
              <span className="font-heading font-bold text-lg money text-warning">
                {formatCurrency(st.amount, currency)}
              </span>
              {!isViewer && (
                <button
                  onClick={() => handleSettleDebt(st.from, st.to, st.amount)}
                  className="px-3 py-2 rounded-xl bg-success/10 text-success hover:bg-success/20 transition-colors text-xs font-medium flex items-center gap-1"
                >
                  <CheckCircle2 size={14} /> {t('family.settleUp')}
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="card text-center py-8">
          <CheckCircle2 size={32} className="text-success mx-auto mb-2" />
          <p className="text-sm font-medium text-success">{t('family.everyoneSettled')}</p>
          <p className="text-xs text-cream-400">{t('family.noOutstandingDebts')}</p>
        </div>
      )}

      {/* Who paid what */}
      {memberSummary.length > 0 && (
        <div className="card">
          <h3 className="section-title">{t('family.whoPaidWhat')}</h3>
          <div className="space-y-2">
            {memberSummary.sort((a, b) => b.totalPaid - a.totalPaid).map((s) => (
              <div key={s.userId} className="flex items-center justify-between text-sm">
                <span className="font-medium">{getMemberName(s.userId)}</span>
                <div className="text-right">
                  <span className="money font-medium">{formatCurrency(s.totalPaid, currency)}</span>
                  <span className="text-xs text-cream-400 ml-1">{t('family.paid')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settlement history toggle */}
      <button
        onClick={loadHistory}
        className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium text-cream-500 hover:text-cream-700 transition-colors"
      >
        <History size={14} />
        {t('family.settlementHistory')}
        {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {showHistory && (
        <div className="space-y-2">
          {history.length > 0 ? (
            history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 dark:bg-dark-bg text-sm">
                <CheckCircle2 size={14} className="text-success shrink-0" />
                <div className="flex-1">
                  <span className="font-medium">{getMemberName(h.fromUserId)}</span>
                  <ArrowRight size={12} className="inline mx-1 text-cream-400" />
                  <span className="font-medium">{getMemberName(h.toUserId)}</span>
                </div>
                <span className="money font-medium">{formatCurrency(h.amount, currency)}</span>
                <span className="text-[10px] text-cream-400">{new Date(h.settledAt).toLocaleDateString()}</span>
              </div>
            ))
          ) : (
            <p className="text-xs text-cream-400 text-center py-4">{t('family.noSettlementHistory')}</p>
          )}
        </div>
      )}
    </div>
  );
}
