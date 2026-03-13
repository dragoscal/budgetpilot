import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { adminApi } from '../lib/adminApi';
import { formatDate } from '../lib/helpers';
import { downloadBlob } from '../lib/exportHelpers';
import Modal from '../components/Modal';
import { SkeletonPage } from '../components/LoadingSkeleton';
import {
  BarChart, Bar, AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import {
  Shield, Users, Activity, AlertTriangle, Zap, RefreshCw,
  KeyRound, Ban, CheckCircle, Trash2, UserX, UserCheck, Bot, DollarSign,
  MessageSquare, Bug, Lightbulb, ChevronDown, ChevronUp, Loader2, Image,
  Search, Download, ArrowUpDown, Server, Clock, TrendingUp,
} from 'lucide-react';

const ACTION_LABEL_KEYS = {
  login: 'admin.actionLogin',
  register: 'admin.actionRegister',
  create_record: 'admin.actionCreate',
  update_record: 'admin.actionUpdate',
  delete_record: 'admin.actionDelete',
  sync_push: 'admin.actionSync',
  ai_process: 'admin.actionAi',
  telegram_expense: 'admin.actionTelegram',
  admin_reset_password: 'admin.actionResetPw',
  admin_suspend_user: 'admin.actionSuspend',
  admin_activate_user: 'admin.actionActivate',
  admin_delete_user: 'admin.actionDeleteUser',
  admin_toggle_ai_access: 'admin.actionToggleAi',
  submit_feedback: 'admin.actionFeedback',
  admin_update_feedback: 'admin.actionUpdateFeedback',
};

// Group actions into categories for filtering
const ACTION_GROUPS = {
  auth: ['login', 'register'],
  crud: ['create_record', 'update_record', 'delete_record', 'sync_push'],
  ai: ['ai_process', 'telegram_expense'],
  admin: ['admin_reset_password', 'admin_suspend_user', 'admin_activate_user', 'admin_delete_user', 'admin_toggle_ai_access', 'admin_update_feedback'],
  feedback: ['submit_feedback'],
};

// Generic CSV export for admin data
function exportAdminCSV(rows, headers, filename) {
  const BOM = '\uFEFF';
  const escape = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    return (str.includes(',') || str.includes('"') || str.includes('\n')) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = BOM + [headers.join(','), ...rows.map(r => r.map(escape).join(','))].join('\r\n');
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), filename);
}

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
  const { toast } = useToast();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
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

  const switchTab = useCallback((id) => {
    setTab(id);
    setSearchParams({ tab: id }, { replace: true });
  }, [setSearchParams]);

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

  const handleCleanup = async () => {
    try {
      const result = await adminApi.cleanupLogs();
      toast.success(t('admin.cleanupSuccess', { api: result.cleaned?.apiLogs || 0, activity: result.cleaned?.activityLogs || 0 }));
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
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-cream-200 dark:bg-dark-border rounded-xl p-1">
        {TABS.map(tb => (
          <button key={tb.id} onClick={() => switchTab(tb.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center whitespace-nowrap ${
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
          {tab === 'overview' && stats && <OverviewTab stats={stats} onCleanup={handleCleanup} />}
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
function OverviewTab({ stats, onCleanup }) {
  const { t } = useTranslation();

  const errorRate = stats.totalApiCalls > 0 ? ((stats.errorCount / stats.totalApiCalls) * 100) : 0;
  const avgResp = Number(stats.avgResponseTime) || 0;
  const systemStatus = avgResp > 500 || errorRate > 5 ? 'unhealthy' : avgResp > 200 || errorRate > 2 ? 'degraded' : 'healthy';
  const statusConfig = {
    healthy: { label: t('admin.systemHealthy'), color: 'text-success', bg: 'bg-success/10', dot: 'bg-success' },
    degraded: { label: t('admin.systemDegraded'), color: 'text-warning', bg: 'bg-warning/10', dot: 'bg-warning' },
    unhealthy: { label: t('admin.systemUnhealthy'), color: 'text-danger', bg: 'bg-danger/10', dot: 'bg-danger' },
  }[systemStatus];

  const activePercent = stats.totalUsers > 0 ? Math.round((stats.activeMonth / stats.totalUsers) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* System status bar */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-xl ${statusConfig.bg}`}>
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${statusConfig.dot} animate-pulse`} />
          <div>
            <p className={`text-sm font-semibold ${statusConfig.color}`}>
              <Server size={14} className="inline mr-1.5" />
              {statusConfig.label}
            </p>
            <p className="text-[11px] text-cream-500 mt-0.5">
              {t('admin.statusDetail', { avgMs: avgResp, errorRate: errorRate.toFixed(1) })}
            </p>
          </div>
        </div>
        <button onClick={onCleanup} className="btn-ghost text-xs flex items-center gap-1.5" title={t('admin.cleanupDesc')}>
          <Trash2 size={13} /> {t('admin.cleanupLogs')}
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-xs text-cream-500 dark:text-cream-600 uppercase tracking-wide">{t('admin.totalUsers')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.totalUsers}</p>
          <p className="text-xs mt-1">
            <span className="text-success font-medium">+{stats.recentSignups}</span>
            <span className="text-cream-500"> {t('admin.thisWeekShort')}</span>
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 dark:text-cream-600 uppercase tracking-wide">{t('admin.activeToday')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.activeToday}</p>
          <p className="text-xs text-cream-500 mt-1">{t('admin.thisWeek', { count: stats.activeWeek })}</p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 dark:text-cream-600 uppercase tracking-wide">{t('admin.activeThisMonth')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.activeMonth}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-cream-200 dark:bg-dark-border overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(activePercent, 100)}%` }} />
            </div>
            <span className="text-[10px] text-cream-500 font-medium">{activePercent}%</span>
          </div>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 dark:text-cream-600 uppercase tracking-wide">{t('admin.totalRecords')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.totalTransactions}</p>
          <p className="text-xs text-cream-500 mt-1">{t('admin.transactionsAcrossUsers')}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="section-title mb-4">{t('admin.apiCalls7Days')}</h3>
          {stats.apiCallsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.apiCallsByDay}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }} />
                <Area type="monotone" dataKey="count" stroke="#4F46E5" fill="#4F46E5" fillOpacity={0.12} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
        </div>

        <div className="card">
          <h3 className="section-title mb-4">{t('admin.featureUsage30Days')}</h3>
          {stats.featureUsage.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.featureUsage.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis dataKey="action" type="category" tick={{ fontSize: 10 }} width={100} tickFormatter={a => ACTION_LABEL_KEYS[a] ? t(ACTION_LABEL_KEYS[a]) : a} />
                <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }} />
                <Bar dataKey="count" fill="#4F46E5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
        </div>
      </div>

      {/* Footer metrics */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.totalApiCalls')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.totalApiCalls}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.avgResponseTime')}</p>
          <p className={`text-2xl font-heading font-bold mt-1 ${avgResp > 500 ? 'text-danger' : avgResp > 200 ? 'text-warning' : 'text-success'}`}>{avgResp}ms</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.errorRate')}</p>
          <p className={`text-2xl font-heading font-bold mt-1 ${errorRate > 5 ? 'text-danger' : errorRate > 2 ? 'text-warning' : 'text-success'}`}>
            {errorRate.toFixed(1)}%
          </p>
          <p className="text-xs text-cream-500 mt-0.5">{stats.errorCount} {t('admin.totalErrorsLabel')}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ───────────────────────────────────────────
function UsersTab({ users, onResetPassword, onToggle, onToggleAi, onDelete, currentUserId }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const timeAgo = useTimeAgo();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [expandedId, setExpandedId] = useState(null);

  const filtered = useMemo(() => {
    let list = [...users];

    // Search
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }

    // Filter
    if (filter === 'active') list = list.filter(u => !u.suspended);
    else if (filter === 'suspended') list = list.filter(u => u.suspended);
    else if (filter === 'ai') list = list.filter(u => u.aiProxyAllowed);

    // Sort
    list.sort((a, b) => {
      let va, vb;
      if (sortBy === 'name') { va = a.name?.toLowerCase() || ''; vb = b.name?.toLowerCase() || ''; }
      else if (sortBy === 'records') {
        va = (a.transactionCount || 0) + (a.budgetCount || 0) + (a.goalCount || 0) + (a.recurringCount || 0) + (a.peopleCount || 0) + (a.debtCount || 0) + (a.wishlistCount || 0);
        vb = (b.transactionCount || 0) + (b.budgetCount || 0) + (b.goalCount || 0) + (b.recurringCount || 0) + (b.peopleCount || 0) + (b.debtCount || 0) + (b.wishlistCount || 0);
      }
      else if (sortBy === 'lastActive') { va = a.lastActive || ''; vb = b.lastActive || ''; }
      else if (sortBy === 'joined') { va = a.createdAt || ''; vb = b.createdAt || ''; }
      else { va = a[sortBy]; vb = b[sortBy]; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return list;
  }, [users, search, filter, sortBy, sortDir]);

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const SortIcon = ({ col }) => (
    <ArrowUpDown size={11} className={`inline ml-0.5 ${sortBy === col ? 'text-accent' : 'text-cream-400'}`} />
  );

  const handleExportUsers = () => {
    const headers = ['Name', 'Email', 'Role', 'Status', 'AI Access', 'Records', 'Last Active', 'Joined'];
    const rows = filtered.map(u => {
      const totalRecords = (u.transactionCount || 0) + (u.budgetCount || 0) + (u.goalCount || 0) + (u.recurringCount || 0) + (u.peopleCount || 0) + (u.debtCount || 0) + (u.wishlistCount || 0);
      return [u.name, u.email, u.role || 'user', u.suspended ? 'Suspended' : 'Active', u.aiProxyAllowed ? 'Yes' : 'No', totalRecords, u.lastActive || '', u.createdAt || ''];
    });
    exportAdminCSV(rows, headers, `users_export_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('admin.exportedCsv'));
  };

  const FILTERS = [
    { id: 'all', label: t('common.all') },
    { id: 'active', label: t('common.active') },
    { id: 'suspended', label: t('admin.suspended') },
    { id: 'ai', label: t('admin.colAi') },
  ];

  return (
    <div className="space-y-4">
      {/* Search + filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.searchUsers')}
            className="input pl-9 w-full text-sm"
          />
        </div>
        <div className="flex gap-1.5 items-center">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-accent/10 text-accent border border-accent/30'
                  : 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-500 hover:bg-cream-200'
              }`}>
              {f.label}
            </button>
          ))}
          <button onClick={handleExportUsers} className="btn-ghost text-xs flex items-center gap-1 ml-2" title={t('admin.exportCsv')}>
            <Download size={13} />
          </button>
        </div>
      </div>

      <p className="text-xs text-cream-500">{t('admin.showingCount', { count: filtered.length, total: users.length })}</p>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase cursor-pointer select-none hover:text-cream-700" onClick={() => toggleSort('name')}>
                  {t('admin.colUser')} <SortIcon col="name" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colRole')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('common.status')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colAi')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase cursor-pointer select-none hover:text-cream-700" onClick={() => toggleSort('records')}>
                  {t('admin.colRecords')} <SortIcon col="records" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase cursor-pointer select-none hover:text-cream-700" onClick={() => toggleSort('lastActive')}>
                  {t('admin.colLastActive')} <SortIcon col="lastActive" />
                </th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase cursor-pointer select-none hover:text-cream-700" onClick={() => toggleSort('joined')}>
                  {t('admin.colJoined')} <SortIcon col="joined" />
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100 dark:divide-dark-border">
              {filtered.map(u => {
                const totalRecords = (u.transactionCount || 0) + (u.budgetCount || 0) + (u.goalCount || 0) + (u.recurringCount || 0) + (u.peopleCount || 0) + (u.debtCount || 0) + (u.wishlistCount || 0);
                const isSelf = u.id === currentUserId;
                const isExpanded = expandedId === u.id;
                return (
                  <tr key={u.id} className="group">
                    <td colSpan={8} className="p-0">
                      <div className={`flex items-center hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors cursor-pointer ${isExpanded ? 'bg-cream-50 dark:bg-dark-border/30' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : u.id)}>
                        <div className="px-4 py-3 flex items-center gap-3 flex-1 min-w-[200px]">
                          <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-sm font-medium text-accent shrink-0">
                            {u.name?.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-cream-900 dark:text-dark-text truncate">{u.name}{isSelf ? ` (${t('admin.you')})` : ''}</p>
                            <p className="text-xs text-cream-500 truncate">{u.email}</p>
                          </div>
                        </div>
                        <div className="px-4 py-3 min-w-[70px]">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-cream-200 text-cream-600 dark:bg-dark-border dark:text-cream-500'
                          }`}>{u.role || t('admin.roleUser')}</span>
                        </div>
                        <div className="px-4 py-3 min-w-[90px]">
                          {u.suspended ? (
                            <span className="flex items-center gap-1 text-red-600 text-xs"><Ban size={12} /> {t('admin.suspended')}</span>
                          ) : (
                            <span className="flex items-center gap-1 text-green-600 text-xs"><CheckCircle size={12} /> {t('common.active')}</span>
                          )}
                        </div>
                        <div className="px-4 py-3 min-w-[80px]">
                          {u.role === 'admin' ? (
                            <span className="flex items-center gap-1 text-purple-600 text-xs"><Bot size={12} /> {t('admin.owner')}</span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); onToggleAi(u); }}
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
                        </div>
                        <div className="px-4 py-3 text-cream-700 dark:text-cream-400 min-w-[70px]">{totalRecords}</div>
                        <div className="px-4 py-3 text-cream-500 text-xs min-w-[80px]">{timeAgo(u.lastActive)}</div>
                        <div className="px-4 py-3 text-cream-500 text-xs min-w-[90px]">{u.createdAt ? formatDate(u.createdAt, 'dd MMM yyyy') : '—'}</div>
                        <div className="px-4 py-3 min-w-[100px]">
                          {!isSelf ? (
                            <div className="flex gap-1 justify-end">
                              <button onClick={(e) => { e.stopPropagation(); onResetPassword(u); }} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={t('admin.resetPassword')}>
                                <KeyRound size={14} className="text-cream-600" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); onToggle(u); }} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={u.suspended ? t('admin.activate') : t('admin.suspend')}>
                                {u.suspended ? <UserCheck size={14} className="text-green-600" /> : <UserX size={14} className="text-orange-600" />}
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); onDelete(u); }} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors" title={t('admin.deleteAccount')}>
                                <Trash2 size={14} className="text-red-500" />
                              </button>
                            </div>
                          ) : <div className="h-8" />}
                        </div>
                      </div>
                      {/* Expandable row — record breakdown */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 bg-cream-50/50 dark:bg-dark-border/20 border-t border-cream-100 dark:border-dark-border">
                          <div className="flex flex-wrap gap-2">
                            {[
                              { label: t('admin.transactions'), count: u.transactionCount || 0 },
                              { label: t('admin.budgets'), count: u.budgetCount || 0 },
                              { label: t('admin.goals'), count: u.goalCount || 0 },
                              { label: t('admin.recurring'), count: u.recurringCount || 0 },
                              { label: t('admin.people'), count: u.peopleCount || 0 },
                              { label: t('admin.debts'), count: u.debtCount || 0 },
                              { label: t('admin.wishlist'), count: u.wishlistCount || 0 },
                            ].map(item => (
                              <div key={item.label} className="px-3 py-1.5 rounded-lg bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border">
                                <span className="text-xs text-cream-500">{item.label}: </span>
                                <span className="text-xs font-semibold text-cream-900 dark:text-dark-text">{item.count}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-cream-500 py-8 text-sm">
              {search ? t('admin.noUsersMatch') : t('admin.noUsersYet')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── AI Costs Tab ───────────────────────────────────────
function AiCostsTab({ data }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const timeAgo = useTimeAgo();
  const { users, grandTotal } = data;

  const totalRequests = users.reduce((sum, u) => sum + u.totalRequests, 0);
  const costPerRequest = totalRequests > 0 ? grandTotal / totalRequests : 0;

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

  const handleExport = () => {
    const headers = ['User', 'Email', 'Requests', 'Input Tokens', 'Output Tokens', 'Est. Cost (USD)', 'Last Used'];
    const rows = users.map(u => [u.name, u.email, u.totalRequests, u.totalInputTokens, u.totalOutputTokens, u.totalCostUSD.toFixed(4), u.lastUsed || '']);
    exportAdminCSV(rows, headers, `ai_costs_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('admin.exportedCsv'));
  };

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{totalRequests}</p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.totalTokens')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">
            {formatTokens(users.reduce((sum, u) => sum + u.totalInputTokens + u.totalOutputTokens, 0))}
          </p>
        </div>
        <div className="card">
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.costPerRequest')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{formatCost(costPerRequest)}</p>
          <p className="text-xs text-cream-500 mt-1">{t('admin.avgPerCall')}</p>
        </div>
      </div>

      {/* Cost breakdown chart */}
      {users.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title mb-0">{t('admin.costByUser')}</h3>
            <button onClick={handleExport} className="btn-ghost text-xs flex items-center gap-1">
              <Download size={13} /> {t('admin.exportCsv')}
            </button>
          </div>
          <ResponsiveContainer width="100%" height={Math.max(120, users.length * 45)}>
            <BarChart data={users} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `$${v.toFixed(3)}`} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={100} />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }}
                formatter={(v) => [`$${v.toFixed(4)}`, t('admin.costUsd')]}
              />
              <Bar dataKey="totalCostUSD" fill="#4F46E5" radius={[0, 4, 4, 0]} />
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
                  <td className="px-4 py-3 text-right font-mono">{totalRequests}</td>
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
  const { toast } = useToast();
  const timeAgo = useTimeAgo();
  const [search, setSearch] = useState('');
  const [filterGroup, setFilterGroup] = useState('all');
  const [visibleCount, setVisibleCount] = useState(30);

  const GROUP_FILTERS = [
    { id: 'all', label: t('common.all') },
    { id: 'auth', label: t('admin.groupAuth') },
    { id: 'crud', label: t('admin.groupCrud') },
    { id: 'ai', label: t('admin.groupAi') },
    { id: 'admin', label: t('admin.groupAdmin') },
    { id: 'feedback', label: t('admin.tabFeedback') },
  ];

  const ACTION_BADGE_COLORS = {
    auth: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    crud: 'bg-cream-200 text-cream-600 dark:bg-dark-border dark:text-cream-400',
    ai: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    admin: 'bg-accent/10 text-accent',
    feedback: 'bg-warning/10 text-warning',
  };

  const getActionGroup = (action) => {
    for (const [group, actions] of Object.entries(ACTION_GROUPS)) {
      if (actions.includes(action)) return group;
    }
    return 'crud';
  };

  const filtered = useMemo(() => {
    let list = activity;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.userName?.toLowerCase().includes(q));
    }
    if (filterGroup !== 'all') {
      const groupActions = ACTION_GROUPS[filterGroup] || [];
      list = list.filter(a => groupActions.includes(a.action));
    }
    return list;
  }, [activity, search, filterGroup]);

  const visible = filtered.slice(0, visibleCount);

  const handleExport = () => {
    const headers = ['Timestamp', 'User', 'Action', 'Details'];
    const rows = filtered.map(a => {
      let meta = {};
      try { meta = JSON.parse(a.metadata || '{}'); } catch { /* ignore */ }
      return [a.timestamp, a.userName || 'Unknown', a.action, meta.table || ''];
    });
    exportAdminCSV(rows, headers, `activity_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('admin.exportedCsv'));
  };

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.searchByUser')} className="input pl-9 w-full text-sm" />
        </div>
        <div className="flex gap-1.5 items-center flex-wrap">
          {GROUP_FILTERS.map(f => (
            <button key={f.id} onClick={() => { setFilterGroup(f.id); setVisibleCount(30); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterGroup === f.id
                  ? 'bg-accent/10 text-accent border border-accent/30'
                  : 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-500 hover:bg-cream-200'
              }`}>
              {f.label}
            </button>
          ))}
          <button onClick={handleExport} className="btn-ghost text-xs flex items-center gap-1 ml-2" title={t('admin.exportCsv')}>
            <Download size={13} />
          </button>
        </div>
      </div>

      <p className="text-xs text-cream-500">{t('admin.showingCount', { count: visible.length, total: filtered.length })}</p>

      <div className="card p-0">
        <div className="divide-y divide-cream-100 dark:divide-dark-border">
          {visible.map(a => {
            let meta = {};
            try { meta = JSON.parse(a.metadata || '{}'); } catch { /* non-critical parse fallback */ }
            const group = getActionGroup(a.action);
            const badgeColor = ACTION_BADGE_COLORS[group] || ACTION_BADGE_COLORS.crud;
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center text-xs font-medium text-accent shrink-0">
                  {a.userName?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-cream-900 dark:text-dark-text">
                    <span className="font-medium">{a.userName || t('admin.unknown')}</span>
                    {' '}
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${badgeColor}`}>
                      {ACTION_LABEL_KEYS[a.action] ? t(ACTION_LABEL_KEYS[a.action]) : a.action}
                    </span>
                    {meta.table && (
                      <span className="text-cream-500 text-xs ml-1">{t('admin.inTable', { table: meta.table })}</span>
                    )}
                  </p>
                </div>
                <span className="text-xs text-cream-500 shrink-0">{timeAgo(a.timestamp)}</span>
              </div>
            );
          })}
          {visible.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">{t('admin.noActivityYet')}</p>}
        </div>
        {visible.length < filtered.length && (
          <div className="p-3 border-t border-cream-200 dark:border-dark-border text-center">
            <button onClick={() => setVisibleCount(v => v + 30)}
              className="btn-ghost text-xs font-medium text-accent hover:text-accent/80">
              {t('admin.loadMore', { remaining: filtered.length - visible.length })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Errors Tab ──────────────────────────────────────────
function ErrorsTab({ errors }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const timeAgo = useTimeAgo();
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const clientErrors = errors.filter(e => e.status >= 400 && e.status < 500);
  const serverErrors = errors.filter(e => e.status >= 500);

  const filtered = useMemo(() => {
    if (filter === 'client') return clientErrors;
    if (filter === 'server') return serverErrors;
    return errors;
  }, [errors, filter, clientErrors, serverErrors]);

  const handleExport = () => {
    const headers = ['Timestamp', 'Method', 'Path', 'Status', 'User', 'Response Time (ms)'];
    const rows = errors.map(e => [e.timestamp, e.method, e.path, e.status, e.userName || '', e.responseTime]);
    exportAdminCSV(rows, headers, `errors_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('admin.exportedCsv'));
  };

  const FILTERS = [
    { id: 'all', label: t('common.all'), count: errors.length },
    { id: 'client', label: '4xx', count: clientErrors.length },
    { id: 'server', label: '5xx', count: serverErrors.length },
  ];

  return (
    <div className="space-y-4">
      {/* Error summary + filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1.5 items-center">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.id
                  ? f.id === 'server' ? 'bg-danger/10 text-danger border border-danger/30'
                    : f.id === 'client' ? 'bg-warning/10 text-warning border border-warning/30'
                    : 'bg-accent/10 text-accent border border-accent/30'
                  : 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-500 hover:bg-cream-200'
              }`}>
              {f.label} <span className="ml-1 opacity-70">({f.count})</span>
            </button>
          ))}
          <button onClick={handleExport} className="btn-ghost text-xs flex items-center gap-1 ml-2" title={t('admin.exportCsv')}>
            <Download size={13} />
          </button>
        </div>
        <p className="text-xs text-cream-500">
          {t('admin.errorSummary', { total: errors.length, client: clientErrors.length, server: serverErrors.length })}
        </p>
      </div>

      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
                <th className="w-6 px-2"></th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colTime')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colMethod')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colPath')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('common.status')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colUser')}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-cream-500 uppercase">{t('admin.colResponse')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-cream-100 dark:divide-dark-border">
              {filtered.map(e => {
                const isExpanded = expandedId === e.id;
                return (
                  <tr key={e.id} className={`hover:bg-cream-50 dark:hover:bg-dark-border/50 cursor-pointer transition-colors ${isExpanded ? 'bg-cream-50 dark:bg-dark-border/30' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : e.id)}>
                    <td className="px-2 text-cream-400">
                      {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </td>
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
                    <td className="px-4 py-3 text-xs text-cream-500">
                      <span className={e.responseTime > 500 ? 'text-danger font-medium' : ''}>{e.responseTime}ms</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Expanded error detail row rendered below table for simplicity */}
          {expandedId && (() => {
            const e = filtered.find(er => er.id === expandedId);
            if (!e) return null;
            return (
              <div className="px-6 py-3 bg-cream-50/80 dark:bg-dark-border/20 border-t border-cream-200 dark:border-dark-border">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-cream-500">{t('admin.colMethod')}:</span>
                    <span className="ml-1 font-mono font-medium text-cream-800 dark:text-cream-300">{e.method}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-cream-500">{t('admin.fullPath')}:</span>
                    <span className="ml-1 font-mono text-cream-800 dark:text-cream-300 break-all">{e.path}</span>
                  </div>
                  <div>
                    <span className="text-cream-500">{t('admin.colResponse')}:</span>
                    <span className={`ml-1 font-medium ${e.responseTime > 500 ? 'text-danger' : 'text-cream-800 dark:text-cream-300'}`}>{e.responseTime}ms</span>
                  </div>
                  {e.error && (
                    <div className="col-span-4">
                      <span className="text-cream-500">{t('admin.errorMessage')}:</span>
                      <pre className="mt-1 p-2 rounded bg-cream-100 dark:bg-dark-bg text-cream-700 dark:text-cream-400 text-[11px] overflow-x-auto">{e.error}</pre>
                    </div>
                  )}
                  <div>
                    <span className="text-cream-500">{t('admin.timestamp')}:</span>
                    <span className="ml-1 text-cream-800 dark:text-cream-300">{e.timestamp ? new Date(e.timestamp).toLocaleString() : '—'}</span>
                  </div>
                </div>
              </div>
            );
          })()}
          {filtered.length === 0 && <p className="text-center text-cream-500 py-8 text-sm">{t('admin.noErrors')}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Performance Tab ─────────────────────────────────────
function PerformanceTab({ performance }) {
  const { t } = useTranslation();

  // Calculate SLA metrics
  const avgResponseTime = performance.byPath.length > 0
    ? Math.round(performance.byPath.reduce((sum, p) => sum + p.avgTime, 0) / performance.byPath.length)
    : 0;
  const maxResponseTime = performance.byPath.length > 0
    ? Math.max(...performance.byPath.map(p => p.maxTime))
    : 0;
  const totalRequestsPerHour = performance.hourly.length > 0
    ? Math.round(performance.hourly.reduce((sum, h) => sum + h.count, 0) / Math.max(performance.hourly.length, 1))
    : 0;
  const slowEndpoints = performance.byPath.filter(p => p.avgTime > 500);

  const respColor = avgResponseTime > 500 ? 'text-danger' : avgResponseTime > 200 ? 'text-warning' : 'text-success';
  const maxColor = maxResponseTime > 2000 ? 'text-danger' : maxResponseTime > 1000 ? 'text-warning' : 'text-success';

  return (
    <div className="space-y-6">
      {/* SLA summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card text-center">
          <Clock size={18} className="mx-auto text-cream-400 mb-2" />
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.avgResponseTime')}</p>
          <p className={`text-2xl font-heading font-bold mt-1 ${respColor}`}>{avgResponseTime}ms</p>
        </div>
        <div className="card text-center">
          <TrendingUp size={18} className="mx-auto text-cream-400 mb-2" />
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.p95ResponseTime')}</p>
          <p className={`text-2xl font-heading font-bold mt-1 ${maxColor}`}>{maxResponseTime}ms</p>
        </div>
        <div className="card text-center">
          <Activity size={18} className="mx-auto text-cream-400 mb-2" />
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.avgRequestsHour')}</p>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{totalRequestsPerHour}</p>
        </div>
        <div className="card text-center">
          <AlertTriangle size={18} className={`mx-auto mb-2 ${slowEndpoints.length > 0 ? 'text-warning' : 'text-success'}`} />
          <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.slowEndpoints')}</p>
          <p className={`text-2xl font-heading font-bold mt-1 ${slowEndpoints.length > 0 ? 'text-warning' : 'text-success'}`}>{slowEndpoints.length}</p>
          <p className="text-[10px] text-cream-400 mt-0.5">&gt;500ms avg</p>
        </div>
      </div>

      <div className="card">
        <h3 className="section-title mb-4">{t('admin.responseTimeByEndpoint')}</h3>
        {performance.byPath.length > 0 ? (
          <ResponsiveContainer width="100%" height={Math.max(200, performance.byPath.length * 30)}>
            <BarChart data={performance.byPath} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
              <XAxis type="number" tick={{ fontSize: 10 }} unit="ms" />
              <YAxis dataKey="path" type="category" tick={({ x, y, payload }) => {
                const isSlow = performance.byPath.find(p => p.path === payload.value)?.avgTime > 500;
                return (
                  <text x={x} y={y} dy={4} textAnchor="end" fontSize={10} fill={isSlow ? '#DC2626' : 'currentColor'} fontWeight={isSlow ? 600 : 400}>
                    {payload.value}
                  </text>
                );
              }} width={180} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }}
                formatter={(v, name) => [`${v}ms`, name === 'avgTime' ? t('admin.avg') : name === 'maxTime' ? t('admin.max') : name]} />
              <Bar dataKey="avgTime" fill="#4F46E5" radius={[0, 4, 4, 0]} name={t('admin.avg')} />
              <Bar dataKey="maxTime" fill="#4F46E5" fillOpacity={0.2} radius={[0, 4, 4, 0]} name={t('admin.max')} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
      </div>

      <div className="card">
        <h3 className="section-title mb-4">{t('admin.hourlyTraffic')}</h3>
        {performance.hourly.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={performance.hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickFormatter={h => `${h}:00`} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12, border: '1px solid var(--grid-line)', boxShadow: '0 4px 12px rgba(0,0,0,.06)' }}
                formatter={(v, name) => [name === 'avgTime' ? `${v}ms` : v, name === 'avgTime' ? t('admin.avgTime') : t('admin.requests')]} />
              <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} name={t('admin.requests')} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
      </div>
    </div>
  );
}

// ─── Feedback Tab ───────────────────────────────────────
function FeedbackTab({ data, counts, onUpdate }) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const timeAgo = useTimeAgo();
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [noteInput, setNoteInput] = useState('');
  const [screenshotCache, setScreenshotCache] = useState({});
  const [loadingScreenshot, setLoadingScreenshot] = useState(null);

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
            className={`card text-center transition-all ${card.active ? 'ring-2 ring-accent' : ''}`}>
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

                  {(fb.hasScreenshot || fb.screenshot) && (() => {
                    const cached = screenshotCache[fb.id];
                    if (cached) {
                      return (
                        <div className="rounded-xl overflow-hidden border border-cream-200 dark:border-dark-border">
                          <img
                            src={cached}
                            alt={t('admin.bugScreenshot')}
                            className="w-full max-h-64 object-contain bg-cream-50 dark:bg-dark-bg cursor-pointer"
                            onClick={() => window.open(cached, '_blank')}
                            title={t('admin.clickToViewFull')}
                          />
                        </div>
                      );
                    }
                    if (loadingScreenshot === fb.id) {
                      return (
                        <div className="flex items-center gap-2 p-4 rounded-xl border border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg">
                          <Loader2 size={16} className="animate-spin text-cream-400" />
                          <span className="text-xs text-cream-500">{t('common.loading')}</span>
                        </div>
                      );
                    }
                    return (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          setLoadingScreenshot(fb.id);
                          try {
                            const data = await adminApi.getScreenshot(fb.id);
                            if (data) setScreenshotCache(prev => ({ ...prev, [fb.id]: data }));
                          } catch (err) {
                            toast.error(err.message);
                          } finally {
                            setLoadingScreenshot(null);
                          }
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-cream-200 dark:border-dark-border bg-cream-50 dark:bg-dark-bg hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-xs text-cream-600"
                      >
                        <Image size={14} /> {t('admin.loadScreenshot')}
                      </button>
                    );
                  })()}

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
