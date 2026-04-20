const CACHE = 'hot-search-v3';
const urls = ['/index.html', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(urls)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 只缓存同源静态资源，外部 API 一律不碰
self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('zj.v.api.aa1.cn') ||
      url.includes('36kr.com') ||
      url.includes('zhihu.com') ||
      url.startsWith('https://api.')) {
    return; // 放行，不拦截
  }
  // 同源静态资源走缓存
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
