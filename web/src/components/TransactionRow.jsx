import { getCategoryById, formatCurrency, formatDate, truncate } from '../lib/helpers';
import { TRANSACTION_SOURCES } from '../lib/constants';
import { Trash2, Edit3 } from 'lucide-react';

export default function TransactionRow({ transaction, onEdit, onDelete, selected, onSelect }) {
  const cat = getCategoryById(transaction.category);
  const source = TRANSACTION_SOURCES[transaction.source] || TRANSACTION_SOURCES.manual;
  const isExpense = transaction.type === 'expense';
  const isIncome = transaction.type === 'income';

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-cream-50 dark:hover:bg-dark-border/50 rounded-xl transition-colors group">
      {onSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(transaction.id, e.target.checked)}
          className="w-4 h-4 rounded border-cream-300"
        />
      )}
      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-cream-100 dark:bg-dark-border shrink-0">
        {cat.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{truncate(transaction.merchant || transaction.description, 28)}</p>
          <span className="text-xs" title={source.label}>{source.icon}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-cream-500">
          <span>{cat.name}</span>
          <span>·</span>
          <span>{formatDate(transaction.date, 'dd MMM')}</span>
          {transaction.tags?.length > 0 && (
            <>
              <span>·</span>
              {transaction.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-cream-200 dark:bg-dark-border text-[10px]">#{tag}</span>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-heading font-bold money ${
          isIncome ? 'text-income' : isExpense ? 'text-danger' : 'text-info'
        }`}>
          {isIncome ? '+' : isExpense ? '-' : ''}{formatCurrency(transaction.amount, transaction.currency)}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {onEdit && (
          <button onClick={() => onEdit(transaction)} className="p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 hover:text-cream-700">
            <Edit3 size={14} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(transaction)} className="p-1.5 rounded-lg hover:bg-danger/10 text-cream-500 hover:text-danger">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
