const CACHE_NAME = 'communauto-v1';

const APP_SHELL = [
    '/',
    '/index.html',
    '/manifest.json',
    '/static/css/style.css',
    '/static/js/config.js',
    '/static/js/utils.js',
    '/static/js/ui.js',
    '/static/js/location.js',
    '/static/js/map.js',
    '/static/js/app.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Communauto Found!';
    const options = {
        body: data.body || '',
        icon: data.icon || 'static/images/android-chrome-192x192.png',
        requireInteraction: true,
        data: { url: data.url || '/' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url || '/';
    event.waitUntil(clients.openWindow(url));
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Only cache same-origin requests (skip external CDNs, Nominatim, geocoder, etc.)
    if (url.origin !== self.location.origin) return;

    // Let API calls go straight to the network
    if (url.pathname.startsWith('/api/')) return;

    // Stale-while-revalidate for everything else
    event.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(event.request).then(cached => {
                const networkFetch = fetch(event.request).then(response => {
                    cache.put(event.request, response.clone());
                    return response;
                });
                return cached || networkFetch;
            })
        )
    );
});
