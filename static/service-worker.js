const CACHE_NAME = "adg-pwa-v1";

const ASSETS = [
  "/",
  "/static/app.js",
  "/static/styles.css",
  "/manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(resp