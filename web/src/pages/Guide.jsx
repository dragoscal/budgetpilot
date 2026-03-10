import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import {
  HelpCircle, BookOpen, Lightbulb, MessageCircleQuestion, ChevronDown,
  LayoutDashboard, ArrowRightLeft, Wallet, Target, RefreshCw, Landmark,
  Calendar, TrendingUp, PiggyBank, BarChart3, ClipboardList, Users,
  Keyboard, MessageSquare, Camera, FileSpreadsheet, EyeOff, Repeat,
  Bell, Moon, Sparkles, CheckCircle2,
} from 'lucide-react';

const TABS = [
  { id: 'start', icon: BookOpen },
  { id: 'features', icon: Sparkles },
  { id: 'tips', icon: Lightbulb },
  { id: 'faq', icon: MessageCircleQuestion },
];

const FEATURE_ICONS = {
  dashboard: LayoutDashboard,
  transactions: ArrowRightLeft,
  budgets: Wallet,
  goals: Target,
  recurring: RefreshCw,
  loans: Landmark,
  calendar: Calendar,
  cashflow: TrendingUp,
  networth: PiggyBank,
  analytics: BarChart3,
  reports: ClipboardList,
  family: Users,
};

const TIP_ICONS = [Keyboard, MessageSquare, Camera, FileSpreadsheet, EyeOff, Repeat, Bell, Moon];

const FEATURE_KEYS = ['dashboard', 'transactions', 'budgets', 'goals', 'recurring', 'loans', 'calendar', 'cashflow', 'networth', 'analytics', 'reports', 'family'];

export default function Guide() {
  const { t } = useTranslation();
  const location = useLocation();
  const [tab, setTab] = useState('start');
  const [openFaq, setOpenFaq] = useState(null);

  // Handle hash navigation (e.g. /guide#dashboard)
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!hash) return;

    // Check if it's a feature key → switch to features tab and scroll
    if (FEATURE_KEYS.includes(hash)) {
      setTab('features');
      setTimeout(() => {
        document.getElementById(`feature-${hash}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    } else if (hash === 'tips') {
      setTab('tips');
    } else if (hash === 'faq') {
      setTab('faq');
    } else if (hash === 'start') {
      setTab('start');
    }
  }, [location.hash]);

  const tabLabels = {
    start: t('guide.gettingStarted'),
    features: t('guide.features'),
    tips: t('guide.tips'),
    faq: t('guide.faq'),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle size={20} className="text-accent-600" />
          <h1 className="text-xl md:text-2xl font-heading font-bold text-cream-900 dark:text-cream-100">
            {t('guide.title')}
          </h1>
        </div>
        <p className="text-sm text-cream-500 dark:text-cream-400">
          {t('guide.subtitle')}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 sm:gap-2 overflow-x-auto scrollbar-hide">
        {TABS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
              tab === id
                ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                : 'border-cream-300 dark:border-dark-border text-cream-500 hover:bg-cream-100 dark:hover:bg-dark-card'
            }`}
          >
            <Icon size={14} />
            {tabLabels[id]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="animate-fadeUp">
        {tab === 'start' && <GettingStarted t={t} />}
        {tab === 'features' && <Features t={t} />}
        {tab === 'tips' && <Tips t={t} />}
        {tab === 'faq' && <FAQ t={t} openFaq={openFaq} setOpenFaq={setOpenFaq} />}
      </div>
    </div>
  );
}

/* ─── Getting Started ─────────────────────────────────────── */
function GettingStarted({ t }) {
  const steps = [1, 2, 3, 4, 5, 6];
  const stepIcons = [CheckCircle2, Wallet, ArrowRightLeft, Wallet, Target, BarChart3];

  return (
    <div className="space-y-3">
      {steps.map((n) => {
        const Icon = stepIcons[n - 1];
        return (
          <div
            key={n}
            className="card flex items-start gap-3 sm:gap-4"
          >
            <div className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-accent-50 dark:bg-accent-500/15 text-accent-600 shrink-0 font-bold text-sm">
              {n}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <Icon size={14} className="text-cream-400 shrink-0" />
                <h3 className="text-sm font-semibold text-cream-900 dark:text-cream-100">
                  {t(`guide.step${n}Title`)}
                </h3>
              </div>
              <p className="text-xs text-cream-500 dark:text-cream-400 leading-relaxed">
                {t(`guide.step${n}Desc`)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Features ────────────────────────────────────────────── */
function Features({ t }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {FEATURE_KEYS.map((key) => {
        const Icon = FEATURE_ICONS[key];
        return (
          <div
            key={key}
            id={`feature-${key}`}
            className="card hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center">
                <Icon size={16} className="text-accent-600" />
              </div>
              <h3 className="text-sm font-semibold text-cream-900 dark:text-cream-100">
                {t(`guide.${key}Title`)}
              </h3>
            </div>
            <p className="text-xs text-cream-500 dark:text-cream-400 leading-relaxed">
              {t(`guide.${key}Desc`)}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Tips ─────────────────────────────────────────────────── */
function Tips({ t }) {
  const tips = [1, 2, 3, 4, 5, 6, 7, 8];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {tips.map((n) => {
        const Icon = TIP_ICONS[n - 1];
        return (
          <div key={n} className="card flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-warning/10 flex items-center justify-center shrink-0">
              <Icon size={16} className="text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-cream-900 dark:text-cream-100 mb-0.5">
                {t(`guide.tip${n}Title`)}
              </h3>
              <p className="text-xs text-cream-500 dark:text-cream-400 leading-relaxed">
                {t(`guide.tip${n}Desc`)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── FAQ ──────────────────────────────────────────────────── */
function FAQ({ t, openFaq, setOpenFaq }) {
  const questions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return (
    <div className="space-y-2">
      {questions.map((n) => {
        const isOpen = openFaq === n;
        return (
          <div
            key={n}
            className="card !p-0 overflow-hidden"
          >
            <button
              onClick={() => setOpenFaq(isOpen ? null : n)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors"
            >
              <span className="text-sm font-medium text-cream-900 dark:text-cream-100">
                {t(`faq.q${n}`)}
              </span>
              <ChevronDown
                size={16}
                className={`text-cream-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                isOpen ? 'max-h-60' : 'max-h-0'
              }`}
            >
              <div className="px-4 pb-3 pt-0">
                <p className="text-xs text-cream-500 dark:text-cream-400 leading-relaxed">
                  {t(`faq.a${n}`)}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
