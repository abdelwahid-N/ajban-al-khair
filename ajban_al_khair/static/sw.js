// Service Worker for Coopérative Ajban Al Khair PWA - Offline First
const CACHE_VERSION = "ajban-v2.3.0-offline";

const PRECACHE_ASSETS = [
  "/",
  "/?source=pwa",
  "/static/css/style.css",
  "/static/js/app.js",
  "/static/manifest.json",
  "/static/assets/logo.jpg",
  "/static/assets/icon-192.png",
  "/static/assets/icon-512.png",
  "/static/assets/icon-maskable-512.png",
  "/static/vendor/chart.umd.min.js",
  "/static/vendor/fontawesome/all.min.css",
  "/static/vendor/fontawesome/webfonts/fa-solid-900.woff2",
  "/static/vendor/fontawesome/webfonts/fa-brands-400.woff2",
  "/static/vendor/fontawesome/webfonts/fa-regular-400.woff2"
];

// Install: pre-cache all core shell & offline assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async (cache) => {
      console.log("[SW] Pre-caching offline application shell...");
      await Promise.all(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Precache failed for ${url}:`, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: remove obsolete caches & claim immediate control
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_VERSION) {
            console.log("[SW] Deleting old cache:", name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Strategy:
// 1. Navigation (HTML): Network-first with fallback to cached shell
// 2. API GET: Network-first, fallback to cache if available
// 3. API Mutations (POST, PUT, DELETE): Network-first, fail cleanly so client queues offline
// 4. Static assets (CSS, JS, Fonts, Images): Cache-First / Stale-While-Revalidate
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 1. Navigation requests (Opening the app / page refresh)
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(async () => {
          console.log("[SW] Offline: serving cached document for navigation");
          const cached = await caches.match(req);
          if (cached) return cached;
          const fallbackPwa = await caches.match("/?source=pwa");
          if (fallbackPwa) return fallbackPwa;
          return caches.match("/");
        })
    );
    return;
  }

  // 2. API requests
  if (url.pathname.startsWith("/api/")) {
    if (req.method === "GET") {
      event.respondWith(
        fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(async () => {
            console.log(`[SW] API network failure for ${url.pathname}, checking cache...`);
            const cached = await caches.match(req);
            if (cached) return cached;
            return new Response(JSON.stringify({ offline: true, error: "Network unavailable" }), {
              status: 200,
              headers: { "Content-Type": "application/json" }
            });
          })
      );
    } else {
      // Mutations: POST, PUT, DELETE - pass to network or fail cleanly
      event.respondWith(
        fetch(req).catch(() => {
          return new Response(JSON.stringify({ offline: true, error: "Offline mode" }), {
            status: 503,
            headers: { "Content-Type": "application/json" }
          });
        })
      );
    }
    return;
  }

  // 3. Static assets & Third-party CDNs (Stale-While-Revalidate with opaque support)
  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === "opaque")) {
            const clone = networkResponse.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});

// Skip waiting message listener
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
