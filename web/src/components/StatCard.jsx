import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function StatCard({ label, value, trend, icon: Icon, className = '' }) {
  return (
    <div className={`card ${className}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-cream-600 dark:text-cream-500 uppercase tracking-wide">{label}</p>
        {Icon && <Icon size={16} className="text-cream-400" />}
      </div>
      <p className="text-2xl font-heading font-bold money">{value}</p>
      {trend && (
        <div className="flex items-center gap-1 mt-1.5">
          {trend.direction === 'up' ? (
            <TrendingUp size={12} className="text-danger" />
          ) : trend.direction === 'down' ? (
            <TrendingDown size={12} className="text-success" />
          ) : (
            <Minus size={12} className="text-cream-400" />
          )}
          <span className={`text-xs font-medium ${
            trend.direction === 'up' ? 'text-danger' : trend.direction === 'down' ? 'text-success' : 'text-cream-500'
          }`}>
            {trend.percent}% vs last month
          </span>
        </div>
      )}
    </div>
  );
}
