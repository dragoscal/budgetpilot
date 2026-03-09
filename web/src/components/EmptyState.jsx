export default function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && (
        <div className="w-16 h-16 bg-cream-200 dark:bg-dark-border rounded-2xl flex items-center justify-center mb-4">
          <Icon size={28} className="text-cream-500" />
        </div>
      )}
      <h3 className="font-heading font-semibold text-lg mb-1">{title}</h3>
      {description && <p className="text-sm text-cream-600 dark:text-cream-500 max-w-sm">{description}</p>}
      {action && onAction && (
        <button onClick={onAction} className="btn-primary mt-4">{action}</button>
      )}
    </div>
  );
}
