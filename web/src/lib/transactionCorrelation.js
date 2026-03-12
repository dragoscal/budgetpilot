/**
 * Transaction Correlation Engine
 * Matches manual/NLP/receipt transactions with bank-imported transactions
 * to identify duplicates and enable merging.
 */

/**
 * Fuzzy merchant name matching — normalizes and compares.
 * Returns 0-1 confidence score.
 */
function fuzzyMerchantMatch(a, b) {
  if (!a || !b) return 0;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.8;

  // Simple bigram similarity
  const bigrams = (s) => {
    const result = new Set();
    for (let i = 0; i < s.length - 1; i++) result.add(s.slice(i, i + 2));
    return result;
  };
  const setA = bigrams(na);
  const setB = bigrams(nb);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const b of setA) if (setB.has(b)) intersection++;
  return (2.0 * intersection) / (setA.size + setB.size);
}

/**
 * Correlate transactions — find potential matches between manual/receipt
 * entries and bank-imported entries.
 *
 * @param {Array} transactions - All transactions
 * @returns {{ matches: Array, unmatchedManual: Array, unmatchedImport: Array }}
 */
export function correlateTransactions(transactions) {
  if (!transactions || transactions.length === 0) {
    return { matches: [], unmatchedManual: [], unmatchedImport: [] };
  }

  // Split into manual-entry vs imported
  const manual = transactions.filter(t =>
    ['manual', 'nlp', 'receipt'].includes(t.source) && !t.importBatch
  );
  const imported = transactions.filter(t =>
    t.source === 'import' || t.importBatch
  );

  if (manual.length === 0 || imported.length === 0) {
    return { matches: [], unmatchedManual: manual, unmatchedImport: imported };
  }

  const matches = [];
  const matchedManualIds = new Set();
  const matchedImportIds = new Set();

  for (const m of manual) {
    let bestMatch = null;
    let bestScore = 0;

    for (const imp of imported) {
      if (matchedImportIds.has(imp.id)) continue;
      if (m.type !== imp.type) continue;

      // Amount score: exact or within 5% tolerance
      const amountDiff = Math.abs(m.amount - imp.amount);
      const maxAmount = Math.max(m.amount, imp.amount, 0.01);
      const amountRatio = amountDiff / maxAmount;
      const amountScore = amountRatio === 0 ? 1 : amountRatio < 0.01 ? 0.9 : amountRatio < 0.05 ? 0.7 : 0;

      if (amountScore === 0) continue; // Skip if amounts are too different

      // Date score: within ±3 days
      const dayDiff = Math.abs(new Date(m.date) - new Date(imp.date)) / 86400000;
      const dateScore = dayDiff === 0 ? 1 : dayDiff <= 1 ? 0.9 : dayDiff <= 3 ? 0.6 : 0;

      if (dateScore === 0) continue; // Skip if dates are too far apart

      // Merchant score: fuzzy match
      const merchantScore = fuzzyMerchantMatch(m.merchant, imp.merchant);

      // Currency must match
      if (m.currency !== imp.currency) continue;

      // Weighted score
      const score = amountScore * 0.45 + dateScore * 0.35 + merchantScore * 0.20;

      if (score > bestScore && score >= 0.45) {
        bestScore = score;
        bestMatch = imp;
      }
    }

    if (bestMatch) {
      matches.push({ manual: m, import: bestMatch, confidence: bestScore });
      matchedManualIds.add(m.id);
      matchedImportIds.add(bestMatch.id);
    }
  }

  return {
    matches: matches.sort((a, b) => b.confidence - a.confidence),
    unmatchedManual: manual.filter(t => !matchedManualIds.has(t.id)),
    unmatchedImport: imported.filter(t => !matchedImportIds.has(t.id)),
  };
}
