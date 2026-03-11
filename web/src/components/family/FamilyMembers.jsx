import { useState, useMemo } from 'react';
import { useFamily } from '../../contexts/FamilyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { formatCurrency, sumBy } from '../../lib/helpers';
import { Crown, Eye } from 'lucide-react';
import { startOfMonth, endOfMonth } from 'date-fns';

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
  const { activeFamily, members, isAdmin, familyTransactions, updateMember } = useFamily();

  // Calculate per-member spending stats for this month
  const memberStats = useMemo(() => {
    const now = new Date();
    const mStart = startOfMonth(now);
    const mEnd = endOfMonth(now);
    const stats = {};

    for (const m of members) {
      const memberTx = familyTransactions.filter((tx) => tx.userId === m.userId);
      const thisMonth = memberTx.filter((tx) => {
        const d = new Date(tx.date);
        return d >= mStart && d <= mEnd && tx.type === 'expense';
      });
      stats[m.userId] = {
        spentThisMonth: sumBy(thisMonth, 'amount'),
        txCount: thisMonth.length,
        totalTx: memberTx.length,
      };
    }
    return stats;
  }, [members, familyTransactions]);

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
          const stats = memberStats[m.userId] || {};

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

              {/* Spending stats */}
              <div className="flex gap-4 mt-3 pt-3 border-t border-cream-100 dark:border-dark-border">
                <div>
                  <p className="text-[10px] text-cream-400 uppercase tracking-wider">{t('family.spentThisMonth')}</p>
                  <p className="text-sm font-heading font-bold money">
                    {formatCurrency(stats.spentThisMonth || 0, activeFamily?.defaultCurrency || 'RON')}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-cream-400 uppercase tracking-wider">{t('family.txThisMonth')}</p>
                  <p className="text-sm font-heading font-bold">{stats.txCount || 0}</p>
                </div>
                <div>
                  <p className="text-[10px] text-cream-400 uppercase tracking-wider">{t('family.totalTx')}</p>
                  <p className="text-sm font-heading font-bold">{stats.totalTx || 0}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
