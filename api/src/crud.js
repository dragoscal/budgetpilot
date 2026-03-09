// Generic CRUD handlers for D1 database tables
import { json } from './router.js';
import { generateId } from './auth.js';
import { logActivity } from './index.js';

const ALLOWED_TABLES = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'people', 'debts', 'debt_payments', 'wishlist', 'loans', 'loan_payments'];

// Map client-side store names to D1 table names (for sync compatibility)
const TABLE_ALIASES = { debtPayments: 'debt_payments', loanPayments: 'loan_payments' };

function resolveTable(name) {
  return TABLE_ALIASES[name] || name;
}

// JSON columns that need to be serialized/deserialized
const JSON_COLUMNS = { transactions: ['tags', 'items'], };

// Valid D1 columns per table — client may send extra fields that don't exist in the schema
const TABLE_COLUMNS = {
  transactions: new Set(['id','userId','type','merchant','amount','currency','category','subcategory','date','description','tags','source','items','splitFrom','createdAt','updatedAt','deletedAt']),
  budgets: new Set(['id','userId','category','amount','currency','month','rollover','createdAt','updatedAt']),
  goals: new Set(['id','userId','name','type','targetAmount','currentAmount','currency','targetDate','interestRate','color','createdAt','updatedAt']),
  accounts: new Set(['id','userId','name','type','balance','currency','color','isLiability','createdAt','updatedAt']),
  recurring: new Set(['id','userId','name','merchant','amount','currency','category','frequency','billingDay','endDate','active','autoDetected','createdAt','updatedAt']),
  people: new Set(['id','userId','name','emoji','phone','notes','createdAt','updatedAt']),
  debts: new Set(['id','userId','personId','type','amount','remaining','currency','description','date','settled','createdAt','updatedAt']),
  debt_payments: new Set(['id','userId','debtId','amount','date','note','createdAt','updatedAt']),
  wishlist: new Set(['id','userId','name','estimatedPrice','currency','category','priority','url','notes','purchased','purchasedDate','createdAt','updatedAt']),
  loans: new Set(['id','userId','name','type','lender','principalAmount','remainingBalance','interestRate','interestType','monthlyPayment','currency','startDate','endDate','paymentDay','status','notes','createdAt','updatedAt']),
  loan_payments: new Set(['id','userId','loanId','amount','principalPortion','interestPortion','date','note','createdAt','updatedAt']),
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
        if (action === 'create' || action === 'update') {
          const raw = serializeRow(table, { ...data, userId: ctx.user.id, updatedAt: now });
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
            await ctx.env.DB.prepare(`UPDATE transactions SET deletedAt = ? WHERE id = ? AND userId = ?`)
              .bind(now, data.id, ctx.user.id).run();
          } else {
            await ctx.env.DB.prepare(`DELETE FROM ${table} WHERE id = ? AND userId = ?`)
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

    const tables = {};
    for (const table of ALLOWED_TABLES) {
      const result = await ctx.env.DB.prepare(
        `SELECT * FROM ${table} WHERE userId = ? AND updatedAt > ?`
      ).bind(userId, since).all();
      tables[table] = (result.results || []).map(r => deserializeRow(table, r));
    }

    return json({ data: tables, syncedAt: new Date().toISOString() });
  });

  // GET /api/data/export — export all user data
  router.get('/api/data/export', async (ctx) => {
    const userId = ctx.user.id;
    const data = {};
    for (const table of ALLOWED_TABLES) {
      const result = await ctx.env.DB.prepare(`SELECT * FROM ${table} WHERE userId = ?`).bind(userId).all();
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
    let query = `SELECT * FROM ${table} WHERE userId = ?`;
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
    const limit = Math.min(parseInt(ctx.query.limit) || 100, 500);
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

    const row = await ctx.env.DB.prepare(`SELECT * FROM ${table} WHERE id = ? AND userId = ?`)
      .bind(id, ctx.user.id).first();

    if (!row) return json({ error: 'Not found' }, 404);
    return json({ data: deserializeRow(table, row) });
  });

  // POST /api/:table — create
  router.post('/api/:table', async (ctx) => {
    const { table } = ctx.params;
    if (!ALLOWED_TABLES.includes(table)) return json({ error: 'Invalid table' }, 400);

    const now = new Date().toISOString();
    const raw = serializeRow(table, {
      ...ctx.body,
      id: ctx.body.id || generateId(),
      userId: ctx.user.id,
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
    const existing = await ctx.env.DB.prepare(`SELECT id FROM ${table} WHERE id = ? AND userId = ?`)
      .bind(id, ctx.user.id).first();
    if (!existing) return json({ error: 'Not found' }, 404);

    const raw = serializeRow(table, { ...ctx.body, updatedAt: new Date().toISOString() });
    delete raw.id;
    delete raw.userId;
    delete raw.createdAt;
    // Strip unknown client-only fields
    const data = filterColumns(table, raw);

    const sets = Object.keys(data).map((k) => `${k} = ?`).join(', ');
    const values = [...Object.values(data), id, ctx.user.id];

    await ctx.env.DB.prepare(
      `UPDATE ${table} SET ${sets} WHERE id = ? AND userId = ?`
    ).bind(...values).run();

    await logSync(ctx.env.DB, ctx.user.id, table, id, 'update');
    ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'update_record', { table }));

    return json({ data: { id, ...data } });
  });

  // DELETE /api/:table/:id — delete (soft for transactions, hard for others)
  router.delete('/api/:table/:id', async (ctx) => {
    const { table, id } = ctx.params;
    if (!ALLOWED_TABLES.includes(table)) return json({ error: 'Invalid table' }, 400);

    if (table === 'transactions') {
      // Soft delete
      await ctx.env.DB.prepare(
        `UPDATE transactions SET deletedAt = ? WHERE id = ? AND userId = ?`
      ).bind(new Date().toISOString(), id, ctx.user.id).run();
    } else {
      await ctx.env.DB.prepare(
        `DELETE FROM ${table} WHERE id = ? AND userId = ?`
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
