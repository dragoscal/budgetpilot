import { getSetting, add, getAll } from './storage';
import { MERCHANT_CATEGORY_MAP, CATEGORIES } from './constants';
import { generateId, formatDateISO } from './helpers';

// ─── ENHANCED RECEIPT SYSTEM PROMPT ───────────────────────
const RECEIPT_SYSTEM_PROMPT = `You are an expert receipt and expense parser for a Romanian budgeting app called BudgetPilot. You excel at reading receipts in any language (especially Romanian) and categorizing every item.

RECEIPT PARSING RULES:
- Romanian receipts: BON FISCAL = receipt, LEI/RON = currency, BUC = pieces, TVA = VAT, CIF = tax ID, dates DD.MM.YYYY
- Multi-currency: RON/lei, EUR/€, USD/$, GBP/£
- Always return amounts as POSITIVE numbers
- Dates: YYYY-MM-DD format
- Detect income vs expense: "salary", "salariu", "venit", "freelance" = income

STORE DETECTION — Identify the store type from the receipt header:
- Grocery stores: Lidl, Kaufland, Carrefour, Mega Image, Auchan, Profi, Penny, Cora, Selgros
- Pharmacies: Farmacia Tei, Catena, Sensiblu, Dona, HelpNet
- Restaurants: any restaurant, pizzeria, fast food, cafe
- Gas stations: Petrom/OMV, Rompetrol, MOL, Lukoil
- Electronics: eMAG, Altex, Flanco, Media Galaxy

ITEM-LEVEL CATEGORIZATION — For each item on the receipt, assign one of these categories:
${CATEGORIES.map((c) => `- ${c.id}: ${c.name} (${c.icon})`).join('\n')}

Common item→category mappings:
- Food items (bread, milk, meat, vegetables, fruit, cheese, eggs, pasta, rice, oil) → groceries
- Drinks (water, juice, soda, beer, wine) → groceries (if from store) or dining (if restaurant)
- Cleaning products (detergent, soap, bleach, sponges) → housing
- Personal care (shampoo, toothpaste, deodorant, razors, cream) → personal
- Baby items (diapers, baby food, formula) → personal
- Pet food, pet supplies → pets
- Medicine, vitamins, supplements → health
- Snacks, candy, chocolate → groceries
- Cigarettes, alcohol → personal
- Household (light bulbs, batteries, tools) → housing
- Stationery, school supplies → education
- Clothing → shopping

CONFIDENCE SCORING:
- 0.95+ = Very certain (clear text, known store, obvious category)
- 0.80-0.94 = Confident (readable, reasonable category match)
- 0.60-0.79 = Uncertain (blurry text, ambiguous item, guessed category)
- Below 0.60 = Low confidence (illegible, can't determine category — flag for review)

For each item, set "needsReview": true if confidence < 0.70 or category is ambiguous.

RETURN FORMAT:
{
  "receipt": {
    "store": "Store Name",
    "storeType": "grocery|pharmacy|restaurant|gas_station|electronics|clothing|other",
    "address": "Store address if visible",
    "date": "YYYY-MM-DD",
    "time": "HH:MM if visible",
    "receiptNumber": "Receipt/fiscal number if visible",
    "total": 123.45,
    "subtotal": 110.00,
    "tax": 13.45,
    "currency": "RON",
    "paymentMethod": "card|cash|unknown"
  },
  "transactions": [
    {
      "merchant": "Store Name",
      "amount": 123.45,
      "currency": "RON",
      "category": "groceries",
      "date": "YYYY-MM-DD",
      "type": "expense",
      "description": "Groceries from Store Name",
      "confidence": 0.95,
      "items": [
        {
          "name": "Product Name",
          "qty": 1,
          "price": 10.50,
          "unitPrice": 10.50,
          "category": "groceries",
          "confidence": 0.95,
          "needsReview": false
        }
      ]
    }
  ],
  "warnings": ["Any issues: blurry text, missing total, unreadable items"],
  "summary": "Brief human-readable summary of the receipt"
}

SPLITTING RULES:
- If a receipt has items from DIFFERENT categories (e.g., groceries + personal care + pet food), create SEPARATE transactions for each category group
- Each transaction's amount = sum of its items
- If all items are the same category, keep as ONE transaction
- Restaurant receipts: always one transaction (dining category)
- Gas station: fuel = transport, shop items = groceries/personal`;

// ─── NLP SYSTEM PROMPT ────────────────────────────────────
const NLP_SYSTEM_PROMPT = `You parse natural language expense/income inputs for a Romanian budgeting app.

Input examples: "45 lei bolt taxi", "netflix 55 lei", "salary 8000 lei", "150 lei dinner with friends", "25 eur coffee shop"

CATEGORIES: ${CATEGORIES.map((c) => `${c.id} (${c.name})`).join(', ')}

MERCHANT→CATEGORY: Lidl/Kaufland/Carrefour = groceries, Bolt/Uber = transport, Netflix/Spotify = subscriptions, Enel/Digi/Vodafone = utilities, restaurant/dinner/lunch = dining, salary/freelance = income

Return JSON:
{
  "transactions": [{
    "merchant": "Name",
    "amount": 45.00,
    "currency": "RON",
    "category": "transport",
    "date": "YYYY-MM-DD",
    "type": "expense",
    "description": "Brief note",
    "confidence": 0.9
  }]
}`;

// ─── API CALLER ───────────────────────────────────────────
async function callAnthropic(messages, systemPrompt, maxTokens = 4000) {
  const apiUrl = await getSetting('apiUrl');
  const anthropicKey = await getSetting('anthropicApiKey');

  if (apiUrl) {
    const res = await fetch(`${apiUrl}/api/ai/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, system: systemPrompt, maxTokens }),
    });
    if (!res.ok) throw new Error('AI processing failed via API');
    return res.json();
  }

  if (!anthropicKey) {
    throw new Error('No Anthropic API key configured. Go to Settings to add your API key.');
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': anthropicKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error?.message || `Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text || '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response');
  return JSON.parse(jsonMatch[0]);
}

// ─── RECEIPT PROCESSING ───────────────────────────────────
export async function processReceipt(imageBase64, mediaType = 'image/jpeg') {
  const result = await callAnthropic([
    {
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType, data: imageBase64 },
        },
        {
          type: 'text',
          text: 'Parse this receipt completely. Extract every item with its price and category. If items belong to different categories, split into separate transactions. Flag any items you\'re unsure about with needsReview: true. Return the full JSON structure.',
        },
      ],
    },
  ], RECEIPT_SYSTEM_PROMPT, 4000);

  const normalized = normalizeReceiptResult(result);

  // Save to receipt history
  try {
    await saveReceiptHistory({
      imageBase64: imageBase64.substring(0, 200) + '...', // truncated for storage
      receipt: result.receipt || null,
      transactions: normalized.transactions,
      warnings: result.warnings || [],
      summary: result.summary || '',
      processedAt: new Date().toISOString(),
    });
  } catch (e) { /* silently fail */ }

  return normalized;
}

// ─── NLP PROCESSING ───────────────────────────────────────
export async function processNaturalLanguage(text) {
  const today = formatDateISO(new Date());
  const result = await callAnthropic([
    {
      role: 'user',
      content: `Parse this expense/income: "${text}". Today is ${today}. Return JSON.`,
    },
  ], NLP_SYSTEM_PROMPT, 1000);

  return normalizeNLPResult(result);
}

// ─── MONTHLY SUMMARY ──────────────────────────────────────
export async function generateMonthlySummary(transactions, budgets, goals) {
  const anthropicKey = await getSetting('anthropicApiKey');
  const apiUrl = await getSetting('apiUrl');

  if (!anthropicKey && !apiUrl) {
    return generateLocalSummary(transactions, budgets);
  }

  const result = await callAnthropic([
    {
      role: 'user',
      content: `Generate a brief, friendly monthly financial summary based on this data:

Transactions: ${JSON.stringify(transactions.slice(0, 50))}
Budgets: ${JSON.stringify(budgets)}
Goals: ${JSON.stringify(goals)}

Include: total spent, top categories, budget status, savings progress, tips. Keep it under 200 words. Return as plain text, not JSON.`,
    },
  ], 'You are a friendly financial advisor. Give concise, actionable financial summaries.', 500);

  return result.content?.[0]?.text || result.toString();
}

// ─── NORMALIZE RESULTS ────────────────────────────────────
function normalizeReceiptResult(result) {
  const receipt = result.receipt || {};
  const rawTxns = result.transactions || [result];

  const transactions = rawTxns.map((t) => {
    const items = (t.items || []).map((item) => ({
      name: item.name || 'Unknown item',
      qty: item.qty || 1,
      price: Math.abs(Number(item.price)) || 0,
      unitPrice: item.unitPrice || item.price || 0,
      category: item.category || t.category || 'other',
      confidence: item.confidence || t.confidence || 0.8,
      needsReview: item.needsReview || (item.confidence || 0.8) < 0.7,
    }));

    // Calculate how many items need review
    const reviewCount = items.filter(i => i.needsReview).length;
    const avgConfidence = items.length > 0
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length
      : t.confidence || 0.8;

    return {
      id: generateId(),
      merchant: t.merchant || receipt.store || 'Unknown',
      amount: Math.abs(Number(t.amount)) || items.reduce((s, i) => s + (i.price * i.qty), 0),
      currency: (t.currency || receipt.currency || 'RON').toUpperCase(),
      category: t.category || inferCategory(t.merchant || receipt.store),
      date: t.date || receipt.date || formatDateISO(new Date()),
      type: t.type || 'expense',
      description: t.description || `${items.length} items from ${t.merchant || receipt.store || 'receipt'}`,
      source: 'receipt',
      confidence: avgConfidence,
      needsReview: reviewCount > 0 || avgConfidence < 0.7,
      reviewCount,
      items,
      notes: t.notes || '',
      tags: [],
      userId: 'local',
      createdAt: new Date().toISOString(),
    };
  });

  return {
    transactions,
    receipt,
    warnings: result.warnings || [],
    summary: result.summary || '',
    hasItemsToReview: transactions.some(t => t.needsReview),
  };
}

function normalizeNLPResult(result) {
  const txns = result.transactions || [result];
  return txns.map((t) => ({
    id: generateId(),
    merchant: t.merchant || 'Unknown',
    amount: Math.abs(Number(t.amount)) || 0,
    currency: (t.currency || 'RON').toUpperCase(),
    category: t.category || inferCategory(t.merchant),
    date: t.date || formatDateISO(new Date()),
    type: t.type || 'expense',
    description: t.description || '',
    source: 'nlp',
    confidence: t.confidence || 0.8,
    items: [],
    notes: '',
    tags: [],
    userId: 'local',
    createdAt: new Date().toISOString(),
  }));
}

function inferCategory(merchant) {
  if (!merchant) return 'other';
  const lower = merchant.toLowerCase();
  for (const [key, cat] of Object.entries(MERCHANT_CATEGORY_MAP)) {
    if (lower.includes(key)) return cat;
  }
  return 'other';
}

function generateLocalSummary(transactions, budgets) {
  const total = transactions.reduce((s, t) => s + (t.type === 'expense' ? t.amount : 0), 0);
  const income = transactions.reduce((s, t) => s + (t.type === 'income' ? t.amount : 0), 0);
  const count = transactions.length;
  const daily = count > 0 ? total / new Date().getDate() : 0;
  return `This month: ${count} transactions totaling ${total.toFixed(2)} in expenses and ${income.toFixed(2)} in income. Daily average: ${daily.toFixed(2)}.`;
}

// ─── RECEIPT HISTORY ──────────────────────────────────────
async function saveReceiptHistory(receiptData) {
  await add('receipts', {
    id: generateId(),
    ...receiptData,
    userId: 'local',
  });
}

export async function getReceiptHistory() {
  const receipts = await getAll('receipts');
  return receipts.sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));
}
