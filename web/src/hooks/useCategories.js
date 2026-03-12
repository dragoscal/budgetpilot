import { useState, useEffect, useCallback } from 'react';
import {
  getActiveCategories,
  getAllCategories,
  getAllSubcategories,
  getHiddenCategoriesSync,
  invalidateCache,
  loadCustomCategories,
  loadHiddenCategories,
} from '../lib/categoryManager';
import { CATEGORIES, SUBCATEGORIES } from '../lib/constants';

/**
 * React hook for category data — provides merged built-in + custom categories.
 *
 * @param {{ includeHidden?: boolean }} options
 *   - includeHidden: if true, returns ALL categories (for settings/management)
 *                    if false (default), returns only active/visible categories
 * @returns {{ categories, subcategories, hiddenIds, loading, refresh }}
 */
export function useCategories({ includeHidden = false } = {}) {
  // Start with built-in categories so first render is not empty
  const [categories, setCategories] = useState(CATEGORIES);
  const [subcategories, setSubcategories] = useState(SUBCATEGORIES);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      invalidateCache();
      // Load hidden FIRST — getActiveCategories depends on hidden list being cached
      await loadHiddenCategories();
      const [cats, subs] = await Promise.all([
        includeHidden ? getAllCategories() : getActiveCategories(),
        getAllSubcategories(),
      ]);
      setCategories(cats);
      setSubcategories(subs);
      setHiddenIds(getHiddenCategoriesSync());
    } catch (err) {
      console.error('Failed to load categories:', err);
    } finally {
      setLoading(false);
    }
  }, [includeHidden]);

  useEffect(() => {
    refresh();
    // Re-load when custom categories are modified elsewhere
    const handler = () => refresh();
    window.addEventListener('categories-updated', handler);
    return () => window.removeEventListener('categories-updated', handler);
  }, [refresh]);

  return { categories, subcategories, hiddenIds, loading, refresh };
}
