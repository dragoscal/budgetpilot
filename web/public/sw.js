// BudgetPilot Service Worker — Cache-first for app shell, network-first for data
const CACHE_NAME = 'budgetpilot-v2';
const STATIC_ASSETS = [
  '/',
  '/favicon.svg',
  '/manifest.json',
];

// Install — pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  // Don't skip waiting immediately — let the update notification flow work
});

// Activate — clean up old caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

// Listen for skip waiting message from the app
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Background Sync — replay pending operations when connectivity is restored
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-transactions') {
    event.waitUntil(
      (async () => {
        try {
          // Try to open IndexedDB and replay pending sync queue items
          const db = await new Promise((resolve, reject) => {
            const req = indexedDB.open('budgetpilot');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
          });

          // Read the apiUrl from settings
          const settingsTx = db.transaction('settings', 'readonly');
          const settingsStore = settingsTx.objectStore('settings');
          const apiUrlRecord = await new Promise((resolve) => {
            const req = settingsStore.get('apiUrl');
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
          });
          const apiUrl = apiUrlRecord?.value;

          if (apiUrl) {
            // Read all pending sync queue items
            const syncTx = db.transaction('syncQueue', 'readwrite');
            const syncStore = syncTx.objectStore('syncQueue');
            const allItems = await new Promise((resolve) => {
              const req = syncStore.getAll();
              req.onsuccess = () => resolve(req.result || []);
              req.onerror = () => resolve([]);
            });
            const pending = allItems.filter((q) => !q.synced);

            // Attempt to replay each pending item
            for (const item of pending) {
              try {
                const serverData = { ...item.data };
                if (serverData.userId === 'local') delete serverData.userId;

                const res = await fetch(`${apiUrl}/api/sync/push`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    changes: [{
                      table: item.store,
                      action: item.action,
                      data: serverData,
                    }],
                  }),
                });

                if (res.ok) {
                  // Remove from queue on success
                  const delTx = db.transaction('syncQueue', 'readwrite');
                  delTx.objectStore('syncQueue').delete(item.id);
                  await new Promise((resolve, reject) => {
                    delTx.oncomplete = resolve;
                    delTx.onerror = reject;
                  });
                }
              } catch {
                // Leave in queue for next sync attempt
              }
            }
          }

          db.close();
        } catch (err) {
          // IndexedDB may not be accessible in SW — fall through to client notification
          console.warn('SW background sync replay failed:', err);
        }

        // Always notify clients so they can also trigger a sync
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({ type: 'BACKGROUND_SYNC' });
        });
      })()
    );
  }
});

// Fetch — cache-first for static assets, network-first for navigation & API
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip API calls and external requests (except fonts)
  if (url.pathname.startsWith('/api/') ||
      (url.origin !== self.location.origin &&
       url.hostname !== 'fonts.googleapis.com' &&
       url.hostname !== 'fonts.gstatic.com')) {
    return;
  }

  // For navigation requests (page loads), try network first, then cache
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/') || caches.match(request))
    );
    return;
  }

  // For hashed static assets (JS, CSS with hash in filename), cache-first (immutable)
  if (url.pathname.match(/\/assets\/.*-[a-zA-Z0-9]{8}\.(js|css)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // For other static assets (images, fonts, unhashed files), stale-while-revalidate
  if (url.pathname.match(/\.(png|jpg|jpeg|svg|woff2?|ttf|eot|ico)$/) ||
      url.hostname === 'fonts.googleapis.com' ||
      url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
        return cached || networkFetch;
      })
    );
    return;
  }

  // Default: network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
