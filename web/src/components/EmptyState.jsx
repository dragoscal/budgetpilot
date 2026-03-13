export default function EmptyState({ icon: Icon, title, description, action, onAction, tip, variant = 'default' }) {
  const variantClasses = {
    default: '',
    celebration: 'bg-success/5 border border-success/20 rounded-lg p-6',
    warning: 'bg-warning/5 border border-warning/20 rounded-lg p-6',
  };

  return (
    <div className={`flex flex-col items-center justify-center py-16 text-center ${variantClasses[variant] || ''}`}>
      {Icon && (
        <div className={`w-16 h-16 rounded-lg flex items-center justify-center mb-4 ${
          variant === 'celebration' ? 'bg-success/15' :
          variant === 'warning' ? 'bg-warning/15' :
          'bg-cream-200 dark:bg-dark-border'
        }`}>
          <Icon size={28} className={
            variant === 'celebration' ? 'text-success' :
            variant === 'warning' ? 'text-warning' :
            'text-cream-500'
          } />
        </div>
      )}
      <h3 className="font-heading font-semibold text-lg mb-1">{title}</h3>
      {description && <p className="text-sm text-cream-600 dark:text-cream-500 max-w-sm">{description}</p>}
      {tip && (
        <p className="text-xs text-cream-400 mt-2 max-w-sm italic">{tip}</p>
      )}
      {action && onAction && (
        <button onClick={onAction} className="btn-primary mt-4">{action}</button>
      )}
    </div>
  );
}
