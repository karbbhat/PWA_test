const CACHE_NAME = "adg-pwa-v4";

// IMPORTANT: only files that 100% exist
const ASSETS = [
  "../",                     // page entry
  "../index.html",
  "../manifest.json",
  "./styles.css",
  "./app.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const url of ASSETS) {
        try {
          await cache.add(url);
          console.log("[SW] Cached:", url);
        } catch (e) {
          console.error("[SW] FAILED to cache:", url, e);
        }
      }
    })
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true })
      .then(resp => resp || fetch(event.request))
  );
});