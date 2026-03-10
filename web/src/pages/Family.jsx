import { useState, useEffect, useMemo } from 'react';
import { useFamily } from '../contexts/FamilyContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { sharedExpenses as sharedApi } from '../lib/api';
import { calculateBalances, simplifyDebts, getMemberSummary } from '../lib/settlement';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { formatCurrency } from '../lib/helpers';
import {
  Users, Plus, Copy, Check, LogOut, Settings, UserPlus, Crown,
  LayoutDashboard, Receipt, ArrowRight, CheckCircle2,
} from 'lucide-react';

function CreateFamilyForm({ onCreated }) {
  const { createFamily, FAMILY_EMOJIS } = useFamily();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(FAMILY_EMOJIS[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const family = await createFamily(name.trim(), emoji);
      onCreated?.(family);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Family name</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Casa noastra" required />
      </div>
      <div>
        <label className="label">Icon</label>
        <div className="flex flex-wrap gap-2">
          {FAMILY_EMOJIS.map((e) => (
            <button
              key={e} type="button"
              onClick={() => setEmoji(e)}
              className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                emoji === e ? 'bg-accent-50 dark:bg-accent-500/15 ring-2 ring-accent' : 'bg-cream-100 dark:bg-dark-border hover:bg-cream-200'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={loading || !name.trim()} className="btn-primary w-full">
        {loading ? 'Creating...' : 'Create family'}
      </button>
    </form>
  );
}

function JoinFamilyForm({ onJoined }) {
  const { joinFamily } = useFamily();
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const family = await joinFamily(code.trim());
      toast.success(`Joined ${family.name}!`);
      onJoined?.(family);
    } catch (err) {
      toast.error(err.message || 'Failed to join');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Invite code</label>
        <input
          className="input text-center text-2xl tracking-[0.5em] font-mono uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="XXXXXX"
          maxLength={6}
          required
        />
        <p className="text-xs text-cream-500 mt-1">Ask the family admin for the 6-character invite code</p>
      </div>
      <button type="submit" disabled={loading || code.length < 6} className="btn-primary w-full">
        {loading ? 'Joining...' : 'Join family'}
      </button>
    </form>
  );
}

function InviteCodeDisplay({ family }) {
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement('input');
      input.value = family.inviteCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border">
      <div className="flex-1">
        <p className="text-xs text-cream-500 mb-1">Invite code</p>
        <p className="text-2xl font-mono font-bold tracking-[0.5em]">{family.inviteCode}</p>
      </div>
      <button
        onClick={copyCode}
        className={`p-3 rounded-xl transition-colors ${copied ? 'bg-success/10 text-success' : 'bg-cream-200 dark:bg-dark-border text-cream-600 hover:bg-cream-300'}`}
      >
        {copied ? <Check size={20} /> : <Copy size={20} />}
      </button>
    </div>
  );
}

function MemberCard({ member, isMe, isAdmin: viewerIsAdmin }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-xl transition-colors ${isMe ? 'bg-accent-50/50 dark:bg-accent-500/5' : ''}`}>
      <div className="w-10 h-10 rounded-full bg-cream-200 dark:bg-dark-border flex items-center justify-center text-lg">
        {member.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{member.displayName}</span>
          {isMe && <span className="text-[10px] text-accent font-medium">(you)</span>}
        </div>
        <div className="flex items-center gap-2 text-xs text-cream-500">
          {member.role === 'admin' && (
            <span className="flex items-center gap-0.5 text-warning">
              <Crown size={10} /> Admin
            </span>
          )}
          <span>Joined {new Date(member.joinedAt).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

export default function Family() {
  const { toast } = useToast();
  const { effectiveUserId } = useAuth();
  const {
    myFamilies, activeFamily, members, loading, isAdmin, myMembership,
    switchFamily, leaveFamily, updateFamily, updateMember, MEMBER_EMOJIS,
  } = useFamily();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);

  // Load shared expenses when family is active
  useEffect(() => {
    if (!activeFamily) return;
    setExpensesLoading(true);
    sharedApi.getAll({ familyId: activeFamily.id })
      .then(setExpenses)
      .catch(() => {})
      .finally(() => setExpensesLoading(false));
  }, [activeFamily]);

  // Settlements
  const balances = useMemo(() => calculateBalances(expenses), [expenses]);
  const settlements = useMemo(() => simplifyDebts(balances), [balances]);
  const memberSummary = useMemo(() => getMemberSummary(expenses), [expenses]);

  const getMemberName = (userId) => {
    const m = members.find((m) => m.userId === userId);
    return m ? `${m.emoji} ${m.displayName}` : userId;
  };

  const handleSettleDebt = async (from, to) => {
    // Mark all splits as settled between these two users
    const updated = [];
    for (const exp of expenses) {
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
    if (updated.length > 0) {
      setExpenses((prev) => prev.map((e) => updated.find((u) => u.id === e.id) || e));
      toast.success('Debt settled!');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Family</h1>
        <div className="card animate-pulse"><div className="h-24 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>
      </div>
    );
  }

  // No family yet — show create/join
  if (myFamilies.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">Family</h1>

        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-accent" />
          </div>
          <h2 className="text-lg font-heading font-bold mb-2">Shared budgeting</h2>
          <p className="text-sm text-cream-500 max-w-sm mx-auto mb-6">
            Create a family group to track shared expenses, split bills, and manage household budgets together.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            <button onClick={() => setShowCreate(true)} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Plus size={16} /> Create family
            </button>
            <button onClick={() => setShowJoin(true)} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <UserPlus size={16} /> Join family
            </button>
          </div>
        </div>

        <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create a family">
          <CreateFamilyForm onCreated={() => setShowCreate(false)} />
        </Modal>
        <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Join a family">
          <JoinFamilyForm onJoined={() => setShowJoin(false)} />
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{activeFamily?.emoji}</span>
          <div>
            <h1 className="page-title mb-0">{activeFamily?.name || 'Family'}</h1>
            <p className="text-xs text-cream-500">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-ghost text-xs flex items-center gap-1">
            <Plus size={14} /> New
          </button>
          <button onClick={() => setShowJoin(true)} className="btn-ghost text-xs flex items-center gap-1">
            <UserPlus size={14} /> Join
          </button>
        </div>
      </div>

      {/* Family switcher (if multiple families) */}
      {myFamilies.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {myFamilies.map((f) => (
            <button
              key={f.id}
              onClick={() => switchFamily(f.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                activeFamily?.id === f.id
                  ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                  : 'border-cream-300 dark:border-dark-border text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              {f.emoji} {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex border-b border-cream-200 dark:border-dark-border overflow-x-auto">
        {[
          { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'expenses', label: 'Shared', icon: Receipt },
          { id: 'members', label: 'Members', icon: Users },
          { id: 'settings', label: 'Settings', icon: Settings },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-[1px] ${
              tab === t.id
                ? 'border-accent text-accent-700 dark:text-accent-300'
                : 'border-transparent text-cream-500 hover:text-cream-700'
            }`}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Dashboard tab */}
      {tab === 'dashboard' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card">
              <p className="text-xs text-cream-500 mb-1">Total shared</p>
              <p className="font-heading font-bold text-lg money">
                {formatCurrency(expenses.reduce((s, e) => s + e.totalAmount, 0), activeFamily?.defaultCurrency || 'RON')}
              </p>
              <p className="text-[10px] text-cream-400">{expenses.length} expense{expenses.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="card">
              <p className="text-xs text-cream-500 mb-1">Unsettled</p>
              <p className="font-heading font-bold text-lg money text-warning">
                {formatCurrency(
                  settlements.reduce((s, t) => s + t.amount, 0),
                  activeFamily?.defaultCurrency || 'RON'
                )}
              </p>
              <p className="text-[10px] text-cream-400">{settlements.length} transfer{settlements.length !== 1 ? 's' : ''} needed</p>
            </div>
          </div>

          {/* Settlements */}
          {settlements.length > 0 ? (
            <div className="card">
              <h3 className="section-title">Settlements needed</h3>
              <div className="space-y-3">
                {settlements.map((t, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 dark:bg-dark-bg">
                    <div className="flex-1 flex items-center gap-2 text-sm">
                      <span className="font-medium">{getMemberName(t.from)}</span>
                      <ArrowRight size={14} className="text-cream-400" />
                      <span className="font-medium">{getMemberName(t.to)}</span>
                    </div>
                    <span className="font-heading font-bold money text-warning">
                      {formatCurrency(t.amount, activeFamily?.defaultCurrency || 'RON')}
                    </span>
                    <button
                      onClick={() => handleSettleDebt(t.from, t.to)}
                      className="p-2 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                      title="Mark as settled"
                    >
                      <CheckCircle2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : expenses.length > 0 ? (
            <div className="card text-center py-6">
              <CheckCircle2 size={24} className="text-success mx-auto mb-2" />
              <p className="text-sm font-medium text-success">All settled up!</p>
              <p className="text-xs text-cream-500">No outstanding debts</p>
            </div>
          ) : null}

          {/* Who paid what */}
          {memberSummary.length > 0 && (
            <div className="card">
              <h3 className="section-title">Who paid what</h3>
              <div className="space-y-2">
                {memberSummary.sort((a, b) => b.totalPaid - a.totalPaid).map((s) => (
                  <div key={s.userId} className="flex items-center justify-between text-sm">
                    <span className="font-medium">{getMemberName(s.userId)}</span>
                    <div className="text-right">
                      <span className="money font-medium">{formatCurrency(s.totalPaid, activeFamily?.defaultCurrency || 'RON')}</span>
                      <span className="text-xs text-cream-400 ml-1">paid</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {expenses.length === 0 && (
            <div className="card text-center py-8">
              <Receipt size={24} className="text-cream-300 mx-auto mb-2" />
              <p className="text-sm text-cream-500">No shared expenses yet</p>
              <p className="text-xs text-cream-400">Split a transaction from the Transactions page</p>
            </div>
          )}
        </div>
      )}

      {/* Shared expenses tab */}
      {tab === 'expenses' && (
        <div className="space-y-3">
          {expenses.length > 0 ? (
            expenses.sort((a, b) => (b.date || b.createdAt).localeCompare(a.date || a.createdAt)).map((exp) => (
              <div key={exp.id} className="card p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium">{exp.merchant || exp.description}</p>
                    <p className="text-xs text-cream-500">{exp.date} · Paid by {getMemberName(exp.paidByUserId)}</p>
                  </div>
                  <p className="font-heading font-bold money">{formatCurrency(exp.totalAmount, exp.currency)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {exp.splits?.map((s) => (
                    <span
                      key={s.userId}
                      className={`text-[11px] px-2 py-0.5 rounded-full ${
                        s.settled
                          ? 'bg-success/10 text-success'
                          : 'bg-cream-200 dark:bg-dark-border text-cream-600'
                      }`}
                    >
                      {getMemberName(s.userId)}: {formatCurrency(s.amount, exp.currency)}
                      {s.settled && ' ✓'}
                    </span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon={Receipt}
              title="No shared expenses"
              description="Split a transaction to see it here"
            />
          )}
        </div>
      )}

      {/* Members tab */}
      {tab === 'members' && (
        <div className="space-y-4">
          <InviteCodeDisplay family={activeFamily} />

          <div className="card p-0 divide-y divide-cream-100 dark:divide-dark-border">
            {members.map((m) => (
              <MemberCard
                key={m.id}
                member={m}
                isMe={m.userId === effectiveUserId}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Settings tab */}
      {tab === 'settings' && (
        <div className="space-y-4">
          <div className="card space-y-4">
            <div>
              <label className="label">Family name</label>
              <input
                className="input"
                defaultValue={activeFamily?.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== activeFamily?.name) {
                    updateFamily({ name: e.target.value.trim() });
                    toast.success('Name updated');
                  }
                }}
                disabled={!isAdmin}
              />
            </div>

            <div>
              <label className="label">Your display name</label>
              <input
                className="input"
                defaultValue={myMembership?.displayName}
                onBlur={(e) => {
                  if (e.target.value.trim() && myMembership) {
                    updateMember(myMembership.id, { displayName: e.target.value.trim() });
                    toast.success('Display name updated');
                  }
                }}
              />
            </div>

            <div>
              <label className="label">Your emoji</label>
              <div className="flex flex-wrap gap-2">
                {MEMBER_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      if (myMembership) {
                        updateMember(myMembership.id, { emoji: e });
                        toast.success('Emoji updated');
                      }
                    }}
                    className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
                      myMembership?.emoji === e ? 'bg-accent-50 dark:bg-accent-500/15 ring-2 ring-accent' : 'bg-cream-100 dark:bg-dark-border hover:bg-cream-200'
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Danger zone */}
          <div className="card border-danger/20">
            <h4 className="text-sm font-medium text-danger mb-3">Danger zone</h4>
            <button
              onClick={async () => {
                if (confirm('Are you sure you want to leave this family?')) {
                  await leaveFamily(activeFamily.id);
                  toast.success('Left family');
                }
              }}
              className="btn-danger text-xs flex items-center gap-1"
            >
              <LogOut size={14} /> Leave family
            </button>
          </div>
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create a new family">
        <CreateFamilyForm onCreated={() => setShowCreate(false)} />
      </Modal>
      <Modal open={showJoin} onClose={() => setShowJoin(false)} title="Join a family">
        <JoinFamilyForm onJoined={() => setShowJoin(false)} />
      </Modal>
    </div>
  );
}
