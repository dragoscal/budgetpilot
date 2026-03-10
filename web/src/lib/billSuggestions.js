/**
 * Rule-based bill/subscription suggestions for LUMET.
 * Identifies unused subscriptions, duplicates, price increases,
 * and annual billing opportunities.
 */

const DISMISSED_KEY = 'bp_dismissedBillSuggestions';

/**
 * Get dismissed suggestion IDs from localStorage.
 */
export function getDismissedSuggestions() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Dismiss a suggestion by ID.
 */
export function dismissSuggestion(id) {
  const dismissed = getDismissedSuggestions();
  if (!dismissed.includes(id)) {
    dismissed.push(id);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  }
}

/**
 * Known streaming/subscription category groups for duplicate detection.
 */
const SERVICE_GROUPS = {
  streaming: ['netflix', 'hbo', 'disney', 'hulu', 'prime video', 'apple tv', 'youtube premium', 'crunchyroll', 'paramount'],
  music: ['spotify', 'apple music', 'youtube music', 'tidal', 'deezer', 'amazon music'],
  cloud: ['icloud', 'google one', 'dropbox', 'onedrive', 'mega'],
  news: ['nytimes', 'washington post', 'wsj', 'medium', 'substack'],
};

function normalizeServiceName(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findServiceGroup(name) {
  const normalized = normalizeServiceName(name);
  for (const [group, keywords] of Object.entries(SERVICE_GROUPS)) {
    if (keywords.some((kw) => normalized.includes(kw.replace(/\s/g, '')))) {
      return group;
    }
  }
  return null;
}

/**
 * Generate bill optimization suggestions.
 *
 * @param {Array} transactions - All transactions (multiple months).
 * @param {Array} recurringItems - Active recurring items/subscriptions.
 * @returns {Array<{ id: string, type: string, title: string, description: string, potentialSaving: number, category: string }>}
 */
export function getBillSuggestions(transactions, recurringItems) {
  const suggestions = [];
  const dismissed = getDismissedSuggestions();

  if (!recurringItems || recurringItems.length === 0) return suggestions;

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().slice(0, 10);

  // 1. Identify subscriptions that haven't been used (no related transactions in 30+ days)
  for (const item of recurringItems) {
    const name = (item.name || item.merchant || '').toLowerCase();
    if (!name) continue;

    // Check if there are any related expense transactions in the last 30 days
    const recentRelated = transactions.filter(
      (tx) =>
        tx.type === 'expense' &&
        tx.date >= thirtyDaysAgoStr &&
        (tx.merchant || '').toLowerCase().includes(name) &&
        tx.source !== 'recurring' // Exclude auto-created recurring entries
    );

    if (recentRelated.length === 0 && item.amount > 0) {
      const id = `unused-${item.id}`;
      if (!dismissed.includes(id)) {
        suggestions.push({
          id,
          type: 'unused',
          title: item.name || item.merchant,
          description: `No activity for ${item.name || item.merchant} in the last 30 days. Consider cancelling if unused.`,
          potentialSaving: item.amount,
          category: item.category || 'bills',
        });
      }
    }
  }

  // 2. Find duplicate/similar subscriptions (e.g., multiple streaming services)
  const groupCounts = {};
  const groupItems = {};
  for (const item of recurringItems) {
    const group = findServiceGroup(item.name || item.merchant || '');
    if (group) {
      groupCounts[group] = (groupCounts[group] || 0) + 1;
      if (!groupItems[group]) groupItems[group] = [];
      groupItems[group].push(item);
    }
  }

  for (const [group, count] of Object.entries(groupCounts)) {
    if (count >= 2) {
      const items = groupItems[group];
      const names = items.map((i) => i.name || i.merchant).join(', ');
      const totalCost = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      const cheapest = Math.min(...items.map((i) => Number(i.amount) || 0));
      const id = `duplicate-${group}`;
      if (!dismissed.includes(id)) {
        suggestions.push({
          id,
          type: 'duplicate',
          title: `Multiple ${group} services`,
          description: `You have ${count} ${group} subscriptions (${names}). Consider keeping just one.`,
          potentialSaving: totalCost - cheapest,
          category: 'entertainment',
        });
      }
    }
  }

  // 3. Flag subscriptions with recent price increases (compare last 3 months of transactions)
  for (const item of recurringItems) {
    const name = (item.name || item.merchant || '').toLowerCase();
    if (!name) continue;

    // Find matching transactions from the last 3 months, grouped by month
    const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000);
    const threeMonthsAgoStr = threeMonthsAgo.toISOString().slice(0, 10);

    const recentTx = transactions
      .filter(
        (tx) =>
          tx.type === 'expense' &&
          tx.date >= threeMonthsAgoStr &&
          (tx.merchant || '').toLowerCase().includes(name)
      )
      .sort((a, b) => a.date.localeCompare(b.date));

    if (recentTx.length >= 2) {
      const amounts = recentTx.map((tx) => Number(tx.amount) || 0);
      const oldest = amounts[0];
      const newest = amounts[amounts.length - 1];

      if (oldest > 0 && newest > oldest * 1.05) {
        const increase = newest - oldest;
        const pct = Math.round((increase / oldest) * 100);
        const id = `increase-${item.id}`;
        if (!dismissed.includes(id)) {
          suggestions.push({
            id,
            type: 'priceIncrease',
            title: item.name || item.merchant,
            description: `Price increased by ${pct}% recently (from ${oldest.toFixed(2)} to ${newest.toFixed(2)}). Worth reviewing.`,
            potentialSaving: increase,
            category: item.category || 'bills',
          });
        }
      }
    }
  }

  // 4. Suggest annual billing for monthly subscriptions (typically 15-20% savings)
  for (const item of recurringItems) {
    const freq = item.frequency || 'monthly';
    if (freq !== 'monthly') continue;
    if ((Number(item.amount) || 0) <= 0) continue;

    const annualSaving = item.amount * 12 * 0.17; // ~17% typical annual discount
    const id = `annual-${item.id}`;
    if (!dismissed.includes(id)) {
      suggestions.push({
        id,
        type: 'annual',
        title: item.name || item.merchant,
        description: `Switching to annual billing could save ~17% per year.`,
        potentialSaving: Math.round(annualSaving * 100) / 100,
        category: item.category || 'bills',
      });
    }
  }

  return suggestions;
}
