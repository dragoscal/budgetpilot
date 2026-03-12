import { useState, useEffect } from 'react';
import { getCategoryById, getSubcategoryById, formatCurrency, formatDate, truncate, getDisplayAmount } from '../lib/helpers';
import { getCategoryLabel } from '../lib/categoryManager';
import { TRANSACTION_SOURCES } from '../lib/constants';
import { getById } from '../lib/storage';
import { useHideAmounts } from '../contexts/SettingsContext';
import { useTranslation } from '../contexts/LanguageContext';
import { Trash2, Edit3, Split } from 'lucide-react';

export default function TransactionRow({ transaction, onEdit, onDelete, onSplit, selected, onSelect, hide: hideProp, isSplit, defaultCurrency, rates }) {
  const { t } = useTranslation();
  const { shouldHide } = useHideAmounts();
  const [accountName, setAccountName] = useState(null);

  useEffect(() => {
    if (transaction.accountId) {
      getById('accounts', transaction.accountId)
        .then((acc) => { if (acc) setAccountName(acc.name); })
        .catch(() => {});
    }
  }, [transaction.accountId]);

  const cat = getCategoryById(transaction.category);
  const subcat = transaction.subcategory ? getSubcategoryById(transaction.subcategory) : null;
  const source = TRANSACTION_SOURCES[transaction.source] || TRANSACTION_SOURCES.manual;
  const isExpense = transaction.type === 'expense';
  const isIncome = transaction.type === 'income';
  const hide = hideProp !== undefined ? hideProp : shouldHide(transaction.type);

  const catLabel = getCategoryLabel(cat, t);
  const subcatLabel = subcat ? (t(`subcategories.${subcat.id}`) || subcat.name) : null;

  return (
    <div className="flex items-center gap-2 sm:gap-3 py-3 px-3 sm:px-4 hover:bg-cream-50 dark:hover:bg-dark-border/50 rounded-xl transition-colors group">
      {onSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(transaction.id, e.target.checked)}
          className="w-4 h-4 rounded border-cream-300 shrink-0"
        />
      )}
      <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center text-base sm:text-lg bg-cream-100 dark:bg-dark-border shrink-0">
        {subcat?.icon || cat.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-medium truncate">{transaction.merchant || transaction.description}</p>
          {source.icon ? <span className="text-xs shrink-0" title={source.label}>{source.icon}</span> : null}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-xs text-cream-500 flex-wrap">
          <span>{formatDate(transaction.date, 'dd MMM')}</span>
          <span>·</span>
          <span>{subcatLabel ? `${catLabel} > ${subcatLabel}` : catLabel}</span>
          {transaction.tags?.length > 0 && (
            <>
              <span>·</span>
              {transaction.tags.map((tag) => (
                <span key={tag} className="px-1.5 py-0.5 rounded bg-cream-200 dark:bg-dark-border text-[10px]">#{tag}</span>
              ))}
            </>
          )}
          {accountName && (
            <>
              <span>·</span>
              <span className="px-1.5 py-0.5 rounded bg-info/10 text-info text-[10px] font-medium">{accountName}</span>
            </>
          )}
        </div>
        {transaction.originalText && (
          <p className="text-[10px] text-cream-400 italic truncate">&ldquo;{transaction.originalText}&rdquo;</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-heading font-bold money ${
          isIncome ? 'text-income' : isExpense ? 'text-danger' : 'text-info'
        }`}>
          {isIncome ? '+' : isExpense ? '-' : ''}{formatCurrency(transaction.amount, transaction.currency, { hide })}
        </p>
        {!hide && defaultCurrency && rates && transaction.currency && transaction.currency !== defaultCurrency && (() => {
          const display = getDisplayAmount(transaction.amount, transaction.currency, defaultCurrency, rates);
          return display.converted ? (
            <p className="text-[10px] text-cream-400">({display.converted})</p>
          ) : null;
        })()}
        {isSplit && (
          <span className="text-[10px] text-accent font-medium flex items-center justify-end gap-0.5">
            <Split size={8} /> {t('split.split')}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5 sm:gap-1 opacity-30 active:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
        {onSplit && !isSplit && (
          <button onClick={() => onSplit(transaction)} className="p-1 sm:p-1.5 rounded-lg hover:bg-accent/10 text-cream-500 hover:text-accent" title={t('split.splitWithFamily')}>
            <Split size={13} />
          </button>
        )}
        {onEdit && (
          <button onClick={() => onEdit(transaction)} className="p-1 sm:p-1.5 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-500 hover:text-cream-700">
            <Edit3 size={13} />
          </button>
        )}
        {onDelete && (
          <button onClick={() => onDelete(transaction)} className="p-1 sm:p-1.5 rounded-lg hover:bg-danger/10 text-cream-500 hover:text-danger">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
