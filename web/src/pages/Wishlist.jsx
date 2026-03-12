import { useState, useEffect, useRef } from 'react';
import { wishlistApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { CATEGORIES } from '../lib/constants';
import { generateId, formatCurrency, todayLocal } from '../lib/helpers';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Star, Plus, ShoppingCart, Trash2, ExternalLink } from 'lucide-react';
import { SkeletonPage } from '../components/LoadingSkeleton';
import HelpButton from '../components/HelpButton';

const PRIORITIES_CONFIG = [
  { value: 1, key: 'wishlist.priorityLow', color: 'text-cream-400' },
  { value: 2, key: 'wishlist.priorityMediumLow', color: 'text-cream-500' },
  { value: 3, key: 'wishlist.priorityMedium', color: 'text-warning' },
  { value: 4, key: 'wishlist.priorityHigh', color: 'text-warning' },
  { value: 5, key: 'wishlist.priorityMustHave', color: 'text-danger' },
];

export default function Wishlist() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();

  const PRIORITIES = PRIORITIES_CONFIG.map(p => ({ ...p, label: t(p.key) }));
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({ name: '', estimatedPrice: '', category: 'shopping', priority: '3', url: '', notes: '' });

  const currency = user?.defaultCurrency || 'RON';
  const loadVersion = useRef(0);

  useEffect(() => {
    if (!effectiveUserId) return;
    const version = ++loadVersion.current;
    const load = async () => {
      setLoading(true);
      try {
        const data = await wishlistApi.getAll({ userId: effectiveUserId });
        if (loadVersion.current !== version) return;
        setItems(data);
      } catch (err) { if (loadVersion.current === version) toast.error(t('wishlist.failedLoad')); }
      finally { if (loadVersion.current === version) setLoading(false); }
    };
    load();
  }, [effectiveUserId]);

  const loadItems = async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await wishlistApi.getAll({ userId: effectiveUserId });
      if (loadVersion.current !== version) return;
      setItems(data);
    } catch (err) { if (loadVersion.current === version) toast.error(t('wishlist.failedLoad')); }
    finally { if (loadVersion.current === version) setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.name) { toast.error(t('wishlist.nameRequired')); return; }
    try {
      await wishlistApi.create({
        id: generateId(), ...form,
        estimatedPrice: Number(form.estimatedPrice) || 0,
        priority: Number(form.priority),
        currency, status: 'wanted', userId: effectiveUserId, createdAt: new Date().toISOString(),
      });
      toast.success(t('wishlist.saved'));
      setShowForm(false);
      setForm({ name: '', estimatedPrice: '', category: 'shopping', priority: '3', url: '', notes: '' });
      loadItems();
    } catch (err) {
      toast.error(err.message || t('wishlist.failedAdd'));
    }
  };

  const handlePurchase = async (item) => {
    try {
      await wishlistApi.update(item.id, { status: 'purchased', purchasedDate: todayLocal() });
      toast.success(t('wishlist.purchased'));
      loadItems();
    } catch (err) {
      toast.error(err.message || t('wishlist.failedPurchase'));
    }
  };

  const handleDelete = async (item) => {
    try {
      await wishlistApi.remove(item.id);
      toast.success(t('wishlist.deleted'));
      loadItems();
    } catch (err) {
      toast.error(err.message || t('wishlist.failedRemove'));
    }
  };

  const wantedItems = items.filter((i) => i.status === 'wanted').sort((a, b) => b.priority - a.priority);
  const purchasedItems = items.filter((i) => i.status === 'purchased');

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('wishlist.title')}</h1>
          <HelpButton section="wishlist" />
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary text-xs flex items-center gap-1"><Plus size={14} /> {t('wishlist.add')}</button>
      </div>

      {wantedItems.length > 0 ? (
        <div className="space-y-3">
          {wantedItems.map((item) => {
            const priorityInfo = PRIORITIES.find((p) => p.value === item.priority) || PRIORITIES[2];
            return (
              <div key={item.id} className="card group">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{item.name}</p>
                      <span className={`text-[10px] font-medium ${priorityInfo.color}`}>{priorityInfo.label}</span>
                    </div>
                    {item.notes && <p className="text-xs text-cream-500 mt-0.5">{item.notes}</p>}
                    {item.url && (
                      <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-info hover:underline flex items-center gap-1 mt-0.5">
                        {t('wishlist.link')} <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.estimatedPrice > 0 && (
                      <span className="text-lg font-heading font-bold money">{formatCurrency(item.estimatedPrice, currency)}</span>
                    )}
                    <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handlePurchase(item)} className="p-1.5 rounded-lg hover:bg-success/10 text-cream-400 hover:text-success" title={t('wishlist.markPurchased')}><ShoppingCart size={14} /></button>
                      <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg hover:bg-danger/10 text-cream-400 hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Star} title={t('wishlist.noItems')} description={t('wishlist.noItemsDesc')} action={t('wishlist.createFirst')} onAction={() => setShowForm(true)} />
      )}

      {purchasedItems.length > 0 && (
        <div>
          <h3 className="section-title">{t('wishlist.purchasedSection')}</h3>
          <div className="space-y-2">
            {purchasedItems.map((item) => (
              <div key={item.id} className="card opacity-60">
                <div className="flex items-center justify-between">
                  <span className="text-sm line-through">{item.name}</span>
                  <span className="text-sm money">{item.estimatedPrice > 0 ? formatCurrency(item.estimatedPrice, currency) : ''}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title={t('wishlist.addToWishlist')}>
        <div className="space-y-4">
          <div><label className="label">{t('wishlist.itemName')}</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t('wishlist.estimatedPrice')}</label><input type="number" className="input" value={form.estimatedPrice} onChange={(e) => setForm((f) => ({ ...f, estimatedPrice: e.target.value }))} inputMode="decimal" /></div>
            <div><label className="label">{t('wishlist.priority')}</label><select className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
          </div>
          <div><label className="label">{t('common.category')}</label><select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CATEGORIES.filter((c) => c.id !== 'income' && c.id !== 'transfer').map((c) => <option key={c.id} value={c.id}>{c.icon} {t(`categories.${c.id}`)}</option>)}</select></div>
          <div><label className="label">{t('wishlist.url')}</label><input className="input" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." /></div>
          <div><label className="label">{t('common.notes')}</label><input className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <button onClick={handleAdd} className="btn-primary w-full">{t('wishlist.addToWishlist')}</button>
        </div>
      </Modal>
    </div>
  );
}
