import { useState, useEffect } from 'react';
import { useFamily } from '../contexts/FamilyContext';
import { useToast } from '../contexts/ToastContext';
import { useTranslation } from '../contexts/LanguageContext';
import Modal from '../components/Modal';
import HelpButton from '../components/HelpButton';
import {
  Users, Plus, UserPlus, Home, Receipt,
  Handshake, Settings, UserCheck,
} from 'lucide-react';

// Tab components
import FamilyOverview from '../components/family/FamilyOverview';
import FamilyAllExpenses from '../components/family/FamilyAllExpenses';
import FamilySettlements from '../components/family/FamilySettlements';
import FamilyMembers from '../components/family/FamilyMembers';
import FamilySettings from '../components/family/FamilySettings';

// ─── Inline forms (only used here) ──────────────────────────
function CreateFamilyForm({ onCreated }) {
  const { createFamily, FAMILY_EMOJIS } = useFamily();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(FAMILY_EMOJIS[0]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const family = await createFamily(name.trim(), emoji);
      onCreated?.(family);
    } catch (err) {
      toast.error(err.message || t('family.failedCreate'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">{t('family.familyName')}</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('family.familyNamePlaceholder')} required />
      </div>
      <div>
        <label className="label">{t('family.iconLabel')}</label>
        <div className="flex flex-wrap gap-2">
          {FAMILY_EMOJIS.map((e) => (
            <button
              key={e} type="button"
              onClick={() => setEmoji(e)}
              className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-colors ${
                emoji === e ? 'bg-accent-50 dark:bg-accent-500/15 ring-2 ring-accent' : 'bg-cream-100 dark:bg-dark-border hover:bg-cream-200'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      <button type="submit" disabled={loading || !name.trim()} className="btn-primary w-full">
        {loading ? t('family.creating') : t('family.createFamily')}
      </button>
    </form>
  );
}

function JoinFamilyForm({ onJoined }) {
  const { joinFamily } = useFamily();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    try {
      const family = await joinFamily(code.trim());
      toast.success(t('family.joined', { name: family.name }));
      onJoined?.(family);
    } catch (err) {
      toast.error(err.message || t('family.failedJoin'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">{t('family.inviteCode')}</label>
        <input
          className="input text-center text-2xl tracking-[0.5em] font-mono uppercase"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
          placeholder="XXXXXX"
          maxLength={6}
          required
        />
        <p className="text-xs text-cream-500 mt-1">{t('family.askAdmin')}</p>
      </div>
      <button type="submit" disabled={loading || code.length < 6} className="btn-primary w-full">
        {loading ? t('family.joining') : t('family.joinFamily')}
      </button>
    </form>
  );
}

// ─── Tab definitions ─────────────────────────────────────────
const TABS = [
  { id: 'home', icon: Home, labelKey: 'family.homeTab' },
  { id: 'spending', icon: Receipt, labelKey: 'family.spendingTab' },
  { id: 'settle', icon: Handshake, labelKey: 'family.settleTab' },
  { id: 'members', icon: UserCheck, labelKey: 'family.membersTab' },
  { id: 'settings', icon: Settings, labelKey: 'family.settingsTab' },
];

const TAB_COMPONENTS = {
  home: FamilyOverview,
  spending: FamilyAllExpenses,
  settle: FamilySettlements,
  members: FamilyMembers,
  settings: FamilySettings,
};

// ─── Main Family page ────────────────────────────────────────
export default function Family() {
  const { t } = useTranslation();
  const {
    myFamilies, activeFamily, members, loading,
    switchFamily,
  } = useFamily();

  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [tab, setTab] = useState('home');

  // Auto-select first family when visiting this page with none active
  useEffect(() => {
    if (!loading && !activeFamily && myFamilies.length > 0) {
      switchFamily(myFamilies[0].id);
    }
  }, [loading, activeFamily, myFamilies, switchFamily]);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t('family.title')}</h1>
        <div className="card animate-pulse"><div className="h-24 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>
      </div>
    );
  }

  // No family yet — show create/join
  if (myFamilies.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">{t('family.title')}</h1>
        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-2xl bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-accent" />
          </div>
          <h2 className="text-lg font-heading font-bold mb-2">{t('family.sharedBudgeting')}</h2>
          <p className="text-sm text-cream-500 max-w-sm mx-auto mb-6">
            {t('family.sharedBudgetingDesc')}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto">
            <button onClick={() => setShowCreate(true)} className="btn-primary flex-1 flex items-center justify-center gap-2">
              <Plus size={16} /> {t('family.createFamily')}
            </button>
            <button onClick={() => setShowJoin(true)} className="btn-secondary flex-1 flex items-center justify-center gap-2">
              <UserPlus size={16} /> {t('family.joinFamily')}
            </button>
          </div>
        </div>
        <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('family.createAFamily')}>
          <CreateFamilyForm onCreated={() => setShowCreate(false)} />
        </Modal>
        <Modal open={showJoin} onClose={() => setShowJoin(false)} title={t('family.joinAFamily')}>
          <JoinFamilyForm onJoined={() => setShowJoin(false)} />
        </Modal>
      </div>
    );
  }

  const ActiveTab = TAB_COMPONENTS[tab];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{activeFamily?.emoji}</span>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="page-title mb-0">{activeFamily?.name || t('family.title')}</h1>
              <HelpButton section="family" />
            </div>
            <p className="text-xs text-cream-500">
              {members.length !== 1
                ? t('family.memberCountPlural', { count: members.length })
                : t('family.memberCount', { count: members.length })}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="btn-ghost text-xs flex items-center gap-1">
            <Plus size={14} /> {t('family.new')}
          </button>
          <button onClick={() => setShowJoin(true)} className="btn-ghost text-xs flex items-center gap-1">
            <UserPlus size={14} /> {t('family.join')}
          </button>
        </div>
      </div>

      {/* Family switcher */}
      {myFamilies.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {myFamilies.map((f) => (
            <button
              key={f.id}
              onClick={() => switchFamily(f.id)}
              className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                activeFamily?.id === f.id
                  ? 'bg-accent-50 dark:bg-accent-500/15 border-accent text-accent-700 dark:text-accent-300'
                  : 'border-cream-300 dark:border-dark-border text-cream-600 hover:bg-cream-100 dark:hover:bg-dark-border'
              }`}
            >
              {f.emoji} {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex border-b border-cream-200 dark:border-dark-border overflow-x-auto scrollbar-hide">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-xs sm:text-sm font-medium border-b-2 transition-colors -mb-[1px] whitespace-nowrap shrink-0 ${
              tab === tb.id
                ? 'border-accent text-accent-700 dark:text-accent-300'
                : 'border-transparent text-cream-500 hover:text-cream-700'
            }`}
          >
            <tb.icon size={14} />
            {t(tb.labelKey)}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <ActiveTab />

      {/* Modals */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('family.createNewFamily')}>
        <CreateFamilyForm onCreated={() => setShowCreate(false)} />
      </Modal>
      <Modal open={showJoin} onClose={() => setShowJoin(false)} title={t('family.joinAFamily')}>
        <JoinFamilyForm onJoined={() => setShowJoin(false)} />
      </Modal>
    </div>
  );
}
