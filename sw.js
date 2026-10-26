// Offline support. The build stamps VERSION and the file list.
const VERSION = "20261026-234651";
const SHELL = ["./", "./app.css", "./data.enc.json", "./icons/apple-touch-icon.png", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./index.html", "./js/app.js", "./js/crypto.js", "./js/map.js", "./js/util.js", "./manifest.webmanifest", "./vendor/maplibre-LICENSE.txt", "./vendor/maplibre-gl.css", "./vendor/maplibre-gl.js"];
const SHELL_CACHE = `bbg-shell-${VERSION}`;
const MAP_CACHE = "bbg-map-v1";
const MAP_HOST = "tiles.openfreemap.org";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("bbg-shell-") && k !== SHELL_CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data === "skip") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Map tiles, styles, fonts and sprites: cache first, so a downloaded area works offline
  // and the map keeps asking for the same tile version it saved.
  if (url.hostname === MAP_HOST) {
    e.respondWith(caches.open(MAP_CACHE).then(async c => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok) c.put(e.request, res.clone());
      return res;
    }));
    return;
  }

  if (url.origin !== location.origin) return;

  // App files: from this version's cache, falling back to the network.
  e.respondWith((async () => {
    const c = await caches.open(SHELL_CACHE);
    const req = e.request.mode === "navigate" ? new Request("./index.html") : e.request;
    const hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try { return await fetch(e.request); }
    catch { return (await c.match("./index.html")) || Response.error(); }
  })());
});
