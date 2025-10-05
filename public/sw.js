// public/sw.js
const CACHE_NAME = "replymate-v1";
const CORE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  // če imaš favicon ali stile v public, jih dodaj sem, npr.:
  // "/favicon.ico",
  // "/styles.css",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null))
        )
      )
  );
  self.clients.claim();
});

// Preprosta strategija:
// - Navigacije (SPA rute) -> vrni index.html (app dela offline)
// - Ostalo: try cache first, fallback na network
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // SPA fallback za navigacije
  if (req.mode === "navigate") {
    event.respondWith(
      caches.match("/index.html").then((res) => res || fetch("/index.html"))
    );
    return;
  }

  // Cache-first za ostale requeste
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        // Cache-aj samo GET odgovore s statusom 200 in same-origin
        if (
          req.method === "GET" &&
          resp.status === 200 &&
          new URL(req.url).origin === self.location.origin
        ) {
          const respClone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
        }
        return resp;
      });
    })
  );
});
