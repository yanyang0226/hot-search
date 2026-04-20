// Service Worker v5 - 不缓存主页面，每次从网络获取最新
const CACHE = 'hot-search-v5';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 外部 API（含 CORS 代理）一律不拦截
// 主 HTML 也不缓存，强制网络优先
self.addEventListener('fetch', e => {
  const url = e.request.url;
  // 不拦截任何外部请求，让浏览器直连
  if (url.includes('api.allorigins') ||
      url.includes('tophub.today') ||
      url.includes('zj.v.api.aa1.cn')) {
    return;
  }
  // 静态资源可缓存
  if (url.match(/\.(css|js|json|woff2?|png|jpg|ico)$/) && url.includes(self.location.origin)) {
    e.respondWith(
      caches.match(e.request).then(c => c || fetch(e.request))
    );
  }
  // HTML 页面不缓存，直接取网络
});
