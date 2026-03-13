import { useState, useEffect, useMemo, useRef } from 'react';
import { people as peopleApi, debts as debtsApi, debtPayments as paymentsApi, transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { generateId, formatCurrency, sumBy, todayLocal, calculateSettlements } from '../lib/helpers';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import {
  Users, ArrowUpRight, ArrowDownLeft, Check, Trash2,
  ChevronRight, Wallet, TrendingUp, TrendingDown, Clock,
  HandCoins, Banknote, UserPlus, DollarSign, CalendarClock, AlertTriangle, Info,
  Scale, ArrowRight,
} from 'lucide-react';
import { SkeletonPage } from '../components/LoadingSkeleton';
import HelpButton from '../components/HelpButton';

export default function People() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [peopleList, setPeople] = useState([]);
  const [debtsList, setDebts] = useState([]);
  const [paymentsList, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPersonForm, setShowPersonForm] = useState(false);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [settleDebt, setSettleDebt] = useState(null);
  const [settleAmount, setSettleAmount] = useState('');
  const [activeFilter, setActiveFilter] = useState('all'); // all | owed | owing | settled
  const [showSettlement, setShowSettlement] = useState(false);
  const [settlingAll, setSettlingAll] = useState(false);

  const [personForm, setPersonForm] = useState({ name: '', emoji: '👤', phone: '', notes: '' });
  const [debtForm, setDebtForm] = useState({
    personId: '', type: 'lent', amount: '', reason: '', dueDate: '',
    date: todayLocal(),
  });

  const currency = user?.defaultCurrency || 'RON';

  const EMOJI_OPTIONS = ['👤', '👩', '👨', '🧑', '👩‍💼', '👨‍💼', '🧔', '👱', '👸', '🤴', '🧑‍🤝‍🧑', '👥', '🏢', '🏠'];
  const loadVersion = useRef(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    const load = async () => {
      setLoading(true);
      try {
        const [people, debts, payments] = await Promise.all([
          peopleApi.getAll({ userId: effectiveUserId }),
          debtsApi.getAll({ userId: effectiveUserId }),
          paymentsApi.getAll({ userId: effectiveUserId }),
        ]);
        if (loadVersion.current !== version) return;
        setPeople(people);
        setDebts(debts);
        setPayments(payments);
      } catch (err) { if (loadVersion.current === version) toast.error(t('people.failedLoad')); }
      finally { if (loadVersion.current === version) setLoading(false); }
    };
    load();
  }, [effectiveUserId]);

  const loadData = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const [people, debts, payments] = await Promise.all([
        peopleApi.getAll({ userId: effectiveUserId }),
        debtsApi.getAll({ userId: effectiveUserId }),
        paymentsApi.getAll({ userId: effectiveUserId }),
      ]);
      if (loadVersion.current !== version) return;
      setPeople(people);
      setDebts(debts);
      setPayments(payments);
    } catch (err) { if (loadVersion.current === version) toast.error(t('people.failedLoad')); }
    finally { if (loadVersion.current === version) setLoading(false); }
  };

  // Calculate balances per person
  const balances = useMemo(() => {
    const map = {};
    for (const person of peopleList) {
      const personDebts = debtsList.filter((d) => d.personId === person.id);
      const activeDebts = personDebts.filter((d) => d.status !== 'settled');
      const settledDebts = personDebts.filter((d) => d.status === 'settled');
      const lent = sumBy(activeDebts.filter((d) => d.type === 'lent'), (d) => d.remaining ?? d.amount);
      const borrowed = sumBy(activeDebts.filter((d) => d.type === 'borrowed'), (d) => d.remaining ?? d.amount);
      const totalLent = sumBy(personDebts.filter((d) => d.type === 'lent'), (d) => d.amount);
      const totalBorrowed = sumBy(personDebts.filter((d) => d.type === 'borrowed'), (d) => d.amount);
      map[person.id] = {
        lent, borrowed, net: lent - borrowed,
        totalLent, totalBorrowed,
        activeCount: activeDebts.length,
        settledCount: settledDebts.length,
        debts: personDebts,
      };
    }
    return map;
  }, [peopleList, debtsList]);

  const totalOwedToYou = sumBy(Object.values(balances).filter((b) => b.net > 0), 'net');
  const totalYouOwe = sumBy(Object.values(balances).filter((b) => b.net < 0), (b) => Math.abs(b.net));
  const netBalance = totalOwedToYou - totalYouOwe;
  const activeDebtsCount = debtsList.filter(d => d.status !== 'settled').length;

  // Settlement plan: calculate optimal payments between people
  const settlementPlan = useMemo(() => {
    // Build debts array: "from" owes "to" money
    // For lent debts: the person (personId) owes you (user) money -> from=personName, to="You"
    // For borrowed debts: you owe the person -> from="You", to=personName
    const debts = [];
    const activeDebts = debtsList.filter(d => d.status !== 'settled');
    for (const debt of activeDebts) {
      const person = peopleList.find(p => p.id === debt.personId);
      const personName = person?.name || 'Unknown';
      const remaining = debt.remaining ?? debt.amount;
      if (remaining <= 0) continue;
      if (debt.type === 'lent') {
        // They owe you
        debts.push({ from: personName, to: 'You', amount: remaining });
      } else {
        // You owe them
        debts.push({ from: 'You', to: personName, amount: remaining });
      }
    }
    return calculateSettlements(debts);
  }, [debtsList, peopleList]);

  // Handle mark-all-as-settled: create offsetting transactions
  const handleSettleAll = async () => {
    if (settlementPlan.length === 0) return;
    setSettlingAll(true);
    try {
      const today = todayLocal();
      for (const s of settlementPlan) {
        // Create a settlement transaction for each payment
        const isYouPaying = s.from === 'You';
        await txApi.create({
          id: generateId(),
          type: isYouPaying ? 'expense' : 'income',
          merchant: isYouPaying ? s.to : s.from,
          amount: s.amount,
          currency,
          category: 'transfer',
          date: today,
          description: `${t('people.settlementPlan')}: ${s.from} ${t('people.pays')} ${s.to}`,
          source: 'manual',
          tags: ['debt-settlement'],
          userId: effectiveUserId,
          createdAt: new Date().toISOString(),
        });
      }

      // Mark all active debts as settled
      const activeDebts = debtsList.filter(d => d.status !== 'settled');
      for (const debt of activeDebts) {
        await debtsApi.update(debt.id, {
          remaining: 0,
          status: 'settled',
          settledDate: today,
        });
      }

      toast.success(t('people.settlementCreated'));
      setShowSettlement(false);
      loadData();
    } catch (err) {
      toast.error(err.message || 'Failed to create settlements');
    } finally {
      setSettlingAll(false);
    }
  };

  // Filter people
  const filteredPeople = useMemo(() => {
    return peopleList.filter((p) => {
      const bal = balances[p.id] || { net: 0, activeCount: 0, settledCount: 0 };
      if (activeFilter === 'owed') return bal.net > 0;
      if (activeFilter === 'owing') return bal.net < 0;
      if (activeFilter === 'settled') return bal.net === 0 && bal.settledCount > 0;
      return true;
    }).sort((a, b) => {
      const balA = Math.abs(balances[a.id]?.net || 0);
      const balB = Math.abs(balances[b.id]?.net || 0);
      return balB - balA;
    });
  }, [peopleList, balances, activeFilter]);

  const handleAddPerson = async () => {
    if (!personForm.name.trim()) { toast.error(t('people.nameRequired')); return; }
    try {
      await peopleApi.create({
        id: generateId(), ...personForm, userId: effectiveUserId, createdAt: new Date().toISOString(),
      });
      toast.success(t('people.saved'));
      setShowPersonForm(false);
      setPersonForm({ name: '', emoji: '👤', phone: '', notes: '' });
      loadData();
    } catch (err) {
      toast.error(err.message || t('people.failedAdd'));
    }
  };

  const handleAddDebt = async () => {
    if (!debtForm.personId || !debtForm.amount) { toast.error(t('people.selectPersonAndAmount')); return; }
    const person = peopleList.find(p => p.id === debtForm.personId);
    const personName = person?.name || 'Unknown';
    const amount = Number(debtForm.amount);
    const debtDate = debtForm.date || todayLocal();
    const debtId = generateId();

    await debtsApi.create({
      id: debtId, ...debtForm, amount,
      remaining: amount, currency, status: 'active',
      date: debtDate, userId: effectiveUserId, createdAt: new Date().toISOString(),
    });

    // Auto-create a linked transaction
    await txApi.create({
      id: generateId(),
      type: debtForm.type === 'lent' ? 'expense' : 'income',
      merchant: personName,
      amount,
      currency,
      category: debtForm.type === 'lent' ? 'transfer' : 'transfer',
      date: debtDate,
      description: `${debtForm.type === 'lent' ? t('people.lentTo') : t('people.borrowedFrom')} ${personName}${debtForm.reason ? ` — ${debtForm.reason}` : ''}`,
      source: 'manual',
      notes: `Debt #${debtId.slice(0, 8)}`,
      tags: ['debt'],
      userId: effectiveUserId,
      createdAt: new Date().toISOString(),
    });

    toast.success(t('people.debtSaved'));
    setShowDebtForm(false);
    setDebtForm({
      personId: '', type: 'lent', amount: '', reason: '', dueDate: '',
      date: todayLocal(),
    });
    loadData();
  };

  const handleSettle = async () => {
    if (!settleDebt || !settleAmount) return;
    const amt = Number(settleAmount);
    const remaining = (settleDebt.remaining ?? settleDebt.amount) - amt;
    const today = todayLocal();

    // Find the person name for the transaction
    const person = peopleList.find(p => p.id === settleDebt.personId);
    const personName = person?.name || 'Unknown';

    await debtsApi.update(settleDebt.id, {
      remaining: Math.max(0, remaining),
      status: remaining <= 0 ? 'settled' : 'partial',
      settledDate: remaining <= 0 ? today : undefined,
    });
    await paymentsApi.create({
      id: generateId(), debtId: settleDebt.id, amount: amt,
      date: today, createdAt: new Date().toISOString(),
    });

    // Auto-create a linked transaction for the settlement
    await txApi.create({
      id: generateId(),
      type: settleDebt.type === 'lent' ? 'income' : 'expense',
      merchant: personName,
      amount: amt,
      currency,
      category: 'transfer',
      date: today,
      description: `${settleDebt.type === 'lent' ? t('people.receivedFrom') : t('people.paidTo')} ${personName}${settleDebt.reason ? ` — ${settleDebt.reason}` : ''}`,
      source: 'manual',
      notes: `${t('people.settlementForDebt')} #${settleDebt.id.slice(0, 8)}`,
      tags: ['debt-settlement'],
      userId: effectiveUserId,
      createdAt: new Date().toISOString(),
    });

    toast.success(remaining <= 0 ? t('people.debtSettled') : t('people.partialPaymentRecorded'));
    setSettleDebt(null);
    setSettleAmount('');
    setSelectedPerson(null);
    loadData();
  };

  const handleDeletePerson = async (person) => {
    const personDebtsActive = debtsList.filter(d => d.personId === person.id && d.status !== 'settled');
    if (personDebtsActive.length > 0) {
      toast.error(t('people.settleAllDebtsFirst'));
      return;
    }
    await peopleApi.remove(person.id);
    toast.success(t('people.deleted'));
    if (selectedPerson === person.id) setSelectedPerson(null);
    loadData();
  };

  const getPersonDebts = (personId) => {
    return debtsList
      .filter(d => d.personId === personId)
      .sort((a, b) => {
        if (a.status === 'settled' && b.status !== 'settled') return 1;
        if (a.status !== 'settled' && b.status === 'settled') return -1;
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
  };

  const getDebtPayments = (debtId) => {
    return paymentsList.filter(p => p.debtId === debtId).sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const selectedPersonData = selectedPerson ? peopleList.find(p => p.id === selectedPerson) : null;
  const selectedPersonBal = selectedPerson ? (balances[selectedPerson] || { net: 0, lent: 0, borrowed: 0 }) : null;

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title mb-0">{t('people.title')}</h1>
            <HelpButton section="people" />
          </div>
          <p className="text-xs text-cream-500 mt-1">{t('people.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {activeDebtsCount > 0 && (
            <button
              onClick={() => setShowSettlement(true)}
              className="btn-ghost text-xs flex items-center gap-1.5 h-9 border border-cream-200 dark:border-dark-border"
            >
              <Scale size={14} /> {t('people.settleUp')}
            </button>
          )}
          <button
            onClick={() => setShowPersonForm(true)}
            className="btn-secondary text-xs flex items-center gap-1.5 h-9"
          >
            <UserPlus size={14} /> {t('people.person')}
          </button>
          <button
            onClick={() => setShowDebtForm(true)}
            className="btn-primary text-xs flex items-center gap-1.5 h-9"
          >
            <HandCoins size={14} /> {t('people.lendBorrow')}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center">
              <TrendingUp size={16} className="text-success" />
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">{t('people.owedToYou')}</p>
          <p className="text-xl font-heading font-bold text-success money mt-0.5">
            +{formatCurrency(totalOwedToYou, currency)}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-danger/10 flex items-center justify-center">
              <TrendingDown size={16} className="text-danger" />
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">{t('people.youOwe')}</p>
          <p className="text-xl font-heading font-bold text-danger money mt-0.5">
            -{formatCurrency(totalYouOwe, currency)}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-info/10 flex items-center justify-center">
              <Wallet size={16} className="text-info" />
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">{t('people.netBalance')}</p>
          <p className={`text-xl font-heading font-bold money mt-0.5 ${netBalance >= 0 ? 'text-success' : 'text-danger'}`}>
            {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance, currency)}
          </p>
        </div>

        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-xl bg-warning/10 flex items-center justify-center">
              <Clock size={16} className="text-warning" />
            </div>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">{t('people.activeDebts')}</p>
          <p className="text-xl font-heading font-bold text-cream-800 dark:text-cream-200 mt-0.5">
            {activeDebtsCount}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: t('common.all') },
          { id: 'owed', label: t('people.owedToMe') },
          { id: 'owing', label: t('people.iOwe') },
          { id: 'settled', label: t('people.settled') },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setActiveFilter(f.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeFilter === f.id
                ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                : 'bg-cream-200 text-cream-600 hover:bg-cream-300 dark:bg-dark-border dark:text-cream-500'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* People List + Detail */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* People List — left column */}
        <div className={`space-y-2 ${selectedPerson ? 'md:col-span-2' : 'md:col-span-5'}`}>
          {filteredPeople.length > 0 ? (
            filteredPeople.map((person) => {
              const bal = balances[person.id] || { lent: 0, borrowed: 0, net: 0, activeCount: 0 };
              const isActive = selectedPerson === person.id;
              return (
                <div
                  key={person.id}
                  onClick={() => setSelectedPerson(isActive ? null : person.id)}
                  className={`card p-3.5 cursor-pointer transition-all hover:shadow-md ${
                    isActive
                      ? 'ring-2 ring-cream-900 dark:ring-cream-100 shadow-md'
                      : 'hover:bg-cream-50 dark:hover:bg-dark-border/50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${
                      bal.net > 0
                        ? 'bg-success/10'
                        : bal.net < 0
                        ? 'bg-danger/10'
                        : 'bg-cream-200 dark:bg-dark-border'
                    }`}>
                      {person.emoji || '👤'}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">{person.name}</p>
                        {bal.activeCount > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-200 dark:bg-dark-border text-cream-600 dark:text-cream-400">
                            {bal.activeCount} {t('common.active').toLowerCase()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-cream-500 mt-0.5">
                        {bal.net > 0 ? t('people.owesYou') :
                         bal.net < 0 ? t('people.youOwe') :
                         bal.activeCount === 0 ? t('people.allSettled') : t('people.even')}
                      </p>
                    </div>

                    {/* Balance */}
                    <div className="text-right">
                      <p className={`font-heading font-bold money text-sm ${
                        bal.net > 0 ? 'text-success' : bal.net < 0 ? 'text-danger' : 'text-cream-400'
                      }`}>
                        {bal.net > 0 ? '+' : ''}{formatCurrency(bal.net, currency)}
                      </p>
                    </div>

                    <ChevronRight size={14} className={`text-cream-400 transition-transform ${isActive ? 'rotate-90' : ''}`} />
                  </div>
                </div>
              );
            })
          ) : (
            <EmptyState
              icon={Users}
              title={activeFilter === 'all' ? t('people.noPeople') : t('people.noMatches')}
              description={activeFilter === 'all' ? t('people.noPeopleDesc') : t('people.tryDifferentFilter')}
              action={activeFilter === 'all' ? t('people.createFirst') : undefined}
              onAction={activeFilter === 'all' ? () => setShowPersonForm(true) : undefined}
            />
          )}
        </div>

        {/* Person Detail — right column */}
        {selectedPerson && selectedPersonData && (
          <div className="md:col-span-3 space-y-4">
            {/* Person header card */}
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-lg flex items-center justify-center text-3xl ${
                    selectedPersonBal.net > 0
                      ? 'bg-success/10'
                      : selectedPersonBal.net < 0
                      ? 'bg-danger/10'
                      : 'bg-cream-200 dark:bg-dark-border'
                  }`}>
                    {selectedPersonData.emoji || '👤'}
                  </div>
                  <div>
                    <h2 className="font-heading text-lg font-bold">{selectedPersonData.name}</h2>
                    {selectedPersonData.phone && (
                      <p className="text-xs text-cream-500">{selectedPersonData.phone}</p>
                    )}
                    {selectedPersonData.notes && (
                      <p className="text-xs text-cream-500 italic">{selectedPersonData.notes}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeletePerson(selectedPersonData); }}
                  className="p-2 rounded-xl hover:bg-danger/10 text-cream-400 hover:text-danger transition-colors"
                  title={t('people.deletePerson')}
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-success/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-cream-500 mb-0.5">{t('people.lent')}</p>
                  <p className="font-heading font-bold text-success money text-sm">
                    {formatCurrency(selectedPersonBal.lent, currency)}
                  </p>
                </div>
                <div className="bg-danger/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-cream-500 mb-0.5">{t('people.borrowed')}</p>
                  <p className="font-heading font-bold text-danger money text-sm">
                    {formatCurrency(selectedPersonBal.borrowed, currency)}
                  </p>
                </div>
                <div className={`${selectedPersonBal.net >= 0 ? 'bg-success/5' : 'bg-danger/5'} rounded-xl p-3 text-center`}>
                  <p className="text-[10px] uppercase tracking-wider text-cream-500 mb-0.5">{t('people.net')}</p>
                  <p className={`font-heading font-bold money text-sm ${selectedPersonBal.net >= 0 ? 'text-success' : 'text-danger'}`}>
                    {selectedPersonBal.net >= 0 ? '+' : ''}{formatCurrency(selectedPersonBal.net, currency)}
                  </p>
                </div>
              </div>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setDebtForm(f => ({ ...f, personId: selectedPerson, type: 'lent' })); setShowDebtForm(true); }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-success/10 text-success text-xs font-medium hover:bg-success/20 transition-colors"
              >
                <ArrowUpRight size={14} /> {t('people.iLentThem')}
              </button>
              <button
                onClick={() => { setDebtForm(f => ({ ...f, personId: selectedPerson, type: 'borrowed' })); setShowDebtForm(true); }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
              >
                <ArrowDownLeft size={14} /> {t('people.iBorrowed')}
              </button>
              {selectedPersonBal.lent > 0 && (
                <button
                  onClick={() => {
                    const firstLent = getPersonDebts(selectedPerson).find(d => d.type === 'lent' && d.status !== 'settled');
                    if (firstLent) { setSettleDebt(firstLent); setSettleAmount((firstLent.remaining ?? firstLent.amount).toString()); }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-info/10 text-info text-xs font-medium hover:bg-info/20 transition-colors"
                >
                  <Banknote size={14} /> {t('people.receivePayment')}
                </button>
              )}
              {selectedPersonBal.borrowed > 0 && (
                <button
                  onClick={() => {
                    const firstBorrowed = getPersonDebts(selectedPerson).find(d => d.type === 'borrowed' && d.status !== 'settled');
                    if (firstBorrowed) { setSettleDebt(firstBorrowed); setSettleAmount((firstBorrowed.remaining ?? firstBorrowed.amount).toString()); }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
                >
                  <Wallet size={14} /> {t('people.payBack')}
                </button>
              )}
            </div>

            {/* Settle all net balance */}
            {selectedPersonBal.net !== 0 && (
              <div className="bg-cream-50 dark:bg-dark-card rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">
                    {selectedPersonBal.net > 0
                      ? `${selectedPersonData.name} ${t('people.owesYouVerb')}`
                      : `${t('people.youOweVerb')} ${selectedPersonData.name}`}
                  </p>
                  <p className={`font-heading font-bold money text-lg ${selectedPersonBal.net > 0 ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(Math.abs(selectedPersonBal.net), currency)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    // Find all unsettled debts for this person and settle the first one
                    const activeDebts = getPersonDebts(selectedPerson).filter(d => d.status !== 'settled');
                    if (activeDebts.length === 1) {
                      setSettleDebt(activeDebts[0]);
                      setSettleAmount((activeDebts[0].remaining ?? activeDebts[0].amount).toString());
                    } else if (activeDebts.length > 1) {
                      // Open first debt for settling
                      setSettleDebt(activeDebts[0]);
                      setSettleAmount((activeDebts[0].remaining ?? activeDebts[0].amount).toString());
                    }
                  }}
                  className="btn-primary text-xs px-4 py-2"
                >
                  {selectedPersonBal.net > 0 ? t('people.receiveNow') : t('people.payNow')}
                </button>
              </div>
            )}

            {/* Debt history */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-3">{t('people.debtHistory')}</h3>
              <div className="space-y-3">
                {getPersonDebts(selectedPerson).length > 0 ? (
                  getPersonDebts(selectedPerson).map((debt) => {
                    const isSettled = debt.status === 'settled';
                    const isLent = debt.type === 'lent';
                    const remaining = debt.remaining ?? debt.amount;
                    const paidPct = debt.amount > 0 ? Math.round(((debt.amount - remaining) / debt.amount) * 100) : 0;
                    const debtPays = getDebtPayments(debt.id);
                    const isOverdue = !isSettled && debt.dueDate && new Date(debt.dueDate) < new Date();
                    return (
                      <div
                        key={debt.id}
                        className={`p-3 rounded-xl border transition-colors ${
                          isSettled
                            ? 'bg-cream-50 dark:bg-dark-bg border-cream-200 dark:border-dark-border opacity-60'
                            : isOverdue
                            ? 'border-danger/40 bg-danger/5'
                            : 'border-cream-200 dark:border-dark-border'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isLent ? 'bg-success/10' : 'bg-danger/10'
                            }`}>
                              {isLent
                                ? <ArrowUpRight size={14} className="text-success" />
                                : <ArrowDownLeft size={14} className="text-danger" />}
                            </div>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-medium">
                                  {isLent ? t('people.lent') : t('people.borrowed')}
                                </span>
                                {isSettled && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">
                                    {t('people.settled')}
                                  </span>
                                )}
                                {debt.status === 'partial' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
                                    {t('people.partial')}
                                  </span>
                                )}
                                {isOverdue && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/10 text-danger font-medium flex items-center gap-0.5">
                                    <AlertTriangle size={8} /> {t('people.overdue')}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-cream-500 mt-0.5">
                                {debt.reason && <span>{debt.reason}</span>}
                                {debt.reason && <span>·</span>}
                                <span>{debt.date}</span>
                                {debt.dueDate && (
                                  <>
                                    <span>·</span>
                                    <span className="flex items-center gap-0.5">
                                      <CalendarClock size={10} /> {t('people.due')} {debt.dueDate}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-heading font-bold money text-sm ${isLent ? 'text-success' : 'text-danger'}`}>
                              {formatCurrency(debt.amount, currency)}
                            </p>
                            {!isSettled && remaining !== debt.amount && (
                              <p className="text-[10px] text-cream-500">
                                {formatCurrency(remaining, currency)} {t('people.left')}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Progress bar for partial */}
                        {!isSettled && paidPct > 0 && (
                          <div className="mt-2">
                            <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                              <div
                                className="h-full bg-success rounded-full transition-all"
                                style={{ width: `${paidPct}%` }}
                              />
                            </div>
                            <p className="text-[10px] text-cream-500 mt-0.5">{paidPct}% {t('people.paid')}</p>
                          </div>
                        )}

                        {/* Payment history */}
                        {debtPays.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-cream-100 dark:border-dark-border space-y-1">
                            {debtPays.map((pay) => (
                              <div key={pay.id} className="flex items-center justify-between text-xs text-cream-500">
                                <span className="flex items-center gap-1">
                                  <Check size={10} className="text-success" /> {t('people.paymentOn')} {pay.date}
                                </span>
                                <span className="money font-medium">{formatCurrency(pay.amount, currency)}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Action buttons */}
                        {!isSettled && (
                          <div className="mt-2 flex gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSettleDebt(debt);
                                setSettleAmount(remaining.toString());
                              }}
                              className={`flex-1 py-1.5 text-xs font-medium rounded-lg flex items-center justify-center gap-1 transition-colors ${
                                isLent
                                  ? 'bg-success/10 text-success hover:bg-success/20'
                                  : 'bg-warning/10 text-warning hover:bg-warning/20'
                              }`}
                            >
                              <Banknote size={12} />
                              {isLent ? t('people.receive') : t('people.payBack')} {formatCurrency(remaining, currency)}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-cream-500 text-center py-4">{t('people.noDebtsWithPerson')}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add person modal */}
      <Modal open={showPersonForm} onClose={() => setShowPersonForm(false)} title={t('people.addPerson')}>
        <div className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="label">{t('people.avatar')}</label>
            <div className="flex flex-wrap gap-2">
              {EMOJI_OPTIONS.map((em) => (
                <button
                  key={em}
                  onClick={() => setPersonForm((f) => ({ ...f, emoji: em }))}
                  className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${
                    personForm.emoji === em
                      ? 'bg-cream-900 dark:bg-cream-100 scale-110 ring-2 ring-cream-900 dark:ring-cream-100'
                      : 'bg-cream-100 dark:bg-dark-border hover:bg-cream-200 dark:hover:bg-dark-border/70'
                  }`}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">{t('people.name')}</label>
            <input
              className="input"
              value={personForm.name}
              onChange={(e) => setPersonForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={t('people.namePlaceholder')}
              autoFocus
            />
          </div>
          <div>
            <label className="label">{t('people.phone')}</label>
            <input
              className="input"
              value={personForm.phone}
              onChange={(e) => setPersonForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+40 7..."
            />
          </div>
          <div>
            <label className="label">{t('people.notes')}</label>
            <input
              className="input"
              value={personForm.notes}
              onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t('people.notesPlaceholder')}
            />
          </div>
          <button onClick={handleAddPerson} className="btn-primary w-full">{t('people.addPerson')}</button>
        </div>
      </Modal>

      {/* Add debt modal */}
      <Modal open={showDebtForm} onClose={() => setShowDebtForm(false)} title={t('people.recordDebt')}>
        <div className="space-y-4">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDebtForm((f) => ({ ...f, type: 'lent' }))}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                debtForm.type === 'lent'
                  ? 'border-success bg-success/5'
                  : 'border-cream-200 dark:border-dark-border hover:border-cream-300'
              }`}
            >
              <ArrowUpRight size={18} className={`mx-auto mb-1 ${debtForm.type === 'lent' ? 'text-success' : 'text-cream-400'}`} />
              <span className={`text-xs font-medium ${debtForm.type === 'lent' ? 'text-success' : 'text-cream-600'}`}>
                {t('people.iLentMoney')}
              </span>
            </button>
            <button
              onClick={() => setDebtForm((f) => ({ ...f, type: 'borrowed' }))}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                debtForm.type === 'borrowed'
                  ? 'border-danger bg-danger/5'
                  : 'border-cream-200 dark:border-dark-border hover:border-cream-300'
              }`}
            >
              <ArrowDownLeft size={18} className={`mx-auto mb-1 ${debtForm.type === 'borrowed' ? 'text-danger' : 'text-cream-400'}`} />
              <span className={`text-xs font-medium ${debtForm.type === 'borrowed' ? 'text-danger' : 'text-cream-600'}`}>
                {t('people.iBorrowedMoney')}
              </span>
            </button>
          </div>

          <div>
            <label className="label">{t('people.person')}</label>
            <select
              className="input"
              value={debtForm.personId}
              onChange={(e) => setDebtForm((f) => ({ ...f, personId: e.target.value }))}
            >
              <option value="">{t('people.selectPerson')}</option>
              {peopleList.map((p) => (
                <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">{t('people.debtAmount')} ({currency})</label>
            <div className="relative">
              <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
              <input
                type="number"
                className="input pl-8"
                value={debtForm.amount}
                onChange={(e) => setDebtForm((f) => ({ ...f, amount: e.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="label">{t('people.debtReason')}</label>
            <input
              className="input"
              value={debtForm.reason}
              onChange={(e) => setDebtForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder={t('people.debtReasonPlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('people.debtDate')}</label>
              <input
                type="date"
                className="input"
                value={debtForm.date}
                onChange={(e) => setDebtForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">{t('people.dueDate')}</label>
              <input
                type="date"
                className="input"
                value={debtForm.dueDate}
                onChange={(e) => setDebtForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>

          <p className="text-[10px] text-cream-500 flex items-center gap-1">
            <Info size={10} /> {t('people.autoTransactionNote')}
          </p>

          <button onClick={handleAddDebt} className="btn-primary w-full">
            {t('people.recordDebtType', { type: debtForm.type === 'lent' ? t('people.loan') : t('people.debt') })}
          </button>
        </div>
      </Modal>

      {/* Settle modal */}
      <Modal
        open={!!settleDebt}
        onClose={() => setSettleDebt(null)}
        title={settleDebt?.type === 'lent' ? t('people.receivePayment') : t('people.makePayment')}
      >
        {settleDebt && (() => {
          const debtPerson = peopleList.find(p => p.id === settleDebt.personId);
          const debtPersonName = debtPerson?.name || 'Unknown';
          const fullAmt = settleDebt.remaining ?? settleDebt.amount;
          const isLentDebt = settleDebt.type === 'lent';
          return (
            <div className="space-y-4">
              {/* Summary */}
              <div className={`rounded-xl p-3 ${isLentDebt ? 'bg-success/5' : 'bg-danger/5'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{debtPerson?.emoji || '👤'}</span>
                  <span className="font-medium text-sm">{debtPersonName}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-cream-600 dark:text-cream-400">
                    {isLentDebt ? t('people.theyOweYou') : t('people.youOweThem')}
                  </span>
                  <span className={`font-heading font-bold money ${isLentDebt ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(fullAmt, currency)}
                  </span>
                </div>
                {settleDebt.reason && (
                  <p className="text-xs text-cream-500 mt-1">{t('people.for')}: {settleDebt.reason}</p>
                )}
                {settleDebt.date && (
                  <p className="text-xs text-cream-500">{t('people.since')}: {settleDebt.date}</p>
                )}
              </div>

              {/* Amount input */}
              <div>
                <label className="label">
                  {isLentDebt ? t('people.amountReceived') : t('people.amountToPay')}
                </label>
                <div className="relative">
                  <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
                  <input
                    type="number"
                    className="input pl-8"
                    value={settleAmount}
                    onChange={(e) => setSettleAmount(e.target.value)}
                    inputMode="decimal"
                    autoFocus
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  {[0.25, 0.5, 1].map((frac) => {
                    const val = Math.round(fullAmt * frac * 100) / 100;
                    return (
                      <button
                        key={frac}
                        onClick={() => setSettleAmount(val.toString())}
                        className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${
                          Number(settleAmount) === val
                            ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                            : 'bg-cream-200 dark:bg-dark-border hover:bg-cream-300 dark:hover:bg-dark-border/70'
                        }`}
                      >
                        {frac === 1 ? t('people.fullAmount') : `${frac * 100}%`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Info about what will happen */}
              <div className="text-[10px] text-cream-500 flex items-center gap-1">
                <Info size={10} />
                {isLentDebt
                  ? t('people.incomeTransactionNote')
                  : t('people.expenseTransactionNote')}
              </div>

              <button
                onClick={handleSettle}
                className={`w-full py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-1.5 transition-colors ${
                  isLentDebt
                    ? 'bg-success text-white hover:bg-success/90'
                    : 'bg-danger text-white hover:bg-danger/90'
                }`}
              >
                {isLentDebt ? <Banknote size={14} /> : <Wallet size={14} />}
                {Number(settleAmount) >= fullAmt
                  ? (isLentDebt ? t('people.receivedSettleFully') : t('people.paidSettleFully'))
                  : (isLentDebt ? `${t('people.receive')} ${formatCurrency(Number(settleAmount) || 0, currency)}` : `${t('people.pay')} ${formatCurrency(Number(settleAmount) || 0, currency)}`)}
              </button>
            </div>
          );
        })()}
      </Modal>

      {/* Settlement plan modal */}
      <Modal
        open={showSettlement}
        onClose={() => setShowSettlement(false)}
        title={t('people.settlementPlan')}
      >
        <div className="space-y-4">
          <p className="text-xs text-cream-500">{t('people.settleUpDesc')}</p>

          {settlementPlan.length > 0 ? (
            <div className="space-y-2">
              {settlementPlan.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 dark:bg-cream-800/20 border border-cream-200 dark:border-dark-border"
                >
                  <div className="flex-1 flex items-center gap-2 text-sm">
                    <span className="font-medium">{s.from}</span>
                    <ArrowRight size={14} className="text-cream-400 shrink-0" />
                    <span className="font-medium">{s.to}</span>
                  </div>
                  <span className="font-heading font-bold money text-accent-600 dark:text-accent-400">
                    {formatCurrency(s.amount, currency)}
                  </span>
                </div>
              ))}

              <div className="pt-2 border-t border-cream-200 dark:border-dark-border">
                <p className="text-[10px] text-cream-500 flex items-center gap-1 mb-3">
                  <Info size={10} />
                  {t('people.autoTransactionNote')}
                </p>
                <button
                  onClick={handleSettleAll}
                  disabled={settlingAll}
                  className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check size={14} />
                  {settlingAll ? t('common.loading') : t('people.markSettled')}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6">
              <Check size={32} className="text-success mx-auto mb-2" />
              <p className="text-sm text-cream-500">{t('people.noSettlementsNeeded')}</p>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
