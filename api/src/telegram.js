// Telegram Bot Webhook Handler for BudgetPilot
import { json } from './router.js';
import { generateId } from './auth.js';

// Category keywords for local NLP (no AI fallback)
const CATEGORY_KEYWORDS = {
  groceries: ['lidl', 'kaufland', 'carrefour', 'mega image', 'auchan', 'profi', 'penny', 'cora', 'selgros', 'piata', 'market', 'grocery', 'supermarket'],
  dining: ['restaurant', 'pizza', 'mcdonalds', 'kfc', 'burger', 'starbucks', 'coffee', 'cafea', 'dining', 'lunch', 'dinner', 'brunch', 'sushi'],
  transport: ['bolt', 'uber', 'taxi', 'metrou', 'stb', 'benzina', 'fuel', 'gas', 'parking', 'parcare'],
  shopping: ['emag', 'altex', 'dedeman', 'ikea', 'zara', 'h&m', 'haine', 'clothes'],
  subscriptions: ['netflix', 'spotify', 'youtube', 'hbo', 'disney', 'apple', 'google', 'chatgpt', 'subscription'],
  utilities: ['enel', 'digi', 'vodafone', 'orange', 'e.on', 'apa', 'gaz', 'internet', 'electricitate', 'factura'],
  health: ['farmacia', 'catena', 'sensiblu', 'doctor', 'medic', 'sanatate', 'health', 'gym', 'sala'],
  entertainment: ['cinema', 'bilet', 'concert', 'theater', 'game', 'joc'],
  housing: ['chirie', 'rent', 'ipoteca', 'mortgage', 'intretinere'],
};

// Parse natural language expense text
function parseExpenseText(text) {
  const lower = text.toLowerCase().trim();

  // Patterns to match:
  // "45 lei bolt taxi"
  // "netflix 55 lei"
  // "150 dinner friends"
  // "salary 8000 lei" (income)
  // "rent 2000"

  // Check for income keywords
  const incomeWords = ['salary', 'salariu', 'income', 'venit', 'freelance', 'payment received', 'bonus'];
  const isIncome = incomeWords.some(w => lower.includes(w));

  // Extract amount and currency
  let amount = null;
  let currency = 'RON';
  let merchantParts = [];

  // Match patterns like "45 lei", "55.50 ron", "25 eur", "$100", "€50"
  const amountPatterns = [
    /(\d+[.,]?\d*)\s*(lei|ron|eur|euro|usd|gbp|\$|€|£)/i,
    /(lei|ron|eur|euro|usd|gbp|\$|€|£)\s*(\d+[.,]?\d*)/i,
    /(\d+[.,]?\d*)/,
  ];

  for (const pattern of amountPatterns) {
    const match = lower.match(pattern);
    if (match) {
      if (match[2] && /\d/.test(match[1])) {
        amount = parseFloat(match[1].replace(',', '.'));
        currency = normalizeCurrency(match[2]);
      } else if (match[1] && /\d/.test(match[2])) {
        amount = parseFloat(match[2].replace(',', '.'));
        currency = normalizeCurrency(match[1]);
      } else {
        amount = parseFloat(match[1].replace(',', '.'));
      }
      // Remove amount+currency from text to get merchant
      merchantParts = lower.replace(match[0], '').trim().split(/\s+/).filter(Boolean);
      break;
    }
  }

  if (!amount || amount <= 0) return null;

  const merchant = merchantParts.join(' ').replace(/^[-,.\s]+|[-,.\s]+$/g, '') || 'Unknown';
  const category = inferCategory(lower);

  return {
    id: generateId(),
    type: isIncome ? 'income' : 'expense',
    merchant: capitalize(merchant),
    amount,
    currency,
    category: isIncome ? 'income' : category,
    date: new Date().toISOString().split('T')[0],
    description: `Via Telegram: ${text}`,
    source: 'telegram',
    tags: [],
    createdAt: new Date().toISOString(),
  };
}

function normalizeCurrency(str) {
  const lower = str.toLowerCase();
  if (lower === 'lei' || lower === 'ron') return 'RON';
  if (lower === 'eur' || lower === 'euro' || lower === '€') return 'EUR';
  if (lower === 'usd' || lower === '$') return 'USD';
  if (lower === 'gbp' || lower === '£') return 'GBP';
  return 'RON';
}

function inferCategory(text) {
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) return cat;
  }
  return 'other';
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Format currency for display
function formatAmount(amount, currency) {
  if (currency === 'RON') return `${amount.toFixed(2)} lei`;
  if (currency === 'EUR') return `€${amount.toFixed(2)}`;
  if (currency === 'USD') return `$${amount.toFixed(2)}`;
  if (currency === 'GBP') return `£${amount.toFixed(2)}`;
  return `${amount.toFixed(2)} ${currency}`;
}

// Send message via Telegram API
async function sendTelegramMessage(botToken, chatId, text, options = {}) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML', ...options };
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// Category emoji map
const CAT_EMOJI = {
  groceries: '🛒', dining: '🍽', transport: '🚗', shopping: '🛍',
  health: '💊', subscriptions: '📺', utilities: '💡', entertainment: '🎬',
  education: '📚', travel: '✈️', housing: '🏠', personal: '👤',
  gifts: '🎁', income: '💰', transfer: '🔄', other: '📦',
  insurance: '🛡', pets: '🐾', savings: '🏦',
};

export function registerTelegramRoutes(router) {
  // POST /telegram/webhook — handle Telegram updates
  router.post('/telegram/webhook', async (ctx) => {
    // Validate webhook secret token if configured
    const secretToken = ctx.env.TELEGRAM_WEBHOOK_SECRET;
    if (secretToken) {
      const headerSecret = ctx.request.headers.get('x-telegram-bot-api-secret-token');
      if (headerSecret !== secretToken) {
        return json({ error: 'Unauthorized' }, 403);
      }
    }

    const update = ctx.body;
    if (!update?.message?.text) return json({ ok: true });

    const chatId = update.message.chat.id.toString();
    const text = update.message.text.trim();
    const isPhoto = update.message.photo && update.message.photo.length > 0;

    // Find user by chatId (try quoted and unquoted)
    let settingRow = await ctx.env.DB.prepare(
      `SELECT userId FROM settings WHERE key = 'telegramChatId' AND value = ?`
    ).bind(JSON.stringify(chatId)).first();

    if (!settingRow) {
      settingRow = await ctx.env.DB.prepare(
        `SELECT userId FROM settings WHERE key = 'telegramChatId' AND value = ?`
      ).bind(chatId).first();
    }

    if (!settingRow) {
      const botToken = await getBotToken(ctx.env);
      if (botToken) {
        await sendTelegramMessage(botToken, chatId,
          `⚠️ Your Telegram is not linked to BudgetPilot.\n\nYour Chat ID: <code>${chatId}</code>\n\nPaste this in Settings → Telegram → Chat ID in the app.`
        );
      }
      return json({ ok: true });
    }

    const userId = settingRow.userId;
    const botToken = await getBotToken(ctx.env);
    if (!botToken) return json({ ok: true });

    // Handle commands
    if (text.startsWith('/')) {
      return handleCommand(ctx, botToken, chatId, userId, text);
    }

    // Parse expense text
    const tx = parseExpenseText(text);
    if (!tx) {
      await sendTelegramMessage(botToken, chatId,
        "🤔 Couldn't parse that. Try:\n<code>45 lei Bolt taxi</code>\n<code>netflix 55 lei</code>\n<code>salary 8000 lei</code>"
      );
      return json({ ok: true });
    }

    // Save transaction
    tx.userId = userId;
    tx.updatedAt = new Date().toISOString();

    const columns = Object.keys(tx);
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(c => typeof tx[c] === 'object' ? JSON.stringify(tx[c]) : tx[c]);

    await ctx.env.DB.prepare(
      `INSERT INTO transactions (${columns.join(', ')}) VALUES (${placeholders})`
    ).bind(...values).run();

    const emoji = CAT_EMOJI[tx.category] || '📦';
    const typeEmoji = tx.type === 'income' ? '💚' : '🔴';
    const sign = tx.type === 'income' ? '+' : '-';

    await sendTelegramMessage(botToken, chatId,
      `${typeEmoji} <b>${sign}${formatAmount(tx.amount, tx.currency)}</b>\n${emoji} ${tx.merchant} · ${tx.category}\n📅 ${tx.date}`
    );

    return json({ ok: true });
  });

  // POST /telegram/webhook/photo — handle receipt photos
  router.post('/telegram/webhook/photo', async (ctx) => {
    // Photo handling would require downloading the file and processing with AI
    // This is a placeholder for future implementation
    return json({ ok: true, message: 'Photo processing not yet available via Telegram' });
  });

  // GET /api/telegram/test — test bot token
  router.post('/api/telegram/test', async (ctx) => {
    const { botToken } = ctx.body;
    if (!botToken) return json({ error: 'Bot token required' }, 400);

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await res.json();
      if (data.ok) {
        return json({ ok: true, bot: data.result });
      }
      return json({ ok: false, error: data.description }, 400);
    } catch (err) {
      return json({ ok: false, error: err.message }, 500);
    }
  });

  // POST /api/telegram/set-webhook — set Telegram webhook URL
  router.post('/api/telegram/set-webhook', async (ctx) => {
    const { botToken, webhookUrl } = ctx.body;
    if (!botToken || !webhookUrl) return json({ error: 'Bot token and webhook URL required' }, 400);

    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl }),
      });
      const data = await res.json();
      return json(data);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  });
}

async function getBotToken(env) {
  // Try env var first, then check settings
  if (env.TELEGRAM_BOT_TOKEN) return env.TELEGRAM_BOT_TOKEN;

  // Check if any user has a bot token in settings
  const row = await env.DB.prepare(
    `SELECT value FROM settings WHERE key = 'telegramBotToken' LIMIT 1`
  ).first();

  if (row?.value) {
    try { return JSON.parse(row.value); } catch { return row.value; }
  }
  return null;
}

async function handleCommand(ctx, botToken, chatId, userId, text) {
  const cmd = text.split(' ')[0].toLowerCase();

  switch (cmd) {
    case '/start':
      await sendTelegramMessage(botToken, chatId,
        "👋 <b>Welcome to BudgetPilot!</b>\n\nI can track your expenses. Just send me a message like:\n\n" +
        "<code>45 lei Bolt taxi</code>\n<code>netflix 55 lei</code>\n<code>salary 8000 lei</code>\n\n" +
        "Commands:\n/today — Today's spending\n/month — This month summary\n/budget — Budget status\n/help — Show help"
      );
      break;

    case '/today': {
      const today = new Date().toISOString().split('T')[0];
      const result = await ctx.env.DB.prepare(
        `SELECT * FROM transactions WHERE userId = ? AND date = ? AND deletedAt IS NULL ORDER BY createdAt DESC`
      ).bind(userId, today).all();
      const txns = result.results || [];
      const total = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

      if (txns.length === 0) {
        await sendTelegramMessage(botToken, chatId, "📊 No transactions today.");
      } else {
        let msg = `📊 <b>Today's Spending</b>\n\n`;
        for (const tx of txns.slice(0, 10)) {
          const emoji = CAT_EMOJI[tx.category] || '📦';
          const sign = tx.type === 'income' ? '+' : '-';
          msg += `${emoji} ${sign}${formatAmount(tx.amount, tx.currency)} — ${tx.merchant}\n`;
        }
        msg += `\n<b>Total expenses: ${formatAmount(total, 'RON')}</b>`;
        await sendTelegramMessage(botToken, chatId, msg);
      }
      break;
    }

    case '/month': {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

      const result = await ctx.env.DB.prepare(
        `SELECT type, SUM(amount) as total, COUNT(*) as count FROM transactions WHERE userId = ? AND date >= ? AND date <= ? AND deletedAt IS NULL GROUP BY type`
      ).bind(userId, startOfMonth, endOfMonth).all();

      let expenses = 0, income = 0, count = 0;
      for (const row of result.results || []) {
        if (row.type === 'expense') { expenses = row.total; count += row.count; }
        if (row.type === 'income') { income = row.total; }
      }

      const net = income - expenses;
      await sendTelegramMessage(botToken, chatId,
        `📅 <b>Month Summary</b>\n\n` +
        `💰 Income: ${formatAmount(income, 'RON')}\n` +
        `💸 Expenses: ${formatAmount(expenses, 'RON')}\n` +
        `📊 Net: ${net >= 0 ? '+' : ''}${formatAmount(net, 'RON')}\n` +
        `📝 ${count} transactions`
      );
      break;
    }

    case '/budget': {
      const now = new Date();
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
      const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`;

      const [budgets, txResult] = await Promise.all([
        ctx.env.DB.prepare(`SELECT * FROM budgets WHERE userId = ?`).bind(userId).all(),
        ctx.env.DB.prepare(
          `SELECT category, SUM(amount) as total FROM transactions WHERE userId = ? AND type = 'expense' AND date >= ? AND date <= ? AND deletedAt IS NULL GROUP BY category`
        ).bind(userId, startOfMonth, endOfMonth).all(),
      ]);

      const spending = {};
      for (const row of txResult.results || []) { spending[row.category] = row.total; }

      if (!budgets.results?.length) {
        await sendTelegramMessage(botToken, chatId, "No budgets set. Create budgets in the app.");
        break;
      }

      let msg = `📋 <b>Budget Status</b>\n\n`;
      for (const b of budgets.results) {
        const spent = spending[b.category] || 0;
        const pct = Math.round((spent / b.amount) * 100);
        const bar = progressBar(pct);
        const emoji = CAT_EMOJI[b.category] || '📦';
        msg += `${emoji} ${b.category}: ${bar} ${pct}%\n   ${formatAmount(spent, 'RON')} / ${formatAmount(b.amount, 'RON')}\n`;
      }
      await sendTelegramMessage(botToken, chatId, msg);
      break;
    }

    case '/help':
      await sendTelegramMessage(botToken, chatId,
        "📖 <b>BudgetPilot Help</b>\n\n" +
        "Send any expense in natural language:\n" +
        "<code>45 lei Bolt taxi</code>\n" +
        "<code>netflix 55 lei</code>\n" +
        "<code>salary 8000 lei</code>\n" +
        "<code>25 eur coffee shop</code>\n\n" +
        "Commands:\n" +
        "/today — Today's spending\n" +
        "/month — Monthly summary\n" +
        "/budget — Budget status\n" +
        "/help — This help message"
      );
      break;

    default:
      // Treat as expense text
      return; // let it fall through to expense parsing
  }

  return json({ ok: true });
}

function progressBar(pct) {
  const filled = Math.min(Math.round(pct / 10), 10);
  const empty = 10 - filled;
  const color = pct >= 100 ? '🔴' : pct >= 80 ? '🟡' : '🟢';
  return '█'.repeat(filled) + '░'.repeat(empty) + ' ' + color;
}
