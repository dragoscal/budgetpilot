// Generic CRUD handlers for D1 database tables
import { json } from './router.js';
import { generateId } from './auth.js';
import { logActivity } from './index.js';

const ALLOWED_TABLES = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'people', 'debts', 'debt_payments', 'wishlist', 'loans', 'loan_payments', 'families', 'family_members', 'family_invites', 'challenges', 'receipts'];

// Map client-side store names to D1 table names (for sync compatibility)
const TABLE_ALIASES = { debtPayments: 'debt_payments', loanPayments: 'loan_payments', familyMembers: 'family_members', familyInvites: 'family_invites' };

function resolveTable(name) {
  return TABLE_ALIASES[name] || name;
}

// Map tables to their user-ownership column (defaults to 'userId')
const USER_COLUMN = { families: 'createdBy', family_invites: 'invitedBy' };

function getUserColumn(table) {
  return USER_COLUMN[table] || 'userId';
}

// JSON columns that need to be serialized/deserialized
const JSON_COLUMNS = { transactions: ['tags', 'items'] };

// Boolean columns — SQLite returns 0/1, normalize to true/false for frontend
const BOOLEAN_COLUMNS = {
  recurring: ['active', 'autoDetected', 'autoDebit', 'isVariable'],
  family_members: ['isVirtual'],
  debts: ['settled'],
  wishlist: ['purchased'],
  accounts: ['isLiability'],
  budgets: ['rollover'],
};

// Valid D1 columns per table — client may send extra fields that don't exist in the schema
const TABLE_COLUMNS = {
  transactions: new Set(['id','userId','type','merchant','amount','currency','category','subcategory','date','description','tags','source','recurringId','items','splitFrom','importBatch','originalText','visibility','createdAt','updatedAt','deletedAt']),
  budgets: new Set(['id','userId','category','amount','currency','month','rollover','familyId','createdAt','updatedAt']),
  goals: new Set(['id','userId','name','type','targetAmount','currentAmount','currency','targetDate','interestRate','color','familyId','createdAt','updatedAt']),
  accounts: new Set(['id','userId','name','type','balance','currency','color','isLiability','createdAt','updatedAt']),
  recurring: new Set(['id','userId','name','merchant','amount','currency','category','frequency','billingDay','billingMonth','endDate','active','autoDetected','autoDebit','isVariable','recurringType','status','pausedAt','cancelledAt','createdAt','updatedAt']),
  people: new Set(['id','userId','name','emoji','phone','notes','createdAt','updatedAt']),
  debts: new Set(['id','userId','personId','type','amount','remaining','currency','description','reason','date','dueDate','settled','status','settledDate','createdAt','updatedAt']),
  debt_payments: new Set(['id','userId','debtId','amount','date','note','createdAt','updatedAt']),
  wishlist: new Set(['id','userId','name','estimatedPrice','currency','category','priority','url','notes','purchased','purchasedDate','createdAt','updatedAt']),
  loans: new Set(['id','userId','name','type','lender','principalAmount','remainingBalance','interestRate','interestType','interestPeriod','monthlyPayment','currency','startDate','endDate','paymentDay','status','notes','createdAt','updatedAt']),
  loan_payments: new Set(['id','userId','loanId','amount','principalPortion','interestPortion','date','note','createdAt','updatedAt']),
  families: new Set(['id','name','createdBy','emoji','inviteCode','defaultCurrency','createdAt','updatedAt']),
  family_members: new Set(['id','familyId','userId','role','isVirtual','displayName','emoji','monthlyIncome','joinedAt','createdAt','updatedAt']),
  family_invites: new Set(['id','familyId','email','invitedBy','status','createdAt','updatedAt']),
  challenges: new Set(['id','userId','name','title','type','targetAmount','target','category','startDate','endDate','durationDays','status','progress','createdAt','updatedAt']),
  receipts: new Set(['id','userId','merchant','total','currency','category','transactionId','processedAt','createdAt','updatedAt']),
};

// Strip unknown columns so D1 doesn't throw "table X has no column named Y"
function filterColumns(table, data) {
  const allowed = TABLE_COLUMNS[table];
  if (!allowed) return data;
  const filtered = {};
  for (const [key, value] of Object.entries(data)) {
    if (allowed.has(key)) filtered[key] = value;
  }
  return filtered;
}

function serializeRow(table, data) {
  const jsonCols = JSON_COLUMNS[table] || [];
  const out = { ...data };
  for (const col of jsonCols) {
    if (out[col] && typeof out[col] !== 'string') {
      out[col] = JSON.stringify(out[col]);
    }
  }
  return out;
}

function deserializeRow(table, row) {
  if (!row) return null;
  const jsonCols = JSON_COLUMNS[table] || [];
  const boolCols = BOOLEAN_COLUMNS[table] || [];
  const out = { ...row };
  for (const col of jsonCols) {
    if (out[col] && typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch (e) { /* keep as string */ }
    }
  }
  // Normalize SQLite 0/1 integers to JS booleans for frontend
  for (const col of boolCols) {
    if (col in out) out[col] = !!out[col];
  }
  return out;
}

async function generateUniqueInviteCode(db, maxRetries = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    let code = '';
    for (let i = 0; i < 8; i++) code += chars[bytes[i] % chars.length];
    const existing = await db.prepare(
      'SELECT id FROM families WHERE inviteCode = ?'
    ).bind(code).first();
    if (!existing) return code;
  }
  throw new Error('Failed to generate unique invite code');
}

export function registerCrudRoutes(router) {
  // ─── SPECIFIC routes FIRST (before generic :table routes) ───

  // GET /api/families/:familyId/members — get ALL members of a family
  // (The generic /api/family_members endpoint only returns the current user's records)
  router.get('/api/families/:familyId/members', async (ctx) => {
    const { familyId } = ctx.params;

    // Verify requesting user is a member of this family
    const myMembership = await ctx.env.DB.prepare(
      'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first();
    if (!myMembership) return json({ error: 'Not a member of this family' }, 403);

    // Return ALL members of this family
    const result = await ctx.env.DB.prepare(
      'SELECT * FROM family_members WHERE familyId = ? ORDER BY joinedAt ASC'
    ).bind(familyId).all();

    return json({ data: result.results || [] });
  });

  // GET /api/families/:familyId/feed — family members' visible transactions
  router.get('/api/families/:familyId/feed', async (ctx) => {
    const { familyId } = ctx.params;
    const { startDate, endDate, limit = '500', offset = '0' } = ctx.query;
    if (!startDate || !endDate) return json({ error: 'startDate and endDate required' }, 400);

    // Verify caller is a family member
    const membership = await ctx.env.DB.prepare(
      'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first();
    if (!membership) return json({ error: 'Not a member' }, 403);

    const feedLimit = Math.min(parseInt(limit), 5000);
    const feedOffset = parseInt(offset);

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
    `).bind(familyId, startDate, endDate, feedLimit, feedOffset).all();

    return json({
      data: (result.results || []).map(r => deserializeRow('transactions', r)),
      meta: { limit: feedLimit, offset: feedOffset }
    });
  });

  // POST /api/families/:familyId/invite — invite by email (in-app notification)
  router.post('/api/families/:familyId/invite', async (ctx) => {
    const { familyId } = ctx.params;
    const { email } = ctx.body;
    if (!email?.trim()) return json({ error: 'Email is required' }, 400);

    // Verify caller is admin
    const membership = await ctx.env.DB.prepare(
      'SELECT role FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first();
    if (!membership || membership.role !== 'admin')
      return json({ error: 'Admin only' }, 403);

    // Check if already a member
    const existingUser = await ctx.env.DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email.toLowerCase().trim()).first();
    if (existingUser) {
      const alreadyMember = await ctx.env.DB.prepare(
        'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
      ).bind(familyId, existingUser.id).first();
      if (alreadyMember) return json({ error: 'Already a member' }, 409);
    }

    // Check for existing pending invite
    const existingInvite = await ctx.env.DB.prepare(
      'SELECT id FROM family_invites WHERE familyId = ? AND email = ? AND status = ?'
    ).bind(familyId, email.toLowerCase().trim(), 'pending').first();
    if (existingInvite) return json({ error: 'Already invited' }, 409);

    const now = new Date().toISOString();
    const invite = {
      id: crypto.randomUUID(),
      familyId,
      email: email.toLowerCase().trim(),
      invitedBy: ctx.user.id,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
    await ctx.env.DB.prepare(
      'INSERT INTO family_invites (id, familyId, email, invitedBy, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(invite.id, invite.familyId, invite.email, invite.invitedBy, invite.status, invite.createdAt, invite.updatedAt).run();

    return json({ data: invite }, 201);
  });

  // GET /api/families/invites/pending — check for pending invites for current user
  router.get('/api/families/invites/pending', async (ctx) => {
    const result = await ctx.env.DB.prepare(`
      SELECT fi.*, f.name as familyName, f.emoji as familyEmoji, u.name as inviterName
      FROM family_invites fi
      JOIN families f ON fi.familyId = f.id
      JOIN users u ON fi.invitedBy = u.id
      WHERE fi.email = ? AND fi.status = 'pending'
    `).bind(ctx.user.email).all();
    return json({ data: result.results || [] });
  });

  // POST /api/families/invites/:inviteId/accept — accept an invite
  router.post('/api/families/invites/:inviteId/accept', async (ctx) => {
    const invite = await ctx.env.DB.prepare(
      'SELECT * FROM family_invites WHERE id = ? AND status = ?'
    ).bind(ctx.params.inviteId, 'pending').first();
    if (!invite) return json({ error: 'Invite not found' }, 404);

    if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase())
      return json({ error: 'Invite not for you' }, 403);

    // Check if already a member (could have joined via invite code)
    const existing = await ctx.env.DB.prepare(
      'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(invite.familyId, ctx.user.id).first();
    if (existing) {
      await ctx.env.DB.prepare(
        'UPDATE family_invites SET status = ?, updatedAt = ? WHERE id = ?'
      ).bind('accepted', new Date().toISOString(), invite.id).run();
      return json({ data: existing });
    }

    const now = new Date().toISOString();
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
    };

    await ctx.env.DB.batch([
      ctx.env.DB.prepare(
        'INSERT INTO family_members (id, familyId, userId, role, isVirtual, displayName, joinedAt, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(member.id, member.familyId, member.userId, member.role, member.isVirtual, member.displayName, member.joinedAt, member.createdAt, member.updatedAt),
      ctx.env.DB.prepare(
        'UPDATE family_invites SET status = ?, updatedAt = ? WHERE id = ?'
      ).bind('accepted', now, invite.id)
    ]);

    return json({ data: member }, 201);
  });

  // POST /api/families/invites/:inviteId/decline — decline an invite
  router.post('/api/families/invites/:inviteId/decline', async (ctx) => {
    const invite = await ctx.env.DB.prepare(
      'SELECT * FROM family_invites WHERE id = ? AND status = ?'
    ).bind(ctx.params.inviteId, 'pending').first();
    if (!invite) return json({ error: 'Invite not found' }, 404);

    if (invite.email.toLowerCase() !== ctx.user.email.toLowerCase())
      return json({ error: 'Invite not for you' }, 403);

    await ctx.env.DB.prepare(
      'UPDATE family_invites SET status = ?, updatedAt = ? WHERE id = ?'
    ).bind('declined', new Date().toISOString(), invite.id).run();

    return json({ success: true });
  });

  // PUT /api/families/:familyId/settings — admin can update family name/emoji
  router.put('/api/families/:familyId/settings', async (ctx) => {
    const { familyId } = ctx.params;
    const membership = await ctx.env.DB.prepare(
      'SELECT role FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first();
    if (!membership || membership.role !== 'admin')
      return json({ error: 'Admin only' }, 403);

    const { name, emoji } = ctx.body;
    const updates = {};
    if (name) updates.name = name;
    if (emoji) updates.emoji = emoji;
    if (Object.keys(updates).length === 0) return json({ error: 'Nothing to update' }, 400);
    updates.updatedAt = new Date().toISOString();

    const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await ctx.env.DB.prepare(
      `UPDATE families SET ${sets} WHERE id = ?`
    ).bind(...Object.values(updates), familyId).run();

    return json({ success: true });
  });

  // POST /api/families/join — join a family by invite code (searches ALL families, not just user's)
  router.post('/api/families/join', async (ctx) => {
    const { inviteCode } = ctx.body;
    if (!inviteCode?.trim()) return json({ error: 'Invite code is required' }, 400);

    const code = inviteCode.toUpperCase().trim();

    // Look up family by invite code (no ownership filter — any user can join)
    const family = await ctx.env.DB.prepare(
      'SELECT * FROM families WHERE inviteCode = ?'
    ).bind(code).first();
    if (!family) return json({ error: 'Invalid invite code' }, 404);

    // Check if already a member
    const existing = await ctx.env.DB.prepare(
      'SELECT id FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(family.id, ctx.user.id).first();
    if (existing) return json({ error: 'You are already a member of this family' }, 409);

    // Add as member
    const now = new Date().toISOString();
    const member = {
      id: generateId(),
      familyId: family.id,
      userId: ctx.user.id,
      role: 'member',
      isVirtual: 0,
      displayName: ctx.body.displayName || ctx.user.name || 'Member',
      emoji: ctx.body.emoji || '😊',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const columns = Object.keys(member);
    const placeholders = columns.map(() => '?').join(', ');
    await ctx.env.DB.prepare(
      `INSERT INTO family_members (${columns.join(', ')}) VALUES (${placeholders})`
    ).bind(...columns.map((c) => member[c])).run();

    ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'join_family', { familyId: family.id }));
    return json({ data: { family: deserializeRow('families', family), member } }, 201);
  });

  // POST /api/sync/push — bulk push from client
  router.post('/api/sync/push', async (ctx) => {
    const { changes } = ctx.body; // [{ table, action, data }]
    if (!Array.isArray(changes)) return json({ error: 'Invalid payload' }, 400);

    const results = [];
    for (const change of changes) {
      try {
        const rawTable = change.table;
        const table = resolveTable(rawTable);
        const { action, data } = change;
        if (!ALLOWED_TABLES.includes(table)) {
          results.push({ id: data?.id, status: 'error', message: `Unknown table: ${rawTable}` });
          continue;
        }

        const now = new Date().toISOString();
        const userCol = getUserColumn(table);
        if (action === 'create' || action === 'update') {
          const raw = serializeRow(table, { ...data, [userCol]: ctx.user.id, updatedAt: now });
          if (action === 'create') raw.createdAt = raw.createdAt || now;
          // Strip client-only fields that don't exist in D1 schema
          const row = filterColumns(table, raw);

          // Validate visibility for transactions in sync push
          if (table === 'transactions' && row.visibility && !['family', 'private'].includes(row.visibility)) {
            results.push({ id: data?.id, status: 'error', message: 'Invalid visibility value' });
            continue;
          }
          // Server generates invite code for families — strip client-sent codes
          if (table === 'families' && action === 'create') {
            row.inviteCode = await generateUniqueInviteCode(ctx.env.DB);
          }

          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(', ');
          const updates = columns.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ');

          // SECURITY: Only allow updating records owned by the current user
          // Without the WHERE clause, a user could steal another user's record by guessing its ID
          await ctx.env.DB.prepare(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates} WHERE ${table}.${userCol} = ?`
          ).bind(...columns.map(c => row[c]), ctx.user.id).run();
        } else if (action === 'delete') {
          if (table === 'transactions') {
            await ctx.env.DB.prepare(`UPDATE transactions SET deletedAt = ? WHERE id = ? AND ${userCol} = ?`)
              .bind(now, data.id, ctx.user.id).run();
          } else {
            await ctx.env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND ${userCol} = ?`)
              .bind(data.id, ctx.user.id).run();
          }
        }

        results.push({ id: data.id, status: 'ok' });
      } catch (err) {
        results.push({ id: change.data?.id, status: 'error', message: err.message });
      }
    }

    ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'sync_push', { count: changes.length }));
    return json({ results });
  });

  // GET /api/sync/pull — pull all data since timestamp
  router.get('/api/sync/pull', async (ctx) => {
    const since = ctx.query.since || '1970-01-01T00:00:00.000Z';
    const userId = ctx.user.id;

    const limit = Math.min(parseInt(ctx.query.limit) || 10000, 10000);
    const offset = parseInt(ctx.query.offset) || 0;

    // Build all queries upfront, then execute in a single DB.batch() round trip
    const stmts = [];
    const tableOrder = [];
    for (const table of ALLOWED_TABLES) {
      tableOrder.push(table);
      if (table === 'families') {
        stmts.push(ctx.env.DB.prepare(
          `SELECT DISTINCT f.* FROM families f
           LEFT JOIN family_members fm ON f.id = fm.familyId
           WHERE (f.createdBy = ? OR fm.userId = ?) AND f.updatedAt > ?
           ORDER BY f.updatedAt ASC LIMIT ? OFFSET ?`
        ).bind(userId, userId, since, limit, offset));
      } else if (table === 'family_members') {
        stmts.push(ctx.env.DB.prepare(
          `SELECT fm.* FROM family_members fm
           WHERE fm.familyId IN (SELECT familyId FROM family_members WHERE userId = ?)
           AND fm.updatedAt > ?
           ORDER BY fm.updatedAt ASC LIMIT ? OFFSET ?`
        ).bind(userId, since, limit, offset));
      } else if (table === 'goals') {
        // Goals: return user's own + family-scoped goals from their families
        stmts.push(ctx.env.DB.prepare(
          `SELECT * FROM goals WHERE (userId = ? OR (familyId IN (SELECT familyId FROM family_members WHERE userId = ?))) AND updatedAt > ? ORDER BY updatedAt ASC LIMIT ? OFFSET ?`
        ).bind(userId, userId, since, limit, offset));
      } else if (table === 'family_invites') {
        // Family invites: pull pending invites for user's email
        stmts.push(ctx.env.DB.prepare(
          `SELECT * FROM family_invites WHERE email = (SELECT email FROM users WHERE id = ?) AND updatedAt > ? ORDER BY updatedAt ASC LIMIT ? OFFSET ?`
        ).bind(userId, since, limit, offset));
      } else {
        const userCol = getUserColumn(table);
        const deletedFilter = table === 'transactions' ? ' AND (deletedAt IS NULL OR deletedAt = "")' : '';
        stmts.push(ctx.env.DB.prepare(
          `SELECT * FROM ${table} WHERE ${userCol} = ? AND updatedAt > ?${deletedFilter} ORDER BY updatedAt ASC LIMIT ? OFFSET ?`
        ).bind(userId, since, limit, offset));
      }
    }

    const batchResults = await ctx.env.DB.batch(stmts);
    const tables = {};
    for (let i = 0; i < tableOrder.length; i++) {
      tables[tableOrder[i]] = (batchResults[i].results || []).map(r => deserializeRow(tableOrder[i], r));
    }

    return json({ data: tables, syncedAt: new Date().toISOString() });
  });

  // GET /api/data/export — export all user data
  router.get('/api/data/export', async (ctx) => {
    const userId = ctx.user.id;
    const data = {};
    for (const table of ALLOWED_TABLES) {
      const userCol = getUserColumn(table);
      // Exclude soft-deleted transactions from exports
      const deletedFilter = table === 'transactions' ? ' AND (deletedAt IS NULL OR deletedAt = "")' : '';
      const result = await ctx.env.DB.prepare(`SELECT * FROM ${table} WHERE ${userCol} = ?${deletedFilter}`).bind(userId).all();
      data[table] = (result.results || []).map(r => deserializeRow(table, r));
    }

    // Settings
    const settingsResult = await ctx.env.DB.prepare(`SELECT key, value FROM settings WHERE userId = ?`).bind(userId).all();
    data.settings = {};
    for (const row of settingsResult.results || []) {
      try { data.settings[row.key] = JSON.parse(row.value); } catch { data.settings[row.key] = row.value; }
    }

    return json({ data, exportedAt: new Date().toISOString() });
  });

  // Settings
  router.get('/api/settings', async (ctx) => {
    const result = await ctx.env.DB.prepare(`SELECT key, value FROM settings WHERE userId = ?`).bind(ctx.user.id).all();
    const settings = {};
    for (const row of result.results || []) {
      try { settings[row.key] = JSON.parse(row.value); } catch { settings[row.key] = row.value; }
    }
    return json({ data: settings });
  });

  // Blacklist admin-only settings keys that users cannot self-assign
  const ADMIN_ONLY_KEYS = new Set(['aiProxyAllowed', 'isAdmin', 'adminLevel', 'adminAccess']);

  router.put('/api/settings', async (ctx) => {
    const entries = Object.entries(ctx.body || {});
    for (const [key, value] of entries) {
      // Prevent privilege escalation via settings
      if (ADMIN_ONLY_KEYS.has(key)) continue;
      const val = typeof value === 'string' ? value : JSON.stringify(value);
      await ctx.env.DB.prepare(
        `INSERT INTO settings (userId, key, value) VALUES (?, ?, ?) ON CONFLICT(userId, key) DO UPDATE SET value = ?`
      ).bind(ctx.user.id, key, val, val).run();
    }
    return json({ success: true });
  });

  // ─── GENERIC CRUD routes (after specific routes) ───

  // GET /api/:table — list all for user
  router.get('/api/:table', async (ctx) => {
    const { table } = ctx.params;
    if (!ALLOWED_TABLES.includes(table)) return json({ error: 'Invalid table' }, 400);

    const userId = ctx.user.id;
    const userCol = getUserColumn(table);
    let query = `SELECT * FROM ${table} WHERE ${userCol} = ?`;
    const params = [userId];

    // Soft delete filter for transactions (match sync pull behavior: exclude both NULL and empty string)
    if (table === 'transactions') {
      query += ' AND (deletedAt IS NULL OR deletedAt = "")';
    }

    // Date range filter
    if (ctx.query.startDate && ctx.query.endDate) {
      query += ' AND date >= ? AND date <= ?';
      params.push(ctx.query.startDate, ctx.query.endDate);
    }

    // Category filter
    if (ctx.query.category) {
      query += ' AND category = ?';
      params.push(ctx.query.category);
    }

    // Sort
    query += ' ORDER BY createdAt DESC';

    // Pagination
    const limit = Math.min(parseInt(ctx.query.limit) || 10000, 10000);
    const offset = parseInt(ctx.query.offset) || 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await ctx.env.DB.prepare(query).bind(...params).all();
    const rows = (result.results || []).map((r) => deserializeRow(table, r));

    // Get total count for pagination (without LIMIT/OFFSET)
    let countQuery = `SELECT COUNT(*) as cnt FROM ${table} WHERE ${userCol} = ?`;
    const countParams = [userId];
    if (table === 'transactions') countQuery += ' AND (deletedAt IS NULL OR deletedAt = "")';
    if (ctx.query.startDate && ctx.query.endDate) {
      countQuery += ' AND date >= ? AND date <= ?';
      countParams.push(ctx.query.startDate, ctx.query.endDate);
    }
    if (ctx.query.category) {
      countQuery += ' AND category = ?';
      countParams.push(ctx.query.category);
    }
    const countResult = await ctx.env.DB.prepare(countQuery).bind(...countParams).first();
    const total = countResult?.cnt || rows.length;

    return json({ data: rows, meta: { total, limit, offset } });
  });

  // GET /api/:table/:id — get single record
  router.get('/api/:table/:id', async (ctx) => {
    const { table, id } = ctx.params;
    if (!ALLOWED_TABLES.includes(table)) return json({ error: 'Invalid table' }, 400);

    const userCol = getUserColumn(table);
    const row = await ctx.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND ${userCol} = ?`)
      .bind(id, ctx.user.id).first();

    if (!row) return json({ error: 'Not found' }, 404);
    return json({ data: deserializeRow(table, row) });
  });

  // POST /api/:table — create
  router.post('/api/:table', async (ctx) => {
    const { table } = ctx.params;
    if (!ALLOWED_TABLES.includes(table)) return json({ error: 'Invalid table' }, 400);

    const now = new Date().toISOString();
    const userCol = getUserColumn(table);
    const raw = serializeRow(table, {
      ...ctx.body,
      id: ctx.body.id || generateId(),
      [userCol]: ctx.user.id,
      createdAt: now,
      updatedAt: now,
    });
    // Strip unknown client-only fields
    const data = filterColumns(table, raw);

    // Server-side invite code generation for families
    if (table === 'families') {
      data.inviteCode = await generateUniqueInviteCode(ctx.env.DB);
    }

    // Validate visibility enum for transactions
    if (table === 'transactions' && data.visibility && !['family', 'private'].includes(data.visibility)) {
      return json({ error: 'visibility must be "family" or "private"' }, 400);
    }

    const columns = Object.keys(data);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map((c) => data[c]);

    await ctx.env.DB.prepare(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`
    ).bind(...values).run();

    // Log sync
    await logSync(ctx.env.DB, ctx.user.id, table, data.id, 'create');
    ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'create_record', { table }));

    return json({ data: deserializeRow(table, data) }, 201);
  });

  // PUT /api/:table/:id — update
  router.put('/api/:table/:id', async (ctx) => {
    const { table, id } = ctx.params;
    if (!ALLOWED_TABLES.includes(table)) return json({ error: 'Invalid table' }, 400);

    // Check ownership
    const userCol = getUserColumn(table);
    const existing = await ctx.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND ${userCol} = ?`)
      .bind(id, ctx.user.id).first();
    if (!existing) return json({ error: 'Not found' }, 404);

    const raw = serializeRow(table, { ...ctx.body, updatedAt: new Date().toISOString() });
    delete raw.id;
    delete raw.userId;
    delete raw.createdBy;
    delete raw.createdAt;
    // Strip unknown client-only fields
    const data = filterColumns(table, raw);

    // Validate visibility enum for transactions
    if (table === 'transactions' && data.visibility && !['family', 'private'].includes(data.visibility)) {
      return json({ error: 'visibility must be "family" or "private"' }, 400);
    }

    const sets = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(data), id, ctx.user.id];

    await ctx.env.DB.prepare(
      `UPDATE ${table} SET ${sets} WHERE id = ? AND ${userCol} = ?`
    ).bind(...values).run();

    await logSync(ctx.env.DB, ctx.user.id, table, id, 'update');
    ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'update_record', { table }));

    return json({ data: { id, ...data } });
  });

  // DELETE /api/:table/:id — delete (soft for transactions, hard for others)
  router.delete('/api/:table/:id', async (ctx) => {
    const { table, id } = ctx.params;
    if (!ALLOWED_TABLES.includes(table)) return json({ error: 'Invalid table' }, 400);

    const userCol = getUserColumn(table);

    // Admin leave protection: prevent last admin from leaving family
    if (table === 'family_members') {
      const member = await ctx.env.DB.prepare(
        'SELECT role, familyId FROM family_members WHERE id = ? AND userId = ?'
      ).bind(id, ctx.user.id).first();
      if (member && member.role === 'admin') {
        const adminCount = await ctx.env.DB.prepare(
          'SELECT COUNT(*) as cnt FROM family_members WHERE familyId = ? AND role = ?'
        ).bind(member.familyId, 'admin').first();
        if (adminCount.cnt <= 1) {
          return json({ error: 'Transfer admin role before leaving. You are the only admin.' }, 400);
        }
      }
    }

    if (table === 'transactions') {
      // Soft delete
      await ctx.env.DB.prepare(
        `UPDATE transactions SET deletedAt = ? WHERE id = ? AND ${userCol} = ?`
      ).bind(new Date().toISOString(), id, ctx.user.id).run();
    } else {
      await ctx.env.DB.prepare(
        `DELETE FROM ${table} WHERE id = ? AND ${userCol} = ?`
      ).bind(id, ctx.user.id).run();
    }

    await logSync(ctx.env.DB, ctx.user.id, table, id, 'delete');
    ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'delete_record', { table }));

    return json({ success: true });
  });
}

async function logSync(db, userId, tableName, recordId, action) {
  await db.prepare(
    `INSERT INTO sync_log (id, userId, tableName, recordId, action, timestamp) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(crypto.randomUUID(), userId, tableName, recordId, action, new Date().toISOString()).run();
}
