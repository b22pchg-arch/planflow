const PLANFLOW_CACHE = 'planflow-v5-mobile-pwa-20260526-03-delete-password';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(PLANFLOW_CACHE).then(cache => cache.addAll(CORE_ASSETS).catch(async () => {
      // Một số máy chủ không có route ./ hoặc index.html khi đang thử bằng tên file khác.
      // Vẫn hoàn tất install để cache runtime hoạt động.
      return true;
    }))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== PLANFLOW_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Điều hướng trang: ưu tiên mạng để nhận bản mới, fallback cache để chạy offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(PLANFLOW_CACHE);
      try {
        const response = await fetch(request);
        cache.put('./index.html', response.clone());
        return response;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Tài nguyên tĩnh: cache-first, rồi cập nhật cache khi có mạng.
  event.respondWith((async () => {
    const cache = await caches.open(PLANFLOW_CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response && response.status === 200) cache.put(request, response.clone());
      return response;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
