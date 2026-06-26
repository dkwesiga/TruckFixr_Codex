/* TruckFixr PWA service worker — v2 retires stale app shells. */
const CACHE_VERSION = "truckfixr-pwa-v2";

const offlineDocument = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TruckFixr is offline</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a;font:16px system-ui,sans-serif}main{max-width:360px;padding:32px;text-align:center;background:#fff;border:1px solid #e2e8f0;border-radius:24px;box-shadow:0 18px 48px -32px rgba(15,23,42,.35)}h1{margin:0 0 12px;font-size:24px}p{margin:0;color:#475569;line-height:1.55}</style><main><h1>You’re offline</h1><p>Reconnect to restore your TruckFixr session and continue to sign in.</p></main>`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  event.respondWith(
    fetch(request).catch(() => {
      if (url.pathname === "/offline") {
        return new Response(offlineDocument, {
          headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      return Response.redirect(new URL("/offline", self.location.origin), 302);
    })
  );
});