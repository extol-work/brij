const CACHE_NAME = "brij-offline-v1";
const OFFLINE_URLS = ["/join"];

// Cache the join page shell on install
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for navigation, cache fallback for offline
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle same-origin GET requests
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  // For join pages, try network first, fall back to cached shell
  if (new URL(request.url).pathname.startsWith("/join")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match("/join"))
    );
  }
});
