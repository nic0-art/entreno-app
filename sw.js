/* SW ENTRENAMIENTO APP */
const CACHE = "bilbo-pro-v4";   // cambia versión cuando actualices
const APP_SCOPE = "/entreno-app/"; // repo GitHub Pages

const ASSETS = [
  APP_SCOPE,
  APP_SCOPE + "index.html",
  APP_SCOPE + "manifest.webmanifest",
  APP_SCOPE + "icon-192.png",
  APP_SCOPE + "icon-512.png"
];


// INSTALAR
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});


// ACTIVAR
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});


// ACTUALIZAR DESDE APP
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});


// FETCH
self.addEventListener("fetch", (event) => {

  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  const accept = req.headers.get("accept") || "";

  // HTML → network first
  if (req.mode === "navigate" || accept.includes("text/html")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match(APP_SCOPE + "index.html");
        })
    );
    return;
  }

  // resto → cache first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;

      return fetch(req).then((res) => {
        if (!res || res.status !== 200) return res;
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(APP_SCOPE + "index.html"));
    })
  );

});
