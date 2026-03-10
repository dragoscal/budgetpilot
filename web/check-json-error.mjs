// Temporary script to find JSON parse error at position 20489 (line 719 column 6)
import { CATEGORIES, SUBCATEGORIES } from './src/lib/constants.js';

// Build the full RECEIPT_SYSTEM_PROMPT as ai.js does
const RECEIPT_SYSTEM_PROMPT = `You are an expert receipt and expense parser for a Romanian budgeting app called LUMET. You excel at reading receipts in any language (especially Romanian) and categorizing every item.

RECEIPT PARSING RULES:
- Romanian receipts: BON FISCAL = receipt, LEI/RON = currency, BUC = pieces, TVA = VAT, CIF = tax ID, dates DD.MM.YYYY
- Multi-currency: RON/lei, EUR/\u20ac, USD/$, GBP/\u00a3
- Always return amounts as POSITIVE numbers
- Dates: YYYY-MM-DD format
- Detect income vs expense: "salary", "salariu", "venit", "freelance" = income

STORE DETECTION \u2014 Identify the store type from the receipt header:
- Grocery stores: Lidl, Kaufland, Carrefour, Mega Image, Auchan, Profi, Penny, Cora, Selgros
- Pharmacies: Farmacia Tei, Catena, Sensiblu, Dona, HelpNet
- Restaurants: any restaurant, pizzeria, fast food, cafe
- Gas stations: Petrom/OMV, Rompetrol, MOL, Lukoil
- Electronics: eMAG, Altex, Flanco, Media Galaxy

ITEM-LEVEL CATEGORIZATION \u2014 For each item on the receipt, assign one of these categories:
${CATEGORIES.map((c) => `- ${c.id}: ${c.name} (${c.icon})`).join('\n')}

SUBCATEGORIES \u2014 When possible, also assign a subcategory for more detail:
${Object.entries(SUBCATEGORIES).map(([parentId, subs]) => `- ${parentId}: ${subs.map(s => `${s.id} (${s.name})`).join(', ')}`).join('\n')}

Common item to category mappings:
- Food items (bread, milk, meat, vegetables, fruit, cheese, eggs, pasta, rice, oil) = groceries
- Drinks (water, juice, soda, beer, wine) = groceries (if from store) or dining (if restaurant)
- Cleaning products (detergent, soap, bleach, sponges) = housing
- Personal care (shampoo, toothpaste, deodorant, razors, cream) = personal
- Baby items (diapers, baby food, formula) = personal
- Pet food, pet supplies = pets
- Medicine, vitamins, supplements = health
- Snacks, candy, chocolate = groceries
- Cigarettes, alcohol = personal
- Household (light bulbs, batteries, tools) = housing
- Stationery, school supplies = education
- Clothing = shopping

CONFIDENCE SCORING:
- 0.95+ = Very certain (clear text, known store, obvious category)
- 0.80-0.94 = Confident (readable, reasonable category match)
- 0.60-0.79 = Uncertain (blurry text, ambiguous item, guessed category)
- Below 0.60 = Low confidence (illegible, can't determine category \u2014 flag for review)

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
- The transaction "amount" MUST equal the TOTAL printed on the receipt
- When items are listed, transaction amount MUST equal the sum of (item.price x item.qty)
- If you see a "Total general" or similar line, use EXACTLY that number
- Double-check your math: sum the items and verify it matches the receipt total`;

// Build the body as callAI does (Anthropic format)
const body = JSON.stringify({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4000,
  system: RECEIPT_SYSTEM_PROMPT,
  messages: [{ role: 'user', content: [
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'FAKE_BASE64' } },
    { type: 'text', text: 'Parse this receipt completely.' },
  ]}],
});

console.log('Body length:', body.length);
console.log('Body lines:', body.split('\n').length);

// Test parse
try {
  JSON.parse(body);
  console.log('Body parses OK');
} catch(e) {
  console.log('Body parse ERROR:', e.message);
}

// Now let's simulate what happens with a broken AI response
// A 20489-char response with 719 lines that has an array error at column 6
// Let's create a mock response that would produce this exact error
const mockBrokenResponse = `Here is the parsed receipt:
{
  "receipt": {
    "store": "Test Store"
  },
  "transactions": [
    {
      "items": [
` + Array.from({length: 705}, (_, i) => `        {"name": "Item ${i}", "price": ${(i * 1.5).toFixed(2)}}`).join(',\n') + `
        {"name": "BROKEN ITEM", "price": 10.00}
        {"name": "AFTER BROKEN", "price": 5.00}
      ]
    }
  ]
}`;

console.log('\nMock broken response length:', mockBrokenResponse.length);

// Now check: what if the response from Anthropic AI has a trailing comma issue or missing comma in an array?
// The exact error "Expected ',' or ']' after array element" means between two array elements, a comma is missing.

// Check the actual ai.js BANK_STATEMENT_PROMPT too
const BANK_STATEMENT_PROMPT_CATEGORIES = CATEGORIES.map((c) => `- ${c.id}: ${c.name}`).join('\n');
console.log('\nBank statement categories section length:', BANK_STATEMENT_PROMPT_CATEGORIES.length);

// Final check: the full ai.js file itself as a string, check around position 20489
import { readFileSync } from 'fs';
const aiSource = readFileSync('src/lib/ai.js', 'utf8');
console.log('\nai.js file size:', aiSource.length);
if (aiSource.length > 20500) {
  const linesBefore = aiSource.substring(0, 20489).split('\n');
  console.log('ai.js at position 20489 is line', linesBefore.length, 'column', linesBefore[linesBefore.length-1].length);
  console.log('Context:', JSON.stringify(aiSource.substring(20470, 20510)));
}

// Check en.js and ro.js the same way
const enSource = readFileSync('src/lib/translations/en.js', 'utf8');
const roSource = readFileSync('src/lib/translations/ro.js', 'utf8');

console.log('\nen.js file size:', enSource.length);
if (enSource.length > 20500) {
  const enLines = enSource.substring(0, 20489).split('\n');
  console.log('en.js at position 20489 is line', enLines.length, 'column', enLines[enLines.length-1].length);
  console.log('Context:', JSON.stringify(enSource.substring(20470, 20510)));
}

console.log('\nro.js file size:', roSource.length);
if (roSource.length > 20500) {
  const roLines = roSource.substring(0, 20489).split('\n');
  console.log('ro.js at position 20489 is line', roLines.length, 'column', roLines[roLines.length-1].length);
  console.log('Context:', JSON.stringify(roSource.substring(20470, 20510)));
}

// Check constants.js
const constSource = readFileSync('src/lib/constants.js', 'utf8');
console.log('\nconstants.js file size:', constSource.length);
if (constSource.length > 20500) {
  const constLines = constSource.substring(0, 20489).split('\n');
  console.log('constants.js at position 20489 is line', constLines.length, 'column', constLines[constLines.length-1].length);
}

// Check test file
const testSource = readFileSync('test-ai-functions.mjs', 'utf8');
console.log('\ntest-ai-functions.mjs file size:', testSource.length);
if (testSource.length > 20500) {
  const testLines = testSource.substring(0, 20489).split('\n');
  console.log('test file at position 20489 is line', testLines.length, 'column', testLines[testLines.length-1].length);
  console.log('Context:', JSON.stringify(testSource.substring(20470, 20510)));
}

// MOST IMPORTANT: Check if the full ai.js content, when treated as JSON, gives the exact error
// This would happen if something tries to JSON.parse the ai.js file itself
console.log('\n--- Testing if any file produces the exact error ---');
for (const [name, content] of [['ai.js', aiSource], ['en.js', enSource], ['ro.js', roSource], ['constants.js', constSource], ['test-ai-functions.mjs', testSource]]) {
  try {
    JSON.parse(content);
    console.log(name, '- parses as JSON (unexpected!)');
  } catch(e) {
    if (e.message.includes('20489') || e.message.includes('line 719')) {
      console.log(name, '- MATCH!', e.message);
    }
  }
}
