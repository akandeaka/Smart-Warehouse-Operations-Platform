// sw.js - Service Worker for PWA
const CACHE_NAME = 'wms-v4';
const urlsToCache = [
  '/',
  '/login.html',
  '/manager-dashboard.html',
  '/sales-dashboard.html',
  '/super-admin.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            return caches.open(CACHE_NAME);
        }).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const responseClone = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseClone);
                });
                return response;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(clients.claim());
});
