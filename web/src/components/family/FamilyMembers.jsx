import { useState } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { Crown, Eye } from 'lucide-react';

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

export default function FamilyMembers() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { effectiveUserId } = useAuth();
  const { activeFamily, members, isAdmin, updateMember } = useFamily();

  const handleRoleChange = async (memberId, newRole) => {
    await updateMember(memberId, { role: newRole });
    toast.success(t('family.roleUpdated'));
  };

  return (
    <div className="space-y-4">
      <InviteCodeDisplay family={activeFamily} />

      <div className="space-y-3">
        {members.map((m) => {
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
    </div>
  );
}
