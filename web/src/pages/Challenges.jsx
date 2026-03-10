import { useState, useEffect, useMemo } from 'react';
import { challenges as challengeApi, transactions as txApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { generateId, formatCurrency, getCategoryById, formatDateISO } from '../lib/helpers';
import { CATEGORIES } from '../lib/constants';
import CategoryPicker from '../components/CategoryPicker';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { Trophy, Plus, Flame, Target, Ban, PiggyBank, Check, X, Calendar, TrendingDown } from 'lucide-react';

const CHALLENGE_PRESETS = [
  { type: 'no_spend', title: 'No-Spend Weekend', icon: '🚫', description: 'Don\'t spend anything this weekend', durationDays: 2, category: null },
  { type: 'no_spend', title: 'No-Spend Week', icon: '💪', description: '7 days with zero spending', durationDays: 7, category: null },
  { type: 'budget_cap', title: 'Groceries Under 500', icon: '🛒', description: 'Keep groceries under 500 this month', target: 500, durationDays: 30, category: 'groceries' },
  { type: 'budget_cap', title: 'Dining Under 200', icon: '🍽', description: 'Eat out less — keep dining under 200', target: 200, durationDays: 30, category: 'dining' },
  { type: 'savings', title: '30-Day Savings Sprint', icon: '🏦', description: 'Save more than you spend for 30 days', durationDays: 30, category: null },
  { type: 'no_spend', title: 'No Coffee Shop Month', icon: '☕', description: 'Make coffee at home for a month', durationDays: 30, category: 'dining' },
];

function getProgress(challenge, transactions) {
  const start = new Date(challenge.startDate);
  const end = new Date(challenge.endDate);
  const now = new Date();
  const relevant = transactions.filter(t => {
    const d = new Date(t.date);
    return d >= start && d <= end && t.type === 'expense' &&
      (!challenge.category || t.category === challenge.category);
  });

  const totalSpent = relevant.reduce((s, t) => s + t.amount, 0);
  const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  const daysPassed = Math.max(0, Math.ceil((Math.min(now, end) - start) / (1000 * 60 * 60 * 24)));
  const daysRemaining = Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));

  let percent = 0;
  let status = 'active';
  let statusLabel = '';

  if (challenge.type === 'no_spend') {
    percent = totalDays > 0 ? Math.round((daysPassed / totalDays) * 100) : 0;
    if (totalSpent > 0) {
      status = 'failed';
      statusLabel = `Spent ${Math.round(totalSpent)} — challenge broken`;
    } else if (now > end) {
      status = 'completed';
      statusLabel = 'Zero spending — you did it!';
    } else {
      statusLabel = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} to go — keep it up!`;
    }
  } else if (challenge.type === 'budget_cap') {
    percent = challenge.target > 0 ? Math.round((totalSpent / challenge.target) * 100) : 0;
    if (totalSpent > challenge.target) {
      status = 'failed';
      statusLabel = `Over budget by ${Math.round(totalSpent - challenge.target)}`;
    } else if (now > end) {
      status = 'completed';
      statusLabel = `Spent ${Math.round(totalSpent)} of ${challenge.target} — success!`;
    } else {
      const remaining = challenge.target - totalSpent;
      statusLabel = `${Math.round(remaining)} remaining for ${daysRemaining} days`;
    }
  } else if (challenge.type === 'savings') {
    const income = transactions.filter(t => {
      const d = new Date(t.date);
      return d >= start && d <= end && t.type === 'income';
    }).reduce((s, t) => s + t.amount, 0);
    const saved = income - totalSpent;
    percent = income > 0 ? Math.round((saved / income) * 100) : 0;
    if (now > end) {
      status = saved > 0 ? 'completed' : 'failed';
      statusLabel = saved > 0 ? `Saved ${Math.round(saved)} — well done!` : `Spent more than earned`;
    } else {
      statusLabel = `Saved ${Math.round(Math.max(0, saved))} so far`;
    }
  }

  return { totalSpent, percent: Math.min(percent, 100), status, statusLabel, daysPassed, daysRemaining, totalDays };
}

export default function Challenges() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [allTx, setAllTx] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const currency = user?.defaultCurrency || 'RON';

  const [form, setForm] = useState({
    type: 'budget_cap',
    title: '',
    target: '',
    category: '',
    durationDays: '30',
  });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ch, tx] = await Promise.all([
        challengeApi.getAll({ userId: effectiveUserId }),
        txApi.getAll({ userId: effectiveUserId }),
      ]);
      setItems(ch);
      setAllTx(tx);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const active = useMemo(() => items.filter(c => {
    const p = getProgress(c, allTx);
    return p.status === 'active';
  }), [items, allTx]);

  const completed = useMemo(() => items.filter(c => {
    const p = getProgress(c, allTx);
    return p.status === 'completed';
  }), [items, allTx]);

  const failed = useMemo(() => items.filter(c => {
    const p = getProgress(c, allTx);
    return p.status === 'failed';
  }), [items, allTx]);

  const handleCreate = async (preset = null) => {
    const data = preset || form;
    if (!data.title) { toast.error('Title required'); return; }

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + (Number(data.durationDays) || 30));

    const challenge = {
      id: generateId(),
      type: data.type,
      title: data.title,
      target: Number(data.target) || 0,
      category: data.category || null,
      startDate: formatDateISO(now),
      endDate: formatDateISO(end),
      status: 'active',
      userId: effectiveUserId,
      createdAt: new Date().toISOString(),
    };

    await challengeApi.create(challenge);
    toast.success(`Challenge "${challenge.title}" started!`);
    setShowForm(false);
    setShowPresets(false);
    setForm({ type: 'budget_cap', title: '', target: '', category: '', durationDays: '30' });
    loadData();
  };

  const handleDelete = async (id) => {
    await challengeApi.remove(id);
    toast.success('Challenge removed');
    loadData();
  };

  if (loading) return <SkeletonPage />;

  const streakDays = (() => {
    // Calculate current no-spend streak
    const sorted = allTx
      .filter(t => t.type === 'expense')
      .map(t => t.date)
      .sort((a, b) => b.localeCompare(a));

    if (sorted.length === 0) return 0;

    let streak = 0;
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = formatDateISO(d);
      if (sorted.includes(ds)) break;
      streak++;
    }
    return streak;
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title mb-0">Challenges</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowPresets(true)} className="btn-secondary text-xs flex items-center gap-1">
            <Flame size={14} /> Presets
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs flex items-center gap-1">
            <Plus size={14} /> Custom
          </button>
        </div>
      </div>

      {/* Streak card */}
      {streakDays > 0 && (
        <div className="card bg-gradient-to-r from-accent-500/10 to-accent-600/5 border-accent-200 dark:border-accent-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-100 dark:bg-accent-900/40 flex items-center justify-center text-2xl">🔥</div>
            <div>
              <p className="text-2xl font-heading font-bold">{streakDays} day streak</p>
              <p className="text-xs text-cream-500">No spending for {streakDays} consecutive day{streakDays > 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>
      )}

      {/* Active challenges */}
      {active.length > 0 && (
        <div>
          <h2 className="section-title flex items-center gap-1.5"><Target size={12} /> Active challenges</h2>
          <div className="space-y-3">
            {active.map(c => {
              const p = getProgress(c, allTx);
              const cat = c.category ? getCategoryById(c.category) : null;
              return (
                <div key={c.id} className="card">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold">{c.title}</h3>
                      <p className="text-xs text-cream-500">{cat ? `${cat.icon} ${cat.name}` : 'All categories'} · {p.daysRemaining}d left</p>
                    </div>
                    <button onClick={() => handleDelete(c.id)} className="p-1 text-cream-400 hover:text-danger"><X size={14} /></button>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        c.type === 'budget_cap' ? (p.percent > 80 ? 'bg-warning' : 'bg-success') :
                        c.type === 'no_spend' ? 'bg-accent-500' : 'bg-success'
                      }`}
                      style={{ width: `${p.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-cream-600 dark:text-cream-400">{p.statusLabel}</p>
                  {c.type === 'budget_cap' && c.target > 0 && (
                    <p className="text-xs text-cream-400 mt-0.5">
                      {formatCurrency(p.totalSpent, currency)} / {formatCurrency(c.target, currency)} ({p.percent}%)
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Completed */}
      {completed.length > 0 && (
        <div>
          <h2 className="section-title flex items-center gap-1.5"><Check size={12} className="text-success" /> Completed</h2>
          <div className="space-y-2">
            {completed.map(c => {
              const p = getProgress(c, allTx);
              return (
                <div key={c.id} className="card bg-success/5 border-success/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🏆</span>
                      <div>
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-xs text-success">{p.statusLabel}</p>
                      </div>
                    </div>
                    <button onClick={() => handleDelete(c.id)} className="p-1 text-cream-400 hover:text-danger"><X size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Failed */}
      {failed.length > 0 && (
        <div>
          <h2 className="section-title flex items-center gap-1.5"><Ban size={12} className="text-danger" /> Not completed</h2>
          <div className="space-y-2">
            {failed.map(c => {
              const p = getProgress(c, allTx);
              return (
                <div key={c.id} className="card opacity-60">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-danger">{p.statusLabel}</p>
                    </div>
                    <button onClick={() => handleDelete(c.id)} className="p-1 text-cream-400 hover:text-danger"><X size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <EmptyState
          icon={Trophy}
          title="No challenges yet"
          description="Set spending challenges and track streaks to build better habits"
          action="Start a challenge"
          onAction={() => setShowPresets(true)}
        />
      )}

      {/* Presets Modal */}
      <Modal open={showPresets} onClose={() => setShowPresets(false)} title="Quick challenges">
        <div className="space-y-2">
          {CHALLENGE_PRESETS.map((preset, i) => (
            <button
              key={i}
              onClick={() => handleCreate(preset)}
              className="w-full text-left p-3 rounded-xl border border-cream-200 dark:border-dark-border hover:bg-cream-50 dark:hover:bg-cream-800/20 transition-colors"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{preset.icon}</span>
                <span className="text-sm font-medium">{preset.title}</span>
              </div>
              <p className="text-xs text-cream-500 ml-8">{preset.description}</p>
            </button>
          ))}
        </div>
      </Modal>

      {/* Custom Form Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="Custom challenge">
        <div className="space-y-4">
          <div>
            <label className="label">Challenge type</label>
            <select className="input" value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="budget_cap">Budget Cap</option>
              <option value="no_spend">No-Spend</option>
              <option value="savings">Savings Goal</option>
            </select>
          </div>
          <div>
            <label className="label">Title</label>
            <input className="input" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. No eating out" />
          </div>
          {form.type === 'budget_cap' && (
            <div>
              <label className="label">Target amount ({currency})</label>
              <input type="number" className="input" value={form.target} onChange={(e) => setForm(f => ({ ...f, target: e.target.value }))} placeholder="500" />
            </div>
          )}
          <div>
            <CategoryPicker
              label="Category (optional — leave for all)"
              value={form.category}
              onChange={(catId) => setForm(f => ({ ...f, category: catId }))}
              exclude={['income', 'transfer']}
            />
          </div>
          <div>
            <label className="label">Duration (days)</label>
            <input type="number" className="input" value={form.durationDays} onChange={(e) => setForm(f => ({ ...f, durationDays: e.target.value }))} placeholder="30" min="1" max="365" />
          </div>
          <button onClick={() => handleCreate()} className="btn-primary w-full">Start challenge</button>
        </div>
      </Modal>
    </div>
  );
}
