import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import SyncIndicator from './SyncIndicator';
import {
  LayoutDashboard, PlusCircle, Receipt, PiggyBank, Target, RotateCcw,
  Calendar, TrendingUp, Landmark, BarChart3, Users, Star, FileText,
  Settings, LogOut, ChevronLeft, ChevronRight, Moon, Sun, Wallet, Shield,
} from 'lucide-react';

const NAV_SECTIONS = [
  {
    label: 'Main',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/add', icon: PlusCircle, label: 'Add Transaction' },
      { to: '/transactions', icon: Receipt, label: 'Transactions' },
    ],
  },
  {
    label: 'Planning',
    items: [
      { to: '/budgets', icon: PiggyBank, label: 'Budgets' },
      { to: '/goals', icon: Target, label: 'Goals' },
      { to: '/recurring', icon: RotateCcw, label: 'Recurring' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/calendar', icon: Calendar, label: 'Calendar' },
      { to: '/cashflow', icon: TrendingUp, label: 'Cash Flow' },
      { to: '/networth', icon: Landmark, label: 'Net Worth' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    label: 'More',
    items: [
      { to: '/people', icon: Users, label: 'People & Debts' },
      { to: '/wishlist', icon: Star, label: 'Wishlist' },
      { to: '/review', icon: FileText, label: 'Monthly Review' },
    ],
  },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navLinkClass = ({ isActive }) =>
    `flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors duration-100 ${
      isActive
        ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
        : 'text-cream-600 dark:text-cream-400 hover:bg-cream-100 dark:hover:bg-cream-800/50 hover:text-cream-800 dark:hover:text-cream-200'
    } ${collapsed ? 'justify-center px-2' : ''}`;

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col fixed left-0 top-0 h-full bg-white dark:bg-dark-card border-r border-cream-200 dark:border-dark-border z-40 transition-all duration-200 ${
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-4 h-14 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-accent-600">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-heading font-bold text-[15px] tracking-tight">BudgetPilot</span>
          )}
        </div>

        {/* User */}
        {!collapsed && user && (
          <div className="px-3 pb-2 shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cream-50 dark:bg-cream-800/30">
              <div className="w-7 h-7 rounded-full bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 flex items-center justify-center text-xs font-bold shrink-0">
                {user.avatar || user.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-medium truncate leading-tight">{user.name}</p>
                <p className="text-[10px] text-cream-400 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-1 px-3 space-y-3">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-cream-400 dark:text-cream-600 uppercase tracking-widest">
                  {section.label}
                </p>
              )}
              <div className="space-y-px">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={navLinkClass}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={16} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="border-t border-cream-200 dark:border-dark-border px-3 py-2 space-y-px shrink-0">
          <SyncIndicator collapsed={collapsed} />

          <button
            onClick={toggleTheme}
            className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-cream-600 dark:text-cream-400 hover:bg-cream-100 dark:hover:bg-cream-800/50 w-full transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <Sun size={16} /> : <Moon size={16} />}
            {!collapsed && <span>{dark ? 'Light' : 'Dark'}</span>}
          </button>

          {user?.role === 'admin' && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors duration-100 ${
                  isActive
                    ? 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300'
                    : 'text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20'
                } ${collapsed ? 'justify-center px-2' : ''}`
              }
              title={collapsed ? 'Admin' : undefined}
            >
              <Shield size={16} className="shrink-0" />
              {!collapsed && <span>Admin</span>}
            </NavLink>
          )}

          <NavLink to="/settings" className={navLinkClass}>
            <Settings size={16} className="shrink-0" />
            {!collapsed && <span>Settings</span>}
          </NavLink>

          <button
            onClick={handleLogout}
            className={`flex items-center gap-2.5 px-3 py-[7px] rounded-lg text-[13px] font-medium text-danger hover:bg-danger/8 w-full transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
          >
            <LogOut size={16} />
            {!collapsed && <span>Sign out</span>}
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-1 text-cream-400 hover:text-cream-600 dark:hover:text-cream-300 transition-colors"
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/90 dark:bg-dark-card/90 backdrop-blur-lg border-t border-cream-200 dark:border-dark-border z-40 flex items-center justify-around px-1 py-1 safe-bottom">
        {[
          { to: '/', icon: LayoutDashboard, label: 'Home' },
          { to: '/transactions', icon: Receipt, label: 'History' },
          { to: '/add', icon: PlusCircle, label: 'Add', special: true },
          { to: '/budgets', icon: PiggyBank, label: 'Budgets' },
          { to: '/settings', icon: Settings, label: 'More' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] font-medium min-w-[52px] transition-colors ${
                isActive
                  ? 'text-accent-600 dark:text-accent-400'
                  : 'text-cream-400'
              }`
            }
          >
            {item.special ? (
              <div className="w-10 h-10 -mt-4 rounded-full bg-accent-600 flex items-center justify-center shadow-lg">
                <item.icon size={20} className="text-white" />
              </div>
            ) : (
              <item.icon size={20} />
            )}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
