import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

export default function StatCard({ label, value, trend, icon: Icon, className = '', hide, accent, compact }) {
  const { t } = useTranslation();
  return (
    <div className={`card relative overflow-hidden h-full flex flex-col ${compact ? '!p-2.5 sm:!p-3 md:!p-5' : ''} ${className}`}>
      <div className={`flex items-center gap-1.5 sm:gap-2 ${compact ? 'mb-1.5 sm:mb-2 md:mb-3' : 'mb-3'}`}>
        {Icon && (
          <Icon
            size={compact ? 14 : 16}
            strokeWidth={1.5}
            style={{ color: accent || undefined }}
            className={accent ? 'shrink-0' : 'text-cream-500 dark:text-cream-400 shrink-0'}
          />
        )}
        <p className={`${compact ? 'text-[9px] sm:text-[10px] md:text-[11px] leading-tight' : 'text-[11px]'} font-semibold text-cream-500 dark:text-cream-400 uppercase tracking-[0.06em]`}>{label}</p>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <p className={`${compact ? 'text-[14px] sm:text-[17px] md:text-[22px]' : 'text-[22px]'} stat-value leading-tight truncate`}>{hide ? '••••••' : value}</p>

        {trend && !hide ? (
          <div className="flex items-center gap-1.5 mt-1.5 md:mt-2">
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] md:text-[11px] font-semibold ${
              trend.direction === 'up' ? 'bg-danger-light text-danger' :
              trend.direction === 'down' ? 'bg-success-light text-success' :
              'bg-cream-100 dark:bg-cream-800 text-cream-500'
            }`}>
              {trend.direction === 'up' ? <TrendingUp size={11} /> :
               trend.direction === 'down' ? <TrendingDown size={11} /> :
               <Minus size={11} />}
              {Number.isFinite(trend.percent) ? trend.percent : 0}%
            </div>
            <span className="text-[10px] md:text-[11px] text-cream-400 hidden sm:inline">{t('common.vsLastMonth')}</span>
          </div>
        ) : (
          <div className="mt-1.5 md:mt-2" />
        )}
      </div>
    </div>
  );
}
