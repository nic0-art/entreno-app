/* sw.js - Entreno App (offline-first) */
const CACHE_VERSION = "entreno-cache-v5";
const STATIC_CACHE = CACHE_VERSION;
const RUNTIME_CACHE = "runtime-" + CACHE_VERSION;

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png"
].filter(Boolean);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.map((k) => {
        if (k !== STATIC_CACHE && k !== RUNTIME_CACHE) return caches.delete(k);
      })
    );
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSameOrigin(req) {
  try { return new URL(req.url).origin === self.location.origin; }
  catch(e){ return false; }
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  const res = await fetch(req);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const res = await fetch(req);
    cache.put(req, res.clone());
    return res;
  } catch (e) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  // Navegación: devolver index offline
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cached = await caches.match("./index.html");
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(STATIC_CACHE);
        cache.put("./index.html", fresh.clone());
        return fresh;
      } catch (e) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // Mismo origen: cache-first para estáticos / runtime
  if (isSameOrigin(req)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Externo (si hubiera): network-first con fallback cache
  event.respondWith(networkFirst(req));
});
