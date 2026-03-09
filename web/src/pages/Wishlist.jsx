import { useState, useEffect } from 'react';
import { wishlistApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIES } from '../lib/constants';
import { generateId, formatCurrency } from '../lib/helpers';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Star, Plus, ShoppingCart, Trash2, ExternalLink } from 'lucide-react';

const PRIORITIES = [
  { value: 1, label: 'Low', color: 'text-cream-400' },
  { value: 2, label: 'Medium-Low', color: 'text-cream-500' },
  { value: 3, label: 'Medium', color: 'text-warning' },
  { value: 4, label: 'High', color: 'text-warning' },
  { value: 5, label: 'Must Have', color: 'text-danger' },
];

export default function Wishlist() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({ name: '', estimatedPrice: '', category: 'shopping', priority: '3', url: '', notes: '' });

  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try { setItems(await wishlistApi.getAll({ userId: 'local' })); }
    catch (err) { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    await wishlistApi.create({
      id: generateId(), ...form,
      estimatedPrice: Number(form.estimatedPrice) || 0,
      priority: Number(form.priority),
      currency, status: 'wanted', userId: 'local', createdAt: new Date().toISOString(),
    });
    toast.success('Added to wishlist');
    setShowForm(false);
    setForm({ name: '', estimatedPrice: '', category: 'shopping', priority: '3', url: '', notes: '' });
    loadItems();
  };

  const handlePurchase = async (item) => {
    await wishlistApi.update(item.id, { status: 'purchased', purchasedDate: new Date().toISOString().slice(0, 10) });
    toast.success(`${item.name} marked as purchased`);
    loadItems();
  };

  const handleDelete = async (item) => {
    await wishlistApi.remove(item.id);
    toast.success('Removed');
    loadItems();
  };

  const wantedItems = items.filter((i) => i.status === 'wanted').sort((a, b) => b.priority - a.priority);
  const purchasedItems = items.filter((i) => i.status === 'purchased');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Wishlist</h1>
        <button onClick={() => setShowForm(true)} className="btn-primary text-xs flex items-center gap-1"><Plus size={14} /> Add item</button>
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
                        Link <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {item.estimatedPrice > 0 && (
                      <span className="text-lg font-heading font-bold money">{formatCurrency(item.estimatedPrice, currency)}</span>
                    )}
                    <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handlePurchase(item)} className="p-1.5 rounded-lg hover:bg-success/10 text-cream-400 hover:text-success" title="Mark purchased"><ShoppingCart size={14} /></button>
                      <button onClick={() => handleDelete(item)} className="p-1.5 rounded-lg hover:bg-danger/10 text-cream-400 hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={Star} title="Wishlist empty" description="Track things you want to buy — resist impulse purchases!" action="Add to wishlist" onAction={() => setShowForm(true)} />
      )}

      {purchasedItems.length > 0 && (
        <div>
          <h3 className="section-title">Purchased</h3>
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

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Add to wishlist">
        <div className="space-y-4">
          <div><label className="label">Item name</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Estimated price</label><input type="number" className="input" value={form.estimatedPrice} onChange={(e) => setForm((f) => ({ ...f, estimatedPrice: e.target.value }))} inputMode="decimal" /></div>
            <div><label className="label">Priority</label><select className="input" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
          </div>
          <div><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CATEGORIES.filter((c) => c.id !== 'income' && c.id !== 'transfer').map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
          <div><label className="label">Link (optional)</label><input className="input" value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://..." /></div>
          <div><label className="label">Notes</label><input className="input" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} /></div>
          <button onClick={handleAdd} className="btn-primary w-full">Add to wishlist</button>
        </div>
      </Modal>
    </div>
  );
}
