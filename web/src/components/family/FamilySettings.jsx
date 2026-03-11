import { useFamily } from '../../contexts/FamilyContext';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { useTranslation } from '../../contexts/LanguageContext';
import { Eye, LogOut } from 'lucide-react';

export default function FamilySettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { effectiveUserId } = useAuth();
  const {
    activeFamily, members, isAdmin, myMembership,
    updateFamily, updateMember, updateMemberIncome, leaveFamily, MEMBER_EMOJIS,
  } = useFamily();

  const isViewer = myMembership?.role === 'viewer';

  return (
    <div className="space-y-4">
      {isViewer && (
        <div className="p-3 rounded-xl bg-cream-100 dark:bg-dark-border text-cream-500 text-xs font-medium flex items-center gap-2">
          <Eye size={14} /> {t('family.viewerRestricted')}
        </div>
      )}
      <div className="card space-y-4">
        <div>
          <label className="label">{t('family.familyName')}</label>
          <input
            className="input"
            defaultValue={activeFamily?.name}
            onBlur={(e) => {
              if (e.target.value.trim() && e.target.value !== activeFamily?.name) {
                updateFamily({ name: e.target.value.trim() });
                toast.success(t('family.nameUpdated'));
              }
            }}
            disabled={!isAdmin}
          />
        </div>

        <div>
          <label className="label">{t('family.yourDisplayName')}</label>
          <input
            className="input"
            defaultValue={myMembership?.displayName}
            onBlur={(e) => {
              if (e.target.value.trim() && myMembership) {
                updateMember(myMembership.id, { displayName: e.target.value.trim() });
                toast.success(t('family.displayNameUpdated'));
              }
            }}
          />
        </div>

        <div>
          <label className="label">{t('family.monthlyIncome')}</label>
          <input
            type="number"
            className="input"
            defaultValue={myMembership?.monthlyIncome || ''}
            placeholder="0"
            min="0"
            onBlur={(e) => {
              if (myMembership) {
                updateMemberIncome(myMembership.id, e.target.value);
                toast.success(t('family.roleUpdated'));
              }
            }}
          />
          <p className="text-[11px] text-cream-400 mt-1">{t('family.incomeHint')}</p>
        </div>

        <div>
          <label className="label">{t('family.yourEmoji')}</label>
          <div className="flex flex-wrap gap-2">
            {MEMBER_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => {
                  if (myMembership) {
                    updateMember(myMembership.id, { emoji: e });
                    toast.success(t('family.emojiUpdated'));
                  }
                }}
                className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
                  myMembership?.emoji === e ? 'bg-accent-50 dark:bg-accent-500/15 ring-2 ring-accent' : 'bg-cream-100 dark:bg-dark-border hover:bg-cream-200'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Danger zone */}
      <div className="card border-danger/20">
        <h4 className="text-sm font-medium text-danger mb-3">{t('family.dangerZone')}</h4>
        <button
          onClick={async () => {
            if (confirm(t('family.leaveConfirm'))) {
              await leaveFamily(activeFamily.id);
              toast.success(t('family.leftFamily'));
            }
          }}
          className="btn-danger text-xs flex items-center gap-1"
        >
          <LogOut size={14} /> {t('family.leaveFamily')}
        </button>
      </div>
    </div>
  );
}
