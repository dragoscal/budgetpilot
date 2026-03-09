import { useState, useEffect } from 'react';
import { recurring as recurringApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { CATEGORIES, CURRENCIES } from '../lib/constants';
import { generateId, formatCurrency, sumBy, getCategoryById } from '../lib/helpers';
import { detectRecurringPatterns } from '../lib/smartFeatures';
import RecurringRow from '../components/RecurringRow';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { RotateCcw, Plus, Sparkles, Check, X } from 'lucide-react';

export default function Recurring() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());

  const [form, setForm] = useState({ name: '', amount: '', currency: user?.defaultCurrency || 'RON', category: 'subscriptions', billingDay: '1' });

  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => { loadItems(); }, []);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await recurringApi.getAll({ userId: 'local' });
      setItems(data);

      // Auto-detect recurring patterns
      const patterns = await detectRecurringPatterns();
      setSuggestions(patterns);
    } catch (err) {
      toast.error('Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const activeItems = items.filter((i) => i.active !== false);
  const pausedItems = items.filter((i) => i.active === false);
  const monthlyTotal = sumBy(activeItems, 'amount');
  const annualTotal = monthlyTotal * 12;

  // Filter out dismissed and already-tracked suggestions
  const activeSuggestions = suggestions.filter(
    (s) => s.merchant && !dismissedSuggestions.has(s.merchant.toLowerCase()) && s.confidence >= 0.6
  );

  const handleSave = async () => {
    if (!form.name || !form.amount) { toast.error('Name and amount required'); return; }
    try {
      const data = { ...form, amount: Number(form.amount), billingDay: Number(form.billingDay) || 1, active: true, userId: 'local' };
      if (editItem) {
        await recurringApi.update(editItem.id, data);
        toast.success('Updated');
      } else {
        await recurringApi.create({ id: generateId(), ...data, createdAt: new Date().toISOString() });
        toast.success('Added');
      }
      setShowForm(false); setEditItem(null);
      setForm({ name: '', amount: '', currency, category: 'subscriptions', billingDay: '1' });
      loadItems();
    } catch (err) { toast.error(err.message); }
  };

  const handleToggle = async (item) => {
    await recurringApi.update(item.id, { active: item.active === false ? true : false });
    loadItems();
  };

  const handleDelete = async (item) => {
    await recurringApi.remove(item.id);
    toast.success('Deleted');
    loadItems();
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({ name: item.name, amount: item.amount.toString(), currency: item.currency || currency, category: item.category, billingDay: (item.billingDay || 1).toString() });
    setShowForm(true);
  };

  const acceptSuggestion = async (suggestion) => {
    try {
      await recurringApi.create({
        id: generateId(),
        name: suggestion.merchant,
        merchant: suggestion.merchant,
        amount: suggestion.amount,
        currency: suggestion.currency,
        category: suggestion.category,
        billingDay: suggestion.billingDay,
        active: true,
        userId: 'local',
        autoDetected: true,
        createdAt: new Date().toISOString(),
      });
      toast.success(`Added "${suggestion.merchant}" as recurring`);
      setDismissedSuggestions((prev) => new Set([...prev, suggestion.merchant.toLowerCase()]));
      loadItems();
    } catch (err) { toast.error(err.message); }
  };

  const dismissSuggestion = (suggestion) => {
    setDismissedSuggestions((prev) => new Set([...prev, suggestion.merchant.toLowerCase()]));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Recurring & Subscriptions</h1>
        <button onClick={() => { setEditItem(null); setForm({ name: '', amount: '', currency, category: 'subscriptions', billingDay: '1' }); setShowForm(true); }} className="btn-primary text-xs flex items-center gap-1">
          <Plus size={14} /> Add
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">Active</p><p className="text-xl font-heading font-bold">{activeItems.length}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">Monthly</p><p className="text-xl font-heading font-bold money">{formatCurrency(monthlyTotal, currency)}</p></div>
        <div className="card text-center"><p className="text-xs text-cream-500 mb-1">Annual</p><p className="text-xl font-heading font-bold money">{formatCurrency(annualTotal, currency)}</p></div>
      </div>

      {/* Auto-detected suggestions */}
      {activeSuggestions.length > 0 && (
        <div className="card border-info/30 bg-info-light/30">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-info" />
            <h3 className="text-sm font-semibold">Detected recurring payments</h3>
          </div>
          <p className="text-xs text-cream-600 dark:text-cream-400 mb-3">
            We noticed these payments repeat monthly. Add them to track automatically.
          </p>
          <div className="space-y-2">
            {activeSuggestions.map((s, i) => {
              const cat = getCategoryById(s.category);
              return (
                <div key={i} className="flex items-center justify-between bg-white dark:bg-dark-card rounded-lg p-3 border border-cream-200 dark:border-dark-border">
                  <div className="flex items-center gap-2">
                    <span>{cat.icon}</span>
                    <div>
                      <p className="text-sm font-medium">{s.merchant}</p>
                      <p className="text-xs text-cream-500">
                        ~{formatCurrency(s.amount, s.currency)} · Day {s.billingDay} · {s.consecutiveMonths} months in a row
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => acceptSuggestion(s)}
                      className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors"
                      title="Add as recurring"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => dismissSuggestion(s)}
                      className="p-1.5 rounded-lg bg-cream-200 dark:bg-dark-border text-cream-500 hover:bg-cream-300 transition-colors"
                      title="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {items.length > 0 ? (
        <>
          {activeItems.length > 0 && (
            <div className="card p-0">
              <div className="divide-y divide-cream-100 dark:divide-dark-border">
                {activeItems.sort((a, b) => (a.billingDay || 1) - (b.billingDay || 1)).map((item) => (
                  <RecurringRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} />
                ))}
              </div>
            </div>
          )}
          {pausedItems.length > 0 && (
            <div>
              <h3 className="section-title">Paused</h3>
              <div className="card p-0">
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {pausedItems.map((item) => <RecurringRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} />)}
                </div>
              </div>
            </div>
          )}
        </>
      ) : !loading && activeSuggestions.length === 0 ? (
        <EmptyState icon={RotateCcw} title="No recurring items" description="Track subscriptions and recurring bills" action="Add recurring" onAction={() => setShowForm(true)} />
      ) : null}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} title={editItem ? 'Edit recurring' : 'New recurring'}>
        <div className="space-y-4">
          <div><label className="label">Name</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Netflix" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Amount</label><input type="number" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" inputMode="decimal" /></div>
            <div><label className="label">Billing day</label><input type="number" className="input" min="1" max="31" value={form.billingDay} onChange={(e) => setForm((f) => ({ ...f, billingDay: e.target.value }))} /></div>
          </div>
          <div><label className="label">Category</label><select className="input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>{CATEGORIES.filter((c) => c.id !== 'income' && c.id !== 'transfer').map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select></div>
          <button onClick={handleSave} className="btn-primary w-full">{editItem ? 'Update' : 'Add'}</button>
        </div>
      </Modal>
    </div>
  );
}
