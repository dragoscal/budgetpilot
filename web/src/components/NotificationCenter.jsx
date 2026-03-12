import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import { getNotifications, getUnreadCount, markRead, markAllRead, clearOldNotifications } from '../lib/notificationStore';
import { Bell, BellDot, CheckCheck, AlertTriangle, TrendingUp, RotateCcw, Info, Trophy, X } from 'lucide-react';

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
  info: '',
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

export default function NotificationCenter({ collapsed = false, mobile = false }) {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef(null);
  const navigate = useNavigate();
  const { t } = useTranslation();

  const loadNotifications = useCallback(async () => {
    try {
      const notifs = await getNotifications(50);
      setNotifications(notifs);
      const count = await getUnreadCount();
      setUnreadCount(count);
    } catch (err) {
      // Non-critical — log silently
      console.error('Failed to load notifications:', err);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
    // Clean old notifications on mount
    clearOldNotifications(30).catch(() => {});

    // Listen for notification changes (real-time, no polling)
    const handler = () => loadNotifications();
    window.addEventListener('notification-added', handler);
    window.addEventListener('notifications-changed', handler);
    return () => {
      window.removeEventListener('notification-added', handler);
      window.removeEventListener('notifications-changed', handler);
    };
  }, [loadNotifications]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleNotificationClick = async (notif) => {
    if (!notif.read) {
      await markRead(notif.id);
      await loadNotifications();
    }
    if (notif.actionUrl) {
      navigate(notif.actionUrl);
      setOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllRead();
    await loadNotifications();
  };

  const BellIcon = unreadCount > 0 ? BellDot : Bell;

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      {mobile ? (
        <button
          onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-cream-600 dark:text-cream-400 w-full transition-colors"
          title={t('notifications.title')}
        >
          <div className="relative">
            <BellIcon size={18} className="shrink-0" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span>{t('notifications.title')}</span>
          {unreadCount > 0 && (
            <span className="ml-auto text-[11px] font-bold text-accent-600 dark:text-accent-400">{unreadCount}</span>
          )}
        </button>
      ) : collapsed ? (
        <button
          onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
          className="relative p-2 rounded-lg text-cream-500 hover:text-cream-700 dark:text-cream-400 dark:hover:text-cream-200 hover:bg-cream-100 dark:hover:bg-cream-800/50 transition-colors"
          title={t('notifications.title')}
        >
          <BellIcon size={16} className="shrink-0" />
          {unreadCount > 0 && (
            <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-danger text-white text-[8px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-dark-card">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      ) : (
        <button
          onClick={() => { setOpen(!open); if (!open) loadNotifications(); }}
          className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium w-full transition-colors ${
            unreadCount > 0
              ? 'text-accent-700 dark:text-accent-300 bg-accent-50/50 dark:bg-accent-500/10'
              : 'text-cream-600 dark:text-cream-400 hover:bg-cream-100 dark:hover:bg-cream-800/50'
          }`}
          title={t('notifications.title')}
        >
          <div className="relative">
            <BellIcon size={16} className="shrink-0" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-danger text-white text-[8px] font-bold flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span>{t('notifications.title')}</span>
          {unreadCount > 0 && (
            <span className="ml-auto text-[10px] font-bold bg-accent-100 dark:bg-accent-900/30 text-accent-700 dark:text-accent-300 px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className={`absolute z-[60] ${
          mobile
            ? 'fixed inset-x-0 top-0 bottom-0 bg-white dark:bg-dark-card'
            : 'top-full left-0 mt-2 w-80 max-h-[70vh] bg-white dark:bg-dark-card rounded-xl border border-cream-200 dark:border-dark-border shadow-xl'
        } overflow-hidden flex flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-cream-200 dark:border-dark-border shrink-0">
            <h3 className="text-sm font-semibold">{t('notifications.title')}</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex items-center gap-1 text-[11px] text-accent-600 dark:text-accent-400 hover:underline"
                >
                  <CheckCheck size={12} /> {t('notifications.markAllRead')}
                </button>
              )}
              {mobile && (
                <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-cream-100 dark:hover:bg-dark-border">
                  <X size={16} className="text-cream-500" />
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-cream-400">
                <Bell size={32} className="mb-2 opacity-30" />
                <p className="text-sm">{t('notifications.noNotifications')}</p>
              </div>
            ) : (
              <div className="divide-y divide-cream-100 dark:divide-dark-border">
                {notifications.map((notif) => {
                  const IconComp = TYPE_ICONS[notif.type] || Info;
                  const colorClass = TYPE_COLORS[notif.type] || 'text-cream-500';
                  const bgClass = TYPE_BG[notif.type] || '';

                  return (
                    <button
                      key={notif.id}
                      onClick={() => handleNotificationClick(notif)}
                      className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-cream-50 dark:hover:bg-cream-800/30 transition-colors ${
                        !notif.read ? `${bgClass || 'bg-accent-50/30 dark:bg-accent-900/10'}` : ''
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${bgClass || 'bg-cream-100 dark:bg-dark-border'}`}>
                        <IconComp size={14} className={colorClass} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-xs font-medium truncate ${!notif.read ? 'text-cream-900 dark:text-cream-100' : 'text-cream-600 dark:text-cream-400'}`}>
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="w-1.5 h-1.5 rounded-full bg-accent-600 shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-cream-500 dark:text-cream-500 mt-0.5 line-clamp-2">{notif.message}</p>
                        <p className="text-[10px] text-cream-400 mt-1">{timeAgo(notif.createdAt, t)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* View all link */}
          {notifications.length > 0 && (
            <div className="border-t border-cream-200 dark:border-dark-border px-4 py-2.5 shrink-0">
              <button
                onClick={() => { navigate('/notifications'); setOpen(false); }}
                className="w-full text-center text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium"
              >
                {t('notifications.viewHistory')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
