import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { families as familiesApi, familyMembers as membersApi, familyApi } from '../lib/api'
import { settings as settingsApi } from '../lib/api'
import { useAuth } from './AuthContext'
import { generateId } from '../lib/helpers'

const FamilyContext = createContext(null)

const FAMILY_EMOJIS = ['👨‍👩‍👧‍👦', '🏠', '👫', '👪', '🤝', '💜', '🏡', '👨‍👩‍👧']
const MEMBER_EMOJIS = ['😊', '😎', '🤓', '😄', '🥰', '🤗', '🦊', '🐻', '🐱', '🦁', '🐼', '🐵']

export function FamilyProvider({ children }) {
  const { user, effectiveUserId } = useAuth()
  const [myFamilies, setMyFamilies] = useState([])
  const [activeFamily, setActiveFamily] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  // Family feed: visible transactions from all family members
  const [familyFeed, setFamilyFeed] = useState([])
  const [feedLoading, setFeedLoading] = useState(false)

  // Category privacy rules (from settings)
  const [privacyRules, setPrivacyRules] = useState({})

  // Pending email invites for current user
  const [pendingInvites, setPendingInvites] = useState([])

  // ─── Load families on mount ─────────────────────────────
  const loadFamilies = useCallback(async () => {
    setLoading(true)
    try {
      const allFamilies = await familiesApi.getAll()
      const allMembers = await membersApi.getAll()

      const myMembershipIds = new Set(
        allMembers.filter((m) => m.userId === effectiveUserId).map((m) => m.familyId)
      )
      const userFamilies = allFamilies.filter((f) => myMembershipIds.has(f.id))

      setMyFamilies(userFamilies)

      // Restore active family from session
      const savedActive = sessionStorage.getItem('bp_activeFamily')
      if (savedActive && userFamilies.find((f) => f.id === savedActive)) {
        const family = userFamilies.find((f) => f.id === savedActive)
        setActiveFamily(family)
        try {
          const scopedMembers = await familyApi.getAllMembers(family.id)
          setMembers(scopedMembers)
        } catch {
          setMembers(allMembers.filter((m) => m.familyId === family.id))
        }
      }

      // Load pending invites
      try {
        const invites = await familyApi.getPendingInvites()
        setPendingInvites(invites)
      } catch (err) {
        console.warn('Failed to load pending invites:', err.message)
      }

      // Load privacy rules from settings
      try {
        const rules = await settingsApi.get('familyPrivacyRules')
        if (rules && typeof rules === 'object') setPrivacyRules(rules)
      } catch {
        // No rules set yet
      }
    } catch (err) {
      console.error('Failed to load families:', err)
    } finally {
      setLoading(false)
    }
  }, [effectiveUserId])

  useEffect(() => {
    loadFamilies()
  }, [loadFamilies])

  // ─── Family feed ────────────────────────────────────────
  const loadFamilyFeed = useCallback(async (startDate, endDate) => {
    if (!activeFamily) {
      setFamilyFeed([])
      return []
    }
    setFeedLoading(true)
    try {
      const feed = await familyApi.getFeed(activeFamily.id, startDate, endDate)
      setFamilyFeed(feed)
      return feed
    } catch (err) {
      console.error('Failed to load family feed:', err)
      setFamilyFeed([])
      return []
    } finally {
      setFeedLoading(false)
    }
  }, [activeFamily])

  // ─── Privacy rules ──────────────────────────────────────
  const updatePrivacyRules = useCallback(async (newRules) => {
    setPrivacyRules(newRules)
    await settingsApi.set('familyPrivacyRules', newRules)
  }, [])

  // ─── Visibility resolution ──────────────────────────────
  const resolveVisibility = useCallback((category) => {
    const rule = privacyRules[category]
    if (rule === 'private') return 'private'
    return 'family'
  }, [privacyRules])

  // ─── Family management ─────────────────────────────────
  const createFamily = useCallback(async (name, emoji) => {
    const allFamilies = await familiesApi.getAll()
    const allMembers = await membersApi.getAll()
    const myFamilyIds = new Set(
      allMembers.filter((m) => m.userId === effectiveUserId).map((m) => m.familyId)
    )
    const duplicate = allFamilies.find(
      (f) => myFamilyIds.has(f.id) && f.name.toLowerCase().trim() === name.toLowerCase().trim()
    )
    if (duplicate) throw new Error(`You already have a family named "${duplicate.name}"`)

    // Server generates invite code — don't send one from client
    const family = {
      id: generateId(),
      name,
      emoji: emoji || FAMILY_EMOJIS[Math.floor(Math.random() * FAMILY_EMOJIS.length)],
      createdBy: effectiveUserId,
      defaultCurrency: user?.defaultCurrency || 'RON',
      createdAt: new Date().toISOString(),
    }

    const created = await familiesApi.create(family)
    // Server returns the family with server-generated inviteCode
    const familyWithCode = created?.inviteCode ? created : family

    const member = {
      id: generateId(),
      familyId: familyWithCode.id,
      userId: effectiveUserId,
      role: 'admin',
      displayName: user?.name || 'Me',
      emoji: MEMBER_EMOJIS[0],
      monthlyIncome: 0,
      joinedAt: new Date().toISOString(),
    }
    await membersApi.create(member)

    setMyFamilies((prev) => [...prev, familyWithCode])
    setActiveFamily(familyWithCode)
    setMembers([member])
    sessionStorage.setItem('bp_activeFamily', familyWithCode.id)

    return familyWithCode
  }, [effectiveUserId, user])

  const joinFamily = useCallback(async (inviteCode) => {
    const displayName = user?.name || 'Member'
    const emoji = MEMBER_EMOJIS[Math.floor(Math.random() * MEMBER_EMOJIS.length)]

    const result = await familyApi.joinByCode(inviteCode, displayName, emoji)
    const { family, member } = result

    let familyMembers = [member]
    try {
      familyMembers = await familyApi.getAllMembers(family.id)
    } catch { /* fallback */ }

    setMyFamilies((prev) => [...prev, family])
    setActiveFamily(family)
    setMembers(familyMembers)
    sessionStorage.setItem('bp_activeFamily', family.id)

    return family
  }, [user])

  const switchFamily = useCallback(async (familyId) => {
    if (!familyId) {
      setActiveFamily(null)
      setMembers([])
      setFamilyFeed([])
      sessionStorage.removeItem('bp_activeFamily')
      return
    }

    const family = myFamilies.find((f) => f.id === familyId)
    if (!family) return

    setActiveFamily(family)
    try {
      const scopedMembers = await familyApi.getAllMembers(family.id)
      setMembers(scopedMembers)
    } catch {
      const allMembers = await membersApi.getAll()
      setMembers(allMembers.filter((m) => m.familyId === family.id))
    }
    sessionStorage.setItem('bp_activeFamily', family.id)
  }, [myFamilies])

  const updateFamily = useCallback(async (changes) => {
    if (!activeFamily) return
    await familyApi.updateSettings(activeFamily.id, changes)
    const updated = { ...activeFamily, ...changes }
    setActiveFamily(updated)
    setMyFamilies((prev) => prev.map((f) => (f.id === updated.id ? updated : f)))
  }, [activeFamily])

  const leaveFamily = useCallback(async (familyId) => {
    const allMembers = await membersApi.getAll()
    const myMembership = allMembers.find((m) => m.familyId === familyId && m.userId === effectiveUserId)
    if (!myMembership) return

    await membersApi.remove(myMembership.id)

    setMyFamilies((prev) => prev.filter((f) => f.id !== familyId))
    if (activeFamily?.id === familyId) {
      setActiveFamily(null)
      setMembers([])
      setFamilyFeed([])
      sessionStorage.removeItem('bp_activeFamily')
    }
  }, [effectiveUserId, activeFamily])

  // ─── Invites ────────────────────────────────────────────
  const inviteByEmail = useCallback(async (email) => {
    if (!activeFamily) throw new Error('No active family')
    return familyApi.inviteByEmail(activeFamily.id, email)
  }, [activeFamily])

  const acceptInvite = useCallback(async (inviteId) => {
    const result = await familyApi.acceptInvite(inviteId)
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
    await loadFamilies() // Refresh family list
    return result
  }, [loadFamilies])

  const declineInvite = useCallback(async (inviteId) => {
    await familyApi.declineInvite(inviteId)
    setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
  }, [])

  // ─── Member management ─────────────────────────────────
  const updateMember = useCallback(async (memberId, changes) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return
    const updated = { ...member, ...changes }
    await membersApi.update(updated)
    setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)))
  }, [members])

  const updateMemberIncome = useCallback(async (memberId, income) => {
    const member = members.find((m) => m.id === memberId)
    if (!member) return
    const updated = { ...member, monthlyIncome: Number(income) || 0 }
    await membersApi.update(updated)
    setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)))
  }, [members])

  // ─── Derived state ─────────────────────────────────────
  const isFamilyMode = !!activeFamily
  const myMembership = members.find((m) => m.userId === effectiveUserId)
  const isAdmin = myMembership?.role === 'admin'

  const value = useMemo(() => ({
    myFamilies, activeFamily, members, loading, isFamilyMode, isAdmin, myMembership,
    familyFeed, feedLoading,
    privacyRules, updatePrivacyRules, resolveVisibility,
    pendingInvites, inviteByEmail, acceptInvite, declineInvite,
    createFamily, joinFamily, switchFamily, updateFamily, leaveFamily,
    updateMember, updateMemberIncome, loadFamilies, loadFamilyFeed,
    FAMILY_EMOJIS, MEMBER_EMOJIS,
  }), [myFamilies, activeFamily, members, loading, isFamilyMode, isAdmin, myMembership,
    familyFeed, feedLoading,
    privacyRules, updatePrivacyRules, resolveVisibility,
    pendingInvites, inviteByEmail, acceptInvite, declineInvite,
    createFamily, joinFamily, switchFamily, updateFamily, leaveFamily,
    updateMember, updateMemberIncome, loadFamilies, loadFamilyFeed])

  return (
    <FamilyContext.Provider value={value}>
      {children}
    </FamilyContext.Provider>
  )
}

export function useFamily() {
  const ctx = useContext(FamilyContext)
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider')
  return ctx
}
