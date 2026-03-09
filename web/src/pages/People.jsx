import { useState, useEffect, useMemo } from 'react';
import { people as peopleApi, debts as debtsApi, debtPayments as paymentsApi, transactions as txApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { generateId, formatCurrency, sumBy, formatDate } from '../lib/helpers';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import {
  Users, Plus, ArrowUpRight, ArrowDownLeft, Check, Trash2,
  ChevronRight, Wallet, TrendingUp, TrendingDown, Clock,
  HandCoins, Banknote, UserPlus, DollarSign, CalendarClock, AlertTriangle, Info,
} from 'lucide-react';

export default function People() {
  const { user } = useAuth();
  const { toast } = useToast();
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

  const [personForm, setPersonForm] = useState({ name: '', emoji: '👤', phone: '', notes: '' });
  const [debtForm, setDebtForm] = useState({
    personId: '', type: 'lent', amount: '', reason: '', dueDate: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const currency = user?.defaultCurrency || 'RON';

  const EMOJI_OPTIONS = ['👤', '👩', '👨', '🧑', '👩‍💼', '👨‍💼', '🧔', '👱', '👸', '🤴', '🧑‍🤝‍🧑', '👥', '🏢', '🏠'];

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [people, debts, payments] = await Promise.all([
        peopleApi.getAll({ userId: 'local' }),
        debtsApi.getAll({ userId: 'local' }),
        paymentsApi.getAll(),
      ]);
      setPeople(people);
      setDebts(debts);
      setPayments(payments);
    } catch (err) { toast.error('Failed to load'); }
    finally { setLoading(false); }
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
    if (!personForm.name.trim()) { toast.error('Name required'); return; }
    await peopleApi.create({
      id: generateId(), ...personForm, userId: 'local', createdAt: new Date().toISOString(),
    });
    toast.success('Person added');
    setShowPersonForm(false);
    setPersonForm({ name: '', emoji: '👤', phone: '', notes: '' });
    loadData();
  };

  const handleAddDebt = async () => {
    if (!debtForm.personId || !debtForm.amount) { toast.error('Select person and amount'); return; }
    const person = peopleList.find(p => p.id === debtForm.personId);
    const personName = person?.name || 'Unknown';
    const amount = Number(debtForm.amount);
    const debtDate = debtForm.date || new Date().toISOString().slice(0, 10);
    const debtId = generateId();

    await debtsApi.create({
      id: debtId, ...debtForm, amount,
      remaining: amount, currency, status: 'active',
      date: debtDate, userId: 'local', createdAt: new Date().toISOString(),
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
      description: `${debtForm.type === 'lent' ? 'Lent to' : 'Borrowed from'} ${personName}${debtForm.reason ? ` — ${debtForm.reason}` : ''}`,
      source: 'manual',
      notes: `Debt #${debtId.slice(0, 8)}`,
      tags: ['debt'],
      userId: 'local',
      createdAt: new Date().toISOString(),
    });

    toast.success('Debt recorded + transaction created');
    setShowDebtForm(false);
    setDebtForm({
      personId: '', type: 'lent', amount: '', reason: '', dueDate: '',
      date: new Date().toISOString().slice(0, 10),
    });
    loadData();
  };

  const handleSettle = async () => {
    if (!settleDebt || !settleAmount) return;
    const amt = Number(settleAmount);
    const remaining = (settleDebt.remaining ?? settleDebt.amount) - amt;
    const today = new Date().toISOString().slice(0, 10);

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
      description: `${settleDebt.type === 'lent' ? 'Received from' : 'Paid to'} ${personName}${settleDebt.reason ? ` — ${settleDebt.reason}` : ''}`,
      source: 'manual',
      notes: `Settlement for debt #${settleDebt.id.slice(0, 8)}`,
      tags: ['debt-settlement'],
      userId: 'local',
      createdAt: new Date().toISOString(),
    });

    toast.success(remaining <= 0 ? 'Debt settled!' : 'Partial payment recorded');
    setSettleDebt(null);
    setSettleAmount('');
    setSelectedPerson(null);
    loadData();
  };

  const handleDeletePerson = async (person) => {
    const personDebtsActive = debtsList.filter(d => d.personId === person.id && d.status !== 'settled');
    if (personDebtsActive.length > 0) {
      toast.error('Settle all debts first');
      return;
    }
    await peopleApi.remove(person.id);
    toast.success('Removed');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title mb-0">People & Debts</h1>
          <p className="text-xs text-cream-500 mt-1">Track money lent and borrowed</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPersonForm(true)}
            className="btn-secondary text-xs flex items-center gap-1.5 h-9"
          >
            <UserPlus size={14} /> Person
          </button>
          <button
            onClick={() => setShowDebtForm(true)}
            className="btn-primary text-xs flex items-center gap-1.5 h-9"
          >
            <HandCoins size={14} /> Lend / Borrow
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
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">Owed to you</p>
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
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">You owe</p>
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
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">Net balance</p>
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
          <p className="text-[10px] uppercase tracking-wider text-cream-500 font-medium">Active debts</p>
          <p className="text-xl font-heading font-bold text-cream-800 dark:text-cream-200 mt-0.5">
            {activeDebtsCount}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {[
          { id: 'all', label: 'All' },
          { id: 'owed', label: 'Owed to me' },
          { id: 'owing', label: 'I owe' },
          { id: 'settled', label: 'Settled' },
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
                            {bal.activeCount} active
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-cream-500 mt-0.5">
                        {bal.net > 0 ? 'Owes you' :
                         bal.net < 0 ? 'You owe' :
                         bal.activeCount === 0 ? 'All settled' : 'Even'}
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
              title={activeFilter === 'all' ? 'No people yet' : 'No matches'}
              description={activeFilter === 'all' ? 'Add people to track money lent and borrowed' : 'Try a different filter'}
              action={activeFilter === 'all' ? 'Add person' : undefined}
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
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${
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
                  title="Remove person"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              {/* Mini stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-success/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-cream-500 mb-0.5">Lent</p>
                  <p className="font-heading font-bold text-success money text-sm">
                    {formatCurrency(selectedPersonBal.lent, currency)}
                  </p>
                </div>
                <div className="bg-danger/5 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase tracking-wider text-cream-500 mb-0.5">Borrowed</p>
                  <p className="font-heading font-bold text-danger money text-sm">
                    {formatCurrency(selectedPersonBal.borrowed, currency)}
                  </p>
                </div>
                <div className={`${selectedPersonBal.net >= 0 ? 'bg-success/5' : 'bg-danger/5'} rounded-xl p-3 text-center`}>
                  <p className="text-[10px] uppercase tracking-wider text-cream-500 mb-0.5">Net</p>
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
                <ArrowUpRight size={14} /> I lent them
              </button>
              <button
                onClick={() => { setDebtForm(f => ({ ...f, personId: selectedPerson, type: 'borrowed' })); setShowDebtForm(true); }}
                className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-danger/10 text-danger text-xs font-medium hover:bg-danger/20 transition-colors"
              >
                <ArrowDownLeft size={14} /> I borrowed
              </button>
              {selectedPersonBal.lent > 0 && (
                <button
                  onClick={() => {
                    const firstLent = getPersonDebts(selectedPerson).find(d => d.type === 'lent' && d.status !== 'settled');
                    if (firstLent) { setSettleDebt(firstLent); setSettleAmount((firstLent.remaining ?? firstLent.amount).toString()); }
                  }}
                  className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-info/10 text-info text-xs font-medium hover:bg-info/20 transition-colors"
                >
                  <Banknote size={14} /> Receive payment
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
                  <Wallet size={14} /> Pay back
                </button>
              )}
            </div>

            {/* Settle all net balance */}
            {selectedPersonBal.net !== 0 && (
              <div className="bg-cream-50 dark:bg-dark-card rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">
                    {selectedPersonBal.net > 0
                      ? `${selectedPersonData.name} owes you`
                      : `You owe ${selectedPersonData.name}`}
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
                  {selectedPersonBal.net > 0 ? 'Receive' : 'Pay'} now
                </button>
              </div>
            )}

            {/* Debt history */}
            <div className="card">
              <h3 className="text-sm font-semibold mb-3">Debt history</h3>
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
                                  {isLent ? 'Lent' : 'Borrowed'}
                                </span>
                                {isSettled && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/10 text-success font-medium">
                                    Settled
                                  </span>
                                )}
                                {debt.status === 'partial' && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
                                    Partial
                                  </span>
                                )}
                                {isOverdue && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-danger/10 text-danger font-medium flex items-center gap-0.5">
                                    <AlertTriangle size={8} /> Overdue
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
                                      <CalendarClock size={10} /> Due {debt.dueDate}
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
                                {formatCurrency(remaining, currency)} left
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
                            <p className="text-[10px] text-cream-500 mt-0.5">{paidPct}% paid</p>
                          </div>
                        )}

                        {/* Payment history */}
                        {debtPays.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-cream-100 dark:border-dark-border space-y-1">
                            {debtPays.map((pay) => (
                              <div key={pay.id} className="flex items-center justify-between text-xs text-cream-500">
                                <span className="flex items-center gap-1">
                                  <Check size={10} className="text-success" /> Payment on {pay.date}
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
                              {isLent ? 'Receive' : 'Pay back'} {formatCurrency(remaining, currency)}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="text-xs text-cream-500 text-center py-4">No debts with this person yet</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add person modal */}
      <Modal open={showPersonForm} onClose={() => setShowPersonForm(false)} title="Add person">
        <div className="space-y-4">
          {/* Emoji picker */}
          <div>
            <label className="label">Avatar</label>
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
            <label className="label">Name</label>
            <input
              className="input"
              value={personForm.name}
              onChange={(e) => setPersonForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Alex, Mom, John"
              autoFocus
            />
          </div>
          <div>
            <label className="label">Phone (optional)</label>
            <input
              className="input"
              value={personForm.phone}
              onChange={(e) => setPersonForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="+40 7..."
            />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <input
              className="input"
              value={personForm.notes}
              onChange={(e) => setPersonForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Colleague, Roommate"
            />
          </div>
          <button onClick={handleAddPerson} className="btn-primary w-full">Add person</button>
        </div>
      </Modal>

      {/* Add debt modal */}
      <Modal open={showDebtForm} onClose={() => setShowDebtForm(false)} title="Record debt">
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
                I lent money
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
                I borrowed money
              </span>
            </button>
          </div>

          <div>
            <label className="label">Person</label>
            <select
              className="input"
              value={debtForm.personId}
              onChange={(e) => setDebtForm((f) => ({ ...f, personId: e.target.value }))}
            >
              <option value="">Select person</option>
              {peopleList.map((p) => (
                <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Amount ({currency})</label>
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
            <label className="label">Reason</label>
            <input
              className="input"
              value={debtForm.reason}
              onChange={(e) => setDebtForm((f) => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Dinner, Rent, Gas money"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={debtForm.date}
                onChange={(e) => setDebtForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Due date (optional)</label>
              <input
                type="date"
                className="input"
                value={debtForm.dueDate}
                onChange={(e) => setDebtForm((f) => ({ ...f, dueDate: e.target.value }))}
              />
            </div>
          </div>

          <p className="text-[10px] text-cream-500 flex items-center gap-1">
            <Info size={10} /> A transfer transaction will be auto-created
          </p>

          <button onClick={handleAddDebt} className="btn-primary w-full">
            Record {debtForm.type === 'lent' ? 'loan' : 'debt'}
          </button>
        </div>
      </Modal>

      {/* Settle modal */}
      <Modal
        open={!!settleDebt}
        onClose={() => setSettleDebt(null)}
        title={settleDebt?.type === 'lent' ? 'Receive payment' : 'Make payment'}
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
                    {isLentDebt ? 'They owe you' : 'You owe them'}
                  </span>
                  <span className={`font-heading font-bold money ${isLentDebt ? 'text-success' : 'text-danger'}`}>
                    {formatCurrency(fullAmt, currency)}
                  </span>
                </div>
                {settleDebt.reason && (
                  <p className="text-xs text-cream-500 mt-1">For: {settleDebt.reason}</p>
                )}
                {settleDebt.date && (
                  <p className="text-xs text-cream-500">Since: {settleDebt.date}</p>
                )}
              </div>

              {/* Amount input */}
              <div>
                <label className="label">
                  {isLentDebt ? 'Amount received' : 'Amount to pay'}
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
                        {frac === 1 ? 'Full amount' : `${frac * 100}%`}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Info about what will happen */}
              <div className="text-[10px] text-cream-500 flex items-center gap-1">
                <Info size={10} />
                {isLentDebt
                  ? 'An income transaction will be recorded for this payment'
                  : 'An expense transaction will be recorded for this payment'}
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
                  ? (isLentDebt ? 'Received — settle fully' : 'Paid — settle fully')
                  : (isLentDebt ? `Receive ${formatCurrency(Number(settleAmount) || 0, currency)}` : `Pay ${formatCurrency(Number(settleAmount) || 0, currency)}`)}
              </button>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
