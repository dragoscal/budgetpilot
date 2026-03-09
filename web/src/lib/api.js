import * as storage from './storage';
import { getSetting } from './storage';
import { addToSyncQueue } from './sync';

// Table name mapping: IndexedDB store names → API path names
const TABLE_MAP = {
  debtPayments: 'debt_payments',
};

function toApiTable(storeName) {
  return TABLE_MAP[storeName] || storeName;
}

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
// In API mode: saves locally first (offline-first) + pushes to API + queues as fallback
function createCrud(storeName) {
  const apiTable = toApiTable(storeName);

  return {
    async getAll(filters = {}) {
      // Always read from local IndexedDB (offline-first, instant)
      return storage.getAll(storeName, filters);
    },

    async getById(id) {
      return storage.getById(storeName, id);
    },

    async create(record) {
      // Always save locally first (offline-first)
      const result = await storage.add(storeName, record);

      // Try to push to API immediately if available
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try {
          // Send to server — remove 'local' userId, server sets it from auth
          const serverRecord = { ...record };
          if (serverRecord.userId === 'local') delete serverRecord.userId;

          await apiFetch(apiUrl, `/api/${apiTable}`, {
            method: 'POST',
            body: JSON.stringify(serverRecord),
          });
          // Immediate push succeeded — no need to queue
        } catch {
          // Immediate push failed — queue for later sync
          addToSyncQueue('create', storeName, record).catch(() => {});
        }
      }

      return result;
    },

    async update(id, changes) {
      // Update locally first
      const existing = await storage.getById(storeName, id);
      const updated = { ...existing, ...changes };
      await storage.update(storeName, updated);

      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try {
          await apiFetch(apiUrl, `/api/${apiTable}/${id}`, {
            method: 'PUT',
            body: JSON.stringify(changes),
          });
          // Immediate push succeeded — no need to queue
        } catch {
          // Queue for later sync
          addToSyncQueue('update', storeName, updated).catch(() => {});
        }
      }

      return updated;
    },

    async remove(id) {
      await storage.remove(storeName, id);

      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        try {
          await apiFetch(apiUrl, `/api/${apiTable}/${id}`, { method: 'DELETE' });
          // Immediate push succeeded — no need to queue
        } catch {
          // Queue for later sync
          addToSyncQueue('delete', storeName, { id }).catch(() => {});
        }
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

// Feedback (bug reports & suggestions)
export const feedbackApi = {
  async submit(data) {
    const apiUrl = await getApiUrl();
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required to submit feedback.');
    return apiFetch(apiUrl, '/api/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
  async list() {
    const apiUrl = await getApiUrl();
    if (!isApiMode(apiUrl)) return [];
    return apiFetch(apiUrl, '/api/feedback');
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
