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
  KeyRound, Ban, CheckCircle, Trash2, Clock, UserX, UserCheck, Trash,
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview', icon: Shield },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'errors', label: 'Errors', icon: AlertTriangle },
  { id: 'performance', label: 'Performance', icon: Zap },
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
        case 'errors': setErrors(await adminApi.getErrors()); break;
        case 'performance': setPerformance(await adminApi.getPerformance()); break;
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
          {tab === 'users' && <UsersTab users={users} onResetPassword={setResetModal} onToggle={handleToggleUser} onDelete={setDeleteModal} currentUserId={user.id} />}
          {tab === 'activity' && <ActivityTab activity={activity} />}
          {tab === 'errors' && <ErrorsTab errors={errors} />}
          {tab === 'performance' && performance && <PerformanceTab performance={performance} />}
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
function UsersTab({ users, onResetPassword, onToggle, onDelete, currentUserId }) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">User</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Role</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">Status</th>
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
