import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { families as familiesApi, familyMembers as membersApi, familyApi, transactions as txApi, sharedExpenses as sharedApi } from '../lib/api';
import { useAuth } from './AuthContext';
import { generateId } from '../lib/helpers';

const FamilyContext = createContext(null);

const FAMILY_EMOJIS = ['👨‍👩‍👧‍👦', '🏠', '👫', '👪', '🤝', '💜', '🏡', '👨‍👩‍👧'];
const MEMBER_EMOJIS = ['😊', '😎', '🤓', '😄', '🥰', '🤗', '🦊', '🐻', '🐱', '🦁', '🐼', '🐵'];

function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  // Use crypto.getRandomValues for better entropy (#19)
  const randomBytes = new Uint8Array(8);
  crypto.getRandomValues(randomBytes);
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[randomBytes[i] % chars.length];
  return code;
}

/** Generate an invite code guaranteed unique among existing families */
async function generateUniqueInviteCode() {
  const existing = await familiesApi.getAll();
  const usedCodes = new Set(existing.map((f) => f.inviteCode));
  let code;
  let attempts = 0;
  do {
    code = generateInviteCode();
    attempts++;
  } while (usedCodes.has(code) && attempts < 50);
  return code;
}

export function FamilyProvider({ children }) {
  const { user, effectiveUserId } = useAuth();
  const [myFamilies, setMyFamilies] = useState([]);
  const [activeFamily, setActiveFamily] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [familyTransactions, setFamilyTransactions] = useState([]);
  const [familyTransactionsLoading, setFamilyTransactionsLoading] = useState(false);
  const [sharedExpensesList, setSharedExpensesList] = useState([]);

  // Guard against stale async responses when switching families rapidly
  const familyTxRequestId = useRef(0);

  const loadFamilies = useCallback(async () => {
    setLoading(true);
    try {
      const allFamilies = await familiesApi.getAll();
      const allMembers = await membersApi.getAll();

      // Families where the current user is a member
      const myMembershipIds = new Set(
        allMembers.filter((m) => m.userId === effectiveUserId).map((m) => m.familyId)
      );
      const userFamilies = allFamilies.filter((f) => myMembershipIds.has(f.id));

      // Self-heal: generate invite codes for families that are missing them
      for (const fam of userFamilies) {
        if (!fam.inviteCode && fam.createdBy === effectiveUserId) {
          const code = generateInviteCode();
          fam.inviteCode = code;
          familiesApi.update(fam.id, { inviteCode: code }).catch(e => console.warn('Failed to save invite code:', e));
        }
      }

      setMyFamilies(userFamilies);

      // Restore active family from sessionStorage (default to personal mode)
      const savedActive = sessionStorage.getItem('bp_activeFamily');
      if (savedActive && userFamilies.find((f) => f.id === savedActive)) {
        const family = userFamilies.find((f) => f.id === savedActive);
        setActiveFamily(family);
        // Use scoped endpoint to get ALL members (including other users + virtual)
        try {
          const scopedMembers = await familyApi.getAllMembers(family.id);
          setMembers(scopedMembers);
        } catch {
          // Fallback to filtered local data
          setMembers(allMembers.filter((m) => m.familyId === family.id));
        }
      }
    } catch (err) {
      console.error('Failed to load families:', err);
    } finally {
      setLoading(false);
    }
  }, [effectiveUserId]);

  // Load families on mount
  useEffect(() => {
    loadFamilies();
  }, [loadFamilies]);

  // Load all family members' transactions + shared expenses when family is active
  const loadFamilyTransactions = useCallback(async () => {
    if (!activeFamily || members.length === 0) {
      setFamilyTransactions([]);
      setSharedExpensesList([]);
      return;
    }

    // Increment request ID to invalidate any in-flight request
    const requestId = ++familyTxRequestId.current;

    setFamilyTransactionsLoading(true);
    try {
      const memberUserIds = new Set(members.map((m) => m.userId));
      // Load all transactions and filter to family members
      const allTx = await txApi.getAll();
      // Bail if a newer request has been issued (user switched families)
      if (requestId !== familyTxRequestId.current) return;
      const familyTx = allTx.filter((tx) => memberUserIds.has(tx.userId));
      setFamilyTransactions(familyTx);

      // Load shared expenses for this family
      const shared = await sharedApi.getAll({ familyId: activeFamily.id });
      if (requestId !== familyTxRequestId.current) return;
      setSharedExpensesList(shared);
    } catch (err) {
      // Only log if this is still the active request
      if (requestId === familyTxRequestId.current) {
        console.error('Failed to load family transactions:', err);
      }
    } finally {
      if (requestId === familyTxRequestId.current) {
        setFamilyTransactionsLoading(false);
      }
    }
  }, [activeFamily, members]);

  useEffect(() => {
    loadFamilyTransactions();
  }, [loadFamilyTransactions]);

  const createFamily = useCallback(async (name, emoji) => {
    // Check for duplicate family name among user's families
    const allFamilies = await familiesApi.getAll();
    const allMembers = await membersApi.getAll();
    const myFamilyIds = new Set(
      allMembers.filter((m) => m.userId === effectiveUserId).map((m) => m.familyId)
    );
    const duplicate = allFamilies.find(
      (f) => myFamilyIds.has(f.id) && f.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
    if (duplicate) {
      throw new Error(`You already have a family named "${duplicate.name}"`);
    }

    // Generate collision-free invite code
    const inviteCode = await generateUniqueInviteCode();

    const family = {
      id: generateId(),
      name,
      emoji: emoji || FAMILY_EMOJIS[Math.floor(Math.random() * FAMILY_EMOJIS.length)],
      createdBy: effectiveUserId,
      inviteCode,
      defaultCurrency: user?.defaultCurrency || 'RON',
      createdAt: new Date().toISOString(),
    };

    await familiesApi.create(family);

    // Add creator as admin member
    const member = {
      id: generateId(),
      familyId: family.id,
      userId: effectiveUserId,
      role: 'admin',
      displayName: user?.name || 'Me',
      emoji: MEMBER_EMOJIS[0],
      monthlyIncome: 0,
      joinedAt: new Date().toISOString(),
    };
    await membersApi.create(member);

    setMyFamilies((prev) => [...prev, family]);
    setActiveFamily(family);
    setMembers([member]);
    sessionStorage.setItem('bp_activeFamily', family.id);

    return family;
  }, [effectiveUserId, user]);

  const joinFamily = useCallback(async (inviteCode) => {
    // Use server-side join endpoint (searches ALL families, not just user's)
    const displayName = user?.name || 'Member';
    const emoji = MEMBER_EMOJIS[Math.floor(Math.random() * MEMBER_EMOJIS.length)];

    const result = await familyApi.joinByCode(inviteCode, displayName, emoji);
    const { family, member } = result;

    // Load full members list for this family
    let familyMembers = [member];
    try {
      familyMembers = await familyApi.getAllMembers(family.id);
    } catch {
      // Fallback — just use the new member
    }

    setMyFamilies((prev) => [...prev, family]);
    setActiveFamily(family);
    setMembers(familyMembers);
    sessionStorage.setItem('bp_activeFamily', family.id);

    return family;
  }, [effectiveUserId, user]);

  const switchFamily = useCallback(async (familyId) => {
    if (!familyId) {
      // Switch to personal mode
      setActiveFamily(null);
      setMembers([]);
      sessionStorage.removeItem('bp_activeFamily');
      return;
    }

    const family = myFamilies.find((f) => f.id === familyId);
    if (!family) return;

    setActiveFamily(family);
    // Use scoped endpoint to get ALL members (including virtual)
    try {
      const scopedMembers = await familyApi.getAllMembers(family.id);
      setMembers(scopedMembers);
    } catch {
      // Fallback to generic endpoint
      const allMembers = await membersApi.getAll();
      setMembers(allMembers.filter((m) => m.familyId === family.id));
    }
    sessionStorage.setItem('bp_activeFamily', family.id);
  }, [myFamilies, effectiveUserId]);

  const updateFamily = useCallback(async (changes) => {
    if (!activeFamily) return;
    const updated = { ...activeFamily, ...changes };
    await familiesApi.update(updated);
    setActiveFamily(updated);
    setMyFamilies((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, [activeFamily]);

  const leaveFamily = useCallback(async (familyId) => {
    const allMembers = await membersApi.getAll();
    const myMembership = allMembers.find((m) => m.familyId === familyId && m.userId === effectiveUserId);
    if (!myMembership) return;

    await membersApi.remove(myMembership.id);

    setMyFamilies((prev) => prev.filter((f) => f.id !== familyId));
    if (activeFamily?.id === familyId) {
      setActiveFamily(null);
      setMembers([]);
      sessionStorage.removeItem('bp_activeFamily');
    }
  }, [effectiveUserId, activeFamily]);

  const createVirtualMember = useCallback(async (displayName, emoji) => {
    if (!activeFamily) throw new Error('No active family');
    const member = await familyApi.addVirtualMember(activeFamily.id, displayName, emoji);
    setMembers((prev) => [...prev, member]);
    return member;
  }, [activeFamily]);

  const removeVirtualMember = useCallback(async (memberId) => {
    if (!activeFamily) return;
    await familyApi.removeVirtualMember(activeFamily.id, memberId);
    setMembers((prev) => prev.filter((m) => m.id !== memberId));
  }, [activeFamily]);

  const linkVirtualMember = useCallback(async (virtualMemberId, realMemberId) => {
    if (!activeFamily) return;
    await familyApi.linkVirtualToReal(activeFamily.id, virtualMemberId, realMemberId);
    // Remove the virtual member from local state (it was merged into the real one)
    setMembers((prev) => {
      const virtual = prev.find((m) => m.id === virtualMemberId);
      return prev
        .filter((m) => m.id !== virtualMemberId)
        .map((m) => {
          // Update real member with virtual's displayName/emoji if they were transferred
          if (m.id === realMemberId && virtual) {
            return {
              ...m,
              displayName: m.displayName || virtual.displayName,
              emoji: (m.emoji === '👤' && virtual.emoji) ? virtual.emoji : m.emoji,
            };
          }
          return m;
        });
    });
  }, [activeFamily]);

  const updateMember = useCallback(async (memberId, changes) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const updated = { ...member, ...changes };
    await membersApi.update(updated);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
  }, [members]);

  const updateMemberIncome = useCallback(async (memberId, income) => {
    const member = members.find((m) => m.id === memberId);
    if (!member) return;
    const updated = { ...member, monthlyIncome: Number(income) || 0 };
    await membersApi.update(updated);
    setMembers((prev) => prev.map((m) => (m.id === memberId ? updated : m)));
  }, [members]);

  const isFamilyMode = !!activeFamily;
  const myMembership = members.find((m) => m.userId === effectiveUserId);
  const isAdmin = myMembership?.role === 'admin';

  const value = useMemo(() => ({
    myFamilies, activeFamily, members, loading, isFamilyMode, isAdmin, myMembership,
    familyTransactions, familyTransactionsLoading, sharedExpensesList,
    createFamily, joinFamily, switchFamily, updateFamily, leaveFamily,
    createVirtualMember, removeVirtualMember, linkVirtualMember,
    updateMember, updateMemberIncome, loadFamilies, loadFamilyTransactions,
    FAMILY_EMOJIS, MEMBER_EMOJIS,
  }), [myFamilies, activeFamily, members, loading, isFamilyMode, isAdmin, myMembership,
    familyTransactions, familyTransactionsLoading, sharedExpensesList,
    createFamily, joinFamily, switchFamily, updateFamily, leaveFamily,
    createVirtualMember, removeVirtualMember, linkVirtualMember,
    updateMember, updateMemberIncome, loadFamilies, loadFamilyTransactions]);

  return (
    <FamilyContext.Provider value={value}>
      {children}
    </FamilyContext.Provider>
  );
}

export function useFamily() {
  const ctx = useContext(FamilyContext);
  if (!ctx) throw new Error('useFamily must be used within FamilyProvider');
  return ctx;
}
