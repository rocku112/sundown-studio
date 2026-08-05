// twflow Service Worker
// 改快取策略或靜態資源時把版本號 +1，強制所有裝置換新快取。
const VERSION = 1;
const CACHE = `twflow-v${VERSION}`;

const PRECACHE = ['./', './manifest.json', './icons/icon-192.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(PRECACHE))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  const isHTML = e.request.mode === 'navigate' || url.pathname.endsWith('.html')
              || url.pathname.endsWith('/');
  const isData = url.pathname.endsWith('.json');

  // HTML 與資料都走 network-first：
  // 盤後資料每天換，拿到舊的比慢幾百毫秒嚴重得多。3 秒逾時退快取，
  // 斷線時仍能開（顯示上次看到的盤面）。
  //
  // ⚠️ 不用 stale-while-revalidate：那會讓改版後第一次開仍是舊版、
  //    要關掉再開第二次才生效——使用者只會覺得「更新沒有生效」。
  if (isHTML || isData) {
    e.respondWith((async () => {
      const net = fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      });
      net.catch(() => {});   // 逾時走快取後這條若失敗，先吞掉避免 unhandled rejection
      const timeout = new Promise(r => setTimeout(() => r(null), 3000));
      const res = await Promise.race([net, timeout]).catch(() => null);
      if (res) return res;
      return (await caches.match(e.request)) || net;
    })());
    return;
  }

  // 其他靜態資源：cache-first
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(e.request, copy));
    return res;
  })));
});

// ── 推播（尚未啟用）────────────────────────────────────────────
// 真正的 Web Push 需要一個能儲存訂閱端點的後端（見 README「推播」段）。
// 這段先備好：接上後端後，CI 盤後比對監控清單就能直接推。
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) {}
  e.waitUntil(self.registration.showNotification(d.title || 'twflow', {
    body: d.body || '盤後資料已更新',
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(list => {
      for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
      return clients.openWindow(url);
    }));
});
