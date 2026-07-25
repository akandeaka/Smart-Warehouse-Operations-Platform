// ============================================================
// SERVICE WORKER - Smart Warehouse Platform
// Version: 1.0.0
// ============================================================

const CACHE_NAME = 'warehouse-cache-v1';
const STATIC_CACHE = 'warehouse-static-v1';
const DYNAMIC_CACHE = 'warehouse-dynamic-v1';

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/login.html',
  '/manager-dashboard.html',
  '/sales-dashboard.html',
  '/driver-management.html',
  '/reconciliation-dashboard.html',
  '/manifest.json',
  '/css/style.css',
  '/css/dashboard.css',
  '/js/auth.js',
  '/js/api.js',
  '/js/dashboard.js',
  '/js/driver.js',
  '/offline.html'
];

// API endpoints to cache
const API_ENDPOINTS = [
  '/api/products',
  '/api/teams',
  '/api/drivers',
  '/api/drivers/assignments',
  '/api/drivers/assignments/pending'
];

// ============================================================
// INSTALL EVENT
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      // Cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        console.log('Caching static assets...');
        return cache.addAll(STATIC_ASSETS);
      }),
      // Cache API responses
      caches.open(DYNAMIC_CACHE).then((cache) => {
        console.log('Caching API endpoints...');
        return cache.addAll(API_ENDPOINTS);
      })
    ]).then(() => {
      self.skipWaiting();
    })
  );
});

// ============================================================
// ACTIVATE EVENT
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
            .map((name) => caches.delete(name))
        );
      }),
      // Claim clients
      self.clients.claim()
    ])
  );
});

// ============================================================
// FETCH EVENT - Network First with Cache Fallback
// ============================================================
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return event.respondWith(fetch(request));
  }

  // Handle API requests
  if (url.pathname.startsWith('/api/')) {
    return event.respondWith(handleApiRequest(request));
  }

  // Handle static assets
  if (STATIC_ASSETS.includes(url.pathname)) {
    return event.respondWith(handleStaticRequest(request));
  }

  // Handle everything else with Network First
  return event.respondWith(handleNetworkFirst(request));
});

// ============================================================
// REQUEST HANDLERS
// ============================================================

// Handle API requests - Network First with cache fallback
async function handleApiRequest(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    console.log('Network error, trying cache...');
  }

  // Try cache fallback
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Return offline response for API
  return new Response(
    JSON.stringify({
      success: false,
      message: 'You are offline. Please connect to the internet.',
      offline: true
    }),
    {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// Handle static assets - Cache First
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    // Return offline page
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/offline.html');
      if (offlinePage) {
        return offlinePage;
      }
    }
  }

  return new Response('Resource not available offline', { status: 503 });
}

// Network First strategy
async function handleNetworkFirst(request) {
  try {
    const response = await fetch(request.clone());
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
      return response;
    }
  } catch (error) {
    console.log('Network error, serving from cache...');
  }

  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Return offline page for navigation requests
  if (request.mode === 'navigate') {
    const offlinePage = await caches.match('/offline.html');
    if (offlinePage) {
      return offlinePage;
    }
  }

  return new Response('Resource not found', { status: 404 });
}

// ============================================================
// PUSH NOTIFICATIONS
// ============================================================
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.body || 'New notification',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || '/'
      },
      actions: [
        {
          action: 'view',
          title: 'View Details'
        },
        {
          action: 'dismiss',
          title: 'Dismiss'
        }
      ]
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Smart Warehouse', options)
    );
  } catch (error) {
    console.error('Push notification error:', error);
  }
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

// ============================================================
// BACKGROUND SYNC
// ============================================================
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sales') {
    event.waitUntil(syncSalesData());
  }
});

async function syncSalesData() {
  // Get pending sync data from IndexedDB
  // This would be implemented with your specific sync logic
  console.log('Syncing sales data...');
}

// ============================================================
// MESSAGE HANDLING
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
