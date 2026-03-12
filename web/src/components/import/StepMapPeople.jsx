import { useState, useMemo } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useToast } from '../../contexts/ToastContext';
import { ChevronRight, ChevronLeft, Users, Plus, Home, UserPlus } from 'lucide-react';

const MEMBER_EMOJIS = ['👤', '👩', '👨', '🧑', '👧', '👦', '🧒', '👩‍🦰', '👨‍🦱', '🧔', '👵', '👴'];

export default function StepMapPeople({ extractedData, personMappings, setPersonMappings, effectiveUserId, onNext, onBack }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { myFamilies, activeFamily, members, createFamily, switchFamily, createVirtualMember } = useFamily() || {};
  const [creating, setCreating] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyEmoji, setNewFamilyEmoji] = useState('👨‍👩‍👧‍👦');
  const [addingMember, setAddingMember] = useState(null); // person name being quick-added

  // Get unique person names
  const uniquePeople = useMemo(() => {
    const people = new Set();
    extractedData.forEach((row) => people.add(row.person));
    return [...people];
  }, [extractedData]);

  const hasFamily = myFamilies && myFamilies.length > 0;
  const familyMembers = members || [];

  const handleMappingChange = (personName, value) => {
    if (value === '__personal__') {
      setPersonMappings((prev) => ({
        ...prev,
        [personName]: { type: 'personal', userId: effectiveUserId },
      }));
    } else if (value === '__add_new__') {
      // Trigger quick-add for this person
      handleQuickAddMember(personName);
    } else if (value.startsWith('member:')) {
      const memberId = value.replace('member:', '');
      const member = familyMembers.find((m) => m.id === memberId);
      setPersonMappings((prev) => ({
        ...prev,
        [personName]: { type: 'member', memberId, userId: member?.userId || effectiveUserId, displayName: member?.displayName || personName },
      }));
    }
  };

  /** Quick-add: create a virtual family member directly from the dropdown */
  const handleQuickAddMember = async (personName) => {
    if (!activeFamily || !createVirtualMember) return;
    setAddingMember(personName);
    try {
      const emoji = MEMBER_EMOJIS[Math.floor(Math.random() * MEMBER_EMOJIS.length)];
      const newMember = await createVirtualMember(personName, emoji);
      // Auto-map to the newly created member
      setPersonMappings((prev) => ({
        ...prev,
        [personName]: {
          type: 'member',
          memberId: newMember.id,
          userId: newMember.userId || effectiveUserId,
          displayName: newMember.displayName || personName,
        },
      }));
      toast.success(t('import.memberCreated') || `${personName} added as family member`);
    } catch (err) {
      console.error('Quick-add member error:', err);
      toast.error(err.message || t('family.failedAddMember'));
    } finally {
      setAddingMember(null);
    }
  };

  const handleCreateFamily = async () => {
    if (!newFamilyName.trim()) return;
    setCreating(true);
    try {
      const family = await createFamily(newFamilyName.trim(), newFamilyEmoji);
      if (family?.id) {
        await switchFamily(family.id);
        toast.success(t('import.familyCreated'));
      }
    } catch (err) {
      console.error('Create family error:', err);
      toast.error(err.message);
    } finally {
      setCreating(false);
      setNewFamilyName('');
    }
  };

  const handleImportAsPersonal = () => {
    const mappings = {};
    uniquePeople.forEach((name) => {
      mappings[name] = { type: 'personal', userId: effectiveUserId };
    });
    setPersonMappings(mappings);
    onNext();
  };

  /** Auto-create family + virtual members for all people in one click */
  const handleAutoSetup = async () => {
    if (uniquePeople.length < 2) return;
    setCreating(true);
    try {
      // Create family if none exists
      let family = activeFamily;
      if (!hasFamily) {
        family = await createFamily(
          t('family.defaultName') || 'My Family',
          '🏠'
        );
        if (family?.id) await switchFamily(family.id);
      }
      if (!family) throw new Error('Failed to create family');

      // Create virtual members for each person except the first (which maps to current user)
      const mappings = {};
      for (let i = 0; i < uniquePeople.length; i++) {
        const name = uniquePeople[i];
        if (i === 0) {
          // First person → current user
          mappings[name] = { type: 'personal', userId: effectiveUserId };
        } else {
          // Create virtual member
          const emoji = MEMBER_EMOJIS[i % MEMBER_EMOJIS.length];
          try {
            const newMember = await createVirtualMember(name, emoji);
            mappings[name] = {
              type: 'member',
              memberId: newMember.id,
              userId: newMember.userId || effectiveUserId,
              displayName: name,
            };
          } catch (err) {
            console.warn(`Failed to create member ${name}:`, err);
            // Fallback to personal
            mappings[name] = { type: 'personal', userId: effectiveUserId };
          }
        }
      }
      setPersonMappings(mappings);
      toast.success(t('import.autoSetupDone') || 'Family setup complete!');
    } catch (err) {
      console.error('Auto-setup error:', err);
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Auto-skip if only 1 person → map to current user
  const autoMapped = uniquePeople.length === 1;
  if (autoMapped && !personMappings[uniquePeople[0]]) {
    setPersonMappings({ [uniquePeople[0]]: { type: 'personal', userId: effectiveUserId } });
  }

  const allMapped = uniquePeople.every((name) => personMappings[name]);

  return (
    <div className="space-y-5">
      <div>
        <h3 className="section-title flex items-center gap-2"><Users size={16} /> {t('import.mapPeople')}</h3>
        <p className="text-xs text-cream-500">{t('import.mapPeopleHint')}</p>
      </div>

      {/* No family + multiple people → offer quick setup */}
      {!hasFamily && uniquePeople.length > 1 && (
        <div className="bg-accent-50/50 dark:bg-accent-500/5 border border-accent/20 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Home size={16} className="text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('import.noFamily')}</p>
              <p className="text-xs text-cream-500 mt-1">{t('import.createFamilyPrompt')}</p>
            </div>
          </div>

          {/* Quick auto-setup button */}
          <button
            onClick={handleAutoSetup}
            disabled={creating}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            <UserPlus size={16} />
            {creating
              ? (t('import.settingUp') || 'Setting up...')
              : (t('import.autoSetup') || `Create family & add ${uniquePeople.length} members`)}
          </button>

          {/* Manual options */}
          <div className="flex items-center gap-2 text-[10px] text-cream-400 before:flex-1 before:h-px before:bg-cream-200 dark:before:bg-dark-border after:flex-1 after:h-px after:bg-cream-200 dark:after:bg-dark-border">
            {t('common.or') || 'or'}
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs text-cream-500 mb-1 block">{t('family.familyName')}</label>
              <input
                className="input text-sm"
                value={newFamilyName}
                onChange={(e) => setNewFamilyName(e.target.value)}
                placeholder={t('family.familyNamePlaceholder')}
              />
            </div>
            <select className="input w-16 text-lg" value={newFamilyEmoji} onChange={(e) => setNewFamilyEmoji(e.target.value)}>
              {['👨‍👩‍👧‍👦', '🏠', '👪', '💑', '👫', '🏡', '🫂', '❤️'].map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
            <button onClick={handleCreateFamily} disabled={creating || !newFamilyName.trim()} className="btn-secondary text-xs flex items-center gap-1">
              <Plus size={14} /> {t('import.createFamily')}
            </button>
          </div>

          <button onClick={handleImportAsPersonal} className="btn-ghost text-xs w-full">
            {t('import.importAsPersonal')}
          </button>
        </div>
      )}

      {/* Has family but needs to map people */}
      {hasFamily && uniquePeople.length > 1 && !allMapped && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-accent-50/50 dark:bg-accent-500/5 border border-accent/20">
          <UserPlus size={14} className="text-accent mt-0.5 shrink-0" />
          <div className="text-xs text-cream-600 dark:text-cream-400">
            <p>{t('import.mapHint') || 'Map each person to a family member. Select "Add as new member" to create a new household member without an account.'}</p>
          </div>
        </div>
      )}

      {/* Person mapping list */}
      <div className="space-y-2">
        {uniquePeople.map((name) => {
          const mapping = personMappings[name];
          const currentValue = mapping?.type === 'personal'
            ? '__personal__'
            : mapping?.memberId
              ? `member:${mapping.memberId}`
              : '';
          const isAdding = addingMember === name;

          return (
            <div key={name} className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 dark:bg-dark-card border border-cream-200 dark:border-dark-border">
              {/* Person name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg">👤</span>
                <span className="text-sm font-medium truncate">{name}</span>
              </div>

              <span className="text-cream-300 text-lg">→</span>

              {/* Mapping dropdown */}
              <div className="w-52">
                {isAdding ? (
                  <div className="text-xs text-accent-600 dark:text-accent-400 py-1.5 px-2 animate-pulse">
                    {t('import.addingMember') || 'Adding...'}
                  </div>
                ) : (
                  <select
                    className="input text-sm py-1.5"
                    value={currentValue}
                    onChange={(e) => handleMappingChange(name, e.target.value)}
                  >
                    <option value="">{t('import.selectPerson')}</option>
                    <option value="__personal__">🙋 {t('import.personalOnly')}</option>
                    {familyMembers.map((m) => (
                      <option key={m.id} value={`member:${m.id}`}>
                        {m.emoji || '👤'} {m.displayName || m.userId}
                        {m.isVirtual ? '' : ' ✓'}
                      </option>
                    ))}
                    {/* Quick-add option (only when family exists) */}
                    {hasFamily && (
                      <option value="__add_new__">➕ {t('import.addAsNewMember') || `Add "${name}" as member`}</option>
                    )}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button onClick={onBack} className="btn-ghost flex items-center gap-1">
          <ChevronLeft size={16} /> {t('common.back')}
        </button>
        <button onClick={onNext} disabled={!allMapped} className="btn-primary flex items-center gap-2">
          {t('common.next')} <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
