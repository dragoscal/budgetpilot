import { getAll, add, update, clearStore, getSetting, setSetting, importAll, exportAll } from './storage';

// ─── SYNC ENGINE ──────────────────────────────────────────
// Handles bidirectional sync between IndexedDB and the backend API

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
    synced: false,
  });
}

// Push all queued changes to the backend
export async function processSyncQueue() {
  const apiUrl = await getSetting('apiUrl');
  if (!apiUrl) return { synced: 0, failed: 0 };

  const queue = await getAll('syncQueue');
  const pending = queue.filter((q) => !q.synced);
  if (pending.length === 0) return { synced: 0, failed: 0 };

  try {
    const headers = await getAuthHeaders();
    const changes = pending.map((item) => ({
      table: item.store,
      action: item.action,
      data: item.data,
    }));

    const res = await fetch(`${apiUrl}/api/sync/push`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ changes }),
    });

    if (!res.ok) throw new Error('Sync push failed');

    const result = await res.json();
    const synced = result.results?.filter(r => r.status === 'ok').length || 0;
    const failed = result.results?.filter(r => r.status === 'error').length || 0;

    // Clear successfully synced items
    if (synced > 0) {
      await clearStore('syncQueue');
    }

    return { synced, failed };
  } catch (err) {
    console.error('Sync push error:', err);
    return { synced: 0, failed: pending.length };
  }
}

// Pull all changes from the backend since the last sync
export async function pullFromServer() {
  const apiUrl = await getSetting('apiUrl');
  if (!apiUrl) return null;

  try {
    const lastSync = await getSetting('lastSyncAt') || '1970-01-01T00:00:00.000Z';
    const headers = await getAuthHeaders();

    const res = await fetch(`${apiUrl}/api/sync/pull?since=${encodeURIComponent(lastSync)}`, { headers });
    if (!res.ok) throw new Error('Sync pull failed');

    const result = await res.json();

    // Import pulled data (merge, don't overwrite)
    if (result.data) {
      for (const [storeName, records] of Object.entries(result.data)) {
        for (const record of records) {
          try {
            // Upsert: try update first, then add
            await update(storeName, record).catch(() => add(storeName, record));
          } catch (e) {
            // Ignore conflicts
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
          for (const [key, value] of Object.entries(settingsData.data)) {
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

  return {
    pushed: pushResult,
    pulled: pullResult ? 'success' : 'skipped',
    timestamp: new Date().toISOString(),
  };
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

// Auto-sync: runs periodically in background
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
  fullSync().catch(() => {});
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
