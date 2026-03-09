import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
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

const TABS = [
  { id: 'overview', label: 'Overview', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'ai-costs', label: 'AI Costs', icon: DollarSign },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
  { id: 'performance', label: 'Performance', icon: Zap },
  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
];

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

function timeAgo(ts) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(ts, 'dd MMM');
}

export default function Admin() {
  const { user } = useAuth();
  const toast = useToast();
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
      toast.error('Password must be at least 8 characters');
      return;
    }
    try {
      await adminApi.resetPassword(resetModal.id, newPassword);
      toast.success(`Password reset for ${resetModal.name}`);
      setResetModal(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleUser = async (u) => {
    try {
      const result = await adminApi.toggleUser(u.id);
      toast.success(`${u.name} ${result.suspended ? 'suspended' : 'activated'}`);
      loadTabData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleDeleteUser = async () => {
    try {
      await adminApi.deleteUser(deleteModal.id);
      toast.success(`${deleteModal.name}'s account deleted`);
      setDeleteModal(null);
      loadTabData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleToggleAiAccess = async (u) => {
    try {
      const result = await adminApi.toggleAiAccess(u.id, !u.aiProxyAllowed);
      toast.success(`AI proxy ${result.allowed ? 'enabled' : 'disabled'} for ${u.name}`);
      loadTabData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <Shield className="mx-auto text-cream-400 mb-4" size={48} />
        <h2 className="text-xl font-heading font-semibold mb-2 dark:text-dark-text">Access Denied</h2>
        <p className="text-cream-600 dark:text-cream-500">You don't have admin privileges.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title mb-0 flex items-center gap-2">
            <Shield size={24} /> Admin Panel
          </h1>
          <p className="text-sm text-cream-600 dark:text-cream-500">System monitoring & user management</p>
        </div>
        <button onClick={() => { setRefreshing(true); loadTabData().finally(() => setRefreshing(false)); }}
          className="btn-secondary flex items-center gap-2 text-xs">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-cream-200 dark:bg-dark-border rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center ${
              tab === t.id
                ? 'bg-white dark:bg-dark-card shadow-sm text-cream-900 dark:text-dark-text'
                : 'text-cream-600 dark:text-cream-500 hover:text-cream-800'
            }`}>
            <t.icon size={14} />
            <span className="hidden sm:inline">{t.label}</span>
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
      <Modal open={!!resetModal} onClose={() => { setResetModal(null); setNewPassword(''); }} title={`Reset Password — ${resetModal?.name}`}>
        <div className="space-y-4">
          <p className="text-sm text-cream-600 dark:text-cream-500">Set a new password for {resetModal?.email}</p>
          <input type="text" className="input" placeholder="New password (min 8 chars)" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary text-sm" onClick={() => { setResetModal(null); setNewPassword(''); }}>Cancel</button>
            <button className="btn-primary text-sm" onClick={handleResetPassword}>Reset Password</button>
          </div>
        </div>
      </Modal>

      {/* Delete user modal */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title="Delete User Account">
        <div className="space-y-4">
          <p className="text-sm text-cream-600 dark:text-cream-500">
            This will permanently delete <strong>{deleteModal?.name}</strong> ({deleteModal?.email}) and all their data. This cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary text-sm" onClick={() => setDeleteModal(null)}>Cancel</button>
            <button className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors" onClick={handleDeleteUser}>Delete Account</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────
function OverviewTab({ stats }) {
  const statCards = [
    { label: 'Total Users', value: stats.totalUsers, sub: `${stats.recentSignups} new this week` },
    { label: 'Active Today', value: stats.activeToday, sub: `${stats.activeWeek} this week` },
    { label: 'Active This Month', value: stats.activeMonth },
    { label: 'Total Records', value: stats.totalTransactions, sub: 'transactions across all users' },
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
          <h3 className="section-title mb-4">API Calls (7 days)</h3>
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
          ) : <p className="text-sm text-cream-500 text-center py-8">No data yet</p>}
        </div>

        {/* Feature Usage */}
        <div className="card">
          <h3 className="section-title mb-4">Feature Usage (30 days)</h3>
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
          ) : <p className="text-sm text-cream-500 text-center py-8">No data yet</p>}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">Total API Calls</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.totalApiCalls}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">Avg Response Time</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.avgResponseTime}ms</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">Errors (all time)</p>
          <p className="text-2xl font-heading font-bold text-red-600 mt-1">{stats.errorCount}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────
function UsersTab({ users, onResetPassword, onToggle, onToggleAi, onDelete, currentUserId }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">AI</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Records</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Last Active</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Joined</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">Actions</th>
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
                        <p className="font-medium text-cream-900 dark:text-dark-text">{u.name}{isSelf ? ' (you)' : ''}</p>
                        <p className="text-xs text-cream-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-cream-200 text-cream-600 dark:bg-dark-border dark:text-cream-500'
                    }`}>{u.role || 'user'}</span>
                  </td>
                  <td className="px-4 py-3">
                    {u.suspended ? (
                      <span className="flex items-center gap-1 text-red-600 text-xs"><Ban size={12} /> Suspended</span>
                    ) : (
                      <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} /> Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.role === 'admin' ? (
                      <span className="flex items-center gap-1 text-purple-600 text-xs"><Bot size={12} /> Owner</span>
                    ) : (
                      <button
                        onClick={() => onToggleAi(u)}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full transition-colors ${
                          u.aiProxyAllowed
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-200'
                            : 'bg-cream-200 text-cream-500 dark:bg-dark-border dark:text-cream-600 hover:bg-cream-300'
                        }`}
                        title={u.aiProxyAllowed ? 'Click to revoke shared AI key access' : 'Click to grant shared AI key access'}
                      >
                        <Bot size={12} />
                        {u.aiProxyAllowed ? 'Allowed' : 'Off'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-cream-700 dark:text-cream-400">{totalRecords}</td>
                  <td className="px-4 py-3 text-cream-500 text-xs">{timeAgo(u.lastActive)}</td>
                  <td className="px-4 py-3 text-cream-500 text-xs">{u.createdAt ? formatDate(u.createdAt, 'dd MMM yyyy') : '—'}</td>
                  <td className="px-4 py-3">
                    {!isSelf && (
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => onResetPassword(u)} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title="Reset password">
                          <KeyRound size={14} className="text-cream-600" />
                        </button>
                        <button onClick={() => onToggle(u)} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={u.suspended ? 'Activate' : 'Suspend'}>
                          {u.suspended ? <UserCheck size={14} className="text-green-600" /> : <UserX size={14} className="text-orange-600" />}
                        </button>
                        <button onClick={() => onDelete(u)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors" title="Delete account">
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
        {users.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">No users yet</p>}
      </div>
    </div>
  );
}

// ─── AI Costs Tab ───────────────────────────────────────
function AiCostsTab({ data }) {
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
          <p className="text-xs text-cream-500 uppercase tracking-wide">Total Cost</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{formatCost(grandTotal)}</p>
          <p className="text-xs text-cream-500 mt-1">estimated from token usage</p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">Active AI Users</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{users.length}</p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">Total Requests</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">
            {users.reduce((sum, u) => sum + u.totalRequests, 0)}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">Total Tokens</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">
            {formatTokens(users.reduce((sum, u) => sum + u.totalInputTokens + u.totalOutputTokens, 0))}
          </p>
        </div>
      </div>

      {/* Cost breakdown chart */}
      {users.length > 0 && (
        <div className="card">
          <h3 className="section-title mb-4">Cost by User</h3>
          <ResponsiveContainer width="100%" height={Math.max(120, users.length * 45)}>
            <BarChart data={users} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(3)}`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v) => [`$${v.toFixed(4)}`, 'Cost (USD)']}
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
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">User</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">Requests</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">Input Tokens</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">Output Tokens</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">Est. Cost</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">Last Used</th>
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
                  <td className="px-4 py-3 text-cream-900 dark:text-dark-text">Total</td>
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
              <p className="text-cream-500 text-sm">No AI usage tracked yet</p>
              <p className="text-cream-400 text-xs mt-1">Cost tracking starts with the next AI request</p>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-cream-400 text-center">
        Costs are estimated based on Anthropic's published pricing. Actual billing may differ slightly.
      </p>
    </div>
  );
}

// ─── Activity Tab ────────────────────────────────────────
function ActivityTab({ activity }) {
  return (
    <div className="card p-0">
      <div className="divide-y divide-cream-100 dark:divide-dark-border">
        {activity.map(a => {
          let meta = {};
          try { meta = JSON.parse(a.metadata || '{}'); } catch {}
          return (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors">
              <div className="w-8 h-8 rounded-full bg-cream-200 dark:bg-dark-border flex items-center justify-center text-xs font-medium text-cream-600 dark:text-cream-400 shrink-0">
                {a.userName?.charAt(0).toUpperCase() || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-cream-900 dark:text-dark-text">
                  <span className="font-medium">{a.userName || 'Unknown'}</span>
                  {' '}
                  <span className="text-cream-600 dark:text-cream-500">
                    {ACTION_LABELS[a.action] || a.action}
                    {meta.table && ` in ${meta.table}`}
                  </span>
                </p>
              </div>
              <span className="text-xs text-cream-500 shrink-0">{timeAgo(a.timestamp)}</span>
            </div>
          );
        })}
        {activity.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">No activity yet</p>}
      </div>
    </div>
  );
}

// ─── Errors Tab ──────────────────────────────────────────
function ErrorsTab({ errors }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Time</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Method</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Path</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Status</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Response</th>
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
        {errors.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">No errors — all good!</p>}
      </div>
    </div>
  );
}

// ─── Performance Tab ─────────────────────────────────────
function PerformanceTab({ performance }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="section-title mb-4">Response Time by Endpoint (7 days)</h3>
        {performance.byPath.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, performance.byPath.length * 30)}>
            <BarChart data={performance.byPath} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
              <XAxis type="number" tick={{ fontSize: 10 }} unit="ms" />
              <YAxis dataKey="path" type="category" tick={{ fontSize: 10 }} width={180} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, name) => [`${v}ms`, name === 'avgTime' ? 'Avg' : name === 'maxTime' ? 'Max' : name]} />
              <Bar dataKey="avgTime" fill="#059669" radius={[0, 4, 4, 0]} name="Avg" />
              <Bar dataKey="maxTime" fill="#059669" fillOpacity={0.3} radius={[0, 4, 4, 0]} name="Max" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">No data yet</p>}
      </div>

      <div className="card">
        <h3 className="section-title mb-4">Hourly Traffic (24h)</h3>
        {performance.hourly.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={performance.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid, #e7e5e4)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={h => `${h}:00`} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                formatter={(v, name) => [name === 'avgTime' ? `${v}ms` : v, name === 'avgTime' ? 'Avg Time' : 'Requests']} />
              <Bar dataKey="count" fill="#059669" radius={[4, 4, 0, 0]} name="Requests" />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">No data yet</p>}
      </div>
    </div>
  );
}

// ─── Feedback Tab ───────────────────────────────────────
function FeedbackTab({ data, counts, onUpdate }) {
  const toast = useToast();
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

  const countMap = {};
  for (const c of counts) countMap[c.status] = c.count;
  const totalCount = data.length;
  const openCount = countMap['open'] || 0;

  const filtered = filter === 'all' ? data : data.filter(f => f.status === filter);

  const handleStatusChange = async (id, status) => {
    try {
      await adminApi.updateFeedback(id, { status });
      toast.success(`Status updated to ${status}`);
      onUpdate();
    } catch (err) { toast.error(err.message); }
  };

  const handleAddNote = async (id) => {
    if (!noteInput.trim()) return;
    try {
      await adminApi.updateFeedback(id, { adminNote: noteInput.trim() });
      toast.success('Note added');
      setNoteInput('');
      onUpdate();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await adminApi.deleteFeedback(id);
      toast.success('Feedback deleted');
      onUpdate();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: totalCount, onClick: () => setFilter('all'), active: filter === 'all' },
          { label: 'Open', value: openCount, onClick: () => setFilter('open'), active: filter === 'open' },
          { label: 'In Progress', value: countMap['in_progress'] || 0, onClick: () => setFilter('in_progress'), active: filter === 'in_progress' },
          { label: 'Resolved', value: countMap['resolved'] || 0, onClick: () => setFilter('resolved'), active: filter === 'resolved' },
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
                      {fb.status?.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-cream-500 mt-0.5">
                    {fb.userName || 'Unknown'} · {timeAgo(fb.createdAt)}
                    {fb.page && ` · on ${fb.page}`}
                  </p>
                </div>
                {isExpanded ? <ChevronUp size={14} className="text-cream-400 mt-1 shrink-0" /> : <ChevronDown size={14} className="text-cream-400 mt-1 shrink-0" />}
              </div>

              {isExpanded && (
                <div className="mt-3 space-y-3 border-t border-cream-200 dark:border-dark-border pt-3">
                  {fb.description && (
                    <p className="text-sm text-cream-700 dark:text-cream-400 whitespace-pre-wrap">{fb.description}</p>
                  )}

                  {fb.adminNote && (
                    <div className="p-2.5 rounded-lg bg-info/5 border border-info/20">
                      <p className="text-[10px] font-medium text-info mb-0.5">Admin note:</p>
                      <p className="text-xs text-cream-600 dark:text-cream-400">{fb.adminNote}</p>
                    </div>
                  )}

                  <p className="text-[10px] text-cream-400">
                    From: {fb.userEmail || '—'} · User agent: {fb.userAgent?.slice(0, 60) || '—'}
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
                        {s.replace('_', ' ')}
                      </button>
                    ))}
                    <button onClick={() => handleDelete(fb.id)}
                      className="text-[11px] px-2.5 py-1 rounded-lg font-medium text-danger bg-danger/10 hover:bg-danger/20 transition-colors ml-auto">
                      Delete
                    </button>
                  </div>

                  {/* Add admin note */}
                  <div className="flex gap-2">
                    <input
                      value={expandedId === fb.id ? noteInput : ''}
                      onChange={(e) => setNoteInput(e.target.value)}
                      placeholder="Add admin note..."
                      className="flex-1 text-xs px-3 py-2 rounded-lg border border-cream-200 dark:border-dark-border bg-white dark:bg-dark-card"
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddNote(fb.id); }}
                    />
                    <button onClick={() => handleAddNote(fb.id)}
                      className="btn-primary text-xs px-3 py-2">
                      Note
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
            <p className="text-cream-500 text-sm">No feedback {filter !== 'all' ? `with status "${filter.replace('_', ' ')}"` : 'yet'}</p>
          </div>
        )}
      </div>
    </div>
  );
}
