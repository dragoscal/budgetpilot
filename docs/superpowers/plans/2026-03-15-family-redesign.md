# Family Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken family feature (virtual members, splitting, settlements) with a "Shared Lens" model — each user keeps their own transactions, a `visibility` column controls what family members can see, and the Dashboard/Transactions/Budgets/Goals pages gain family filter chips.

**Architecture:** Server-first with IndexedDB read cache. New `visibility` column on transactions + `familyId` on goals. New `/feed` endpoint returns cross-user visible transactions via JOIN. Privacy rules stored in settings as JSON. Six old files deleted, ~22 modified.

**Tech Stack:** React 18 + Vite 6 frontend, Cloudflare Workers + D1 (SQLite) backend, Hono router (custom), IndexedDB (idb), Tailwind CSS v3, lucide-react icons.

**Spec:** `docs/superpowers/specs/2026-03-15-family-redesign-design.md`

---

## File Structure

### Files to Create
| File | Responsibility |
|------|---------------|
| `api/migrations/013_family_redesign.sql` | Schema changes: add visibility, familyId, family_invites table, drop old tables |

### Files to Delete
| File | Reason |
|------|--------|
| `web/src/components/family/FamilySettlements.jsx` | Settlement feature removed |
| `web/src/components/family/FamilyAllExpenses.jsx` | Replaced by Dashboard family filter |
| `web/src/components/family/FamilyOverview.jsx` | Replaced by Dashboard family filter |
| `web/src/lib/settlement.js` | Settlement feature removed |
| `web/src/components/SplitCalculator.jsx` | Splitting removed |
| `web/src/components/SplitExpenseModal.jsx` | Splitting removed |

### Files to Heavily Modify
| File | Lines | Changes |
|------|-------|---------|
| `api/src/crud.js` | 623 | Add feed/invite endpoints, fix invite code gen, remove virtual member endpoints, update TABLE_COLUMNS/ALLOWED_TABLES/TABLE_ALIASES/JSON_COLUMNS/USER_COLUMN, add visibility validation, admin leave protection |
| `web/src/lib/storage.js` | 545 | Bump DB_VERSION 10→11, delete old stores, add familyInvites store |
| `web/src/lib/api.js` | 469 | Add TABLE_MAP entries, add familyFeedApi, invite endpoints, remove old CRUD exports |
| `web/src/contexts/FamilyContext.jsx` | 339 | Remove virtual members/shared expenses/broken tx loading. Add feed, privacy rules, invites |
| `web/src/components/ManualForm.jsx` | 379 | Remove scope/paidBy/splitType/beneficiaries. Add visibility toggle |
| `web/src/pages/Dashboard.jsx` | 1507 | Replace scopeFilter with familyFilter, use family feed |
| `web/src/pages/Family.jsx` | 270 | Replace 5-tab layout with 4-section page |

### Files to Update (scope/split cleanup)
| File | Changes |
|------|---------|
| `web/src/components/TransactionEditModal.jsx` | Remove scope/splitType fields |
| `web/src/components/QuickAdd.jsx` | Remove scope references |
| `web/src/components/import/StepPreview.jsx` | Remove scope from import preview |
| `web/src/pages/Analytics.jsx` | Remove scope-based filtering |
| `web/src/pages/Reports.jsx` | Remove scope-based filtering |
| `web/src/pages/AddTransaction.jsx` | Remove scope/paidBy tab logic |
| `web/src/lib/ai.js` | Remove scope/beneficiaries from AI prompts |
| `web/src/lib/exportHelpers.js` | Remove scope from export format |
| `web/src/lib/translations/en.js` | Add new family keys, remove old scope/split keys |
| `web/src/lib/translations/ro.js` | Add new family keys, remove old scope/split keys |
| `web/src/components/family/FamilyMembers.jsx` | Remove virtual member add/remove/link UI |
| `web/src/components/family/FamilySettings.jsx` | Simplify to admin-only settings |
| `web/src/pages/Settings.jsx` | Update KNOWN_STORES array (remove old stores, add familyInvites) |

---

## Chunk 1: Backend — Migration & CRUD Updates

### Task 1: Create Migration 013

**Files:**
- Create: `api/migrations/013_family_redesign.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- 013_family_redesign.sql
-- Family Redesign: Shared Lens model

-- 1. Add visibility to transactions (NULL = not set, excluded from feed)
ALTER TABLE transactions ADD COLUMN visibility TEXT;

-- 2. Add familyId to goals (for shared family goals)
ALTER TABLE goals ADD COLUMN familyId TEXT;

-- 3. Backfill NULL invite codes so UNIQUE index doesn't collide on NULLs
UPDATE families SET inviteCode = hex(randomblob(4)) WHERE inviteCode IS NULL;

-- 4. Unique constraint on invite codes
CREATE UNIQUE INDEX IF NOT EXISTS idx_families_inviteCode ON families(inviteCode);

-- 5. Family invites table (in-app notification, not email delivery)
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

-- 7. Drop old tables
DROP TABLE IF EXISTS shared_expenses;
DROP TABLE IF EXISTS settlement_history;

-- 8. Clean up virtual family members
DELETE FROM family_members WHERE isVirtual = 1;
```

- [ ] **Step 2: Run migration locally**

Run: `cd D:/claude-hq/budget-app/api && npx wrangler d1 execute budgetpilot-db --local --file=./migrations/013_family_redesign.sql`
Expected: Success, no errors.

- [ ] **Step 3: Verify schema locally**

Run: `cd D:/claude-hq/budget-app/api && npx wrangler d1 execute budgetpilot-db --local --command="SELECT sql FROM sqlite_master WHERE name IN ('transactions','goals','family_invites','families') ORDER BY name"`
Expected: Shows `visibility` on transactions, `familyId` on goals, `family_invites` table exists.

- [ ] **Step 4: Commit**

```bash
git add api/migrations/013_family_redesign.sql
git commit -m "feat: add migration 013 for family redesign

Adds visibility column to transactions, familyId to goals,
family_invites table, drops shared_expenses and settlement_history,
cleans up virtual members."
```

---

### Task 2: Update CRUD Configuration Maps

**Files:**
- Modify: `api/src/crud.js` (lines 6, 9, 16, 23, 36-54)

- [ ] **Step 1: Update ALLOWED_TABLES**

In `api/src/crud.js` line 6, update the array:
- Add `'family_invites'`
- Remove `'shared_expenses'` and `'settlement_history'`

```javascript
const ALLOWED_TABLES = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'people', 'debts', 'debt_payments', 'wishlist', 'loans', 'loan_payments', 'families', 'family_members', 'family_invites', 'challenges', 'receipts'];
```

- [ ] **Step 2: Update TABLE_ALIASES**

In `api/src/crud.js` line 9:
- Add `familyInvites: 'family_invites'`
- Remove `sharedExpenses: 'shared_expenses'` and `settlementHistory: 'settlement_history'`

```javascript
const TABLE_ALIASES = { debtPayments: 'debt_payments', loanPayments: 'loan_payments', familyMembers: 'family_members', familyInvites: 'family_invites' };
```

- [ ] **Step 3: Update USER_COLUMN**

In `api/src/crud.js` line 16:
- Remove `shared_expenses: 'paidByUserId'`
- Add `family_invites: 'invitedBy'`

```javascript
const USER_COLUMN = { families: 'createdBy', family_invites: 'invitedBy' };
```

- [ ] **Step 4: Update JSON_COLUMNS**

In `api/src/crud.js` line 23:
- Remove `'beneficiaries'` from transactions array
- Remove `settlement_history` entry entirely

```javascript
const JSON_COLUMNS = { transactions: ['tags', 'items'] };
```

- [ ] **Step 5: Update TABLE_COLUMNS**

In `api/src/crud.js` lines 36-54:
- **transactions** (line 37): Add `'visibility'`. Remove `'scope'`, `'paidBy'`, `'splitType'`, `'beneficiaries'`.
- **goals** (line 39): Add `'familyId'`.
- Add `family_invites` entry.
- Remove `shared_expenses` entry (line 50).
- Remove `settlement_history` entry (line 53).

Updated transactions Set:
```javascript
transactions: new Set(['id','userId','type','merchant','amount','currency','category','subcategory','date','description','tags','source','recurringId','items','splitFrom','importBatch','originalText','visibility','createdAt','updatedAt','deletedAt']),
```

Updated goals Set:
```javascript
goals: new Set(['id','userId','name','type','targetAmount','currentAmount','currency','targetDate','interestRate','color','familyId','createdAt','updatedAt']),
```

New family_invites entry (add after family_members):
```javascript
family_invites: new Set(['id','familyId','email','invitedBy','status','createdAt','updatedAt']),
```

- [ ] **Step 6: Verify file is syntactically correct**

Run: `cd D:/claude-hq/budget-app/api && node -c src/crud.js`
Expected: No syntax errors.

- [ ] **Step 7: Commit**

```bash
git add api/src/crud.js
git commit -m "feat: update CRUD config maps for family redesign

Remove shared_expenses, settlement_history, virtual members.
Add family_invites table, visibility column, familyId on goals."
```

---

### Task 3: Add Server-Side Invite Code Generation

**Files:**
- Modify: `api/src/crud.js` (add helper function + modify POST handler)

- [ ] **Step 1: Add generateUniqueInviteCode helper**

Add this function just before `export function registerCrudRoutes(router)` (before line 95):

```javascript
async function generateUniqueInviteCode(db, maxRetries = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const bytes = new Uint8Array(8)
    crypto.getRandomValues(bytes)
    let code = ''
    for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length]
    const existing = await db.prepare(
      'SELECT id FROM families WHERE inviteCode = ?'
    ).bind(code).first()
    if (!existing) return code
  }
  throw new Error('Failed to generate unique invite code')
}
```

- [ ] **Step 2: Add invite code generation to POST /api/:table for families**

In the generic `POST /api/:table` handler (around line 530), add a special case BEFORE the INSERT. After `const data = filterColumns(table, raw);` (around line 544), add:

```javascript
    // Server-side invite code generation for families
    if (table === 'families') {
      data.inviteCode = await generateUniqueInviteCode(ctx.env.DB)
    }
```

- [ ] **Step 3: Add visibility validation to POST/PUT for transactions**

In the generic `POST /api/:table` handler, after the families special case, add:

```javascript
    // Validate visibility enum for transactions
    if (table === 'transactions' && data.visibility && !['family', 'private'].includes(data.visibility)) {
      return json({ error: 'visibility must be "family" or "private"' }, 400)
    }
```

Add the same validation in the `PUT /api/:table/:id` handler (around line 572), after `const data = filterColumns(table, raw);`:

```javascript
    // Validate visibility enum for transactions
    if (table === 'transactions' && data.visibility && !['family', 'private'].includes(data.visibility)) {
      return json({ error: 'visibility must be "family" or "private"' }, 400)
    }
```

Also add validation inside the `POST /api/sync/push` handler (around line 322, after `const raw = serializeRow(...)` and `const row = filterColumns(...)`):

```javascript
          // Validate visibility for transactions in sync push
          if (table === 'transactions' && row.visibility && !['family', 'private'].includes(row.visibility)) {
            results.push({ id: data?.id, status: 'error', message: 'Invalid visibility value' })
            continue
          }
          // Server generates invite code for families — strip client-sent codes
          if (table === 'families' && action === 'create' && !row.inviteCode) {
            row.inviteCode = await generateUniqueInviteCode(ctx.env.DB)
          }
```

- [ ] **Step 4: Verify syntax**

Run: `cd D:/claude-hq/budget-app/api && node -c src/crud.js`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add api/src/crud.js
git commit -m "feat: server-side invite code generation + visibility validation

Generate unique invite codes on family creation instead of client-side.
Validate visibility enum on transaction create/update."
```

---

### Task 4: Add Family Feed Endpoint

**Files:**
- Modify: `api/src/crud.js` (add new route inside registerCrudRoutes, after the existing family member routes)

- [ ] **Step 1: Add GET /api/families/:familyId/feed**

Add after the existing `router.get('/api/families/:familyId/members', ...)` block (after line 115):

```javascript
  // GET /api/families/:familyId/feed — family members' visible transactions
  router.get('/api/families/:familyId/feed', async (ctx) => {
    const { familyId } = ctx.params
    const { startDate, endDate, limit = '500', offset = '0' } = ctx.query
    if (!startDate || !endDate) return json({ error: 'startDate and endDate required' }, 400)

    // Verify caller is a family member
    const membership = await ctx.env.DB.prepare(
      'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first()
    if (!membership) return json({ error: 'Not a member' }, 403)

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

- [ ] **Step 2: Verify syntax**

Run: `cd D:/claude-hq/budget-app/api && node -c src/crud.js`

- [ ] **Step 3: Commit**

```bash
git add api/src/crud.js
git commit -m "feat: add family feed endpoint

GET /api/families/:familyId/feed returns visible transactions
from all family members within a date range, respecting join-time
boundary and privacy settings."
```

---

### Task 5: Add Email Invite Endpoints

**Files:**
- Modify: `api/src/crud.js` (add 3 new routes)

- [ ] **Step 1: Add POST /api/families/:familyId/invite**

Add after the feed endpoint:

```javascript
  // POST /api/families/:familyId/invite — invite by email (in-app notification)
  router.post('/api/families/:familyId/invite', async (ctx) => {
    const { familyId } = ctx.params
    const { email } = ctx.body
    if (!email?.trim()) return json({ error: 'Email is required' }, 400)

    // Verify caller is admin
    const membership = await ctx.env.DB.prepare(
      'SELECT role FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first()
    if (!membership || membership.role !== 'admin')
      return json({ error: 'Admin only' }, 403)

    // Check if already a member
    const existingUser = await ctx.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first()
    if (existingUser) {
      const alreadyMember = await ctx.env.DB.prepare(
        'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
      ).bind(familyId, existingUser.id).first()
      if (alreadyMember) return json({ error: 'Already a member' }, 409)
    }

    // Check for existing pending invite
    const existingInvite = await ctx.env.DB.prepare(
      'SELECT id FROM family_invites WHERE familyId = ? AND email = ? AND status = ?'
    ).bind(familyId, email.toLowerCase().trim(), 'pending').first()
    if (existingInvite) return json({ error: 'Already invited' }, 409)

    const now = new Date().toISOString()
    const invite = {
      id: crypto.randomUUID(),
      familyId,
      email: email.toLowerCase().trim(),
      invitedBy: ctx.user.id,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    }
    await ctx.env.DB.prepare(
      'INSERT INTO family_invites (id, familyId, email, invitedBy, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(invite.id, invite.familyId, invite.email, invite.invitedBy, invite.status, invite.createdAt, invite.updatedAt).run()

    return json({ data: invite }, 201)
  })
```

- [ ] **Step 2: Add GET /api/families/invites/pending**

Add after the invite creation endpoint. **Important:** This must go BEFORE the generic `/api/:table` routes so it isn't caught by `/api/families/:id`.

```javascript
  // GET /api/families/invites/pending — check for pending invites for current user
  router.get('/api/families/invites/pending', async (ctx) => {
    const result = await ctx.env.DB.prepare(`
      SELECT fi.*, f.name as familyName, f.emoji as familyEmoji, u.name as inviterName
      FROM family_invites fi
      JOIN families f ON fi.familyId = f.id
      JOIN users u ON fi.invitedBy = u.id
      WHERE fi.email = ? AND fi.status = 'pending'
    `).bind(ctx.user.email).all()
    return json({ data: result.results || [] })
  })
```

- [ ] **Step 3: Add POST /api/families/invites/:inviteId/accept**

```javascript
  // POST /api/families/invites/:inviteId/accept — accept an invite
  router.post('/api/families/invites/:inviteId/accept', async (ctx) => {
    const invite = await ctx.env.DB.prepare(
      'SELECT * FROM family_invites WHERE id = ? AND status = ?'
    ).bind(ctx.params.inviteId, 'pending').first()
    if (!invite) return json({ error: 'Invite not found' }, 404)

    if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase())
      return json({ error: 'Invite not for you' }, 403)

    // Check if already a member (could have joined via invite code)
    const existing = await ctx.env.DB.prepare(
      'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(invite.familyId, ctx.user.id).first()
    if (existing) {
      await ctx.env.DB.prepare(
        'UPDATE family_invites SET status = ?, updatedAt = ? WHERE id = ?'
      ).bind('accepted', new Date().toISOString(), invite.id).run()
      return json({ data: existing })
    }

    const now = new Date().toISOString()
    const member = {
      id: crypto.randomUUID(),
      familyId: invite.familyId,
      userId: ctx.user.id,
      role: 'member',
      isVirtual: 0,
      displayName: ctx.user.name || 'Member',
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

- [ ] **Step 4: Add POST /api/families/invites/:inviteId/decline**

```javascript
  // POST /api/families/invites/:inviteId/decline — decline an invite
  router.post('/api/families/invites/:inviteId/decline', async (ctx) => {
    const invite = await ctx.env.DB.prepare(
      'SELECT * FROM family_invites WHERE id = ? AND status = ?'
    ).bind(ctx.params.inviteId, 'pending').first()
    if (!invite) return json({ error: 'Invite not found' }, 404)

    if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase())
      return json({ error: 'Invite not for you' }, 403)

    await ctx.env.DB.prepare(
      'UPDATE family_invites SET status = ?, updatedAt = ? WHERE id = ?'
    ).bind('declined', new Date().toISOString(), invite.id).run()

    return json({ success: true })
  })
```

- [ ] **Step 5: Verify syntax**

Run: `cd D:/claude-hq/budget-app/api && node -c src/crud.js`

- [ ] **Step 6: Commit**

```bash
git add api/src/crud.js
git commit -m "feat: add email invite endpoints

POST /families/:id/invite — create in-app invite by email
GET /families/invites/pending — check pending invites on login
POST /families/invites/:id/accept — accept with atomic batch
POST /families/invites/:id/decline — decline invite"
```

---

### Task 6: Add Family Settings Endpoint + Admin Leave Protection

**Files:**
- Modify: `api/src/crud.js`

- [ ] **Step 1: Add PUT /api/families/:familyId/settings**

Add after the invite endpoints:

```javascript
  // PUT /api/families/:familyId/settings — admin can update family name/emoji
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
    if (Object.keys(updates).length === 0) return json({ error: 'Nothing to update' }, 400)
    updates.updatedAt = new Date().toISOString()

    const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ')
    await ctx.env.DB.prepare(
      `UPDATE families SET ${sets} WHERE id = ?`
    ).bind(...Object.values(updates), familyId).run()

    return json({ success: true })
  })
```

- [ ] **Step 2: Add admin leave protection to DELETE /api/:table/:id**

In the generic DELETE handler (around line 594), add a special case BEFORE the delete logic:

```javascript
    // Admin leave protection: prevent last admin from leaving family
    if (table === 'family_members') {
      const member = await ctx.env.DB.prepare(
        'SELECT role, familyId FROM family_members WHERE id = ? AND userId = ?'
      ).bind(id, ctx.user.id).first()
      if (member && member.role === 'admin') {
        const adminCount = await ctx.env.DB.prepare(
          'SELECT COUNT(*) as cnt FROM family_members WHERE familyId = ? AND role = ?'
        ).bind(member.familyId, 'admin').first()
        if (adminCount.cnt <= 1) {
          return json({ error: 'Transfer admin role before leaving. You are the only admin.' }, 400)
        }
      }
    }
```

- [ ] **Step 3: Remove old virtual member endpoints**

Delete these entire route handlers from `api/src/crud.js`:
- `router.post('/api/families/:familyId/members', ...)` (lines 117-154) — adds virtual members
- `router.delete('/api/families/:familyId/members/:memberId', ...)` (lines 156-177) — removes virtual members
- `router.put('/api/families/:familyId/members/:memberId/link', ...)` (lines 179-228) — links virtual to real
- `router.get('/api/families/:familyId/transactions', ...)` (lines 230-258) — replaced by /feed

Keep: `router.get('/api/families/:familyId/members', ...)` (lines 100-115) — still needed.

- [ ] **Step 4: Update sync/pull for goals and family_invites**

In the `GET /api/sync/pull` handler (around line 358), update the `for (const table of ALLOWED_TABLES)` loop. Add special cases for `goals` and `family_invites`:

After the `family_members` case (after line 383), add:

```javascript
      } else if (table === 'goals') {
        // Goals: return user's own + family-scoped goals from their families
        stmts.push(ctx.env.DB.prepare(
          `SELECT * FROM goals WHERE (userId = ? OR (familyId IN (SELECT familyId FROM family_members WHERE userId = ?))) AND updatedAt > ? ORDER BY updatedAt ASC LIMIT ? OFFSET ?`
        ).bind(userId, userId, since, limit, offset))
      } else if (table === 'family_invites') {
        // Family invites: pull pending invites for user's email
        stmts.push(ctx.env.DB.prepare(
          `SELECT * FROM family_invites WHERE email = (SELECT email FROM users WHERE id = ?) AND updatedAt > ? ORDER BY updatedAt ASC LIMIT ? OFFSET ?`
        ).bind(userId, since, limit, offset))
```

Remove the `shared_expenses` case (lines 384-390) — this table no longer exists.

- [ ] **Step 5: Update data export to skip dropped tables**

In `GET /api/data/export` (around line 410), the loop iterates `ALLOWED_TABLES` — since we removed `shared_expenses` and `settlement_history` from the array in Task 2, this is already handled. No changes needed.

- [ ] **Step 6: Verify syntax**

Run: `cd D:/claude-hq/budget-app/api && node -c src/crud.js`

- [ ] **Step 7: Commit**

```bash
git add api/src/crud.js
git commit -m "feat: family settings endpoint + admin leave protection

PUT /families/:id/settings for admin updates.
Prevent last admin from leaving. Remove virtual member endpoints.
Update sync/pull for goals (family-scoped) and family_invites."
```

---

## Chunk 2: Frontend Foundation — Storage, API, Cleanup

### Task 7: Update IndexedDB Schema

**Files:**
- Modify: `web/src/lib/storage.js` (lines 4, 140-145)

- [ ] **Step 1: Bump DB_VERSION and add v11 upgrade**

In `web/src/lib/storage.js`:
- Line 4: Change `DB_VERSION = 10` to `DB_VERSION = 11`
- After the `if (oldVersion < 10)` block (after line 145), add:

```javascript
        // v11: Family redesign — drop old stores, add familyInvites
        if (oldVersion < 11) {
          if (db.objectStoreNames.contains('sharedExpenses')) {
            db.deleteObjectStore('sharedExpenses')
          }
          if (db.objectStoreNames.contains('settlementHistory')) {
            db.deleteObjectStore('settlementHistory')
          }
          ensureStore(db, 'familyInvites', { keyPath: 'id' }, [
            { name: 'email', keyPath: 'email' },
            { name: 'familyId', keyPath: 'familyId' }
          ])
        }
```

- [ ] **Step 2: Clean up store arrays in helper functions**

In `web/src/lib/storage.js`, find the following functions and update their store name arrays:

- **`exportAll()`** (~line 231): Remove `'sharedExpenses'` and `'settlementHistory'` from the stores array. Add `'familyInvites'`.
- **`importAll()`** (~line 250): Same — remove old stores, add `'familyInvites'`.
- **`clearAllData()`** (~line 296): Same.
- **`clearUserData()`** (~line 315): Same.

- [ ] **Step 3: Remove obsolete helper functions**

Delete these functions (they reference the deleted `sharedExpenses` store):
- `getSharedExpensesByFamilyId()` (~line 487)
- `getSharedExpensesByDateRange()` (~line 495)

Also search for any imports of these functions in other files and remove them.

- [ ] **Step 4: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -5`
Expected: Build succeeds (warnings about unused imports are OK for now).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/storage.js
git commit -m "feat: bump IndexedDB to v11 for family redesign

Delete sharedExpenses and settlementHistory stores.
Add familyInvites store with email and familyId indexes.
Clean up store arrays and remove obsolete helper functions."
```

---

### Task 8: Update API Layer

**Files:**
- Modify: `web/src/lib/api.js` (lines 5-20, 195-211, 212-275)

- [ ] **Step 1: Update TABLE_MAP and REVERSE_TABLE_MAP**

In `web/src/lib/api.js`:
- Lines 5-11 (TABLE_MAP): Remove `sharedExpenses` and `settlementHistory` entries. Add `familyInvites: 'family_invites'`.
- Lines 14-19 (REVERSE_TABLE_MAP): Remove `shared_expenses` and `settlement_history` entries. Add `family_invites: 'familyInvites'`.

Updated TABLE_MAP:
```javascript
const TABLE_MAP = {
  debtPayments: 'debt_payments',
  loanPayments: 'loan_payments',
  familyMembers: 'family_members',
  familyInvites: 'family_invites',
}
```

Updated REVERSE_TABLE_MAP:
```javascript
const REVERSE_TABLE_MAP = {
  debt_payments: 'debtPayments',
  loan_payments: 'loanPayments',
  family_members: 'familyMembers',
  family_invites: 'familyInvites',
}
```

- [ ] **Step 2: Update CRUD exports**

In `web/src/lib/api.js`:
- Line 208: Remove `export const sharedExpenses = createCrud('sharedExpenses');`
- Line 210: Remove `export const settlementHistory = createCrud('settlementHistory');`
- Add: `export const familyInvites = createCrud('familyInvites');`

Updated exports section (lines 195-211):
```javascript
export const transactions = createCrud('transactions')
export const budgets = createCrud('budgets')
export const goals = createCrud('goals')
export const accounts = createCrud('accounts')
export const recurring = createCrud('recurring')
export const people = createCrud('people')
export const debts = createCrud('debts')
export const debtPayments = createCrud('debtPayments')
export const wishlistApi = createCrud('wishlist')
export const loans = createCrud('loans')
export const loanPayments = createCrud('loanPayments')
export const families = createCrud('families')
export const familyMembers = createCrud('familyMembers')
export const familyInvites = createCrud('familyInvites')
export const challenges = createCrud('challenges')
```

- [ ] **Step 3: Add familyFeedApi and invite endpoints to familyApi**

In `web/src/lib/api.js`, update the `familyApi` object (lines 213-275). Remove the virtual member methods and add new ones:

Replace the entire `familyApi` export with:

```javascript
export const familyApi = {
  /** Get ALL members of a family (real only now), bypassing userId filter */
  async getAllMembers(familyId) {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl) || !getAuthToken()) {
      const all = await storage.getAll('familyMembers')
      return all.filter((m) => m.familyId === familyId)
    }
    return apiFetch(apiUrl, `/api/families/${familyId}/members`)
  },

  /** Join a family by invite code */
  async joinByCode(inviteCode, displayName, emoji) {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required to join a family.')
    const result = await apiFetch(apiUrl, '/api/families/join', {
      method: 'POST',
      body: JSON.stringify({ inviteCode, displayName, emoji }),
    })
    if (result.family) await storage.add('families', result.family).catch(e => console.warn('Cache write failed:', e))
    if (result.member) await storage.add('familyMembers', result.member).catch(e => console.warn('Cache write failed:', e))
    return result
  },

  /** Get family feed (visible transactions from all members) */
  async getFeed(familyId, startDate, endDate) {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl)) return []
    const result = await apiFetch(apiUrl, `/api/families/${familyId}/feed?startDate=${startDate}&endDate=${endDate}`)
    return Array.isArray(result) ? result : []
  },

  /** Invite someone by email */
  async inviteByEmail(familyId, email) {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required.')
    return apiFetch(apiUrl, `/api/families/${familyId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ email }),
    })
  },

  /** Get pending invites for current user */
  async getPendingInvites() {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl)) return []
    const result = await apiFetch(apiUrl, '/api/families/invites/pending')
    return Array.isArray(result) ? result : []
  },

  /** Accept an invite */
  async acceptInvite(inviteId) {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required.')
    return apiFetch(apiUrl, `/api/families/invites/${inviteId}/accept`, {
      method: 'POST',
    })
  },

  /** Decline an invite */
  async declineInvite(inviteId) {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required.')
    return apiFetch(apiUrl, `/api/families/invites/${inviteId}/decline`, {
      method: 'POST',
    })
  },

  /** Update family settings (admin only) */
  async updateSettings(familyId, changes) {
    const apiUrl = await getApiUrl()
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required.')
    return apiFetch(apiUrl, `/api/families/${familyId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(changes),
    })
  },
}
```

- [ ] **Step 4: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`
Expected: Build succeeds (may have warnings from files still importing old exports — that's expected, we fix those next).

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api.js
git commit -m "feat: update API layer for family redesign

Add familyFeedApi, invite endpoints, family settings.
Remove sharedExpenses, settlementHistory, virtual member methods.
Add familyInvites CRUD and TABLE_MAP entries."
```

---

---

## Chunk 3: FamilyContext Rewrite

### Task 10: Rewrite FamilyContext

**Files:**
- Modify: `web/src/contexts/FamilyContext.jsx` (complete rewrite — 339 lines)

This is the core state management for the family feature. The rewrite:
- Removes: `generateInviteCode`, `generateUniqueInviteCode`, `sharedExpensesList`, `familyTransactions` (broken), `createVirtualMember`, `removeVirtualMember`, `linkVirtualMember`, stale request guard
- Adds: `familyFeed`, `loadFamilyFeed()`, `privacyRules`, `updatePrivacyRules()`, `pendingInvites`, `acceptInvite()`, `declineInvite()`, `inviteByEmail()`
- Fixes: invite code generation (no longer client-side), family transactions (uses feed endpoint)

- [ ] **Step 1: Write the new FamilyContext**

Replace the entire file `web/src/contexts/FamilyContext.jsx` with:

```jsx
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
```

- [ ] **Step 2: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`
Expected: Build succeeds. May show warnings from components still referencing old context values — those get fixed in later tasks.

- [ ] **Step 3: Commit**

```bash
git add web/src/contexts/FamilyContext.jsx
git commit -m "feat: rewrite FamilyContext for Shared Lens model

Remove: virtual members, shared expenses, broken tx loading,
client-side invite code generation.
Add: family feed, privacy rules, email invites, visibility resolver."
```

---

## Chunk 4: Transaction Forms

### Task 11: Update ManualForm — Remove Scope, Add Visibility

**Files:**
- Modify: `web/src/components/ManualForm.jsx` (lines 1-49, 130-295)

- [ ] **Step 1: Remove scope-related imports and state**

In `web/src/components/ManualForm.jsx`:
- Line 13: Remove `{ User, Home }` import from lucide-react. Replace with `{ Eye, EyeOff }`.
- Lines 38-49: Remove all scope-related state (`scope`, `paidBy`, `splitType`, `customSplits`).

Replace line 13:
```javascript
import { Eye, EyeOff } from 'lucide-react'
```

Remove lines 38-49 entirely (the `scope`, `paidBy`, `splitType`, `customSplits` state declarations).

- [ ] **Step 2: Add visibility state**

After the `accountId` state (line 36), add:

```javascript
  // Visibility: controlled by family privacy rules + manual toggle
  const [visibility, setVisibility] = useState(initial.visibility || null)
```

- [ ] **Step 3: Initialize visibility from privacy rules when category changes**

Find the category change handler or add a useEffect after the existing state declarations:

```javascript
  // Auto-set visibility when category changes (only in family mode)
  useEffect(() => {
    if (familyCtx?.isFamilyMode && category) {
      const resolved = familyCtx.resolveVisibility(category)
      setVisibility(resolved)
    }
  }, [category, familyCtx?.isFamilyMode, familyCtx?.resolveVisibility])
```

- [ ] **Step 4: Update handleSubmit — include visibility, remove scope fields**

In the handleSubmit function, find where the transaction object is built (search for `scope` or `paidBy` in the object). Replace the scope/paidBy/splitType/beneficiaries fields with `visibility`:

The transaction object should look like:
```javascript
    const transaction = {
      id: generateId(),
      userId: effectiveUserId,
      type,
      merchant: merchant.trim(),
      amount: parsed,
      currency,
      category,
      subcategory: subcategory || null,
      date,
      description: description.trim() || null,
      tags: tags.length > 0 ? tags : null,
      source: 'manual',
      visibility: familyCtx?.isFamilyMode ? visibility : null,
    }
```

Remove any references to `scope`, `paidBy`, `splitType`, `beneficiaries` from the transaction object.

- [ ] **Step 5: Remove scope/split UI section from the form JSX**

Find the JSX section that renders the scope selector (radio buttons for personal/household), paidBy selector, splitType selector, and custom splits UI. This is typically a large block (~70 lines). Remove it entirely.

Replace with a simple visibility toggle (only shown in family mode):

```jsx
        {/* Visibility toggle (family mode only) */}
        {familyCtx?.isFamilyMode && (
          <div className="flex items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => setVisibility(v => v === 'private' ? 'family' : 'private')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
                visibility === 'private'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
              }`}
            >
              {visibility === 'private' ? <EyeOff size={14} /> : <Eye size={14} />}
              {visibility === 'private' ? t('family.visibility.private') : t('family.visibility.family')}
            </button>
          </div>
        )}
```

- [ ] **Step 6: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 7: Commit**

```bash
git add web/src/components/ManualForm.jsx
git commit -m "feat: replace scope/split with visibility toggle in ManualForm

Remove scope, paidBy, splitType, beneficiaries fields.
Add eye icon visibility toggle that follows category privacy rules.
Visibility auto-resolves from FamilyContext.resolveVisibility()."
```

---

### Task 12: Update AddTransaction Page

**Files:**
- Modify: `web/src/pages/AddTransaction.jsx`

- [ ] **Step 1: Read the file to find scope references**

Read `web/src/pages/AddTransaction.jsx` and identify all lines referencing `scope`, `paidBy`, `splitType`, or `beneficiaries`.

- [ ] **Step 2: Remove scope/split logic**

Remove any tab-switching logic for scope (personal/household tabs), paidBy dropdowns, or split-type selectors. The ManualForm component handles visibility now, so AddTransaction just needs to pass through the transaction to ManualForm.

- [ ] **Step 3: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/AddTransaction.jsx
git commit -m "fix: remove scope/split references from AddTransaction"
```

---

### Task 13: Update TransactionEditModal

**Files:**
- Modify: `web/src/components/TransactionEditModal.jsx`

- [ ] **Step 1: Read the file**

Read `web/src/components/TransactionEditModal.jsx` and identify scope/split references.

- [ ] **Step 2: Remove scope/split fields from edit form**

Remove any `scope`, `paidBy`, `splitType`, `beneficiaries` fields from the edit form. If the modal uses ManualForm internally, this may already be handled. If it has its own form fields, remove them.

Add a visibility toggle similar to ManualForm if the edit modal has its own form.

- [ ] **Step 3: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add web/src/components/TransactionEditModal.jsx
git commit -m "fix: remove scope/split fields from TransactionEditModal"
```

---

### Task 14: Update QuickAdd

**Files:**
- Modify: `web/src/components/QuickAdd.jsx`

- [ ] **Step 1: Read the file and remove scope references**

Read `web/src/components/QuickAdd.jsx`. Remove any `scope` field from the transaction object it creates. Add `visibility` field using FamilyContext's resolveVisibility if in family mode.

- [ ] **Step 2: Verify build and commit**

```bash
git add web/src/components/QuickAdd.jsx
git commit -m "fix: remove scope references from QuickAdd, add visibility"
```

---

## Chunk 5: Dashboard & Pages

### Task 15: Update Dashboard — Family Filter

**Files:**
- Modify: `web/src/pages/Dashboard.jsx` (lines 6, 60-65, 307-356)

This is the largest change. Replace `scopeFilter` with `familyFilter` and integrate the family feed.

- [ ] **Step 1: Add FamilyContext import**

In `web/src/pages/Dashboard.jsx`, add import for useFamily:

```javascript
import { useFamily } from '../contexts/FamilyContext'
```

- [ ] **Step 2: Replace scopeFilter with familyFilter**

Replace lines 60-65 (scopeFilter state) with:

```javascript
  // Family filter: 'all' | 'mine' | memberId
  const [familyFilter, setFamilyFilter] = useState('all')
```

Remove the `handleScopeChange` callback and `localStorage` persistence for scope.

- [ ] **Step 3: Add family context consumption**

After the existing state declarations, add:

```javascript
  const { isFamilyMode, activeFamily, members, familyFeed, feedLoading, loadFamilyFeed } = useFamily()
```

- [ ] **Step 4: Load family feed when month changes**

Add a useEffect to load family feed when the month changes:

```javascript
  useEffect(() => {
    if (isFamilyMode && activeFamily) {
      const start = format(startOfMonth(month), 'yyyy-MM-dd')
      const end = format(endOfMonth(month), 'yyyy-MM-dd')
      loadFamilyFeed(start, end)
    }
  }, [isFamilyMode, activeFamily, month, loadFamilyFeed])
```

- [ ] **Step 5: Add transaction filtering logic**

Add a `useMemo` for filtered transactions based on familyFilter:

```javascript
  const filteredTransactions = useMemo(() => {
    if (!isFamilyMode) return transactions

    switch (familyFilter) {
      case 'all': {
        // Merge own transactions + family feed, dedupe by id
        const myIds = new Set(transactions.map(tx => tx.id))
        const merged = [...transactions]
        for (const tx of familyFeed) {
          if (!myIds.has(tx.id)) {
            merged.push(tx)
          }
        }
        return merged.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      }
      case 'mine':
        return transactions
      default:
        // Specific member: filter feed by userId
        return familyFeed.filter(tx => tx.userId === familyFilter)
    }
  }, [isFamilyMode, familyFilter, transactions, familyFeed])
```

- [ ] **Step 6: Replace scope filter UI with family filter chips**

Find the existing scope filter JSX (buttons for All/Personal/Household) and replace with:

```jsx
        {/* Family filter chips */}
        {isFamilyMode && (
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setFamilyFilter('all')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                familyFilter === 'all'
                  ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {t('family.filter.all')}
            </button>
            <button
              onClick={() => setFamilyFilter('mine')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                familyFilter === 'mine'
                  ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {t('family.filter.mine')}
            </button>
            {members
              .filter(m => m.userId !== effectiveUserId)
              .map(m => (
                <button
                  key={m.id}
                  onClick={() => setFamilyFilter(m.userId)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    familyFilter === m.userId
                      ? 'bg-teal-100 dark:bg-teal-900/40 text-teal-800 dark:text-teal-200'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {m.emoji || '👤'} {m.displayName}
                </button>
              ))
            }
          </div>
        )}
```

- [ ] **Step 7: Use filteredTransactions instead of raw transactions for calculations**

Throughout the Dashboard component, replace references to `transactions` (the raw list) with `filteredTransactions` wherever transaction sums, category breakdowns, charts, or listings are computed. Key areas:
- Quick stats (income/expenses sum)
- Spending chart data
- Top categories
- Budget progress bars
- Recent transactions list

Search for patterns like `transactions.filter(` and `transactions.reduce(` and replace with `filteredTransactions.filter(` / `filteredTransactions.reduce(`.

**Important exception:** Budget calculations for family budgets (those with `familyId`) should always use the full "all" filter (own tx + family feed). Personal budgets use `filteredTransactions`.

- [ ] **Step 8: Remove old scope filter references**

Remove any remaining references to `scopeFilter`, `setScopeFilter`, `handleScopeChange`, `lumet_dashboard_scope` localStorage key, and the scope filter JSX (Personal/Household buttons).

- [ ] **Step 9: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 10: Commit**

```bash
git add web/src/pages/Dashboard.jsx
git commit -m "feat: replace scope filter with family filter on Dashboard

Add All/Mine/[Partner] filter chips using family feed.
Merge own transactions + feed for 'All' view.
Use filteredTransactions for all calculations and charts."
```

---

### Task 16: Update Transactions Page — Family Filter + Eye Icon

**Files:**
- Modify: `web/src/pages/Transactions.jsx`

The Transactions page is separate from the Dashboard and is one of the most-used pages. It needs the same family filter chips plus per-transaction visibility toggle (eye icon).

- [ ] **Step 1: Read the file and identify scope references**

Read `web/src/pages/Transactions.jsx`. Identify all `scopeFilter` references and scope-related UI. Key areas:
- `scopeFilter` state declaration
- Scope filter buttons (Personal/Household/All)
- Transaction filtering by scope
- Scope in export/CSV logic
- Empty state checks using scopeFilter

- [ ] **Step 2: Add FamilyContext import and family filter state**

```javascript
import { useFamily } from '../contexts/FamilyContext'
```

Replace `scopeFilter` with:
```javascript
const [familyFilter, setFamilyFilter] = useState('all')
const { isFamilyMode, activeFamily, members, familyFeed, loadFamilyFeed } = useFamily()
```

- [ ] **Step 3: Load family feed when date range changes**

Add a useEffect to load family feed when the date range changes:
```javascript
useEffect(() => {
  if (isFamilyMode && activeFamily) {
    loadFamilyFeed(startDate, endDate)
  }
}, [isFamilyMode, activeFamily, startDate, endDate, loadFamilyFeed])
```

- [ ] **Step 4: Add family filter chips UI**

Replace the scope filter buttons with the same filter chips as Dashboard (All/Mine/[Partner]).

- [ ] **Step 5: Add per-transaction visibility toggle (eye icon)**

For each transaction row that belongs to the current user, add an eye icon button that toggles visibility:

```jsx
{tx.userId === effectiveUserId && isFamilyMode && (
  <button
    onClick={async (e) => {
      e.stopPropagation()
      const newVis = tx.visibility === 'private' ? 'family' : 'private'
      await txApi.update(tx.id, { visibility: newVis })
      // Refresh transaction list
      loadTransactions()
    }}
    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
    title={tx.visibility === 'private' ? t('family.visibility.private') : t('family.visibility.family')}
  >
    {tx.visibility === 'private' ? <EyeOff size={14} /> : <Eye size={14} />}
  </button>
)}
```

- [ ] **Step 6: Add partner avatar badge for family transactions**

For transactions from other family members (in family feed), show a subtle badge with their emoji:

```jsx
{tx.userId !== effectiveUserId && (
  <span className="text-xs ml-1" title={memberName}>
    {memberEmoji}
  </span>
)}
```

Use `members.find(m => m.userId === tx.userId)` to get the member's displayName and emoji.

- [ ] **Step 7: Filter transactions using familyFilter**

Apply the same filtering logic as Dashboard:
```javascript
const filteredTransactions = useMemo(() => {
  if (!isFamilyMode) return transactions
  switch (familyFilter) {
    case 'all': {
      const myIds = new Set(transactions.map(tx => tx.id))
      const merged = [...transactions]
      for (const tx of familyFeed) {
        if (!myIds.has(tx.id)) merged.push(tx)
      }
      return merged.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    }
    case 'mine': return transactions
    default: return familyFeed.filter(tx => tx.userId === familyFilter)
  }
}, [isFamilyMode, familyFilter, transactions, familyFeed])
```

- [ ] **Step 8: Remove old scope references**

Remove all remaining `scopeFilter`, `setScopeFilter`, scope localStorage, and scope filter JSX.

- [ ] **Step 9: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 10: Commit**

```bash
git add web/src/pages/Transactions.jsx
git commit -m "feat: add family filter + visibility toggle to Transactions page

Replace scopeFilter with familyFilter (All/Mine/[Partner]).
Add eye icon to toggle per-transaction visibility.
Show partner avatar badge on family feed transactions."
```

---

### Task 17: Update Budgets Page — Family Budgets

**Files:**
- Modify: `web/src/pages/Budgets.jsx`

- [ ] **Step 1: Read the file**

Read `web/src/pages/Budgets.jsx` to understand current family budget handling.

- [ ] **Step 2: Add FamilyContext integration**

```javascript
import { useFamily } from '../contexts/FamilyContext'
```

Consume: `isFamilyMode`, `activeFamily`, `familyFeed`, `loadFamilyFeed`.

- [ ] **Step 3: Add family/personal toggle for budget creation**

When creating a new budget in family mode, show a toggle:
```jsx
{isFamilyMode && (
  <div className="flex gap-2 mb-3">
    <button
      type="button"
      onClick={() => setBudgetScope('personal')}
      className={`px-3 py-1.5 rounded-full text-sm ${budgetScope === 'personal' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600'}`}
    >
      {t('budget.scope.personal')}
    </button>
    <button
      type="button"
      onClick={() => setBudgetScope('family')}
      className={`px-3 py-1.5 rounded-full text-sm ${budgetScope === 'family' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600'}`}
    >
      {t('budget.scope.family')}
    </button>
  </div>
)}
```

When saving, set `familyId = activeFamily.id` if scope is 'family'.

- [ ] **Step 4: Update budget progress calculation**

For family budgets (`budget.familyId`), compute spent amount from family feed (all visible transactions in that category from all members). For personal budgets, use only own transactions.

```javascript
function getBudgetSpent(budget, myTransactions, familyFeed) {
  const txList = budget.familyId
    ? [...myTransactions, ...familyFeed].filter(tx => tx.visibility === 'family')
    : myTransactions
  return txList
    .filter(tx => tx.category === budget.category && tx.type === 'expense')
    .reduce((sum, tx) => sum + (tx.amount || 0), 0)
}
```

- [ ] **Step 5: Show family badge on family budgets**

Display a small family icon or badge next to family budget names to distinguish them from personal budgets.

- [ ] **Step 6: Verify build and commit**

```bash
git add web/src/pages/Budgets.jsx
git commit -m "feat: add family budget support to Budgets page

Add personal/family toggle for budget creation.
Family budgets use combined spending from family feed.
Show family badge on family budgets."
```

---

### Task 18: Update Goals Page — Family Goals

**Files:**
- Modify: `web/src/pages/Goals.jsx`

- [ ] **Step 1: Read the file**

Read `web/src/pages/Goals.jsx` to understand current goal handling.

- [ ] **Step 2: Add FamilyContext integration**

```javascript
import { useFamily } from '../contexts/FamilyContext'
```

Consume: `isFamilyMode`, `activeFamily`.

- [ ] **Step 3: Add family/personal toggle for goal creation**

When creating a new goal in family mode, show a toggle similar to Budgets:
```jsx
{isFamilyMode && (
  <div className="flex gap-2 mb-3">
    <button type="button" onClick={() => setGoalScope('personal')} ...>
      {t('goal.scope.personal')}
    </button>
    <button type="button" onClick={() => setGoalScope('family')} ...>
      {t('goal.scope.family')}
    </button>
  </div>
)}
```

When saving, set `familyId = activeFamily.id` if scope is 'family'.

- [ ] **Step 4: Show family goals from sync**

Family goals arrive via the updated sync/pull endpoint (Task 6 Step 4). They should appear in the goals list alongside personal goals. Display them with a family badge.

- [ ] **Step 5: Allow any family member to update family goal progress**

Family goals (`goal.familyId`) should be editable by any family member — the `currentAmount` can be updated by anyone. The generic PUT endpoint allows the owner to update, but family goals need cross-user updates. For now, family goals are synced to all members via the pull endpoint, and each member can contribute by creating a "contribution" via the existing goal update flow.

- [ ] **Step 6: Verify build and commit**

```bash
git add web/src/pages/Goals.jsx
git commit -m "feat: add family goal support to Goals page

Add personal/family toggle for goal creation.
Family goals visible to all members with family badge.
Family goals set familyId on creation."
```

---

### Task 19: Update Settings Page — KNOWN_STORES

**Files:**
- Modify: `web/src/pages/Settings.jsx`

- [ ] **Step 1: Read the file and find KNOWN_STORES**

Read `web/src/pages/Settings.jsx` around line 255. Find the `KNOWN_STORES` array.

- [ ] **Step 2: Update KNOWN_STORES array**

Remove `'sharedExpenses'` and `'settlementHistory'` from the array. Add `'familyInvites'`.

- [ ] **Step 3: Verify build and commit**

```bash
git add web/src/pages/Settings.jsx
git commit -m "fix: update KNOWN_STORES in Settings for family redesign"
```

---

### Task 20: Update Analytics Page

**Files:**
- Modify: `web/src/pages/Analytics.jsx`

- [ ] **Step 1: Read and remove scope references**

Read `web/src/pages/Analytics.jsx`. Remove any `scope`-based filtering logic. The Analytics page should work with whatever transactions are loaded — it doesn't need its own family filter (it uses the same data source as Dashboard).

- [ ] **Step 2: Verify build and commit**

```bash
git add web/src/pages/Analytics.jsx
git commit -m "fix: remove scope-based filtering from Analytics"
```

---

### Task 21: Update Reports Page

**Files:**
- Modify: `web/src/pages/Reports.jsx`

- [ ] **Step 1: Read and remove scope references**

Same approach as Analytics. Remove any `scope` filter references.

- [ ] **Step 2: Verify build and commit**

```bash
git add web/src/pages/Reports.jsx
git commit -m "fix: remove scope-based filtering from Reports"
```

---

### Task 22: Update Import Preview

**Files:**
- Modify: `web/src/components/import/StepPreview.jsx`

- [ ] **Step 1: Read and remove scope references**

Remove any `scope` column from the import preview table/mapping.

- [ ] **Step 2: Verify build and commit**

```bash
git add web/src/components/import/StepPreview.jsx
git commit -m "fix: remove scope from import preview"
```

---

### Task 23: Update AI and Export Helpers

**Files:**
- Modify: `web/src/lib/ai.js`
- Modify: `web/src/lib/exportHelpers.js`

- [ ] **Step 1: Update ai.js**

Read `web/src/lib/ai.js`. Remove `scope`, `beneficiaries`, `splitType`, `paidBy` from any AI prompt templates or transaction field mappings.

- [ ] **Step 2: Update exportHelpers.js**

Read `web/src/lib/exportHelpers.js`. Remove `scope` from CSV/export column mappings. Optionally add `visibility` to export.

- [ ] **Step 3: Verify build and commit**

```bash
git add web/src/lib/ai.js web/src/lib/exportHelpers.js
git commit -m "fix: remove scope/split from AI prompts and export helpers"
```

---

## Chunk 6: Family Page Redesign

### Task 24: Update FamilyMembers Component

**Files:**
- Modify: `web/src/components/family/FamilyMembers.jsx`

- [ ] **Step 1: Read the file**

Read `web/src/components/family/FamilyMembers.jsx` to understand current virtual member UI.

- [ ] **Step 2: Remove virtual member UI**

Remove:
- "Add virtual member" button and form
- Virtual member indicators (icons, badges)
- "Link to real account" button
- `createVirtualMember`, `removeVirtualMember`, `linkVirtualMember` from context destructuring

Keep:
- Member list display (name, emoji, role)
- Real member management

- [ ] **Step 3: Verify build and commit**

```bash
git add web/src/components/family/FamilyMembers.jsx
git commit -m "fix: remove virtual member UI from FamilyMembers

Keep real member list display. Remove add/remove/link virtual
member functionality."
```

---

### Task 25: Update FamilySettings Component

**Files:**
- Modify: `web/src/components/family/FamilySettings.jsx`

- [ ] **Step 1: Read the file**

Read `web/src/components/family/FamilySettings.jsx`.

- [ ] **Step 2: Simplify to admin-only settings**

Keep: family name edit, invite code display + copy, leave family.
Remove: any settlement/split configuration if present.
Update: use `familyApi.updateSettings()` instead of generic CRUD.

- [ ] **Step 3: Verify build and commit**

```bash
git add web/src/components/family/FamilySettings.jsx
git commit -m "fix: simplify FamilySettings to admin-only essentials"
```

---

### Task 26: Rewrite Family Page

**Files:**
- Modify: `web/src/pages/Family.jsx` (complete rewrite — 270 lines)

- [ ] **Step 1: Write the new Family page**

Replace the 5-tab layout with a single-page layout with 4 sections:
1. **Pending Invites** (banner at top, if any)
2. **Members** — list + invite button
3. **My Privacy Rules** — category toggles
4. **Family Settings** (admin only) — name, invite code, leave

Remove imports for deleted components (FamilyOverview, FamilyAllExpenses, FamilySettlements).

The new page should import:
- `FamilyMembers` from `'../components/family/FamilyMembers'`
- `FamilySettings` from `'../components/family/FamilySettings'`
- `useFamily` from `'../contexts/FamilyContext'`
- `useCategories` from `'../hooks/useCategories'` (for privacy rules)
- Icons from lucide-react: `Eye, EyeOff, Mail, Users, Shield, Settings`

Key sections:

**Pending invites banner:**
```jsx
{pendingInvites.length > 0 && (
  <div className="space-y-2 mb-6">
    {pendingInvites.map(invite => (
      <div key={invite.id} className="card p-4 flex items-center justify-between border-l-4 border-teal-500">
        <div>
          <span className="font-medium">{invite.familyEmoji} {invite.familyName}</span>
          <span className="text-sm text-gray-500 ml-2">
            {invite.inviterName} {t('family.invite.pending')}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={() => acceptInvite(invite.id)} className="btn-primary text-sm px-3 py-1">
            {t('family.invite.accept')}
          </button>
          <button onClick={() => declineInvite(invite.id)} className="btn-secondary text-sm px-3 py-1">
            {t('family.invite.decline')}
          </button>
        </div>
      </div>
    ))}
  </div>
)}
```

**Privacy rules section:**
```jsx
{isFamilyMode && (
  <div className="card p-4">
    <h3 className="font-heading text-lg mb-3 flex items-center gap-2">
      <Shield size={18} />
      {t('family.privacy.title')}
    </h3>
    <div className="space-y-2">
      {categories.map(cat => (
        <div key={cat.id} className="flex items-center justify-between py-1.5">
          <span className="flex items-center gap-2">
            <span>{cat.emoji}</span>
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
            className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${
              privacyRules[cat.id] === 'private'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                : 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300'
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
```

- [ ] **Step 2: Add email invite modal**

Add a simple modal for inviting by email:

```jsx
{showInviteModal && (
  <Modal onClose={() => setShowInviteModal(false)}>
    <h3 className="font-heading text-lg mb-3">{t('family.invite.title')}</h3>

    {/* Invite code section */}
    <div className="mb-4">
      <label className="text-sm text-gray-500 mb-1 block">{t('family.invite.code')}</label>
      <div className="flex items-center gap-2">
        <code className="bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded font-mono text-lg tracking-widest">
          {activeFamily?.inviteCode}
        </code>
        <button
          onClick={() => {
            navigator.clipboard.writeText(activeFamily?.inviteCode || '')
            toast.success('Copied!')
          }}
          className="btn-secondary text-sm px-3 py-1.5"
        >
          Copy
        </button>
      </div>
    </div>

    {/* Email invite */}
    <form onSubmit={async (e) => {
      e.preventDefault()
      try {
        await inviteByEmail(inviteEmail)
        toast.success('Invite sent!')
        setInviteEmail('')
        setShowInviteModal(false)
      } catch (err) {
        toast.error(err.message)
      }
    }}>
      <label className="text-sm text-gray-500 mb-1 block">{t('family.invite.email')}</label>
      <div className="flex gap-2">
        <input
          type="email"
          value={inviteEmail}
          onChange={(e) => setInviteEmail(e.target.value)}
          className="input flex-1"
          placeholder="ana@email.com"
          required
        />
        <button type="submit" className="btn-primary text-sm px-4">
          <Mail size={14} className="mr-1 inline" />
          {t('common.add')}
        </button>
      </div>
    </form>
  </Modal>
)}
```

- [ ] **Step 3: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Family.jsx
git commit -m "feat: redesign Family page with 4-section layout

Replace 5-tab layout with: pending invites banner,
members list with invite button, privacy rules per category,
admin settings section. Remove old tab component imports."
```

---

## Chunk 7: Translations, Cleanup & Final Verification

### Task 27: Update Translation Files

**Files:**
- Modify: `web/src/lib/translations/en.js`
- Modify: `web/src/lib/translations/ro.js`

- [ ] **Step 1: Read both translation files**

Read `web/src/lib/translations/en.js` and `web/src/lib/translations/ro.js` to find existing family/scope/split keys.

- [ ] **Step 2: Add new keys to en.js**

Add these keys (find the family section or add at the end before the closing `}`:

```javascript
// Family filter
'family.filter.all': 'All',
'family.filter.mine': 'Mine',

// Privacy
'family.privacy.title': 'My Privacy Rules',
'family.privacy.shared': 'Shared',
'family.privacy.private': 'Private',

// Visibility
'family.visibility.family': 'Visible to family',
'family.visibility.private': 'Private',

// Invite
'family.invite.title': 'Invite Member',
'family.invite.code': 'Invite Code',
'family.invite.email': 'Invite by email',
'family.invite.pending': 'invited you to join',
'family.invite.accept': 'Accept',
'family.invite.decline': 'Decline',

// Budget/Goal scope
'budget.scope.personal': 'Personal budget',
'budget.scope.family': 'Family budget',
'goal.scope.personal': 'Personal goal',
'goal.scope.family': 'Family goal',

// Admin
'family.admin.leaveWarning': 'Transfer admin role first',
```

- [ ] **Step 3: Add corresponding keys to ro.js**

```javascript
// Family filter
'family.filter.all': 'Toți',
'family.filter.mine': 'Ale mele',

// Privacy
'family.privacy.title': 'Regulile mele de confidențialitate',
'family.privacy.shared': 'Partajat',
'family.privacy.private': 'Privat',

// Visibility
'family.visibility.family': 'Vizibil pentru familie',
'family.visibility.private': 'Privat',

// Invite
'family.invite.title': 'Invită un membru',
'family.invite.code': 'Cod de invitație',
'family.invite.email': 'Invită prin email',
'family.invite.pending': 'te-a invitat să te alături',
'family.invite.accept': 'Acceptă',
'family.invite.decline': 'Refuză',

// Budget/Goal scope
'budget.scope.personal': 'Buget personal',
'budget.scope.family': 'Buget de familie',
'goal.scope.personal': 'Obiectiv personal',
'goal.scope.family': 'Obiectiv de familie',

// Admin
'family.admin.leaveWarning': 'Transferă rolul de admin mai întâi',
```

- [ ] **Step 4: Remove orphaned keys**

In both `en.js` and `ro.js`, remove any keys containing:
- `scope` (transaction scope)
- `splitType`
- `paidBy`
- `beneficiaries`
- `settlement` / `settle`
- `family.overview` (replaced)
- `family.expenses` (replaced)

Do NOT remove `scope` keys that are unrelated to family (check context).

- [ ] **Step 5: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/translations/en.js web/src/lib/translations/ro.js
git commit -m "feat: update translation keys for family redesign

Add family filter, privacy, visibility, invite keys in en/ro.
Remove orphaned scope/split/settlement keys."
```

---

### Task 28: Delete Old Files

**Files:**
- Delete: 6 files

**Important:** This task MUST run AFTER Task 26 (Family page rewrite), because `Family.jsx` imports the files being deleted.

- [ ] **Step 1: Verify Family.jsx no longer imports deleted components**

Run: `grep -n "FamilySettlements\|FamilyAllExpenses\|FamilyOverview" web/src/pages/Family.jsx`
Expected: No results (Task 26 should have removed these imports).

- [ ] **Step 2: Delete files**

```bash
cd D:/claude-hq/budget-app
rm -f web/src/components/family/FamilySettlements.jsx
rm -f web/src/components/family/FamilyAllExpenses.jsx
rm -f web/src/components/family/FamilyOverview.jsx
rm -f web/src/lib/settlement.js
rm -f web/src/components/SplitCalculator.jsx
rm -f web/src/components/SplitExpenseModal.jsx
```

- [ ] **Step 3: Verify no remaining imports of deleted files**

Run: `grep -rn "FamilySettlements\|FamilyAllExpenses\|FamilyOverview\|settlement\.js\|SplitCalculator\|SplitExpenseModal" web/src/ --include="*.jsx" --include="*.js"`
Expected: No results.

- [ ] **Step 4: Verify build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build 2>&1 | tail -10`

- [ ] **Step 5: Commit**

```bash
git add -u
git commit -m "chore: delete obsolete family files

Remove FamilySettlements, FamilyAllExpenses, FamilyOverview,
settlement.js, SplitCalculator, SplitExpenseModal.
These are replaced by the Shared Lens family model."
```

---

### Task 29: Final Build Verification

- [ ] **Step 1: Full build check**

Run: `cd D:/claude-hq/budget-app/web && npx vite build`
Expected: Clean build, no errors. Warnings about unused variables are acceptable but should be reviewed.

- [ ] **Step 2: Check for remaining old references**

Search for leftover references that should have been cleaned up:

```bash
grep -rn "sharedExpenses\|shared_expenses\|settlementHistory\|settlement_history\|splitType\|beneficiaries\|isVirtual\|FamilyOverview\|FamilyAllExpenses\|FamilySettlements\|SplitCalculator\|SplitExpenseModal\|settlement\.js" web/src/ --include="*.jsx" --include="*.js" | grep -v node_modules | grep -v ".map"
```

Expected: No results (or only comments/type references that are harmless).

- [ ] **Step 3: Fix any remaining references**

If step 2 finds issues, fix them. Common places:
- Import statements referencing deleted files
- State destructuring referencing removed context values
- JSX referencing deleted state variables

- [ ] **Step 4: Clean build**

Run: `cd D:/claude-hq/budget-app/web && npx vite build`
Expected: Zero errors.

- [ ] **Step 5: Start dev servers and verify**

Start the dev servers and check:
1. Dashboard renders without console errors
2. Family page loads with new layout
3. Creating a transaction doesn't crash
4. No network errors on login

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: fix remaining references from family redesign cleanup"
```

---

## Execution Notes

### Build Command
```bash
cd D:/claude-hq/budget-app/web && npx vite build
```

### Dev Servers
```bash
# From D:\claude-hq (workspace root)
# Web: node budget-app/web/node_modules/vite/bin/vite.js budget-app/web --host
# API: node budget-app/api/node_modules/wrangler/bin/wrangler.js dev --config budget-app/api/wrangler.toml
```

### Migration (local)
```bash
cd D:/claude-hq/budget-app/api && npx wrangler d1 execute budgetpilot-db --local --file=./migrations/013_family_redesign.sql
```

### Migration (production) — DO NOT run until code is deployed
```bash
cd D:/claude-hq/budget-app/api && npx wrangler d1 execute budgetpilot-db --remote --file=./migrations/013_family_redesign.sql
```

### Key Decision Points
- **Task 15 (Dashboard)**: This is the most complex change. The implementer should carefully identify ALL places where `transactions` is used in computations and decide whether each should use `filteredTransactions`. Budget progress bars are the trickiest — family budgets should always count all visible family spending.
- **Task 16 (Transactions)**: Second most complex. Needs eye icon per-transaction for toggling visibility + partner avatar badges.
- **Task 17 (Budgets)**: Family budget progress must use `familyFeed` for spending calculation.
- **Task 26 (Family page)**: The exact JSX layout should follow existing card/section patterns in the codebase. Check `index.css` for `.card` and `.page-title` conventions.
- **Task 12-14 (Forms)**: Before removing scope fields, verify that no other component depends on `scope` being present on the transaction object. The removal from TABLE_COLUMNS on the backend will silently strip it, but the frontend should not reference it.

### Dependencies Between Tasks
```
Task 1 (migration) ──┐
Task 2 (config maps) ─┤
Task 3 (invite code) ─┤
Task 4 (feed) ─────────┼──→ Task 7 (storage) ──→ Task 8 (api) ──→ Task 10 (context)
Task 5 (invites) ──────┤                                              │
Task 6 (settings) ─────┘                                              ▼
                                                  Task 11 (ManualForm)
                                                  Task 12 (AddTx)
                                                  Task 13 (EditModal)
                                                  Task 14 (QuickAdd)
                                                        │
                                                        ▼
                                                  Task 15 (Dashboard)
                                                  Task 16 (Transactions + eye icon)
                                                  Task 17 (Budgets)
                                                  Task 18 (Goals)
                                                  Task 19 (Settings)
                                                  Task 20-23 (Analytics, Reports, Import, AI/Export)
                                                  Task 24-25 (FamilyMembers, FamilySettings)
                                                        │
                                                        ▼
                                                  Task 26 (Family page rewrite)
                                                        │
                                                        ▼
                                                  Task 27 (translations)
                                                  Task 28 (delete files) ← MUST be after Task 26
                                                        │
                                                        ▼
                                                  Task 29 (final verification)
```

Backend tasks (1-6) can run in parallel.
Frontend foundation (7-8) depends on backend config.
Context (10) depends on API layer (8).
All UI tasks (11-26) depend on context (10).
File deletion (28) depends on Family page rewrite (26).
Translations (27) can run in parallel with UI tasks.
Final verification (29) must be last.
