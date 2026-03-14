// BudgetPilot API — Cloudflare Worker
import { Router, json } from './router.js';
import { createToken, verifyToken, hashPassword, verifyPassword, needsHashMigration, generateSalt, generateId } from './auth.js';
import { registerCrudRoutes } from './crud.js';
import { registerTelegramRoutes } from './telegram.js';
import { registerAdminRoutes } from './admin.js';

const router = new Router();

// ─── Activity Logger ─────────────────────────────────────
export async function logActivity(db, userId, action, metadata = {}) {
  try {
    await db.prepare(
      `INSERT INTO activity_log (id, userId, action, metadata, timestamp) VALUES (?, ?, ?, ?, ?)`
    ).bind(crypto.randomUUID(), userId, action, JSON.stringify(metadata), new Date().toISOString()).run();
  } catch {}
}

// ─── Rate Limiting (D1-backed, shared across isolates) ───
// LIMITATION: Rate limiting is per-IP, which means users behind shared IPs (corporate NAT,
// VPNs, mobile carriers) share the same rate limit bucket. Per-user rate limiting would
// require passing the authenticated userId here, but auth runs after rate limiting on
// public routes (login/register). A hybrid approach (per-IP for public, per-user for
// authenticated routes) would be more accurate but requires architectural changes.
async function checkRateLimit(db, ip, path, maxRequests = 10, windowMs = 60000) {
  const windowStart = new Date(Date.now() - windowMs).toISOString();
  try {
    const result = await db.prepare(
      'SELECT COUNT(*) as count FROM api_logs WHERE ip = ? AND path = ? AND timestamp > ?'
    ).bind(ip, path, windowStart).first();

    // Probabilistic cleanup: ~1% of rate-limit checks trigger old log pruning
    // to prevent unbounded api_logs growth without needing a separate cron job
    if (Math.random() < 0.01) {
      db.prepare(`DELETE FROM api_logs WHERE timestamp < datetime('now', '-7 days')`)
        .run().catch(() => {});
    }

    return (result?.count || 0) < maxRequests;
  } catch {
    // If query fails, deny the request (fail closed for security)
    return false;
  }
}

// ─── API Versioning Middleware ────────────────────────────
// Strip /v1 from path so /api/v1/* routes map to /api/*
router.use(async (ctx) => {
  if (ctx.url.pathname.startsWith('/api/v1/')) {
    ctx.url.pathname = ctx.url.pathname.replace('/api/v1/', '/api/');
  }
});

// ─── Auth Middleware ──────────────────────────────────────
// Skip auth for public routes
const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register', '/api/health', '/telegram/webhook'];

router.use(async (ctx) => {
  const path = ctx.url.pathname;
  if (PUBLIC_PATHS.some(p => path.startsWith(p))) return;
  if (!path.startsWith('/api')) return;

  const authHeader = ctx.request.headers.get('Authorization');
  const apiKey = ctx.request.headers.get('x-api-key');

  if (apiKey) {
    // API key auth — find user by API key
    const setting = await ctx.env.DB.prepare(
      `SELECT userId FROM settings WHERE key = 'apiKey' AND value = ?`
    ).bind(apiKey).first();
    if (!setting) return json({ error: 'Invalid API key' }, 401);
    const user = await ctx.env.DB.prepare(
      `SELECT id, email, name, defaultCurrency, onboardingComplete, role, suspended, createdAt FROM users WHERE id = ?`
    ).bind(setting.userId).first();
    if (!user) return json({ error: 'User not found' }, 401);
    if (user.suspended) return json({ error: 'Account suspended. Contact administrator.' }, 403);
    ctx.user = user;
    return;
  }

  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Authorization required' }, 401);
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyToken(token, ctx.env.JWT_SECRET);
    // #9: Check tokenIssuedAt — reject tokens issued before last password change
    const user = await ctx.env.DB.prepare(
      `SELECT id, email, name, defaultCurrency, onboardingComplete, role, suspended, createdAt, tokenIssuedAt FROM users WHERE id = ?`
    ).bind(payload.sub).first();
    if (!user) return json({ error: 'User not found' }, 401);
    if (user.suspended) return json({ error: 'Account suspended. Contact administrator.' }, 403);
    // Reject tokens issued before last password change
    if (user.tokenIssuedAt && payload.iat && payload.iat < Math.floor(new Date(user.tokenIssuedAt).getTime() / 1000)) {
      return json({ error: 'Token invalidated. Please log in again.' }, 401);
    }
    ctx.user = user;
  } catch (err) {
    return json({ error: 'Invalid token: ' + err.message }, 401);
  }
});

// ─── Health Check ─────────────────────────────────────────
router.get('/api/health', async () => {
  return json({ status: 'ok', service: 'BudgetPilot API', version: '1.0.0' });
});

// ─── Auth Routes ──────────────────────────────────────────
router.post('/api/auth/register', async (ctx) => {
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(ctx.env.DB, ip, '/api/auth/register'))) return json({ error: 'Too many attempts. Try again later.' }, 429);

  const { email, password, name, defaultCurrency } = ctx.body;

  if (!email || !password || !name) {
    return json({ error: 'Email, password, and name are required' }, 400);
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ error: 'Invalid email format' }, 400);
  }

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400);
  }

  const existing = await ctx.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return json({ error: 'Email already registered' }, 409);

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  const userId = generateId();

  await ctx.env.DB.prepare(
    `INSERT INTO users (id, email, name, passwordHash, salt, defaultCurrency, onboardingComplete, role, suspended, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, 'user', 0, ?, ?)`
  ).bind(userId, email.toLowerCase(), name, passwordHash, salt, defaultCurrency || 'RON', now, now).run();

  const token = await createToken({ sub: userId, email: email.toLowerCase() }, ctx.env.JWT_SECRET);

  ctx.ctx.waitUntil(logActivity(ctx.env.DB, userId, 'register', {}));

  return json({
    token,
    user: { id: userId, email: email.toLowerCase(), name, defaultCurrency: defaultCurrency || 'RON', role: 'user' }
  }, 201);
});

router.post('/api/auth/login', async (ctx) => {
  const ip = ctx.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(ctx.env.DB, ip, '/api/auth/login'))) return json({ error: 'Too many attempts. Try again later.' }, 429);

  const { email, password } = ctx.body;

  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) return json({ error: 'Invalid credentials' }, 401);

  if (user.suspended) return json({ error: 'Account suspended. Contact administrator.' }, 403);

  // Verify password (supports both legacy SHA-256 and PBKDF2)
  const passwordValid = await verifyPassword(password, user.salt, user.passwordHash);
  if (!passwordValid) return json({ error: 'Invalid credentials' }, 401);

  // Rolling migration: upgrade legacy SHA-256 hashes to PBKDF2
  if (needsHashMigration(user.passwordHash)) {
    const newSalt = generateSalt();
    const newHash = await hashPassword(password, newSalt);
    ctx.ctx.waitUntil(
      ctx.env.DB.prepare('UPDATE users SET passwordHash = ?, salt = ?, updatedAt = ? WHERE id = ?')
        .bind(newHash, newSalt, new Date().toISOString(), user.id).run().catch(() => {})
    );
  }

  const token = await createToken({ sub: user.id, email: user.email }, ctx.env.JWT_SECRET);

  // Check AI proxy access
  let aiProxyAllowed = user.role === 'admin';
  if (!aiProxyAllowed) {
    const proxySetting = await ctx.env.DB.prepare(
      `SELECT value FROM settings WHERE userId = ? AND key = 'aiProxyAllowed'`
    ).bind(user.id).first();
    aiProxyAllowed = proxySetting?.value === 'true';
  }

  ctx.ctx.waitUntil(logActivity(ctx.env.DB, user.id, 'login', {}));

  return json({
    token,
    user: {
      id: user.id, email: user.email, name: user.name,
      defaultCurrency: user.defaultCurrency,
      onboardingComplete: !!user.onboardingComplete,
      role: user.role || 'user',
      aiProxyAllowed,
    }
  });
});

router.get('/api/auth/me', async (ctx) => {
  // Check if user has AI proxy access (admin always has it)
  let aiProxyAllowed = ctx.user.role === 'admin';
  if (!aiProxyAllowed) {
    const proxySetting = await ctx.env.DB.prepare(
      `SELECT value FROM settings WHERE userId = ? AND key = 'aiProxyAllowed'`
    ).bind(ctx.user.id).first();
    aiProxyAllowed = proxySetting?.value === 'true';
  }

  return json({
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      defaultCurrency: ctx.user.defaultCurrency,
      onboardingComplete: !!ctx.user.onboardingComplete,
      role: ctx.user.role || 'user',
      aiProxyAllowed,
    }
  });
});

router.put('/api/auth/profile', async (ctx) => {
  const { name, defaultCurrency, onboardingComplete } = ctx.body;
  const updates = [];
  const params = [];

  if (name !== undefined) { updates.push('name = ?'); params.push(name); }
  if (defaultCurrency !== undefined) { updates.push('defaultCurrency = ?'); params.push(defaultCurrency); }
  if (onboardingComplete !== undefined) { updates.push('onboardingComplete = ?'); params.push(onboardingComplete ? 1 : 0); }

  if (updates.length === 0) return json({ error: 'No fields to update' }, 400);

  updates.push('updatedAt = ?');
  params.push(new Date().toISOString());
  params.push(ctx.user.id);

  await ctx.env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...params).run();

  return json({ success: true });
});

router.put('/api/auth/password', async (ctx) => {
  const { currentPassword, newPassword } = ctx.body;

  // Re-query password hash specifically for this route (not on ctx.user for security)
  const userCreds = await ctx.env.DB.prepare(
    'SELECT passwordHash, salt FROM users WHERE id = ?'
  ).bind(ctx.user.id).first();
  if (!userCreds) return json({ error: 'User not found' }, 404);

  const passwordValid = await verifyPassword(currentPassword, userCreds.salt, userCreds.passwordHash);
  if (!passwordValid) return json({ error: 'Current password is incorrect' }, 401);

  if (newPassword.length < 8) return json({ error: 'New password must be at least 8 characters' }, 400);

  const salt = generateSalt();
  const newHash = await hashPassword(newPassword, salt);
  const now = new Date().toISOString();

  // Set tokenIssuedAt to invalidate all existing tokens
  await ctx.env.DB.prepare(
    `UPDATE users SET passwordHash = ?, salt = ?, tokenIssuedAt = ?, updatedAt = ? WHERE id = ?`
  ).bind(newHash, salt, now, now, ctx.user.id).run();

  // Issue a fresh token for the current session
  const newToken = await createToken({ sub: ctx.user.id, email: ctx.user.email }, ctx.env.JWT_SECRET);

  return json({ success: true, token: newToken });
});

// ─── Delete Own Account ──────────────────────────────────
router.delete('/api/auth/account', async (ctx) => {
  const userId = ctx.user.id;

  // Pre-fetch family IDs before batching (needed to build DELETE statements)
  const userFamilies = await ctx.env.DB.prepare(`SELECT id FROM families WHERE createdBy = ?`).bind(userId).all();
  const familyIds = (userFamilies.results || []).map(f => f.id);

  // Atomic batch delete — all-or-nothing to prevent partial account deletion.
  // D1 batch() executes all statements in a single transaction.
  const stmts = [
    // Phase 1: Leaf tables
    ctx.env.DB.prepare(`DELETE FROM debt_payments WHERE userId = ?`).bind(userId),
    ctx.env.DB.prepare(`DELETE FROM loan_payments WHERE userId = ?`).bind(userId),
    ctx.env.DB.prepare(`DELETE FROM settlement_history WHERE userId = ?`).bind(userId),
    // Phase 2: Parent tables
    ctx.env.DB.prepare(`DELETE FROM debts WHERE userId = ?`).bind(userId),
    ctx.env.DB.prepare(`DELETE FROM loans WHERE userId = ?`).bind(userId),
    ctx.env.DB.prepare(`DELETE FROM people WHERE userId = ?`).bind(userId),
    // Phase 3: Simple tables
    ...['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'wishlist', 'settings', 'sync_log', 'activity_log', 'feedback', 'challenges', 'receipts']
      .map(table => ctx.env.DB.prepare(`DELETE FROM ${table} WHERE userId = ?`).bind(userId)),
    // Phase 4: Family data
    ...familyIds.flatMap(fid => [
      ctx.env.DB.prepare(`DELETE FROM shared_expenses WHERE familyId = ?`).bind(fid),
      ctx.env.DB.prepare(`DELETE FROM family_members WHERE familyId = ?`).bind(fid),
    ]),
    ctx.env.DB.prepare(`DELETE FROM shared_expenses WHERE paidByUserId = ?`).bind(userId),
    ctx.env.DB.prepare(`DELETE FROM family_members WHERE userId = ?`).bind(userId),
    ctx.env.DB.prepare(`DELETE FROM families WHERE createdBy = ?`).bind(userId),
    // Phase 5: Orphan cleanup (scoped to user)
    ctx.env.DB.prepare(`DELETE FROM debt_payments WHERE debtId NOT IN (SELECT id FROM debts) AND userId = ?`).bind(userId),
    ctx.env.DB.prepare(`DELETE FROM loan_payments WHERE loanId NOT IN (SELECT id FROM loans) AND userId = ?`).bind(userId),
    // Phase 6: User record itself
    ctx.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId),
  ];

  await ctx.env.DB.batch(stmts);
  return json({ success: true });
});

// ─── Clear All User Data (keep account) ───────────────────
router.delete('/api/data/clear', async (ctx) => {
  const userId = ctx.user.id;
  // Delete in FK-safe order: children before parents
  await ctx.env.DB.prepare(`DELETE FROM debt_payments WHERE userId = ?`).bind(userId).run();
  await ctx.env.DB.prepare(`DELETE FROM loan_payments WHERE userId = ?`).bind(userId).run();
  await ctx.env.DB.prepare(`DELETE FROM settlement_history WHERE userId = ?`).bind(userId).run();
  await ctx.env.DB.prepare(`DELETE FROM debts WHERE userId = ?`).bind(userId).run();
  await ctx.env.DB.prepare(`DELETE FROM loans WHERE userId = ?`).bind(userId).run();
  await ctx.env.DB.prepare(`DELETE FROM people WHERE userId = ?`).bind(userId).run();
  const simpleTables = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'wishlist', 'settings', 'sync_log', 'challenges', 'receipts'];
  for (const table of simpleTables) {
    await ctx.env.DB.prepare(`DELETE FROM ${table} WHERE userId = ?`).bind(userId).run();
  }
  // Clean family data: shared_expenses/family_members before families
  const families = await ctx.env.DB.prepare(`SELECT id FROM families WHERE createdBy = ?`).bind(userId).all();
  for (const fam of (families.results || [])) {
    await ctx.env.DB.prepare(`DELETE FROM shared_expenses WHERE familyId = ?`).bind(fam.id).run();
    await ctx.env.DB.prepare(`DELETE FROM family_members WHERE familyId = ?`).bind(fam.id).run();
    await ctx.env.DB.prepare(`DELETE FROM families WHERE id = ?`).bind(fam.id).run();
  }
  await ctx.env.DB.prepare(`DELETE FROM shared_expenses WHERE paidByUserId = ?`).bind(userId).run();
  await ctx.env.DB.prepare(`DELETE FROM family_members WHERE userId = ?`).bind(userId).run();
  // Orphan cleanup — scoped to current user to prevent cross-user data deletion
  try {
    await ctx.env.DB.prepare(`DELETE FROM debt_payments WHERE debtId NOT IN (SELECT id FROM debts) AND userId = ?`).bind(userId).run();
    await ctx.env.DB.prepare(`DELETE FROM loan_payments WHERE loanId NOT IN (SELECT id FROM loans) AND userId = ?`).bind(userId).run();
  } catch (e) {
    console.error('Orphan cleanup failed during data clear:', e.message);
  }
  ctx.ctx.waitUntil(logActivity(ctx.env.DB, userId, 'clear_all_data', {}));
  return json({ success: true });
});

// ─── Delete All Transactions ──────────────────────────────
router.delete('/api/transactions/all', async (ctx) => {
  const userId = ctx.user.id;
  const now = new Date().toISOString();
  await ctx.env.DB.prepare(
    `UPDATE transactions SET deletedAt = ? WHERE userId = ? AND (deletedAt IS NULL OR deletedAt = '')`
  ).bind(now, userId).run();
  ctx.ctx.waitUntil(logActivity(ctx.env.DB, userId, 'delete_all_transactions', {}));
  return json({ success: true });
});

// ─── Delete Import Batch ──────────────────────────────────
router.delete('/api/transactions/batch/:batchId', async (ctx) => {
  const { batchId } = ctx.params;
  const userId = ctx.user.id;
  const now = new Date().toISOString();
  const result = await ctx.env.DB.prepare(
    `UPDATE transactions SET deletedAt = ? WHERE userId = ? AND importBatch = ? AND (deletedAt IS NULL OR deletedAt = '')`
  ).bind(now, userId, batchId).run();
  ctx.ctx.waitUntil(logActivity(ctx.env.DB, userId, 'undo_import', { batchId, count: result.meta?.changes || 0 }));
  return json({ success: true, deleted: result.meta?.changes || 0 });
});

// ─── Feedback (Bug Reports & Suggestions) ─────────────────
router.post('/api/feedback', async (ctx) => {
  const { type, title, description, screenshot, page } = ctx.body;

  if (!title || !type) return json({ error: 'Title and type are required' }, 400);
  if (!['bug', 'suggestion', 'other'].includes(type)) return json({ error: 'Invalid feedback type' }, 400);

  const now = new Date().toISOString();
  const id = generateId();

  await ctx.env.DB.prepare(
    `INSERT INTO feedback (id, userId, type, title, description, screenshot, status, page, userAgent, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`
  ).bind(
    id, ctx.user.id, type, title, description || null,
    screenshot || null, page || null,
    (ctx.request.headers.get('user-agent') || '').slice(0, 200),
    now, now
  ).run();

  ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'submit_feedback', { type, title }));

  return json({ data: { id, type, title, status: 'open', createdAt: now } }, 201);
});

// GET /api/feedback — user's own feedback
router.get('/api/feedback', async (ctx) => {
  const result = await ctx.env.DB.prepare(
    `SELECT id, type, title, description, status, adminNote, page, createdAt, updatedAt
     FROM feedback WHERE userId = ? ORDER BY createdAt DESC LIMIT 50`
  ).bind(ctx.user.id).all();
  return json({ data: result.results || [] });
});

// ─── AI Proxy (streaming) ─────────────────────────────────
// Uses Anthropic streaming API to avoid timeout issues.
// Forwards text deltas to browser as SSE events so no connection times out.
// Protocol: sends {t:"chunk"} for text, {d:true} when done, {error:"msg"} on error.
router.post('/api/ai/process', async (ctx) => {
  // Rate limit AI proxy: 30 requests per minute per user
  const aiIp = ctx.request.headers.get('CF-Connecting-IP') || 'unknown';
  if (!(await checkRateLimit(ctx.env.DB, aiIp, '/api/ai/process', 30, 60000))) {
    return json({ error: 'AI rate limit exceeded. Try again in a minute.' }, 429);
  }

  const anthropicKey = ctx.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return json({ error: 'Anthropic API key not configured on server' }, 503);

  // Check if user has AI proxy access (admin always has it)
  const isAdmin = ctx.user.role === 'admin';
  let proxyAllowed = isAdmin;
  if (!isAdmin) {
    const proxySetting = await ctx.env.DB.prepare(
      `SELECT value FROM settings WHERE userId = ? AND key = 'aiProxyAllowed'`
    ).bind(ctx.user.id).first();
    proxyAllowed = proxySetting?.value === 'true';
  }
  if (!proxyAllowed) {
    return json({ error: 'AI proxy access not granted. Ask the admin or add your own API key in Settings.' }, 403);
  }

  const { messages, maxTokens, system, model } = ctx.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array is required' }, 400);
  }
  // Validate message structure
  for (const msg of messages) {
    if (!msg.role || !msg.content) {
      return json({ error: 'Each message must have role and content' }, 400);
    }
    if (!['user', 'assistant'].includes(msg.role)) {
      return json({ error: 'Invalid message role' }, 400);
    }
  }
  // Model whitelist — prevent users from using expensive models
  const ALLOWED_MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-haiku-20241022', 'claude-3-5-sonnet-20241022'];
  const usedModel = ALLOWED_MODELS.includes(model) ? model : 'claude-sonnet-4-20250514';
  // Cap max tokens to prevent abuse
  const cappedMaxTokens = Math.min(Math.max(1, maxTokens || 2000), 16384);

  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: usedModel,
        max_tokens: cappedMaxTokens,
        system: system || undefined,
        messages,
        stream: true,
      }),
    });
  } catch (err) {
    return json({ error: 'AI request failed: ' + (err.message || 'network error') }, 502);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return json({ error: err.error?.message || 'AI processing failed' }, res.status);
  }

  // Stream text deltas directly to the browser.
  // This keeps both connections alive (browser↔worker, worker↔anthropic).
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const send = (obj) => writer.write(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

  ctx.ctx.waitUntil((async () => {
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = 'end_turn';
    try {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (raw === '[DONE]') continue;
            try {
              const event = JSON.parse(raw);
              if (event.type === 'content_block_delta' && event.delta?.text) {
                // Forward text chunk to browser
                await send({ t: event.delta.text });
              } else if (event.type === 'message_delta') {
                if (event.usage) outputTokens = event.usage.output_tokens || 0;
                if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
              } else if (event.type === 'message_start' && event.message?.usage) {
                inputTokens = event.message.usage.input_tokens || 0;
              }
            } catch { /* skip */ }
          }
        }
      }

      // Signal completion — include stop_reason so frontend can detect truncation
      await send({ d: true, stop_reason: stopReason });

      // Log token usage asynchronously
      ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'ai_process', {
        model: usedModel,
        inputTokens,
        outputTokens,
      }));
    } catch (err) {
      try { await send({ error: err.message || 'Stream failed' }); } catch { /* closed */ }
    } finally {
      try { await writer.close(); } catch { /* already closed */ }
    }
  })());

  // CORS headers are added by the router's addCors() wrapper — do not hardcode '*' here
  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
});

// ─── Clear All User Data (keep account) ────────────────
// ─── Register routes (admin BEFORE crud to avoid /:table collision) ──
registerAdminRoutes(router);
registerCrudRoutes(router);
registerTelegramRoutes(router);

// ─── Worker Export with Request Logging ──────────────────
export default {
  async fetch(request, env, ctx) {
    const start = Date.now();
    const response = await router.handle(request, env, ctx);

    // Log API requests asynchronously
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api') && request.method !== 'OPTIONS') {
      let userId = null;
      try {
        const auth = request.headers.get('Authorization');
        if (auth?.startsWith('Bearer ')) {
          const body = auth.slice(7).split('.')[1];
          const payload = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
          userId = payload.sub;
        }
      } catch {}

      ctx.waitUntil(
        env.DB.prepare(
          `INSERT INTO api_logs (id, userId, method, path, status, responseTime, error, userAgent, ip, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), userId, request.method, url.pathname,
          response.status, Date.now() - start,
          response.status >= 400 ? `HTTP ${response.status}` : null,
          (request.headers.get('user-agent') || '').slice(0, 200),
          request.headers.get('CF-Connecting-IP') || null,
          new Date().toISOString()
        ).run().catch(() => {})
      );
    }

    return response;
  },
};
