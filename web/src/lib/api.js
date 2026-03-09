import * as storage from './storage';
import { getSetting } from './storage';
import { addToSyncQueue } from './sync';

async function getApiUrl() {
  return (await getSetting('apiUrl')) || import.meta.env.VITE_API_URL || '';
}

function getAuthToken() {
  return sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token');
}

async function getApiKey() {
  return await getSetting('apiKey');
}

function isApiMode(apiUrl) {
  return !!apiUrl;
}

async function apiFetch(apiUrl, path, options = {}) {
  const token = getAuthToken();
  const apiKey = await getApiKey();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  else if (apiKey) headers['x-api-key'] = apiKey;

  const res = await fetch(`${apiUrl}${path}`, { ...options, headers });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.data !== undefined ? data.data : data;
}

// Generic CRUD that works in both modes
// In local mode: operates on IndexedDB + queues changes for sync
function createCrud(storeName) {
  return {
    async getAll(filters = {}) {
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try {
          const params = new URLSearchParams(filters).toString();
          return await apiFetch(apiUrl, `/api/${storeName}?${params}`);
        } catch {
          // Fallback to local on network error
          return storage.getAll(storeName, filters);
        }
      }
      return storage.getAll(storeName, filters);
    },

    async getById(id) {
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try { return await apiFetch(apiUrl, `/api/${storeName}/${id}`); }
        catch { return storage.getById(storeName, id); }
      }
      return storage.getById(storeName, id);
    },

    async create(record) {
      // Always save locally first (offline-first)
      const result = await storage.add(storeName, record);

      // Queue for sync
      addToSyncQueue('create', storeName, record).catch(() => {});

      // Try to push to API immediately if available
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try {
          await apiFetch(apiUrl, `/api/${storeName}`, {
            method: 'POST',
            body: JSON.stringify(record),
          });
        } catch {
          // Will sync later via queue
        }
      }

      return result;
    },

    async update(id, changes) {
      // Update locally first
      const existing = await storage.getById(storeName, id);
      const updated = { ...existing, ...changes };
      await storage.update(storeName, updated);

      // Queue for sync
      addToSyncQueue('update', storeName, updated).catch(() => {});

      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try {
          await apiFetch(apiUrl, `/api/${storeName}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(changes),
          });
        } catch { /* Will sync later */ }
      }

      return updated;
    },

    async remove(id) {
      await storage.remove(storeName, id);

      addToSyncQueue('delete', storeName, { id }).catch(() => {});

      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try {
          await apiFetch(apiUrl, `/api/${storeName}/${id}`, { method: 'DELETE' });
        } catch { /* Will sync later */ }
      }
    },
  };
}

export const transactions = createCrud('transactions');
export const budgets = createCrud('budgets');
export const goals = createCrud('goals');
export const accounts = createCrud('accounts');
export const recurring = createCrud('recurring');
export const people = createCrud('people');
export const debts = createCrud('debts');
export const debtPayments = createCrud('debtPayments');
export const wishlistApi = createCrud('wishlist');

// Settings
export const settings = {
  async get(key) {
    return storage.getSetting(key);
  },

  async set(key, value) {
    await storage.setSetting(key, value);

    // Also push to backend if available
    const apiUrl = await getApiUrl();
    if (isApiMode(apiUrl)) {
      try {
        await apiFetch(apiUrl, `/api/settings`, {
          method: 'PUT',
          body: JSON.stringify({ [key]: value }),
        });
      } catch { /* Local is source of truth */ }
    }
  },

  async getAll() {
    return storage.getAllSettings();
  },
};

// Data management
export async function exportData() {
  return storage.exportAll();
}

export async function importData(data) {
  return storage.importAll(data);
}

export async function clearData() {
  return storage.clearAllData();
}
