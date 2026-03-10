import { useState, useEffect, useMemo } from 'react';
import { accounts as accountsApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from '../contexts/LanguageContext';
import { ACCOUNT_TYPES, CURRENCIES } from '../lib/constants';
import { generateId, formatCurrency, sumBy } from '../lib/helpers';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Landmark, Plus, Edit3, Trash2 } from 'lucide-react';
import { SkeletonPage } from '../components/LoadingSkeleton';
import HelpButton from '../components/HelpButton';

const LIABILITY_TYPES = ['credit_card', 'loan'];

export default function NetWorth() {
  const { t } = useTranslation();
  const { user, effectiveUserId } = useAuth();
  const { toast } = useToast();
  const [accountsList, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [updateBalance, setUpdateBalance] = useState(null);
  const [newBalance, setNewBalance] = useState('');

  const [form, setForm] = useState({ name: '', type: 'checking', balance: '', currency: user?.defaultCurrency || 'RON', icon: '🏦', color: '#14b8a6' });

  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => { loadAccounts(); }, [effectiveUserId]);

  const loadAccounts = async () => {
    setLoading(true);
    try { setAccounts(await accountsApi.getAll({ userId: effectiveUserId })); }
    catch (err) { toast.error(t('networth.failedLoad')); }
    finally { setLoading(false); }
  };

  const assets = accountsList.filter((a) => !LIABILITY_TYPES.includes(a.type));
  const liabilities = accountsList.filter((a) => LIABILITY_TYPES.includes(a.type));
  const totalAssets = sumBy(assets, 'balance');
  const totalLiabilities = sumBy(liabilities, 'balance');
  const netWorth = totalAssets - totalLiabilities;

  const handleSave = async () => {
    if (!form.name || !form.balance) { toast.error(t('networth.nameBalanceRequired')); return; }
    try {
      const data = { ...form, balance: Number(form.balance), userId: effectiveUserId, lastUpdated: new Date().toISOString() };
      const acctType = ACCOUNT_TYPES.find((t) => t.id === data.type);
      if (acctType) data.icon = acctType.icon;
      if (editAccount) {
        await accountsApi.update(editAccount.id, data);
        toast.success(t('networth.updated'));
      } else {
        await accountsApi.create({ id: generateId(), ...data, createdAt: new Date().toISOString() });
        toast.success(t('networth.accountAdded'));
      }
      setShowForm(false); setEditAccount(null);
      setForm({ name: '', type: 'checking', balance: '', currency, icon: '🏦', color: '#14b8a6' });
      loadAccounts();
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdateBalance = async () => {
    if (!updateBalance || newBalance === '') return;
    try {
      await accountsApi.update(updateBalance.id, { balance: Number(newBalance), lastUpdated: new Date().toISOString() });
      toast.success(t('networth.balanceUpdated'));
      setUpdateBalance(null);
      setNewBalance('');
      loadAccounts();
    } catch (err) {
      toast.error(err.message || t('networth.failedUpdateBalance'));
    }
  };

  const handleDelete = async (acct) => {
    try {
      await accountsApi.remove(acct.id);
      toast.success(t('networth.deleted'));
      loadAccounts();
    } catch (err) {
      toast.error(err.message || t('networth.failedDelete'));
    }
  };

  const handleEdit = (acct) => {
    setEditAccount(acct);
    setForm({ name: acct.name, type: acct.type, balance: acct.balance.toString(), currency: acct.currency || currency, icon: acct.icon, color: acct.color || '#14b8a6' });
    setShowForm(true);
  };

  const AccountCard = ({ account }) => (
    <div className="card group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: (account.color || '#14b8a6') + '15' }}>
            {account.icon || '🏦'}
          </div>
          <div>
            <p className="text-sm font-medium">{account.name}</p>
            <p className="text-xs text-cream-500 capitalize">{t(`accountTypes.${account.type}`) || account.type?.replace('_', ' ')}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button onClick={() => handleEdit(account)} className="p-1 rounded-lg hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400"><Edit3 size={14} /></button>
          <button onClick={() => handleDelete(account)} className="p-1 rounded-lg hover:bg-danger/10 text-cream-400 hover:text-danger"><Trash2 size={14} /></button>
        </div>
      </div>
      <p className={`text-2xl font-heading font-bold money mt-3 ${LIABILITY_TYPES.includes(account.type) ? 'text-danger' : ''}`}>
        {LIABILITY_TYPES.includes(account.type) ? '-' : ''}{formatCurrency(account.balance || 0, account.currency || currency)}
      </p>
      <button onClick={() => { setUpdateBalance(account); setNewBalance(account.balance?.toString() || ''); }} className="text-xs text-cream-500 hover:text-cream-700 mt-1">
        {t('networth.updateBalance')}
      </button>
    </div>
  );

  if (loading) return <SkeletonPage />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="page-title mb-0">{t('networth.title')}</h1>
          <HelpButton section="networth" />
        </div>
        <button onClick={() => { setEditAccount(null); setForm({ name: '', type: 'checking', balance: '', currency, icon: '🏦', color: '#14b8a6' }); setShowForm(true); }} className="btn-primary text-xs flex items-center gap-1"><Plus size={14} /> {t('networth.addAccount')}</button>
      </div>

      {/* Big number */}
      <div className="card text-center py-8">
        <p className="text-xs font-medium text-cream-500 uppercase tracking-wide mb-2">{t('networth.totalNetWorth')}</p>
        <p className={`text-3xl md:text-5xl font-heading font-bold money ${netWorth >= 0 ? 'text-success' : 'text-danger'}`}>
          {formatCurrency(netWorth, currency)}
        </p>
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 mt-4 text-sm">
          <span className="text-cream-500">{t('networth.assets')}: <span className="font-medium text-success money">{formatCurrency(totalAssets, currency)}</span></span>
          <span className="text-cream-500">{t('networth.liabilities')}: <span className="font-medium text-danger money">{formatCurrency(totalLiabilities, currency)}</span></span>
        </div>
      </div>

      {accountsList.length > 0 ? (
        <>
          {assets.length > 0 && (
            <div>
              <h3 className="section-title">{t('networth.assets')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {assets.map((a) => <AccountCard key={a.id} account={a} />)}
              </div>
            </div>
          )}
          {liabilities.length > 0 && (
            <div>
              <h3 className="section-title">{t('networth.liabilities')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {liabilities.map((a) => <AccountCard key={a.id} account={a} />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={Landmark} title={t('networth.noAccountsTitle')} description={t('networth.noAccountsDescription')} action={t('networth.addAccount')} onAction={() => setShowForm(true)} />
      )}

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditAccount(null); }} title={editAccount ? t('networth.editAccount') : t('networth.addAccount')}>
        <div className="space-y-4">
          <div><label className="label">{t('networth.accountName')}</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t('networth.accountNamePlaceholder')} /></div>
          <div><label className="label">{t('networth.type')}</label><select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{ACCOUNT_TYPES.map((at) => <option key={at.id} value={at.id}>{at.icon} {t(`accountTypes.${at.id}`) || at.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">{t('networth.balance')}</label><input type="number" className="input" value={form.balance} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} placeholder="0.00" inputMode="decimal" /></div>
            <div><label className="label">{t('networth.currency')}</label><select className="input" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div>
          </div>
          <div><label className="label">{t('networth.color')}</label><input type="color" className="input h-10" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} /></div>
          <button onClick={handleSave} className="btn-primary w-full">{editAccount ? t('networth.update') : t('networth.addAccount')}</button>
        </div>
      </Modal>

      {/* Update balance modal */}
      <Modal open={!!updateBalance} onClose={() => setUpdateBalance(null)} title={`${t('networth.update')} ${updateBalance?.name || ''}`}>
        <div className="space-y-4">
          <div><label className="label">{t('networth.newBalance')}</label><input type="number" className="input" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} inputMode="decimal" autoFocus /></div>
          <button onClick={handleUpdateBalance} className="btn-primary w-full">{t('networth.update')}</button>
        </div>
      </Modal>
    </div>
  );
}
