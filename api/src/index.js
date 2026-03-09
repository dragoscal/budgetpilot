// BudgetPilot API — Cloudflare Worker
import { Router, json } from './router.js';
import { createToken, verifyToken, hashPassword, generateSalt, generateId } from './auth.js';
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

// ─── Rate Limiting (in-memory per isolate) ───────────────
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 60000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = rateLimits.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW) {
    rateLimits.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

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
    const user = await ctx.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(setting.userId).first();
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
    const user = await ctx.env.DB.prepare(`SELECT * FROM users WHERE id = ?`).bind(payload.sub).first();
    if (!user) return json({ error: 'User not found' }, 401);
    if (user.suspended) return json({ error: 'Account suspended. Contact administrator.' }, 403);
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
  if (!checkRateLimit(ip)) return json({ error: 'Too many attempts. Try again later.' }, 429);

  const { email, password, name, defaultCurrency } = ctx.body;

  if (!email || !password || !name) {
    return json({ error: 'Email, password, and name are required' }, 400);
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
  if (!checkRateLimit(ip)) return json({ error: 'Too many attempts. Try again later.' }, 429);

  const { email, password } = ctx.body;

  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) return json({ error: 'Invalid credentials' }, 401);

  if (user.suspended) return json({ error: 'Account suspended. Contact administrator.' }, 403);

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return json({ error: 'Invalid credentials' }, 401);

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

  const hash = await hashPassword(currentPassword, ctx.user.salt);
  if (hash !== ctx.user.passwordHash) return json({ error: 'Current password is incorrect' }, 401);

  if (newPassword.length < 8) return json({ error: 'New password must be at least 8 characters' }, 400);

  const salt = generateSalt();
  const newHash = await hashPassword(newPassword, salt);

  await ctx.env.DB.prepare(
    `UPDATE users SET passwordHash = ?, salt = ?, updatedAt = ? WHERE id = ?`
  ).bind(newHash, salt, new Date().toISOString(), ctx.user.id).run();

  return json({ success: true });
});

// ─── Delete Own Account ──────────────────────────────────
router.delete('/api/auth/account', async (ctx) => {
  const userId = ctx.user.id;
  const tables = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'people', 'debts', 'wishlist', 'settings', 'sync_log', 'activity_log'];
  for (const table of tables) {
    await ctx.env.DB.prepare(`DELETE FROM ${table} WHERE userId = ?`).bind(userId).run();
  }
  await ctx.env.DB.prepare(`DELETE FROM debt_payments WHERE debtId NOT IN (SELECT id FROM debts)`).run();
  await ctx.env.DB.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
  return json({ success: true });
});

// ─── AI Proxy ─────────────────────────────────────────────
router.post('/api/ai/process', async (ctx) => {
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
  const usedModel = model || 'claude-sonnet-4-20250514';

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: usedModel,
      max_tokens: maxTokens || 2000,
      system: system || undefined,
      messages,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return json({ error: err.error?.message || 'AI processing failed' }, res.status);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  // Log token usage for cost tracking
  const usage = data.usage || {};
  ctx.ctx.waitUntil(logActivity(ctx.env.DB, ctx.user.id, 'ai_process', {
    model: usedModel,
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
  }));

  // Try to extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return json(JSON.parse(jsonMatch[0])); } catch { /* fall through */ }
  }

  return json({ content: data.content });
});

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
          `INSERT INTO api_logs (id, userId, method, path, status, responseTime, error, userAgent, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          crypto.randomUUID(), userId, request.method, url.pathname,
          response.status, Date.now() - start,
          response.status >= 400 ? `HTTP ${response.status}` : null,
          (request.headers.get('user-agent') || '').slice(0, 200),
          new Date().toISOString()
        ).run().catch(() => {})
      );
    }

    return response;
  },
};
