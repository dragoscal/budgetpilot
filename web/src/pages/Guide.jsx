import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';
import {
  HelpCircle, BookOpen, Lightbulb, MessageCircleQuestion, ChevronDown,
  LayoutDashboard, PlusCircle, Receipt, Target, RotateCcw, Building2,
  Calendar, TrendingUp, Landmark, BarChart3, ClipboardList, Home,
  Users, Star, Trophy, Camera, FileSpreadsheet, FileText, Settings,
  Sparkles, CheckCircle2, DollarSign, PiggyBank, Check, ArrowRight,
  Keyboard, MessageSquare, EyeOff, Bell, Moon, Zap, ExternalLink,
} from 'lucide-react';

// ─── Data Constants ──────────────────────────────────────────────

const SECTION_IDS = ['welcome', 'quickstart', 'features', 'walkthroughs', 'tips', 'faq'];

const SECTION_ICONS = {
  welcome: Sparkles,
  quickstart: CheckCircle2,
  features: LayoutDashboard,
  walkthroughs: BookOpen,
  tips: Lightbulb,
  faq: MessageCircleQuestion,
};

const QS_STEPS = [
  { id: 'account', icon: CheckCircle2, route: '/settings' },
  { id: 'currency', icon: DollarSign, route: '/settings' },
  { id: 'transaction', icon: PlusCircle, route: '/add' },
  { id: 'budget', icon: PiggyBank, route: '/budgets' },
  { id: 'analytics', icon: BarChart3, route: '/analytics' },
  { id: 'ai', icon: Sparkles, route: '/add' },
];

const FEATURE_GROUPS = [
  {
    id: 'core',
    features: [
      { id: 'dashboard', icon: LayoutDashboard, route: '/' },
      { id: 'addTransaction', icon: PlusCircle, route: '/add' },
      { id: 'transactions', icon: Receipt, route: '/transactions' },
    ],
  },
  {
    id: 'planning',
    features: [
      { id: 'budgets', icon: PiggyBank, route: '/budgets' },
      { id: 'goals', icon: Target, route: '/goals' },
      { id: 'recurring', icon: RotateCcw, route: '/recurring' },
      { id: 'loans', icon: Building2, route: '/loans' },
    ],
  },
  {
    id: 'insights',
    features: [
      { id: 'calendar', icon: Calendar, route: '/calendar' },
      { id: 'cashflow', icon: TrendingUp, route: '/cashflow' },
      { id: 'networth', icon: Landmark, route: '/networth' },
      { id: 'analytics', icon: BarChart3, route: '/analytics' },
      { id: 'reports', icon: ClipboardList, route: '/reports' },
    ],
  },
  {
    id: 'more',
    features: [
      { id: 'family', icon: Home, route: '/family' },
      { id: 'people', icon: Users, route: '/people' },
      { id: 'wishlist', icon: Star, route: '/wishlist' },
      { id: 'challenges', icon: Trophy, route: '/challenges' },
      { id: 'receipts', icon: Camera, route: '/receipts' },
      { id: 'importBudget', icon: FileSpreadsheet, route: '/import-budget' },
      { id: 'review', icon: FileText, route: '/review' },
      { id: 'settings', icon: Settings, route: '/settings' },
    ],
  },
];

const ALL_FEATURE_IDS = FEATURE_GROUPS.flatMap(g => g.features.map(f => f.id));

const WALKTHROUGHS = [
  { id: 'wt1', icon: PlusCircle, steps: 5, hasShortcut: true },
  { id: 'wt2', icon: PiggyBank, steps: 4 },
  { id: 'wt3', icon: Target, steps: 4 },
  { id: 'wt4', icon: Camera, steps: 4 },
  { id: 'wt5', icon: Home, steps: 4 },
];

const TIP_ICONS = [Keyboard, MessageSquare, Camera, FileSpreadsheet, EyeOff, RotateCcw, Bell, Moon, Zap, DollarSign];

const FAQ_GROUPS = [
  { id: 'start', questions: [1, 2, 3, 4] },
  { id: 'features', questions: [5, 6, 7, 8, 9] },
  { id: 'data', questions: [10, 11, 12, 13, 14, 15] },
];

// ─── Main Component ─────────────────────────────────────────────

export default function Guide() {
  const { t } = useTranslation();
  const location = useLocation();
  const [activeSection, setActiveSection] = useState('welcome');
  const [checklist, setChecklist] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lumet_guide_checklist')) || []; }
    catch { return []; }
  });
  const [expandedCards, setExpandedCards] = useState(new Set());
  const [openWalkthrough, setOpenWalkthrough] = useState(null);
  const [openFaq, setOpenFaq] = useState(null);
  const sectionRefs = useRef({});

  // IntersectionObserver for active section tracking
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 }
    );

    SECTION_IDS.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  // Hash navigation
  useEffect(() => {
    const hash = location.hash.replace('#', '');
    if (!hash) return;

    if (SECTION_IDS.includes(hash)) {
      setTimeout(() => {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
      return;
    }

    // Legacy feature hash support (e.g., /guide#dashboard)
    if (ALL_FEATURE_IDS.includes(hash)) {
      setExpandedCards(new Set([hash]));
      setTimeout(() => {
        document.getElementById(`feature-${hash}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [location.hash]);

  const toggleStep = useCallback((stepId) => {
    setChecklist(prev => {
      const next = prev.includes(stepId) ? prev.filter(s => s !== stepId) : [...prev, stepId];
      localStorage.setItem('lumet_guide_checklist', JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleCard = useCallback((id) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const scrollToSection = useCallback((id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div className="space-y-8">
      {/* Section nav */}
      <SectionNav
        activeSection={activeSection}
        onNavigate={scrollToSection}
        t={t}
      />

      {/* 1. Hero */}
      <section id="welcome">
        <HeroSection t={t} onGetStarted={() => scrollToSection('quickstart')} />
      </section>

      {/* 2. Quick Start */}
      <section id="quickstart">
        <QuickStartSection
          t={t}
          checklist={checklist}
          onToggle={toggleStep}
          onReset={() => { setChecklist([]); localStorage.removeItem('lumet_guide_checklist'); }}
        />
      </section>

      {/* 3. Features */}
      <section id="features">
        <FeatureCardsSection
          t={t}
          expandedCards={expandedCards}
          onToggle={toggleCard}
        />
      </section>

      {/* 4. Walkthroughs */}
      <section id="walkthroughs">
        <WalkthroughSection
          t={t}
          openWalkthrough={openWalkthrough}
          onToggle={(id) => setOpenWalkthrough(prev => prev === id ? null : id)}
        />
      </section>

      {/* 5. Tips */}
      <section id="tips">
        <TipsSection t={t} />
      </section>

      {/* 6. FAQ */}
      <section id="faq">
        <FAQSection t={t} openFaq={openFaq} setOpenFaq={setOpenFaq} />
      </section>
    </div>
  );
}

// ─── Section Nav ─────────────────────────────────────────────────

function SectionNav({ activeSection, onNavigate, t }) {
  const navLabels = {
    welcome: t('guide.navWelcome'),
    quickstart: t('guide.navQuickStart'),
    features: t('guide.navFeatures'),
    walkthroughs: t('guide.navWalkthroughs'),
    tips: t('guide.navTips'),
    faq: t('guide.navFaq'),
  };

  return (
    <div className="sticky top-0 z-20 -mx-4 md:-mx-8 px-4 md:px-8 py-2 bg-cream-100/80 dark:bg-dark-bg/80 backdrop-blur-sm border-b border-cream-200/50 dark:border-dark-border/50">
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        {SECTION_IDS.map((id) => {
          const Icon = SECTION_ICONS[id];
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                activeSection === id
                  ? 'bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300'
                  : 'text-cream-500 hover:bg-cream-200/50 dark:hover:bg-dark-card hover:text-cream-700 dark:hover:text-cream-300'
              }`}
            >
              <Icon size={13} />
              {navLabels[id]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── 1. Hero Section ─────────────────────────────────────────────

function HeroSection({ t, onGetStarted }) {
  return (
    <div className="relative overflow-hidden rounded-lg bg-accent-50 dark:bg-accent-500/5 border border-accent-200 dark:border-accent-500/15 p-6 sm:p-8 md:p-10">
      {/* Decorative circles */}
      <div className="absolute top-4 right-4 w-24 h-24 rounded-full bg-accent-200/30 dark:bg-accent-500/10" />
      <div className="absolute top-14 right-20 w-14 h-14 rounded-full bg-accent-300/25 dark:bg-accent-400/10 animate-pulse-slow" />
      <div className="absolute bottom-6 right-10 w-10 h-10 rounded-full bg-accent-400/20 dark:bg-accent-300/10" />

      <div className="relative z-10 max-w-lg">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-10 h-10 rounded-xl bg-accent-600 flex items-center justify-center">
            <svg viewBox="0 0 512 512" className="w-6 h-6" aria-hidden="true">
              <polygon points="256,80 160,280 352,280" fill="#115e59" opacity="0.9"/>
              <polygon points="200,160 104,360 296,360" fill="#5eead4" opacity="0.7"/>
              <polygon points="312,160 216,360 408,360" fill="#ffffff" opacity="0.5"/>
            </svg>
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-heading font-bold text-cream-900 dark:text-cream-100 mb-2">
          {t('guide.heroTitle')}
        </h1>
        <p className="text-sm sm:text-base text-cream-600 dark:text-cream-400 mb-6 leading-relaxed">
          {t('guide.heroSubtitle')}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button onClick={onGetStarted} className="btn-primary flex items-center gap-2">
            {t('guide.heroGetStarted')}
            <ArrowRight size={16} />
          </button>
          <span className="text-xs text-cream-500 dark:text-cream-400">
            {t('guide.heroJumpTo')}{' '}
            <button onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })} className="text-accent-600 dark:text-accent-400 hover:underline font-medium">
              {t('guide.heroJumpFeatures')}
            </button>
            {' / '}
            <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="text-accent-600 dark:text-accent-400 hover:underline font-medium">
              {t('guide.heroJumpFaq')}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── 2. Quick Start ──────────────────────────────────────────────

function QuickStartSection({ t, checklist, onToggle, onReset }) {
  const done = checklist.length;
  const total = QS_STEPS.length;
  const allDone = done >= total;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-heading font-bold text-cream-900 dark:text-cream-100">
            {t('guide.quickStartTitle')}
          </h2>
          <p className="text-xs text-cream-500 dark:text-cream-400 mt-0.5">
            {t('guide.quickStartProgress', { done, total })}
          </p>
        </div>
        {done > 0 && (
          <button onClick={onReset} className="text-xs text-cream-400 hover:text-cream-600 dark:hover:text-cream-300 transition-colors">
            {t('guide.quickStartReset')}
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-cream-200 dark:bg-dark-border rounded-full overflow-hidden">
        <div
          className="h-full bg-accent-500 rounded-full transition-all duration-500"
          style={{ width: `${(done / total) * 100}%` }}
        />
      </div>

      {allDone && (
        <div className="card bg-success/5 border-success/20 text-center py-4">
          <CheckCircle2 size={24} className="text-success mx-auto mb-1" />
          <p className="text-sm font-medium text-success">{t('guide.qsDone')}</p>
        </div>
      )}

      <div className="space-y-2">
        {QS_STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = checklist.includes(step.id);
          return (
            <div
              key={step.id}
              className={`card flex items-center gap-3 transition-all ${isDone ? 'opacity-60' : ''}`}
            >
              {/* Step number / check */}
              <button
                onClick={() => onToggle(step.id)}
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold transition-all ${
                  isDone
                    ? 'bg-accent-500 text-white'
                    : 'bg-accent-50 dark:bg-accent-500/15 text-accent-600'
                }`}
              >
                {isDone ? <Check size={14} /> : i + 1}
              </button>

              {/* Icon + text */}
              <div className="flex-1 min-w-0">
                <h3 className={`text-sm font-medium ${isDone ? 'line-through text-cream-400' : 'text-cream-900 dark:text-cream-100'}`}>
                  {t(`guide.qs${i + 1}Title`)}
                </h3>
                <p className="text-xs text-cream-500 dark:text-cream-400">
                  {t(`guide.qs${i + 1}Desc`)}
                </p>
              </div>

              {/* Go button */}
              <Link
                to={step.route}
                className="shrink-0 px-3 py-1 rounded-lg bg-cream-100 dark:bg-dark-border text-xs font-medium text-cream-600 dark:text-cream-400 hover:bg-cream-200 dark:hover:bg-cream-700 transition-colors"
              >
                {t('guide.qsGo')} <ArrowRight size={10} className="inline" />
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 3. Feature Cards ────────────────────────────────────────────

function FeatureCardsSection({ t, expandedCards, onToggle }) {
  const groupLabels = {
    core: t('guide.featureGroupCore'),
    planning: t('guide.featureGroupPlanning'),
    insights: t('guide.featureGroupInsights'),
    more: t('guide.featureGroupMore'),
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-heading font-bold text-cream-900 dark:text-cream-100">
          {t('guide.featuresTitle')}
        </h2>
        <p className="text-xs text-cream-500 dark:text-cream-400 mt-0.5">
          {t('guide.featuresSubtitle')}
        </p>
      </div>

      {FEATURE_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="section-title mb-2">{groupLabels[group.id]}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {group.features.map((feature) => (
              <FeatureCard
                key={feature.id}
                feature={feature}
                expanded={expandedCards.has(feature.id)}
                onToggle={() => onToggle(feature.id)}
                t={t}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FeatureCard({ feature, expanded, onToggle, t }) {
  const { id, icon: Icon, route } = feature;

  // Use specific title/desc keys for new features, legacy keys for existing
  const titleKey = `guide.${id}Title`;
  const descKey = `guide.${id}Desc`;

  return (
    <div
      id={`feature-${id}`}
      className="card !p-0 overflow-hidden hover:shadow-md transition-shadow"
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-9 h-9 rounded-lg bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center shrink-0">
            <Icon size={18} className="text-accent-600 dark:text-accent-400" />
          </div>
          <h3 className="text-sm font-semibold text-cream-900 dark:text-cream-100">
            {t(titleKey)}
          </h3>
        </div>
        <p className="text-xs text-cream-500 dark:text-cream-400 leading-relaxed mb-3">
          {t(descKey)}
        </p>
        <button
          onClick={onToggle}
          className="flex items-center gap-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
        >
          {expanded ? t('guide.showLess') : t('guide.learnMore')}
          <ChevronDown size={12} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expandable details */}
      <div className={`overflow-hidden transition-all duration-300 ${expanded ? 'max-h-96' : 'max-h-0'}`}>
        <div className="px-4 pb-4 border-t border-cream-100 dark:border-dark-border pt-3 space-y-2">
          {/* Bullet points */}
          {[1, 2, 3, 4].map(n => {
            const key = `guide.${id}.bullet${n}`;
            const text = t(key);
            if (!text || text === key) return null;
            return (
              <div key={n} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-400 shrink-0 mt-1.5" />
                <p className="text-xs text-cream-600 dark:text-cream-400 leading-relaxed">{text}</p>
              </div>
            );
          })}

          {/* Pro tip */}
          {(() => {
            const tipKey = `guide.${id}.proTip`;
            const tipText = t(tipKey);
            if (!tipText || tipText === tipKey) return null;
            return (
              <div className="flex items-start gap-2 mt-2 p-2 bg-warning/5 dark:bg-warning/10 border-l-2 border-warning rounded-r-lg">
                <Lightbulb size={12} className="text-warning shrink-0 mt-0.5" />
                <p className="text-[11px] text-cream-600 dark:text-cream-400 leading-relaxed">
                  <span className="font-semibold text-warning">{t('guide.proTip')}:</span>{' '}
                  {tipText}
                </p>
              </div>
            );
          })()}

          {/* Open page link */}
          <Link
            to={route}
            className="inline-flex items-center gap-1 mt-1 text-xs font-medium text-accent-600 dark:text-accent-400 hover:underline"
          >
            {t('guide.goToPage')} <ExternalLink size={10} />
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── 4. Walkthroughs ─────────────────────────────────────────────

function WalkthroughSection({ t, openWalkthrough, onToggle }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-heading font-bold text-cream-900 dark:text-cream-100">
          {t('guide.walkthroughsTitle')}
        </h2>
        <p className="text-xs text-cream-500 dark:text-cream-400 mt-0.5">
          {t('guide.walkthroughsSubtitle')}
        </p>
      </div>

      <div className="space-y-2">
        {WALKTHROUGHS.map((wt) => {
          const Icon = wt.icon;
          const isOpen = openWalkthrough === wt.id;
          return (
            <div key={wt.id} className="card !p-0 overflow-hidden">
              <button
                onClick={() => onToggle(wt.id)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cream-50 dark:hover:bg-dark-border/50 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-accent-600 dark:text-accent-400" />
                </div>
                <span className="flex-1 text-sm font-medium text-cream-900 dark:text-cream-100">
                  {t(`guide.${wt.id}Title`)}
                </span>
                <ChevronDown
                  size={16}
                  className={`text-cream-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                />
              </button>

              <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[600px]' : 'max-h-0'}`}>
                <div className="px-4 pb-4 pt-1">
                  {/* Steps with vertical line */}
                  <div className="relative pl-6 space-y-4">
                    {/* Vertical connecting line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-cream-200 dark:bg-dark-border" />

                    {Array.from({ length: wt.steps }, (_, i) => (
                      <div key={i} className="relative flex items-start gap-3">
                        {/* Step circle */}
                        <div className="absolute -left-6 w-6 h-6 rounded-full bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center text-[10px] font-bold text-accent-600 z-10 border-2 border-cream-100 dark:border-dark-card">
                          {i + 1}
                        </div>
                        <p className="text-xs text-cream-600 dark:text-cream-400 leading-relaxed pt-0.5">
                          {t(`guide.${wt.id}Step${i + 1}`)}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Pro tip */}
                  <div className="flex items-start gap-2 mt-4 p-2.5 bg-warning/5 dark:bg-warning/10 border-l-2 border-warning rounded-r-lg">
                    <Lightbulb size={12} className="text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-cream-600 dark:text-cream-400 leading-relaxed">
                      <span className="font-semibold text-warning">{t('guide.proTip')}:</span>{' '}
                      {t(`guide.${wt.id}ProTip`)}
                    </p>
                  </div>

                  {/* Keyboard shortcut */}
                  {wt.hasShortcut && (
                    <div className="flex items-center gap-2 mt-2 text-[11px] text-cream-500 dark:text-cream-400">
                      <Keyboard size={11} />
                      <span>{t(`guide.${wt.id}Shortcut`)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── 5. Tips & Tricks ────────────────────────────────────────────

function TipsSection({ t }) {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-heading font-bold text-cream-900 dark:text-cream-100">
        {t('guide.tips')}
      </h2>

      {/* Tip cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
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

      {/* Keyboard shortcuts */}
      <div className="card">
        <h3 className="text-sm font-semibold text-cream-900 dark:text-cream-100 mb-3 flex items-center gap-2">
          <Keyboard size={14} className="text-cream-400" />
          {t('guide.keyboardTitle')}
        </h3>
        <div className="space-y-2">
          {[
            { keys: ['Ctrl', 'K'], alt: ['⌘', 'K'], label: t('guide.shortcutSearch') },
            { keys: ['Esc'], label: t('guide.shortcutClose') },
          ].map((shortcut, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, j) => (
                  <span key={j}>
                    {j > 0 && <span className="text-cream-400 text-[10px] mx-0.5">+</span>}
                    <kbd className="inline-flex items-center px-1.5 py-0.5 bg-cream-200 dark:bg-dark-border rounded text-[10px] font-mono text-cream-700 dark:text-cream-300 border border-cream-300 dark:border-cream-600">
                      {key}
                    </kbd>
                  </span>
                ))}
                {shortcut.alt && (
                  <>
                    <span className="text-cream-400 text-[10px] mx-1">/</span>
                    {shortcut.alt.map((key, j) => (
                      <span key={j}>
                        {j > 0 && <span className="text-cream-400 text-[10px] mx-0.5">+</span>}
                        <kbd className="inline-flex items-center px-1.5 py-0.5 bg-cream-200 dark:bg-dark-border rounded text-[10px] font-mono text-cream-700 dark:text-cream-300 border border-cream-300 dark:border-cream-600">
                          {key}
                        </kbd>
                      </span>
                    ))}
                  </>
                )}
              </div>
              <span className="text-xs text-cream-600 dark:text-cream-400">{shortcut.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 6. FAQ ──────────────────────────────────────────────────────

function FAQSection({ t, openFaq, setOpenFaq }) {
  const groupLabels = {
    start: t('faq.groupStart'),
    features: t('faq.groupFeatures'),
    data: t('faq.groupData'),
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-heading font-bold text-cream-900 dark:text-cream-100">
        {t('guide.faq')}
      </h2>

      {FAQ_GROUPS.map((group) => (
        <div key={group.id}>
          <p className="section-title mb-2">{groupLabels[group.id]}</p>
          <div className="space-y-2">
            {group.questions.map((n) => {
              const isOpen = openFaq === n;
              return (
                <div key={n} className="card !p-0 overflow-hidden">
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
                  <div className={`overflow-hidden transition-all duration-200 ${isOpen ? 'max-h-60' : 'max-h-0'}`}>
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
        </div>
      ))}
    </div>
  );
}
