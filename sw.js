const CACHE_NAME = 'headless-ui-v1';
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    //'./client.p12'
    // You can also add your client.p12 here if you want to host it for download
];
 
// Install Event: Cache the static UI files
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("Caching offline assets...");
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});
 
// Activate Event: Clean up old caches if you update the version
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});
 
// Fetch Event: Serve UI from cache, let API calls go to the network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
 
    // Only intercept requests for your PWA's own domain (the UI)
    if (url.origin === location.origin) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                // Return cached UI, or fetch from network if missing
                return cachedResponse || fetch(event.request);
            })
        );
    }
    // Do nothing for cross-origin requests (like your mTLS API calls to port 4443).
    // Let the browser handle those normally.
});