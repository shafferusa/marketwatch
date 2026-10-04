const CACHE = 'shaffer-terminal-shell-macro-4';
const SHELL = ['/macro-calendar.js?v=1', '/macro.css?v=2', '/macro.js?v=4', '/', '/v7.css?v=7.0.0', '/v8.css?v=8.0.2', '/prod.css?v=prod1', '/v7.js?v=macro4', '/v8-patch.js?v=macro4', '/prod-refresh.js?v=prod4', '/v8-markets.js?v=prod2', '/v8-market-sparklines.js?v=prod4', '/v8-chart.js?v=prod3', '/v8-multi.js?v=prod3', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || event.request.method !== 'GET') return;
  event.respondWith(fetch(event.request, { cache: 'no-store' }).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request).then(hit => hit || caches.match('/'))));
});

