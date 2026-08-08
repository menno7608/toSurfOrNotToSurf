const CACHE_NAME = "to-surf-or-not-to-surf-mobile-v3";
const APP_SHELL = [
  "/mobile/",
  "/mobile/manifest.webmanifest",
  "/mobile/app-icons/app-icon-192.png",
  "/mobile/app-icons/app-icon-512.png",
  "/mobile/app-icons/app-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, fallback) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (fallback && await cache.match(fallback)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/spots") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/mobile/")) {
    event.respondWith(networkFirst(request, "/mobile/"));
    return;
  }

  if (url.pathname.startsWith("/mobile/")) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});
