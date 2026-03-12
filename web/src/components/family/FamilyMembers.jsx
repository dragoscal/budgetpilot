import { useState } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { Crown, Eye, UserPlus, X, Trash2, Ghost } from 'lucide-react';

const VIRTUAL_EMOJIS = ['👤', '👩', '👨', '🧑', '👧', '👦', '🧒', '👩‍🦰', '👨‍🦱', '🧔', '👵', '👴'];

function InviteCodeDisplay({ family }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(family.inviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = family.inviteCode;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-3 p-4 rounded-xl bg-cream-50 dark:bg-dark-bg border border-cream-200 dark:border-dark-border">
      <div className="flex-1">
        <p className="text-xs text-cream-500 mb-1">{t('family.inviteCode')}</p>
        <p className="text-2xl font-mono font-bold tracking-[0.5em]">{family.inviteCode}</p>
        <p className="text-[10px] text-cream-400 mt-1">{t('family.inviteCodeHint')}</p>
      </div>
      <button
        onClick={copyCode}
        className={`p-3 rounded-xl transition-colors ${copied ? 'bg-success/10 text-success' : 'bg-cream-200 dark:bg-dark-border text-cream-600 hover:bg-cream-300'}`}
      >
        {copied ? '✓' : '📋'}
      </button>
    </div>
  );
}

function AddVirtualMemberForm({ onClose }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { createVirtualMember } = useFamily();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('👤');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      await createVirtualMember(name.trim(), emoji);
      toast.success(t('family.virtualMemberAdded'));
      onClose();
    } catch (err) {
      toast.error(err.message || t('family.failedAddMember'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 rounded-xl bg-accent-50/50 dark:bg-accent-500/5 border border-accent/20 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-accent-700 dark:text-accent-300">
        <UserPlus size={14} />
        {t('family.addMember')}
      </div>
      <p className="text-xs text-cream-500">{t('family.addMemberHint')}</p>

      <div className="flex items-end gap-2">
        {/* Emoji picker */}
        <div>
          <label className="text-[10px] text-cream-500 mb-1 block">{t('family.iconLabel')}</label>
          <select
            className="input w-14 text-lg text-center py-1.5"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
          >
            {VIRTUAL_EMOJIS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        {/* Name */}
        <div className="flex-1">
          <label className="text-[10px] text-cream-500 mb-1 block">{t('family.memberName')}</label>
          <input
            className="input text-sm py-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('family.memberNamePlaceholder')}
            autoFocus
            maxLength={50}
          />
        </div>

        {/* Actions */}
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="btn-primary text-xs py-1.5 px-3"
        >
          {loading ? '...' : t('common.add')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-full hover:bg-cream-200 dark:hover:bg-dark-border text-cream-400"
        >
          <X size={16} />
        </button>
      </div>
    </form>
  );
}

export default function FamilyMembers() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { effectiveUserId } = useAuth();
  const { activeFamily, members, isAdmin, updateMember, removeVirtualMember } = useFamily();
  const [showAddForm, setShowAddForm] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const handleRoleChange = async (memberId, newRole) => {
    await updateMember(memberId, { role: newRole });
    toast.success(t('family.roleUpdated'));
  };

  const handleRemoveVirtual = async (memberId, displayName) => {
    setRemovingId(memberId);
    try {
      await removeVirtualMember(memberId);
      toast.success(t('family.virtualMemberRemoved'));
    } catch (err) {
      toast.error(err.message || t('family.failedRemoveMember'));
    } finally {
      setRemovingId(null);
    }
  };

  const realMembers = members.filter((m) => !m.isVirtual);
  const virtualMembers = members.filter((m) => m.isVirtual);

  return (
    <div className="space-y-4">
      <InviteCodeDisplay family={activeFamily} />

      {/* Real members */}
      <div className="space-y-3">
        {realMembers.map((m) => {
          const isMe = m.userId === effectiveUserId;

          return (
            <div
              key={m.id}
              className={`card p-4 ${isMe ? 'border-accent/20' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-cream-200 dark:bg-dark-border flex items-center justify-center text-2xl">
                  {m.emoji || '👤'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm truncate">{m.displayName || 'Member'}</span>
                    {isMe && <span className="text-[10px] text-accent font-medium">{t('family.you')}</span>}
                    {m.role === 'admin' && (
                      <span className="flex items-center gap-0.5 text-[10px] text-warning">
                        <Crown size={10} /> {t('family.admin')}
                      </span>
                    )}
                    {m.role === 'viewer' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-200 dark:bg-dark-border text-cream-500 flex items-center gap-0.5">
                        <Eye size={9} /> {t('family.viewer')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-cream-500">
                    {t('family.joinedDate', { date: new Date(m.joinedAt).toLocaleDateString() })}
                  </p>
                </div>

                {/* Role selector for admins */}
                {isAdmin && !isMe && m.role !== 'admin' && (
                  <select
                    value={m.role}
                    onChange={(e) => handleRoleChange(m.id, e.target.value)}
                    className="text-xs border border-cream-300 dark:border-dark-border rounded-lg px-2 py-1 bg-white dark:bg-dark-card"
                  >
                    <option value="member">{t('family.membersTab')}</option>
                    <option value="viewer">{t('family.viewer')}</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Virtual members section */}
      {virtualMembers.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-cream-500 font-medium flex items-center gap-1.5">
            <Ghost size={12} />
            {t('family.virtualMembers')}
          </p>
          {virtualMembers.map((m) => (
            <div
              key={m.id}
              className="card p-3 flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-cream-200 dark:bg-dark-border flex items-center justify-center text-xl">
                {m.emoji || '👤'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm truncate">{m.displayName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-cream-200 dark:bg-dark-border text-cream-500">
                    {t('family.virtualBadge')}
                  </span>
                </div>
                <p className="text-[11px] text-cream-400">
                  {t('family.virtualHint')}
                </p>
              </div>

              {isAdmin && (
                <button
                  onClick={() => handleRemoveVirtual(m.id, m.displayName)}
                  disabled={removingId === m.id}
                  className="p-1.5 rounded-full hover:bg-danger/10 text-cream-400 hover:text-danger transition-colors"
                  title={t('family.removeMember')}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add virtual member button */}
      {isAdmin && (
        <>
          {showAddForm ? (
            <AddVirtualMemberForm onClose={() => setShowAddForm(false)} />
          ) : (
            <button
              onClick={() => setShowAddForm(true)}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
            >
              <UserPlus size={16} />
              {t('family.addMember')}
            </button>
          )}
        </>
      )}
    </div>
  );
}
