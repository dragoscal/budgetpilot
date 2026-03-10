import { openDB } from 'idb';

const DB_NAME = 'budgetpilot';
const DB_VERSION = 9;

let dbPromise = null;

// Close stale connections on HMR so version upgrades aren't blocked
if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    if (dbPromise) {
      try { const db = await dbPromise; db.close(); } catch { /* Intentionally swallowed — HMR cleanup is best-effort */ }
      dbPromise = null;
    }
  });
}

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          // Transactions
          const txStore = db.createObjectStore('transactions', { keyPath: 'id' });
          txStore.createIndex('date', 'date');
          txStore.createIndex('category', 'category');
          txStore.createIndex('type', 'type');
          txStore.createIndex('merchant', 'merchant');
          txStore.createIndex('userId', 'userId');

          // Budgets
          const budgetStore = db.createObjectStore('budgets', { keyPath: 'id' });
          budgetStore.createIndex('category', 'category');
          budgetStore.createIndex('userId', 'userId');

          // Goals
          const goalStore = db.createObjectStore('goals', { keyPath: 'id' });
          goalStore.createIndex('type', 'type');
          goalStore.createIndex('userId', 'userId');

          // Accounts
          const accountStore = db.createObjectStore('accounts', { keyPath: 'id' });
          accountStore.createIndex('type', 'type');
          accountStore.createIndex('userId', 'userId');

          // Recurring
          const recurringStore = db.createObjectStore('recurring', { keyPath: 'id' });
          recurringStore.createIndex('category', 'category');
          recurringStore.createIndex('userId', 'userId');

          // Settings (key-value)
          db.createObjectStore('settings', { keyPath: 'key' });

          // People
          const peopleStore = db.createObjectStore('people', { keyPath: 'id' });
          peopleStore.createIndex('userId', 'userId');

          // Debts
          const debtStore = db.createObjectStore('debts', { keyPath: 'id' });
          debtStore.createIndex('personId', 'personId');
          debtStore.createIndex('status', 'status');
          debtStore.createIndex('userId', 'userId');

          // Debt payments
          const debtPaymentStore = db.createObjectStore('debtPayments', { keyPath: 'id' });
          debtPaymentStore.createIndex('debtId', 'debtId');

          // Wishlist
          const wishlistStore = db.createObjectStore('wishlist', { keyPath: 'id' });
          wishlistStore.createIndex('status', 'status');
          wishlistStore.createIndex('userId', 'userId');

          // Users
          db.createObjectStore('users', { keyPath: 'id' });

          // Sync queue
          const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
          syncStore.createIndex('timestamp', 'timestamp');
        }

        if (oldVersion < 2) {
          // Receipts history
          const receiptStore = db.createObjectStore('receipts', { keyPath: 'id' });
          receiptStore.createIndex('processedAt', 'processedAt');
          receiptStore.createIndex('userId', 'userId');
        }

        // Versions 3-4 consumed by HMR in dev — receipt drafts added at v5
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains('receiptDrafts')) {
            const draftStore = db.createObjectStore('receiptDrafts', { keyPath: 'id' });
            draftStore.createIndex('savedAt', 'savedAt');
          }
        }

        // v6: Bank loans
        if (oldVersion < 6) {
          if (!db.objectStoreNames.contains('loans')) {
            const loanStore = db.createObjectStore('loans', { keyPath: 'id' });
            loanStore.createIndex('type', 'type');
            loanStore.createIndex('status', 'status');
            loanStore.createIndex('userId', 'userId');
          }
          if (!db.objectStoreNames.contains('loanPayments')) {
            const lpStore = db.createObjectStore('loanPayments', { keyPath: 'id' });
            lpStore.createIndex('loanId', 'loanId');
            lpStore.createIndex('date', 'date');
          }
        }

        // v7: Family system + shared expenses
        if (oldVersion < 7) {
          if (!db.objectStoreNames.contains('families')) {
            const familyStore = db.createObjectStore('families', { keyPath: 'id' });
            familyStore.createIndex('createdBy', 'createdBy');
          }
          if (!db.objectStoreNames.contains('familyMembers')) {
            const memberStore = db.createObjectStore('familyMembers', { keyPath: 'id' });
            memberStore.createIndex('familyId', 'familyId');
            memberStore.createIndex('userId', 'userId');
          }
          if (!db.objectStoreNames.contains('sharedExpenses')) {
            const sharedStore = db.createObjectStore('sharedExpenses', { keyPath: 'id' });
            sharedStore.createIndex('familyId', 'familyId');
            sharedStore.createIndex('paidByUserId', 'paidByUserId');
            sharedStore.createIndex('date', 'date');
          }
        }

        // v8: Spending challenges
        if (oldVersion < 8) {
          if (!db.objectStoreNames.contains('challenges')) {
            const challengeStore = db.createObjectStore('challenges', { keyPath: 'id' });
            challengeStore.createIndex('userId', 'userId');
            challengeStore.createIndex('status', 'status');
          }
        }

        // v9: In-app notifications
        if (oldVersion < 9) {
          if (!db.objectStoreNames.contains('notifications')) {
            const notifStore = db.createObjectStore('notifications', { keyPath: 'id' });
            notifStore.createIndex('read', 'read');
            notifStore.createIndex('createdAt', 'createdAt');
          }
        }
      },
      blocked(currentVersion, blockedVersion) {
        // Old connections are blocking the upgrade — force reload
        console.warn(`IndexedDB upgrade blocked: v${currentVersion} → v${blockedVersion}. Reloading...`);
        window.location.reload();
      },
    });
  }
  return dbPromise;
}

export async function getAll(store, filters = {}) {
  const db = await getDB();
  let records = await db.getAll(store);

  // Apply filters
  if (Object.keys(filters).length > 0) {
    records = records.filter((record) =>
      Object.entries(filters).every(([key, value]) => {
        if (value === undefined || value === null || value === '') return true;
        if (Array.isArray(value)) return value.includes(record[key]);
        return record[key] === value;
      })
    );
  }

  return records;
}

export async function getById(store, id) {
  const db = await getDB();
  return db.get(store, id);
}

export async function add(store, record) {
  const db = await getDB();
  await db.put(store, { ...record, updatedAt: new Date().toISOString() });
  return record;
}

export async function update(store, idOrRecord, changes) {
  const db = await getDB();
  // Support both: update(store, id, changes) and update(store, fullRecord)
  if (changes === undefined && typeof idOrRecord === 'object' && idOrRecord !== null) {
    const record = { ...idOrRecord, updatedAt: new Date().toISOString() };
    await db.put(store, record);
    return record;
  }
  const existing = await db.get(store, idOrRecord);
  if (!existing) throw new Error(`Record ${idOrRecord} not found in ${store}`);
  const updated = { ...existing, ...changes, updatedAt: new Date().toISOString() };
  await db.put(store, updated);
  return updated;
}

export async function remove(store, id) {
  const db = await getDB();
  await db.delete(store, id);
}

export async function bulkImport(store, records) {
  const db = await getDB();
  const tx = db.transaction(store, 'readwrite');
  for (const record of records) {
    await tx.store.put(record);
  }
  await tx.done;
}

export async function clearStore(store) {
  const db = await getDB();
  await db.clear(store);
}

export async function exportAll() {
  const db = await getDB();
  const stores = [
    'transactions', 'budgets', 'goals', 'accounts', 'recurring', 'settings',
    'people', 'debts', 'debtPayments', 'wishlist', 'loans', 'loanPayments',
    'families', 'familyMembers', 'sharedExpenses', 'challenges', 'receipts',
  ];
  const data = {};
  for (const store of stores) {
    if (db.objectStoreNames.contains(store)) {
      data[store] = await db.getAll(store);
    }
  }
  data._exportDate = new Date().toISOString();
  data._version = DB_VERSION;
  return data;
}

export async function importAll(data, { merge = false } = {}) {
  const db = await getDB();
  const stores = [
    'transactions', 'budgets', 'goals', 'accounts', 'recurring', 'settings',
    'people', 'debts', 'debtPayments', 'wishlist', 'loans', 'loanPayments',
    'families', 'familyMembers', 'sharedExpenses', 'challenges', 'receipts',
  ];
  const stats = { imported: 0, skipped: 0, overwritten: 0 };

  for (const store of stores) {
    if (data[store] && Array.isArray(data[store]) && db.objectStoreNames.contains(store)) {
      const tx = db.transaction(store, 'readwrite');

      if (!merge) {
        // Full replace mode (original behavior)
        await tx.store.clear();
        for (const record of data[store]) {
          await tx.store.put(record);
          stats.imported++;
        }
      } else {
        // Merge mode: skip records with same ID unless incoming is newer
        for (const record of data[store]) {
          const existing = await tx.store.get(record.id);
          if (existing) {
            const existingTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
            const incomingTime = record.updatedAt ? new Date(record.updatedAt).getTime() : 0;
            if (incomingTime > existingTime) {
              await tx.store.put(record);
              stats.overwritten++;
            } else {
              stats.skipped++;
            }
          } else {
            await tx.store.put(record);
            stats.imported++;
          }
        }
      }
      await tx.done;
    }
  }
  return stats;
}

export async function clearAllData() {
  const db = await getDB();
  const stores = [
    'transactions', 'budgets', 'goals', 'accounts', 'recurring',
    'people', 'debts', 'debtPayments', 'wishlist', 'loans', 'loanPayments',
    'families', 'familyMembers', 'sharedExpenses', 'challenges', 'receipts', 'receiptDrafts',
  ];
  for (const store of stores) {
    if (db.objectStoreNames.contains(store)) {
      await db.clear(store);
    }
  }
}

// Settings helpers
export async function getSetting(key) {
  const { DEFAULT_SETTINGS } = await import('./constants.js');
  const db = await getDB();
  const record = await db.get('settings', key);
  const val = record?.value;
  // Fall back to default if missing OR empty string (for URL-type settings)
  if ((val === undefined || val === null || val === '') && DEFAULT_SETTINGS[key]) {
    return DEFAULT_SETTINGS[key];
  }
  return val;
}

export async function setSetting(key, value) {
  const db = await getDB();
  await db.put('settings', { key, value, updatedAt: new Date().toISOString() });
}

export async function getAllSettings() {
  const { DEFAULT_SETTINGS } = await import('./constants.js');
  const db = await getDB();
  const records = await db.getAll('settings');
  const saved = records.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

// ─── OPTIMIZED QUERIES (using IndexedDB indexes) ──────────

/**
 * Get transactions for a specific month using the date index.
 * month is 0-based (0 = January) for backwards-compat with callers using Date.getMonth().
 * Falls back to userId post-filter since date is the primary range key.
 */
export async function getTransactionsByMonth(year, month, userId = 'local') {
  const db = await getDB();
  // month is 0-based from callers (Date.getMonth()), convert to 1-based for ISO strings
  const m = month + 1;
  const startDate = `${year}-${String(m).padStart(2, '0')}-01`;
  const endMonth = m === 12 ? 1 : m + 1;
  const endYear = m === 12 ? year + 1 : year;
  const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  const range = IDBKeyRange.bound(startDate, endDate, false, true);
  const results = await db.getAllFromIndex('transactions', 'date', range);
  return userId ? results.filter((t) => t.userId === userId) : results;
}

/**
 * Get transactions within a date range using the date index.
 * startDate/endDate should be ISO date strings (YYYY-MM-DD).
 * endDate is inclusive.
 */
export async function getTransactionsByDateRange(startDate, endDate, userId = 'local') {
  const db = await getDB();
  const range = IDBKeyRange.bound(startDate, endDate, false, false);
  const results = await db.getAllFromIndex('transactions', 'date', range);
  return userId ? results.filter((t) => t.userId === userId) : results;
}

/**
 * Get transactions by category using the category index.
 */
export async function getTransactionsByCategory(category, userId = 'local') {
  const db = await getDB();
  const results = await db.getAllFromIndex('transactions', 'category', category);
  return userId ? results.filter((t) => t.userId === userId) : results;
}

/**
 * Get transactions by type ('income' | 'expense') using the type index.
 */
export async function getTransactionsByType(type, userId = 'local') {
  const db = await getDB();
  const results = await db.getAllFromIndex('transactions', 'type', type);
  return userId ? results.filter((t) => t.userId === userId) : results;
}

/**
 * Get transactions by merchant using the merchant index.
 */
export async function getTransactionsByMerchant(merchant, userId = 'local') {
  const db = await getDB();
  const results = await db.getAllFromIndex('transactions', 'merchant', merchant);
  return userId ? results.filter((t) => t.userId === userId) : results;
}

/**
 * Generic: get all records from any store filtered by the userId index.
 * Works for: transactions, budgets, goals, accounts, recurring, people,
 *            debts, wishlist, loans, receipts, challenges.
 */
export async function getByUserId(store, userId) {
  const db = await getDB();
  return db.getAllFromIndex(store, 'userId', userId);
}

/**
 * Get all records from any store by a named index and key.
 * Generic escape hatch for one-off index lookups.
 * Example: getByIndex('debts', 'status', 'active')
 */
export async function getByIndex(store, indexName, key) {
  const db = await getDB();
  return db.getAllFromIndex(store, indexName, key);
}

/**
 * Get all records from a store by index within a key range.
 * Example: getByIndexRange('loanPayments', 'date', '2026-01-01', '2026-03-31')
 */
export async function getByIndexRange(store, indexName, lower, upper, lowerOpen = false, upperOpen = false) {
  const db = await getDB();
  const range = IDBKeyRange.bound(lower, upper, lowerOpen, upperOpen);
  return db.getAllFromIndex(store, indexName, range);
}

/**
 * Get debt payments for a specific debt using the debtId index.
 */
export async function getDebtPaymentsByDebtId(debtId) {
  const db = await getDB();
  return db.getAllFromIndex('debtPayments', 'debtId', debtId);
}

/**
 * Get loan payments for a specific loan using the loanId index.
 */
export async function getLoanPaymentsByLoanId(loanId) {
  const db = await getDB();
  return db.getAllFromIndex('loanPayments', 'loanId', loanId);
}

/**
 * Get debts by status ('active' | 'settled') using the status index.
 */
export async function getDebtsByStatus(status, userId = 'local') {
  const db = await getDB();
  const results = await db.getAllFromIndex('debts', 'status', status);
  return userId ? results.filter((d) => d.userId === userId) : results;
}

/**
 * Get debts for a specific person using the personId index.
 */
export async function getDebtsByPersonId(personId) {
  const db = await getDB();
  return db.getAllFromIndex('debts', 'personId', personId);
}

/**
 * Get family members by familyId using the familyId index.
 */
export async function getFamilyMembersByFamilyId(familyId) {
  const db = await getDB();
  return db.getAllFromIndex('familyMembers', 'familyId', familyId);
}

/**
 * Get shared expenses by familyId using the familyId index.
 */
export async function getSharedExpensesByFamilyId(familyId) {
  const db = await getDB();
  return db.getAllFromIndex('sharedExpenses', 'familyId', familyId);
}

/**
 * Get shared expenses by date range using the date index.
 */
export async function getSharedExpensesByDateRange(startDate, endDate) {
  const db = await getDB();
  const range = IDBKeyRange.bound(startDate, endDate, false, false);
  return db.getAllFromIndex('sharedExpenses', 'date', range);
}

/**
 * Get challenges by status using the status index.
 */
export async function getChallengesByStatus(status, userId = 'local') {
  const db = await getDB();
  const results = await db.getAllFromIndex('challenges', 'status', status);
  return userId ? results.filter((c) => c.userId === userId) : results;
}

/**
 * Count records in a store using an index (avoids fetching all records).
 * Uses a cursor to count without loading full objects into memory.
 */
export async function countByIndex(store, indexName, key) {
  const db = await getDB();
  return db.countFromIndex(store, indexName, key);
}

// ─── Receipt Drafts (save for later) ────────────────────────
export async function saveDraft(draft) {
  const db = await getDB();
  await db.put('receiptDrafts', draft);
  return draft;
}

export async function getDrafts() {
  const db = await getDB();
  const drafts = await db.getAll('receiptDrafts');
  return drafts.sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

export async function getDraftById(id) {
  const db = await getDB();
  return db.get('receiptDrafts', id);
}

export async function deleteDraft(id) {
  const db = await getDB();
  await db.delete('receiptDrafts', id);
}

export async function getDraftCount() {
  const db = await getDB();
  return (await db.getAll('receiptDrafts')).length;
}
