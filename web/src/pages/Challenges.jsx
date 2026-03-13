import { useState, useEffect, useMemo, useRef } from 'react';
import { challenges as challengeApi, transactions as txApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { generateId, formatCurrency, getCategoryById, formatDateISO } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import CategoryPicker from '../components/CategoryPicker';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { Trophy, Plus, Flame, Target, Ban, Check, X, RotateCcw } from 'lucide-react';
import HelpButton from '../components/HelpButton';

const getChallengePresets = (t) => [
  { type: 'no_spend', title: t('challenges.presetNoSpendWeekend'), icon: '🚫', description: t('challenges.presetNoSpendWeekendDesc'), durationDays: 2, category: null },
  { type: 'no_spend', title: t('challenges.presetNoSpendWeek'), icon: '💪', description: t('challenges.presetNoSpendWeekDesc'), durationDays: 7, category: null },
  { type: 'budget_cap', title: t('challenges.presetGroceries'), icon: '🛒', description: t('challenges.presetGroceriesDesc'), target: 500, durationDays: 30, category: 'groceries' },
  { type: 'budget_cap', title: t('challenges.presetDining'), icon: '🍽', description: t('challenges.presetDiningDesc'), target: 200, durationDays: 30, category: 'dining' },
  { type: 'savings', title: t('challenges.presetSavingsSprint'), icon: '🏦', description: t('challenges.presetSavingsSprintDesc'), durationDays: 30, category: null },
  { type: 'no_spend', title: t('challenges.presetNoCoffee'), icon: '☕', description: t('challenges.presetNoCoffeeDesc'), durationDays: 30, category: 'dining' },
];

function getProgress(challenge, transactions, t) {
  const start = new Date(challenge.startDate);
  const end = new Date(challenge.endDate);
  const now = new Date();
  const relevant = transactions.filter(tx => {
    const d = new Date(tx.date);
    return d >= start && d <= end && tx.type === 'expense' &&
      (!challenge.category || tx.category === challenge.category);
  });

  const totalSpent = relevant.reduce((s, tx) => s + tx.amount, 0);
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
      statusLabel = t ? t('challenges.spentChallengeBroken', { amount: Math.round(totalSpent) }) : `Spent ${Math.round(totalSpent)} — challenge broken`;
    } else if (now > end) {
      status = 'completed';
      statusLabel = t ? t('challenges.zeroSpendingSuccess') : 'Zero spending — you did it!';
    } else {
      statusLabel = t ? t('challenges.daysToGo', { count: daysRemaining }) : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} to go — keep it up!`;
    }
  } else if (challenge.type === 'budget_cap') {
    percent = challenge.target > 0 ? Math.round((totalSpent / challenge.target) * 100) : 0;
    if (totalSpent > challenge.target) {
      status = 'failed';
      statusLabel = t ? t('challenges.overBudgetBy', { amount: Math.round(totalSpent - challenge.target) }) : `Over budget by ${Math.round(totalSpent - challenge.target)}`;
    } else if (now > end) {
      status = 'completed';
      statusLabel = t ? t('challenges.spentOfTargetSuccess', { spent: Math.round(totalSpent), target: challenge.target }) : `Spent ${Math.round(totalSpent)} of ${challenge.target} — success!`;
    } else {
      const remaining = challenge.target - totalSpent;
      statusLabel = t ? t('challenges.remainingForDays', { amount: Math.round(remaining), days: daysRemaining }) : `${Math.round(remaining)} remaining for ${daysRemaining} days`;
    }
  } else if (challenge.type === 'savings') {
    const income = transactions.filter(itx => {
      const d = new Date(itx.date);
      return d >= start && d <= end && itx.type === 'income';
    }).reduce((s, itx) => s + itx.amount, 0);
    const saved = income - totalSpent;
    percent = income > 0 ? Math.round((saved / income) * 100) : 0;
    if (now > end) {
      status = saved > 0 ? 'completed' : 'failed';
      statusLabel = saved > 0
        ? (t ? t('challenges.savedWellDone', { amount: Math.round(saved) }) : `Saved ${Math.round(saved)} — well done!`)
        : (t ? t('challenges.spentMoreThanEarned') : 'Spent more than earned');
    } else {
      statusLabel = t ? t('challenges.savedSoFar', { amount: Math.round(Math.max(0, saved)) }) : `Saved ${Math.round(Math.max(0, saved))} so far`;
    }
  }

  return { totalSpent, percent: Math.min(percent, 100), status, statusLabel, daysPassed, daysRemaining, totalDays };
}

export default function Challenges() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
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

  const loadVersion = useRef(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    const load = async () => {
      setLoading(true);
      try {
        const [ch, tx] = await Promise.all([
          challengeApi.getAll({ userId: effectiveUserId }),
          txApi.getAll({ userId: effectiveUserId }),
        ]);
        if (loadVersion.current !== version) return;
        setItems(ch);
        setAllTx(tx);
      } catch (err) {
        if (loadVersion.current === version) {
          console.error('Failed to load challenges:', err);
          toast.error(t('challenges.failedLoad'));
        }
      }
      finally { if (loadVersion.current === version) setLoading(false); }
    };
    load();
  }, [effectiveUserId]);

  const loadData = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const [ch, tx] = await Promise.all([
        challengeApi.getAll({ userId: effectiveUserId }),
        txApi.getAll({ userId: effectiveUserId }),
      ]);
      if (loadVersion.current !== version) return;
      setItems(ch);
      setAllTx(tx);
    } catch (err) {
      if (loadVersion.current === version) {
        console.error('Failed to load challenges:', err);
        toast.error(t('challenges.failedLoad'));
      }
    }
    finally { if (loadVersion.current === version) setLoading(false); }
  };

  const active = useMemo(() => items.filter(c => {
    const p = getProgress(c, allTx, t);
    return p.status === 'active';
  }), [items, allTx]);

  const completed = useMemo(() => items.filter(c => {
    const p = getProgress(c, allTx, t);
    return p.status === 'completed';
  }), [items, allTx]);

  const failed = useMemo(() => items.filter(c => {
    const p = getProgress(c, allTx, t);
    return p.status === 'failed';
  }), [items, allTx]);

  const handleCreate = async (preset = null) => {
    const data = preset || form;
    if (!data.title) { toast.error(t('challenges.titleRequired')); return; }

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
    toast.success(t('challenges.started', { title: challenge.title }));
    setShowForm(false);
    setShowPresets(false);
    setForm({ type: 'budget_cap', title: '', target: '', category: '', durationDays: '30' });
    loadData();
  };

  const handleDelete = async (id) => {
    await challengeApi.remove(id);
    toast.success(t('challenges.deleted'));
    loadData();
  };

  const handleRetry = (challenge) => {
    setForm({
      type: challenge.type,
      title: challenge.title,
      target: challenge.target ? String(challenge.target) : '',
      category: challenge.category || '',
      durationDays: String(Math.ceil((new Date(challenge.endDate) - new Date(challenge.startDate)) / (1000 * 60 * 60 * 24))),
    });
    setShowForm(true);
  };

  if (loading) return <SkeletonPage />;

  const streakDays = (() => {
    // Calculate current no-spend streak
    const sorted = allTx
      .filter(tx => tx.type === 'expense')
      .map(tx => tx.date)
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
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('challenges.title')}</h1>
          <HelpButton section="challenges" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowPresets(true)} className="btn-secondary text-xs flex items-center gap-1">
            <Flame size={14} /> {t('challenges.presets')}
          </button>
          <button onClick={() => setShowForm(true)} className="btn-primary text-xs flex items-center gap-1">
            <Plus size={14} /> {t('challenges.custom')}
          </button>
        </div>
      </div>

      {/* Streak card */}
      {streakDays > 0 && (
        <div className="card bg-accent-50 dark:bg-accent-500/5 border-accent-200 dark:border-accent-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-accent-100 dark:bg-accent-900/40 flex items-center justify-center text-2xl">🔥</div>
            <div>
              <p className="text-2xl font-heading font-bold">{t('challenges.dayStreak', { count: streakDays })}</p>
              <p className="text-xs text-cream-500">{t('challenges.noSpendingStreak', { count: streakDays })}</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats summary */}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-100 dark:bg-cream-800/30 text-xs font-medium">
            <Trophy size={13} className="text-accent-600" />
            <span>{t('challenges.statsCompleted', { count: completed.length })}</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-100 dark:bg-cream-800/30 text-xs font-medium">
            <Ban size={13} className="text-danger" />
            <span>{t('challenges.statsFailed', { count: failed.length })}</span>
          </div>
          {(completed.length + failed.length) > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-100 dark:bg-cream-800/30 text-xs font-medium">
              <Target size={13} className="text-success" />
              <span>{t('challenges.successRate', { rate: Math.round((completed.length / (completed.length + failed.length)) * 100) })}</span>
            </div>
          )}
        </div>
      )}

      {/* Active challenges */}
      {active.length > 0 && (
        <div>
          <h2 className="section-title flex items-center gap-1.5"><Target size={12} /> {t('challenges.activeChallenges')}</h2>
          <div className="space-y-3">
            {active.map(c => {
              const p = getProgress(c, allTx, t);
              const cat = c.category ? getCategoryById(c.category) : null;
              return (
                <div key={c.id} className="card">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-sm font-bold">{c.title}</h3>
                      <p className="text-xs text-cream-500">{cat ? `${cat.icon} ${getCategoryLabel(cat, t)}` : t('challenges.allCategories')} · {p.daysRemaining}{t('challenges.dLeft')}</p>
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
          <h2 className="section-title flex items-center gap-1.5"><Check size={12} className="text-success" /> {t('challenges.completedSection')}</h2>
          <div className="space-y-2">
            {completed.map(c => {
              const p = getProgress(c, allTx, t);
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
          <h2 className="section-title flex items-center gap-1.5"><Ban size={12} className="text-danger" /> {t('challenges.notCompleted')}</h2>
          <div className="space-y-2">
            {failed.map(c => {
              const p = getProgress(c, allTx, t);
              return (
                <div key={c.id} className="card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-danger">{p.statusLabel}</p>
                      {p.percent > 0 && (
                        <p className="text-xs text-cream-500 mt-1">
                          {t('challenges.reachedPercent', { pct: p.percent })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleRetry(c)}
                        className="p-1.5 rounded-lg hover:bg-accent-50 dark:hover:bg-accent-500/10 text-accent-600 dark:text-accent-400 transition-colors"
                        title={t('challenges.retry')}
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg text-cream-400 hover:text-danger hover:bg-danger/10 transition-colors"><X size={14} /></button>
                    </div>
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
          title={t('challenges.noChallenges')}
          description={t('challenges.noChallengesDesc')}
          action={t('challenges.createFirst')}
          onAction={() => setShowPresets(true)}
        />
      )}

      {/* Presets Modal */}
      <Modal open={showPresets} onClose={() => setShowPresets(false)} title={t('challenges.quickChallenges')}>
        <div className="space-y-2">
          {getChallengePresets(t).map((preset, i) => (
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
      <Modal open={showForm} onClose={() => setShowForm(false)} title={t('challenges.customChallenge')}>
        <div className="space-y-4">
          <div>
            <label className="label">{t('challenges.type')}</label>
            <select className="input" value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))}>
              <option value="budget_cap">{t('challenges.budgetChallenge')}</option>
              <option value="no_spend">{t('challenges.noSpend')}</option>
              <option value="savings">{t('challenges.savingsChallenge')}</option>
            </select>
          </div>
          <div>
            <label className="label">{t('challenges.name')}</label>
            <input className="input" value={form.title} onChange={(e) => setForm(f => ({ ...f, title: e.target.value }))} placeholder={t('challenges.namePlaceholder')} />
          </div>
          {form.type === 'budget_cap' && (
            <div>
              <label className="label">{t('challenges.targetAmount')} ({currency})</label>
              <input type="number" className="input" value={form.target} onChange={(e) => setForm(f => ({ ...f, target: e.target.value }))} placeholder="500" />
            </div>
          )}
          <div>
            <CategoryPicker
              label={t('challenges.category')}
              value={form.category}
              onChange={(catId) => setForm(f => ({ ...f, category: catId }))}
              exclude={['income', 'transfer']}
            />
          </div>
          <div>
            <label className="label">{t('challenges.duration')}</label>
            <input type="number" className="input" value={form.durationDays} onChange={(e) => setForm(f => ({ ...f, durationDays: e.target.value }))} placeholder="30" min="1" max="365" />
          </div>
          <button onClick={() => handleCreate()} className="btn-primary w-full">{t('challenges.createFirst')}</button>
        </div>
      </Modal>
    </div>
  );
}
