# BudgetPilot Family Redesign — Design Spec

**Date:** 2026-03-15
**Status:** Draft
**Author:** Dragos + Claude

## Problem Statement

The current family feature has critical bugs and a flawed architecture:
1. **Family members can't see each other's expenses** — `FamilyContext.jsx:111` calls `txApi.getAll()` which only returns the current user's transactions. The dedicated endpoint `/api/families/:familyId/transactions` exists but is never called.
2. **Invite codes are client-side generated** with no `UNIQUE` constraint — race conditions cause duplicate/orphaned codes.
3. **Settlement system is broken** — references a `splits` column that doesn't exist in the schema.
4. **No privacy controls** — transactions are either personal or household with no granularity.
5. **Overcomplicated** — virtual members, expense splitting, settlement history add complexity without delivering value for a couple's use case.

## Design Philosophy

**"Shared Lens with Smart Defaults"** — Family is a view layer, not a separate data model. Each person keeps their own transactions. When you're in a family, you see each other's data through a shared lens, with category-level privacy rules to keep some things private.

## Requirements

### Must Have
- See all family expenses in Dashboard, Transactions, Budgets, Analytics
- Filter by: All (household) / Mine / [Partner name]
- Keep individual transactions or entire categories private
- Shared family budgets (count all visible family spending)
- Shared family goals (both members contribute)
- Working invite code (server-side, unique) + email invite
- Privacy rules per category (shared or private, configurable)
- Per-transaction visibility override (eye icon toggle)

### Won't Have (removed from current system)
- Expense splitting / "who owes whom"
- Settlement tracking
- Virtual (non-account) members
- Shared expenses table (separate from transactions)
- "Household" scope on transactions

---

## Privacy Model

### Three Layers

```
Layer 1: GLOBAL DEFAULT
  All transactions visible to family by default

Layer 2: CATEGORY RULES (per user, stored in settings)
  Override global default for specific categories
  Example: gifts=private, personal_care=private

Layer 3: PER-TRANSACTION OVERRIDE
  Eye icon on any transaction flips visibility
  Always wins over category rule
```

### Visibility Column

New column on `transactions`: `visibility TEXT` (nullable).

| Value | Meaning |
|-------|---------|
| `NULL` | Not set — pre-migration or pre-family transactions. Excluded from family feed (safe default). |
| `'family'` | Visible to family members. |
| `'private'` | Only visible to the owner. |

### Resolution Logic (client-side, at transaction creation)

```javascript
function resolveVisibility(category, privacyRules) {
  // Check category rule
  const rule = privacyRules[category]
  if (rule === 'private') return 'private'
  // Default: shared with family
  return 'family'
}
```

The frontend sets `visibility` before sending to the API. The server just stores it. This keeps the server simple and ensures private transactions never leave the user's own API responses.

### Category Privacy Rules

Stored in the existing `settings` table as a JSON value under key `familyPrivacyRules`:

```json
{
  "gifts": "private",
  "personal_care": "private",
  "health": "private"
}
```

Categories not listed default to `'family'` (shared). Users configure this in **Family page > My Privacy Rules**.

Rules only apply to NEW transactions. Changing a rule does NOT retroactively modify existing transactions — what your partner already saw stays visible, what was private stays private.

### Join-Time Boundary

When a user joins a family, their existing transactions have `visibility = NULL` and are excluded from the family feed. Only transactions created AFTER joining are shared (based on category rules).

The family feed query enforces this:
```sql
WHERE t.visibility = 'family'
  AND t.createdAt >= fm.joinedAt
```

Users can manually share older transactions by setting `visibility = 'family'` via the eye icon.

### Budget Counting

- **Family budgets** (`budgets.familyId IS NOT NULL`): Count only transactions where `visibility = 'family'` from ALL family members in that category.
- **Personal budgets** (`budgets.familyId IS NULL`): Count ALL the user's own transactions regardless of visibility.

This means: if you mark a grocery transaction as private, it won't count toward the family grocery budget, but it still counts toward your personal grocery budget. The family budget numbers reflect what everyone can see.

---

## Schema Changes

### Migration 013: Family Redesign

```sql
-- 013_family_redesign.sql

-- 1. Add visibility to transactions (NULL = not set, treated as private in feed)
ALTER TABLE transactions ADD COLUMN visibility TEXT;

-- 2. Add familyId to goals (for shared family goals)
ALTER TABLE goals ADD COLUMN familyId TEXT;

-- 3. Backfill NULL invite codes on existing families so UNIQUE index works
UPDATE families SET inviteCode = hex(randomblob(4)) WHERE inviteCode IS NULL;

-- 4. Unique constraint on invite codes (prevent duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_families_inviteCode
  ON families(inviteCode);

-- 5. Family invites table (for in-app email-based invitations)
-- Note: "email invite" means in-app notification on login, not actual email delivery.
-- When the invited user logs in, they see a banner to accept/decline.
CREATE TABLE IF NOT EXISTS family_invites (
  id TEXT PRIMARY KEY,
  familyId TEXT NOT NULL,
  email TEXT NOT NULL,
  invitedBy TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (familyId) REFERENCES families(id),
  FOREIGN KEY (invitedBy) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_family_invites_email ON family_invites(email);
CREATE INDEX IF NOT EXISTS idx_family_invites_familyId ON family_invites(familyId);

-- 6. Index on visibility for feed queries
CREATE INDEX IF NOT EXISTS idx_transactions_visibility ON transactions(visibility);

-- 7. Drop old family tables (no longer needed)
DROP TABLE IF EXISTS shared_expenses;
DROP TABLE IF EXISTS settlement_history;

-- 8. Clean up virtual family members
DELETE FROM family_members WHERE isVirtual = 1;
```

### crud.js Updates

**ALLOWED_TABLES:** Add `'family_invites'`. Remove `'shared_expenses'`, `'settlement_history'`.

**TABLE_COLUMNS:**
```javascript
// Add to transactions columns:
'visibility'
// Deprecate (remove from TABLE_COLUMNS so new writes strip them):
// 'scope', 'paidBy', 'splitType', 'beneficiaries'
// These columns remain in D1 (can't DROP COLUMN in SQLite) but are no longer accepted on writes.

// Add to goals columns:
'familyId'

// Add new table:
family_invites: ['id', 'familyId', 'email', 'invitedBy', 'status', 'createdAt', 'updatedAt']

// Remove entirely:
// shared_expenses entry
// settlement_history entry
```

**JSON_COLUMNS:** Remove `beneficiaries` from transactions (no longer used).

**TABLE_ALIASES:** Add `familyInvites: 'family_invites'`.

**getUserColumn:**
```javascript
// Remove:
// shared_expenses: 'paidByUserId'

// Add:
family_invites: 'invitedBy'
```

**Frontend api.js:** Add `familyInvites: 'family_invites'` to both `TABLE_MAP` and `REVERSE_TABLE_MAP`.

**Server-side validation:** In the POST/PUT handlers for transactions, validate that if `visibility` is provided, it must be either `'family'` or `'private'`. Reject other values with 400.

**Admin leave protection:** In the DELETE handler for `family_members`, if the member being removed has `role = 'admin'` and is the only admin, return 400 with "Transfer admin role first" instead of allowing the delete.

### IndexedDB Changes

Bump `DB_VERSION` from 10 to 11.

```javascript
if (oldVersion < 11) {
  // Remove deprecated stores
  if (db.objectStoreNames.contains('sharedExpenses')) {
    db.deleteObjectStore('sharedExpenses')
  }
  if (db.objectStoreNames.contains('settlementHistory')) {
    db.deleteObjectStore('settlementHistory')
  }
  // Add familyInvites store
  ensureStore(db, 'familyInvites', { keyPath: 'id' }, [
    { name: 'email', keyPath: 'email' },
    { name: 'familyId', keyPath: 'familyId' }
  ])
}
```

No need to recreate transactions or goals stores — IndexedDB is schemaless for object properties. The new `visibility` and `familyId` fields will simply appear on new/updated objects.

---

## Backend Changes

### New Endpoint: Family Feed

**`GET /api/families/:familyId/feed`**

Returns all family members' visible transactions within a date range.

```javascript
router.get('/api/families/:familyId/feed', async (ctx) => {
  const { familyId } = ctx.params
  const { startDate, endDate, limit = '500', offset = '0' } = ctx.query

  // 1. Verify caller is a family member
  const membership = await ctx.env.DB.prepare(
    'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
  ).bind(familyId, ctx.user.id).first()
  if (!membership) return json({ error: 'Not a member' }, 403)

  // 2. Query visible transactions from all family members
  // The JOIN handles member filtering — no need for a separate IN clause.
  // Each member's transactions are filtered to those created after they joined.
  const feedLimit = Math.min(parseInt(limit), 5000)
  const feedOffset = parseInt(offset)

  const result = await ctx.env.DB.prepare(`
    SELECT t.* FROM transactions t
    JOIN family_members fm
      ON t.userId = fm.userId AND fm.familyId = ?
    WHERE t.visibility = 'family'
      AND t.createdAt >= fm.joinedAt
      AND (t.deletedAt IS NULL OR t.deletedAt = '')
      AND t.date >= ? AND t.date <= ?
    ORDER BY t.date DESC
    LIMIT ? OFFSET ?
  `).bind(familyId, startDate, endDate, feedLimit, feedOffset).all()

  return json({
    data: (result.results || []).map(r => deserializeRow('transactions', r)),
    meta: { limit: feedLimit, offset: feedOffset }
  })
})
```

### New Endpoint: Email Invite

**`POST /api/families/:familyId/invite`**

```javascript
router.post('/api/families/:familyId/invite', async (ctx) => {
  const { familyId } = ctx.params
  const { email } = ctx.body

  // Verify caller is admin of family
  const membership = await ctx.env.DB.prepare(
    'SELECT role FROM family_members WHERE familyId = ? AND userId = ?'
  ).bind(familyId, ctx.user.id).first()
  if (!membership || membership.role !== 'admin')
    return json({ error: 'Admin only' }, 403)

  // Check if email already invited or already a member
  const existingUser = await ctx.env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(email).first()
  if (existingUser) {
    const alreadyMember = await ctx.env.DB.prepare(
      'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, existingUser.id).first()
    if (alreadyMember) return json({ error: 'Already a member' }, 409)
  }

  // Check for existing pending invite
  const existingInvite = await ctx.env.DB.prepare(
    'SELECT id FROM family_invites WHERE familyId = ? AND email = ? AND status = ?'
  ).bind(familyId, email, 'pending').first()
  if (existingInvite) return json({ error: 'Already invited' }, 409)

  // Create invite
  const invite = {
    id: crypto.randomUUID(),
    familyId,
    email: email.toLowerCase().trim(),
    invitedBy: ctx.user.id,
    status: 'pending',
    createdAt: new Date().toISOString()
  }
  await ctx.env.DB.prepare(
    'INSERT INTO family_invites (id, familyId, email, invitedBy, status, createdAt) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(invite.id, invite.familyId, invite.email, invite.invitedBy, invite.status, invite.createdAt).run()

  return json({ data: invite }, 201)
})
```

**`GET /api/families/invites/pending`** — called on login to check for pending invites:

```javascript
router.get('/api/families/invites/pending', async (ctx) => {
  const result = await ctx.env.DB.prepare(`
    SELECT fi.*, f.name as familyName, f.emoji as familyEmoji, u.name as inviterName
    FROM family_invites fi
    JOIN families f ON fi.familyId = f.id
    JOIN users u ON fi.invitedBy = u.id
    WHERE fi.email = ? AND fi.status = 'pending'
  `).bind(ctx.user.email).all()
  return json({ data: result.results })
})
```

**`POST /api/families/invites/:inviteId/accept`** — accept an invite:

```javascript
router.post('/api/families/invites/:inviteId/accept', async (ctx) => {
  const invite = await ctx.env.DB.prepare(
    'SELECT * FROM family_invites WHERE id = ? AND status = ?'
  ).bind(ctx.params.inviteId, 'pending').first()
  if (!invite) return json({ error: 'Invite not found' }, 404)

  // Verify the invite is for this user
  if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase())
    return json({ error: 'Invite not for you' }, 403)

  // Check if already a member (could have joined via invite code in the meantime)
  const existing = await ctx.env.DB.prepare(
    'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
  ).bind(invite.familyId, ctx.user.id).first()
  if (existing) {
    // Already a member — just mark invite as accepted
    await ctx.env.DB.prepare(
      'UPDATE family_invites SET status = ?, updatedAt = ? WHERE id = ?'
    ).bind('accepted', new Date().toISOString(), invite.id).run()
    return json({ data: existing })
  }

  // Create family membership + mark invite as accepted atomically
  const now = new Date().toISOString()
  const member = {
    id: crypto.randomUUID(),
    familyId: invite.familyId,
    userId: ctx.user.id,
    role: 'member',
    isVirtual: 0,
    displayName: ctx.user.name,
    joinedAt: now,
    createdAt: now,
    updatedAt: now
  }

  await ctx.env.DB.batch([
    ctx.env.DB.prepare(
      'INSERT INTO family_members (id, familyId, userId, role, isVirtual, displayName, joinedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(member.id, member.familyId, member.userId, member.role, member.isVirtual, member.displayName, member.joinedAt, member.createdAt, member.updatedAt),
    ctx.env.DB.prepare(
      'UPDATE family_invites SET status = ?, updatedAt = ? WHERE id = ?'
    ).bind('accepted', now, invite.id)
  ])

  return json({ data: member }, 201)
})
```

### Fix: Server-Side Invite Code Generation

Move invite code generation from `FamilyContext.jsx` to the backend. When creating a family via `POST /api/families`, the server generates the code:

```javascript
// In the POST /api/:table handler, special case for families:
if (table === 'families') {
  data.inviteCode = await generateUniqueInviteCode(ctx.env.DB)
}

async function generateUniqueInviteCode(db, maxRetries = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length]

    // Check uniqueness (the UNIQUE index will also enforce this)
    const existing = await db.prepare(
      'SELECT id FROM families WHERE inviteCode = ?'
    ).bind(code).first()
    if (!existing) return code
  }
  throw new Error('Failed to generate unique invite code')
}
```

### Sync/Pull Updates

Update the pull endpoint to handle new patterns:

```javascript
// Goals: return user's own + family-scoped goals
if (table === 'goals') {
  const userGoals = await db.prepare(
    'SELECT * FROM goals WHERE userId = ? AND updatedAt > ? ORDER BY updatedAt ASC LIMIT ? OFFSET ?'
  ).bind(userId, since, limit, offset).all()

  const familyGoals = await db.prepare(`
    SELECT g.* FROM goals g
    WHERE g.familyId IN (SELECT familyId FROM family_members WHERE userId = ?)
      AND g.userId != ?
      AND g.updatedAt > ?
    ORDER BY g.updatedAt ASC LIMIT ? OFFSET ?
  `).bind(userId, userId, since, limit, offset).all()

  // Merge and dedupe
  return [...userGoals.results, ...familyGoals.results]
}

// Remove: shared_expenses and settlement_history from pull

// family_invites: uses CUSTOM query (not getUserColumn-based)
// Pull pending invites by the user's email, not by invitedBy
if (table === 'family_invites') {
  return await db.prepare(`
    SELECT fi.* FROM family_invites fi
    WHERE fi.email = ? AND fi.status = 'pending'
    AND fi.updatedAt > ?
    ORDER BY fi.updatedAt ASC LIMIT ? OFFSET ?
  `).bind(userEmail, since, limit, offset).all()
}
```

### Removed Endpoints

| Endpoint | Reason |
|----------|--------|
| `POST /api/families/:familyId/members` | Virtual members removed |
| `DELETE /api/families/:familyId/members/:memberId` | Virtual members removed |
| `PUT /api/families/:familyId/members/:memberId/link` | Virtual members removed |
| `GET /api/families/:familyId/transactions` | Replaced by `/feed` |

### Updated Endpoint: Family Update

The generic `PUT /api/families/:id` currently filters by `createdBy`, meaning only the creator can update family settings. Add a dedicated endpoint that checks admin role instead:

**`PUT /api/families/:familyId/settings`** — allows any admin to update family name/emoji:
```javascript
router.put('/api/families/:familyId/settings', async (ctx) => {
  const { familyId } = ctx.params
  const membership = await ctx.env.DB.prepare(
    'SELECT role FROM family_members WHERE familyId = ? AND userId = ?'
  ).bind(familyId, ctx.user.id).first()
  if (!membership || membership.role !== 'admin')
    return json({ error: 'Admin only' }, 403)

  const { name, emoji } = ctx.body
  const updates = {}
  if (name) updates.name = name
  if (emoji) updates.emoji = emoji
  updates.updatedAt = new Date().toISOString()

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ')
  await ctx.env.DB.prepare(
    `UPDATE families SET ${sets} WHERE id = ?`
  ).bind(...Object.values(updates), familyId).run()

  return json({ success: true })
})
```

### Kept Endpoints (unchanged)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/families/:familyId/members` | List family members |
| `POST /api/families/join` | Join by invite code |
| Generic CRUD for `families`, `family_members` | Standard operations |

---

## Frontend Changes

### FamilyContext Simplification

**Remove:**
- `generateInviteCode()` function (moved to server)
- `sharedExpensesList` state
- `familyTransactions` loaded via `txApi.getAll()` (broken)
- `createVirtualMember()`, `linkVirtualMember()` functions
- Settlement-related logic

**Add:**
- `familyFeed` state — transactions from `/api/families/:id/feed`
- `loadFamilyFeed(startDate, endDate)` — fetches family feed
- `privacyRules` state — loaded from settings
- `updatePrivacyRules(rules)` — saves to settings
- `pendingInvites` state — loaded on mount from `/api/families/invites/pending`
- `acceptInvite(inviteId)`, `declineInvite(inviteId)` functions
- `inviteByEmail(familyId, email)` function

**Simplified state shape:**
```javascript
{
  myFamilies: [],
  activeFamily: null,
  members: [],
  familyFeed: [],           // NEW: visible transactions from all members
  feedLoading: false,
  privacyRules: {},          // NEW: category visibility rules
  pendingInvites: [],        // NEW: email invites awaiting acceptance
  isFamilyMode: boolean,
  isAdmin: boolean,
  myMembership: {}
}
```

### Dashboard Changes

**Add family filter chips** (below month picker, only shown when `isFamilyMode`):

```
[All] [Mine] [Ana]
```

State: `familyFilter: 'all' | 'mine' | memberId`

Filtering logic:
```javascript
function getFilteredTransactions(allMyTx, familyFeed, familyFilter, userId) {
  if (!isFamilyMode) return allMyTx  // No family, no change

  switch (familyFilter) {
    case 'all':
      // Merge: my transactions + family feed (dedupe by id)
      return mergeAndDedupe(allMyTx, familyFeed)
    case 'mine':
      return allMyTx  // All my own transactions (including private)
    default:
      // Specific member: filter family feed by their userId
      return familyFeed.filter(tx => tx.userId === familyFilter)
  }
}
```

Budget computation uses the same filtered transaction list. Family budgets (`familyId != null`) always use the "all" filter regardless of the current chip selection.

**Replaces:** the existing `scopeFilter` state (`'all' | 'personal' | 'household'`).

### Transactions Page Changes

Same filter chips as Dashboard. Partner's transactions show with a subtle avatar/emoji badge. The user's own transactions show an eye icon for toggling visibility.

### AddTransaction / ManualForm Changes

**Remove:** `scope`, `paidBy`, `splitType`, `beneficiaries` UI fields.

**Add:** Visibility indicator. When the user is in a family:
- Show a small eye icon next to the category picker
- Pre-filled based on category privacy rule
- Tappable to toggle between family/private
- Include `visibility` in the transaction object sent to API

```javascript
const transaction = {
  // ...existing fields...
  visibility: isFamilyMode ? resolveVisibility(category, privacyRules) : null,
  // Remove: scope, paidBy, splitType, beneficiaries
}
```

### Budgets Page Changes

**Add:** Ability to create family budgets. When creating a budget in family mode, a toggle: "Personal budget" / "Family budget". Family budgets set `familyId = activeFamily.id`.

Family budgets display combined spending from the family feed (all visible transactions in that category from all members).

### Goals Page Changes

**Add:** Ability to create family goals. Toggle: "Personal goal" / "Family goal". Family goals set `familyId = activeFamily.id`.

Family goals are visible to all family members. Any member can update `currentAmount`. The UI shows the total progress. (Per-member contribution tracking is a future enhancement.)

### Family Page Redesign

Replace the current 5-tab layout with a single-page layout:

**Section 1: Members**
- List all real members with name, emoji, role
- "Invite member" button (opens modal with invite code + email invite option)

**Section 2: My Privacy Rules**
- List of categories with shared/private toggle per row
- Only visible to the current user (each member sets their own rules)

**Section 3: Family Settings (admin only)**
- Family name (editable)
- Invite code (display + copy button + regenerate)
- Leave family button

**Section 4: Pending Invites (if any)**
- Banner at top: "Ana invited you to join Familia Popescu" with Accept/Decline buttons

### Files to Delete

| File | Reason |
|------|--------|
| `web/src/components/family/FamilySettlements.jsx` | Settlement feature removed |
| `web/src/components/family/FamilyAllExpenses.jsx` | Replaced by Dashboard/Transactions filter |
| `web/src/components/family/FamilyOverview.jsx` | Replaced by Dashboard with family filter |
| `web/src/lib/settlement.js` | Settlement feature removed |
| `web/src/components/SplitCalculator.jsx` | Splitting feature removed (if exists) |
| `web/src/components/SplitExpenseModal.jsx` | Splitting feature removed (if exists) |

### Files to Heavily Modify

| File | Changes |
|------|---------|
| `web/src/contexts/FamilyContext.jsx` | Remove virtual members, shared expenses, settlement. Add feed, privacy rules, invites. |
| `web/src/pages/Family.jsx` | Replace 5-tab layout with 4-section page. |
| `web/src/components/family/FamilyMembers.jsx` | Remove virtual member add/remove/link UI. |
| `web/src/components/family/FamilySettings.jsx` | Simplify. |
| `web/src/pages/Dashboard.jsx` | Add family filter chips, use family feed for budget computation. |
| `web/src/pages/Transactions.jsx` | Add family filter chips, show partner's transactions with avatar badge. |
| `web/src/pages/Budgets.jsx` | Add family budget creation, use family feed for family budget progress. |
| `web/src/pages/Goals.jsx` | Add family goal creation. |
| `web/src/components/ManualForm.jsx` | Remove scope/paidBy/splitType/beneficiaries. Add visibility toggle. |
| `web/src/lib/api.js` | Add `familyFeedApi.get(familyId, startDate, endDate)`. Remove shared expenses CRUD. Add invite endpoints. Add TABLE_MAP entries. |
| `web/src/lib/storage.js` | Bump to v11. Remove sharedExpenses/settlementHistory stores. Add familyInvites store. |
| `api/src/crud.js` | Add feed endpoint, invite endpoints. Fix invite code generation. Remove virtual member endpoints. Update TABLE_COLUMNS, ALLOWED_TABLES, TABLE_ALIASES, JSON_COLUMNS. Add visibility validation. Add admin leave protection. |

### Files to Update (remove scope/split references)

| File | Changes |
|------|---------|
| `web/src/components/TransactionEditModal.jsx` | Remove scope/splitType fields from edit form. |
| `web/src/components/QuickAdd.jsx` | Remove scope references. |
| `web/src/components/import/StepPreview.jsx` | Remove scope from import preview. |
| `web/src/pages/Analytics.jsx` | Remove scope-based filtering. |
| `web/src/pages/Reports.jsx` | Remove scope-based filtering. |
| `web/src/pages/AddTransaction.jsx` | Remove scope/paidBy tab logic. |
| `web/src/lib/ai.js` | Remove scope/beneficiaries from AI prompts. |
| `web/src/lib/exportHelpers.js` | Remove scope from export format. |
| `web/src/lib/translations/en.js` | Add new family keys, remove old scope/split keys. |
| `web/src/lib/translations/ro.js` | Add new family keys, remove old scope/split keys. |

---

## Data Flow: Complete Scenarios

### Scenario: Dragos adds a grocery expense

```
1. Dragos opens AddTransaction, enters "Kaufland 150 RON groceries"
2. ManualForm checks privacyRules: groceries not configured → default 'family'
3. ManualForm sets visibility = 'family' on transaction object
4. POST /api/transactions → saved with userId=dragos, visibility='family'
5. Ana opens Dashboard with "All" filter
6. FamilyContext calls GET /api/families/:id/feed?startDate=...&endDate=...
7. Feed returns Dragos's transaction (visibility='family', createdAt >= his joinedAt)
8. Dashboard shows the transaction with Dragos's emoji badge
```

### Scenario: Dragos buys a surprise gift

```
1. Dragos adds "Pandora 500 RON gifts"
2. ManualForm checks privacyRules: gifts = 'private'
3. ManualForm sets visibility = 'private'
4. POST /api/transactions → saved with visibility='private'
5. Ana calls GET /api/families/:id/feed → gift NOT returned (visibility != 'family')
6. Dragos sees it in his "Mine" view (all own transactions, regardless of visibility)
```

### Scenario: Dragos overrides visibility on one transaction

```
1. Dragos has a dining transaction with visibility='family'
2. He taps the eye icon → PUT /api/transactions/:id { visibility: 'private' }
3. Only visibility field is updated (partial update, other fields untouched)
4. Ana's next feed refresh excludes this transaction
```

### Scenario: Ana joins via email invite

```
1. Dragos goes to Family page → Invite member → enters ana@email.com
2. POST /api/families/:id/invite → creates family_invites record (status='pending')
3. Ana logs in → GET /api/families/invites/pending → returns the invite
4. FamilyContext sets pendingInvites state → banner shown at top of Family page
5. Ana taps Accept → POST /api/families/invites/:id/accept
6. Backend creates family_members record (joinedAt = now), marks invite as 'accepted'
7. Ana's new transactions get visibility based on her privacy rules
8. Ana's old transactions have visibility=NULL → excluded from feed
```

### Scenario: Ana joins via invite code

```
1. Dragos copies invite code "ABC12345" from Family page, sends via WhatsApp
2. Ana goes to Family page → Join family → enters "ABC12345"
3. POST /api/families/join → server finds family by inviteCode (UNIQUE index)
4. Creates family_members record (joinedAt = now)
5. Same behavior as email invite from this point
```

### Scenario: Family grocery budget

```
1. Dragos creates budget: category=groceries, amount=2000, familyId=family_id
2. Dashboard loads family feed (all visible transactions from both members)
3. Client-side: filters feed by category=groceries → sums amounts
4. Displays: "Groceries: 1,450 / 2,000 RON" (combines Dragos + Ana's visible grocery spending)
5. If Ana marks a grocery tx as private → it won't appear in feed → won't count toward family budget
6. Ana's personal grocery budget (if she has one) still counts ALL her grocery transactions
```

### Scenario: Leaving a family

```
1. Ana taps "Leave family" → DELETE /api/family_members/:id
2. Ana's family_members record is deleted
3. Dragos calls GET /api/families/:id/feed → JOIN fails for Ana's userId → her transactions excluded
4. Ana's transactions remain in her account, unchanged (visibility still set, but no one queries it)
5. Ana's personal budgets/goals unaffected
6. Family budgets/goals with familyId still exist but only show Dragos's data
```

---

## What Is NOT Changing

- Authentication system (JWT, login/register)
- Transaction CRUD (create, read, update, delete)
- Personal budgets, goals, accounts, recurring, loans, debts, wishlist
- Sync mechanism (pull-based on login)
- IndexedDB as read cache
- Receipt scanning, CSV import, Telegram bot
- Settings, themes, translations
- Sidebar navigation structure
- Admin panel

---

## Migration Path

### For existing users with families

1. Run migration 013 on D1 (adds columns, drops tables, cleans virtual members)
2. Deploy new API (new endpoints, removed endpoints)
3. Deploy new frontend (new UI, removed components)
4. Existing family memberships preserved (families + family_members tables unchanged)
5. Existing transactions get `visibility = NULL` → excluded from feed until user manually shares or creates new ones
6. Invite codes: existing codes remain. Server generates new ones for new families. UNIQUE index prevents future duplicates.

### For users without families

No visible changes. The `visibility` column exists but is ignored when not in a family. No UI changes appear until they create or join a family.

---

## Summary

| Area | Before | After |
|------|--------|-------|
| **Tables** | families, family_members, shared_expenses, settlement_history | families, family_members, family_invites |
| **Transaction model** | scope + paidBy + splitType + beneficiaries | visibility (family/private) |
| **Privacy** | None | Category rules + per-transaction toggle |
| **Dashboard** | scopeFilter (personal/household) | familyFilter (all/mine/[partner]) |
| **Budgets** | Personal only (familyId unused) | Personal + family budgets |
| **Goals** | Personal only | Personal + family goals |
| **Invite** | Client-side code, no uniqueness | Server-side code (UNIQUE) + email invite |
| **Splitting** | Broken settlement system | Removed (simple tracking only) |
| **Virtual members** | Supported | Removed |
| **Family page** | 5 tabs | 4 sections on one page |
| **Net files** | ~6 family components | Delete 6 files, modify ~22 files |

---

## Translation Keys

### New keys needed (both en.js and ro.js)

```javascript
// Family filter chips
'family.filter.all': 'All / Toți',
'family.filter.mine': 'Mine / Ale mele',

// Privacy rules
'family.privacy.title': 'My Privacy Rules / Regulile mele de confidențialitate',
'family.privacy.shared': 'Shared / Partajat',
'family.privacy.private': 'Private / Privat',

// Visibility toggle
'family.visibility.family': 'Visible to family / Vizibil pentru familie',
'family.visibility.private': 'Private / Privat',

// Invite
'family.invite.title': 'Invite Member / Invită un membru',
'family.invite.code': 'Invite Code / Cod de invitație',
'family.invite.email': 'Invite by email / Invită prin email',
'family.invite.pending': 'invited you to join / te-a invitat să te alături',
'family.invite.accept': 'Accept / Acceptă',
'family.invite.decline': 'Decline / Refuză',

// Budget/Goal scope
'budget.scope.personal': 'Personal budget / Buget personal',
'budget.scope.family': 'Family budget / Buget de familie',
'goal.scope.personal': 'Personal goal / Obiectiv personal',
'goal.scope.family': 'Family goal / Obiectiv de familie',

// Admin
'family.admin.leaveWarning': 'Transfer admin role first / Transferă rolul de admin mai întâi',
```

### Keys to remove (orphaned by scope/split removal)

```javascript
// Remove all keys containing: scope, splitType, paidBy, beneficiaries, settlement, settle
'transaction.scope.*'
'family.settlements.*'
'family.overview.*'
'family.expenses.*'
```
