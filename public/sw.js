// Never store authenticated HTML or API responses in unencrypted Cache Storage.
const CACHE = "sgc-ubs-public-v4-"+(new URL(self.location.href).searchParams.get('build')||'default');
const SHELL = ["/offline", "/offline.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await cache.addAll(SHELL);
    const html=await (await cache.match('/offline')).text();
    // Preserve deployment query strings (Vercel may append ?dpl=...). Cache keys
    // must match the URLs the shell will request after a networkless restart.
    const assets=[...html.matchAll(/(?:src|href)="([^\"]+)"/g)].map(match=>new URL(match[1],self.location.origin)).filter(url=>url.origin===self.location.origin&&url.pathname.startsWith('/_next/static/'));
    await cache.addAll([...new Set(assets.map(url=>url.href))]);
  })());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("sgc-ubs-") && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin)return;
  // Static JS/CSS only; never cache APIs, authenticated HTML or signed files.
  if(url.pathname.startsWith('/_next/static/')){
    event.respondWith(caches.open(CACHE).then(async cache=>{
      const cached=await cache.match(event.request);if(cached)return cached;
      const response=await fetch(event.request);if(response.ok)await cache.put(event.request,response.clone());return response;
    }));return;
  }
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => (await caches.match("/offline")) || (await caches.match("/offline.html")) || new Response("Sem conexão. Reconecte para continuar.", {status: 503, headers: {"content-type": "text/plain; charset=utf-8"}})));
  }
});
