import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import {
  LayoutDashboard, PlusCircle, Receipt, PiggyBank, Target, RotateCcw,
  Calendar, TrendingUp, Landmark, BarChart3, Users, Star, FileText,
  Settings, LogOut, ChevronLeft, ChevronRight, Moon, Sun, Wallet,
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

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden md:flex flex-col fixed left-0 top-0 h-full bg-white dark:bg-dark-card border-r border-cream-300 dark:border-dark-border z-40 transition-all duration-200 ${
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 border-b border-cream-200 dark:border-dark-border shrink-0">
          <div className="w-8 h-8 bg-success rounded-lg flex items-center justify-center shrink-0">
            <Wallet className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <span className="font-heading font-bold text-lg">BudgetPilot</span>
          )}
        </div>

        {/* User */}
        {!collapsed && user && (
          <div className="px-4 py-3 border-b border-cream-200 dark:border-dark-border shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-cream-200 dark:bg-dark-border flex items-center justify-center text-sm font-semibold">
                {user.avatar || user.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-cream-500 truncate">{user.email}</p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_SECTIONS.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="px-2 mb-1 text-[10px] font-semibold text-cream-500 uppercase tracking-widest">
                  {section.label}
                </p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                        isActive
                          ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900 font-medium'
                          : 'text-cream-700 dark:text-cream-500 hover:bg-cream-200 dark:hover:bg-dark-border'
                      } ${collapsed ? 'justify-center px-2' : ''}`
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon size={18} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom controls */}
        <div className="border-t border-cream-200 dark:border-dark-border px-2 py-2 space-y-0.5 shrink-0">
          <button
            onClick={toggleTheme}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-cream-700 dark:text-cream-500 hover:bg-cream-200 dark:hover:bg-dark-border w-full transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
            title={dark ? 'Light mode' : 'Dark mode'}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
            {!collapsed && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-colors ${
                isActive
                  ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900 font-medium'
                  : 'text-cream-700 dark:text-cream-500 hover:bg-cream-200 dark:hover:bg-dark-border'
              } ${collapsed ? 'justify-center px-2' : ''}`
            }
          >
            <Settings size={18} className="shrink-0" />
            {!collapsed && <span>Settings</span>}
          </NavLink>

          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-danger hover:bg-danger/10 w-full transition-colors ${collapsed ? 'justify-center px-2' : ''}`}
          >
            <LogOut size={18} />
            {!collapsed && <span>Sign out</span>}
          </button>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center justify-center w-full py-1.5 text-cream-500 hover:text-cream-700 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {!collapsed && (
            <p className="text-center text-[10px] text-cream-400 pb-1">v1.0.0</p>
          )}
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-dark-card border-t border-cream-300 dark:border-dark-border z-40 flex items-center justify-around px-2 py-1 safe-bottom">
        {[
          { to: '/', icon: LayoutDashboard, label: 'Home' },
          { to: '/transactions', icon: Receipt, label: 'History' },
          { to: '/add', icon: PlusCircle, label: 'Add' },
          { to: '/budgets', icon: PiggyBank, label: 'Budgets' },
          { to: '/settings', icon: Settings, label: 'More' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[10px] min-w-[56px] transition-colors ${
                isActive
                  ? 'text-cream-900 dark:text-cream-100 font-medium'
                  : 'text-cream-500'
              }`
            }
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
