/**
 * Category Manager — single source of truth for all category resolution.
 * Merges built-in categories with user-defined custom categories.
 * Handles visibility (hidden categories) and provides sync/async access.
 */

import { CATEGORIES, SUBCATEGORIES } from './constants';
import { getSetting, setSetting } from './storage';
import { settings as settingsApi } from './api';

const CUSTOM_CATEGORIES_KEY = 'customCategories';
const HIDDEN_CATEGORIES_KEY = 'hiddenCategories';

// ─── In-memory cache ─────────────────────────────────────
let _customCategories = null;
let _hiddenCategories = null;
let _mergedSubcategories = null;

// ─── Mutation lock (prevents race conditions) ────────────
let _mutationQueue = Promise.resolve();
function _withLock(fn) {
  _mutationQueue = _mutationQueue.then(fn, fn);
  return _mutationQueue;
}

/** Dispatch event so useCategories hooks across all components refresh */
function _notifyUpdate() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('categories-updated'));
  }
}

// ─── LOADERS (async, populate cache) ─────────────────────

export async function loadCustomCategories() {
  try {
    _customCategories = (await getSetting(CUSTOM_CATEGORIES_KEY)) || [];
  } catch {
    _customCategories = [];
  }
  _mergedSubcategories = null; // invalidate subcategory cache
  return _customCategories;
}

export async function loadHiddenCategories() {
  try {
    _hiddenCategories = (await getSetting(HIDDEN_CATEGORIES_KEY)) || [];
  } catch {
    _hiddenCategories = [];
  }
  return _hiddenCategories;
}

/** Load both caches — call once at app startup */
export async function initCategories() {
  await Promise.all([loadCustomCategories(), loadHiddenCategories()]);
}

// ─── GETTERS (async with auto-load) ──────────────────────

export async function getCustomCategories() {
  if (_customCategories === null) await loadCustomCategories();
  return _customCategories;
}

export async function getHiddenCategories() {
  if (_hiddenCategories === null) await loadHiddenCategories();
  return _hiddenCategories;
}

/** All categories (built-in + custom), regardless of hidden status */
export async function getAllCategories() {
  const custom = await getCustomCategories();
  return [...CATEGORIES, ...custom];
}

/** Only active (non-hidden) categories — for pickers, budget creation */
export async function getActiveCategories() {
  const all = await getAllCategories();
  const hidden = await getHiddenCategories();
  const hiddenSet = new Set(hidden);
  return all.filter(c => !hiddenSet.has(c.id));
}

/** All subcategories merged (built-in + custom) */
export async function getAllSubcategories() {
  if (_mergedSubcategories) return _mergedSubcategories;
  const custom = await getCustomCategories();
  const merged = { ...SUBCATEGORIES };
  for (const cat of custom) {
    if (cat.subcategories?.length > 0) {
      merged[cat.id] = cat.subcategories;
    }
  }
  _mergedSubcategories = merged;
  return merged;
}

// ─── SYNC GETTERS (use cached data, must call init first) ─

/** Synchronous — uses cache. Returns built-in fallback if cache empty. */
export function getCategoryByIdSync(id) {
  const builtIn = CATEGORIES.find(c => c.id === id);
  if (builtIn) return builtIn;
  if (_customCategories) {
    const custom = _customCategories.find(c => c.id === id);
    if (custom) return custom;
  }
  return CATEGORIES[CATEGORIES.length - 1]; // 'other' fallback
}

/** Synchronous subcategories access */
export function getSubcategoriesSync(categoryId) {
  if (_mergedSubcategories) return _mergedSubcategories[categoryId] || [];
  // Fallback to built-in only
  return SUBCATEGORIES[categoryId] || [];
}

/** Synchronous subcategory by ID */
export function getSubcategoryByIdSync(subcatId) {
  if (!subcatId || !subcatId.includes(':')) return null;
  const parentId = subcatId.split(':')[0];
  const subs = getSubcategoriesSync(parentId);
  return subs.find(s => s.id === subcatId) || null;
}

/** Cached custom categories (sync) */
export function getCustomCategoriesSync() {
  return _customCategories || [];
}

/** Cached hidden categories (sync) */
export function getHiddenCategoriesSync() {
  return _hiddenCategories || [];
}

// ─── MUTATIONS ───────────────────────────────────────────

export function addCustomCategory(category) {
  return _withLock(async () => {
    if (!category?.name || typeof category.name !== 'string' || !category.name.trim()) {
      throw new Error('Category name is required');
    }

    const custom = await getCustomCategories();
    const id = category.id || `custom_${Date.now()}_${category.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

    // Prevent duplicate IDs
    if (custom.some(c => c.id === id) || CATEGORIES.some(c => c.id === id)) {
      throw new Error('Category ID already exists');
    }

    const newCat = {
      id,
      name: category.name.trim(),
      icon: category.icon || '📁',
      color: category.color || '#6b7280',
      isCustom: true,
      keywords: category.keywords || [],
      description: category.description || '',
      subcategories: category.subcategories || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [...custom, newCat];
    await _saveCustomCategories(updated);
    return newCat;
  });
}

export function updateCustomCategory(id, changes) {
  return _withLock(async () => {
    const custom = await getCustomCategories();
    const idx = custom.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Category not found');

    // Strip protected fields that should never be changed via update
    const { id: _id, isCustom: _ic, createdAt: _ca, ...safeChanges } = changes;

    const updated = [...custom];
    updated[idx] = { ...updated[idx], ...safeChanges, updatedAt: new Date().toISOString() };
    await _saveCustomCategories(updated);
    return updated[idx];
  });
}

export function deleteCustomCategory(id) {
  return _withLock(async () => {
    const custom = await getCustomCategories();
    const updated = custom.filter(c => c.id !== id);
    await _saveCustomCategories(updated);

    // Also remove from hidden if present
    const hidden = await getHiddenCategories();
    if (hidden.includes(id)) {
      const updatedHidden = hidden.filter(h => h !== id);
      await _saveHiddenCategories(updatedHidden);
    }
  });
}

export function toggleCategoryVisibility(categoryId) {
  return _withLock(async () => {
    const hidden = await getHiddenCategories();
    let updated;
    if (hidden.includes(categoryId)) {
      updated = hidden.filter(h => h !== categoryId);
    } else {
      updated = [...hidden, categoryId];
    }
    await _saveHiddenCategories(updated);
    return updated;
  });
}

export function setCategoryVisibility(categoryId, visible) {
  return _withLock(async () => {
    const hidden = await getHiddenCategories();
    let updated;
    if (visible) {
      updated = hidden.filter(h => h !== categoryId);
    } else {
      if (!hidden.includes(categoryId)) {
        updated = [...hidden, categoryId];
      } else {
        return hidden;
      }
    }
    await _saveHiddenCategories(updated);
    return updated;
  });
}

// ─── HELPERS ─────────────────────────────────────────────

/** Get category display label — custom uses .name, built-in uses translation */
export function getCategoryLabel(cat, t) {
  if (!cat) return '';
  if (cat.isCustom) return cat.name;
  const translated = t(`categories.${cat.id}`);
  // If translation returns the key itself (missing), use raw name
  return translated === `categories.${cat.id}` ? cat.name : translated;
}

/** Check if a category ID belongs to a custom category */
export function isCustomCategory(id) {
  if (!id) return false;
  // Check cache first (accurate), fall back to prefix convention
  if (_customCategories) return _customCategories.some(c => c.id === id);
  return id.startsWith('custom_');
}

/** Invalidate all caches — call after server sync */
export function invalidateCache() {
  _customCategories = null;
  _hiddenCategories = null;
  _mergedSubcategories = null;
}

// ─── INTERNAL SAVE HELPERS ───────────────────────────────

async function _saveCustomCategories(categories) {
  _customCategories = categories;
  _mergedSubcategories = null; // invalidate subcategory cache
  await setSetting(CUSTOM_CATEGORIES_KEY, categories);
  // Sync to server (log errors instead of silently swallowing)
  try { await settingsApi.set(CUSTOM_CATEGORIES_KEY, categories); } catch (e) {
    console.warn('Failed to sync custom categories to server:', e?.message || e);
  }
  _notifyUpdate();
}

async function _saveHiddenCategories(hidden) {
  _hiddenCategories = hidden;
  await setSetting(HIDDEN_CATEGORIES_KEY, hidden);
  try { await settingsApi.set(HIDDEN_CATEGORIES_KEY, hidden); } catch (e) {
    console.warn('Failed to sync hidden categories to server:', e?.message || e);
  }
  _notifyUpdate();
}
