/**
 * Service Worker - 热搜聚合App
 *
 * 缓存策略：
 * - 静态资源（HTML/CSS/JS/Manifest）: Cache First，版本 v2
 * - API 请求（来自 hotsearch-worker）: Network First，失败时返回空数组
 */

const CACHE_VERSION = 'hot-search-v3';
const BASE_PATH = '/hot-search';
const STATIC_ASSETS = [
  BASE_PATH + '/',
  BASE_PATH + '/index.html',
  BASE_PATH + '/manifest.json',
];

// ============================================
// 安装：缓存静态资源
// ============================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // 立即启用新版本
      return self.skipWaiting();
    })
  );
});

// ============================================
// 激活：清理旧版本缓存
// ============================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_VERSION)
          .map(name => caches.delete(name))
      );
    }).then(() => {
      // 立即接管所有页面
      return self.clients.claim();
    })
  );
});

// ============================================
// 请求拦截：根据类型选择缓存策略
// ============================================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API 请求：Network First，失败时返回空数组
  if (url.hostname === 'hotsearch-worker.haiyun954123.workers.dev') {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // 克隆响应并缓存
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => {
            cache.put(event.request, clone);
          });
          return response;
        })
        .catch(() => {
          // 网络失败时返回空数组（API fallback）
          return new Response('[]', {
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // 静态资源：Cache First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // 缓存新的静态资源
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // 如果是导航请求，返回缓存的首页
        if (event.request.mode === 'navigate') {
          return caches.match(BASE_PATH + '/index.html');
        }
        return new Response('Offline', { status: 503 });
      });
    })
  );
});