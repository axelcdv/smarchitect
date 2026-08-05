const CACHE = "smarchitect-shell-v1";
// Vite replaces this list with every hashed JS/CSS asset in production builds.
const PRECACHE = ["./", "./index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(request, copy));
    return response;
  }).catch(() => request.mode === "navigate" ? caches.match("./index.html") : undefined)));
});
