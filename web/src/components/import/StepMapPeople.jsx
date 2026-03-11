import { useState, useMemo } from 'react';
import { useTranslation } from '../../contexts/LanguageContext';
import { useFamily } from '../../contexts/FamilyContext';
import { useToast } from '../../contexts/ToastContext';
import { ChevronRight, ChevronLeft, Users, User, Plus, Home } from 'lucide-react';

const MEMBER_EMOJIS = ['👤', '👩', '👨', '🧑', '👧', '👦', '🧒', '👩‍🦰', '👨‍🦱', '🧔', '👵', '👴'];

export default function StepMapPeople({ extractedData, personMappings, setPersonMappings, effectiveUserId, onNext, onBack }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { myFamilies, activeFamily, members, createFamily, switchFamily } = useFamily() || {};
  const [creating, setCreating] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyEmoji, setNewFamilyEmoji] = useState('👨‍👩‍👧‍👦');

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
    } else if (value.startsWith('member:')) {
      const memberId = value.replace('member:', '');
      const member = familyMembers.find((m) => m.id === memberId);
      setPersonMappings((prev) => ({
        ...prev,
        [personName]: { type: 'member', memberId, userId: member?.userId || effectiveUserId, displayName: member?.displayName || personName },
      }));
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

      {/* No family prompt */}
      {!hasFamily && uniquePeople.length > 1 && (
        <div className="bg-accent-50/50 dark:bg-accent-500/5 border border-accent/20 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <Home size={16} className="text-accent mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium">{t('import.noFamily')}</p>
              <p className="text-xs text-cream-500 mt-1">{t('import.createFamilyPrompt')}</p>
            </div>
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
            <button onClick={handleCreateFamily} disabled={creating || !newFamilyName.trim()} className="btn-primary text-xs flex items-center gap-1">
              <Plus size={14} /> {t('import.createFamily')}
            </button>
          </div>

          <button onClick={handleImportAsPersonal} className="btn-ghost text-xs">
            {t('import.importAsPersonal')}
          </button>
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

          return (
            <div key={name} className="flex items-center gap-3 p-3 rounded-xl bg-cream-50 dark:bg-dark-card border border-cream-200 dark:border-dark-border">
              {/* Person name */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-lg">👤</span>
                <span className="text-sm font-medium truncate">{name}</span>
              </div>

              <span className="text-cream-300 text-lg">→</span>

              {/* Mapping dropdown */}
              <div className="w-48">
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
                    </option>
                  ))}
                </select>
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
