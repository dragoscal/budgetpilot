import { useState, useEffect, useMemo } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTranslation } from '../contexts/LanguageContext';
import SyncIndicator from './SyncIndicator';
import { useSync } from '../contexts/SyncContext';
import {
  LayoutDashboard, PlusCircle, Receipt, PiggyBank, Target, RotateCcw,
  Calendar, TrendingUp, Landmark, BarChart3, Users, Star, FileText,
  Settings, LogOut, ChevronLeft, ChevronRight, Moon, Sun, Shield,
  Building2, Menu, X, MessageSquare, Heart, ClipboardList, Trophy, Camera, Home, HelpCircle, FileSpreadsheet,
} from 'lucide-react';
import FamilyPicker from './FamilyPicker';
import NotificationCenter from './NotificationCenter';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('bp_sidebarCollapsed') === 'true');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const { pendingChanges, syncing, error: syncError, hasBackend } = useSync();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  const NAV_SECTIONS = useMemo(() => [
    {
      label: t('nav.main'),
      items: [
        { to: '/', icon: LayoutDashboard, label: t('nav.dashboard') },
        { to: '/add', icon: PlusCircle, label: t('nav.addTransaction') },
        { to: '/transactions', icon: Receipt, label: t('nav.transactions') },
      ],
    },
    {
      label: t('nav.planning'),
      items: [
        { to: '/budgets', icon: PiggyBank, label: t('nav.budgets') },
        { to: '/goals', icon: Target, label: t('nav.goals') },
        { to: '/recurring', icon: RotateCcw, label: t('nav.recurring') },
        { to: '/loans', icon: Building2, label: t('nav.loans') },
      ],
    },
    {
      label: t('nav.insights'),
      items: [
        { to: '/calendar', icon: Calendar, label: t('nav.calendar') },
        { to: '/cashflow', icon: TrendingUp, label: t('nav.cashflow') },
        { to: '/networth', icon: Landmark, label: t('nav.networth') },
        { to: '/analytics', icon: BarChart3, label: t('nav.analytics') },
        { to: '/reports', icon: ClipboardList, label: t('nav.reports') },
      ],
    },
    {
      label: t('nav.more'),
      items: [
        { to: '/family', icon: Home, label: t('nav.household') },
        { to: '/people', icon: Users, label: t('nav.people') },
        { to: '/wishlist', icon: Star, label: t('nav.wishlist') },
        { to: '/challenges', icon: Trophy, label: t('nav.challenges') },
        { to: '/receipts', icon: Camera, label: t('nav.receipts') },
        { to: '/import-budget', icon: FileSpreadsheet, label: t('nav.importBudget') },
        { to: '/review', icon: FileText, label: t('nav.review') },
      ],
    },
  ], [t]);

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [mobileMenuOpen]);

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('bp_sidebarCollapsed', String(next));
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-2 py-[7px] rounded-lg text-[13px] font-medium transition-colors duration-150 ${
      isActive
        ? 'bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400 font-semibold'
        : 'text-cream-600 dark:text-cream-400 hover:bg-cream-100 dark:hover:bg-cream-800/50 hover:text-cream-800 dark:hover:text-cream-200'
    } ${collapsed ? 'justify-center px-2' : ''}`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        role="navigation"
        aria-label={t('nav.mainNavigation') || 'Main navigation'}
        className={`hidden md:flex flex-col fixed left-0 top-0 h-full bg-white dark:bg-dark-card border-r border-cream-200 dark:border-dark-border z-40 transition-all duration-200 ${
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        }`}
      >
        {/* Logo — clean wordmark */}
        <div className="flex items-center gap-2.5 px-4 h-14 shrink-0">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-accent-600 dark:bg-accent-500">
            <span className="text-white font-bold text-[13px] leading-none">L</span>
          </div>
          {!collapsed && (
            <span className="font-body font-bold text-[15px] tracking-[-0.01em] text-cream-900 dark:text-cream-50">LUMET</span>
          )}
        </div>

        {/* User — minimal */}
        {!collapsed && user && (
          <div className="px-4 pb-2 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 flex items-center justify-center text-xs font-bold shrink-0">
                {user.avatar || user.name?.charAt(0)?.toUpperCase()}
              </div>
              <p className="text-[13px] font-semibold truncate text-cream-900 dark:text-cream-50">{user.name}</p>
            </div>
          </div>
        )}

        {/* Notification bell — prominent, separate row */}
        <div className={`px-3 pb-1 shrink-0 ${collapsed ? 'flex justify-center px-2' : ''}`}>
          <NotificationCenter collapsed={collapsed} />
        </div>

        {/* Family picker */}
        <FamilyPicker collapsed={collapsed} />

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-1 px-2 space-y-3">
          {NAV_SECTIONS.map((section, idx) => (
            <div key={section.label}>
              {!collapsed && (
                <p className={`px-2 mb-1 text-[11px] font-semibold text-cream-400 dark:text-cream-500 uppercase tracking-[0.06em] ${idx > 0 ? 'mt-1' : ''}`}>
                  {section.label}
                </p>
              )}
              {collapsed && idx > 0 && <div className="h-px bg-cream-200 dark:bg-cream-800 mx-1 my-1" />}
              <div className="space-y-px">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={navLinkClass}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={18} strokeWidth={1.5} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="px-2 py-2 space-y-px shrink-0 border-t border-cream-200 dark:border-cream-800">
          <SyncIndicator collapsed={collapsed} />

          <button
            onClick={toggleTheme}
            aria-label={dark ? t('nav.lightMode') : t('nav.darkMode')}
            className={`flex items-center gap-2.5 px-2 py-[7px] rounded-lg text-[13px] font-medium text-cream-500 dark:text-cream-400 hover:bg-cream-100 dark:hover:bg-cream-800/50 hover:text-cream-800 dark:hover:text-cream-200 w-full transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
            title={dark ? t('nav.lightMode') : t('nav.darkMode')}
          >
            {dark ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
            {!collapsed && <span>{dark ? t('nav.light') : t('nav.dark')}</span>}
          </button>

          {user?.role === 'admin' && (
            <NavLink to="/admin" className={navLinkClass} title={collapsed ? t('nav.admin') : undefined}>
              <Shield size={18} strokeWidth={1.5} className="shrink-0" />
              {!collapsed && <span>{t('nav.admin')}</span>}
            </NavLink>
          )}

          <NavLink to="/feedback" className={navLinkClass} title={collapsed ? t('nav.feedback') : undefined}>
            <MessageSquare size={18} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span>{t('nav.feedback')}</span>}
          </NavLink>

          <NavLink to="/guide" className={navLinkClass} title={collapsed ? t('nav.guide') : undefined}>
            <HelpCircle size={18} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span>{t('nav.guide')}</span>}
          </NavLink>

          <NavLink to="/settings" className={navLinkClass}>
            <Settings size={18} strokeWidth={1.5} className="shrink-0" />
            {!collapsed && <span>{t('nav.settings')}</span>}
          </NavLink>

          <button
            onClick={handleLogout}
            aria-label={t('nav.signOut')}
            className={`flex items-center gap-2.5 px-2 py-[7px] rounded-lg text-[13px] font-medium text-danger hover:bg-danger-light w-full transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
          >
            <LogOut size={18} strokeWidth={1.5} />
            {!collapsed && <span>{t('nav.signOut')}</span>}
          </button>

          <button
            onClick={toggleCollapsed}
            aria-label={collapsed ? (t('nav.expandSidebar') || 'Expand sidebar') : (t('nav.collapseSidebar') || 'Collapse sidebar')}
            className="flex items-center justify-center w-full py-1.5 mt-1 text-cream-400 hover:text-cream-600 dark:hover:text-cream-300 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>

      {/* Mobile slide-up menu */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('nav.menu') || 'Menu'}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileMenuOpen(false)} />

          {/* Panel */}
          <nav aria-label={t('nav.mobileNavigation') || 'Mobile navigation'} className="absolute bottom-0 left-0 right-0 bg-white dark:bg-dark-card rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up safe-bottom">
            {/* Handle + close */}
            <div className="sticky top-0 bg-white dark:bg-dark-card z-10 pt-3 pb-2 px-4 border-b border-cream-200 dark:border-cream-800">
              <div className="w-8 h-1 bg-cream-300 dark:bg-cream-700 rounded-full mx-auto mb-3" />
              <div className="flex items-center justify-between">
                <span className="text-sm font-body font-bold">{t('nav.menu')}</span>
                <button onClick={() => setMobileMenuOpen(false)} aria-label={t('nav.closeMenu') || 'Close menu'} className="p-1.5 rounded-lg hover:bg-cream-100 dark:hover:bg-cream-800/50">
                  <X size={18} className="text-cream-500" />
                </button>
              </div>
            </div>

            {/* Nav sections */}
            <div className="px-3 py-2 space-y-3">
              {NAV_SECTIONS.map((section) => (
                <div key={section.label}>
                  <p className="px-3 mb-1 text-[11px] font-semibold text-cream-400 dark:text-cream-500 uppercase tracking-[0.06em]">
                    {section.label}
                  </p>
                  <div className="space-y-px">
                    {section.items.map((item) => {
                      const isActive = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/'}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                            isActive
                              ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                              : 'text-cream-600 dark:text-cream-400'
                          }`}
                        >
                          <item.icon size={18} className="shrink-0" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Extras */}
              <div>
                <p className="px-3 mb-1 text-[11px] font-semibold text-cream-400 dark:text-cream-500 uppercase tracking-[0.06em]">
                  {t('nav.settings')}
                </p>
                <div className="space-y-px">
                  <NotificationCenter mobile />

                  <NavLink
                    to="/feedback"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      location.pathname === '/feedback'
                        ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                        : 'text-cream-600 dark:text-cream-400'
                    }`}
                  >
                    <MessageSquare size={18} className="shrink-0" />
                    <span>{t('nav.feedback')}</span>
                  </NavLink>
                  <NavLink
                    to="/guide"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      location.pathname === '/guide'
                        ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                        : 'text-cream-600 dark:text-cream-400'
                    }`}
                  >
                    <HelpCircle size={18} className="shrink-0" />
                    <span>{t('nav.guide')}</span>
                  </NavLink>
                  <NavLink
                    to="/settings"
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                      location.pathname === '/settings'
                        ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                        : 'text-cream-600 dark:text-cream-400'
                    }`}
                  >
                    <Settings size={18} className="shrink-0" />
                    <span>{t('nav.settings')}</span>
                  </NavLink>
                  {user?.role === 'admin' && (
                    <NavLink
                      to="/admin"
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
                        location.pathname === '/admin'
                          ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                          : 'text-accent-600 dark:text-accent-400'
                      }`}
                    >
                      <Shield size={18} className="shrink-0" />
                      <span>{t('nav.adminPanel')}</span>
                    </NavLink>
                  )}
                  <button
                    onClick={toggleTheme}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-cream-600 dark:text-cream-400 w-full"
                  >
                    {dark ? <Sun size={18} /> : <Moon size={18} />}
                    <span>{dark ? t('nav.lightMode') : t('nav.darkMode')}</span>
                  </button>
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-danger w-full"
                  >
                    <LogOut size={18} />
                    <span>{t('nav.signOut')}</span>
                  </button>
                </div>
              </div>
            </div>
            <div className="h-4" />
          </nav>
        </div>
      )}

      {/* Mobile bottom tab bar */}
      <nav aria-label={t('nav.tabBar') || 'Tab bar'} className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-dark-card/95 backdrop-blur-xl border-t border-cream-200 dark:border-cream-800 z-40 flex items-center justify-around px-0.5 py-1.5" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}>
        {[
          { to: '/', icon: LayoutDashboard, label: t('nav.home') },
          { to: '/transactions', icon: Receipt, label: t('nav.history') },
          { to: '/add', icon: PlusCircle, label: t('nav.add'), special: true },
          { to: '/budgets', icon: PiggyBank, label: t('nav.budgets') },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={() => navigator.vibrate?.(10)}
            className={({ isActive }) =>
              `relative flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl text-[10px] font-medium flex-1 min-w-0 transition-colors ${
                isActive
                  ? 'text-accent-600 dark:text-accent-400'
                  : 'text-cream-400 dark:text-cream-500'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {item.special ? (
                  <div className="w-11 h-11 -mt-5 rounded-full bg-accent-600 dark:bg-accent-500 flex items-center justify-center">
                    <item.icon size={20} strokeWidth={1.5} className="text-white" />
                  </div>
                ) : (
                  <item.icon size={20} strokeWidth={isActive ? 2 : 1.5} />
                )}
                <span className="truncate max-w-full">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
        {/* More button — opens slide-up menu */}
        <button
          onClick={() => { navigator.vibrate?.(10); setMobileMenuOpen(true); }}
          aria-label={t('nav.openMenu') || 'Open menu'}
          aria-expanded={mobileMenuOpen}
          className={`relative flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-xl text-[10px] font-medium flex-1 min-w-0 transition-colors ${
            mobileMenuOpen ? 'text-accent-600 dark:text-accent-400' : 'text-cream-400 dark:text-cream-500'
          }`}
        >
          <Menu size={20} strokeWidth={1.5} />
          <span className="truncate max-w-full">{t('nav.more')}</span>
          {/* Sync indicator dot */}
          {hasBackend && (syncing || pendingChanges > 0 || syncError) && (
            <span className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
              syncError ? 'bg-warning' : syncing ? 'bg-accent-500 animate-pulse' : 'bg-accent-500'
            }`} />
          )}
        </button>
      </nav>
    </>
  );
}
