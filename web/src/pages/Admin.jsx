import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { adminApi } from '../lib/adminApi';
import { formatDate } from '../lib/helpers';
import Modal from '../components/Modal';
import { SkeletonPage } from '../components/LoadingSkeleton';
import {
  BarChart, Bar, AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Shield, Users, Activity, AlertTriangle, Zap, RefreshCw,
  KeyRound, Ban, CheckCircle, Trash2, Clock, UserX, UserCheck, Trash, Bot, DollarSign,
  MessageSquare, Bug, Lightbulb, Eye, ChevronDown, ChevronUp,
} from 'lucide-react';

const ACTION_LABELS = {
  login: 'Logged in',
  register: 'Registered',
  create_record: 'Created record',
  update_record: 'Updated record',
  delete_record: 'Deleted record',
  sync_push: 'Synced data',
  ai_process: 'Used AI (receipt/NLP)',
  telegram_expense: 'Added via Telegram',
  admin_reset_password: 'Reset password (admin)',
  admin_suspend_user: 'Suspended user (admin)',
  admin_activate_user: 'Activated user (admin)',
  admin_delete_user: 'Deleted user (admin)',
  admin_toggle_ai_access: 'Toggled AI access (admin)',
  submit_feedback: 'Submitted feedback',
  admin_update_feedback: 'Updated feedback (admin)',
};

function useTimeAgo() {
  const { t } = useTranslation();
  return (ts) => {
    if (!ts) return t('admin.never');
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('admin.justNow');
    if (mins < 60) return t('admin.minutesAgo', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('admin.hoursAgo', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('admin.daysAgo', { count: days });
    return formatDate(ts, 'dd MMM');
  };
}

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
  const { t } = useTranslation();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [activity, setActivity] = useState([]);
  const [errors, setErrors] = useState([]);
  const [performance, setPerformance] = useState(null);
  const [aiCosts, setAiCosts] = useState(null);
  const [feedback, setFeedback] = useState({ data: [], counts: [] });
  const [resetModal, setResetModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const TABS = useMemo(() => [
    { id: 'overview', label: t('admin.tabOverview'), icon: Shield },
    { id: 'users', label: t('admin.tabUsers'), icon: Users },
    { id: 'ai-costs', label: t('admin.tabAiCosts'), icon: DollarSign },
    { id: 'activity', label: t('admin.tabActivity'), icon: Activity },
    { id: 'errors', label: t('admin.tabErrors'), icon: AlertTriangle },
    { id: 'performance', label: t('admin.tabPerformance'), icon: Zap },
    { id: 'feedback', label: t('admin.tabFeedback'), icon: MessageSquare },
  ], [t]);

  useEffect(() => { loadTabData(); }, [tab]);

  const loadTabData = async () => {
    setLoading(true);
    try {
      switch (tab) {
        case 'overview': setStats(await adminApi.getStats()); break;
        case 'users': setUsers(await adminApi.getUsers()); break;
        case 'activity': setActivity(await adminApi.getActivity({ limit: 100 })); break;
        case 'ai-costs': setAiCosts(await adminApi.getAiCosts()); break;
        case 'errors': setErrors(await adminApi.getErrors()); break;
        case 'performance': setPerformance(await adminApi.getPerformance()); break;
        case 'feedback': {
          const fb = await adminApi.getFeedback();
          setFeedback({ data: fb.data || [], counts: fb.counts || [] });
          break;
        }
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      toast.error(t('admin.passwordMinLength'));
      return;
    }
    try {
      await adminApi.resetPassword(resetModal.id, newPassword);
      toast.success(t('admin.passwordResetSuccess', { name: resetModal.name }));
      setResetModal(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleUser = async (u) => {
    try {
      const result = await adminApi.toggleUser(u.id);
      toast.success(t(result.suspended ? 'admin.userSuspended' : 'admin.userActivated', { name: u.name }));
      loadTabData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteUser = async () => {
    try {
      await adminApi.deleteUser(deleteModal.id);
      toast.success(t('admin.accountDeleted', { name: deleteModal.name }));
      setDeleteModal(null);
      loadTabData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleAiAccess = async (u) => {
    try {
      const result = await adminApi.toggleAiAccess(u.id, !u.aiProxyAllowed);
      toast.success(t(result.allowed ? 'admin.aiEnabled' : 'admin.aiDisabled', { name: u.name }));
      loadTabData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <Shield className="mx-auto text-cream-400 mb-4" size={48} />
        <h2 className="text-xl font-heading font-semibold mb-2 dark:text-dark-text">{t('admin.accessDenied')}</h2>
        <p className="text-cream-600 dark:text-cream-500">{t('admin.noAdminPrivileges')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title mb-0 flex items-center gap-2">
            <Shield size={24} /> {t('admin.title')}
          </h1>
          <p className="text-sm text-cream-600 dark:text-cream-500">{t('admin.subtitle')}</p>
        </div>
        <button onClick={() => { setRefreshing(true); loadTabData().finally(() => setRefreshing(false)); }}
          className="btn-secondary flex items-center gap-2 text-xs">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {t('admin.refresh')}
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-cream-200 dark:bg-dark-border rounded-xl p-1">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
              tab === tb.id
                ? 'bg-white dark:bg-dark-card shadow-sm text-cream-900 dark:text-dark-text'
                : 'text-cream-600 dark:text-cream-500 hover:text-cream-800'
            }`}>
            <tb.icon size={14} />
            <span className="hidden sm:inline">{tb.label}</span>
          </button>
        ))}
      </div>

      {loading ? <SkeletonPage /> : (
        <>
          {tab === 'overview' && stats && <OverviewTab stats={stats} />}
          {tab === 'users' && <UsersTab users={users} onResetPassword={setResetModal} onToggle={handleToggleUser} onToggleAi={handleToggleAiAccess} onDelete={setDeleteModal} currentUserId={user.id} />}
          {tab === 'ai-costs' && aiCosts && <AiCostsTab data={aiCosts} />}
          {tab === 'activity' && <ActivityTab activity={activity} />}
          {tab === 'errors' && <ErrorsTab errors={errors} />}
          {tab === 'performance' && performance && <PerformanceTab performance={performance} />}
          {tab === 'feedback' && <FeedbackTab data={feedback.data} counts={feedback.counts} onUpdate={loadTabData} />}
        </>
      )}

      {/* Reset password modal */}
      <Modal open={!!resetModal} onClose={() => { setResetModal(null); setNewPassword(''); }} title={t('admin.resetPasswordTitle', { name: resetModal?.name })}>
        <div className="space-y-4">
          <p className="text-sm text-cream-600 dark:text-cream-500">{t('admin.setNewPasswordFor', { email: resetModal?.email })}</p>
          <input type="text" className="input" placeholder={t('admin.newPasswordPlaceholder')} value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary text-sm" onClick={() => { setResetModal(null); setNewPassword(''); }}>{t('common.cancel')}</button>
            <button className="btn-primary text-sm" onClick={handleResetPassword}>{t('admin.resetPassword')}</button>
          </div>
        </div>
      </Modal>

      {/* Delete user modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title={t('admin.deleteUserAccount')}>
        <div className="space-y-4">
          <p className="text-sm text-cream-600 dark:text-cream-500">
            {t('admin.deleteUserWarning', { name: deleteModal?.name, email: deleteModal?.email })}
          </p>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary text-sm" onClick={() => setDeleteModal(null)}>{t('common.cancel')}</button>
            <button className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors" onClick={handleDeleteUser}>{t('admin.deleteAccount')}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────
function OverviewTab({ stats }) {
  const { t } = useTranslation();

  const statCards = [
    { label: t('admin.totalUsers'), value: stats.totalUsers, sub: t('admin.newThisWeek', { count: stats.recentSignups }) },
    { label: t('admin.activeToday'), value: stats.activeToday, sub: t('admin.thisWeek', { count: stats.activeWeek }) },
    { label: t('admin.activeThisMonth'), value: stats.activeMonth },
    { label: t('admin.totalRecords'), value: stats.totalTransactions, sub: t('admin.transactionsAcrossUsers') },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="card">
            <p className="text-xs text-cream-500 dark:text-cream-600 uppercase tracking-wide">{s.label}</p>
            <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{s.value}</p>
            {s.sub && <p className="text-xs text-cream-500 mt-1">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* API Calls Chart */}
        <div className="card">
          <h3 className="section-title mb-4">{t('admin.apiCalls7Days')}</h3>
          {stats.apiCallsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.apiCallsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="count" stroke="#059669" fill="#059669" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
        </div>

        {/* Feature Usage */}
        <div className="card">
          <h3 className="section-title mb-4">{t('admin.featureUsage30Days')}</h3>
          {stats.featureUsage.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.featureUsage.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="action" type="category" tick={{ fontSize: 10 }} width={100} tickFormatter={a => ACTION_LABELS[a] || a} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.totalApiCalls')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.totalApiCalls}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.avgResponseTime')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.avgResponseTime}ms</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.errorsAllTime')}</p>
          <p className="text-2xl font-heading font-bold text-red-600 mt-1">{stats.errorCount}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────
function UsersTab({ users, onResetPassword, onToggle, onToggleAi, onDelete, currentUserId }) {
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colUser')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colRole')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('common.status')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colAi')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colRecords')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colLastActive')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colJoined')}</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100 dark:divide-dark-border">
            {users.map(u => {
              const totalRecords = (u.transactionCount || 0) + (u.budgetCount || 0) + (u.goalCount || 0) + (u.recurringCount || 0) + (u.peopleCount || 0) + (u.debtCount || 0) + (u.wishlistCount || 0);
              const isSelf = u.id === currentUserId;
              return (
                <tr key={u.id} className="hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-cream-300 dark:bg-dark-border flex items-center justify-center text-sm font-medium text-cream-700 dark:text-cream-400">
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-cream-900 dark:text-dark-text">{u.name}{isSelf ? ` (${t('admin.you')})` : ''}</p>
                        <p className="text-xs text-cream-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-cream-200 text-cream-600 dark:bg-dark-border dark:text-cream-500'
                    }`}>{u.role || t('admin.roleUser')}</span>
                  </td>
                  <td className="px-4 py-3">
                    {u.suspended ? (
                      <span className="flex items-center gap-1 text-red-600 text-xs"><Ban size={12} /> {t('admin.suspended')}</span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} /> {t('common.active')}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="flex items-center gap-1 text-purple-600 text-xs"><Bot size={12} /> {t('admin.owner')}</span>
                    ) : (
                      <button
                        onClick={() => onToggleAi(u)}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors ${
                          u.aiProxyAllowed
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                            : 'bg-cream-200 text-cream-500 dark:bg-dark-border dark:text-cream-600 hover:bg-cream-300'
                        }`}
                        title={u.aiProxyAllowed ? t('admin.clickToRevokeAi') : t('admin.clickToGrantAi')}
                      >
                        <Bot size={12} />
                        {u.aiProxyAllowed ? t('admin.allowed') : t('admin.off')}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-cream-700 dark:text-cream-400">{totalRecords}</td>
                  <td className="px-4 py-3 text-cream-500 text-xs">{timeAgo(u.lastActive)}</td>
                  <td className="px-4 py-3 text-cream-500 text-xs">{u.createdAt ? formatDate(u.createdAt, 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => onResetPassword(u)} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={t('admin.resetPassword')}>
                          <KeyRound size={14} className="text-cream-600" />
                        </button>
                        <button onClick={() => onToggle(u)} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={u.suspended ? t('admin.activate') : t('admin.suspend')}>
                          {u.suspended ? <UserCheck size={14} className="text-green-600" /> : <UserX size={14} className="text-orange-600" />}
                        </button>
                        <button onClick={() => onDelete(u)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors" title={t('admin.deleteAccount')}>
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {users.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">{t('admin.noUsersYet')}</p>}
      </div>
    </div>
  );
}

// ─── AI Costs Tab ───────────────────────────────────────
function AiCostsTab({ data }) {
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();
  const { users, grandTotal } = data;

  function formatCost(usd) {
    if (usd === 0) return '$0.00';
    if (usd < 0.01) return `$${usd.toFixed(4)}`;
    return `$${usd.toFixed(2)}`;
  }

  function formatTokens(n) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toString();
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.totalCost')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{formatCost(grandTotal)}</p>
          <p className="text-xs text-cream-500 mt-1">{t('admin.estimatedFromTokens')}</p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.activeAiUsers')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{users.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.totalRequests')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">
            {users.reduce((sum, u) => sum + u.totalRequests, 0)}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.totalTokens')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">
            {formatTokens(users.reduce((sum, u) => sum + u.totalInputTokens + u.totalOutputTokens, 0))}
          </p>
        </div>
      </div>

      {/* Cost breakdown chart */}
      {users.length > 0 && (
        <div className="card">
          <h3 className="section-title mb-4">{t('admin.costByUser')}</h3>
          <ResponsiveContainer width="100%" height={Math.max(120, users.length * 45)}>
            <BarChart data={users} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(3)}`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v) => [`$${v.toFixed(4)}`, t('admin.costUsd')]}
              />
              <Bar dataKey="totalCostUSD" fill="#059669" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-user table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colUser')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colRequests')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colInputTokens')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colOutputTokens')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colEstCost')}</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colLastUsed')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100 dark:divide-dark-border">
              {users.map(u => (
                <tr key={u.userId} className="hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-cream-900 dark:text-dark-text">{u.name}</p>
                      <p className="text-xs text-cream-500">{u.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-cream-700 dark:text-cream-400 font-mono">{u.totalRequests}</td>
                  <td className="px-4 py-3 text-right text-cream-700 dark:text-cream-400 font-mono">{formatTokens(u.totalInputTokens)}</td>
                  <td className="px-4 py-3 text-right text-cream-700 dark:text-cream-400 font-mono">{formatTokens(u.totalOutputTokens)}</td>
                  <td className="px-4 py-3 text-right font-medium font-mono text-cream-900 dark:text-dark-text">{formatCost(u.totalCostUSD)}</td>
                  <td className="px-4 py-3 text-right text-cream-500 text-xs">{u.lastUsed ? timeAgo(u.lastUsed) : '—'}</td>
                </tr>
              ))}
              {users.length > 1 && (
                <tr className="bg-cream-50 dark:bg-dark-bg font-semibold">
                  <td className="px-4 py-3 text-cream-900 dark:text-dark-text">{t('common.total')}</td>
                  <td className="px-4 py-3 text-right font-mono">{users.reduce((s, u) => s + u.totalRequests, 0)}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatTokens(users.reduce((s, u) => s + u.totalInputTokens, 0))}</td>
                  <td className="px-4 py-3 text-right font-mono">{formatTokens(users.reduce((s, u) => s + u.totalOutputTokens, 0))}</td>
                  <td className="px-4 py-3 text-right font-mono text-cream-900 dark:text-dark-text">{formatCost(grandTotal)}</td>
                  <td className="px-4 py-3"></td>
                </tr>
              )}
            </tbody>
          </table>
          {users.length === 0 && (
            <div className="text-center py-12">
              <Bot className="mx-auto text-cream-400 mb-3" size={32} />
              <p className="text-cream-500 text-sm">{t('admin.noAiUsageYet')}</p>
              <p className="text-cream-400 text-xs mt-1">{t('admin.costTrackingStarts')}</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-cream-400 text-center">
        {t('admin.costDisclaimer')}
      </p>
    </div>
  );
}

// ─── Activity Tab ────────────────────────────────────────
function ActivityTab({ activity }) {
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();

  return (
    <div className="card p-0">
      <div className="divide-y divide-cream-100 dark:divide-dark-border">
        {activity.map(a => {
          let meta = {};
          // Intentionally swallowed — malformed metadata JSON defaults to empty object
          try { meta = JSON.parse(a.metadata || '{}'); } catch { /* non-critical parse fallback */ }
          return (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-cream-200 dark:bg-dark-border flex items-center justify-center text-xs font-medium text-cream-600 dark:text-cream-400 shrink-0">
                {a.userName?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-cream-900 dark:text-dark-text">
                  <span className="font-medium">{a.userName || t('admin.unknown')}</span>
                  {' '}
                  <span className="text-cream-600 dark:text-cream-500">
                    {ACTION_LABELS[a.action] || a.action}
                    {meta.table && ` ${t('admin.inTable', { table: meta.table })}`}
                  </span>
                </p>
              </div>
              <span className="text-xs text-cream-500 shrink-0">{timeAgo(a.timestamp)}</span>
            </div>
          );
        })}
        {activity.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">{t('admin.noActivityYet')}</p>}
      </div>
    </div>
  );
}

// ─── Errors Tab ──────────────────────────────────────────
function ErrorsTab({ errors }) {
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();

  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colTime')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colMethod')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colPath')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('common.status')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colUser')}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colResponse')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cream-100 dark:divide-dark-border">
            {errors.map(e => (
              <tr key={e.id} className="hover:bg-cream-50 dark:hover:bg-dark-border/50">
                <td className="px-4 py-3 text-xs text-cream-500 whitespace-nowrap">{timeAgo(e.timestamp)}</td>
                <td className="px-4 py-3">
                  <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-cream-200 dark:bg-dark-border text-cream-700 dark:text-cream-400">{e.method}</span>
                </td>
                <td className="px-4 py-3 text-xs font-mono text-cream-700 dark:text-cream-400 max-w-[200px] truncate">{e.path}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    e.status >= 500 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                  }`}>{e.status}</span>
                </td>
                <td className="px-4 py-3 text-xs text-cream-500">{e.userName || '—'}</td>
                <td className="px-4 py-3 text-xs text-cream-500">{e.responseTime}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
        {errors.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">{t('admin.noErrors')}</p>}
      </div>
    </div>
  );
}

// ─── Performance Tab ─────────────────────────────────────
function PerformanceTab({ performance }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="section-title mb-4">{t('admin.responseTimeByEndpoint')}</h3>
        {performance.byPath.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, performance.byPath.length * 30)}>
            <BarChart data={performance.byPath} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
              <XAxis type="number" tick={{ fontSize: 10 }} unit="ms" />
              <YAxis dataKey="path" type="category" tick={{ fontSize: 10 }} width={180} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, name) => [`${v}ms`, name === 'avgTime' ? t('admin.avg') : name === 'maxTime' ? t('admin.max') : name]} />
              <Bar dataKey="avgTime" fill="#059669" radius={[0, 4, 4, 0]} name={t('admin.avg')} />
              <Bar dataKey="maxTime" fill="#059669" fillOpacity={0.3} radius={[0, 4, 4, 0]} name={t('admin.max')} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
      </div>

      <div className="card">
        <h3 className="section-title mb-4">{t('admin.hourlyTraffic')}</h3>
        {performance.hourly.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={performance.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={h => `${h}:00`} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, name) => [name === 'avgTime' ? `${v}ms` : v, name === 'avgTime' ? t('admin.avgTime') : t('admin.requests')]} />
              <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} name={t('admin.requests')} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
      </div>
    </div>
  );
}

// ─── Feedback Tab ───────────────────────────────────────
function FeedbackTab({ data, counts, onUpdate }) {
  const toast = useToast();
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [noteInput, setNoteInput] = useState('');

  const typeIcon = { bug: Bug, suggestion: Lightbulb, other: MessageSquare };
  const typeColor = { bug: 'text-danger', suggestion: 'text-warning', other: 'text-info' };
  const statusColors = {
    open: 'bg-warning/10 text-warning',
    in_progress: 'bg-info/10 text-info',
    resolved: 'bg-success/10 text-success',
    closed: 'bg-cream-200 dark:bg-dark-border text-cream-500',
  };

  const statusLabels = {
    open: t('admin.statusOpen'),
    in_progress: t('admin.statusInProgress'),
    resolved: t('admin.statusResolved'),
    closed: t('admin.statusClosed'),
  };

  const countMap = {};
  for (const c of counts) countMap[c.status] = c.count;
  const totalCount = data.length;
  const openCount = countMap['open'] || 0;

  const filtered = filter === 'all' ? data : data.filter(f => f.status === filter);

  const handleStatusChange = async (id, status) => {
    try {
      await adminApi.updateFeedback(id, { status });
      toast.success(t('admin.statusUpdatedTo', { status: statusLabels[status] || status }));
      onUpdate();
    } catch (err) { toast.error(err.message); }
  };

  const handleAddNote = async (id) => {
    if (!noteInput.trim()) return;
    try {
      await adminApi.updateFeedback(id, { adminNote: noteInput.trim() });
      toast.success(t('admin.noteAdded'));
      setNoteInput('');
      onUpdate();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await adminApi.deleteFeedback(id);
      toast.success(t('admin.feedbackDeleted'));
      onUpdate();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('common.total'), value: totalCount, onClick: () => setFilter('all'), active: filter === 'all' },
          { label: t('admin.statusOpen'), value: openCount, onClick: () => setFilter('open'), active: filter === 'open' },
          { label: t('admin.statusInProgress'), value: countMap['in_progress'] || 0, onClick: () => setFilter('in_progress'), active: filter === 'in_progress' },
          { label: t('admin.statusResolved'), value: countMap['resolved'] || 0, onClick: () => setFilter('resolved'), active: filter === 'resolved' },
        ].map((card) => (
          <button key={card.label} onClick={card.onClick}
            className={`card text-center transition-all ${card.active ? 'ring-2 ring-cream-900 dark:ring-cream-100' : ''}`}>
            <p className="text-2xl font-heading font-bold">{card.value}</p>
            <p className="text-xs text-cream-500">{card.label}</p>
          </button>
        ))}
      </div>

      {/* Feedback list */}
      <div className="space-y-2">
        {filtered.map((fb) => {
          const Icon = typeIcon[fb.type] || MessageSquare;
          const isExpanded = expandedId === fb.id;

          return (
            <div key={fb.id} className="card">
              <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : fb.id)}>
                <Icon size={16} className={`mt-0.5 shrink-0 ${typeColor[fb.type]}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{fb.title}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusColors[fb.status]}`}>
                      {statusLabels[fb.status] || fb.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-cream-500 mt-0.5">
                    {fb.userName || t('admin.unknown')} · {timeAgo(fb.createdAt)}
                    {fb.page && ` · ${t('admin.onPage', { page: fb.page })}`}
                  </p>
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-cream-400 mt-1 shrink-0" /> : <ChevronDown size={14} className="text-cream-400 mt-1 shrink-0" />}
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-3 border-t border-cream-200 dark:border-dark-border pt-3">
                  {fb.description && (
                    <p className="text-sm text-cream-700 dark:text-cream-400 whitespace-pre-wrap">{fb.description}</p>
                  )}

                  {fb.screenshot && (
                    <div className="rounded-xl overflow-hidden border border-cream-200 dark:border-dark-border">
                      <img
                        src={fb.screenshot}
                        alt={t('admin.bugScreenshot')}
                        className="w-full max-h-64 object-contain bg-cream-50 dark:bg-dark-bg cursor-pointer"
                        onClick={() => window.open(fb.screenshot, '_blank')}
                        title={t('admin.clickToViewFull')}
                      />
                    </div>
                  )}

                  {fb.adminNote && (
                    <div className="p-2.5 rounded-lg bg-info/5 border border-info/20">
                      <p className="text-[10px] font-medium text-info mb-0.5">{t('admin.adminNote')}:</p>
                      <p className="text-xs text-cream-600 dark:text-cream-400">{fb.adminNote}</p>
                    </div>
                  )}

                  <p className="text-[10px] text-cream-400">
                    {t('admin.from')}: {fb.userEmail || '—'} · {t('admin.userAgent')}: {fb.userAgent?.slice(0, 60) || '—'}
                  </p>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                      <button key={s} onClick={() => handleStatusChange(fb.id, s)}
                        disabled={fb.status === s}
                        className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors ${
                          fb.status === s
                            ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                            : 'bg-cream-200 dark:bg-dark-border text-cream-600 hover:bg-cream-300'
                        }`}>
                        {statusLabels[s] || s.replace('_', ' ')}
                      </button>
                    ))}
                    <button onClick={() => handleDelete(fb.id)}
                      className="text-[11px] px-2.5 py-1 rounded-lg font-medium text-danger bg-danger/10 hover:bg-danger/20 transition-colors ml-auto">
                      {t('common.delete')}
                    </button>
                  </div>

                  {/* Add admin note */}
                  <div className="flex gap-2">
                    <input
                      value={expandedId === fb.id ? noteInput : ''}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder={t('admin.addAdminNote')}
                      className="flex-1 text-xs px-3 py-2 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(fb.id); }}
                    />
                    <button onClick={() => handleAddNote(fb.id)}
                      className="btn-primary text-xs px-3 py-2">
                      {t('admin.note')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <MessageSquare className="mx-auto text-cream-400 mb-3" size={32} />
            <p className="text-cream-500 text-sm">
              {filter !== 'all' ? t('admin.noFeedbackWithStatus', { status: statusLabels[filter] || filter }) : t('admin.noFeedbackYet')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
