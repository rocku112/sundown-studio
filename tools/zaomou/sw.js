/* 早謀遠算 · Service Worker
   network-first：有網路時一律取最新版、順便更新快取；離線時才用快取。
   不用 stale-while-revalidate，避免新舊版本的 ES module 混用而載入失敗。 */
const CACHE = 'zaomou-v1';
const PRECACHE = [
  './', 'index.html', 'app.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png',
  'css/app.css', 'css/landing.css',
  'js/app.js', 'js/engine.js', 'js/state.js', 'js/data.js', 'js/charts.js', 'js/landing.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('zaomou-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === location.origin;
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !isFont) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') {
        const copy = res.clone(); // 必須在回傳前複製，頁面讀走 body 後就不能再 clone
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: sameOrigin }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('app.html') : Response.error()))),
  );
});
