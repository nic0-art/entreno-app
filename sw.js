/* sw.js */
const CACHE_NAME = "entreno-app-v4";
const CORE_ASSETS = [
  "/",              // importante para GitHub Pages/Workers: sirve index
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png"
];

// Instalar: cachea lo esencial
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
});

// Activar: limpia caches viejas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// Permite “actualizarApp()” desde la UI
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Fetch: offline-first para navegación y assets
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo mismo origen
  if (url.origin !== self.location.origin) return;

  // Navegación (abrir la app): intenta cache primero (offline), si no, red, y cachea
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("/index.html");
        try {
          const fresh = await fetch(req);
          // guarda copia por si cambia index
          cache.put("/index.html", fresh.clone());
          return fresh;
        } catch (e) {
          return cached || new Response("Offline", { status: 200, headers: { "Content-Type": "text/plain" } });
        }
      })()
    );
    return;
  }

  // Assets: cache-first, si baja algo nuevo lo actualiza
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req);
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        // cachea solo respuestas OK
        if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // sin red y sin cache
        return new Response("", { status: 504 });
      }
    })()
  );
});
