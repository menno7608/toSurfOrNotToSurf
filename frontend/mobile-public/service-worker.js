const CACHE_NAME = "to-surf-or-not-to-surf-mobile-v6";

/* De backend weigert data ouder dan zes uur (_MAX_SERVE_AGE in app.py), maar
   deze cache kende geen leeftijd: bij een mislukte fetch kwam er een antwoord
   van dagen terug uit, zonder dat iets dat verried. De dagenstrip stond dan op
   een dag die al voorbij was terwijl de grafiek naar de echte klok scrollde.
   Zelfde grens als de backend, en anders liever een zichtbare fout. */
const API_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const CACHED_AT = "x-sw-cached-at";
const APP_SHELL = [
  "/mobile/",
  "/mobile/manifest.webmanifest",
  "/mobile/app-icons/app-icon-192.png",
  "/mobile/app-icons/app-icon-512.png",
  "/mobile/app-icons/app-icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  // addAll faalt in zijn geheel als één item ontbreekt (bv. een icoon dat nog
  // niet gebouwd is) — dan blijft de hele shell ongecached en werkt offline
  // helemaal niets. Elk item los proberen, zodat de rest wél in de cache komt.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => {})))
    )
  );
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

async function apiNetworkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      // Zet er een tijdstempel op, want een Cache-antwoord draagt zelf geen leeftijd.
      const headers = new Headers(response.headers);
      headers.set(CACHED_AT, String(Date.now()));
      const body = await response.clone().blob();
      await cache.put(request, new Response(body, {
        status: response.status, statusText: response.statusText, headers,
      }));
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (!cached) return Response.error();
    const cachedAt = Number(cached.headers.get(CACHED_AT) || 0);
    if (!cachedAt || Date.now() - cachedAt > API_MAX_AGE_MS) return Response.error();
    return cached;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/spots") {
    event.respondWith(apiNetworkFirst(request));
    return;
  }

  // De manifest altijd vers: Android vergelijkt hem met de geïnstalleerde app
  // (kleuren, naam, iconen) en werkt die bij. Cache-first liet een oude manifest
  // staan, waardoor een eenmaal geïnstalleerde app zijn oude kleuren hield — o.a.
  // een crème navigatiebalk onder een donkere app.
  if (url.pathname === "/mobile/manifest.webmanifest") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/mobile/")) {
    event.respondWith(networkFirst(request, "/mobile/"));
    return;
  }

  if (url.pathname.startsWith("/mobile/") || url.pathname.startsWith("/kust/")) {
    // Kustgeometrie (/kust/*.json) verandert nooit en wordt buiten /mobile/
    // opgehaald (gedeeld met de desktop-app), maar is net als de rest van de
    // schil statisch genoeg om cache-first te bewaren voor offline gebruik.
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
