/* sw.js — Entreno App offline */
const CACHE_NAME = "entrenoapp-v1";

// Importante: usa rutas RELATIVAS para que funcione en subcarpetas (GitHub Pages)
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png" // si no tienes 512, borra esta línea
];

// Install: precache
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: limpiar caches viejas
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve()))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first con fallback a red y guardado en cache
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Solo GET
  if (req.method !== "GET") return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req)
        .then((res) => {
          // Guarda en cache si es válido
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => {
          // fallback: si falla red, intenta index
          if (req.headers.get("accept")?.includes("text/html")) {
            return caches.match("./index.html");
          }
          return cached;
        });
    })
  );
});

// Mensajes (para actualizar rápido)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
