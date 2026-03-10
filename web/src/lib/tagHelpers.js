import { getAll } from './storage';

// ─── TAG HELPERS ──────────────────────────────────────────
// Utilities for extracting, suggesting, and analyzing tags

/**
 * Get all unique tags from transactions, sorted by frequency
 * @param {string} userId - Filter by userId
 * @returns {Array<{tag: string, count: number}>}
 */
export async function getAllTags(userId) {
  const transactions = await getAll('transactions', userId ? { userId } : {});
  const tagMap = new Map();

  for (const t of transactions) {
    if (!t.tags || !Array.isArray(t.tags)) continue;
    for (const tag of t.tags) {
      const normalized = tag.toLowerCase().trim();
      if (!normalized) continue;
      tagMap.set(normalized, (tagMap.get(normalized) || 0) + 1);
    }
  }

  return Array.from(tagMap.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get tag statistics: spending per tag
 * @param {Array} transactions - Pre-filtered transactions
 * @returns {Array<{tag: string, count: number, total: number, avgAmount: number}>}
 */
export function getTagStats(transactions) {
  const tagMap = new Map();

  for (const t of transactions) {
    if (!t.tags || !Array.isArray(t.tags)) continue;
    if (t.type !== 'expense') continue;

    for (const tag of t.tags) {
      const normalized = tag.toLowerCase().trim();
      if (!normalized) continue;

      const existing = tagMap.get(normalized) || { tag: normalized, count: 0, total: 0 };
      existing.count++;
      existing.total += t.amount || 0;
      tagMap.set(normalized, existing);
    }
  }

  return Array.from(tagMap.values())
    .map((s) => ({ ...s, avgAmount: s.count > 0 ? s.total / s.count : 0 }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Suggest tags based on partial input, from historical usage
 * @param {string} input - Partial tag text
 * @param {string} userId - Filter by userId
 * @returns {Array<{tag: string, count: number}>}
 */
export async function suggestTags(input, userId) {
  const allTags = await getAllTags(userId);
  if (!input.trim()) return allTags.slice(0, 10);

  const lower = input.toLowerCase().trim();
  return allTags
    .filter((t) => t.tag.includes(lower))
    .slice(0, 8);
}

/**
 * Extract #hashtags from a text string
 * @param {string} text - Input text
 * @returns {{ cleanText: string, tags: string[] }}
 */
export function extractHashtags(text) {
  const tagRegex = /#([a-zA-Z0-9_\u00C0-\u024F]+)/g;
  const tags = [];
  let match;

  while ((match = tagRegex.exec(text)) !== null) {
    tags.push(match[1].toLowerCase());
  }

  const cleanText = text.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
  return { cleanText, tags: [...new Set(tags)] };
}
