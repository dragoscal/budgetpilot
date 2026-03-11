import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import HelpButton from '../components/HelpButton';
import { loans as loansApi, loanPayments as lpApi } from '../lib/api';
import { formatCurrency, generateId, formatDate, formatDateISO } from '../lib/helpers';
import { LOAN_TYPES, LOAN_STATUSES, CURRENCIES } from '../lib/constants';
import {
  Plus, Building2, Percent, Calendar, TrendingDown, DollarSign,
  ChevronDown, ChevronUp, Edit3, Trash2, Check, X, Loader2, Clock,
  AlertTriangle, CheckCircle, BarChart3, CircleDollarSign,
} from 'lucide-react';
import EmptyState from '../components/EmptyState';
import DebtPayoffSimulator from '../components/DebtPayoffSimulator';

const EMPTY_FORM = {
  name: '', type: 'personal', lender: '', principalAmount: '',
  remainingBalance: '', interestRate: '', interestType: 'fixed',
  monthlyPayment: '', currency: 'RON', startDate: formatDateISO(new Date()),
  endDate: '', paymentDay: '1', notes: '',
};

const EMPTY_PAYMENT = { amount: '', principalPortion: '', interestPortion: '', date: formatDateISO(new Date()), note: '' };

export default function Loans() {
  const { toast } = useToast();
  const { user, effectiveUserId } = useAuth();
  const { t } = useTranslation();
  const currency = user?.defaultCurrency || 'RON';
  const [loansList, setLoansList] = useState([]);
  const [payments, setPayments] = useState({});
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [expandedLoan, setExpandedLoan] = useState(null);
  const [filter, setFilter] = useState('active');
  const [showPaymentForm, setShowPaymentForm] = useState(null); // loanId
  const [paymentForm, setPaymentForm] = useState({ ...EMPTY_PAYMENT });
  const [savingPayment, setSavingPayment] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const allLoans = await loansApi.getAll({ userId: effectiveUserId });
      setLoansList(Array.isArray(allLoans) ? allLoans : []);

      // Load payments for all loans
      const allPayments = await lpApi.getAll({ userId: effectiveUserId });
      const grouped = {};
      (Array.isArray(allPayments) ? allPayments : []).forEach((p) => {
        if (!grouped[p.loanId]) grouped[p.loanId] = [];
        grouped[p.loanId].push(p);
      });
      // Sort payments by date desc
      Object.keys(grouped).forEach((k) => {
        grouped[k].sort((a, b) => b.date.localeCompare(a.date));
      });
      setPayments(grouped);
    } catch (err) {
      toast.error(t('loans.failedLoad') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── LOAN CRUD ─────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error(t('loans.nameRequired'));
    if (!form.principalAmount || Number(form.principalAmount) <= 0) return toast.error(t('loans.amountRequired'));

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const remaining = form.remainingBalance ? Number(form.remainingBalance) : Number(form.principalAmount);
      const loan = {
        id: editingId || generateId(),
        name: form.name.trim(),
        type: form.type,
        lender: form.lender.trim() || null,
        principalAmount: Number(form.principalAmount),
        remainingBalance: remaining,
        interestRate: Number(form.interestRate) || 0,
        interestType: form.interestType,
        monthlyPayment: Number(form.monthlyPayment) || 0,
        currency: form.currency,
        startDate: form.startDate,
        endDate: form.endDate || null,
        paymentDay: Number(form.paymentDay) || 1,
        status: remaining <= 0 ? 'paid_off' : 'active',
        notes: form.notes.trim() || null,
        userId: effectiveUserId,
        createdAt: editingId ? undefined : now,
        updatedAt: now,
      };

      if (editingId) {
        await loansApi.update(loan);
        toast.success(t('loans.updated'));
      } else {
        await loansApi.create(loan);
        toast.success(t('loans.saved'));
      }

      setForm({ ...EMPTY_FORM });
      setShowForm(false);
      setEditingId(null);
      await loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (loan) => {
    setForm({
      name: loan.name,
      type: loan.type,
      lender: loan.lender || '',
      principalAmount: String(loan.principalAmount),
      remainingBalance: String(loan.remainingBalance),
      interestRate: String(loan.interestRate || ''),
      interestType: loan.interestType || 'fixed',
      monthlyPayment: String(loan.monthlyPayment || ''),
      currency: loan.currency,
      startDate: loan.startDate,
      endDate: loan.endDate || '',
      paymentDay: String(loan.paymentDay || 1),
      notes: loan.notes || '',
    });
    setEditingId(loan.id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm(t('loans.deleteConfirm'))) return;
    try {
      // Delete associated payments
      const loanPmts = payments[id] || [];
      for (const p of loanPmts) {
        await lpApi.remove(p.id);
      }
      await loansApi.remove(id);
      toast.success(t('loans.deleted'));
      await loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleStatus = async (loan, newStatus) => {
    try {
      await loansApi.update({ ...loan, status: newStatus, updatedAt: new Date().toISOString() });
      toast.success(`${t('loans.markedAs')} ${t(`loanStatuses.${newStatus}`)}`);
      await loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ─── PAYMENT CRUD ──────────────────────────────────────
  const handlePaymentSubmit = async (e, loanId) => {
    e.preventDefault();
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) return toast.error(t('loans.enterPaymentAmount'));

    const loan = loansList.find((l) => l.id === loanId);
    const amount = Number(paymentForm.amount);
    const principal = Number(paymentForm.principalPortion) || 0;
    const interest = Number(paymentForm.interestPortion) || 0;
    const effectivePrincipal = principal || (interest ? amount - interest : amount);

    // Prevent overpaying beyond remaining balance
    if (loan && effectivePrincipal > loan.remainingBalance) {
      return toast.error(`Principal portion (${formatCurrency(effectivePrincipal, currency)}) exceeds remaining balance (${formatCurrency(loan.remainingBalance, currency)})`);
    }

    setSavingPayment(true);
    try {
      const now = new Date().toISOString();

      await lpApi.create({
        id: generateId(),
        loanId,
        amount,
        principalPortion: principal || (interest ? amount - interest : amount),
        interestPortion: interest || (principal ? amount - principal : 0),
        date: paymentForm.date,
        note: paymentForm.note.trim() || null,
        userId: effectiveUserId,
        createdAt: now,
        updatedAt: now,
      });

      // Update remaining balance
      if (loan) {
        const newRemaining = Math.max(0, loan.remainingBalance - effectivePrincipal);
        await loansApi.update({
          ...loan,
          remainingBalance: newRemaining,
          status: newRemaining <= 0 ? 'paid_off' : loan.status,
          updatedAt: now,
        });
      }

      toast.success(t('loans.paymentRecorded'));
      setPaymentForm({ ...EMPTY_PAYMENT });
      setShowPaymentForm(null);
      await loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const deletePayment = async (payment, loan) => {
    try {
      await lpApi.remove(payment.id);
      // Restore remaining balance, capped at principal
      const restored = Math.min(
        loan.remainingBalance + (payment.principalPortion || payment.amount),
        loan.principalAmount
      );
      // Recalculate status based on new balance
      const newStatus = restored <= 0 ? 'paid_off' : restored >= loan.principalAmount ? 'active' : loan.status === 'paid_off' ? 'active' : loan.status;
      await loansApi.update({
        ...loan,
        remainingBalance: restored,
        status: newStatus,
        updatedAt: new Date().toISOString(),
      });
      toast.success(t('loans.paymentRemoved'));
      await loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ─── CALCULATIONS ──────────────────────────────────────
  const filteredLoans = loansList.filter((l) => {
    if (filter === 'all') return true;
    return l.status === filter;
  }).sort((a, b) => (b.remainingBalance || 0) - (a.remainingBalance || 0));

  const totalPrincipal = loansList.filter(l => l.status === 'active').reduce((s, l) => s + l.principalAmount, 0);
  const totalRemaining = loansList.filter(l => l.status === 'active').reduce((s, l) => s + l.remainingBalance, 0);
  const totalPaid = totalPrincipal - totalRemaining;
  const totalMonthly = loansList.filter(l => l.status === 'active').reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  const overallProgress = totalPrincipal > 0 ? ((totalPaid / totalPrincipal) * 100) : 0;

  const getLoanType = (typeId) => LOAN_TYPES.find((t) => t.id === typeId) || LOAN_TYPES[LOAN_TYPES.length - 1];
  const getLoanStatus = (statusId) => LOAN_STATUSES.find((s) => s.id === statusId) || LOAN_STATUSES[0];

  const calcProgress = (loan) => {
    if (!loan.principalAmount) return 0;
    return Math.min(100, Math.max(0, ((loan.principalAmount - loan.remainingBalance) / loan.principalAmount) * 100));
  };

  const calcRemainingMonths = (loan) => {
    if (!loan.monthlyPayment || loan.monthlyPayment <= 0 || loan.remainingBalance <= 0) return null;
    // Rough estimate: remaining / monthly (ignoring interest for simplicity)
    return Math.ceil(loan.remainingBalance / loan.monthlyPayment);
  };

  const calcTotalInterest = (loan) => {
    const loanPmts = payments[loan.id] || [];
    return loanPmts.reduce((s, p) => s + (p.interestPortion || 0), 0);
  };

  const calcTotalPaidForLoan = (loan) => {
    const loanPmts = payments[loan.id] || [];
    return loanPmts.reduce((s, p) => s + p.amount, 0);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">{t('loans.title')}</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cream-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title">{t('loans.title')}</h1>
          <HelpButton section="loans" />
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ ...EMPTY_FORM }); }}
          className="btn-primary text-xs flex items-center gap-1.5"
        >
          <Plus size={14} /> {t('loans.add')}
        </button>
      </div>

      {/* Summary Cards */}
      {loansList.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <CircleDollarSign size={14} className="text-cream-400" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">{t('loans.totalBorrowed')}</span>
            </div>
            <p className="text-lg font-heading font-bold">{formatCurrency(totalPrincipal)}</p>
          </div>
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={14} className="text-danger" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">{t('loans.stillOwed')}</span>
            </div>
            <p className="text-lg font-heading font-bold text-danger">{formatCurrency(totalRemaining)}</p>
          </div>
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={14} className="text-success" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">{t('loans.paidOff')}</span>
            </div>
            <p className="text-lg font-heading font-bold text-success">{formatCurrency(totalPaid)}</p>
            {totalPrincipal > 0 && (
              <div className="mt-1.5">
                <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
                </div>
                <p className="text-[10px] text-cream-400 mt-0.5">{overallProgress.toFixed(1)}% {t('loans.complete')}</p>
              </div>
            )}
          </div>
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-info" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">{t('loans.monthlyTotal')}</span>
            </div>
            <p className="text-lg font-heading font-bold">{formatCurrency(totalMonthly)}</p>
            <p className="text-[10px] text-cream-400">{formatCurrency(totalMonthly * 12)}/{t('common.year').toLowerCase()}</p>
          </div>
        </div>
      )}

      {/* Debt Payoff Simulator */}
      <DebtPayoffSimulator loans={loansList} currency={currency} />

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4 border-2 border-accent-200 dark:border-accent-800">
          <h3 className="text-sm font-semibold">{editingId ? t('loans.editLoan') : t('loans.addNewLoan')}</h3>

          {/* Loan type */}
          <div>
            <label className="text-xs font-medium text-cream-500 mb-2 block">{t('loans.type')}</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {LOAN_TYPES.map((lt) => (
                <button
                  key={lt.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: lt.id }))}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                    form.type === lt.id
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                      : 'border-cream-200 dark:border-dark-border hover:border-cream-300'
                  }`}
                >
                  <span className="text-lg">{lt.icon}</span>
                  <span className="text-[10px] font-medium leading-tight">{t(`loanTypes.${lt.id}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name & Lender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">
                {t('loans.name')} <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('loans.namePlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.lenderBank')}</label>
              <input
                type="text"
                value={form.lender}
                onChange={(e) => setForm((f) => ({ ...f, lender: e.target.value }))}
                placeholder={t('loans.lenderPlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              />
            </div>
          </div>

          {/* Amount & Remaining */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">
                {t('loans.principalAmount')} <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                value={form.principalAmount}
                onChange={(e) => setForm((f) => ({ ...f, principalAmount: e.target.value }))}
                placeholder="100000"
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                min="0" step="0.01" inputMode="decimal" required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.remainingBalance')}</label>
              <input
                type="number"
                value={form.remainingBalance}
                onChange={(e) => setForm((f) => ({ ...f, remainingBalance: e.target.value }))}
                placeholder={t('loans.remainingPlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                min="0" step="0.01" inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('common.currency')}</label>
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.code} ({c.symbol})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Interest & Monthly */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.interestRate')}</label>
              <input
                type="number"
                value={form.interestRate}
                onChange={(e) => setForm((f) => ({ ...f, interestRate: e.target.value }))}
                placeholder="e.g. 5.5"
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                min="0" max="100" step="0.01" inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.interestType')}</label>
              <select
                value={form.interestType}
                onChange={(e) => setForm((f) => ({ ...f, interestType: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              >
                <option value="fixed">{t('loans.fixed')}</option>
                <option value="variable">{t('loans.variable')}</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.monthlyPayment')}</label>
              <input
                type="number"
                value={form.monthlyPayment}
                onChange={(e) => setForm((f) => ({ ...f, monthlyPayment: e.target.value }))}
                placeholder={t('loans.monthlyPaymentPlaceholder')}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                min="0" step="0.01" inputMode="decimal"
              />
            </div>
          </div>

          {/* Dates & Payment Day */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.startDate')}</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.endDateMaturity')}</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">{t('loans.paymentDay')}</label>
              <select
                value={form.paymentDay}
                onChange={(e) => setForm((f) => ({ ...f, paymentDay: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              >
                {Array.from({ length: 28 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{i + 1}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-cream-500 mb-1 block">{t('common.notes')}</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder={t('loans.notesPlaceholder')}
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost text-xs flex items-center gap-1">
              <X size={14} /> {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-xs flex items-center gap-1">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editingId ? t('loans.updateLoan') : t('loans.add')}
            </button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      {loansList.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'active', label: t('loanStatuses.active'), count: loansList.filter(l => l.status === 'active').length },
            { id: 'paid_off', label: t('loanStatuses.paid_off'), count: loansList.filter(l => l.status === 'paid_off').length },
            { id: 'all', label: t('common.all'), count: loansList.length },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                  : 'bg-cream-200 text-cream-600 hover:bg-cream-300 dark:bg-dark-border dark:text-cream-500'
              }`}
            >
              {f.label} {f.count > 0 && <span className="ml-1 opacity-70">({f.count})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Loans list */}
      {filteredLoans.length === 0 && !showForm && (
        <EmptyState
          icon={Building2}
          title={loansList.length === 0 ? t('loans.noLoans') : t('loans.noLoansFilter')}
          description={loansList.length === 0 ? t('loans.noLoansDesc') : t('loans.tryDifferentFilter')}
          action={loansList.length === 0 ? t('loans.add') : undefined}
          onAction={loansList.length === 0 ? () => setShowForm(true) : undefined}
        />
      )}

      <div className="space-y-3">
        {filteredLoans.map((loan) => {
          const type = getLoanType(loan.type);
          const status = getLoanStatus(loan.status);
          const progress = calcProgress(loan);
          const remainingMonths = calcRemainingMonths(loan);
          const totalInterest = calcTotalInterest(loan);
          const totalPaidLoan = calcTotalPaidForLoan(loan);
          const loanPaymentsList = payments[loan.id] || [];
          const isExpanded = expandedLoan === loan.id;

          return (
            <div key={loan.id} className="card">
              {/* Loan header */}
              <div
                className="flex items-start gap-3 cursor-pointer"
                onClick={() => setExpandedLoan(isExpanded ? null : loan.id)}
              >
                <span className="text-2xl shrink-0 mt-0.5">{type.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">{loan.name}</h3>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>
                      {t(`loanStatuses.${loan.status}`)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    {loan.lender && (
                      <span className="text-xs text-cream-500 flex items-center gap-1">
                        <Building2 size={10} /> {loan.lender}
                      </span>
                    )}
                    {loan.interestRate > 0 && (
                      <span className="text-xs text-cream-500 flex items-center gap-1">
                        <Percent size={10} /> {loan.interestRate}% {loan.interestType === 'fixed' ? t('loans.fixed') : t('loans.variable')}
                      </span>
                    )}
                    {loan.monthlyPayment > 0 && (
                      <span className="text-xs text-cream-500 flex items-center gap-1">
                        <Calendar size={10} /> {formatCurrency(loan.monthlyPayment, loan.currency)}{t('recurring.perMo')}
                      </span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div className="mt-2">
                    <div className="h-2 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress >= 100 ? 'bg-success' : progress >= 50 ? 'bg-info' : 'bg-warning'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1 gap-1">
                      <span className="text-[10px] text-cream-500 truncate min-w-0">
                        {formatCurrency(loan.principalAmount - loan.remainingBalance, loan.currency)} {t('loans.paid')}
                      </span>
                      <span className="text-[10px] text-cream-500 truncate min-w-0 text-right">
                        {formatCurrency(loan.remainingBalance, loan.currency)} {t('loans.remaining')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 max-w-[45%]">
                  <span className="text-sm sm:text-lg font-heading font-bold text-danger truncate">
                    {formatCurrency(loan.remainingBalance, loan.currency)}
                  </span>
                  {isExpanded ? <ChevronUp size={16} className="text-cream-400 shrink-0" /> : <ChevronDown size={16} className="text-cream-400 shrink-0" />}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-4 space-y-4 border-t border-cream-200 dark:border-dark-border pt-4">
                  {/* Loan details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">{t('loans.principal')}</p>
                      <p className="text-sm font-semibold">{formatCurrency(loan.principalAmount, loan.currency)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">{t('loans.totalPaid')}</p>
                      <p className="text-sm font-semibold text-success">{formatCurrency(totalPaidLoan, loan.currency)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">{t('loans.interestPaid')}</p>
                      <p className="text-sm font-semibold text-warning">{formatCurrency(totalInterest, loan.currency)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">
                        {remainingMonths ? t('loans.estMonthsLeft') : t('loans.progress')}
                      </p>
                      <p className="text-sm font-semibold">
                        {remainingMonths ? `~${remainingMonths} ${t('loans.months')}` : `${progress.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>

                  {/* Extra info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-cream-500">
                    <span>{t('loans.started')}: {formatDate(loan.startDate, 'dd MMM yyyy')}</span>
                    {loan.endDate && <span>{t('loans.maturity')}: {formatDate(loan.endDate, 'dd MMM yyyy')}</span>}
                    <span>{t('loans.paymentDay')}: {loan.paymentDay}</span>
                    {loan.notes && <span className="block w-full text-cream-400 italic">"{loan.notes}"</span>}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {loan.status === 'active' && (
                      <button
                        onClick={() => { setShowPaymentForm(loan.id); setPaymentForm({ ...EMPTY_PAYMENT, amount: loan.monthlyPayment ? String(loan.monthlyPayment) : '' }); }}
                        className="btn-primary text-xs flex items-center gap-1"
                      >
                        <DollarSign size={14} /> {t('loans.recordPayment')}
                      </button>
                    )}
                    <button onClick={() => handleEdit(loan)} className="btn-ghost text-xs flex items-center gap-1">
                      <Edit3 size={14} /> {t('common.edit')}
                    </button>
                    {loan.status === 'active' && (
                      <button
                        onClick={() => toggleStatus(loan, 'paid_off')}
                        className="btn-ghost text-xs flex items-center gap-1 text-success border-success/30 hover:bg-success/10"
                      >
                        <CheckCircle size={14} /> {t('loans.markPaidOff')}
                      </button>
                    )}
                    {loan.status === 'paid_off' && (
                      <button
                        onClick={() => toggleStatus(loan, 'active')}
                        className="btn-ghost text-xs flex items-center gap-1"
                      >
                        <Clock size={14} /> {t('loans.reactivate')}
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(loan.id)}
                      className="btn-ghost text-xs flex items-center gap-1 text-danger border-danger/30 hover:bg-danger/10"
                    >
                      <Trash2 size={14} /> {t('common.delete')}
                    </button>
                  </div>

                  {/* Payment form */}
                  {showPaymentForm === loan.id && (
                    <form
                      onSubmit={(e) => handlePaymentSubmit(e, loan.id)}
                      className="p-3 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border space-y-3"
                    >
                      <h4 className="text-xs font-semibold">{t('loans.recordPayment')}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] text-cream-400 block mb-0.5">{t('loans.totalAmount')} *</label>
                          <input
                            type="number"
                            value={paymentForm.amount}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, amount: e.target.value }))}
                            placeholder={loan.monthlyPayment ? String(loan.monthlyPayment) : '0'}
                            className="w-full px-2 py-1.5 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-xs"
                            min="0" step="0.01" inputMode="decimal" required autoFocus
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-cream-400 block mb-0.5">{t('loans.principalPart')}</label>
                          <input
                            type="number"
                            value={paymentForm.principalPortion}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, principalPortion: e.target.value }))}
                            placeholder="Auto"
                            className="w-full px-2 py-1.5 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-xs"
                            min="0" step="0.01" inputMode="decimal"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-cream-400 block mb-0.5">{t('loans.interestPart')}</label>
                          <input
                            type="number"
                            value={paymentForm.interestPortion}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, interestPortion: e.target.value }))}
                            placeholder="Auto"
                            className="w-full px-2 py-1.5 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-xs"
                            min="0" step="0.01" inputMode="decimal"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-cream-400 block mb-0.5">{t('common.date')}</label>
                          <input
                            type="date"
                            value={paymentForm.date}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-cream-400 block mb-0.5">{t('loans.note')}</label>
                        <input
                          type="text"
                          value={paymentForm.note}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                          placeholder={t('loans.optionalNote')}
                          className="w-full px-2 py-1.5 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-xs"
                        />
                      </div>
                      {/* Quick amount buttons */}
                      {loan.monthlyPayment > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-cream-400">{t('loans.quick')}:</span>
                          <button
                            type="button"
                            onClick={() => setPaymentForm((f) => ({ ...f, amount: String(loan.monthlyPayment) }))}
                            className="text-[10px] px-2 py-0.5 rounded bg-info/10 text-info hover:bg-info/20"
                          >
                            {t('common.monthly')} ({formatCurrency(loan.monthlyPayment, loan.currency)})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentForm((f) => ({ ...f, amount: String(loan.remainingBalance) }))}
                            className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success hover:bg-success/20"
                          >
                            {t('loans.payOff')} ({formatCurrency(loan.remainingBalance, loan.currency)})
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowPaymentForm(null)} className="btn-ghost text-xs">
                          {t('common.cancel')}
                        </button>
                        <button type="submit" disabled={savingPayment} className="btn-primary text-xs flex items-center gap-1">
                          {savingPayment ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          {t('loans.recordPayment')}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Payment history */}
                  {loanPaymentsList.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <BarChart3 size={12} />
                        {t('loans.paymentHistory')} ({loanPaymentsList.length})
                      </h4>
                      <div className="space-y-1.5">
                        {loanPaymentsList.map((p) => (
                          <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-cream-50 dark:bg-dark-bg text-xs group">
                            <span className="text-cream-400 shrink-0">{formatDate(p.date, 'dd MMM yy')}</span>
                            <span className="font-medium text-success flex-1">
                              {formatCurrency(p.amount, loan.currency)}
                            </span>
                            {p.principalPortion > 0 && (
                              <span className="text-cream-400">
                                P: {formatCurrency(p.principalPortion, loan.currency)}
                              </span>
                            )}
                            {p.interestPortion > 0 && (
                              <span className="text-cream-400">
                                I: {formatCurrency(p.interestPortion, loan.currency)}
                              </span>
                            )}
                            {p.note && <span className="text-cream-400 truncate max-w-[100px]" title={p.note}>{p.note}</span>}
                            <button
                              onClick={() => deletePayment(p, loan)}
                              className="p-1.5 rounded sm:opacity-0 sm:group-hover:opacity-100 hover:bg-danger/10 text-cream-300 hover:text-danger transition-all shrink-0"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
