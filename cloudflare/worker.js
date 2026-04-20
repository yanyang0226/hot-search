/**
 * Cloudflare Worker - 热榜 API + 文章代理
 * 
 * 路由：
 *   GET /api/baidu      → 百度热搜
 *   GET /api/weibo      → 微博热搜
 *   GET /api/zhihu      → 知乎热榜
 *   GET /api/weixin     → 微信热文
 *   GET /api/thepaper  → 澎湃新闻
 *   GET /api/huxiu     → 虎嗅热文
 *   GET /api/ithome    → IT之家
 *   GET /api/all       → 全站聚合
 *   GET /health        → 健康检查
 *   GET /proxy?url=... → 文章内容代理（解决CORS）
 */

// ============================================================
// 路由配置
// ============================================================
const TOPHUB_URLS = {
  baidu:    'https://tophub.today/n/Jb0vmloB1G',
  weibo:    'https://tophub.today/n/KqndgxeLl9',
  zhihu:    'https://tophub.today/n/mproPpoq6O',
  weixin:   'https://tophub.today/n/WnBe01o371',
  thepaper: 'https://tophub.today/n/wWmoO5Rd4E',
  ithome:   'https://tophub.today/n/K9dAp%E6%98%8E%E6%9C%88',
  huxiu:    'https://tophub.today/n/NR2Gp9dO0v',
  all:      'https://tophub.today/c/news',
};

// ============================================================
// HTML 解析：从 tophub.today HTML 提取热搜列表
// ============================================================
function parseTopHubHTML(html, platform) {
  const seen = new Set();
  const items = [];

  // 简单解析：用正则提取 <a href="外链">标题</a>
  // 配合找到相邻的 .w1 span（热度值）
  const linkPattern = /<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1] || '';
    const innerHTML = match[2] || '';

    // 提取纯文本
    const text = innerHTML.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();

    // 过滤条件
    if (href.includes('tophub.today') || !href.startsWith('http') || href === '#') continue;
    if (text.length < 8) continue;

    // 排除导航词汇
    const skip = ['登录', '注册', '首页', '晚报', '动态', '追踪', '榜中榜',
      '热文库', '话题', '日历', '更多', '热搜', '我的', '收藏', '私信', '通知',
      '知乎日报', '微博热报', '百度风云榜', '微信指数'];
    if (skip.some(w => text.startsWith(w))) continue;

    // 来源白名单
    const domains = ['zhihu', 'weibo', 'baidu', 'thepaper', 'ithome',
      'mp.weixin', 'huxiu', 'sina', 'sohu', 'ifeng', 'b23.tv', 'douban',
      '36kr', 'jiemian', 'caixin', 'yicai', ' keencha', 'zhidx', 'ithome'];
    if (!domains.some(d => href.includes(d))) continue;

    // 去重
    if (seen.has(text)) continue;
    seen.add(text);

    // 判断来源
    let source = platform;
    if (href.includes('zhihu')) source = '知乎';
    else if (href.includes('weibo')) source = '微博';
    else if (href.includes('baidu')) source = '百度';
    else if (href.includes('thepaper') || href.includes('thep')) source = '澎湃';
    else if (href.includes('ithome')) source = 'IT之家';
    else if (href.includes('mp.weixin') || href.includes('weixin')) source = '微信';
    else if (href.includes('huxiu')) source = '虎嗅';
    else if (href.includes('sina')) source = '新浪';
    else if (href.includes('sohu')) source = '搜狐';
    else if (href.includes('ifeng')) source = '凤凰';
    else if (href.includes('b23.tv') || href.includes('bilibili')) source = 'B站';
    else if (href.includes('douban')) source = '豆瓣';
    else if (href.includes('36kr')) source = '36氪';

    items.push({
      title: text.length > 120 ? text.substring(0, 120) : text,
      url: href,
      hot: '',
      source: source,
    });
  }

  return items.slice(0, 50);
}

// ============================================================
// 文章正文提取：去除广告/导航/侧边栏，只保留正文
// ============================================================
function extractArticleContent(html, url) {
  // 移除脚本/样式/导航/侧边栏/评论
  let content = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<form[\s\S]*?<\/form>/gi, '');

  // 移除常见广告/工具类元素
  const adSelectors = [
    '.ad', '.ads', '.advert', '.advertisement', '.sponsor',
    '.sidebar', '.share', '.social', '.toolbar', '.navbar',
    '.nav', '.menu', '.comment', '.comments', '.related',
    '.fixed', '.sticky', '.popup', '.modal',
    '.weixin-qrcode', '.qrcode', '.code',
    '.author-info', '.author-bio',
    '.article-actions', '.action-bar',
  ];
  adSelectors.forEach(sel => {
    content = content.replace(new RegExp(`<[^>]*(class|id)[^>]*=["']${sel.replace('.', '\\.')}["'][^>]*>[\\s\\S]*?<\\/[^>]+>`, 'gi'), '');
  });

  return content;
}

// ============================================================
// 文章正文定位：找到主要内容区域
// ============================================================
function extractMainContent(html, url) {
  // 优先查找 article / main / content 等语义标签
  const semanticMatch = html.match(/<(article|main|div[^>]*class="[^"]*(?:article|content|post|entry|body)[^"]*")[^>]*>([\s\S]{500,}?)<\/(article|main|div)>/i);
  if (semanticMatch) {
    return semanticMatch[0];
  }

  // 降级：提取所有 <p> 标签
  const pMatches = html.match(/<p[^>]*>([\s\S]{20,}?)<\/p>/gi) || [];
  if (pMatches.length >= 3) {
    return pMatches.join('\n');
  }

  return html;
}

// ============================================================
// HTTP 请求封装
// ============================================================
async function fetchWithTimeout(url, options = {}, timeout = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://tophub.today/',
        ...(options.headers || {}),
      },
    });

    if (resp.redirected) {
      return fetchWithTimeout(resp.url, options, timeout);
    }

    return resp;
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 入口
// ============================================================
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 健康检查
    if (pathname === '/health' || pathname === '/') {
      return jsonResponse({
        status: 'ok',
        service: 'hotsearch-worker',
        time: new Date().toISOString(),
        routes: Object.keys(TOPHUB_URLS).map(k => `/api/${k}`),
      });
    }

    // 文章代理：GET /proxy?url=https://...
    if (pathname === '/proxy') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl || !targetUrl.startsWith('http')) {
        return jsonResponse({ error: 'Missing or invalid url parameter' }, 400);
      }

      try {
        const resp = await fetchWithTimeout(targetUrl, {}, 20000);
        const html = await resp.text();

        // 提取正文内容
        const mainContent = extractMainContent(html, targetUrl);
        const cleanContent = extractArticleContent(mainContent, targetUrl);

        // 返回处理后的 HTML
        return new Response(cleanContent, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
          },
        });
      } catch (err) {
        return jsonResponse({ error: err.message }, 502);
      }
    }

    // 热榜 API：GET /api/{platform}
    const apiMatch = pathname.match(/^\/api\/(\w+)$/);
    if (apiMatch) {
      const platform = apiMatch[1];
      const targetUrl = TOPHUB_URLS[platform];

      if (!targetUrl) {
        return jsonResponse({
          error: `Unknown platform: ${platform}`,
          available: Object.keys(TOPHUB_URLS),
        }, 404);
      }

      try {
        // 先尝试从 KV 缓存读取（如果绑定了 KV）
        let cacheKey = `hot:${platform}`;
        let items = null;

        if (env.HOTDATA) {
          try {
            const cached = await env.HOTDATA.get(cacheKey);
            if (cached) {
              const data = JSON.parse(cached);
              // 缓存5分钟有效
              if (Date.now() - data.ts < 300000) {
                items = data.items;
              }
            }
          } catch(e) {}
        }

        // 缓存失效，重新抓取
        if (!items) {
          const resp = await fetchWithTimeout(targetUrl, {}, 15000);
          const html = await resp.text();
          items = parseTopHubHTML(html, platform);

          // 写入 KV 缓存
          if (env.HOTDATA && items.length > 0) {
            try {
              await env.HOTDATA.put(cacheKey, JSON.stringify({ items, ts: Date.now() }), { expirationTtl: 600 });
            } catch(e) {}
          }
        }

        return jsonResponse({
          code: 1,
          platform,
          updatedAt: new Date().toISOString(),
          count: items.length,
          items,
        });

      } catch (err) {
        console.error(`[${platform}] error:`, err.message);
        return jsonResponse({ code: 0, error: err.message }, 502);
      }
    }

    // 未匹配的路由
    return jsonResponse({
      error: 'Not found. Try /api/baidu, /api/weibo, /api/zhihu...',
      hint: 'Or try /health or /proxy?url=https://...',
    }, 404);
  },
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
