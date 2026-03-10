import { useState, useRef, useEffect } from 'react';
import { useFamily } from '../contexts/FamilyContext';
import { useTranslation } from '../contexts/LanguageContext';
import { ChevronDown, User, Users } from 'lucide-react';

export default function FamilyPicker({ collapsed }) {
  const { t } = useTranslation();
  const { myFamilies, activeFamily, switchFamily, isFamilyMode } = useFamily();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Don't show if user has no families
  if (myFamilies.length === 0) return null;

  return (
    <div ref={ref} className="relative px-3 pb-1">
      <button
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors hover:bg-cream-100 dark:hover:bg-cream-800/50 ${
          isFamilyMode ? 'text-accent-600 dark:text-accent-400' : 'text-cream-600 dark:text-cream-400'
        } ${collapsed ? 'justify-center px-2' : ''}`}
      >
        {isFamilyMode ? (
          <>
            <span className="text-base shrink-0">{activeFamily?.emoji}</span>
            {!collapsed && (
              <>
                <span className="truncate">{activeFamily?.name}</span>
                <ChevronDown size={12} className="ml-auto shrink-0" />
              </>
            )}
          </>
        ) : (
          <>
            <User size={16} className="shrink-0" />
            {!collapsed && (
              <>
                <span className="truncate">{t('family.personal')}</span>
                <ChevronDown size={12} className="ml-auto shrink-0" />
              </>
            )}
          </>
        )}
      </button>

      {open && (
        <div className="absolute z-50 left-3 right-3 top-full mt-1 bg-white dark:bg-dark-card border border-cream-200 dark:border-dark-border rounded-xl shadow-xl overflow-hidden" style={{ minWidth: '180px' }}>
          {/* Personal mode */}
          <button
            onClick={() => { switchFamily(null); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left ${
              !isFamilyMode ? 'bg-cream-100 dark:bg-dark-border font-medium' : ''
            }`}
          >
            <User size={14} className="shrink-0 text-cream-500" />
            <span>{t('family.personal')}</span>
          </button>

          {myFamilies.length > 0 && (
            <div className="border-t border-cream-100 dark:border-dark-border">
              <p className="px-3 py-1 text-[10px] uppercase tracking-wider text-cream-400 font-semibold">{t('family.families')}</p>
              {myFamilies.map((f) => (
                <button
                  key={f.id}
                  onClick={() => { switchFamily(f.id); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-cream-100 dark:hover:bg-dark-border transition-colors text-left ${
                    activeFamily?.id === f.id ? 'bg-cream-100 dark:bg-dark-border font-medium' : ''
                  }`}
                >
                  <span className="shrink-0">{f.emoji}</span>
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
