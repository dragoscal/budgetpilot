import { openDB } from 'idb';

const DB_NAME = 'budgetpilot';
const DB_VERSION = 8;

let dbPromise = null;

// Close stale connections on HMR so version upgrades aren't blocked
if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    if (dbPromise) {
      try { const db = await dbPromise; db.close(); } catch {}
      dbPromise = null;
    }
  });
}

function getDB() {
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
  const stores = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'settings', 'people', 'debts', 'debtPayments', 'wishlist', 'loans', 'loanPayments'];
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

export async function importAll(data) {
  const db = await getDB();
  const stores = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'settings', 'people', 'debts', 'debtPayments', 'wishlist', 'loans', 'loanPayments'];
  for (const store of stores) {
    if (data[store] && Array.isArray(data[store])) {
      const tx = db.transaction(store, 'readwrite');
      await tx.store.clear();
      for (const record of data[store]) {
        await tx.store.put(record);
      }
      await tx.done;
    }
  }
}

export async function clearAllData() {
  const db = await getDB();
  const stores = ['transactions', 'budgets', 'goals', 'accounts', 'recurring', 'people', 'debts', 'debtPayments', 'wishlist', 'loans', 'loanPayments'];
  for (const store of stores) {
    await db.clear(store);
  }
}

// Settings helpers
export async function getSetting(key) {
  const db = await getDB();
  const record = await db.get('settings', key);
  return record?.value;
}

export async function setSetting(key, value) {
  const db = await getDB();
  await db.put('settings', { key, value, updatedAt: new Date().toISOString() });
}

export async function getAllSettings() {
  const db = await getDB();
  const records = await db.getAll('settings');
  return records.reduce((acc, { key, value }) => {
    acc[key] = value;
    return acc;
  }, {});
}

// Query helpers
export async function getTransactionsByMonth(year, month, userId = 'local') {
  const all = await getAll('transactions', { userId });
  return all.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export async function getTransactionsByDateRange(startDate, endDate, userId = 'local') {
  const all = await getAll('transactions', { userId });
  const start = new Date(startDate);
  const end = new Date(endDate);
  return all.filter((t) => {
    const d = new Date(t.date);
    return d >= start && d <= end;
  });
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
