import { getSetting, add, getAll } from './storage';
import { MERCHANT_CATEGORY_MAP, CATEGORIES, SUBCATEGORIES, AI_PROVIDERS } from './constants';
import { getCustomCategories } from './categoryManager';
import { generateId, formatDateISO } from './helpers';
import { extractHashtags } from './tagHelpers';

// ─── ENHANCED RECEIPT SYSTEM PROMPT ───────────────────────
function buildReceiptPrompt(customCats = []) {
  const allSubs = { ...SUBCATEGORIES };
  for (const c of customCats) { if (c.subcategories?.length) allSubs[c.id] = c.subcategories; }
  return `You are an expert receipt and expense parser for a Romanian budgeting app called LUMET. You excel at reading receipts in any language (especially Romanian) and categorizing every item.

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
${[...CATEGORIES, ...customCats].map((c) => `- ${c.id}: ${c.name} (${c.icon})`).join('\n')}

SUBCATEGORIES — When possible, also assign a subcategory for more detail:
${Object.entries(allSubs).map(([parentId, subs]) => `- ${parentId}: ${subs.map(s => `${s.id} (${s.name})`).join(', ')}`).join('\n')}
${customCats.length > 0 ? '\nCUSTOM CATEGORY KEYWORDS (user-defined — prefer these when item keywords match):\n' + customCats.map(c => `- ${c.id} (${c.name}): ${(c.keywords || []).join(', ')}${c.description ? ' — ' + c.description : ''}`).join('\n') : ''}

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

DISCOUNT HANDLING:
- If a receipt shows discounts (reducere, discount, cupon, promoție, card fidelitate, -X.XX LEI), include them as items with NEGATIVE prices
- Discount item name MUST start with "Reducere:" or "Discount:" prefix (e.g., "Reducere: Card fidelitate", "Discount: Promoție 2+1")
- price field: use NEGATIVE number for discounts (e.g., -2.50)
- The transaction total (amount) should be the NET amount AFTER all discounts are applied
- Category: same as the discounted product if identifiable, otherwise "other"

SPLITTING RULES:
- If a receipt has items from DIFFERENT categories (e.g., groceries + personal care + pet food), create SEPARATE transactions for each category group
- Each transaction's amount = sum of its items (including negative discount items)
- If all items are the same category, keep as ONE transaction
- Restaurant receipts: always one transaction (dining category)
- Gas station: fuel = transport, shop items = groceries/personal
- Utility/maintenance bills: always ONE transaction (housing category)`;
}

// ─── NLP SYSTEM PROMPT ────────────────────────────────────
function buildNLPPrompt(customCats = []) {
  const allSubs = { ...SUBCATEGORIES };
  for (const c of customCats) { if (c.subcategories?.length) allSubs[c.id] = c.subcategories; }
  return `You parse natural language expense/income inputs for a Romanian budgeting app.

Input examples: "45 lei bolt taxi", "netflix 55 lei", "salary 8000 lei", "150 lei dinner with friends", "25 eur coffee shop"

CATEGORIES: ${[...CATEGORIES, ...customCats].map((c) => `${c.id} (${c.name})`).join(', ')}

MERCHANT vs DESCRIPTION — CRITICAL DISTINCTION:
- "merchant" = a STORE, COMPANY, or BRAND name (Lidl, Bolt, Netflix, KFC, Starbucks, Emag, etc.)
- "description" = what was purchased — a PRODUCT, FOOD ITEM, or GENERIC purchase
- If the input only has a product/food name WITHOUT a store name, set merchant to "" (empty) and put the product in description
- Romanian food/product words are NOT merchants: paine (bread), lapte (milk), pui (chicken), carne (meat), legume (vegetables), fructe (fruits), benzina (fuel), cafea (coffee), bere (beer), apa (water), medicamente (medicine), haine (clothes), etc.

Examples:
- "50 lei paine" → merchant: "", description: "Paine", category: "groceries", subcategory: "groceries:bakery"
- "30 lei lapte si oua" → merchant: "", description: "Lapte si oua", category: "groceries", subcategory: "groceries:dairy"
- "200 lei benzina" → merchant: "", description: "Benzina", category: "transport", subcategory: "transport:fuel"
- "45 lei bolt taxi" → merchant: "Bolt", description: "Taxi", category: "transport", subcategory: "transport:rideshare"
- "100 lei lidl cumparaturi" → merchant: "Lidl", description: "Cumparaturi", category: "groceries"
- "netflix 55 lei" → merchant: "Netflix", description: "", category: "subscriptions", subcategory: "subscriptions:streaming"

MERCHANT→CATEGORY: Lidl/Kaufland/Carrefour/Mega Image/Auchan/Profi/Penny = groceries, Bolt/Uber = transport, Netflix/Spotify = subscriptions, Enel/Digi/Vodafone = utilities, restaurant/dinner/lunch = dining, salary/freelance = income

SUBCATEGORIES (use when clear from context):
${Object.entries(allSubs).map(([parentId, subs]) => `- ${parentId}: ${subs.map(s => s.id).join(', ')}`).join('\n')}
${customCats.length > 0 ? '\nCUSTOM CATEGORY KEYWORDS (user-defined — PREFER these when input matches keywords):\n' + customCats.map(c => `- ${c.id} (${c.name}): ${(c.keywords || []).join(', ')}${c.description ? ' — ' + c.description : ''}`).join('\n') : ''}
Examples: "coffee at starbucks" → dining, dining:cafe; "uber ride" → transport, transport:rideshare; "gym membership" → health, health:gym
Romanian product → subcategory: paine/covrigi/corn = groceries:bakery, lapte/iaurt/branza/smantana/oua = groceries:dairy, pui/carne/peste = groceries:meat, legume/fructe/rosii/cartofi = groceries:produce, cafea = dining:cafe, benzina/motorina = transport:fuel, farmacie/medicamente = health:pharmacy

FAMILY MEMBER DETECTION:
If the input starts with or contains a person's NAME (Romanian names like Ioana, Andrei, Maria, Titi, Ana, Mihai, etc.) followed by amount+description, that person PAID this expense. Set "paidBy" to the person's name.
Examples: "Ioana 100 lei paine" → paidBy: "Ioana", merchant: "", description: "Paine", amount: 100, category: "groceries", subcategory: "groceries:bakery"
"Andrei 50 lei benzina" → paidBy: "Andrei", merchant: "", description: "Benzina", category: "transport", subcategory: "transport:fuel"

DEBT/LOAN DETECTION (Romanian: "datorie", "imprumut", "datorez", "mi-a dat", "i-am dat"):
If input contains debt keywords + a person name + amount, it's a debt entry. Set "isDebt": true and "debtTo": person name.
Examples: "datorie titi 100 ron mancare kfc" → isDebt: true, debtTo: "Titi", merchant: "KFC", category: "dining"
"imprumut ana 500 lei" → isDebt: true, debtTo: "Ana"

Return JSON:
{
  "transactions": [{
    "merchant": "Store/Brand or empty string",
    "amount": 45.00,
    "currency": "RON",
    "category": "transport",
    "subcategory": "transport:rideshare",
    "date": "YYYY-MM-DD",
    "type": "expense",
    "description": "Brief note or product name",
    "confidence": 0.9,
    "paidBy": null,
    "isDebt": false,
    "debtTo": null
  }]
}`;
}

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
  } catch (err) {
    // Image resize is optional — return null to use original
    console.error('Image resize failed:', err);
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
  } catch {
    // Intentionally swallowed — invalid JSON falls through to repair logic below
  }

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
    // Intentionally swallowed — repair failed, return null to signal unrecoverable JSON
    return null;
  }
}

// ─── SSE Stream Reader (for proxy streaming responses) ───
// Protocol: proxy sends {t:"text chunk"} for deltas, {d:true} when done, {error:"msg"} on error.
// Client collects all text chunks and returns parsed JSON.
async function readSSEStream(response, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  const MAX_STREAM_SIZE = 5 * 1024 * 1024; // 5MB safety limit on accumulated text

  try {
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (signal?.aborted) { reader.cancel(); throw new DOMException('Aborted', 'AbortError'); }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const evt = JSON.parse(raw);
            if (evt.t) {
              fullText += evt.t;
              // Safety: prevent runaway memory usage
              if (fullText.length > MAX_STREAM_SIZE) {
                reader.cancel();
                throw new Error('AI response exceeded maximum size. Try a smaller document.');
              }
            } else if (evt.d) { /* done */ }
            else if (evt.error) throw new Error(evt.error);
          } catch (e) {
            if (e.message && !e.message.startsWith('Unexpected') && !e.message.startsWith('Expected')) throw e;
          }
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    if (!fullText) throw err;
    // If we have partial text, try to use it (stream broke but we got data)
    console.warn('SSE stream interrupted with partial data, attempting recovery...');
  }

  if (!fullText) throw new Error('No data received from AI stream');

  // Parse JSON from collected text (uses robust balanced-brace extraction)
  const jsonStr = extractJSON(fullText);
  if (jsonStr) return JSON.parse(jsonStr);

  return { content: [{ text: fullText }] };
}

// ─── API CALLER (multi-provider) ─────────────────────────
async function callAI(messages, systemPrompt, maxTokens = 4000, { signal } = {}) {
  const apiUrl = (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';
  const provider = (await getSetting('aiProvider')) || 'anthropic';
  const model = await getSetting('aiModel');
  const providerConfig = AI_PROVIDERS.find(p => p.id === provider) || AI_PROVIDERS[0];
  const selectedModel = model || providerConfig.defaultModel;

  // Create an abort controller that merges caller signal
  // No fixed timeout — streaming keeps connection alive
  const abortCtrl = new AbortController();
  if (signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    signal.addEventListener('abort', () => abortCtrl.abort(), { once: true });
  }
  const fetchSignal = abortCtrl.signal;

  const apiKey = await getSetting(providerConfig.keyName);

  try {
  // If no client-side key, try server proxy (for Anthropic only)
  if (!apiKey && apiUrl && provider === 'anthropic') {
    const token = sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${apiUrl}/api/ai/process`, {
      method: 'POST',
      headers,
      signal: fetchSignal,
      body: JSON.stringify({ messages, system: systemPrompt, maxTokens, model: selectedModel }),
    });
    if (!res.ok) {
      // Non-streaming error (auth failures, etc.)
      const err = await res.json().catch(() => ({}));
      if (res.status === 403) {
        throw new Error(err.error || 'AI proxy access not granted. Add your own API key in Settings.');
      }
      throw new Error(err.error || 'AI processing failed via server');
    }

    // Server returns SSE stream with text deltas — readSSEStream collects and parses
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('text/event-stream')) {
      return await readSSEStream(res, fetchSignal);
    }

    // Fallback: non-streaming JSON response (auth errors etc.)
    const proxyResult = await res.json();
    const proxyText = proxyResult.content?.[0]?.text || (typeof proxyResult === 'string' ? proxyResult : JSON.stringify(proxyResult));
    const proxyJson = extractJSON(proxyText);
    if (proxyJson) return JSON.parse(proxyJson);
    return proxyResult;
  }

  if (!apiKey) {
    throw new Error(`No ${providerConfig.name} API key configured. Go to Settings to add it.`);
  }

  // ─── Direct API calls (client-side key) ────────────────
  // Use a 3-minute timeout for direct calls (no streaming proxy to keep alive)
  const timeoutMs = 180000;
  const timeoutId = setTimeout(() => abortCtrl.abort(), timeoutMs);

  let text;

  try {
  if (provider === 'anthropic') {
    // Anthropic Messages API (direct, with streaming for large requests)
    const useStream = maxTokens > 4000;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: fetchSignal,
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
        ...(useStream ? { stream: true } : {}),
      }),
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error?.message || `Anthropic API error: ${res.status}`);
    }

    if (useStream) {
      // Read SSE stream from Anthropic directly
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      text = '';

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
              const evt = JSON.parse(raw);
              if (evt.type === 'content_block_delta' && evt.delta?.text) {
                text += evt.delta.text;
              }
            } catch { /* skip */ }
          }
        }
      }
    } else {
      const data = await res.json();
      text = data.content?.[0]?.text || '';
      if (data.stop_reason === 'max_tokens') {
        console.warn('[AI] Response truncated (max_tokens reached). Attempting JSON repair.');
      }
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
      headers['X-Title'] = 'LUMET';
    }

    const res = await fetch(baseUrl, {
      method: 'POST',
      signal: fetchSignal,
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
    if (data.choices?.[0]?.finish_reason === 'length') {
      console.warn('[AI] Response truncated (max_tokens reached). Attempting JSON repair.');
    }
  }
  } finally {
    clearTimeout(timeoutId);
  }

  // Extract JSON using balanced brace matching (with truncation repair)
  const jsonStr = extractJSON(text);
  if (!jsonStr) throw new Error('Could not parse AI response — no valid JSON found. The response may have been truncated.');
  return JSON.parse(jsonStr);

  } catch (err) {
    if (err.name === 'AbortError') {
      if (signal?.aborted) throw err;
      throw new Error('AI request timed out. Try a smaller document or simpler request.');
    }
    throw err;
  }
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
  ], buildReceiptPrompt(await getCustomCategories()), 4000);

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
  } catch (e) {
    // Receipt gallery save is non-critical — log but don't block the result
    console.error('Failed to save receipt to gallery:', e);
  }

  return normalized;
}

// ─── BANK STATEMENT PROCESSING ───────────────────────────
function buildBankStatementPrompt(customCats = []) {
  return `You are an expert bank statement parser for a Romanian budgeting app called LUMET. You extract individual transactions from PDF bank statements.

BANK STATEMENT RULES:
- Parse EVERY transaction from the statement — debits, credits, transfers, fees
- Romanian banks: BRD, BCR, ING, Raiffeisen, Banca Transilvania, CEC, UniCredit, OTP, Alpha Bank, Revolut, N26, Wise (TransferWise), George (BCR)
- Date format: convert any format to YYYY-MM-DD
- Amounts: always POSITIVE numbers. Use "type" to indicate expense/income
- Currency: detect from statement (RON/EUR/USD/GBP). Default RON if unclear
- Debits/withdrawals/payments = "expense", Credits/deposits/salary = "income"
- Transfer between own accounts = "transfer"

CATEGORIZATION — Assign categories based on merchant/description:
${[...CATEGORIES, ...customCats].map((c) => `- ${c.id}: ${c.name}`).join('\n')}
${customCats.length > 0 ? '\nCUSTOM CATEGORY KEYWORDS (user-defined — prefer these when merchant/description matches keywords):\n' + customCats.map(c => `- ${c.id} (${c.name}): ${(c.keywords || []).join(', ')}${c.description ? ' — ' + c.description : ''}`).join('\n') : ''}

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
}

export async function processBankStatement(pdfBase64, { userId = 'local', signal } = {}) {
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
  ], buildBankStatementPrompt(await getCustomCategories()), 16000, { signal });

  return normalizeBankStatementResult(result, userId);
}

function normalizeBankStatementResult(result, userId = 'local') {
  if (!result || typeof result !== 'object') {
    return { transactions: [], bankInfo: { bankName: 'Unknown Bank', accountNumber: '', period: null, currency: 'RON' }, summary: '0 transactions extracted', hasItemsToReview: false, warnings: ['AI returned invalid response'] };
  }

  const txns = Array.isArray(result.transactions) ? result.transactions : [];
  const today = formatDateISO(new Date());
  const warnings = [];

  // Validate date format helper
  const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);

  const normalized = txns
    .filter((t) => {
      // Filter out transactions with no usable data
      if (!t || typeof t !== 'object') return false;
      const amt = Number(t.amount);
      if (isNaN(amt) || amt === 0) return false;
      return true;
    })
    .map((t) => {
      const amount = Math.abs(Number(t.amount));
      const date = (t.date && isValidDate(t.date)) ? t.date : today;
      const confidence = typeof t.confidence === 'number' ? Math.min(1, Math.max(0, t.confidence)) : 0.7;

      // Flag if date was invalid
      if (t.date && !isValidDate(t.date)) {
        warnings.push(`Invalid date "${t.date}" for ${t.merchant || 'unknown'}, using today`);
      }

      return {
        id: generateId(),
        merchant: String(t.merchant || t.description || 'Unknown').substring(0, 200),
        amount,
        currency: t.currency || result.currency || 'RON',
        category: t.category || 'other',
        subcategory: t.subcategory || null,
        date,
        type: t.type || 'expense',
        description: String(t.description || '').substring(0, 500),
        source: 'bank_statement',
        confidence,
        needsReview: confidence < 0.7,
        reference: t.reference || null,
        userId,
        createdAt: new Date().toISOString(),
      };
    });

  if (txns.length > 0 && normalized.length < txns.length) {
    warnings.push(`${txns.length - normalized.length} transactions dropped (zero amount or invalid data)`);
  }

  return {
    transactions: normalized,
    bankInfo: {
      bankName: result.bankName || 'Unknown Bank',
      accountNumber: result.accountNumber ? String(result.accountNumber).slice(-4) : '',
      period: result.statementPeriod || null,
      currency: result.currency || 'RON',
      openingBalance: result.openingBalance,
      closingBalance: result.closingBalance,
    },
    summary: result.summary || `${normalized.length} transactions extracted`,
    hasItemsToReview: normalized.some((t) => t.needsReview),
    warnings,
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
  ], buildNLPPrompt(await getCustomCategories()), 1000);

  const normalized = normalizeNLPResult(result, userId, text);

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
    // Calculate items total:
    // - If qty > 1 and unitPrice exists, total = unitPrice × qty
    // - If qty > 1 and no unitPrice, total = price × qty (price might be the unit price)
    // - If qty === 1 or missing, total = price (line total as-is)
    const itemsTotal = items.reduce((s, i) => {
      const qty = i.qty || 1;
      if (qty > 1) {
        // Use unitPrice if available, otherwise assume price is the unit price
        const unitPrice = i.unitPrice || i.price;
        return s + (unitPrice * qty);
      }
      return s + (i.price || 0);
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

function normalizeNLPResult(result, userId = 'local', originalText = '') {
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
    originalText: originalText || '',
    source: 'nlp',
    confidence: t.confidence || 0.8,
    items: [],
    notes: '',
    tags: [],
    // Family member / debt tracking from NLP
    paidBy: t.paidBy || null,
    isDebt: !!t.isDebt,
    debtTo: t.debtTo || null,
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

// ─── SPREADSHEET ANALYSIS ─────────────────────────────────

function buildSpreadsheetPrompt(customCats = []) {
  const allCatIds = [...CATEGORIES.map(c => c.id), ...customCats.map(c => c.id)];
  const customSection = customCats.length > 0
    ? `\n\nCUSTOM USER CATEGORIES (also map to these):\n${customCats.map(c => `- "${c.id}": ${c.name}${c.keywords?.length ? ` (keywords: ${c.keywords.join(', ')})` : ''}`).join('\n')}`
    : '';

  return `You are an expert spreadsheet parser for a Romanian budgeting app. You analyze household budget spreadsheets to detect their structure.

COMMON LAYOUTS:
1. "flat-table": Each row is one transaction/expense with columns like date, month, person, category, amount. This is the simplest and most common format.
2. "monthly-columns": Each month occupies a group of columns (person amounts + category name). Rows are categories. Pivot-table style.
3. "monthly-rows": Each row is a month, columns are categories.
4. "other": Any layout not matching above.

YOUR TASK:
Analyze the provided spreadsheet data (first ~40 rows as JSON grid) and detect which layout it uses, then return the appropriate structure.

RETURN FORMAT — depends on layout:

For "flat-table" layout (one row per transaction):
{
  "layout": "flat-table",
  "description": "Brief description",
  "headerRow": 0,
  "dataStartRow": 1,
  "columns": {
    "date": 0,
    "month": 1,
    "person": 2,
    "category": 3,
    "amount": 4
  },
  "months": [
    { "name": "Ianuarie", "monthNumber": 1 }
  ],
  "people": [
    { "name": "PersonName" }
  ],
  "categoryNames": ["category1", "category2"],
  "categoryMappingSuggestions": {
    "category1": "groceries",
    "category2": "dining"
  },
  "currency": "RON",
  "warnings": []
}

For "monthly-columns" layout (pivot table):
{
  "layout": "monthly-columns",
  "description": "Brief description",
  "headerRow": 0,
  "dataStartRow": 2,
  "months": [
    { "name": "Ianuarie", "monthNumber": 1, "startCol": 0 }
  ],
  "columnsPerMonth": 3,
  "people": [
    { "name": "PersonName", "columnOffset": 0 }
  ],
  "categoryColumnOffset": 1,
  "categoryNames": ["category1", "category2"],
  "categoryMappingSuggestions": {
    "category1": "groceries",
    "category2": "dining"
  },
  "currency": "RON",
  "warnings": []
}

FLAT-TABLE DETECTION — Choose "flat-table" when:
- Each row represents a single expense/transaction
- Columns include things like: date, month name, person name, category, amount
- The "columns" object maps semantic meaning to 0-based column indices
- "columns.date" and "columns.month" are optional (set to null if not present)
- "columns.person" is optional (set to null if single-person budget)

MONTHLY-COLUMNS FIELD DEFINITIONS:
- months[].startCol: First column index (0-based) of each month's column group
- columnsPerMonth: How many columns each month group spans
- people[].columnOffset: Offset within month group for this person's amount column
- categoryColumnOffset: Offset within month group for the category name column
- dataStartRow: First row index (0-based) with actual data

CATEGORY MAPPING — Map to these app categories:
${allCatIds.join(', ')}${customSection}

Common Romanian → English:
cumparaturi/mancare → groceries, bautura → dining, restaurant/iesit in oras → dining, utile/utilitati → utilities, chirie → housing, facturi → utilities, haine/imbracaminte → shopping, transport/uber → transport, bilete → transport, sanatate/medic/dentist/farmacie → health, cosmetice/manichiura/tuns → personal, divertisment/party → entertainment, educatie/carti → education, cadouri → gifts, abonamente/netflix/spotify → subscriptions, economii → savings, salariu/venit → income, cafea → dining, comanda mancare → dining, chirie + facturi → housing, utile masina → transport, tigari → personal, aspirator → shopping, orange → subscriptions, consultatie → health, capadoccia → travel, oana SMM → other

IMPORTANT:
- Cell data is: { "row": N, "cells": [...values...] }
- Empty cells are null
- Numbers may be European format (1.234,56)
- Return ONLY valid JSON, nothing else`;
}

export async function processSpreadsheetStructure(gridSample, { userId = 'local' } = {}) {
  const customCats = await getCustomCategories();
  const result = await callAI([
    {
      role: 'user',
      content: `Analyze this spreadsheet structure. The data is rows of cells in JSON format. Detect the layout pattern, months, people, categories, and amount locations.\n\nGrid data:\n${gridSample}`,
    },
  ], buildSpreadsheetPrompt(customCats), 4000);

  return result;
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
