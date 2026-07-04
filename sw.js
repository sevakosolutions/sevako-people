// ══════════════════════════════════════════════════════
// SERVICE WORKER — JCB HR Dashboard PWA
// Caches the app shell for offline use
// ══════════════════════════════════════════════════════

const CACHE_NAME = 'jcb-hr-v1';
const CACHE_URLS = [
  './attendance_app.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  // Firebase SDKs (cache from CDN)
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js',
];

// Install: pre-cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(e => console.warn('SW cache failed:', e))
  );
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for app shell, network-first for Firestore/Auth
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET and Chrome extension requests
  if (event.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Network-first for Firebase/Firestore (always want fresh auth/data)
  if (url.hostname.includes('firebase') ||
      url.hostname.includes('firestore') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('zenoti')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for app shell (HTML, JS, CSS, icons)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful responses
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback: return main app
        if (event.request.destination === 'document') {
          return caches.match('./attendance_app.html');
        }
      });
    })
  );
});

// Background sync for queued saves (when back online)
self.addEventListener('sync', event => {
  if (event.tag === 'sync-data') {
    event.waitUntil(syncQueuedData());
  }
});

async function syncQueuedData() {
  // Notify all clients to re-sync
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_DATA' }));
}

// Push notification support (for announcements, ticket alerts)
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'HR Dashboard', {
      body:    data.body    || 'You have a new notification.',
      icon:    './icon-192.svg',
      badge:   './icon-192.svg',
      tag:     data.tag     || 'hr-notification',
      data:    data.url     || './',
      actions: data.actions || [],
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || './')
  );
});
