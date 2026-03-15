import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from '../contexts/LanguageContext';

export default function PageTabs({ tabs }) {
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <div className="flex gap-1 mb-5 bg-cream-100/60 dark:bg-dark-bg/80 rounded-xl p-1 overflow-x-auto scrollbar-hide">
      {tabs.map(({ to, labelKey, label, icon: Icon }) => {
        const isActive = location.pathname === to;
        return (
          <Link
            key={to}
            to={to}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap ${
              isActive
                ? 'bg-white dark:bg-dark-card shadow-sm text-cream-900 dark:text-cream-50'
                : 'text-cream-500 dark:text-cream-500 hover:text-cream-700 dark:hover:text-cream-300 hover:bg-white/40 dark:hover:bg-dark-card/40'
            }`}
          >
            {Icon && <Icon size={15} strokeWidth={isActive ? 2 : 1.5} />}
            {labelKey ? t(labelKey) : label}
          </Link>
        );
      })}
    </div>
  );
}
