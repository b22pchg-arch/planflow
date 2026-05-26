const PLANFLOW_CACHE = 'planflow-offline-cache';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './logo.png'
];

async function refreshCoreAssets() {
  const cache = await caches.open(PLANFLOW_CACHE);
  await Promise.all(CORE_ASSETS.map(async (url) => {
    try {
      const request = new Request(url, { cache: 'reload' });
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(url, response.clone());
      }
    } catch (err) {
      // Giữ PWA vẫn cài được nếu máy chủ thiếu một tài nguyên khi thử nghiệm.
      console.warn('[PlanFlow SW] Không cache được:', url, err);
    }
  }));
}

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(refreshCoreAssets());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Giữ tên cache cố định để các bản sau không cần đổi PLANFLOW_CACHE.
    // Dọn các cache PlanFlow kiểu version cũ nếu còn tồn tại.
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key !== PLANFLOW_CACHE && key.startsWith('planflow'))
      .map(key => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', event => {
  if (!event.data) return;

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (event.data.type === 'CLEAR_CACHE') {
    event.waitUntil((async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(key => key.startsWith('planflow')).map(key => caches.delete(key)));
      await refreshCoreAssets();
    })());
    return;
  }

  if (event.data.type === 'PLANFLOW_MANUAL_UPDATE') {
    event.waitUntil((async () => {
      await caches.delete(PLANFLOW_CACHE);
      await refreshCoreAssets();

      const clientsList = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      });

      for (const client of clientsList) {
        client.postMessage({ type: 'PLANFLOW_CACHE_UPDATED' });
      }
    })());
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  // Điều hướng trang: ưu tiên mạng để nhận HTML mới, fallback cache để chạy offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(PLANFLOW_CACHE);
      try {
        const response = await fetch(new Request(request, { cache: 'reload' }));
        if (response && response.ok) {
          await cache.put('./index.html', response.clone());
        }
        return response;
      } catch (err) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Tài nguyên tĩnh: cache-first để mở nhanh/offline, rồi lấy mạng nếu chưa có cache.
  event.respondWith((async () => {
    const cache = await caches.open(PLANFLOW_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;

    try {
      const response = await fetch(request);
      if (response && response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch (err) {
      return cached || Response.error();
    }
  })());
});
