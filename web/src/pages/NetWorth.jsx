import { useState, useEffect, useMemo } from 'react';
import { accounts as accountsApi } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { ACCOUNT_TYPES, CURRENCIES } from '../lib/constants';
import { generateId, formatCurrency, sumBy } from '../lib/helpers';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import { Landmark, Plus, Edit3, Trash2 } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const LIABILITY_TYPES = ['credit_card', 'loan'];

export default function NetWorth() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [accountsList, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [updateBalance, setUpdateBalance] = useState(null);
  const [newBalance, setNewBalance] = useState('');

  const [form, setForm] = useState({ name: '', type: 'checking', balance: '', currency: user?.defaultCurrency || 'RON', icon: '🏦', color: '#6366f1' });

  const currency = user?.defaultCurrency || 'RON';

  useEffect(() => { loadAccounts(); }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try { setAccounts(await accountsApi.getAll({ userId: 'local' })); }
    catch (err) { toast.error('Failed to load accounts'); }
    finally { setLoading(false); }
  };

  const assets = accountsList.filter((a) => !LIABILITY_TYPES.includes(a.type));
  const liabilities = accountsList.filter((a) => LIABILITY_TYPES.includes(a.type));
  const totalAssets = sumBy(assets, 'balance');
  const totalLiabilities = sumBy(liabilities, 'balance');
  const netWorth = totalAssets - totalLiabilities;

  const handleSave = async () => {
    if (!form.name || !form.balance) { toast.error('Name and balance required'); return; }
    try {
      const data = { ...form, balance: Number(form.balance), userId: 'local', lastUpdated: new Date().toISOString() };
      const acctType = ACCOUNT_TYPES.find((t) => t.id === data.type);
      if (acctType) data.icon = acctType.icon;
      if (editAccount) {
        await accountsApi.update(editAccount.id, data);
        toast.success('Updated');
      } else {
        await accountsApi.create({ id: generateId(), ...data, createdAt: new Date().toISOString() });
        toast.success('Account added');
      }
      setShowForm(false); setEditAccount(null);
      setForm({ name: '', type: 'checking', balance: '', currency, icon: '🏦', color: '#6366f1' });
      loadAccounts();
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdateBalance = async () => {
    if (!updateBalance || newBalance === '') return;
    await accountsApi.update(updateBalance.id, { balance: Number(newBalance), lastUpdated: new Date().toISOString() });
    toast.success('Balance updated');
    setUpdateBalance(null);
    setNewBalance('');
    loadAccounts();
  };

  const handleDelete = async (acct) => {
    await accountsApi.remove(acct.id);
    toast.success('Deleted');
    loadAccounts();
  };

  const handleEdit = (acct) => {
    setEditAccount(acct);
    setForm({ name: acct.name, type: acct.type, balance: acct.balance.toString(), currency: acct.currency || currency, icon: acct.icon, color: acct.color || '#6366f1' });
    setShowForm(true);
  };

  const AccountCard = ({ account }) => (
    <div className="card group">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: (account.color || '#6366f1') + '15' }}>
            {account.icon || '🏦'}
          </div>
          <div>
            <p className="text-sm font-medium">{account.name}</p>
            <p className="text-xs text-cream-500 capitalize">{account.type?.replace('_', ' ')}</p>
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
        Update balance
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="page-title mb-0">Net Worth</h1>
        <button onClick={() => { setEditAccount(null); setForm({ name: '', type: 'checking', balance: '', currency, icon: '🏦', color: '#6366f1' }); setShowForm(true); }} className="btn-primary text-xs flex items-center gap-1"><Plus size={14} /> Add account</button>
      </div>

      {/* Big number */}
      <div className="card text-center py-8">
        <p className="text-xs font-medium text-cream-500 uppercase tracking-wide mb-2">Total Net Worth</p>
        <p className={`text-3xl md:text-5xl font-heading font-bold money ${netWorth >= 0 ? 'text-success' : 'text-danger'}`}>
          {formatCurrency(netWorth, currency)}
        </p>
        <div className="flex flex-wrap justify-center gap-4 md:gap-8 mt-4 text-sm">
          <span className="text-cream-500">Assets: <span className="font-medium text-success money">{formatCurrency(totalAssets, currency)}</span></span>
          <span className="text-cream-500">Liabilities: <span className="font-medium text-danger money">{formatCurrency(totalLiabilities, currency)}</span></span>
        </div>
      </div>

      {accountsList.length > 0 ? (
        <>
          {assets.length > 0 && (
            <div>
              <h3 className="section-title">Assets</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {assets.map((a) => <AccountCard key={a.id} account={a} />)}
              </div>
            </div>
          )}
          {liabilities.length > 0 && (
            <div>
              <h3 className="section-title">Liabilities</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {liabilities.map((a) => <AccountCard key={a.id} account={a} />)}
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={Landmark} title="No accounts" description="Add your financial accounts to track net worth" action="Add account" onAction={() => setShowForm(true)} />
      )}

      {/* Add/Edit Modal */}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditAccount(null); }} title={editAccount ? 'Edit account' : 'Add account'}>
        <div className="space-y-4">
          <div><label className="label">Account name</label><input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. BT Checking" /></div>
          <div><label className="label">Type</label><select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>{ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Balance</label><input type="number" className="input" value={form.balance} onChange={(e) => setForm((f) => ({ ...f, balance: e.target.value }))} placeholder="0.00" inputMode="decimal" /></div>
            <div><label className="label">Currency</label><select className="input" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>{CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}</select></div>
          </div>
          <div><label className="label">Color</label><input type="color" className="input h-10" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} /></div>
          <button onClick={handleSave} className="btn-primary w-full">{editAccount ? 'Update' : 'Add account'}</button>
        </div>
      </Modal>

      {/* Update balance modal */}
      <Modal open={!!updateBalance} onClose={() => setUpdateBalance(null)} title={`Update ${updateBalance?.name || ''}`}>
        <div className="space-y-4">
          <div><label className="label">New balance</label><input type="number" className="input" value={newBalance} onChange={(e) => setNewBalance(e.target.value)} inputMode="decimal" autoFocus /></div>
          <button onClick={handleUpdateBalance} className="btn-primary w-full">Update</button>
        </div>
      </Modal>
    </div>
  );
}
