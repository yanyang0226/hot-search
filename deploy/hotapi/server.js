/**
 * 热榜聚合 API
 * 数据来源：tophub.today（服务端渲染 HTML，稳定可抓）
 * 
 * 接口：
 *   GET /api/baidu    → 百度热搜
 *   GET /api/weibo    → 微博热搜
 *   GET /api/zhihu    → 知乎热榜
 *   GET /api/weixin   → 微信热文
 *   GET /api/thepaper → 澎湃新闻
 *   GET /api/huxiu    → 虎嗅热文
 *   GET /api/ithome  → IT之家
 *   GET /api/all      → 全站聚合
 *   GET /health       → 健康检查
 */

const http = require('http');
const https = require('https');
const cheerio = require('cheerio');

const PORT = process.env.PORT || 3001;
const TIMEOUT = 20000;       // 文章抓取超时
const HOT_TIMEOUT = 15000;  // 热搜超时
const CORS_ORIGIN = '*';

// tophub.today 各平台路由
const PLATFORM_URLS = {
  baidu:    'https://tophub.today/n/Jb0vmloB1G',
  weibo:    'https://tophub.today/n/KqndgxeLl9',
  zhihu:    'https://tophub.today/n/mproPpoq6O',
  weixin:   'https://tophub.today/n/WnBe01o371',
  thepaper: 'https://tophub.today/n/wWmoO5Rd4E',
  ithome:   'https://tophub.today/n/K9dAp%E6%98%8E%E6%9C%88',
  huxiu:    'https://tophub.today/n/NR2Gp9dO0v',
  all:      'https://tophub.today/c/news',
};

// 代理 fetch（解决 CORS，供前端内嵌阅读器使用）
function proxyFetch(targetUrl, headers) {
  return new Promise((resolve, reject) => {
    const mod = targetUrl.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': targetUrl,
      }
    };
    const req = mod.get(targetUrl, options, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        proxyFetch(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://tophub.today/',
      }
    }, res => {
      // 跟随重定向
      if (res.statusCode === 301 || res.statusCode === 302) {
        fetchHtml(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(TIMEOUT, () => { req.destroy(); reject(new Error('Request timeout')); });
  });
}

function parseHotData(html, platform) {
  const $ = cheerio.load(html);
  const items = [];
  const seen = new Set();

  // 遍历所有外链，筛选热搜条目
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    let text = $(el).clone().children().remove().end().text().trim();
    if (!text) text = $(el).text().trim();

    // 过滤条件
    if (href.includes('tophub.today') || href === '#' || href.includes('javascript')) return;
    if (!href.startsWith('http')) return;
    if (text.length < 8) return;

    // 排除导航菜单
    const skipWords = ['登录', '注册', '首页', '晚报', '动态', '追踪', '榜中榜',
      '热文库', '话题', '日历', '更多', '热搜', '我的', '收藏', '私信', '通知',
      '知乎', '微博', '百度', '微信', '澎湃', '虎嗅', 'IT之家', '今日头条'];
    if (skipWords.some(w => text.startsWith(w))) return;

    // 来源白名单
    const sourceDomains = ['zhihu', 'weibo', 'baidu', 'thepaper', 'ithome', 'mp.weixin',
      'huxiu', 'sina', 'sohu', 'ifeng', 'news', '163.', 'qq.', 'sinaimg', 'b23.tv'];
    if (!sourceDomains.some(d => href.includes(d))) return;

    // 去重
    if (seen.has(text)) return;
    seen.add(text);

    // 获取热度值
    let hot = '';
    const parentW1 = $(el).closest('.w1');
    if (parentW1.length) {
      const spanText = parentW1.find('span').first().text().trim();
      hot = spanText.replace(/热度/gi, '').trim();
    }

    // 获取来源平台名
    let source = '';
    if (href.includes('zhihu')) source = '知乎';
    else if (href.includes('weibo')) source = '微博';
    else if (href.includes('baidu')) source = '百度';
    else if (href.includes('thepaper')) source = '澎湃';
    else if (href.includes('ithome')) source = 'IT之家';
    else if (href.includes('mp.weixin') || href.includes('weixin')) source = '微信';
    else if (href.includes('huxiu')) source = '虎嗅';
    else if (href.includes('sina')) source = '新浪';
    else if (href.includes('sohu')) source = '搜狐';
    else if (href.includes('ifeng')) source = '凤凰';
    else source = platform;

    items.push({
      title: text.substring(0, 120),
      url: href,
      hot: hot,
      source: source,
    });
  });

  return items.slice(0, 50);
}

async function getHotData(platform) {
  const url = PLATFORM_URLS[platform] || PLATFORM_URLS['baidu'];
  const html = await fetchHtml(url);
  const items = parseHotData(html, platform);
  return {
    code: 1,
    platform,
    updatedAt: new Date().toISOString(),
    count: items.length,
    items,
  };
}

const server = http.createServer(async (req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const pathname = req.url.split('?')[0];

  // 健康检查
  if (pathname === '/health') {
    res.end(JSON.stringify({
      status: 'ok',
      service: 'hotapi',
      time: new Date().toISOString(),
    }));
    return;
  }

  // 代理路由（让前端可以跨域抓取任意网站内容）
  if (pathname.startsWith('/proxy')) {
    try {
      const urlStr = decodeURIComponent(pathname.split('?url=')[1] || '');
      if (!urlStr || !urlStr.startsWith('http')) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: 'Invalid url parameter' }));
        return;
      }
      console.log(`[proxy] fetching: ${urlStr.substring(0, 80)}`);
      proxyFetch(urlStr).then(html => {
        res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(html);
      }).catch(err => {
        console.error(`[proxy] error: ${err.message}`);
        res.writeHead(502);
        res.end(JSON.stringify({ error: err.message }));
      });
      return;
    } catch(e) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // API 路由
  const match = pathname.match(/^\/api\/(\w+)$/);
  if (!match) {
    res.writeHead(404);
    res.end(JSON.stringify({ code: 0, error: 'Not found. Try /api/baidu, /api/weibo, /api/zhihu...' }));
    return;
  }

  const platform = match[1];
  console.log(`[${new Date().toISOString()}] Fetching ${platform}...`);

  try {
    const data = await getHotData(platform);
    console.log(`[${new Date().toISOString()}] ${platform}: ${data.count} items`);
    res.end(JSON.stringify(data));
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${platform} error:`, err.message);
    res.writeHead(500);
    res.end(JSON.stringify({ code: 0, error: err.message }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🔥 HotAPI running on http://0.0.0.0:${PORT}`);
  console.log(`   Available: /api/{baidu,weibo,zhihu,weixin,thepaper,ithome,huxiu,all}`);
  console.log(`   Health:    /health`);
});
