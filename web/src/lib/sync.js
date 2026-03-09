import { getAll, getById, add, update, remove, clearStore, getSetting, setSetting } from './storage';

// ─── SYNC ENGINE ──────────────────────────────────────────
// Handles bidirectional sync between IndexedDB and the backend API

// Table name mapping: IndexedDB store names ↔ D1 table names
const TABLE_MAP = {
  debtPayments: 'debt_payments',
};

const REVERSE_TABLE_MAP = {
  debt_payments: 'debtPayments',
};

function toServerTable(storeName) {
  return TABLE_MAP[storeName] || storeName;
}

function toLocalStore(tableName) {
  return REVERSE_TABLE_MAP[tableName] || tableName;
}

function hasAuthToken() {
  return !!(sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token'));
}

async function getAuthHeaders() {
  const token = sessionStorage.getItem('bp_token') || localStorage.getItem('bp_token');
  const apiKey = await getSetting('apiKey');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  else if (apiKey) headers['x-api-key'] = apiKey;
  return headers;
}

// Add a change to the sync queue
export async function addToSyncQueue(action, store, data) {
  await add('syncQueue', {
    id: `sync_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    action, // 'create' | 'update' | 'delete'
    store,
    data,
    timestamp: new Date().toISOString(),
    retries: 0,
    synced: false,
  });
}

// Push all queued changes to the backend
export async function processSyncQueue() {
  const apiUrl = await getSetting('apiUrl');
  if (!apiUrl || !hasAuthToken()) return { synced: 0, failed: 0 };

  const queue = await getAll('syncQueue');
  const pending = queue.filter((q) => !q.synced);
  if (pending.length === 0) return { synced: 0, failed: 0 };

  try {
    const headers = await getAuthHeaders();

    // Map table names for the server and clean up data
    const changes = pending.map((item) => {
      const serverData = { ...item.data };
      // Remove 'local' userId — server will inject the real one
      if (serverData.userId === 'local') delete serverData.userId;

      return {
        table: toServerTable(item.store),
        action: item.action,
        data: serverData,
      };
    });

    const res = await fetch(`${apiUrl}/api/sync/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ changes }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('Sync push failed:', res.status, errBody);
      // Increment retry count for all pending items
      for (const item of pending) {
        await update('syncQueue', { ...item, retries: (item.retries || 0) + 1 });
      }
      return { synced: 0, failed: pending.length };
    }

    const result = await res.json();
    const results = result.results || [];

    let synced = 0;
    let failed = 0;

    // Process results individually — only remove successfully synced items
    for (let i = 0; i < pending.length; i++) {
      const serverResult = results[i];
      if (serverResult?.status === 'ok') {
        // Remove this item from the sync queue
        await remove('syncQueue', pending[i].id);
        synced++;
      } else {
        // Mark as failed with incremented retry count
        const retries = (pending[i].retries || 0) + 1;
        if (retries >= 5) {
          // Give up after 5 retries — remove to prevent infinite loop
          console.warn('Sync item failed 5 times, discarding:', pending[i]);
          await remove('syncQueue', pending[i].id);
        } else {
          await update('syncQueue', { ...pending[i], retries });
        }
        failed++;
      }
    }

    return { synced, failed };
  } catch (err) {
    console.error('Sync push error:', err);
    // Increment retry count for all pending items
    for (const item of pending) {
      try {
        await update('syncQueue', { ...item, retries: (item.retries || 0) + 1 });
      } catch {}
    }
    return { synced: 0, failed: pending.length };
  }
}

// Pull all changes from the backend since the last sync
export async function pullFromServer() {
  const apiUrl = await getSetting('apiUrl');
  if (!apiUrl || !hasAuthToken()) return null;

  try {
    const lastSync = await getSetting('lastSyncAt') || '1970-01-01T00:00:00.000Z';
    const headers = await getAuthHeaders();

    const res = await fetch(`${apiUrl}/api/sync/pull?since=${encodeURIComponent(lastSync)}`, { headers });
    if (!res.ok) {
      console.error('Sync pull failed:', res.status);
      return null;
    }

    const result = await res.json();
    let importedCount = 0;

    // Import pulled data (merge, don't overwrite)
    if (result.data) {
      for (const [serverTable, records] of Object.entries(result.data)) {
        const storeName = toLocalStore(serverTable);
        for (const record of records) {
          try {
            // Remap server userId to 'local' for local storage compatibility
            const localRecord = { ...record, userId: 'local' };

            // Conflict resolution: server wins if updatedAt is newer
            const existing = await getById(storeName, localRecord.id).catch(() => null);
            if (existing) {
              // Server record is newer or equal — update
              if (!existing.updatedAt || localRecord.updatedAt >= existing.updatedAt) {
                await update(storeName, localRecord);
                importedCount++;
              }
            } else {
              // New record from server — add locally
              await add(storeName, localRecord);
              importedCount++;
            }
          } catch (e) {
            console.warn('Pull import error for record:', record.id, e);
          }
        }
      }
    }

    // Pull settings from server and merge into local
    try {
      const settingsRes = await fetch(`${apiUrl}/api/settings`, { headers });
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        if (settingsData.data) {
          // Don't overwrite local-only settings
          const skipKeys = new Set(['apiUrl', 'apiKey', 'anthropicApiKey', 'openaiApiKey', 'openrouterApiKey', 'lastSyncAt']);
          for (const [key, value] of Object.entries(settingsData.data)) {
            if (skipKeys.has(key)) continue;
            const local = await getSetting(key);
            if (!local) await setSetting(key, typeof value === 'string' ? value : JSON.stringify(value));
          }
        }
      }
    } catch {}

    // Update last sync timestamp
    if (result.syncedAt) {
      await setSetting('lastSyncAt', result.syncedAt);
    }

    console.log(`Sync pull: imported ${importedCount} records`);
    return result;
  } catch (err) {
    console.error('Sync pull error:', err);
    return null;
  }
}

// Full sync: push then pull
export async function fullSync() {
  const pushResult = await processSyncQueue();
  const pullResult = await pullFromServer();

  const result = {
    pushed: pushResult,
    pulled: pullResult ? 'success' : 'skipped',
    timestamp: new Date().toISOString(),
  };

  // Notify listeners
  syncListeners.forEach((fn) => {
    try { fn(result); } catch {}
  });

  return result;
}

// Get sync status
export async function getSyncStatus() {
  const apiUrl = await getSetting('apiUrl');
  const queue = await getAll('syncQueue');
  const lastSync = await getSetting('lastSyncAt');

  return {
    isOnline: !!apiUrl,
    hasBackend: !!apiUrl,
    pendingChanges: queue.filter((q) => !q.synced).length,
    lastSync: lastSync || null,
  };
}

// ─── Sync Event System ──────────────────────────────────
const syncListeners = new Set();

export function onSyncComplete(fn) {
  syncListeners.add(fn);
  return () => syncListeners.delete(fn);
}

// ─── Auto-sync: runs periodically in background ─────────
let syncInterval = null;

export function startAutoSync(intervalMs = 60000) {
  if (syncInterval) clearInterval(syncInterval);

  syncInterval = setInterval(async () => {
    try {
      await fullSync();
    } catch (e) {
      console.error('Auto-sync error:', e);
    }
  }, intervalMs);

  // Also sync immediately
  fullSync().catch((e) => console.error('Initial sync error:', e));

  console.log('Auto-sync started (interval:', intervalMs, 'ms)');
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log('Auto-sync stopped');
  }
}

export function isAutoSyncRunning() {
  return syncInterval !== null;
}
