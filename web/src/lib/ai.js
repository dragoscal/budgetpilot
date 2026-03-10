import { getSetting, add, getAll } from './storage';
import { MERCHANT_CATEGORY_MAP, CATEGORIES, SUBCATEGORIES, AI_PROVIDERS } from './constants';
import { generateId, formatDateISO } from './helpers';
import { extractHashtags } from './tagHelpers';

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

SUBCATEGORIES — When possible, also assign a subcategory for more detail:
${Object.entries(SUBCATEGORIES).map(([parentId, subs]) => `- ${parentId}: ${subs.map(s => `${s.id} (${s.name})`).join(', ')}`).join('\n')}

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
      "subcategory": "groceries:dairy",
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
          "subcategory": "groceries:dairy",
          "confidence": 0.95,
          "needsReview": false
        }
      ]
    }
  ],
  "warnings": ["Any issues: blurry text, missing total, unreadable items"],
  "summary": "Brief human-readable summary of the receipt"
}

CRITICAL AMOUNT RULES:
- The transaction "amount" MUST equal the TOTAL printed on the receipt (look for "Total", "Total general", "TOTAL", "De plata")
- When items are listed, transaction amount MUST equal the sum of (item.price × item.qty) — NEVER guess or fabricate a total
- If you see a "Total general" or similar line, use EXACTLY that number
- Double-check your math: sum the items and verify it matches the receipt total

ROMANIAN UTILITY BILLS ("Listă de întreținere" / "Cheltuieli întreținere"):
- These are monthly apartment maintenance bills, NOT regular store receipts
- Category = "housing" (not utilities or electricity)
- Merchant = the building administrator name (e.g. "Asociația de Proprietari", "Admin Locuinte X")
- Each line item (apă, energie, curățenie, lift, fond reparații, iluminat, etc.) is an item
- "Cota parte" = per-apartment share, "Nr persoane" = per-person share
- Use the TOTAL column values as item prices (the final amount per line, not unit price)
- The "Total general" at the bottom is the transaction total
- These are ALWAYS a single "housing" transaction — do NOT split into multiple transactions

SPLITTING RULES:
- If a receipt has items from DIFFERENT categories (e.g., groceries + personal care + pet food), create SEPARATE transactions for each category group
- Each transaction's amount = sum of its items
- If all items are the same category, keep as ONE transaction
- Restaurant receipts: always one transaction (dining category)
- Gas station: fuel = transport, shop items = groceries/personal
- Utility/maintenance bills: always ONE transaction (housing category)`;

// ─── NLP SYSTEM PROMPT ────────────────────────────────────
const NLP_SYSTEM_PROMPT = `You parse natural language expense/income inputs for a Romanian budgeting app.

Input examples: "45 lei bolt taxi", "netflix 55 lei", "salary 8000 lei", "150 lei dinner with friends", "25 eur coffee shop"

CATEGORIES: ${CATEGORIES.map((c) => `${c.id} (${c.name})`).join(', ')}

MERCHANT→CATEGORY: Lidl/Kaufland/Carrefour = groceries, Bolt/Uber = transport, Netflix/Spotify = subscriptions, Enel/Digi/Vodafone = utilities, restaurant/dinner/lunch = dining, salary/freelance = income

SUBCATEGORIES (use when clear from context):
${Object.entries(SUBCATEGORIES).map(([parentId, subs]) => `- ${parentId}: ${subs.map(s => s.id).join(', ')}`).join('\n')}
Examples: "coffee at starbucks" → dining, dining:cafe; "uber ride" → transport, transport:rideshare; "gym membership" → health, health:gym

Return JSON:
{
  "transactions": [{
    "merchant": "Name",
    "amount": 45.00,
    "currency": "RON",
    "category": "transport",
    "subcategory": "transport:rideshare",
    "date": "YYYY-MM-DD",
    "type": "expense",
    "description": "Brief note",
    "confidence": 0.9
  }]
}`;

// ─── THUMBNAIL GENERATION ────────────────────────────────
/**
 * Generate a small thumbnail from a base64 image for gallery display.
 * Returns a data URL (JPEG, ~200px wide). Falls back to null on error.
 */
async function generateThumbnail(base64Data, mediaType = 'image/jpeg') {
  try {
    const MAX_WIDTH = 200;
    const img = new Image();
    const src = `data:${mediaType};base64,${base64Data}`;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = src;
    });
    const scale = Math.min(MAX_WIDTH / img.width, 1);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.6);
  } catch {
    return null;
  }
}

// ─── JSON EXTRACTION (balanced braces) ──────────────────
function extractJSON(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return text.substring(start, i + 1);
    }
  }
  // JSON was truncated (unbalanced braces) — try to repair it
  const partial = text.substring(start);
  const repaired = repairTruncatedJSON(partial);
  if (repaired) return repaired;
  // Last resort: greedy regex
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

/**
 * Attempt to repair truncated JSON (e.g. from AI hitting max_tokens).
 * Closes any open strings, arrays, and objects to make it parseable.
 * Strips any trailing incomplete elements to avoid garbage data.
 */
function repairTruncatedJSON(text) {
  if (!text) return null;
  try {
    // Already valid
    JSON.parse(text);
    return text;
  } catch { /* needs repair */ }

  let repaired = text;

  // If we're in the middle of a string value, close it
  // Count unescaped quotes
  let inStr = false, escaped = false;
  let lastQuotePos = -1;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; lastQuotePos = i; }
  }
  if (inStr) {
    // We're inside an unclosed string — truncate to last complete value
    // Find the last complete key:value or array element before the open string
    repaired = repaired.substring(0, lastQuotePos);
  }

  // Remove any trailing comma or incomplete key-value
  repaired = repaired.replace(/,\s*$/, '');
  // Remove trailing partial key (e.g. `"merch` at end)
  repaired = repaired.replace(/,\s*"[^"]*$/, '');
  // Remove trailing colon after key with no value
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/, '');
  // Remove trailing incomplete value after colon (e.g. `"key": "val` or `"key": 12`)
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*[\d.]+$/, '');

  // Now close all open brackets and braces
  const stack = [];
  inStr = false;
  escaped = false;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inStr) { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // Close any trailing comma before closing brackets
  repaired = repaired.replace(/,\s*$/, '');

  // Append closing brackets/braces in reverse order
  while (stack.length > 0) {
    repaired += stack.pop();
  }

  try {
    JSON.parse(repaired);
    return repaired;
  } catch {
    return null;
  }
}

// ─── API CALLER (multi-provider) ─────────────────────────
async function callAI(messages, systemPrompt, maxTokens = 4000) {
  const apiUrl = (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';
  const provider = (await getSetting('aiProvider')) || 'anthropic';
  const model = await getSetting('aiModel');
  const providerConfig = AI_PROVIDERS.find(p => p.id === provider) || AI_PROVIDERS[0];
  const selectedModel = model || providerConfig.defaultModel;

  const apiKey = await getSetting(providerConfig.keyName);

  // If no client-side key, try server proxy (for Anthropic only)
  if (!apiKey && apiUrl && provider === 'anthropic') {
    const token = sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${apiUrl}/api/ai/process`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ messages, system: systemPrompt, maxTokens, model: selectedModel }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 403) {
        throw new Error(err.error || 'AI proxy access not granted. Add your own API key in Settings.');
      }
      throw new Error(err.error || 'AI processing failed via server');
    }
    const proxyResult = await res.json();
    // Server proxy returns raw Anthropic response — extract inner JSON
    const proxyText = proxyResult.content?.[0]?.text || (typeof proxyResult === 'string' ? proxyResult : JSON.stringify(proxyResult));
    const proxyJson = extractJSON(proxyText);
    if (proxyJson) return JSON.parse(proxyJson);
    return proxyResult;
  }

  if (!apiKey) {
    throw new Error(`No ${providerConfig.name} API key configured. Go to Settings to add it.`);
  }

  let text;

  if (provider === 'anthropic') {
    // Anthropic Messages API
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: selectedModel,
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
    text = data.content?.[0]?.text || '';
    // Detect if response was truncated due to max_tokens
    if (data.stop_reason === 'max_tokens') {
      console.warn('[AI] Response truncated (max_tokens reached). Attempting JSON repair.');
    }
  } else {
    // OpenAI-compatible API (OpenAI, OpenRouter)
    const baseUrl = provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    // Convert Anthropic-style messages to OpenAI format
    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => {
        if (typeof m.content === 'string') return { role: m.role, content: m.content };
        // Handle multimodal (image + text)
        return {
          role: m.role,
          content: m.content.map(part => {
            if (part.type === 'text') return { type: 'text', text: part.text };
            if (part.type === 'image') return {
              type: 'image_url',
              image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
            };
            // Convert Anthropic 'document' type to OpenAI-compatible format
            // OpenAI/OpenRouter don't support PDF documents natively via vision —
            // send as a text explanation that the PDF content should be extracted
            if (part.type === 'document') {
              return {
                type: 'image_url',
                image_url: { url: `data:${part.source.media_type};base64,${part.source.data}` },
              };
            }
            return part;
          }),
        };
      }),
    ];

    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };
    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'BudgetPilot';
    }

    const res = await fetch(baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: selectedModel,
        max_tokens: maxTokens,
        messages: openaiMessages,
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error?.message || `${providerConfig.name} API error: ${res.status}`);
    }
    const data = await res.json();
    text = data.choices?.[0]?.message?.content || '';
    // Detect if response was truncated due to max_tokens
    if (data.choices?.[0]?.finish_reason === 'length') {
      console.warn('[AI] Response truncated (max_tokens reached). Attempting JSON repair.');
    }
  }

  // Extract JSON using balanced brace matching (with truncation repair)
  const jsonStr = extractJSON(text);
  if (!jsonStr) throw new Error('Could not parse AI response — no valid JSON found. The response may have been truncated.');
  return JSON.parse(jsonStr);
}

// ─── RECEIPT PROCESSING ───────────────────────────────────
export async function processReceipt(imageBase64, mediaType = 'image/jpeg', { userId = 'local' } = {}) {
  const result = await callAI([
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

  const normalized = normalizeReceiptResult(result, userId);

  // Save to receipt history — store thumbnail for gallery, full image on demand
  try {
    const firstTx = normalized.transactions[0];
    const thumbnail = await generateThumbnail(imageBase64, mediaType);
    await saveReceiptHistory({
      imageData: imageBase64, // full base64 for detail view
      thumbnail,             // small thumbnail for gallery grid
      mediaType: mediaType,
      // Flat fields for gallery display (Receipts.jsx reads these directly)
      merchant: result.receipt?.store || firstTx?.merchant || 'Unknown',
      total: result.receipt?.total || firstTx?.amount || 0,
      currency: result.receipt?.currency || firstTx?.currency || 'RON',
      category: firstTx?.category || 'other',
      items: firstTx?.items || [],
      // Also keep structured data
      receipt: result.receipt || null,
      transactions: normalized.transactions,
      warnings: result.warnings || [],
      summary: result.summary || '',
      processedAt: new Date().toISOString(),
    }, userId);
  } catch (e) { /* silently fail */ }

  return normalized;
}

// ─── BANK STATEMENT PROCESSING ───────────────────────────
const BANK_STATEMENT_PROMPT = `You are an expert bank statement parser for a Romanian budgeting app called BudgetPilot. You extract individual transactions from PDF bank statements.

BANK STATEMENT RULES:
- Parse EVERY transaction from the statement — debits, credits, transfers, fees
- Romanian banks: BRD, BCR, ING, Raiffeisen, Banca Transilvania, CEC, UniCredit, OTP, Alpha Bank, Revolut, N26, Wise (TransferWise), George (BCR)
- Date format: convert any format to YYYY-MM-DD
- Amounts: always POSITIVE numbers. Use "type" to indicate expense/income
- Currency: detect from statement (RON/EUR/USD/GBP). Default RON if unclear
- Debits/withdrawals/payments = "expense", Credits/deposits/salary = "income"
- Transfer between own accounts = "transfer"

CATEGORIZATION — Assign categories based on merchant/description:
${CATEGORIES.map((c) => `- ${c.id}: ${c.name}`).join('\n')}

COMMON MERCHANT MAPPINGS:
- POS/card payments at stores → groceries/shopping/etc based on store name
- ATM withdrawal → "other" (cash withdrawal)
- Salary/salariu/venit → income
- Netflix/Spotify/YouTube/Apple/Disney+/HBO → subscriptions
- Blizzard/Steam/Xbox/PlayStation → entertainment
- Microsoft 365/Google One → subscriptions
- Enel/Engie/Digi/RCS-RDS/Vodafone/Orange/Focus Sat → utilities
- Bolt/Uber/FreeNow → transport (rideshare)
- Glovo/Tazz/Bolt Food/Wolt → dining (food delivery)
- OMV/Petrom/Rompetrol/MOL/Lukoil → transport (fuel)
- Mega Image/Lidl/Kaufland/Carrefour/Auchan/Profi/Penny → groceries
- Bank fees/comision → "other" (bank fee)
- Loan payment/rata credit → "other" (loan payment)
- Insurance/asigurare → insurance
- Interest/dobanda → income (if credit) or "other" (if debit)
- "To pocket" / savings transfers → transfer (internal savings)
- Apple Pay top-up / card top-up → transfer (funding)
- Revolut/Wise transfers between people → transfer

REVOLUT-SPECIFIC:
- "To pocket RON Myself from RON" = internal savings transfer — type: "transfer", category: "savings"
- "Apple Pay top-up by *XXXX" = card funding — type: "income", category: "transfer"
- "Transfer to/from NAME" = person-to-person transfer — type: "expense"/"income", category: "transfer"
- POS payments at merchants → categorize by merchant name as usual
- Revolut currency exchange → type: "transfer", category: "other"

RETURN FORMAT:
{
  "bankName": "Bank Name",
  "accountNumber": "XXXX (last 4 digits only)",
  "statementPeriod": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "currency": "RON",
  "openingBalance": 1234.56,
  "closingBalance": 1234.56,
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "merchant": "Store/Company Name",
      "description": "Brief description",
      "amount": 45.00,
      "currency": "RON",
      "type": "expense",
      "category": "groceries",
      "subcategory": null,
      "confidence": 0.9,
      "reference": "optional transaction ref from statement"
    }
  ],
  "summary": "Brief summary: X transactions, Y expenses totaling Z, W income totaling V"
}

IMPORTANT:
- Include ALL transactions, even small fees
- Do NOT include opening/closing balance rows as transactions
- Merge multi-line descriptions into one transaction
- If a transaction description is unclear, set category to "other" and confidence low
- For card payments, extract the actual merchant name from "POS <merchant>" format`;

export async function processBankStatement(pdfBase64, { userId = 'local' } = {}) {
  const result = await callAI([
    {
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 },
        },
        {
          type: 'text',
          text: 'Parse this bank statement PDF completely. Extract EVERY transaction with date, merchant, amount, category. Return the full JSON structure with all transactions found.',
        },
      ],
    },
  ], BANK_STATEMENT_PROMPT, 16000);

  return normalizeBankStatementResult(result, userId);
}

function normalizeBankStatementResult(result, userId = 'local') {
  const txns = result.transactions || [];
  const today = formatDateISO(new Date());

  const normalized = txns.map((t) => ({
    id: generateId(),
    merchant: t.merchant || t.description || 'Unknown',
    amount: Math.abs(Number(t.amount)) || 0,
    currency: t.currency || result.currency || 'RON',
    category: t.category || 'other',
    subcategory: t.subcategory || null,
    date: t.date || today,
    type: t.type || 'expense',
    description: t.description || '',
    source: 'bank_statement',
    confidence: t.confidence || 0.7,
    needsReview: (t.confidence || 0.7) < 0.7,
    reference: t.reference || null,
    userId,
    createdAt: new Date().toISOString(),
  }));

  return {
    transactions: normalized,
    bankInfo: {
      bankName: result.bankName || 'Unknown Bank',
      accountNumber: result.accountNumber || '',
      period: result.statementPeriod || null,
      currency: result.currency || 'RON',
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
    },
    summary: result.summary || `${normalized.length} transactions extracted`,
    hasItemsToReview: normalized.some((t) => t.needsReview),
    warnings: [],
  };
}

// ─── NLP PROCESSING ───────────────────────────────────────
export async function processNaturalLanguage(text, { userId = 'local' } = {}) {
  // Extract #hashtags before sending to AI
  const { cleanText, tags: extractedTags } = extractHashtags(text);
  const inputText = cleanText || text;

  const today = formatDateISO(new Date());
  const result = await callAI([
    {
      role: 'user',
      content: `Parse this expense/income: "${inputText}". Today is ${today}. Return JSON.`,
    },
  ], NLP_SYSTEM_PROMPT, 1000);

  const normalized = normalizeNLPResult(result, userId);

  // Merge extracted #tags into each transaction's tags
  if (extractedTags.length > 0) {
    return normalized.map((t) => ({
      ...t,
      tags: [...new Set([...(t.tags || []), ...extractedTags])],
    }));
  }

  return normalized;
}

// ─── MONTHLY SUMMARY ──────────────────────────────────────
export async function generateMonthlySummary(transactions, budgets, goals) {
  const provider = (await getSetting('aiProvider')) || 'anthropic';
  const providerConfig = AI_PROVIDERS.find(p => p.id === provider) || AI_PROVIDERS[0];
  const aiKey = await getSetting(providerConfig.keyName);
  const apiUrl = (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';

  if (!aiKey && !apiUrl) {
    return generateLocalSummary(transactions, budgets);
  }

  const result = await callAI([
    {
      role: 'user',
      content: `Generate a brief, friendly monthly financial summary based on this data:

Transactions: ${JSON.stringify(transactions.slice(0, 50))}
Budgets: ${JSON.stringify(budgets)}
Goals: ${JSON.stringify(goals)}

Include: total spent, top categories, budget status, savings progress, tips. Keep it under 200 words.
Return as JSON: { "summary": "your summary text here" }`,
    },
  ], 'You are a friendly financial advisor. Give concise, actionable financial summaries. Always return valid JSON with a "summary" key.', 500);

  return result.summary || result.text || (typeof result === 'string' ? result : JSON.stringify(result));
}

// ─── NORMALIZE RESULTS ────────────────────────────────────
function normalizeReceiptResult(result, userId = 'local') {
  const receipt = result.receipt || {};
  const rawTxns = result.transactions || [result];

  const transactions = rawTxns.map((t) => {
    const items = (t.items || []).map((item) => ({
      name: item.name || 'Unknown item',
      qty: item.qty || 1,
      price: Math.abs(Number(item.price)) || 0,
      unitPrice: item.unitPrice || item.price || 0,
      category: item.category || t.category || 'other',
      subcategory: item.subcategory || null,
      confidence: item.confidence || t.confidence || 0.8,
      needsReview: item.needsReview || (item.confidence || 0.8) < 0.7,
    }));

    // Calculate how many items need review
    const reviewCount = items.filter(i => i.needsReview).length;
    const avgConfidence = items.length > 0
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length
      : t.confidence || 0.8;

    // Amount validation: prefer items sum when items exist, fallback to AI amount
    const aiAmount = Math.abs(Number(t.amount)) || 0;
    // price = line total as printed on receipt (already qty × unit price)
    // Only multiply by qty if item has a unitPrice that differs from price (meaning price IS the unit price)
    const itemsTotal = items.reduce((s, i) => {
      if (i.unitPrice && i.unitPrice !== i.price && i.qty > 1) {
        return s + (i.unitPrice * i.qty);
      }
      return s + i.price;
    }, 0);
    const receiptTotal = Math.abs(Number(receipt.total)) || 0;

    let amount;
    if (items.length > 0 && itemsTotal > 0) {
      // When items exist, use items sum — it's more reliable than AI's total
      // But cross-check: if AI amount is very close to items total, trust it
      const aiCloseToItems = aiAmount > 0 && Math.abs(aiAmount - itemsTotal) / itemsTotal < 0.02;
      amount = aiCloseToItems ? aiAmount : itemsTotal;
    } else {
      amount = aiAmount || receiptTotal;
    }

    return {
      id: generateId(),
      merchant: t.merchant || receipt.store || 'Unknown',
      amount,
      receiptTotal: receiptTotal || aiAmount, // store original for mismatch display
      currency: (t.currency || receipt.currency || 'RON').toUpperCase(),
      category: t.category || inferCategory(t.merchant || receipt.store),
      subcategory: t.subcategory || null,
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
      userId,
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

function normalizeNLPResult(result, userId = 'local') {
  const txns = result.transactions || [result];
  return txns.map((t) => ({
    id: generateId(),
    merchant: t.merchant || 'Unknown',
    amount: Math.abs(Number(t.amount)) || 0,
    currency: (t.currency || 'RON').toUpperCase(),
    category: t.category || inferCategory(t.merchant),
    subcategory: t.subcategory || null,
    date: t.date || formatDateISO(new Date()),
    type: t.type || 'expense',
    description: t.description || '',
    source: 'nlp',
    confidence: t.confidence || 0.8,
    items: [],
    notes: '',
    tags: [],
    userId,
    createdAt: new Date().toISOString(),
  }));
}

function inferCategory(merchant) {
  if (!merchant) return 'other';
  const lower = merchant.toLowerCase();
  // Sort by key length descending so "bolt food" matches before "bolt"
  const entries = Object.entries(MERCHANT_CATEGORY_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [key, cat] of entries) {
    // For short keys (≤3 chars like "kfc", "mol", "omv"), require word boundary
    // to avoid false matches (e.g., "mol" inside "Moldova")
    if (key.length <= 3) {
      const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) return cat;
    } else {
      if (lower.includes(key)) return cat;
    }
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
async function saveReceiptHistory(receiptData, userId = 'local') {
  await add('receipts', {
    id: generateId(),
    ...receiptData,
    userId,
  });
}

export async function getReceiptHistory() {
  const receipts = await getAll('receipts');
  return receipts.sort((a, b) => (b.processedAt || '').localeCompare(a.processedAt || ''));
}
