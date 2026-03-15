import { useState, useEffect } from 'react'
import { useFamily } from '../contexts/FamilyContext'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { useTranslation } from '../contexts/LanguageContext'
import { useCategories } from '../hooks/useCategories'
import { getCategoryLabel } from '../lib/categoryManager'
import Modal from '../components/Modal'
import HelpButton from '../components/HelpButton'
import FamilyMembers from '../components/family/FamilyMembers'
import FamilySettings from '../components/family/FamilySettings'
import {
  Eye, EyeOff, Mail, Users, Shield, Plus, UserPlus,
} from 'lucide-react'

// ─── Inline forms (only used here) ──────────────────────────
function CreateFamilyForm({ onCreated }) {
  const { createFamily, FAMILY_EMOJIS } = useFamily()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState(FAMILY_EMOJIS[0])
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)
    try {
      const family = await createFamily(name.trim(), emoji)
      onCreated?.(family)
    } catch (err) {
      toast.error(err.message || t('family.failedCreate'))
    } finally {
      setLoading(false)
    }
  }

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
  )
}

function JoinFamilyForm({ onJoined }) {
  const { joinFamily } = useFamily()
  const { toast } = useToast()
  const { t } = useTranslation()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true)
    try {
      const family = await joinFamily(code.trim())
      toast.success(t('family.joined', { name: family.name }))
      onJoined?.(family)
    } catch (err) {
      toast.error(err.message || t('family.failedJoin'))
    } finally {
      setLoading(false)
    }
  }

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
  )
}

// ─── Main Family page ────────────────────────────────────────
export default function Family() {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { effectiveUserId } = useAuth()
  const {
    myFamilies, activeFamily, members, loading,
    switchFamily, isFamilyMode, isAdmin,
    pendingInvites, acceptInvite, declineInvite, inviteByEmail,
    privacyRules, updatePrivacyRules,
  } = useFamily()
  const { categories } = useCategories()

  const [showCreate, setShowCreate] = useState(false)
  const [showJoin, setShowJoin] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  // Auto-select first family when visiting this page with none active
  useEffect(() => {
    if (!loading && !activeFamily && myFamilies.length > 0) {
      switchFamily(myFamilies[0].id)
    }
  }, [loading, activeFamily, myFamilies, switchFamily])

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="page-title">{t('family.title')}</h1>
        <div className="card animate-pulse"><div className="h-24 bg-cream-200 dark:bg-dark-border rounded-lg" /></div>
      </div>
    )
  }

  // No family yet — show create/join
  if (myFamilies.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="page-title">{t('family.title')}</h1>
        <div className="card text-center py-12">
          <div className="w-16 h-16 rounded-lg bg-accent-50 dark:bg-accent-500/15 flex items-center justify-center mx-auto mb-4">
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
    )
  }

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

      {/* Pending invites banner */}
      {pendingInvites.length > 0 && (
        <div className="space-y-2">
          {pendingInvites.map(invite => (
            <div key={invite.id} className="card p-4 flex items-center justify-between border-l-4 border-accent">
              <div>
                <span className="font-medium">{invite.familyEmoji} {invite.familyName}</span>
                <span className="text-sm text-cream-500 ml-2">
                  {invite.inviterName} {t('family.invite.pending')}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={async () => {
                  try {
                    await acceptInvite(invite.id)
                    toast.success(t('family.invite.accepted') || 'Accepted!')
                  } catch (err) {
                    toast.error(err.message || t('common.error'))
                  }
                }} className="btn-primary text-sm px-3 py-1">
                  {t('family.invite.accept')}
                </button>
                <button onClick={async () => {
                  try {
                    await declineInvite(invite.id)
                  } catch (err) {
                    toast.error(err.message || t('common.error'))
                  }
                }} className="btn-secondary text-sm px-3 py-1">
                  {t('family.invite.decline')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Members section with invite button */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading text-lg flex items-center gap-2">
            <Users size={18} />
            {t('family.membersTab')}
          </h3>
          {isAdmin && (
            <button onClick={() => setShowInviteModal(true)} className="btn-secondary text-sm flex items-center gap-1">
              <Mail size={14} />
              {t('family.invite.title')}
            </button>
          )}
        </div>
        <FamilyMembers />
      </div>

      {/* Privacy rules section */}
      {isFamilyMode && (
        <div className="card p-4">
          <h3 className="font-heading text-lg mb-3 flex items-center gap-2">
            <Shield size={18} />
            {t('family.privacy.title')}
          </h3>
          <p className="text-xs text-cream-500 mb-3">{t('family.privacy.description') || 'Choose which categories are shared with your family by default.'}</p>
          <div className="space-y-2">
            {categories
              .filter(cat => !['income', 'transfer'].includes(cat.id))
              .map(cat => (
              <div key={cat.id} className="flex items-center justify-between py-1.5">
                <span className="flex items-center gap-2">
                  <span>{cat.icon}</span>
                  <span className="text-sm">{getCategoryLabel(cat, t)}</span>
                </span>
                <button
                  onClick={() => {
                    const newRules = { ...privacyRules }
                    if (newRules[cat.id] === 'private') {
                      delete newRules[cat.id]
                    } else {
                      newRules[cat.id] = 'private'
                    }
                    updatePrivacyRules(newRules)
                  }}
                  className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${
                    privacyRules[cat.id] === 'private'
                      ? 'bg-cream-100 dark:bg-dark-border text-cream-600 dark:text-cream-300'
                      : 'bg-accent-50 dark:bg-accent-500/15 text-accent-700 dark:text-accent-300'
                  }`}
                >
                  {privacyRules[cat.id] === 'private' ? <EyeOff size={12} /> : <Eye size={12} />}
                  {privacyRules[cat.id] === 'private' ? t('family.privacy.private') : t('family.privacy.shared')}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Settings section */}
      <FamilySettings />

      {/* Modals */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={t('family.createNewFamily')}>
        <CreateFamilyForm onCreated={() => setShowCreate(false)} />
      </Modal>
      <Modal open={showJoin} onClose={() => setShowJoin(false)} title={t('family.joinAFamily')}>
        <JoinFamilyForm onJoined={() => setShowJoin(false)} />
      </Modal>

      {/* Email invite modal */}
      {showInviteModal && (
        <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title={t('family.invite.title')}>
          {/* Invite code display */}
          <div className="mb-4">
            <label className="text-sm text-cream-500 mb-1 block">{t('family.invite.code')}</label>
            <div className="flex items-center gap-2">
              <code className="bg-cream-100 dark:bg-dark-border px-3 py-2 rounded font-mono text-lg tracking-widest flex-1 text-center">
                {activeFamily?.inviteCode}
              </code>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(activeFamily?.inviteCode || '')
                    toast.success(t('common.copied') || 'Copied!')
                  } catch {
                    toast.error(t('common.error'))
                  }
                }}
                className="btn-secondary text-sm px-3 py-1.5"
              >
                {t('common.copy') || 'Copy'}
              </button>
            </div>
          </div>
          {/* Email invite form */}
          <form onSubmit={async (e) => {
            e.preventDefault()
            try {
              await inviteByEmail(inviteEmail)
              toast.success(t('family.invite.sent') || 'Invite sent!')
              setInviteEmail('')
              setShowInviteModal(false)
            } catch (err) {
              toast.error(err.message)
            }
          }}>
            <label className="text-sm text-cream-500 mb-1 block">{t('family.invite.email')}</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="input flex-1"
                placeholder="ana@email.com"
                required
              />
              <button type="submit" className="btn-primary text-sm px-4 flex items-center gap-1">
                <Mail size={14} />
                {t('common.add')}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
