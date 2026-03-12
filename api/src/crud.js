// Generic CRUD handlers for D1 database tables
import { json } from './router.js';
import { generateId } from './auth.js';
import { logActivity } from './index.js';

const ALLOWED_TABLES = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'people', 'debts', 'debt_payments', 'wishlist', 'loans', 'loan_payments', 'families', 'family_members', 'shared_expenses', 'challenges', 'receipts'];

// Map client-side store names to D1 table names (for sync compatibility)
const TABLE_ALIASES = { debtPayments: 'debt_payments', loanPayments: 'loan_payments', familyMembers: 'family_members', sharedExpenses: 'shared_expenses' };

function resolveTable(name) {
  return TABLE_ALIASES[name] || name;
}

// Map tables to their user-ownership column (defaults to 'userId')
const USER_COLUMN = { families: 'createdBy', shared_expenses: 'paidByUserId' };

function getUserColumn(table) {
  return USER_COLUMN[table] || 'userId';
}

// JSON columns that need to be serialized/deserialized
const JSON_COLUMNS = { transactions: ['tags', 'items', 'beneficiaries'], };

// Valid D1 columns per table — client may send extra fields that don't exist in the schema
const TABLE_COLUMNS = {
  transactions: new Set(['id','userId','type','merchant','amount','currency','category','subcategory','date','description','tags','source','items','splitFrom','importBatch','originalText','scope','paidBy','splitType','beneficiaries','createdAt','updatedAt','deletedAt']),
  budgets: new Set(['id','userId','category','amount','currency','month','rollover','createdAt','updatedAt']),
  goals: new Set(['id','userId','name','type','targetAmount','currentAmount','currency','targetDate','interestRate','color','createdAt','updatedAt']),
  accounts: new Set(['id','userId','name','type','balance','currency','color','isLiability','createdAt','updatedAt']),
  recurring: new Set(['id','userId','name','merchant','amount','currency','category','frequency','billingDay','endDate','active','autoDetected','createdAt','updatedAt']),
  people: new Set(['id','userId','name','emoji','phone','notes','createdAt','updatedAt']),
  debts: new Set(['id','userId','personId','type','amount','remaining','currency','description','date','settled','createdAt','updatedAt']),
  debt_payments: new Set(['id','userId','debtId','amount','date','note','createdAt','updatedAt']),
  wishlist: new Set(['id','userId','name','estimatedPrice','currency','category','priority','url','notes','purchased','purchasedDate','createdAt','updatedAt']),
  loans: new Set(['id','userId','name','type','lender','principalAmount','remainingBalance','interestRate','interestType','interestPeriod','monthlyPayment','currency','startDate','endDate','paymentDay','status','notes','createdAt','updatedAt']),
  loan_payments: new Set(['id','userId','loanId','amount','principalPortion','interestPortion','date','note','createdAt','updatedAt']),
  families: new Set(['id','name','createdBy','emoji','createdAt','updatedAt']),
  family_members: new Set(['id','familyId','userId','role','isVirtual','displayName','emoji','joinedAt','createdAt','updatedAt']),
  shared_expenses: new Set(['id','familyId','paidByUserId','amount','currency','description','category','date','splitMethod','settled','createdAt','updatedAt']),
  challenges: new Set(['id','userId','name','type','targetAmount','category','startDate','endDate','status','progress','createdAt','updatedAt']),
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
  const out = { ...row };
  for (const col of jsonCols) {
    if (out[col] && typeof out[col] === 'string') {
      try { out[col] = JSON.parse(out[col]); } catch (e) { /* keep as string */ }
    }
  }
  return out;
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

    // Return ALL members of this family (real + virtual)
    const result = await ctx.env.DB.prepare(
      'SELECT * FROM family_members WHERE familyId = ? ORDER BY isVirtual ASC, joinedAt ASC'
    ).bind(familyId).all();

    return json({ data: result.results || [] });
  });

  // POST /api/families/:familyId/members — add a virtual member to a family
  router.post('/api/families/:familyId/members', async (ctx) => {
    const { familyId } = ctx.params;

    // Verify requesting user is admin of this family
    const myMembership = await ctx.env.DB.prepare(
      'SELECT id, role FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first();
    if (!myMembership) return json({ error: 'Not a member of this family' }, 403);
    if (myMembership.role !== 'admin') return json({ error: 'Only admins can add members' }, 403);

    const { displayName, emoji } = ctx.body;
    if (!displayName?.trim()) return json({ error: 'Display name is required' }, 400);

    const now = new Date().toISOString();
    const id = generateId();

    const member = {
      id,
      familyId,
      userId: ctx.user.id, // Virtual member owned by creator for API filtering
      role: 'member',
      isVirtual: 1,
      displayName: displayName.trim(),
      emoji: emoji || '👤',
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const columns = Object.keys(member);
    const placeholders = columns.map(() => '?').join(', ');
    await ctx.env.DB.prepare(
      `INSERT INTO family_members (${columns.join(', ')}) VALUES (${placeholders})`
    ).bind(...columns.map((c) => member[c])).run();

    return json({ data: member }, 201);
  });

  // DELETE /api/families/:familyId/members/:memberId — remove a virtual member
  router.delete('/api/families/:familyId/members/:memberId', async (ctx) => {
    const { familyId, memberId } = ctx.params;

    // Verify requesting user is admin
    const myMembership = await ctx.env.DB.prepare(
      'SELECT id, role FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first();
    if (!myMembership) return json({ error: 'Not a member of this family' }, 403);
    if (myMembership.role !== 'admin') return json({ error: 'Only admins can remove members' }, 403);

    // Only allow removing virtual members through this endpoint
    const target = await ctx.env.DB.prepare(
      'SELECT id, isVirtual FROM family_members WHERE id = ? AND familyId = ?'
    ).bind(memberId, familyId).first();
    if (!target) return json({ error: 'Member not found' }, 404);
    if (!target.isVirtual) return json({ error: 'Cannot remove real members through this endpoint' }, 400);

    await ctx.env.DB.prepare('DELETE FROM family_members WHERE id = ?').bind(memberId).run();

    return json({ success: true });
  });

  // PUT /api/families/:familyId/members/:memberId/link — link virtual member to real account
  router.put('/api/families/:familyId/members/:memberId/link', async (ctx) => {
    const { familyId, memberId } = ctx.params;

    // Verify requesting user is admin
    const myMembership = await ctx.env.DB.prepare(
      'SELECT id, role FROM family_members WHERE familyId = ? AND userId = ?'
    ).bind(familyId, ctx.user.id).first();
    if (!myMembership) return json({ error: 'Not a member of this family' }, 403);
    if (myMembership.role !== 'admin') return json({ error: 'Only admins can link members' }, 403);

    // Get the virtual member
    const target = await ctx.env.DB.prepare(
      'SELECT * FROM family_members WHERE id = ? AND familyId = ?'
    ).bind(memberId, familyId).first();
    if (!target) return json({ error: 'Member not found' }, 404);
    if (!target.isVirtual) return json({ error: 'Member is already a real account' }, 400);

    // Find the real member to link to
    const { realMemberId } = ctx.body;
    if (!realMemberId) return json({ error: 'realMemberId is required' }, 400);

    const realMember = await ctx.env.DB.prepare(
      'SELECT * FROM family_members WHERE id = ? AND familyId = ?'
    ).bind(realMemberId, familyId).first();
    if (!realMember) return json({ error: 'Target member not found' }, 404);
    if (realMember.isVirtual) return json({ error: 'Cannot link to another virtual member' }, 400);

    // Transfer: copy displayName/emoji from virtual to real if real doesn't have them
    const now = new Date().toISOString();
    const updates = { updatedAt: now };
    if (!realMember.displayName && target.displayName) {
      updates.displayName = target.displayName;
    }
    if ((!realMember.emoji || realMember.emoji === '👤') && target.emoji) {
      updates.emoji = target.emoji;
    }

    if (Object.keys(updates).length > 1) {
      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      await ctx.env.DB.prepare(
        `UPDATE family_members SET ${sets} WHERE id = ?`
      ).bind(...Object.values(updates), realMemberId).run();
    }

    // Delete the virtual member (it's been replaced by the real one)
    await ctx.env.DB.prepare('DELETE FROM family_members WHERE id = ?').bind(memberId).run();

    return json({ success: true, linkedTo: realMemberId });
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

          const columns = Object.keys(row);
          const placeholders = columns.map(() => '?').join(', ');
          const updates = columns.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ');

          await ctx.env.DB.prepare(
            `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}`
          ).bind(...columns.map(c => row[c])).run();
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

    const limit = Math.min(parseInt(ctx.query.limit) || 1000, 5000);
    const offset = parseInt(ctx.query.offset) || 0;

    const tables = {};
    for (const table of ALLOWED_TABLES) {
      const userCol = getUserColumn(table);
      // Exclude soft-deleted transactions (they have deletedAt set)
      const deletedFilter = table === 'transactions' ? ' AND (deletedAt IS NULL OR deletedAt = "")' : '';
      const result = await ctx.env.DB.prepare(
        `SELECT * FROM ${table} WHERE ${userCol} = ? AND updatedAt > ?${deletedFilter} ORDER BY updatedAt ASC LIMIT ? OFFSET ?`
      ).bind(userId, since, limit, offset).all();
      tables[table] = (result.results || []).map(r => deserializeRow(table, r));
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

  router.put('/api/settings', async (ctx) => {
    const entries = Object.entries(ctx.body || {});
    for (const [key, value] of entries) {
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

    // Soft delete filter for transactions
    if (table === 'transactions') {
      query += ' AND deletedAt IS NULL';
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
    const limit = Math.min(parseInt(ctx.query.limit) || 500, 5000);
    const offset = parseInt(ctx.query.offset) || 0;
    query += ' LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await ctx.env.DB.prepare(query).bind(...params).all();
    const rows = (result.results || []).map((r) => deserializeRow(table, r));

    return json({ data: rows, meta: { total: rows.length, limit, offset } });
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
    delete raw.paidByUserId;
    delete raw.createdAt;
    // Strip unknown client-only fields
    const data = filterColumns(table, raw);

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
