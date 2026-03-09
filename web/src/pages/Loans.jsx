import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../contexts/ToastContext';
import { loans as loansApi, loanPayments as lpApi } from '../lib/api';
import { formatCurrency, generateId, formatDate, formatDateISO } from '../lib/helpers';
import { LOAN_TYPES, LOAN_STATUSES, CURRENCIES } from '../lib/constants';
import {
  Plus, Building2, Percent, Calendar, CreditCard, TrendingDown, DollarSign,
  ChevronDown, ChevronUp, Edit3, Trash2, Check, X, Loader2, Clock,
  AlertTriangle, CheckCircle, PiggyBank, BarChart3, CircleDollarSign,
} from 'lucide-react';

const EMPTY_FORM = {
  name: '', type: 'personal', lender: '', principalAmount: '',
  remainingBalance: '', interestRate: '', interestType: 'fixed',
  monthlyPayment: '', currency: 'RON', startDate: formatDateISO(new Date()),
  endDate: '', paymentDay: '1', notes: '',
};

const EMPTY_PAYMENT = { amount: '', principalPortion: '', interestPortion: '', date: formatDateISO(new Date()), note: '' };

export default function Loans() {
  const { toast } = useToast();
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
      const allLoans = await loansApi.getAll();
      setLoansList(Array.isArray(allLoans) ? allLoans : []);

      // Load payments for all loans
      const allPayments = await lpApi.getAll();
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
      toast.error('Failed to load loans: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── LOAN CRUD ─────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Please enter a loan name');
    if (!form.principalAmount || Number(form.principalAmount) <= 0) return toast.error('Enter the loan amount');

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
        userId: 'local',
        createdAt: editingId ? undefined : now,
        updatedAt: now,
      };

      if (editingId) {
        await loansApi.update(loan);
        toast.success('Loan updated');
      } else {
        await loansApi.create(loan);
        toast.success('Loan added');
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
    if (!confirm('Delete this loan and all its payments?')) return;
    try {
      // Delete associated payments
      const loanPmts = payments[id] || [];
      for (const p of loanPmts) {
        await lpApi.remove(p.id);
      }
      await loansApi.remove(id);
      toast.success('Loan deleted');
      await loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggleStatus = async (loan, newStatus) => {
    try {
      await loansApi.update({ ...loan, status: newStatus, updatedAt: new Date().toISOString() });
      toast.success(`Loan marked as ${LOAN_STATUSES.find(s => s.id === newStatus)?.name || newStatus}`);
      await loadData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // ─── PAYMENT CRUD ──────────────────────────────────────
  const handlePaymentSubmit = async (e, loanId) => {
    e.preventDefault();
    if (!paymentForm.amount || Number(paymentForm.amount) <= 0) return toast.error('Enter payment amount');

    setSavingPayment(true);
    try {
      const now = new Date().toISOString();
      const amount = Number(paymentForm.amount);
      const principal = Number(paymentForm.principalPortion) || 0;
      const interest = Number(paymentForm.interestPortion) || 0;

      await lpApi.create({
        id: generateId(),
        loanId,
        amount,
        principalPortion: principal || (interest ? amount - interest : amount),
        interestPortion: interest || (principal ? amount - principal : 0),
        date: paymentForm.date,
        note: paymentForm.note.trim() || null,
        userId: 'local',
        createdAt: now,
        updatedAt: now,
      });

      // Update remaining balance
      const loan = loansList.find((l) => l.id === loanId);
      if (loan) {
        const effectivePrincipal = principal || (interest ? amount - interest : amount);
        const newRemaining = Math.max(0, loan.remainingBalance - effectivePrincipal);
        await loansApi.update({
          ...loan,
          remainingBalance: newRemaining,
          status: newRemaining <= 0 ? 'paid_off' : loan.status,
          updatedAt: now,
        });
      }

      toast.success('Payment recorded');
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
      // Restore remaining balance
      const restored = loan.remainingBalance + (payment.principalPortion || payment.amount);
      await loansApi.update({
        ...loan,
        remainingBalance: Math.min(restored, loan.principalAmount),
        status: 'active',
        updatedAt: new Date().toISOString(),
      });
      toast.success('Payment removed');
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
        <h1 className="page-title">Bank Loans</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-cream-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Bank Loans</h1>
        <button
          onClick={() => { setShowForm(!showForm); setEditingId(null); setForm({ ...EMPTY_FORM }); }}
          className="btn-primary text-xs flex items-center gap-1.5"
        >
          <Plus size={14} /> Add Loan
        </button>
      </div>

      {/* Summary Cards */}
      {loansList.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <CircleDollarSign size={14} className="text-cream-400" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">Total Borrowed</span>
            </div>
            <p className="text-lg font-heading font-bold">{formatCurrency(totalPrincipal)}</p>
          </div>
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown size={14} className="text-danger" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">Still Owed</span>
            </div>
            <p className="text-lg font-heading font-bold text-danger">{formatCurrency(totalRemaining)}</p>
          </div>
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle size={14} className="text-success" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">Paid Off</span>
            </div>
            <p className="text-lg font-heading font-bold text-success">{formatCurrency(totalPaid)}</p>
            {totalPrincipal > 0 && (
              <div className="mt-1.5">
                <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
                  <div className="h-full bg-success rounded-full transition-all" style={{ width: `${overallProgress}%` }} />
                </div>
                <p className="text-[10px] text-cream-400 mt-0.5">{overallProgress.toFixed(1)}% complete</p>
              </div>
            )}
          </div>
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} className="text-info" />
              <span className="text-[10px] text-cream-500 uppercase tracking-wide">Monthly Total</span>
            </div>
            <p className="text-lg font-heading font-bold">{formatCurrency(totalMonthly)}</p>
            <p className="text-[10px] text-cream-400">{formatCurrency(totalMonthly * 12)}/year</p>
          </div>
        </div>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card space-y-4 border-2 border-accent-200 dark:border-accent-800">
          <h3 className="text-sm font-semibold">{editingId ? 'Edit Loan' : 'Add New Loan'}</h3>

          {/* Loan type */}
          <div>
            <label className="text-xs font-medium text-cream-500 mb-2 block">Loan Type</label>
            <div className="grid grid-cols-4 gap-2">
              {LOAN_TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all text-center ${
                    form.type === t.id
                      ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                      : 'border-cream-200 dark:border-dark-border hover:border-cream-300'
                  }`}
                >
                  <span className="text-lg">{t.icon}</span>
                  <span className="text-[10px] font-medium leading-tight">{t.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name & Lender */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">
                Loan Name <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Home Mortgage"
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">Lender / Bank</label>
              <input
                type="text"
                value={form.lender}
                onChange={(e) => setForm((f) => ({ ...f, lender: e.target.value }))}
                placeholder="e.g. Banca Transilvania"
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              />
            </div>
          </div>

          {/* Amount & Remaining */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">
                Principal Amount <span className="text-danger">*</span>
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
              <label className="text-xs font-medium text-cream-500 mb-1 block">Remaining Balance</label>
              <input
                type="number"
                value={form.remainingBalance}
                onChange={(e) => setForm((f) => ({ ...f, remainingBalance: e.target.value }))}
                placeholder="Same as principal if new"
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                min="0" step="0.01" inputMode="decimal"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">Currency</label>
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
              <label className="text-xs font-medium text-cream-500 mb-1 block">Interest Rate (%)</label>
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
              <label className="text-xs font-medium text-cream-500 mb-1 block">Interest Type</label>
              <select
                value={form.interestType}
                onChange={(e) => setForm((f) => ({ ...f, interestType: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              >
                <option value="fixed">Fixed</option>
                <option value="variable">Variable</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">Monthly Payment</label>
              <input
                type="number"
                value={form.monthlyPayment}
                onChange={(e) => setForm((f) => ({ ...f, monthlyPayment: e.target.value }))}
                placeholder="Monthly rate/installment"
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
                min="0" step="0.01" inputMode="decimal"
              />
            </div>
          </div>

          {/* Dates & Payment Day */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">End Date (Maturity)</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-cream-500 mb-1 block">Payment Day</label>
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
            <label className="text-xs font-medium text-cream-500 mb-1 block">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Additional details..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-sm resize-none"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="btn-ghost text-xs flex items-center gap-1">
              <X size={14} /> Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary text-xs flex items-center gap-1">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {editingId ? 'Update Loan' : 'Add Loan'}
            </button>
          </div>
        </form>
      )}

      {/* Filter tabs */}
      {loansList.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'active', label: 'Active', count: loansList.filter(l => l.status === 'active').length },
            { id: 'paid_off', label: 'Paid Off', count: loansList.filter(l => l.status === 'paid_off').length },
            { id: 'all', label: 'All', count: loansList.length },
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
        <div className="card text-center py-12">
          <Building2 size={48} className="mx-auto mb-3 text-cream-300 dark:text-cream-600" />
          <h3 className="text-sm font-semibold mb-1">
            {loansList.length === 0 ? 'No loans yet' : 'No loans match this filter'}
          </h3>
          <p className="text-xs text-cream-500">
            {loansList.length === 0 ? 'Add your bank loans to track payments and progress' : 'Try a different filter'}
          </p>
        </div>
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
                      {status.name}
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
                        <Percent size={10} /> {loan.interestRate}% {loan.interestType}
                      </span>
                    )}
                    {loan.monthlyPayment > 0 && (
                      <span className="text-xs text-cream-500 flex items-center gap-1">
                        <Calendar size={10} /> {formatCurrency(loan.monthlyPayment, loan.currency)}/mo
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
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-cream-500">
                        {formatCurrency(loan.principalAmount - loan.remainingBalance, loan.currency)} paid
                      </span>
                      <span className="text-[10px] text-cream-500">
                        {formatCurrency(loan.remainingBalance, loan.currency)} remaining
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-lg font-heading font-bold text-danger">
                    {formatCurrency(loan.remainingBalance, loan.currency)}
                  </span>
                  {isExpanded ? <ChevronUp size={16} className="text-cream-400" /> : <ChevronDown size={16} className="text-cream-400" />}
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-4 space-y-4 border-t border-cream-200 dark:border-dark-border pt-4">
                  {/* Loan details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">Principal</p>
                      <p className="text-sm font-semibold">{formatCurrency(loan.principalAmount, loan.currency)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">Total Paid</p>
                      <p className="text-sm font-semibold text-success">{formatCurrency(totalPaidLoan, loan.currency)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">Interest Paid</p>
                      <p className="text-sm font-semibold text-warning">{formatCurrency(totalInterest, loan.currency)}</p>
                    </div>
                    <div className="p-2 rounded-lg bg-cream-50 dark:bg-dark-bg">
                      <p className="text-[10px] text-cream-400">
                        {remainingMonths ? 'Est. Months Left' : 'Progress'}
                      </p>
                      <p className="text-sm font-semibold">
                        {remainingMonths ? `~${remainingMonths} months` : `${progress.toFixed(1)}%`}
                      </p>
                    </div>
                  </div>

                  {/* Extra info */}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-cream-500">
                    <span>Started: {formatDate(loan.startDate, 'dd MMM yyyy')}</span>
                    {loan.endDate && <span>Maturity: {formatDate(loan.endDate, 'dd MMM yyyy')}</span>}
                    <span>Payment day: {loan.paymentDay}</span>
                    {loan.notes && <span className="block w-full text-cream-400 italic">"{loan.notes}"</span>}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {loan.status === 'active' && (
                      <button
                        onClick={() => { setShowPaymentForm(loan.id); setPaymentForm({ ...EMPTY_PAYMENT }); }}
                        className="btn-primary text-xs flex items-center gap-1"
                      >
                        <DollarSign size={14} /> Record Payment
                      </button>
                    )}
                    <button onClick={() => handleEdit(loan)} className="btn-ghost text-xs flex items-center gap-1">
                      <Edit3 size={14} /> Edit
                    </button>
                    {loan.status === 'active' && (
                      <button
                        onClick={() => toggleStatus(loan, 'paid_off')}
                        className="btn-ghost text-xs flex items-center gap-1 text-success border-success/30 hover:bg-success/10"
                      >
                        <CheckCircle size={14} /> Mark Paid Off
                      </button>
                    )}
                    {loan.status === 'paid_off' && (
                      <button
                        onClick={() => toggleStatus(loan, 'active')}
                        className="btn-ghost text-xs flex items-center gap-1"
                      >
                        <Clock size={14} /> Reactivate
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(loan.id)}
                      className="btn-ghost text-xs flex items-center gap-1 text-danger border-danger/30 hover:bg-danger/10"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>

                  {/* Payment form */}
                  {showPaymentForm === loan.id && (
                    <form
                      onSubmit={(e) => handlePaymentSubmit(e, loan.id)}
                      className="p-3 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border space-y-3"
                    >
                      <h4 className="text-xs font-semibold">Record Payment</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] text-cream-400 block mb-0.5">Total Amount *</label>
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
                          <label className="text-[10px] text-cream-400 block mb-0.5">Principal Part</label>
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
                          <label className="text-[10px] text-cream-400 block mb-0.5">Interest Part</label>
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
                          <label className="text-[10px] text-cream-400 block mb-0.5">Date</label>
                          <input
                            type="date"
                            value={paymentForm.date}
                            onChange={(e) => setPaymentForm((f) => ({ ...f, date: e.target.value }))}
                            className="w-full px-2 py-1.5 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-cream-400 block mb-0.5">Note</label>
                        <input
                          type="text"
                          value={paymentForm.note}
                          onChange={(e) => setPaymentForm((f) => ({ ...f, note: e.target.value }))}
                          placeholder="Optional note"
                          className="w-full px-2 py-1.5 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card text-xs"
                        />
                      </div>
                      {/* Quick amount buttons */}
                      {loan.monthlyPayment > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-cream-400">Quick:</span>
                          <button
                            type="button"
                            onClick={() => setPaymentForm((f) => ({ ...f, amount: String(loan.monthlyPayment) }))}
                            className="text-[10px] px-2 py-0.5 rounded bg-info/10 text-info hover:bg-info/20"
                          >
                            Monthly ({formatCurrency(loan.monthlyPayment, loan.currency)})
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentForm((f) => ({ ...f, amount: String(loan.remainingBalance) }))}
                            className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success hover:bg-success/20"
                          >
                            Pay off ({formatCurrency(loan.remainingBalance, loan.currency)})
                          </button>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShowPaymentForm(null)} className="btn-ghost text-xs">
                          Cancel
                        </button>
                        <button type="submit" disabled={savingPayment} className="btn-primary text-xs flex items-center gap-1">
                          {savingPayment ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                          Record Payment
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Payment history */}
                  {loanPaymentsList.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold mb-2 flex items-center gap-1">
                        <BarChart3 size={12} />
                        Payment History ({loanPaymentsList.length})
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
