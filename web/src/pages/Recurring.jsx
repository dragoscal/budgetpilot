import { useState, useEffect } from 'react';
import { recurring as recurringApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import HelpButton from '../components/HelpButton';
import { RECURRING_FREQUENCIES } from '../lib/constants';
import { generateId, formatCurrency, getCategoryById, calcMonthlyEquivalent } from '../lib/helpers';
import { getCachedRates } from '../lib/exchangeRates';
import { detectRecurringPatterns, auditSubscriptions } from '../lib/smartFeatures';
import RecurringRow from '../components/RecurringRow';
import CategoryPicker from '../components/CategoryPicker';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { RotateCcw, Plus, Sparkles, Check, X, Search, AlertTriangle, TrendingUp } from 'lucide-react';
import { SkeletonPage } from '../components/LoadingSkeleton';

export default function Recurring() {
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState(new Set());
  const [showAudit, setShowAudit] = useState(false);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [rates, setRates] = useState(null);

  const defaultForm = { name: '', amount: '', currency: user?.defaultCurrency || 'RON', category: 'subscriptions', billingDay: '1', frequency: 'monthly', endDate: '' };
  const [form, setForm] = useState(defaultForm);

  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => { loadItems(); }, [effectiveUserId]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const data = await recurringApi.getAll({ userId: effectiveUserId });
      setItems(data);
      const patterns = await detectRecurringPatterns();
      setSuggestions(patterns);
      getCachedRates().then(setRates).catch(() => {});
    } catch (err) {
      toast.error(t('recurring.failedLoad'));
    } finally {
      setLoading(false);
    }
  };

  const activeItems = items.filter((i) => i.active !== false);
  const pausedItems = items.filter((i) => i.active === false);

  // Frequency-aware monthly total (multi-currency)
  const monthlyTotal = activeItems.reduce((sum, item) => {
    const monthlyAmt = calcMonthlyEquivalent(item.amount, item.frequency || 'monthly');
    const itemCurrency = item.currency || currency;
    if (!rates || itemCurrency === currency) return sum + monthlyAmt;
    const fromRate = rates[itemCurrency];
    const toRate = rates[currency];
    if (!fromRate || !toRate) return sum + monthlyAmt;
    return sum + (monthlyAmt / fromRate) * toRate;
  }, 0);
  const annualTotal = monthlyTotal * 12;

  const activeSuggestions = suggestions.filter(
    (s) => s.merchant && !dismissedSuggestions.has(s.merchant.toLowerCase()) && s.confidence >= 0.6
  );

  const handleSave = async () => {
    if (!form.name || !form.amount) { toast.error(t('recurring.nameAndAmountRequired')); return; }
    try {
      const data = {
        ...form,
        amount: Number(form.amount),
        billingDay: Number(form.billingDay) || 1,
        frequency: form.frequency || 'monthly',
        endDate: form.endDate || null,
        active: true,
        userId: effectiveUserId,
      };
      if (editItem) {
        await recurringApi.update(editItem.id, data);
        toast.success(t('recurring.updated'));
      } else {
        await recurringApi.create({ id: generateId(), ...data, createdAt: new Date().toISOString() });
        toast.success(t('recurring.added'));
      }
      setShowForm(false);
      setEditItem(null);
      setForm({ ...defaultForm, currency });
      loadItems();
    } catch (err) { toast.error(err.message); }
  };

  const handleToggle = async (item) => {
    try {
      await recurringApi.update(item.id, { active: item.active === false ? true : false });
      loadItems();
    } catch (err) {
      toast.error(err.message || t('recurring.failedToggle'));
    }
  };

  const handleDelete = async (item) => {
    try {
      await recurringApi.remove(item.id);
      toast.success(t('recurring.deletedMsg'));
      loadItems();
    } catch (err) {
      toast.error(err.message || t('recurring.failedDelete'));
    }
  };

  const handleEdit = (item) => {
    setEditItem(item);
    setForm({
      name: item.name,
      amount: item.amount.toString(),
      currency: item.currency || currency,
      category: item.category,
      billingDay: (item.billingDay || 1).toString(),
      frequency: item.frequency || 'monthly',
      endDate: item.endDate || '',
    });
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
        frequency: 'monthly',
        active: true,
        userId: effectiveUserId,
        autoDetected: true,
        createdAt: new Date().toISOString(),
      });
      toast.success(t('recurring.addedAsRecurring', { name: suggestion.merchant }));
      setDismissedSuggestions((prev) => new Set([...prev, suggestion.merchant.toLowerCase()]));
      loadItems();
    } catch (err) { toast.error(err.message); }
  };

  const dismissSuggestion = (suggestion) => {
    setDismissedSuggestions((prev) => new Set([...prev, suggestion.merchant.toLowerCase()]));
  };

  const openNewForm = () => {
    setEditItem(null);
    setForm({ ...defaultForm, currency });
    setShowForm(true);
  };

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('recurring.recurringAndSubscriptions')}</h1>
          <HelpButton section="recurring" />
        </div>
        <button onClick={openNewForm} className="btn-primary text-xs flex items-center gap-1">
          <Plus size={14} /> {t('common.add')}
        </button>
      </div>

      {/* Summary -- frequency-aware */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card text-center">
          <p className="text-xs text-cream-500 mb-1">{t('recurring.active')}</p>
          <p className="text-xl font-heading font-bold">{activeItems.length}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 mb-1">{t('common.monthly')}</p>
          <p className="text-xl font-heading font-bold money">{formatCurrency(Math.round(monthlyTotal * 100) / 100, currency)}</p>
        </div>
        <div className="card text-center">
          <p className="text-xs text-cream-500 mb-1">{t('common.yearly')}</p>
          <p className="text-xl font-heading font-bold money">{formatCurrency(Math.round(annualTotal * 100) / 100, currency)}</p>
        </div>
      </div>

      {/* Auto-detected suggestions */}
      {activeSuggestions.length > 0 && (
        <div className="card border-info/30 bg-info-light/30">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-info" />
            <h3 className="text-sm font-semibold">{t('recurring.detectedRecurring')}</h3>
          </div>
          <p className="text-xs text-cream-600 dark:text-cream-400 mb-3">
            {t('recurring.detectedDesc')}
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
                        ~{formatCurrency(s.amount, s.currency)} · {t('recurring.dayBilling', { day: s.billingDay })} · {t('recurring.monthsInRow', { count: s.consecutiveMonths })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => acceptSuggestion(s)} className="p-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors" title={t('recurring.addAsRecurring')}>
                      <Check size={14} />
                    </button>
                    <button onClick={() => dismissSuggestion(s)} className="p-1.5 rounded-lg bg-cream-200 dark:bg-dark-border text-cream-500 hover:bg-cream-300 transition-colors" title={t('recurring.dismiss')}>
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
              <h3 className="section-title">{t('recurring.paused')}</h3>
              <div className="card p-0">
                <div className="divide-y divide-cream-100 dark:divide-dark-border">
                  {pausedItems.map((item) => <RecurringRow key={item.id} item={item} onEdit={handleEdit} onDelete={handleDelete} onToggle={handleToggle} />)}
                </div>
              </div>
            </div>
          )}
        </>
      ) : !loading && activeSuggestions.length === 0 ? (
        <EmptyState icon={RotateCcw} title={t('recurring.noRecurringItems')} description={t('recurring.noRecurringItemsDesc')} action={t('recurring.addRecurring')} onAction={openNewForm} />
      ) : null}

      {/* Subscription Audit */}
      {items.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Search size={14} className="text-accent-500" />
              <h3 className="section-title mb-0">{t('recurring.subscriptionAudit')}</h3>
            </div>
            <button
              onClick={async () => {
                if (showAudit) { setShowAudit(false); return; }
                setAuditLoading(true);
                try {
                  const result = await auditSubscriptions();
                  setAudit(result);
                  setShowAudit(true);
                } catch { toast.error(t('recurring.auditFailed')); }
                finally { setAuditLoading(false); }
              }}
              className="btn-secondary text-xs flex items-center gap-1.5"
              disabled={auditLoading}
            >
              <Search size={12} />
              {auditLoading ? t('recurring.analyzing') : showAudit ? t('recurring.hideAudit') : t('recurring.runAudit')}
            </button>
          </div>

          {showAudit && audit && (
            <div className="mt-4 space-y-3">
              {/* Audit summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="text-center p-2 rounded-lg bg-cream-50 dark:bg-cream-800/20">
                  <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('recurring.auditMonthly')}</p>
                  <p className="text-sm font-heading font-bold money">{formatCurrency(audit.totalMonthly, currency)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-cream-50 dark:bg-cream-800/20">
                  <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('recurring.auditAnnual')}</p>
                  <p className="text-sm font-heading font-bold money">{formatCurrency(audit.totalAnnual, currency)}</p>
                </div>
                <div className="text-center p-2 rounded-lg bg-cream-50 dark:bg-cream-800/20">
                  <p className="text-[10px] text-cream-500 uppercase tracking-wider">{t('recurring.auditIssues')}</p>
                  <p className={`text-sm font-heading font-bold ${audit.issueCount > 0 ? 'text-warning' : 'text-success'}`}>
                    {audit.issueCount}
                  </p>
                </div>
              </div>

              {/* Audit items */}
              <div className="space-y-2">
                {audit.items.map((item) => {
                  const cat = getCategoryById(item.category);
                  return (
                    <div key={item.id} className={`p-3 rounded-lg border ${item.issues.length > 0 ? 'border-warning/30 bg-warning/5' : 'border-cream-200 dark:border-dark-border'}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span>{cat.icon}</span>
                          <span className="text-sm font-medium">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium money">{formatCurrency(item.monthlyCost, item.currency)}{t('recurring.perMo')}</p>
                          <p className="text-[10px] text-cream-400">{formatCurrency(item.annualCost, item.currency)}{t('recurring.perYr')}</p>
                        </div>
                      </div>
                      {item.issues.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {item.issues.map((issue, j) => (
                            <div key={j} className="flex items-center gap-1.5 text-xs">
                              {issue.severity === 'warning' ? (
                                <AlertTriangle size={12} className="text-warning shrink-0" />
                              ) : (
                                <TrendingUp size={12} className="text-info shrink-0" />
                              )}
                              <span className={issue.severity === 'warning' ? 'text-warning' : 'text-info'}>{issue.message}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Form Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditItem(null); }} title={editItem ? t('recurring.editRecurringTitle') : t('recurring.newRecurring')}>
        <div className="space-y-4">
          <div>
            <label className="label">{t('recurring.name')}</label>
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('recurring.namePlaceholderShort')} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t('recurring.amount')}</label>
              <input type="number" className="input" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" inputMode="decimal" />
            </div>
            <div>
              <label className="label">{t('recurring.billingDay')}</label>
              <input type="number" className="input" min="1" max="31" value={form.billingDay} onChange={(e) => setForm((f) => ({ ...f, billingDay: e.target.value }))} />
            </div>
          </div>

          <div>
            <label className="label">{t('recurring.frequency')}</label>
            <select className="input" value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))}>
              {RECURRING_FREQUENCIES.map((freq) => (
                <option key={freq.id} value={freq.id}>{t(`frequencies.${freq.id}`)}</option>
              ))}
            </select>
          </div>

          <div>
            <CategoryPicker
              label={t('recurring.category')}
              value={form.category}
              onChange={(catId) => setForm((f) => ({ ...f, category: catId }))}
              exclude={['income', 'transfer']}
            />
          </div>

          <div>
            <label className="label">{t('recurring.endDate')}</label>
            <input type="date" className="input" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
          </div>

          <button onClick={handleSave} className="btn-primary w-full">{editItem ? t('budgets.update') : t('common.add')}</button>
        </div>
      </Modal>
    </div>
  );
}
