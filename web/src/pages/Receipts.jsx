import { useState, useEffect, useMemo } from 'react';
import { getAll } from '../lib/storage';
import { transactions as txApi } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import { formatCurrency, formatDate, getCategoryById } from '../lib/helpers';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import { SkeletonPage } from '../components/LoadingSkeleton';
import { Camera, Search, X, Receipt, ExternalLink, Calendar, Tag } from 'lucide-react';

export default function ReceiptGallery() {
  const { effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [dateFilter, setDateFilter] = useState('all');

  useEffect(() => { loadData(); }, [effectiveUserId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rcpts, tx] = await Promise.all([
        getAll('receipts'),
        txApi.getAll({ userId: effectiveUserId }),
      ]);
      // Sort newest first
      rcpts.sort((a, b) => (b.processedAt || b.createdAt || '').localeCompare(a.processedAt || a.createdAt || ''));
      setReceipts(rcpts);
      setTransactions(tx);
    } catch { toast.error(t('receipts.failedLoad')); }
    finally { setLoading(false); }
  };

  // Filter receipts
  const filtered = useMemo(() => {
    let list = receipts;

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const cutoff = new Date();
      if (dateFilter === '7d') cutoff.setDate(now.getDate() - 7);
      else if (dateFilter === '30d') cutoff.setDate(now.getDate() - 30);
      else if (dateFilter === '90d') cutoff.setDate(now.getDate() - 90);
      list = list.filter(r => new Date(r.processedAt || r.createdAt) >= cutoff);
    }

    // Search filter (searches OCR text, merchant, items)
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r => {
        const text = JSON.stringify(r).toLowerCase();
        return text.includes(q);
      });
    }

    return list;
  }, [receipts, search, dateFilter]);

  // Link receipt to transaction
  const getLinkedTransaction = (receipt) => {
    if (!receipt.transactionId) return null;
    return transactions.find(t => t.id === receipt.transactionId);
  };

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="page-title mb-0">{t('receipts.gallery')}</h1>
        <span className="text-sm text-cream-500">{receipts.length} {receipts.length !== 1 ? t('receipts.receipts') : t('receipts.receipt')}</span>
      </div>

      {/* Search & filters */}
      {receipts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-cream-400" />
            <input
              className="input pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('receipts.searchPlaceholder')}
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-cream-400 hover:text-cream-600">
                <X size={14} />
              </button>
            )}
          </div>
          <div className="flex rounded-xl border border-cream-300 dark:border-dark-border overflow-hidden">
            {[
              { id: 'all', label: t('common.all') },
              { id: '7d', label: '7d' },
              { id: '30d', label: '30d' },
              { id: '90d', label: '90d' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setDateFilter(f.id)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  dateFilter === f.id
                    ? 'bg-cream-900 text-white dark:bg-cream-100 dark:text-cream-900'
                    : 'text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gallery grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((receipt) => {
            const linked = getLinkedTransaction(receipt);
            const merchant = receipt.merchant || receipt.receipt?.store || receipt.result?.merchant || 'Unknown';
            const total = receipt.total ?? receipt.receipt?.total ?? receipt.result?.total;
            const currency = receipt.currency || receipt.receipt?.currency || receipt.result?.currency || 'RON';
            const date = receipt.processedAt || receipt.createdAt;
            const hasImage = receipt.imageData && receipt.imageData.length > 300;

            return (
              <button
                key={receipt.id}
                onClick={() => setSelected(receipt)}
                className="card p-0 overflow-hidden text-left hover:ring-2 hover:ring-accent-500/30 transition-all group"
              >
                {/* Image or placeholder */}
                <div className="aspect-[3/4] bg-cream-100 dark:bg-dark-border relative overflow-hidden">
                  {hasImage ? (
                    <img
                      src={receipt.thumbnail || `data:${receipt.mediaType || 'image/jpeg'};base64,${receipt.imageData}`}
                      alt="Receipt"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Receipt size={32} className="text-cream-400" />
                    </div>
                  )}
                  {linked && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-success/90 flex items-center justify-center">
                      <ExternalLink size={10} className="text-white" />
                    </div>
                  )}
                </div>
                {/* Details */}
                <div className="p-2.5">
                  <p className="text-xs font-medium truncate">{merchant}</p>
                  <div className="flex items-center justify-between mt-0.5">
                    {total != null && (
                      <span className="text-xs font-heading font-bold money">{formatCurrency(total, currency)}</span>
                    )}
                    {date && (
                      <span className="text-[10px] text-cream-400">{formatDate(date, 'dd MMM')}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : receipts.length > 0 ? (
        <div className="text-center py-12">
          <Search size={32} className="mx-auto text-cream-300 mb-3" />
          <p className="text-sm text-cream-500">{t('receipts.noSearchResults')}</p>
        </div>
      ) : (
        <EmptyState
          icon={Camera}
          title={t('receipts.noReceipts')}
          description={t('receipts.noReceiptsDesc')}
        />
      )}

      {/* Detail modal */}
      <Modal open={!!selected} onClose={() => setSelected(null)} title={t('receipts.receiptDetails')}>
        {selected && (() => {
          const merchant = selected.merchant || selected.receipt?.store || selected.result?.merchant || 'Unknown';
          const total = selected.total ?? selected.receipt?.total ?? selected.result?.total;
          const currency = selected.currency || selected.receipt?.currency || selected.result?.currency || 'RON';
          const items = selected.items || selected.result?.items || selected.transactions?.[0]?.items || [];
          const date = selected.processedAt || selected.createdAt;
          const category = selected.category || selected.transactions?.[0]?.category || selected.result?.category;
          const cat = category ? getCategoryById(category) : null;
          const linked = getLinkedTransaction(selected);
          const hasImage = selected.imageData && selected.imageData.length > 300;

          return (
            <div className="space-y-4">
              {/* Image */}
              {hasImage && (
                <div className="rounded-xl overflow-hidden max-h-64 bg-cream-100 dark:bg-dark-border">
                  <img
                    src={selected.imageData ? `data:${selected.mediaType || 'image/jpeg'};base64,${selected.imageData}` : selected.thumbnail}
                    alt="Receipt"
                    className="w-full object-contain max-h-64"
                  />
                </div>
              )}

              {/* Meta */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold">{merchant}</span>
                  {total != null && (
                    <span className="text-lg font-heading font-bold money">{formatCurrency(total, currency)}</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-cream-500">
                  {date && (
                    <span className="flex items-center gap-1">
                      <Calendar size={12} /> {formatDate(date)}
                    </span>
                  )}
                  {cat && (
                    <span className="flex items-center gap-1">
                      <Tag size={12} /> {cat.icon} {t(`categories.${category}`)}
                    </span>
                  )}
                </div>
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div>
                  <h4 className="section-title">{t('receipts.itemsSection')}</h4>
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {items.map((item, i) => (
                      <div key={i} className="flex justify-between text-sm py-1 border-b border-cream-100 dark:border-dark-border last:border-0">
                        <span className="text-cream-700 dark:text-cream-300">
                          {item.name || item.description}
                          {item.quantity && item.quantity > 1 && <span className="text-cream-400 ml-1">x{item.quantity}</span>}
                        </span>
                        {item.price != null && (
                          <span className="money font-medium">{formatCurrency(item.price, currency)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* OCR text */}
              {selected.result?.rawText && (
                <div>
                  <h4 className="section-title">{t('receipts.ocrText')}</h4>
                  <pre className="text-xs text-cream-500 bg-cream-50 dark:bg-dark-border rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap font-mono">
                    {selected.result.rawText}
                  </pre>
                </div>
              )}

              {/* Linked transaction */}
              {linked && (
                <div className="p-3 rounded-lg bg-success/5 border border-success/20">
                  <p className="text-xs text-success font-medium mb-1">{t('receipts.linkedToTransaction')}</p>
                  <p className="text-sm">{linked.merchant || linked.description} — {formatCurrency(linked.amount, linked.currency)}</p>
                  <p className="text-xs text-cream-500">{formatDate(linked.date)}</p>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
