import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import { useToast } from '../contexts/ToastContext';
import { getAllNotifications, markRead, markAllRead, clearAllNotifications } from '../lib/notificationStore';
import { Bell, CheckCheck, AlertTriangle, TrendingUp, RotateCcw, Info, Trophy, Trash2 } from 'lucide-react';
import HelpButton from '../components/HelpButton';

const TYPE_ICONS = {
  budget_warning: AlertTriangle,
  budget_exceeded: AlertTriangle,
  recurring_due: RotateCcw,
  achievement: Trophy,
  pace_alert: TrendingUp,
  info: Info,
};

const TYPE_COLORS = {
  budget_warning: 'text-warning',
  budget_exceeded: 'text-danger',
  recurring_due: 'text-info',
  achievement: 'text-success',
  pace_alert: 'text-warning',
  info: 'text-cream-500',
};

const TYPE_BG = {
  budget_warning: 'bg-warning/5',
  budget_exceeded: 'bg-danger/5',
  recurring_due: 'bg-info/5',
  achievement: 'bg-success/5',
  pace_alert: 'bg-warning/5',
  info: 'bg-cream-100 dark:bg-dark-border',
};

function timeAgo(dateStr, t) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.timeAgo').replace('{time}', '< 1m');
  if (mins < 60) return t('notifications.timeAgo').replace('{time}', `${mins}m`);
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('notifications.timeAgo').replace('{time}', `${hours}h`);
  const days = Math.floor(hours / 24);
  return t('notifications.timeAgo').replace('{time}', `${days}d`);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationHistory() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all', 'unread'
  const [typeFilter, setTypeFilter] = useState('all');
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const all = await getAllNotifications();
      setNotifications(all);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleMarkAllRead = async () => {
    await markAllRead();
    await loadAll();
    toast.success(t('notifications.allMarkedRead'));
  };

  const handleClearAll = async () => {
    await clearAllNotifications();
    setNotifications([]);
    setShowClearConfirm(false);
    toast.success(t('notifications.allCleared'));
  };

  const handleClick = async (notif) => {
    if (!notif.read) {
      await markRead(notif.id);
      await loadAll();
    }
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  // Get unique types for filter
  const uniqueTypes = [...new Set(notifications.map(n => n.type))];

  // Apply filters
  const filtered = notifications.filter(n => {
    if (filter === 'unread' && n.read) return false;
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    return true;
  });

  const FILTERS = [
    { id: 'all', label: t('notifications.filterAll') },
    { id: 'unread', label: t('notifications.filterUnread'), count: unreadCount },
  ];

  const TYPE_LABELS = {
    budget_warning: t('notifications.typeBudget'),
    budget_exceeded: t('notifications.typeBudget'),
    recurring_due: t('notifications.typeRecurring'),
    achievement: t('notifications.typeAchievement'),
    pace_alert: t('notifications.typePace'),
    info: t('notifications.typeInfo'),
  };

  return (
    <div className="page-container">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="page-title mb-0">{t('notifications.history')}</h1>
          <HelpButton section="notifications" />
        </div>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="btn-secondary text-xs flex items-center gap-1.5">
              <CheckCheck size={14} /> {t('notifications.markAllRead')}
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={() => setShowClearConfirm(true)} className="btn-secondary text-xs flex items-center gap-1.5 text-danger hover:bg-danger/10">
              <Trash2 size={14} /> {t('notifications.clearAll')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* Read/Unread filter */}
        <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                  : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              {f.label} {f.count > 0 ? `(${f.count})` : ''}
            </button>
          ))}
        </div>

        {/* Type filter */}
        {uniqueTypes.length > 1 && (
          <div className="flex gap-1.5">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                typeFilter === 'all' ? 'bg-accent/10 text-accent' : 'text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              {t('notifications.filterAll')}
            </button>
            {uniqueTypes.map((tp) => {
              const IconComp = TYPE_ICONS[tp] || Info;
              const colorClass = TYPE_COLORS[tp] || 'text-cream-500';
              return (
                <button
                  key={tp}
                  onClick={() => setTypeFilter(tp)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1 ${
                    typeFilter === tp ? 'bg-accent/10 text-accent' : 'text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-border'
                  }`}
                >
                  <IconComp size={11} className={typeFilter === tp ? 'text-accent' : colorClass} />
                  {TYPE_LABELS[tp] || tp}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Notification list */}
      {loading ? (
        <div className="card animate-pulse h-48" />
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-cream-400">
          <Bell size={40} className="mb-3 opacity-30" />
          <p className="text-sm font-medium">{filter === 'unread' ? t('notifications.noUnread') : t('notifications.noNotifications')}</p>
        </div>
      ) : (
        <div className="card p-0 divide-y divide-cream-100 dark:divide-dark-border overflow-hidden">
          {filtered.map((notif) => {
            const IconComp = TYPE_ICONS[notif.type] || Info;
            const colorClass = TYPE_COLORS[notif.type] || 'text-cream-500';
            const bgClass = TYPE_BG[notif.type] || 'bg-cream-100 dark:bg-dark-border';

            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left px-5 py-4 flex items-start gap-4 hover:bg-cream-50 dark:hover:bg-cream-800/30 transition-colors ${
                  !notif.read ? 'bg-accent-50/20 dark:bg-accent-900/5' : ''
                }`}
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${bgClass}`}>
                  <IconComp size={16} className={colorClass} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-sm font-medium ${!notif.read ? 'text-cream-900 dark:text-cream-100' : 'text-cream-600 dark:text-cream-400'}`}>
                      {notif.title}
                    </p>
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-accent-600 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-cream-500 mt-0.5">{notif.message}</p>
                  <p className="text-[11px] text-cream-400 mt-1.5">{formatDate(notif.createdAt)} · {timeAgo(notif.createdAt, t)}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl p-6 max-w-sm mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-danger/10 flex items-center justify-center">
                <Trash2 size={20} className="text-danger" />
              </div>
              <h3 className="text-sm font-semibold">{t('notifications.clearAll')}</h3>
            </div>
            <p className="text-xs text-cream-500 mb-4">{t('notifications.clearAllConfirm')}</p>
            <div className="flex gap-2">
              <button onClick={() => setShowClearConfirm(false)} className="btn-secondary flex-1 text-sm">{t('common.cancel')}</button>
              <button onClick={handleClearAll} className="btn-primary flex-1 text-sm bg-danger hover:bg-danger/90">{t('notifications.clearAll')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
