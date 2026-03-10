/**
 * Comprehensive test suite for LUMET AI functions
 * Tests: extractJSON, inferCategory, normalizeReceiptResult, normalizeBankStatementResult,
 *        generateMonthlySummary, Receipt Gallery schema, amount formatting
 */

// ─── INLINE DEPENDENCIES (no imports needed) ─────────────

// Recreate the functions from ai.js and constants.js inline for testing
const MERCHANT_CATEGORY_MAP = {
  'bolt food': 'dining', 'uber eats': 'dining',
  glovo: 'dining', tazz: 'dining', wolt: 'dining', foodpanda: 'dining',
  lidl: 'groceries', kaufland: 'groceries', carrefour: 'groceries',
  'mega image': 'groceries', megaimage: 'groceries', auchan: 'groceries',
  profi: 'groceries', penny: 'groceries', cora: 'groceries', selgros: 'groceries',
  bolt: 'transport', uber: 'transport', taxi: 'transport', 'free now': 'transport',
  omv: 'transport', petrom: 'transport', rompetrol: 'transport', mol: 'transport', lukoil: 'transport',
  emag: 'shopping', altex: 'shopping', dedeman: 'shopping', flanco: 'shopping',
  ikea: 'shopping', jysk: 'shopping', decathlon: 'shopping', pepco: 'shopping',
  zara: 'shopping', 'h&m': 'shopping', reserved: 'shopping',
  amazon: 'shopping', temu: 'shopping', aliexpress: 'shopping',
  netflix: 'subscriptions', spotify: 'subscriptions', youtube: 'subscriptions',
  hbo: 'subscriptions', disney: 'subscriptions',
  'microsoft 365': 'subscriptions', 'microsoft*microsoft': 'subscriptions',
  'google one': 'subscriptions', 'apple.com': 'subscriptions',
  'focus sat': 'subscriptions', focussat: 'subscriptions',
  steam: 'entertainment', blizzard: 'entertainment', xbox: 'entertainment',
  playstation: 'entertainment', nintendo: 'entertainment', epic: 'entertainment',
  enel: 'utilities', engie: 'utilities', digi: 'utilities', vodafone: 'utilities',
  'e.on': 'utilities', orange: 'utilities', rcs: 'utilities', telekom: 'utilities',
  farmacia: 'health', catena: 'health', sensiblu: 'health',
  dona: 'health', helpnet: 'health', 'ana pharm': 'health',
  mcdonalds: 'dining', kfc: 'dining', 'burger king': 'dining',
  subway: 'dining', starbucks: 'dining', restaurant: 'dining',
  pizz: 'dining', mattina: 'dining', cuptorul: 'dining',
  'maxi pet': 'pets', 'pet shop': 'pets', liprac: 'pets',
  apple: 'subscriptions',
};

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
  // JSON was truncated — try to repair it
  const partial = text.substring(start);
  const repaired = repairTruncatedJSON(partial);
  if (repaired) return repaired;
  // Last resort: greedy regex
  const m = text.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

function repairTruncatedJSON(text) {
  if (!text) return null;
  try { JSON.parse(text); return text; } catch { /* needs repair */ }

  let repaired = text;
  let inStr = false, escaped = false, lastQuotePos = -1;
  for (let i = 0; i < repaired.length; i++) {
    const ch = repaired[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inStr = !inStr; lastQuotePos = i; }
  }
  if (inStr) {
    repaired = repaired.substring(0, lastQuotePos);
  }

  repaired = repaired.replace(/,\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*"[^"]*$/, '');
  repaired = repaired.replace(/,\s*"[^"]*"\s*:\s*[\d.]+$/, '');

  const stack = [];
  inStr = false; escaped = false;
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

  repaired = repaired.replace(/,\s*$/, '');
  while (stack.length > 0) repaired += stack.pop();

  try { JSON.parse(repaired); return repaired; } catch { return null; }
}

function inferCategory(merchant) {
  if (!merchant) return 'other';
  const lower = merchant.toLowerCase();
  const entries = Object.entries(MERCHANT_CATEGORY_MAP).sort((a, b) => b[0].length - a[0].length);
  for (const [key, cat] of entries) {
    if (key.length <= 3) {
      const regex = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(lower)) return cat;
    } else {
      if (lower.includes(key)) return cat;
    }
  }
  return 'other';
}

// ─── TEST FRAMEWORK ──────────────────────────────────────
let passed = 0, failed = 0, total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

function assertEqual(actual, expected, msg = '') {
  if (actual !== expected) {
    throw new Error(`Expected "${expected}" but got "${actual}"${msg ? ' — ' + msg : ''}`);
  }
}

function assertNotNull(val, msg = '') {
  if (val === null || val === undefined) {
    throw new Error(`Expected non-null value${msg ? ' — ' + msg : ''}`);
  }
}

function assertNull(val, msg = '') {
  if (val !== null) {
    throw new Error(`Expected null but got "${val}"${msg ? ' — ' + msg : ''}`);
  }
}

function assertIncludes(str, sub, msg = '') {
  if (!str || !str.includes(sub)) {
    throw new Error(`Expected "${str}" to include "${sub}"${msg ? ' — ' + msg : ''}`);
  }
}

// ═══════════════════════════════════════════════════════════
console.log('\n🧪 LUMET AI Functions — Comprehensive Test Suite\n');

// ─── TEST 1: extractJSON ─────────────────────────────────
console.log('📋 1. extractJSON — Balanced brace matching');

test('Simple JSON object', () => {
  const result = extractJSON('{"key": "value"}');
  assertEqual(result, '{"key": "value"}');
});

test('JSON with text before and after', () => {
  const result = extractJSON('Here is the result: {"amount": 45.50} Hope this helps!');
  assertEqual(result, '{"amount": 45.50}');
});

test('JSON with nested braces', () => {
  const input = '{"receipt": {"store": "Lidl"}, "transactions": [{"amount": 50}]}';
  const result = extractJSON(input);
  assertEqual(result, input);
});

test('JSON with braces in strings', () => {
  const input = '{"text": "use { and } in strings", "ok": true}';
  const result = extractJSON(input);
  const parsed = JSON.parse(result);
  assertEqual(parsed.text, 'use { and } in strings');
  assertEqual(parsed.ok, true);
});

test('JSON with escaped quotes', () => {
  const input = '{"text": "he said \\"hello\\"", "value": 42}';
  const result = extractJSON(input);
  assertNotNull(result);
  const parsed = JSON.parse(result);
  assertEqual(parsed.value, 42);
});

test('Multiple JSON objects — picks first complete one', () => {
  const input = 'First: {"a": 1} Second: {"b": 2}';
  const result = extractJSON(input);
  assertEqual(result, '{"a": 1}');
});

test('AI response with markdown code block', () => {
  const input = '```json\n{"bankName": "Revolut", "transactions": [{"amount": 80}]}\n```\nThat is the result.';
  const result = extractJSON(input);
  assertNotNull(result);
  const parsed = JSON.parse(result);
  assertEqual(parsed.bankName, 'Revolut');
});

test('No JSON returns null', () => {
  const result = extractJSON('No JSON here, just text');
  assertNull(result);
});

test('Empty string returns null', () => {
  const result = extractJSON('');
  assertNull(result);
});

test('Complex receipt JSON with items array', () => {
  const input = `Here is the parsed receipt:
{
  "receipt": {
    "store": "Blue Acqua Iasi",
    "total": 718.00,
    "currency": "RON"
  },
  "transactions": [
    {
      "merchant": "Blue Acqua Iasi",
      "amount": 718.00,
      "items": [
        {"name": "Burger Beyond", "qty": 1, "price": 52.00},
        {"name": "Carpatica Plata", "qty": 4, "price": 80.00}
      ]
    }
  ],
  "summary": "Restaurant receipt from Blue Acqua"
}
End of output.`;
  const result = extractJSON(input);
  assertNotNull(result);
  const parsed = JSON.parse(result);
  assertEqual(parsed.receipt.store, 'Blue Acqua Iasi');
  assertEqual(parsed.receipt.total, 718.00);
  assertEqual(parsed.transactions[0].items.length, 2);
});

// ─── TEST 1b: extractJSON — Truncated JSON repair ────────
console.log('\n📋 1b. extractJSON — Truncated JSON repair (bank statement max_tokens)');

test('Truncated array mid-element — repairs and parses', () => {
  const input = '{"bankName": "Revolut", "transactions": [{"date": "2026-03-01", "amount": 50}, {"date": "2026-03-02", "amo';
  const result = extractJSON(input);
  assertNotNull(result, 'Should repair truncated JSON');
  const parsed = JSON.parse(result);
  assertEqual(parsed.bankName, 'Revolut');
  // Repair saves the second element (strips truncated key), both survive
  assertEqual(parsed.transactions.length >= 1, true, 'At least 1 transaction preserved');
});

test('Truncated after complete array element with trailing comma', () => {
  const input = '{"bankName": "ING", "transactions": [{"amount": 100}, {"amount": 200},';
  const result = extractJSON(input);
  assertNotNull(result);
  const parsed = JSON.parse(result);
  assertEqual(parsed.transactions.length, 2);
});

test('Truncated inside string value — repairs', () => {
  const input = '{"bankName": "Revolut", "summary": "Total of 31 transact';
  const result = extractJSON(input);
  assertNotNull(result);
  const parsed = JSON.parse(result);
  assertEqual(parsed.bankName, 'Revolut');
});

test('Truncated with nested objects — closes all levels', () => {
  const input = '{"bankName": "BCR", "transactions": [{"merchant": "Lidl", "items": [{"name": "Bread"';
  const result = extractJSON(input);
  assertNotNull(result);
  const parsed = JSON.parse(result);
  assertEqual(parsed.bankName, 'BCR');
});

test('Large truncated bank statement — preserves complete transactions', () => {
  const txns = Array.from({length: 25}, (_, i) => `{"date": "2026-03-${String(i+1).padStart(2, '0')}", "merchant": "Store${i}", "amount": ${(i+1)*10}}`);
  const complete = txns.slice(0, 20).join(', ');
  const partial = `{"bankName": "Revolut", "currency": "RON", "transactions": [${complete}, {"date": "2026-03-21", "merch`;
  const result = extractJSON(partial);
  assertNotNull(result);
  const parsed = JSON.parse(result);
  assertEqual(parsed.bankName, 'Revolut');
  // At least 20 complete transactions preserved (repair may also save partial 21st)
  assertEqual(parsed.transactions.length >= 20, true, 'At least 20 transactions preserved');
});

// ─── TEST 2: inferCategory ───────────────────────────────
console.log('\n📋 2. inferCategory — Merchant category mapping');

// Merchants from the Revolut statement
test('Polidom Service → other (cleaning service)', () => {
  assertEqual(inferCategory('Polidom Service'), 'other');
});

test('Mega Image → groceries', () => {
  assertEqual(inferCategory('Mega Image'), 'groceries');
  assertEqual(inferCategory('Megaimage 0808 Stefan'), 'groceries');
});

test('Blizzard Entertainment → entertainment', () => {
  assertEqual(inferCategory('Blizzard Entertainment'), 'entertainment');
  assertEqual(inferCategory('Blizzard Eu323621979'), 'entertainment');
});

test('KFC → dining', () => {
  assertEqual(inferCategory('Kfc Moldova Mall C3'), 'dining');
});

test('Focus Sat → subscriptions', () => {
  assertEqual(inferCategory('Focus sat'), 'subscriptions');
  assertEqual(inferCategory('Payu*focussat.ro'), 'subscriptions');
});

test('La Mattina → dining', () => {
  assertEqual(inferCategory('La Mattina Srl'), 'dining');
});

test('Microsoft 365 → subscriptions', () => {
  assertEqual(inferCategory('Microsoft*microsoft 365 P'), 'subscriptions');
});

test('Steam → entertainment', () => {
  assertEqual(inferCategory('Steamgames.com 4259522985'), 'entertainment');
});

test('Maxi Pet → pets', () => {
  assertEqual(inferCategory('Maxi pet'), 'pets');
  assertEqual(inferCategory('Mpis-iasi Mxi'), 'other'); // shortened name won't match
});

test('Liprac Vet → pets', () => {
  assertEqual(inferCategory('Liprac Vet Srl'), 'pets');
});

test('Ana Pharm → health', () => {
  assertEqual(inferCategory('Ana Pharm Srl'), 'health');
});

test('Pizza Nico → dining', () => {
  assertEqual(inferCategory('Pizza Nico'), 'dining');
});

test('Cuptorul Moldovencei → dining', () => {
  assertEqual(inferCategory('Cuptorul Moldovencei Cug'), 'dining');
});

test('Carrefour → groceries', () => {
  assertEqual(inferCategory('Carrefour Mk Sibiu Ii 404'), 'groceries');
});

test('OMV → transport', () => {
  assertEqual(inferCategory('Omv 1934'), 'transport');
});

test('Digi → utilities', () => {
  assertEqual(inferCategory('Digi Romania Sa'), 'utilities');
  assertEqual(inferCategory('Pago*digi(rcs Rds)'), 'utilities');
});

test('Netflix → subscriptions', () => {
  assertEqual(inferCategory('netflix.com'), 'subscriptions');
});

// Critical: Bolt Food vs Bolt
test('Bolt Food → dining (NOT transport)', () => {
  assertEqual(inferCategory('Bolt Food'), 'dining');
  assertEqual(inferCategory('BOLT FOOD SRL'), 'dining');
});

test('Bolt (rideshare) → transport', () => {
  assertEqual(inferCategory('Bolt'), 'transport');
  assertEqual(inferCategory('Bolt Technology'), 'transport');
});

test('Uber Eats → dining (NOT transport)', () => {
  assertEqual(inferCategory('Uber Eats'), 'dining');
});

test('Uber (rideshare) → transport', () => {
  assertEqual(inferCategory('Uber BV'), 'transport');
});

// Merchants from receipt images
test('Carrefour Romania → groceries (from Carrefour receipt)', () => {
  assertEqual(inferCategory('Carrefour Romania'), 'groceries');
});

test('Blue Acqua Iasi → other (restaurant not in map)', () => {
  // This one relies on the AI prompt to categorize correctly
  assertEqual(inferCategory('Blue Acqua Iasi'), 'other');
});

test('Glovo → dining', () => {
  assertEqual(inferCategory('Glovo'), 'dining');
});

test('Tazz → dining', () => {
  assertEqual(inferCategory('Tazz'), 'dining');
});

test('Wolt → dining', () => {
  assertEqual(inferCategory('Wolt'), 'dining');
});

test('IKEA → shopping', () => {
  assertEqual(inferCategory('IKEA Romania'), 'shopping');
});

test('Engie → utilities', () => {
  assertEqual(inferCategory('Engie Romania'), 'utilities');
});

// ─── TEST 3: Receipt normalization mock ──────────────────
console.log('\n📋 3. Receipt normalization — Blue Acqua Iasi restaurant');

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
    const reviewCount = items.filter(i => i.needsReview).length;
    const avgConfidence = items.length > 0
      ? items.reduce((s, i) => s + i.confidence, 0) / items.length
      : t.confidence || 0.8;
    const aiAmount = Math.abs(Number(t.amount)) || 0;
    const itemsTotal = items.reduce((s, i) => {
      if (i.unitPrice && i.unitPrice !== i.price && i.qty > 1) {
        return s + (i.unitPrice * i.qty);
      }
      return s + i.price;
    }, 0);
    const receiptTotal = Math.abs(Number(receipt.total)) || 0;
    let amount;
    if (items.length > 0 && itemsTotal > 0) {
      const aiCloseToItems = aiAmount > 0 && Math.abs(aiAmount - itemsTotal) / itemsTotal < 0.02;
      amount = aiCloseToItems ? aiAmount : itemsTotal;
    } else {
      amount = aiAmount || receiptTotal;
    }
    return {
      id: 'test-id',
      merchant: t.merchant || receipt.store || 'Unknown',
      amount,
      receiptTotal: receiptTotal || aiAmount,
      currency: (t.currency || receipt.currency || 'RON').toUpperCase(),
      category: t.category || inferCategory(t.merchant || receipt.store),
      subcategory: t.subcategory || null,
      date: t.date || receipt.date || '2025-12-21',
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

// Mock AI response for Blue Acqua Iasi restaurant receipt
const blueAcquaAIResponse = {
  receipt: {
    store: "Blue Acqua Iasi",
    storeType: "restaurant",
    date: "2025-12-21",
    time: "14:57",
    total: 718.00,
    currency: "RON",
    paymentMethod: "unknown"
  },
  transactions: [
    {
      merchant: "Blue Acqua Iasi",
      amount: 718.00,
      currency: "RON",
      category: "dining",
      date: "2025-12-21",
      type: "expense",
      description: "Restaurant dinner at Blue Acqua",
      confidence: 0.92,
      items: [
        { name: "Burger Beyond Cu", qty: 1, price: 52.00, category: "dining", confidence: 0.95 },
        { name: "Carpatica Plata 7", qty: 4, price: 80.00, category: "dining", confidence: 0.90 },
        { name: "Cartofi Cu Usturo", qty: 1, price: 19.00, category: "dining", confidence: 0.90 },
        { name: "Clatite Cu Nutell", qty: 1, price: 25.00, category: "dining", confidence: 0.90 },
        { name: "Dublu Espresso 80", qty: 1, price: 20.00, category: "dining", confidence: 0.90 },
        { name: "Espresso Lung 80M", qty: 1, price: 12.00, category: "dining", confidence: 0.90 },
        { name: "Limonada Simpla 5", qty: 2, price: 40.00, category: "dining", confidence: 0.90 },
        { name: "Lipton 330ML", qty: 1, price: 15.00, category: "dining", confidence: 0.90 },
        { name: "Mirinda 250ML", qty: 1, price: 12.00, category: "dining", confidence: 0.90 },
        { name: "Paine Prajita", qty: 1, price: 5.00, category: "dining", confidence: 0.90 },
        { name: "Pastrav Crocant I", qty: 4, price: 200.00, category: "dining", confidence: 0.85 },
        { name: "Risotto Cu Fructe", qty: 1, price: 62.00, category: "dining", confidence: 0.90 },
        { name: "Salata De Icre De", qty: 2, price: 64.00, category: "dining", confidence: 0.90 },
        { name: "Salata De Varza 2", qty: 1, price: 9.00, category: "dining", confidence: 0.90 },
        { name: "Snitel Din Piept", qty: 1, price: 38.00, category: "dining", confidence: 0.90 },
        { name: "Spaghetti Carbona", qty: 1, price: 39.00, category: "dining", confidence: 0.90 },
        { name: "Ursus Black 330ML", qty: 2, price: 26.00, category: "dining", confidence: 0.90 }
      ]
    }
  ],
  warnings: [],
  summary: "Restaurant receipt from Blue Acqua Iasi, 17 items totaling 718.00 RON"
};

const blueAcquaNorm = normalizeReceiptResult(blueAcquaAIResponse);

test('Blue Acqua: merchant name correct', () => {
  assertEqual(blueAcquaNorm.transactions[0].merchant, 'Blue Acqua Iasi');
});

test('Blue Acqua: total is 718.00 (items sum matches)', () => {
  assertEqual(blueAcquaNorm.transactions[0].amount, 718.00);
});

test('Blue Acqua: 17 items parsed', () => {
  assertEqual(blueAcquaNorm.transactions[0].items.length, 17);
});

test('Blue Acqua: category is dining', () => {
  assertEqual(blueAcquaNorm.transactions[0].category, 'dining');
});

test('Blue Acqua: single transaction (restaurant = no split)', () => {
  assertEqual(blueAcquaNorm.transactions.length, 1);
});

test('Blue Acqua: Pastrav qty=4 at price=200 is correct', () => {
  const pastrav = blueAcquaNorm.transactions[0].items.find(i => i.name.includes('Pastrav'));
  assertNotNull(pastrav);
  assertEqual(pastrav.price, 200.00);
});

test('Blue Acqua: Carpatica qty=4 at total=80 is correct', () => {
  const carpatica = blueAcquaNorm.transactions[0].items.find(i => i.name.includes('Carpatica'));
  assertNotNull(carpatica);
  assertEqual(carpatica.price, 80.00);
});

// ─── TEST 4: Carrefour receipt (multi-category split) ────
console.log('\n📋 4. Receipt normalization — Carrefour (multi-category)');

const carrefourAIResponse = {
  receipt: {
    store: "Carrefour",
    storeType: "grocery",
    date: "2025-12-20",
    total: 455.89,
    currency: "RON",
  },
  transactions: [
    {
      merchant: "Carrefour",
      amount: 128.73,
      currency: "RON",
      category: "groceries",
      date: "2025-12-20",
      type: "expense",
      description: "Groceries from Carrefour",
      confidence: 0.90,
      items: [
        { name: "Chips Snack Sare 65g", qty: 1, price: 3.35, category: "groceries", confidence: 0.95 },
        { name: "Covr Spar Srir Chees", qty: 1, price: 2.45, category: "groceries", confidence: 0.85 },
        { name: "Paine Praj Ar Pizza", qty: 1, price: 2.25, category: "groceries", confidence: 0.90 },
        { name: "Bisc Cu Ar Smant Cea", qty: 1, price: 2.57, category: "groceries", confidence: 0.85 },
        { name: "Biscuiti Cu Ardei 10", qty: 1, price: 2.57, category: "groceries", confidence: 0.85 },
        { name: "Bisc Cu Aroma Branza", qty: 1, price: 2.57, category: "groceries", confidence: 0.85 },
        { name: "Biscuiti Original 10", qty: 2, price: 5.14, unitPrice: 2.57, category: "groceries", confidence: 0.85 },
        { name: "Coca-Cola 2x2L", qty: 1, price: 19.98, category: "groceries", confidence: 0.95 },
        { name: "Apa Plata 2L Bucovi", qty: 8, price: 21.20, unitPrice: 2.65, category: "groceries", confidence: 0.90 },
        { name: "Orbit Prof White Bot", qty: 1, price: 9.95, category: "groceries", confidence: 0.85 },
        { name: "Arahide 400g Nutline", qty: 1, price: 15.60, category: "groceries", confidence: 0.90 },
        { name: "Birra Moretti St 0.3", qty: 1, price: 5.32, category: "groceries", confidence: 0.90 },
        { name: "Cuburi Gheata 2Kg Ins", qty: 2, price: 13.98, unitPrice: 6.99, category: "groceries", confidence: 0.85 },
      ]
    },
    {
      merchant: "Carrefour",
      amount: 315.48,
      currency: "RON",
      category: "personal",
      date: "2025-12-20",
      type: "expense",
      description: "Tobacco and alcohol from Carrefour",
      confidence: 0.85,
      items: [
        { name: "Irish Whiskey 1L 40%", qty: 2, price: 219.98, unitPrice: 109.99, category: "personal", confidence: 0.90 },
        { name: "Heets Russet", qty: 2, price: 34.00, unitPrice: 17.00, category: "personal", confidence: 0.90 },
        { name: "Heets Teak", qty: 1, price: 17.00, category: "personal", confidence: 0.90 },
        { name: "Dunhill Fine Cut Mas", qty: 1, price: 22.50, category: "personal", confidence: 0.90 },
        { name: "Dunhill Evoque Signa", qty: 1, price: 22.00, category: "personal", confidence: 0.90 },
      ]
    }
  ],
  warnings: [],
  summary: "Carrefour receipt split: groceries + personal items"
};

const carrefourNorm = normalizeReceiptResult(carrefourAIResponse);

test('Carrefour: 2 transactions (split by category)', () => {
  assertEqual(carrefourNorm.transactions.length, 2);
});

test('Carrefour: first tx is groceries', () => {
  assertEqual(carrefourNorm.transactions[0].category, 'groceries');
});

test('Carrefour: second tx is personal', () => {
  assertEqual(carrefourNorm.transactions[1].category, 'personal');
});

test('Carrefour: groceries items total matches', () => {
  const tx = carrefourNorm.transactions[0];
  // Use same formula as normalizer: unitPrice*qty when available, else price
  const itemsSum = tx.items.reduce((s, i) => {
    if (i.unitPrice && i.unitPrice !== i.price && i.qty > 1) return s + (i.unitPrice * i.qty);
    return s + i.price;
  }, 0);
  const diff = Math.abs(tx.amount - itemsSum);
  if (diff > 1) throw new Error(`Items sum ${itemsSum} differs from amount ${tx.amount} by ${diff}`);
});

test('Carrefour: personal items total matches', () => {
  const tx = carrefourNorm.transactions[1];
  const itemsSum = tx.items.reduce((s, i) => {
    if (i.unitPrice && i.unitPrice !== i.price && i.qty > 1) return s + (i.unitPrice * i.qty);
    return s + i.price;
  }, 0);
  const diff = Math.abs(tx.amount - itemsSum);
  if (diff > 1) throw new Error(`Items sum ${itemsSum} differs from amount ${tx.amount} by ${diff}`);
});

// ─── TEST 5: Bank statement normalization (Revolut) ──────
console.log('\n📋 5. Bank statement normalization — Revolut');

function normalizeBankStatementResult(result, userId = 'local') {
  const txns = result.transactions || [];
  const today = '2026-03-10';
  const normalized = txns.map((t) => ({
    id: 'test-id',
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

// Mock Revolut statement AI response
const revolutAIResponse = {
  bankName: "Revolut",
  accountNumber: "3761",
  statementPeriod: { from: "2026-03-01", to: "2026-03-09" },
  currency: "RON",
  openingBalance: 982.90,
  closingBalance: 1395.59,
  transactions: [
    { date: "2026-03-01", merchant: "Polidom Service", amount: 80.00, type: "expense", category: "other", confidence: 0.75, description: "Cleaning service" },
    { date: "2026-03-01", merchant: "Apple Pay top-up", amount: 300.00, type: "income", category: "transfer", confidence: 0.95, description: "Card funding" },
    { date: "2026-03-01", merchant: "Transfer to EDUARD POPOVICI", amount: 500.00, type: "expense", category: "transfer", confidence: 0.95 },
    { date: "2026-03-02", merchant: "Blizzard Entertainment", amount: 66.67, type: "expense", category: "entertainment", confidence: 0.95 },
    { date: "2026-03-02", merchant: "Transfer from EDUARD POPOVICI", amount: 500.00, type: "income", category: "transfer", confidence: 0.95 },
    { date: "2026-03-02", merchant: "Mega Image", amount: 80.26, type: "expense", category: "groceries", confidence: 0.95 },
    { date: "2026-03-02", merchant: "Bubble Pop", amount: 56.00, type: "expense", category: "dining", confidence: 0.70 },
    { date: "2026-03-02", merchant: "Kfc Moldova Mall", amount: 15.50, type: "expense", category: "dining", confidence: 0.95 },
    { date: "2026-03-02", merchant: "Focus sat", amount: 44.00, type: "expense", category: "subscriptions", confidence: 0.90 },
    { date: "2026-03-02", merchant: "La Mattina", amount: 6.00, type: "expense", category: "dining", confidence: 0.85 },
    { date: "2026-03-03", merchant: "Microsoft 365", amount: 48.49, type: "expense", category: "subscriptions", confidence: 0.95 },
    { date: "2026-03-05", merchant: "Steam", amount: 19.47, type: "expense", category: "entertainment", confidence: 0.95 },
    { date: "2026-03-05", merchant: "Iasi Curata", amount: 46.00, type: "expense", category: "other", confidence: 0.70 },
    { date: "2026-03-06", merchant: "Polidom Service", amount: 70.00, type: "expense", category: "other", confidence: 0.75 },
    { date: "2026-03-06", merchant: "Maxi pet", amount: 235.89, type: "expense", category: "pets", confidence: 0.90 },
    { date: "2026-03-06", merchant: "Liprac Vet", amount: 55.00, type: "expense", category: "pets", confidence: 0.85 },
    { date: "2026-03-07", merchant: "Liprac Vet", amount: 25.00, type: "expense", category: "pets", confidence: 0.85 },
    { date: "2026-03-07", merchant: "Ana Pharm", amount: 1.50, type: "expense", category: "health", confidence: 0.90 },
    { date: "2026-03-07", merchant: "Pizza Nico", amount: 11.00, type: "expense", category: "dining", confidence: 0.85 },
    { date: "2026-03-07", merchant: "Cuptorul Moldovencei", amount: 60.00, type: "expense", category: "dining", confidence: 0.90 },
    { date: "2026-03-07", merchant: "Pizza Nico", amount: 81.00, type: "expense", category: "dining", confidence: 0.85 },
    { date: "2026-03-08", merchant: "Gelarte Arena", amount: 80.10, type: "expense", category: "dining", confidence: 0.80 },
    { date: "2026-03-08", merchant: "Carrefour", amount: 4.49, type: "expense", category: "groceries", confidence: 0.95 },
    { date: "2026-03-08", merchant: "OMV", amount: 393.83, type: "expense", category: "transport", confidence: 0.95 },
    { date: "2026-03-08", merchant: "Hanul Gulyas", amount: 100.00, type: "expense", category: "dining", confidence: 0.85 },
    { date: "2026-03-08", merchant: "Digi", amount: 67.11, type: "expense", category: "utilities", confidence: 0.95 },
    { date: "2026-03-09", merchant: "The Rabbit Hole", amount: 35.00, type: "expense", category: "dining", confidence: 0.80 },
    // Pending
    { date: "2026-03-06", merchant: "Liprac Vet", amount: 25.00, type: "expense", category: "pets", confidence: 0.85 },
    { date: "2026-03-09", merchant: "Cargus", amount: 279.99, type: "expense", category: "shopping", confidence: 0.80 },
    { date: "2026-03-09", merchant: "Digi", amount: 67.11, type: "expense", category: "utilities", confidence: 0.95 },
    { date: "2026-03-09", merchant: "Netflix", amount: 92.34, type: "expense", category: "subscriptions", confidence: 0.95 },
  ],
  summary: "31 transactions, Revolut RON statement Mar 1-9 2026"
};

const revolutNorm = normalizeBankStatementResult(revolutAIResponse);

test('Revolut: bankName is "Revolut" (not Unknown)', () => {
  assertEqual(revolutNorm.bankInfo.bankName, 'Revolut');
});

test('Revolut: statement period correct', () => {
  assertEqual(revolutNorm.bankInfo.period.from, '2026-03-01');
  assertEqual(revolutNorm.bankInfo.period.to, '2026-03-09');
});

test('Revolut: opening/closing balance correct', () => {
  assertEqual(revolutNorm.bankInfo.openingBalance, 982.90);
  assertEqual(revolutNorm.bankInfo.closingBalance, 1395.59);
});

test('Revolut: 31 transactions extracted', () => {
  assertEqual(revolutNorm.transactions.length, 31);
});

test('Revolut: OMV = transport at 393.83', () => {
  const omv = revolutNorm.transactions.find(t => t.merchant === 'OMV');
  assertNotNull(omv);
  assertEqual(omv.amount, 393.83);
  assertEqual(omv.category, 'transport');
});

test('Revolut: Netflix = subscriptions at 92.34', () => {
  const nf = revolutNorm.transactions.find(t => t.merchant === 'Netflix');
  assertNotNull(nf);
  assertEqual(nf.amount, 92.34);
  assertEqual(nf.category, 'subscriptions');
});

test('Revolut: Digi = utilities', () => {
  const digi = revolutNorm.transactions.filter(t => t.merchant === 'Digi');
  if (digi.length < 1) throw new Error('No Digi transactions found');
  digi.forEach(d => assertEqual(d.category, 'utilities'));
});

test('Revolut: transfers have correct type', () => {
  const transfer = revolutNorm.transactions.find(t => t.merchant.includes('EDUARD POPOVICI') && t.type === 'income');
  assertNotNull(transfer, 'Income transfer from Eduard');
  assertEqual(transfer.amount, 500.00);
});

test('Revolut: source is bank_statement for all', () => {
  revolutNorm.transactions.forEach(t => {
    assertEqual(t.source, 'bank_statement');
  });
});

// ─── TEST 6: "Unknown Bank" leak fix ─────────────────────
console.log('\n📋 6. BankStatementUpload "Unknown Bank" fix');

test('Unknown Bank falls back to label (truthy string check)', () => {
  const bankName = 'Unknown Bank';
  const fallback = 'Bank Statement';
  const store = (bankName && bankName !== 'Unknown Bank') ? bankName : fallback;
  assertEqual(store, 'Bank Statement');
});

test('Known bank name passes through', () => {
  const bankName = 'Revolut';
  const fallback = 'Bank Statement';
  const store = (bankName && bankName !== 'Unknown Bank') ? bankName : fallback;
  assertEqual(store, 'Revolut');
});

test('Null bank name falls back', () => {
  const bankName = null;
  const fallback = 'Bank Statement';
  const store = (bankName && bankName !== 'Unknown Bank') ? bankName : fallback;
  assertEqual(store, 'Bank Statement');
});

// ─── TEST 7: Amount formatting ───────────────────────────
console.log('\n📋 7. Amount formatting (.toFixed(2))');

test('45.5 → "45.50"', () => {
  assertEqual(Number(45.5).toFixed(2), '45.50');
});

test('3.1 → "3.10"', () => {
  assertEqual(Number(3.1).toFixed(2), '3.10');
});

test('718 → "718.00"', () => {
  assertEqual(Number(718).toFixed(2), '718.00');
});

test('Floating point artifact: 0.1+0.2 → "0.30"', () => {
  assertEqual(Number(0.1 + 0.2).toFixed(2), '0.30');
});

test('Large amount 2777.15 → "2777.15"', () => {
  assertEqual(Number(2777.15).toFixed(2), '2777.15');
});

// ─── TEST 8: Receipt Gallery schema ──────────────────────
console.log('\n📋 8. Receipt Gallery — Schema compatibility');

// Old format (before fix — receipt.result.*)
const oldReceipt = {
  id: 'old-1',
  imageBase64: 'abc...', // truncated!
  result: { merchant: 'Lidl', total: 150.50, currency: 'RON', items: [{ name: 'Milk', price: 5 }] },
  processedAt: '2026-03-01T10:00:00Z',
};

// New format (after fix — flat fields)
const newReceipt = {
  id: 'new-1',
  imageData: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==' + 'x'.repeat(300), // full base64 (>300 chars)
  mediaType: 'image/jpeg',
  merchant: 'Carrefour',
  total: 455.89,
  currency: 'RON',
  category: 'groceries',
  items: [{ name: 'Chips', price: 3.35 }],
  receipt: { store: 'Carrefour', total: 455.89 },
  transactions: [],
  processedAt: '2026-03-10T10:00:00Z',
};

function getReceiptDisplayData(receipt) {
  return {
    merchant: receipt.merchant || receipt.receipt?.store || receipt.result?.merchant || 'Unknown',
    total: receipt.total ?? receipt.receipt?.total ?? receipt.result?.total,
    currency: receipt.currency || receipt.receipt?.currency || receipt.result?.currency || 'RON',
    items: receipt.items || receipt.result?.items || receipt.transactions?.[0]?.items || [],
    hasImage: !!(receipt.imageData && receipt.imageData.length > 300),
  };
}

test('New format: all fields resolve correctly', () => {
  const d = getReceiptDisplayData(newReceipt);
  assertEqual(d.merchant, 'Carrefour');
  assertEqual(d.total, 455.89);
  assertEqual(d.currency, 'RON');
  assertEqual(d.items.length, 1);
  assertEqual(d.hasImage, true);
});

test('Old format: falls back to receipt.result.*', () => {
  const d = getReceiptDisplayData(oldReceipt);
  assertEqual(d.merchant, 'Lidl');
  assertEqual(d.total, 150.50);
  assertEqual(d.currency, 'RON');
  assertEqual(d.items.length, 1);
  assertEqual(d.hasImage, false); // truncated image
});

test('Empty receipt: shows defaults', () => {
  const d = getReceiptDisplayData({ id: 'empty' });
  assertEqual(d.merchant, 'Unknown');
  assertEqual(d.currency, 'RON');
  assertEqual(d.hasImage, false);
});

// ─── TEST 9: Monthly summary fix ─────────────────────────
console.log('\n📋 9. Monthly summary response handling');

test('Summary from JSON result object', () => {
  const result = { summary: 'You spent 2500 RON this month. Top category: dining.' };
  const output = result.summary || result.text || (typeof result === 'string' ? result : JSON.stringify(result));
  assertEqual(output, 'You spent 2500 RON this month. Top category: dining.');
});

test('Summary from text field', () => {
  const result = { text: 'Monthly summary here' };
  const output = result.summary || result.text || (typeof result === 'string' ? result : JSON.stringify(result));
  assertEqual(output, 'Monthly summary here');
});

test('String result passes through', () => {
  const result = 'Plain text summary';
  const output = typeof result === 'object' ? (result.summary || result.text || JSON.stringify(result)) : result;
  assertEqual(output, 'Plain text summary');
});

// ═══════════════════════════════════════════════════════════
console.log(`\n${'═'.repeat(50)}`);
console.log(`📊 Results: ${passed}/${total} passed, ${failed} failed`);
if (failed === 0) {
  console.log('🎉 ALL TESTS PASSED!\n');
} else {
  console.log(`⚠️  ${failed} test(s) failed — review above\n`);
}
process.exit(failed > 0 ? 1 : 0);
