// BudgetPilot Admin Routes — privacy-safe, aggregate data only
import { json } from './router.js';
import { hashPassword, generateSalt } from './auth.js';
import { logActivity } from './index.js';

function requireAdmin(ctx) {
  if (!ctx.user || ctx.user.role !== 'admin') {
    return json({ error: 'Admin access required' }, 403);
  }
  return null;
}

export function registerAdminRoutes(router) {

  // ─── List users with aggregate stats (NO personal financial data) ──
  router.get('/api/admin/users', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const users = await ctx.env.DB.prepare(`
      SELECT
        u.id, u.email, u.name, u.role, u.suspended, u.defaultCurrency, u.createdAt,
        (SELECT COUNT(*) FROM transactions WHERE userId = u.id AND deletedAt IS NULL) as transactionCount,
        (SELECT COUNT(*) FROM budgets WHERE userId = u.id) as budgetCount,
        (SELECT COUNT(*) FROM goals WHERE userId = u.id) as goalCount,
        (SELECT COUNT(*) FROM recurring WHERE userId = u.id) as recurringCount,
        (SELECT COUNT(*) FROM people WHERE userId = u.id) as peopleCount,
        (SELECT COUNT(*) FROM debts WHERE userId = u.id) as debtCount,
        (SELECT COUNT(*) FROM wishlist WHERE userId = u.id) as wishlistCount,
        (SELECT MAX(timestamp) FROM activity_log WHERE userId = u.id) as lastActive,
        (SELECT value FROM settings WHERE userId = u.id AND key = 'aiProxyAllowed') as aiProxyAllowed
      FROM users u
      ORDER BY u.createdAt DESC
    `).all();

    // Normalize aiProxyAllowed to boolean
    const normalized = (users.results || []).map(u => ({
      ...u,
      aiProxyAllowed: u.aiProxyAllowed === 'true',
    }));

    return json({ data: normalized });
  });

  // ─── Reset user password ───────────────────────────────
  router.put('/api/admin/users/:id/reset-password', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { id } = ctx.params;
    const { newPassword } = ctx.body;

    if (!newPassword || newPassword.length < 8) {
      return json({ error: 'Password must be at least 8 characters' }, 400);
    }

    const user = await ctx.env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(id).first();
    if (!user) return json({ error: 'User not found' }, 404);

    const salt = generateSalt();
    const passwordHash = await hashPassword(newPassword, salt);

    await ctx.env.DB.prepare(
      'UPDATE users SET passwordHash = ?, salt = ?, updatedAt = ? WHERE id = ?'
    ).bind(passwordHash, salt, new Date().toISOString(), id).run();

    await logActivity(ctx.env.DB, ctx.user.id, 'admin_reset_password', { targetUserId: id });

    return json({ success: true });
  });

  // ─── Suspend / activate user ───────────────────────────
  router.put('/api/admin/users/:id/toggle', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { id } = ctx.params;

    if (id === ctx.user.id) {
      return json({ error: 'Cannot suspend yourself' }, 400);
    }

    const user = await ctx.env.DB.prepare('SELECT id, suspended FROM users WHERE id = ?').bind(id).first();
    if (!user) return json({ error: 'User not found' }, 404);

    const newStatus = user.suspended ? 0 : 1;
    await ctx.env.DB.prepare(
      'UPDATE users SET suspended = ?, updatedAt = ? WHERE id = ?'
    ).bind(newStatus, new Date().toISOString(), id).run();

    await logActivity(ctx.env.DB, ctx.user.id, newStatus ? 'admin_suspend_user' : 'admin_activate_user', { targetUserId: id });

    return json({ success: true, suspended: !!newStatus });
  });

  // ─── Toggle AI proxy access for a user ─────────────────
  router.put('/api/admin/users/:id/ai-access', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { id } = ctx.params;
    const { allowed } = ctx.body;

    const user = await ctx.env.DB.prepare('SELECT id, name FROM users WHERE id = ?').bind(id).first();
    if (!user) return json({ error: 'User not found' }, 404);

    const val = allowed ? 'true' : 'false';
    await ctx.env.DB.prepare(
      `INSERT INTO settings (userId, key, value) VALUES (?, 'aiProxyAllowed', ?) ON CONFLICT(userId, key) DO UPDATE SET value = ?`
    ).bind(id, val, val).run();

    await logActivity(ctx.env.DB, ctx.user.id, 'admin_toggle_ai_access', { targetUserId: id, allowed: !!allowed });

    return json({ success: true, allowed: !!allowed });
  });

  // ─── Delete user and all their data ────────────────────
  router.delete('/api/admin/users/:id', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { id } = ctx.params;

    if (id === ctx.user.id) {
      return json({ error: 'Cannot delete yourself' }, 400);
    }

    const user = await ctx.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
    if (!user) return json({ error: 'User not found' }, 404);

    const tables = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'people', 'debts', 'wishlist', 'settings', 'sync_log', 'activity_log'];
    for (const table of tables) {
      await ctx.env.DB.prepare(`DELETE FROM ${table} WHERE userId = ?`).bind(id).run();
    }
    await ctx.env.DB.prepare(`DELETE FROM debt_payments WHERE debtId NOT IN (SELECT id FROM debts)`).run();
    await ctx.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(id).run();

    await logActivity(ctx.env.DB, ctx.user.id, 'admin_delete_user', { targetUserId: id });

    return json({ success: true });
  });

  // ─── Global stats (aggregate only) ─────────────────────
  router.get('/api/admin/stats', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

    const [totalUsers, activeToday, activeWeek, activeMonth, totalTransactions, totalApiCalls, avgResponseTime, errorCount, recentSignups] = await Promise.all([
      ctx.env.DB.prepare('SELECT COUNT(*) as count FROM users').first(),
      ctx.env.DB.prepare('SELECT COUNT(DISTINCT userId) as count FROM activity_log WHERE timestamp >= ?').bind(todayStr + 'T00:00:00.000Z').first(),
      ctx.env.DB.prepare('SELECT COUNT(DISTINCT userId) as count FROM activity_log WHERE timestamp >= ?').bind(weekAgo).first(),
      ctx.env.DB.prepare('SELECT COUNT(DISTINCT userId) as count FROM activity_log WHERE timestamp >= ?').bind(monthAgo).first(),
      ctx.env.DB.prepare('SELECT COUNT(*) as count FROM transactions WHERE deletedAt IS NULL').first(),
      ctx.env.DB.prepare('SELECT COUNT(*) as count FROM api_logs').first(),
      ctx.env.DB.prepare('SELECT AVG(responseTime) as avg FROM api_logs').first(),
      ctx.env.DB.prepare('SELECT COUNT(*) as count FROM api_logs WHERE status >= 400').first(),
      ctx.env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE createdAt >= ?').bind(weekAgo).first(),
    ]);

    const apiCallsByDay = await ctx.env.DB.prepare(`
      SELECT DATE(timestamp) as date, COUNT(*) as count, AVG(responseTime) as avgTime
      FROM api_logs WHERE timestamp >= ?
      GROUP BY DATE(timestamp) ORDER BY date ASC
    `).bind(weekAgo).all();

    const featureUsage = await ctx.env.DB.prepare(`
      SELECT action, COUNT(*) as count
      FROM activity_log WHERE timestamp >= ?
      GROUP BY action ORDER BY count DESC
    `).bind(monthAgo).all();

    return json({
      data: {
        totalUsers: totalUsers?.count || 0,
        activeToday: activeToday?.count || 0,
        activeWeek: activeWeek?.count || 0,
        activeMonth: activeMonth?.count || 0,
        totalTransactions: totalTransactions?.count || 0,
        totalApiCalls: totalApiCalls?.count || 0,
        avgResponseTime: Math.round(avgResponseTime?.avg || 0),
        errorCount: errorCount?.count || 0,
        recentSignups: recentSignups?.count || 0,
        apiCallsByDay: apiCallsByDay?.results || [],
        featureUsage: featureUsage?.results || [],
      }
    });
  });

  // ─── Activity feed (action types only, no personal data) ──
  router.get('/api/admin/activity', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { userId, action, limit: limitStr, offset: offsetStr } = ctx.query;
    const limit = Math.min(parseInt(limitStr) || 50, 200);
    const offset = parseInt(offsetStr) || 0;

    let query = `
      SELECT a.id, a.userId, a.action, a.metadata, a.timestamp, u.name as userName, u.email as userEmail
      FROM activity_log a
      LEFT JOIN users u ON a.userId = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userId) { query += ' AND a.userId = ?'; params.push(userId); }
    if (action) { query += ' AND a.action = ?'; params.push(action); }

    query += ' ORDER BY a.timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await ctx.env.DB.prepare(query).bind(...params).all();

    return json({ data: result.results || [], meta: { limit, offset } });
  });

  // ─── Errors (path + status only, no request bodies) ────
  router.get('/api/admin/errors', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const limit = Math.min(parseInt(ctx.query.limit) || 50, 200);

    const result = await ctx.env.DB.prepare(`
      SELECT l.id, l.method, l.path, l.status, l.error, l.responseTime, l.timestamp, u.name as userName, u.email as userEmail
      FROM api_logs l
      LEFT JOIN users u ON l.userId = u.id
      WHERE l.status >= 400
      ORDER BY l.timestamp DESC LIMIT ?
    `).bind(limit).all();

    return json({ data: result.results || [] });
  });

  // ─── Performance metrics ───────────────────────────────
  router.get('/api/admin/performance', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [byPath, hourly] = await Promise.all([
      ctx.env.DB.prepare(`
        SELECT path, COUNT(*) as count, ROUND(AVG(responseTime)) as avgTime, MAX(responseTime) as maxTime
        FROM api_logs WHERE timestamp >= ?
        GROUP BY path ORDER BY avgTime DESC LIMIT 20
      `).bind(weekAgo).all(),
      ctx.env.DB.prepare(`
        SELECT strftime('%H', timestamp) as hour, ROUND(AVG(responseTime)) as avgTime, COUNT(*) as count
        FROM api_logs WHERE timestamp >= ?
        GROUP BY strftime('%H', timestamp) ORDER BY hour ASC
      `).bind(dayAgo).all(),
    ]);

    return json({
      data: {
        byPath: byPath?.results || [],
        hourly: hourly?.results || [],
      }
    });
  });

  // ─── AI usage & cost per user ─────────────────────────
  router.get('/api/admin/ai-costs', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    // Pricing per million tokens (USD)
    const MODEL_PRICING = {
      'claude-sonnet-4-20250514': { input: 3, output: 15 },
      'claude-haiku-3-20240307':  { input: 0.25, output: 1.25 },
      'claude-haiku-3.5':         { input: 1, output: 5 },
    };
    const DEFAULT_PRICING = { input: 3, output: 15 }; // fallback to Sonnet pricing

    const result = await ctx.env.DB.prepare(`
      SELECT a.userId, u.name, u.email, a.metadata, a.timestamp
      FROM activity_log a
      LEFT JOIN users u ON a.userId = u.id
      WHERE a.action = 'ai_process' AND a.metadata != '{}'
      ORDER BY a.timestamp DESC
    `).all();

    const rows = result.results || [];
    const byUser = {};

    for (const row of rows) {
      let meta = {};
      try { meta = JSON.parse(row.metadata || '{}'); } catch {}
      if (!meta.inputTokens && !meta.outputTokens) continue;

      const pricing = MODEL_PRICING[meta.model] || DEFAULT_PRICING;
      const inputCost = (meta.inputTokens || 0) / 1_000_000 * pricing.input;
      const outputCost = (meta.outputTokens || 0) / 1_000_000 * pricing.output;

      if (!byUser[row.userId]) {
        byUser[row.userId] = {
          userId: row.userId,
          name: row.name || 'Unknown',
          email: row.email || '',
          totalRequests: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          totalCostUSD: 0,
          lastUsed: null,
        };
      }

      const u = byUser[row.userId];
      u.totalRequests++;
      u.totalInputTokens += meta.inputTokens || 0;
      u.totalOutputTokens += meta.outputTokens || 0;
      u.totalCostUSD += inputCost + outputCost;
      if (!u.lastUsed) u.lastUsed = row.timestamp;
    }

    // Round costs and sort by cost descending
    const users = Object.values(byUser).map(u => ({
      ...u,
      totalCostUSD: Math.round(u.totalCostUSD * 10000) / 10000, // 4 decimal places
    })).sort((a, b) => b.totalCostUSD - a.totalCostUSD);

    const grandTotal = users.reduce((sum, u) => sum + u.totalCostUSD, 0);

    return json({
      data: {
        users,
        grandTotal: Math.round(grandTotal * 10000) / 10000,
      }
    });
  });

  // ─── Feedback: admin list all ─────────────────────────
  router.get('/api/admin/feedback', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { status, type, limit: limitStr, offset: offsetStr } = ctx.query;
    const limit = Math.min(parseInt(limitStr) || 50, 200);
    const offset = parseInt(offsetStr) || 0;

    let query = `
      SELECT f.id, f.userId, f.type, f.title, f.description, f.status, f.adminNote,
             f.page, f.userAgent, f.createdAt, f.updatedAt,
             (f.screenshot IS NOT NULL AND f.screenshot != '') as hasScreenshot,
             u.name as userName, u.email as userEmail
      FROM feedback f
      LEFT JOIN users u ON f.userId = u.id
      WHERE 1=1
    `;
    const params = [];

    if (status) { query += ' AND f.status = ?'; params.push(status); }
    if (type) { query += ' AND f.type = ?'; params.push(type); }

    query += ' ORDER BY f.createdAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const result = await ctx.env.DB.prepare(query).bind(...params).all();
    const counts = await ctx.env.DB.prepare(`
      SELECT status, COUNT(*) as count FROM feedback GROUP BY status
    `).all();

    return json({ data: result.results || [], counts: counts.results || [], meta: { limit, offset } });
  });

  // ─── Feedback: get screenshot on demand ──────────────
  router.get('/api/admin/feedback/:id/screenshot', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { id } = ctx.params;
    const row = await ctx.env.DB.prepare('SELECT screenshot FROM feedback WHERE id = ?').bind(id).first();
    if (!row) return json({ error: 'Not found' }, 404);
    return json({ data: row.screenshot || null });
  });

  // ─── Feedback: admin update status / add note ────────
  router.put('/api/admin/feedback/:id', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { id } = ctx.params;
    const { status, adminNote } = ctx.body;

    const existing = await ctx.env.DB.prepare('SELECT id FROM feedback WHERE id = ?').bind(id).first();
    if (!existing) return json({ error: 'Feedback not found' }, 404);

    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (adminNote !== undefined) { updates.push('adminNote = ?'); params.push(adminNote); }

    if (updates.length === 0) return json({ error: 'Nothing to update' }, 400);

    updates.push('updatedAt = ?');
    params.push(new Date().toISOString());
    params.push(id);

    await ctx.env.DB.prepare(
      `UPDATE feedback SET ${updates.join(', ')} WHERE id = ?`
    ).bind(...params).run();

    await logActivity(ctx.env.DB, ctx.user.id, 'admin_update_feedback', { feedbackId: id, status });

    return json({ success: true });
  });

  // ─── Feedback: admin delete ──────────────────────────
  router.delete('/api/admin/feedback/:id', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const { id } = ctx.params;
    await ctx.env.DB.prepare('DELETE FROM feedback WHERE id = ?').bind(id).run();
    return json({ success: true });
  });

  // ─── Log cleanup (retention) ───────────────────────────
  router.post('/api/admin/cleanup', async (ctx) => {
    const denied = requireAdmin(ctx);
    if (denied) return denied;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const apiResult = await ctx.env.DB.prepare('DELETE FROM api_logs WHERE timestamp < ?').bind(thirtyDaysAgo).run();
    const activityResult = await ctx.env.DB.prepare('DELETE FROM activity_log WHERE timestamp < ?').bind(ninetyDaysAgo).run();

    return json({
      success: true,
      cleaned: {
        apiLogs: apiResult.changes || 0,
        activityLogs: activityResult.changes || 0,
      }
    });
  });
}
