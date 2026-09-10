// Never store authenticated HTML or API responses in unencrypted Cache Storage.
const CACHE = "sgc-ubs-public-v3";
const SHELL = ["/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("sgc-ubs-") && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline.html")) || new Response("Sem conexão. Reconecte para continuar.", {status: 503, headers: {"content-type": "text/plain; charset=utf-8"}})));
  }
});
