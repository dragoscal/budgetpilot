import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  CheckSquare, Square, Database, Globe, Sparkles, BarChart3, Eye, EyeOff,
  Mail, Copy, Hash, Gauge, Wifi, WifiOff, CircleDot, Smartphone,
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
  const loadVersion = useRef(0);

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

  const loadTabData = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      switch (tab) {
        case 'overview': { const d = await adminApi.getStats(); if (loadVersion.current === version) setStats(d); break; }
        case 'users': { const d = await adminApi.getUsers(); if (loadVersion.current === version) setUsers(d); break; }
        case 'activity': { const d = await adminApi.getActivity({ limit: 100 }); if (loadVersion.current === version) setActivity(d); break; }
        case 'ai-costs': { const d = await adminApi.getAiCosts(); if (loadVersion.current === version) setAiCosts(d); break; }
        case 'errors': { const d = await adminApi.getErrors(); if (loadVersion.current === version) setErrors(d); break; }
        case 'performance': { const d = await adminApi.getPerformance(); if (loadVersion.current === version) setPerformance(d); break; }
        case 'feedback': {
          const fb = await adminApi.getFeedback();
          if (loadVersion.current === version) setFeedback({ data: fb.data || [], counts: fb.counts || [] });
          break;
        }
      }
    } catch (err) {
      if (loadVersion.current === version) toast.error(err.message);
    } finally {
      if (loadVersion.current === version) setLoading(false);
    }
  }, [tab, toast]);

  useEffect(() => { loadTabData(); }, [loadTabData]);

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

  // Compute tab badges
  const tabBadges = useMemo(() => ({
    users: users.length || null,
    errors: errors.length || null,
    feedback: feedback.data?.length || null,
  }), [users, errors, feedback]);

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cream-200 to-cream-300 dark:from-dark-border dark:to-dark-bg flex items-center justify-center mx-auto mb-4">
          <Shield className="text-cream-500" size={28} />
        </div>
        <h2 className="text-xl font-heading font-semibold mb-2 dark:text-dark-text">{t('admin.accessDenied')}</h2>
        <p className="text-cream-600 dark:text-cream-500">{t('admin.noAdminPrivileges')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Premium admin header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent-600 via-accent-700 to-accent-900 p-6 text-white">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <Shield size={20} />
              </div>
              <div>
                <h1 className="text-xl font-heading font-bold tracking-tight">{t('admin.title')}</h1>
                <p className="text-white/60 text-sm">{t('admin.subtitle')}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-xs bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2">
              <CircleDot size={8} className="text-green-400 animate-pulse" />
              <span className="text-white/80">{t('admin.liveData')}</span>
            </div>
            <button onClick={() => { setRefreshing(true); loadTabData().finally(() => setRefreshing(false)); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium bg-white/15 hover:bg-white/25 backdrop-blur-sm transition-colors">
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> {t('admin.refresh')}
            </button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-cream-100 dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-2xl p-1.5">
        {TABS.map(tb => {
          const badge = tabBadges[tb.id];
          return (
            <button key={tb.id} onClick={() => switchTab(tb.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-medium transition-all flex-1 justify-center whitespace-nowrap ${
                tab === tb.id
                  ? 'bg-white dark:bg-dark-border shadow-sm text-accent-700 dark:text-accent-400 ring-1 ring-accent/10'
                  : 'text-cream-500 dark:text-cream-500 hover:text-cream-700 hover:bg-cream-50 dark:hover:bg-dark-border/50'
              }`}>
              <tb.icon size={14} />
              <span className="hidden sm:inline">{tb.label}</span>
              {badge > 0 && (
                <span className={`ml-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[9px] font-bold ${
                  tab === tb.id ? 'bg-accent/15 text-accent-700 dark:text-accent-400' : 'bg-cream-200 dark:bg-dark-border text-cream-500'
                }`}>{badge > 99 ? '99+' : badge}</span>
              )}
            </button>
          );
        })}
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
    healthy: { label: t('admin.systemHealthy'), icon: Wifi, color: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 border border-emerald-200/60 dark:border-emerald-800/40', dot: 'bg-emerald-500' },
    degraded: { label: t('admin.systemDegraded'), icon: AlertTriangle, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border border-amber-200/60 dark:border-amber-800/40', dot: 'bg-amber-500' },
    unhealthy: { label: t('admin.systemUnhealthy'), icon: WifiOff, color: 'text-red-700 dark:text-red-400', bg: 'bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 border border-red-200/60 dark:border-red-800/40', dot: 'bg-red-500' },
  }[systemStatus];

  const activePercent = stats.totalUsers > 0 ? Math.round((stats.activeMonth / stats.totalUsers) * 100) : 0;
  const todayPercent = stats.totalUsers > 0 ? Math.round((stats.activeToday / stats.totalUsers) * 100) : 0;

  // Health score: composite from avg response, error rate, active users
  const respScore = avgResp < 200 ? 100 : avgResp < 500 ? 60 : 20;
  const errScore = errorRate < 1 ? 100 : errorRate < 3 ? 60 : 20;
  const engageScore = activePercent > 50 ? 100 : activePercent > 20 ? 60 : 20;
  const healthScore = Math.round((respScore + errScore + engageScore) / 3);

  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* System status + health score */}
      <div className="grid md:grid-cols-[1fr,auto] gap-4">
        <div className={`flex items-center justify-between px-5 py-4 rounded-2xl ${statusConfig.bg}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${systemStatus === 'healthy' ? 'bg-emerald-500/15' : systemStatus === 'degraded' ? 'bg-amber-500/15' : 'bg-red-500/15'}`}>
              <StatusIcon size={18} className={statusConfig.color} />
            </div>
            <div>
              <p className={`text-sm font-semibold ${statusConfig.color}`}>{statusConfig.label}</p>
              <p className="text-[11px] text-cream-500 mt-0.5">
                {t('admin.statusDetail', { avgMs: avgResp, errorRate: errorRate.toFixed(1) })}
              </p>
            </div>
          </div>
          <button onClick={onCleanup} className="hidden sm:flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-xl bg-white/60 dark:bg-dark-card/60 hover:bg-white dark:hover:bg-dark-card transition-colors text-cream-600 dark:text-cream-400" title={t('admin.cleanupDesc')}>
            <Trash2 size={13} /> {t('admin.cleanupLogs')}
          </button>
        </div>

        {/* Health score gauge */}
        <div className="card flex items-center gap-4 !py-3 min-w-[180px]">
          <div className="relative w-14 h-14">
            <svg className="w-14 h-14 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-cream-200 dark:text-dark-border" />
              <circle cx="18" cy="18" r="15.5" fill="none" strokeWidth="3" strokeDasharray={`${(healthScore / 100) * (2 * Math.PI * 15.5)} ${2 * Math.PI * 15.5}`} strokeLinecap="round"
                className={healthScore >= 70 ? 'text-emerald-500' : healthScore >= 40 ? 'text-amber-500' : 'text-red-500'} />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-heading font-bold text-cream-900 dark:text-dark-text">{healthScore}</span>
          </div>
          <div>
            <p className="text-xs text-cream-500 uppercase tracking-wider font-medium">{t('admin.healthScore')}</p>
            <p className={`text-sm font-semibold ${healthScore >= 70 ? 'text-emerald-600 dark:text-emerald-400' : healthScore >= 40 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
              {healthScore >= 70 ? t('admin.excellent') : healthScore >= 40 ? t('admin.fair') : t('admin.poor')}
            </p>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <Users size={16} className="text-accent-600" />
            </div>
            {stats.recentSignups > 0 && (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full">
                +{stats.recentSignups}
              </span>
            )}
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{stats.totalUsers}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.totalUsers')}</p>
        </div>

        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <Sparkles size={16} className="text-emerald-600" />
            </div>
            <span className="text-[10px] font-medium text-cream-500">{todayPercent}%</span>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{stats.activeToday}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.activeToday')}</p>
        </div>

        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <BarChart3 size={16} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{stats.activeMonth}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.activeThisMonth')}</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-cream-200 dark:bg-dark-border overflow-hidden">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(activePercent, 100)}%` }} />
            </div>
            <span className="text-[10px] text-cream-400 font-medium">{activePercent}%</span>
          </div>
        </div>

        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Database size={16} className="text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{stats.totalTransactions}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.totalRecords')}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="section-title mb-4">{t('admin.apiCalls7Days')}</h3>
          {stats.apiCallsByDay.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.apiCallsByDay}>
                <defs>
                  <linearGradient id="adminAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1B7A6E" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="#1B7A6E" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.1)' }} />
                <Area type="monotone" dataKey="count" stroke="#1B7A6E" fill="url(#adminAreaFill)" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: '#fff' }} />
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
                <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.1)' }} />
                <Bar dataKey="count" fill="#1B7A6E" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-cream-500 text-center py-8">{t('admin.noDataYet')}</p>}
        </div>
      </div>

      {/* Infrastructure metrics */}
      <div className="grid md:grid-cols-3 gap-4">
        <div className="card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 bg-accent/5 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="relative text-center">
            <Globe size={18} className="mx-auto text-accent-500 mb-2" />
            <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.totalApiCalls')}</p>
            <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text mt-1">{stats.totalApiCalls.toLocaleString()}</p>
          </div>
        </div>
        <div className="card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 rounded-full -translate-y-1/2 translate-x-1/2" style={{ background: avgResp > 500 ? 'rgba(220,38,38,.05)' : avgResp > 200 ? 'rgba(217,119,6,.05)' : 'rgba(5,150,105,.05)' }} />
          <div className="relative text-center">
            <Gauge size={18} className={`mx-auto mb-2 ${avgResp > 500 ? 'text-danger' : avgResp > 200 ? 'text-warning' : 'text-success'}`} />
            <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.avgResponseTime')}</p>
            <p className={`text-2xl font-heading font-bold mt-1 ${avgResp > 500 ? 'text-danger' : avgResp > 200 ? 'text-warning' : 'text-success'}`}>{avgResp}ms</p>
          </div>
        </div>
        <div className="card relative overflow-hidden">
          <div className="absolute top-0 right-0 w-20 h-20 rounded-full -translate-y-1/2 translate-x-1/2" style={{ background: errorRate > 5 ? 'rgba(220,38,38,.05)' : errorRate > 2 ? 'rgba(217,119,6,.05)' : 'rgba(5,150,105,.05)' }} />
          <div className="relative text-center">
            <AlertTriangle size={18} className={`mx-auto mb-2 ${errorRate > 5 ? 'text-danger' : errorRate > 2 ? 'text-warning' : 'text-success'}`} />
            <p className="text-xs text-cream-500 uppercase tracking-wide">{t('admin.errorRate')}</p>
            <p className={`text-2xl font-heading font-bold mt-1 ${errorRate > 5 ? 'text-danger' : errorRate > 2 ? 'text-warning' : 'text-success'}`}>
              {errorRate.toFixed(1)}%
            </p>
            <p className="text-xs text-cream-500 mt-0.5">{stats.errorCount} {t('admin.totalErrorsLabel')}</p>
          </div>
        </div>
      </div>

      {/* PWA Install Stats */}
      <div className="card">
        <h3 className="section-title flex items-center gap-2 mb-4">
          <Smartphone size={14} /> {t('admin.pwaInstalls')}
        </h3>
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-3xl font-heading font-bold text-cream-900 dark:text-dark-text">{stats.pwaInstalls || 0}</p>
            <p className="text-xs text-cream-500 mt-1">{t('admin.pwaInstalls')}</p>
          </div>
          {stats.pwaPlatforms && stats.pwaPlatforms.length > 0 ? (
            <div className="flex-1 space-y-2">
              {stats.pwaPlatforms.map((p) => {
                const pct = stats.pwaInstalls > 0 ? Math.round((p.count / stats.pwaInstalls) * 100) : 0;
                const label = p.platform === 'ios' ? 'iOS' : p.platform === 'android' ? 'Android' : 'Desktop';
                return (
                  <div key={p.platform} className="flex items-center gap-3">
                    <span className="text-xs text-cream-600 dark:text-cream-400 w-14">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-cream-200 dark:bg-dark-border overflow-hidden">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-cream-500 w-12 text-right">{p.count} ({pct}%)</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-cream-500">{t('admin.pwaNone')}</p>
          )}
        </div>
      </div>

      {/* Quick actions — mobile cleanup button */}
      <div className="sm:hidden">
        <button onClick={onCleanup} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
          <Trash2 size={14} /> {t('admin.cleanupLogs')}
        </button>
      </div>
    </div>
  );
}

// ─── Avatar color from name ──────────────────────────────
const AVATAR_COLORS = ['#1B7A6E', '#7C3AED', '#2563EB', '#0891B2', '#059669', '#D97706', '#DC2626', '#DB2777', '#65A30D', '#EA580C'];
function avatarColor(name) { return AVATAR_COLORS[(name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length]; }

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
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  const filtered = useMemo(() => {
    let list = [...users];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q));
    }
    if (filter === 'active') list = list.filter(u => !u.suspended);
    else if (filter === 'suspended') list = list.filter(u => u.suspended);
    else if (filter === 'ai') list = list.filter(u => u.aiProxyAllowed);
    list.sort((a, b) => {
      let va, vb;
      if (sortBy === 'name') { va = a.name?.toLowerCase() || ''; vb = b.name?.toLowerCase() || ''; }
      else if (sortBy === 'records') {
        va = (a.transactionCount || 0) + (a.budgetCount || 0) + (a.goalCount || 0);
        vb = (b.transactionCount || 0) + (b.budgetCount || 0) + (b.goalCount || 0);
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

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const selectableIds = filtered.filter(u => u.id !== currentUserId).map(u => u.id);
    if (selectedIds.size >= selectableIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const handleBulkSuspend = async () => {
    const targets = filtered.filter(u => selectedIds.has(u.id) && !u.suspended);
    for (const u of targets) await onToggle(u);
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const handleBulkActivate = async () => {
    const targets = filtered.filter(u => selectedIds.has(u.id) && u.suspended);
    for (const u of targets) await onToggle(u);
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const handleExportUsers = () => {
    const headers = ['Name', 'Email', 'Role', 'Status', 'AI Access', 'Transactions', 'Budgets', 'Goals', 'Last Active', 'Joined'];
    const rows = filtered.map(u => [u.name, u.email, u.role || 'user', u.suspended ? 'Suspended' : 'Active', u.aiProxyAllowed ? 'Yes' : 'No', u.transactionCount || 0, u.budgetCount || 0, u.goalCount || 0, u.lastActive || '', u.createdAt || '']);
    exportAdminCSV(rows, headers, `users_export_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(t('admin.exportedCsv'));
  };

  const FILTERS = [
    { id: 'all', label: t('common.all'), count: users.length },
    { id: 'active', label: t('common.active'), count: users.filter(u => !u.suspended).length },
    { id: 'suspended', label: t('admin.suspended'), count: users.filter(u => u.suspended).length },
    { id: 'ai', label: t('admin.colAi'), count: users.filter(u => u.aiProxyAllowed).length },
  ];

  const SORTS = [
    { id: 'name', label: t('admin.colUser') },
    { id: 'records', label: t('admin.colRecords') },
    { id: 'lastActive', label: t('admin.colLastActive') },
    { id: 'joined', label: t('admin.colJoined') },
  ];

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-2">
        {FILTERS.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className={`p-3 rounded-xl text-center transition-all border ${
              filter === f.id
                ? 'bg-accent/5 border-accent/30 ring-1 ring-accent/20'
                : 'bg-white dark:bg-dark-card border-cream-200 dark:border-dark-border hover:border-cream-300'
            }`}>
            <p className="text-lg font-heading font-bold text-cream-900 dark:text-dark-text">{f.count}</p>
            <p className="text-[10px] text-cream-500 uppercase tracking-wider font-medium">{f.label}</p>
          </button>
        ))}
      </div>

      {/* Search + sort bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('admin.searchUsers')} className="input pl-9 w-full text-sm" />
        </div>
        <div className="flex gap-1.5 items-center">
          {SORTS.map(s => (
            <button key={s.id} onClick={() => toggleSort(s.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                sortBy === s.id
                  ? 'bg-accent/10 text-accent border border-accent/30'
                  : 'bg-cream-100 dark:bg-dark-border text-cream-500 hover:bg-cream-200'
              }`}>
              {s.label}
              {sortBy === s.id && <ArrowUpDown size={10} className={sortDir === 'desc' ? 'rotate-180' : ''} />}
            </button>
          ))}
          <div className="flex items-center gap-1 ml-1 border-l border-cream-200 dark:border-dark-border pl-2">
            <button onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
              className={`p-1.5 rounded-lg transition-colors ${bulkMode ? 'bg-accent/10 text-accent' : 'hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500'}`}
              title={t('admin.bulkActions')}>
              <CheckSquare size={14} />
            </button>
            <button onClick={handleExportUsers} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={t('admin.exportCsv')}>
              <Download size={14} className="text-cream-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {bulkMode && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-accent/5 border border-accent/20">
          <button onClick={toggleSelectAll} className="flex items-center gap-2 text-xs font-medium text-accent">
            {selectedIds.size >= filtered.filter(u => u.id !== currentUserId).length
              ? <CheckSquare size={14} /> : <Square size={14} />}
            {t('admin.selectAll')}
          </button>
          <span className="text-xs text-cream-500">{t('admin.nSelected', { count: selectedIds.size })}</span>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <>
              <button onClick={handleBulkSuspend} className="text-xs px-3 py-1.5 rounded-lg bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 hover:bg-orange-200 font-medium transition-colors">
                <UserX size={12} className="inline mr-1" /> {t('admin.suspendSelected')}
              </button>
              <button onClick={handleBulkActivate} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 hover:bg-emerald-200 font-medium transition-colors">
                <UserCheck size={12} className="inline mr-1" /> {t('admin.activateSelected')}
              </button>
            </>
          )}
        </div>
      )}

      {/* User cards */}
      <div className="space-y-2">
        {filtered.map(u => {
          const totalRecords = (u.transactionCount || 0) + (u.budgetCount || 0) + (u.goalCount || 0) + (u.recurringCount || 0) + (u.peopleCount || 0) + (u.debtCount || 0) + (u.wishlistCount || 0);
          const isSelf = u.id === currentUserId;
          const isExpanded = expandedId === u.id;
          const color = avatarColor(u.name);
          return (
            <div key={u.id} className={`card !p-0 overflow-hidden transition-all ${isExpanded ? 'ring-1 ring-accent/20' : ''}`}>
              {/* Main row */}
              <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-cream-50/50 dark:hover:bg-dark-border/30 transition-colors"
                onClick={() => bulkMode && !isSelf ? toggleSelect(u.id) : setExpandedId(isExpanded ? null : u.id)}>
                {/* Bulk checkbox */}
                {bulkMode && (
                  <button onClick={(e) => { e.stopPropagation(); if (!isSelf) toggleSelect(u.id); }}
                    className={`shrink-0 ${isSelf ? 'opacity-30' : ''}`}>
                    {selectedIds.has(u.id) ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} className="text-cream-400" />}
                  </button>
                )}
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                  style={{ backgroundColor: color }}>
                  {u.name?.charAt(0).toUpperCase() || '?'}
                </div>

                {/* Name + email */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm text-cream-900 dark:text-dark-text truncate">
                      {u.name}{isSelf ? ` (${t('admin.you')})` : ''}
                    </p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-cream-200 text-cream-600 dark:bg-dark-border dark:text-cream-500'
                    }`}>{u.role || t('admin.roleUser')}</span>
                    {u.suspended && <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">{t('admin.suspended')}</span>}
                  </div>
                  <p className="text-xs text-cream-500 truncate">{u.email}</p>
                </div>

                {/* Quick stats — desktop only */}
                <div className="hidden md:flex items-center gap-4">
                  <div className="text-center min-w-[60px]">
                    <p className="text-sm font-bold text-cream-900 dark:text-dark-text">{totalRecords}</p>
                    <p className="text-[10px] text-cream-400">{t('admin.colRecords')}</p>
                  </div>
                  <div className="text-center min-w-[80px]">
                    <p className="text-xs font-medium text-cream-700 dark:text-cream-300">{timeAgo(u.lastActive)}</p>
                    <p className="text-[10px] text-cream-400">{t('admin.colLastActive')}</p>
                  </div>
                  {u.role !== 'admin' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleAi(u); }}
                      className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
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

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0">
                  {!isSelf && (
                    <>
                      <button onClick={(e) => { e.stopPropagation(); onResetPassword(u); }}
                        className="p-2 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={t('admin.resetPassword')}>
                        <KeyRound size={14} className="text-cream-500" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onToggle(u); }}
                        className="p-2 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border transition-colors" title={u.suspended ? t('admin.activate') : t('admin.suspend')}>
                        {u.suspended ? <UserCheck size={14} className="text-green-600" /> : <UserX size={14} className="text-orange-500" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(u); }}
                        className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title={t('admin.deleteAccount')}>
                        <Trash2 size={14} className="text-red-400" />
                      </button>
                    </>
                  )}
                  <ChevronDown size={14} className={`text-cream-400 transition-transform ml-1 ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-cream-100 dark:border-dark-border bg-cream-50/30 dark:bg-dark-border/10 space-y-3">
                  {/* Mobile-only stats */}
                  <div className="md:hidden flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-cream-500">{t('admin.colRecords')}: <strong className="text-cream-900 dark:text-dark-text">{totalRecords}</strong></span>
                    <span className="text-xs text-cream-500">{t('admin.colLastActive')}: <strong className="text-cream-900 dark:text-dark-text">{timeAgo(u.lastActive)}</strong></span>
                    {u.role !== 'admin' && (
                      <button onClick={() => onToggleAi(u)}
                        className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${u.aiProxyAllowed ? 'bg-green-100 text-green-700' : 'bg-cream-200 text-cream-500'}`}>
                        <Bot size={11} /> {u.aiProxyAllowed ? t('admin.allowed') : t('admin.off')}
                      </button>
                    )}
                  </div>

                  {/* Record breakdown grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
                    {[
                      { label: t('admin.transactions'), count: u.transactionCount || 0, icon: '📋' },
                      { label: t('admin.budgets'), count: u.budgetCount || 0, icon: '💰' },
                      { label: t('admin.goals'), count: u.goalCount || 0, icon: '🎯' },
                      { label: t('admin.recurring'), count: u.recurringCount || 0, icon: '🔄' },
                      { label: t('admin.people'), count: u.peopleCount || 0, icon: '👥' },
                      { label: t('admin.debts'), count: u.debtCount || 0, icon: '💳' },
                      { label: t('admin.wishlist'), count: u.wishlistCount || 0, icon: '⭐' },
                    ].map(item => (
                      <div key={item.label} className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border">
                        <span className="text-sm">{item.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-cream-900 dark:text-dark-text leading-tight">{item.count}</p>
                          <p className="text-[9px] text-cream-400 uppercase tracking-wider truncate">{item.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Meta info */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-cream-500 items-center">
                    <span>{t('admin.colJoined')}: <strong className="text-cream-700 dark:text-cream-300">{u.createdAt ? formatDate(u.createdAt, 'dd MMM yyyy') : '—'}</strong></span>
                    <span>ID: <code className="text-[10px] bg-cream-200 dark:bg-dark-border px-1.5 py-0.5 rounded font-mono">{u.id?.slice(0, 12)}…</code></span>
                    <button onClick={() => { navigator.clipboard.writeText(u.email); toast.success(t('admin.emailCopied')); }}
                      className="flex items-center gap-1 text-[10px] text-cream-400 hover:text-accent transition-colors">
                      <Copy size={10} /> {t('admin.copyEmail')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Users className="mx-auto text-cream-300 dark:text-cream-600 mb-3" size={32} />
            <p className="text-cream-500 text-sm">{search ? t('admin.noUsersMatch') : t('admin.noUsersYet')}</p>
          </div>
        )}
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
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <DollarSign size={16} className="text-emerald-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{formatCost(grandTotal)}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.totalCost')}</p>
        </div>
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <Users size={16} className="text-accent-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{users.length}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.activeAiUsers')}</p>
        </div>
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center">
              <Bot size={16} className="text-purple-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{totalRequests}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.totalRequests')}</p>
        </div>
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Hash size={16} className="text-blue-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">
            {formatTokens(users.reduce((sum, u) => sum + u.totalInputTokens + u.totalOutputTokens, 0))}
          </p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.totalTokens')}</p>
        </div>
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Gauge size={16} className="text-amber-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{formatCost(costPerRequest)}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.costPerRequest')}</p>
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
                contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.1)' }}
                formatter={(v) => [`$${v.toFixed(4)}`, t('admin.costUsd')]}
              />
              <Bar dataKey="totalCostUSD" fill="#1B7A6E" radius={[0, 4, 4, 0]} />
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

      <div className="card p-0 overflow-hidden">
        <div className="divide-y divide-cream-100 dark:divide-dark-border">
          {visible.map(a => {
            let meta = {};
            try { meta = JSON.parse(a.metadata || '{}'); } catch { /* non-critical parse fallback */ }
            const group = getActionGroup(a.action);
            const badgeColor = ACTION_BADGE_COLORS[group] || ACTION_BADGE_COLORS.crud;
            const aColor = avatarColor(a.userName || 'U');
            return (
              <div key={a.id} className="flex items-center gap-3 px-4 py-3 hover:bg-cream-50/50 dark:hover:bg-dark-border/30 transition-colors">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: aColor }}>
                  {a.userName?.charAt(0).toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm text-cream-900 dark:text-dark-text">{a.userName || t('admin.unknown')}</span>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${badgeColor}`}>
                      {ACTION_LABEL_KEYS[a.action] ? t(ACTION_LABEL_KEYS[a.action]) : a.action}
                    </span>
                    {meta.table && (
                      <span className="text-cream-400 text-[11px]">→ {meta.table}</span>
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-cream-400 shrink-0 tabular-nums">{timeAgo(a.timestamp)}</span>
              </div>
            );
          })}
          {visible.length === 0 && (
            <div className="text-center py-12">
              <Activity className="mx-auto text-cream-300 dark:text-cream-600 mb-3" size={32} />
              <p className="text-cream-500 text-sm">{t('admin.noActivityYet')}</p>
            </div>
          )}
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

  const { clientErrors, serverErrors, filtered } = useMemo(() => {
    const client = errors.filter(e => e.status >= 400 && e.status < 500);
    const server = errors.filter(e => e.status >= 500);
    const list = filter === 'client' ? client : filter === 'server' ? server : errors;
    return { clientErrors: client, serverErrors: server, filtered: list };
  }, [errors, filter]);

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
      {/* Error summary strip */}
      {errors.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <button onClick={() => setFilter('all')}
            className={`p-3 rounded-xl text-center transition-all border ${filter === 'all' ? 'bg-accent/5 border-accent/30 ring-1 ring-accent/20' : 'bg-white dark:bg-dark-card border-cream-200 dark:border-dark-border hover:border-cream-300'}`}>
            <p className="text-lg font-heading font-bold text-cream-900 dark:text-dark-text">{errors.length}</p>
            <p className="text-[10px] text-cream-500 uppercase tracking-wider font-medium">{t('common.all')}</p>
          </button>
          <button onClick={() => setFilter('client')}
            className={`p-3 rounded-xl text-center transition-all border ${filter === 'client' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-300/50 ring-1 ring-amber-200/30' : 'bg-white dark:bg-dark-card border-cream-200 dark:border-dark-border hover:border-cream-300'}`}>
            <p className="text-lg font-heading font-bold text-amber-600 dark:text-amber-400">{clientErrors.length}</p>
            <p className="text-[10px] text-cream-500 uppercase tracking-wider font-medium">4xx {t('admin.clientErrors')}</p>
          </button>
          <button onClick={() => setFilter('server')}
            className={`p-3 rounded-xl text-center transition-all border ${filter === 'server' ? 'bg-red-50 dark:bg-red-900/10 border-red-300/50 ring-1 ring-red-200/30' : 'bg-white dark:bg-dark-card border-cream-200 dark:border-dark-border hover:border-cream-300'}`}>
            <p className="text-lg font-heading font-bold text-red-600 dark:text-red-400">{serverErrors.length}</p>
            <p className="text-[10px] text-cream-500 uppercase tracking-wider font-medium">5xx {t('admin.serverErrors')}</p>
          </button>
        </div>
      )}

      {/* Export button */}
      <div className="flex justify-end">
        <button onClick={handleExport} className="btn-ghost text-xs flex items-center gap-1.5" title={t('admin.exportCsv')}>
          <Download size={13} /> {t('admin.exportCsv')}
        </button>
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
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={24} className="text-emerald-500" />
              </div>
              <p className="text-cream-700 dark:text-cream-300 font-medium text-sm">{t('admin.noErrors')}</p>
              <p className="text-cream-400 text-xs mt-1">{t('admin.allClear')}</p>
            </div>
          )}
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
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${avgResponseTime > 500 ? 'bg-red-500/10' : avgResponseTime > 200 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
              <Clock size={16} className={respColor} />
            </div>
            <span className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${avgResponseTime > 500 ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' : avgResponseTime > 200 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
              {avgResponseTime < 200 ? t('admin.fast') : avgResponseTime < 500 ? t('admin.moderate') : t('admin.slow')}
            </span>
          </div>
          <p className={`text-2xl font-heading font-bold ${respColor}`}>{avgResponseTime}ms</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.avgResponseTime')}</p>
        </div>
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${maxResponseTime > 2000 ? 'bg-red-500/10' : maxResponseTime > 1000 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
              <TrendingUp size={16} className={maxColor} />
            </div>
          </div>
          <p className={`text-2xl font-heading font-bold ${maxColor}`}>{maxResponseTime}ms</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.p95ResponseTime')}</p>
        </div>
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center">
              <Activity size={16} className="text-accent-600" />
            </div>
          </div>
          <p className="text-2xl font-heading font-bold text-cream-900 dark:text-dark-text">{totalRequestsPerHour}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.avgRequestsHour')}</p>
        </div>
        <div className="card group hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between mb-2">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${slowEndpoints.length > 0 ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
              <AlertTriangle size={16} className={slowEndpoints.length > 0 ? 'text-amber-600' : 'text-emerald-600'} />
            </div>
            <span className="text-[9px] font-medium text-cream-400">&gt;500ms</span>
          </div>
          <p className={`text-2xl font-heading font-bold ${slowEndpoints.length > 0 ? 'text-warning' : 'text-success'}`}>{slowEndpoints.length}</p>
          <p className="text-xs text-cream-500 mt-0.5">{t('admin.slowEndpoints')}</p>
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
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.1)' }}
                formatter={(v, name) => [`${v}ms`, name === 'avgTime' ? t('admin.avg') : name === 'maxTime' ? t('admin.max') : name]} />
              <Bar dataKey="avgTime" fill="#1B7A6E" radius={[0, 4, 4, 0]} name={t('admin.avg')} />
              <Bar dataKey="maxTime" fill="#1B7A6E" fillOpacity={0.2} radius={[0, 4, 4, 0]} name={t('admin.max')} />
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
              <Tooltip contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.1)' }}
                formatter={(v, name) => [name === 'avgTime' ? `${v}ms` : v, name === 'avgTime' ? t('admin.avgTime') : t('admin.requests')]} />
              <Bar dataKey="count" fill="#1B7A6E" radius={[4, 4, 0, 0]} name={t('admin.requests')} />
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
          { label: t('common.total'), value: totalCount, onClick: () => setFilter('all'), active: filter === 'all', icon: MessageSquare, iconColor: 'text-accent-600', iconBg: 'bg-accent/10' },
          { label: t('admin.statusOpen'), value: openCount, onClick: () => setFilter('open'), active: filter === 'open', icon: AlertTriangle, iconColor: 'text-amber-600', iconBg: 'bg-amber-500/10' },
          { label: t('admin.statusInProgress'), value: countMap['in_progress'] || 0, onClick: () => setFilter('in_progress'), active: filter === 'in_progress', icon: Loader2, iconColor: 'text-blue-600', iconBg: 'bg-blue-500/10' },
          { label: t('admin.statusResolved'), value: countMap['resolved'] || 0, onClick: () => setFilter('resolved'), active: filter === 'resolved', icon: CheckCircle, iconColor: 'text-emerald-600', iconBg: 'bg-emerald-500/10' },
        ].map((card) => {
          const CardIcon = card.icon;
          return (
            <button key={card.label} onClick={card.onClick}
              className={`p-4 rounded-xl text-center transition-all border ${card.active ? 'bg-accent/5 border-accent/30 ring-1 ring-accent/20' : 'bg-white dark:bg-dark-card border-cream-200 dark:border-dark-border hover:border-cream-300'}`}>
              <div className={`w-8 h-8 rounded-lg ${card.iconBg} flex items-center justify-center mx-auto mb-2`}>
                <CardIcon size={14} className={card.iconColor} />
              </div>
              <p className="text-xl font-heading font-bold text-cream-900 dark:text-dark-text">{card.value}</p>
              <p className="text-[10px] text-cream-500 uppercase tracking-wider font-medium mt-0.5">{card.label}</p>
            </button>
          );
        })}
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
