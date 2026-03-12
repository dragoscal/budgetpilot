import * as storage from './storage';
import { getSetting } from './storage';

// Table name mapping: IndexedDB store names → API path names
const TABLE_MAP = {
  debtPayments: 'debt_payments',
  loanPayments: 'loan_payments',
  familyMembers: 'family_members',
  sharedExpenses: 'shared_expenses',
};

// Reverse: API table names → IndexedDB store names
const REVERSE_TABLE_MAP = {
  debt_payments: 'debtPayments',
  loan_payments: 'loanPayments',
  family_members: 'familyMembers',
  shared_expenses: 'sharedExpenses',
  settlement_history: 'settlementHistory',
};

function toApiTable(storeName) {
  return TABLE_MAP[storeName] || storeName;
}

function toLocalStore(serverTable) {
  return REVERSE_TABLE_MAP[serverTable] || serverTable;
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
    // Handle 401 Unauthorized — token expired or invalid
    if (res.status === 401) {
      sessionStorage.removeItem('bp_token');
      localStorage.removeItem('bp_token');
      // Dispatch event so AuthContext can react and log out the user
      window.dispatchEvent(new CustomEvent('auth-expired'));
      throw new Error('Session expired. Please log in again.');
    }
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `API error ${res.status}`);
  }
  const data = await res.json();
  return data.data !== undefined ? data.data : data;
}

// ─── SERVER-FIRST CRUD ───────────────────────────────────
// In API mode: server is source of truth. IndexedDB is a read cache.
// In local mode (no apiUrl): operates on IndexedDB only.
//
// IMPORTANT: getAll() returns server data directly (in-memory filter)
// to avoid race conditions with pullAllDataToCache(). Cache is updated
// in the background, so stale reads from IndexedDB don't affect the UI.
function applyFilters(records, filters) {
  if (!filters || Object.keys(filters).length === 0) return records;
  return records.filter((record) =>
    Object.entries(filters).every(([key, value]) => {
      if (value === undefined || value === null || value === '') return true;
      if (Array.isArray(value)) return value.includes(record[key]);
      return record[key] === value;
    })
  );
}

function createCrud(storeName) {
  const apiTable = toApiTable(storeName);

  return {
    async getAll(filters = {}) {
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl) && getAuthToken()) {
        try {
          const data = await apiFetch(apiUrl, `/api/${apiTable}?limit=10000`);
          const records = Array.isArray(data) ? data : [];
          // Update local cache in background (non-blocking) using atomic bulkImport
          storage.clearStore(storeName)
            .then(() => storage.bulkImport(storeName, records))
            .catch((err) => console.warn(`Background cache update failed for ${storeName}:`, err.message));
          // Return server data directly — no IndexedDB round-trip, no race condition
          return applyFilters(records, filters);
        } catch (err) {
          // Server unreachable — fall back to cached data
          console.warn(`Server fetch failed for ${storeName}, using cache:`, err.message);
          return storage.getAll(storeName, filters);
        }
      }
      // Local-only mode
      return storage.getAll(storeName, filters);
    },

    async getById(id) {
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl) && getAuthToken()) {
        try {
          const record = await apiFetch(apiUrl, `/api/${apiTable}/${id}`);
          await storage.update(storeName, record).catch(() => storage.add(storeName, record));
          return record;
        } catch {
          return storage.getById(storeName, id);
        }
      }
      return storage.getById(storeName, id);
    },

    async create(record) {
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl) && getAuthToken()) {
        if (!navigator.onLine) throw new Error('You are offline. Cannot save right now.');
        const serverRecord = { ...record };
        if (serverRecord.userId === 'local') delete serverRecord.userId;
        await apiFetch(apiUrl, `/api/${apiTable}`, {
          method: 'POST',
          body: JSON.stringify(serverRecord),
        });
        // Server succeeded — update local cache
        await storage.add(storeName, record);
        return record;
      }
      // Local-only mode
      return storage.add(storeName, record);
    },

    async update(idOrRecord, changes) {
      let id, updated;
      if (changes === undefined && typeof idOrRecord === 'object' && idOrRecord !== null) {
        id = idOrRecord.id;
        updated = { ...idOrRecord, updatedAt: new Date().toISOString() };
      } else {
        id = idOrRecord;
        const existing = await storage.getById(storeName, id);
        updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      }

      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        if (!navigator.onLine) throw new Error('You are offline. Cannot save right now.');
        const serverData = { ...updated };
        if (serverData.userId === 'local') delete serverData.userId;
        await apiFetch(apiUrl, `/api/${apiTable}/${id}`, {
          method: 'PUT',
          body: JSON.stringify(serverData),
        });
        // Server succeeded — update local cache
        await storage.update(storeName, updated);
        return updated;
      }
      // Local-only mode
      await storage.update(storeName, updated);
      return updated;
    },

    async remove(id) {
      const apiUrl = await getApiUrl();
      if (isApiMode(apiUrl)) {
        if (!navigator.onLine) throw new Error('You are offline. Cannot delete right now.');
        await apiFetch(apiUrl, `/api/${apiTable}/${id}`, { method: 'DELETE' });
        // Server succeeded — remove from local cache
        await storage.remove(storeName, id);
        return;
      }
      // Local-only mode
      await storage.remove(storeName, id);
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
export const loans = createCrud('loans');
export const loanPayments = createCrud('loanPayments');
export const families = createCrud('families');
export const familyMembers = createCrud('familyMembers');
export const sharedExpenses = createCrud('sharedExpenses');
export const challenges = createCrud('challenges');
export const settlementHistory = createCrud('settlementHistory');

// ─── FAMILY-SPECIFIC API (scoped endpoints) ─────────────
export const familyApi = {
  /** Get ALL members of a family (real + virtual), bypassing userId filter */
  async getAllMembers(familyId) {
    const apiUrl = await getApiUrl();
    if (!isApiMode(apiUrl) || !getAuthToken()) {
      // Local-only fallback: return cached family members for this family
      const all = await storage.getAll('familyMembers');
      return all.filter((m) => m.familyId === familyId);
    }
    return apiFetch(apiUrl, `/api/families/${familyId}/members`);
  },

  /** Add a virtual member to a family (no account required) */
  async addVirtualMember(familyId, displayName, emoji) {
    const apiUrl = await getApiUrl();
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required to add members.');
    const member = await apiFetch(apiUrl, `/api/families/${familyId}/members`, {
      method: 'POST',
      body: JSON.stringify({ displayName, emoji }),
    });
    // Cache locally
    await storage.add('familyMembers', member);
    return member;
  },

  /** Remove a virtual member from a family */
  async removeVirtualMember(familyId, memberId) {
    const apiUrl = await getApiUrl();
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required to remove members.');
    await apiFetch(apiUrl, `/api/families/${familyId}/members/${memberId}`, {
      method: 'DELETE',
    });
    // Remove from cache
    await storage.remove('familyMembers', memberId);
  },

  /** Link a virtual member to a real account (merges them) */
  async linkVirtualToReal(familyId, virtualMemberId, realMemberId) {
    const apiUrl = await getApiUrl();
    if (!isApiMode(apiUrl)) throw new Error('Backend connection required.');
    const result = await apiFetch(apiUrl, `/api/families/${familyId}/members/${virtualMemberId}/link`, {
      method: 'PUT',
      body: JSON.stringify({ realMemberId }),
    });
    // Remove virtual member from local cache (it was deleted server-side)
    await storage.remove('familyMembers', virtualMemberId);
    return result;
  },
};

// ─── SETTINGS ────────────────────────────────────────────
export const settings = {
  async get(key) {
    return storage.getSetting(key);
  },

  async set(key, value) {
    await storage.setSetting(key, value);
    const apiUrl = await getApiUrl();
    if (isApiMode(apiUrl)) {
      try {
        await apiFetch(apiUrl, `/api/settings`, {
          method: 'PUT',
          body: JSON.stringify({ [key]: value }),
        });
      } catch (err) {
        console.error('Failed to push setting to server:', err);
      }
    }
  },

  async getAll() {
    return storage.getAllSettings();
  },
};

// ─── PULL ALL DATA TO CACHE (on login) ──────────────────
// Uses atomic bulkImport per table to avoid race conditions with getAll().
let _cacheReady = false;
let _cacheReadyPromise = null;
let _cacheReadyResolve = null;

export function isCacheReady() { return _cacheReady; }
export function waitForCacheReady() {
  if (_cacheReady) return Promise.resolve();
  if (!_cacheReadyPromise) {
    _cacheReadyPromise = new Promise(resolve => { _cacheReadyResolve = resolve; });
  }
  return _cacheReadyPromise;
}

/** Reset cache readiness state (call on logout so next login re-populates) */
export function resetCacheReady() {
  _cacheReady = false;
  _cacheReadyPromise = null;
  _cacheReadyResolve = null;
}

export async function pullAllDataToCache() {
  const apiUrl = await getApiUrl();
  if (!isApiMode(apiUrl) || !getAuthToken()) {
    _cacheReady = true;
    if (_cacheReadyResolve) _cacheReadyResolve();
    return;
  }

  try {
    const data = await apiFetch(apiUrl, '/api/sync/pull?since=1970-01-01T00:00:00.000Z&limit=10000');
    if (data) {
      const tables = data.data || data;
      for (const [serverTable, records] of Object.entries(tables)) {
        if (serverTable === 'syncedAt') continue;
        const localStore = toLocalStore(serverTable);
        try {
          // Atomic: clear + bulk write in a single IndexedDB transaction
          await storage.clearStore(localStore);
          if (Array.isArray(records) && records.length > 0) {
            await storage.bulkImport(localStore, records);
          }
        } catch (err) {
          console.warn(`Failed to cache ${localStore}:`, err.message);
        }
      }
    }

    // Also pull settings from server and cache locally
    try {
      const settingsRes = await apiFetch(apiUrl, '/api/settings');
      const serverSettings = settingsRes?.data || settingsRes || {};
      for (const [key, value] of Object.entries(serverSettings)) {
        await storage.setSetting(key, value);
      }
      // Notify contexts that settings were updated from server
      window.dispatchEvent(new Event('settings-synced'));
    } catch (err) {
      console.warn('Failed to pull settings from server:', err.message);
    }
  } catch (err) {
    console.error('Failed to pull data to cache:', err);
  } finally {
    _cacheReady = true;
    if (_cacheReadyResolve) _cacheReadyResolve();
    window.dispatchEvent(new Event('cache-ready'));
  }
}

// ─── FEEDBACK ────────────────────────────────────────────
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

// ─── DATA MANAGEMENT ─────────────────────────────────────
export async function exportData() {
  return storage.exportAll();
}

export async function importData(data) {
  return storage.importAll(data);
}

export async function clearData() {
  const apiUrl = await getApiUrl();
  if (isApiMode(apiUrl) && getAuthToken()) {
    try {
      await apiFetch(apiUrl, '/api/data/clear', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear server data:', err);
      throw new Error('Failed to clear server data: ' + err.message);
    }
  }
  return storage.clearAllData();
}

export async function deleteAllTransactions() {
  const apiUrl = await getApiUrl();
  if (isApiMode(apiUrl) && getAuthToken()) {
    await apiFetch(apiUrl, '/api/transactions/all', { method: 'DELETE' });
  }
  await storage.clearStore('transactions');
}

export async function undoImportBatch(batchId) {
  const apiUrl = await getApiUrl();
  if (isApiMode(apiUrl) && getAuthToken()) {
    const result = await apiFetch(apiUrl, `/api/transactions/batch/${batchId}`, { method: 'DELETE' });
    // Remove only the batch transactions from cache instead of clearing entire store
    const allTx = await storage.getAll('transactions');
    const batchTx = allTx.filter((t) => t.importBatch === batchId);
    for (const tx of batchTx) await storage.remove('transactions', tx.id);
    return result;
  }
  const allTx = await storage.getAll('transactions');
  const batchTx = allTx.filter((t) => t.importBatch === batchId);
  for (const tx of batchTx) await storage.remove('transactions', tx.id);
  return { deleted: batchTx.length };
}

export async function getLastImportBatch() {
  const apiUrl = await getApiUrl();
  let txList;
  if (isApiMode(apiUrl) && getAuthToken()) {
    txList = await apiFetch(apiUrl, '/api/transactions?limit=10000');
  } else {
    txList = await storage.getAll('transactions');
  }
  const withBatch = (Array.isArray(txList) ? txList : []).filter((t) => t.importBatch);
  if (withBatch.length === 0) return null;
  withBatch.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  const latestBatchId = withBatch[0].importBatch;
  const batchTx = withBatch.filter((t) => t.importBatch === latestBatchId);
  return { batchId: latestBatchId, count: batchTx.length, source: batchTx[0]?.source, createdAt: batchTx[0]?.createdAt };
}
