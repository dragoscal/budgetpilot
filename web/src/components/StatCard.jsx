import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useTranslation } from '../contexts/LanguageContext';

export default function StatCard({ label, value, trend, icon: Icon, className = '', hide, accent, compact }) {
  const { t } = useTranslation();
  return (
    <div className={`card-elevated relative overflow-hidden h-full flex flex-col ${compact ? '!p-2.5 sm:!p-3 md:!p-5' : ''} ${className}`}>
      {accent && (
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, ${accent}, ${accent}66)` }}
        />
      )}

      <div className={`flex items-center gap-1.5 sm:gap-2 ${compact ? 'mb-1.5 sm:mb-2 md:mb-3' : 'mb-3'}`}>
        {Icon && (
          <div
            className={`${compact ? 'w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8' : 'w-8 h-8'} rounded-lg flex items-center justify-center shrink-0`}
            style={{ background: accent ? `${accent}12` : undefined }}
          >
            <Icon size={compact ? 11 : 15} style={{ color: accent || undefined }} className={accent ? '' : 'text-cream-500 dark:text-cream-400'} />
          </div>
        )}
        <p className={`${compact ? 'text-[9px] sm:text-[10px] md:text-[11px] leading-tight' : 'text-[11px]'} font-bold text-cream-500 dark:text-cream-400 uppercase tracking-wider`}>{label}</p>
      </div>

      <div className="flex-1 flex flex-col justify-between">
        <p className={`${compact ? 'text-[14px] sm:text-[17px] md:text-[22px]' : 'text-[22px]'} font-heading font-bold stat-value leading-tight truncate`}>{hide ? '••••••' : value}</p>

        {trend && !hide ? (
          <div className="flex items-center gap-1.5 mt-1.5 md:mt-2">
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] md:text-[11px] font-semibold ${
              trend.direction === 'up' ? 'bg-danger/8 text-danger' :
              trend.direction === 'down' ? 'bg-success/8 text-success' :
              'bg-cream-100 dark:bg-cream-800 text-cream-500'
            }`}>
              {trend.direction === 'up' ? <TrendingUp size={11} /> :
               trend.direction === 'down' ? <TrendingDown size={11} /> :
               <Minus size={11} />}
              {trend.percent}%
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
