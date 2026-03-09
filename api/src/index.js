// BudgetPilot API — Cloudflare Worker
import { Router, json } from './router.js';
import { createToken, verifyToken, hashPassword, generateSalt, generateId } from './auth.js';
import { registerCrudRoutes } from './crud.js';
import { registerTelegramRoutes } from './telegram.js';

const router = new Router();

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
  const { email, password, name, defaultCurrency } = ctx.body;

  if (!email || !password || !name) {
    return json({ error: 'Email, password, and name are required' }, 400);
  }

  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400);
  }

  // Check if email exists
  const existing = await ctx.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (existing) return json({ error: 'Email already registered' }, 409);

  const salt = generateSalt();
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();
  const userId = generateId();

  await ctx.env.DB.prepare(
    `INSERT INTO users (id, email, name, passwordHash, salt, defaultCurrency, onboardingComplete, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).bind(userId, email.toLowerCase(), name, passwordHash, salt, defaultCurrency || 'RON', now, now).run();

  const token = await createToken({ sub: userId, email: email.toLowerCase() }, ctx.env.JWT_SECRET);

  return json({
    token,
    user: { id: userId, email: email.toLowerCase(), name, defaultCurrency: defaultCurrency || 'RON' }
  }, 201);
});

router.post('/api/auth/login', async (ctx) => {
  const { email, password } = ctx.body;

  if (!email || !password) return json({ error: 'Email and password required' }, 400);

  const user = await ctx.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email.toLowerCase()).first();
  if (!user) return json({ error: 'Invalid credentials' }, 401);

  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return json({ error: 'Invalid credentials' }, 401);

  const token = await createToken({ sub: user.id, email: user.email }, ctx.env.JWT_SECRET);

  return json({
    token,
    user: { id: user.id, email: user.email, name: user.name, defaultCurrency: user.defaultCurrency, onboardingComplete: !!user.onboardingComplete }
  });
});

router.get('/api/auth/me', async (ctx) => {
  return json({
    user: {
      id: ctx.user.id,
      email: ctx.user.email,
      name: ctx.user.name,
      defaultCurrency: ctx.user.defaultCurrency,
      onboardingComplete: !!ctx.user.onboardingComplete,
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

// ─── AI Proxy ─────────────────────────────────────────────
router.post('/api/ai/process', async (ctx) => {
  const anthropicKey = ctx.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return json({ error: 'Anthropic API key not configured on server' }, 503);

  const { messages, maxTokens, system } = ctx.body;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
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

  // Try to extract JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return json(JSON.parse(jsonMatch[0])); } catch { /* fall through */ }
  }

  return json({ content: data.content });
});

// ─── Register CRUD and Telegram routes ────────────────────
registerCrudRoutes(router);
registerTelegramRoutes(router);

// ─── Worker Export ────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
  },
};
