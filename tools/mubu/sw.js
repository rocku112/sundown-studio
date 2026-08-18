/* 暮卜先知 · Service Worker（stale-while-revalidate：先回快取秒開，背景更新） */
const CACHE = 'mubu-v63';
const PRECACHE = [
  './', 'index.html', 'css/style.css', 'icon.svg', 'manifest.webmanifest',
  'js/core/icons.js', 'js/core/astro.js', 'js/core/ganzhi.js', 'js/core/ai.js', 'js/core/extras.js',
  'js/data/hexagram-data.js', 'js/data/tarot-data.js', 'js/data/qian-data.js', 'js/data/name-chars.js', 'js/data/name-premium.js', 'js/data/name-mainland.js', 'js/data/name-korean.js', 'js/data/name-singles.js', 'js/data/name-themes.js', 'js/data/name-freq.js', 'js/data/name-taiwan.js', 'js/data/kangxi-strokes.js', 'js/data/cities.js', 'js/data/vsop87d.js',
  'js/app.js',
  'js/modules/meihua.js', 'js/modules/bazi.js', 'js/modules/tarot.js',
  'js/modules/astrology.js', 'js/modules/xiaoliuren.js', 'js/modules/ziwei.js',
  'js/modules/qimen.js', 'js/modules/qian.js', 'js/modules/almanac.js', 'js/modules/zeri.js',
  'js/modules/liuyao.js', 'js/modules/daliuren.js', 'js/modules/fortune.js', 'js/modules/numerology.js',
  'js/modules/naming.js', 'js/modules/namematch.js', 'js/modules/hehun.js', 'js/modules/synastry.js',
  'js/modules/combo.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // API 呼叫等不快取
  e.respondWith(
    caches.open(CACHE).then(async (c) => {
      const cached = await c.match(e.request, { ignoreSearch: true });
      const fetched = fetch(e.request).then((res) => {
        if (res.ok) c.put(e.request, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
