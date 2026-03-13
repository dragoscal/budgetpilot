import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import Modal from './Modal';
import { getUnseenChangelog, markChangelogSeen } from '../lib/changelog';
import {
  Sparkles, Calendar, Users, Flame, BarChart3, Handshake,
  UserPlus, FileSpreadsheet, Zap, Shield, Link,
  History, Copy, Trash2, Undo2, CheckSquare, RotateCcw, Landmark,
  Bell, XCircle, Coins, Globe, CreditCard, Smartphone, Target,
  Pencil, MessageSquare, CalendarDays, LayoutList, RefreshCw, Hash,
  Search, AlertTriangle, Tag, Eye, Bot, Settings, BarChart2, Layers, Palette,
} from 'lucide-react';

const ICONS = { Sparkles, Calendar, Users, Flame, BarChart3, Handshake, UserPlus, FileSpreadsheet, Zap, Shield, Link, History, Copy, Trash2, Undo2, CheckSquare, RotateCcw, Landmark, Bell, XCircle, Coins, Globe, CreditCard, Smartphone, Target, Pencil, MessageSquare, CalendarDays, LayoutList, RefreshCw, Hash, Search, AlertTriangle, Tag, Eye, Bot, Settings, BarChart2, Layers, Palette };

const TYPE_STYLES = {
  feature:     'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  improvement: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  fix:         'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
};

export default function WhatsNew() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getUnseenChangelog().then((unseen) => {
      if (!cancelled && unseen.length > 0) {
        setEntries(unseen);
        setOpen(true);
      }
    });
    return () => { cancelled = true; };
  }, [user]);

  const handleDismiss = async () => {
    await markChangelogSeen();
    setOpen(false);
  };

  if (!open || entries.length === 0) return null;

  return (
    <Modal open={open} onClose={handleDismiss} title="" wide>
      <div className="text-center mb-6">
        <div className="w-14 h-14 rounded-lg bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center mx-auto mb-3">
          <Sparkles size={28} className="text-accent" />
        </div>
        <h2 className="text-xl font-heading font-bold">{t('changelog.whatsNew')}</h2>
        <p className="text-sm text-cream-500 mt-1">{t('changelog.subtitle')}</p>
      </div>

      <div className="space-y-6 max-h-[50vh] overflow-y-auto pr-1">
        {entries.map((entry) => (
          <div key={entry.version}>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-accent-100 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                v{entry.version}
              </span>
              <span className="text-xs text-cream-400">{entry.date}</span>
            </div>
            <ul className="space-y-2.5">
              {entry.items.map((item, i) => {
                const Icon = ICONS[item.icon] || Sparkles;
                return (
                  <li key={i} className="flex items-start gap-3 p-2.5 rounded-xl bg-cream-50 dark:bg-dark-border/50">
                    <div className="w-8 h-8 rounded-lg bg-cream-100 dark:bg-dark-border flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={16} className="text-cream-600 dark:text-cream-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug">{t(item.textKey)}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${TYPE_STYLES[item.type]}`}>
                      {t(`changelog.${item.type}`)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <button onClick={handleDismiss} className="btn-primary w-full mt-6">
        {t('changelog.gotIt')}
      </button>
    </Modal>
  );
}
