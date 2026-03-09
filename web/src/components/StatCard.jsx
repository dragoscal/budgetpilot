import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({ label, value, trend, icon: Icon, className = '', hide, accent }) {
  return (
    <div className={`card relative overflow-hidden ${className}`}>
      {accent && (
        <div
          className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: `linear-gradient(90deg, ${accent}, ${accent}44)` }}
        />
      )}

      <div className="flex items-center gap-2 mb-3">
        {Icon && (
          <div className="w-8 h-8 rounded-lg bg-cream-100 dark:bg-cream-800 flex items-center justify-center">
            <Icon size={15} className="text-cream-500 dark:text-cream-400" />
          </div>
        )}
        <p className="text-[11px] font-bold text-cream-500 dark:text-cream-400 uppercase tracking-wider">{label}</p>
      </div>

      <p className="text-[22px] font-heading font-bold money leading-tight">{hide ? '••••••' : value}</p>

      {trend && !hide && (
        <div className="flex items-center gap-1.5 mt-2">
          <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${
            trend.direction === 'up' ? 'bg-danger/8 text-danger' :
            trend.direction === 'down' ? 'bg-success/8 text-success' :
            'bg-cream-100 dark:bg-cream-800 text-cream-500'
          }`}>
            {trend.direction === 'up' ? <TrendingUp size={11} /> :
             trend.direction === 'down' ? <TrendingDown size={11} /> :
             <Minus size={11} />}
            {trend.percent}%
          </div>
          <span className="text-[11px] text-cream-400">vs last month</span>
        </div>
      )}
    </div>
  );
}
