// sw.js - Clean version with force update
const CACHE_NAME = 'wms-v3';  // Changed version number

const urlsToCache = [
  '/login.html',
  '/manager-dashboard.html',
  '/sales-dashboard.html',
  '/manager-performance.html'
];

// Install - Clear old caches first
self.addEventListener('install', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    return caches.delete(cacheName);
                })
            );
        }).then(() => {
            return caches.open(CACHE_NAME);
        }).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting(); // Force activate immediately
});

// Fetch - Network first, fallback to cache
self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

// Activate - Take control immediately
self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});
