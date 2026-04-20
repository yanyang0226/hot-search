# Cloudflare Worker 部署指南

## 🚀 一键部署（5分钟完成）

### 第一步：安装 Wrangler CLI

```bash
# 方法1：用 npm（推荐）
npm install -g wrangler

# 方法2：用 pnpm
pnpm add -g wrangler

# 方法3：用 yarn
yarn global add wrangler
```

安装完后验证：
```bash
wrangler --version
# 应该显示 3.x.x
```

---

### 第二步：登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器，按提示授权即可（用 GitHub / Google 账号都行）。

---

### 第三步：部署 Worker

```bash
# 进入 cloudflare 目录
cd cloudflare

# 一键部署！
npx wrangler deploy
```

看到类似输出就成功了：
```
⬣ Done Deploying tmp-xxxx
  https://hotsearch-worker.你的名字.workers.dev
```

**记下这个 URL，后面要用！**

---

### 第四步：测试 API

打开浏览器访问（把下面的 URL 换成你实际的）：

```
https://你的-worker-url.workers.dev/health
https://你的-worker-url.workers.dev/api/baidu
https://你的-worker-url.workers.dev/api/weibo
```

应该看到 JSON 格式的热搜数据。

---

### 第五步：配置前端 API 地址

部署完 Worker 后，编辑 `deploy/hotfront/index.html`，把：

```javascript
var API_BASE = 'https://hotsearch-worker.你的用户名.workers.dev';
```

改成你实际的 Worker URL，例如：

```javascript
var API_BASE = 'https://hotsearch-worker.yanyang.workers.dev';
```

---

### 第六步：上传前端到 GitHub Pages

GitHub Pages 自动从 `index.html` 部署，所以直接把修改后的 `index.html` 推送到 GitHub：

```bash
cd ..
git add deploy/hotfront/index.html
git commit -m "update API_BASE to my Cloudflare Worker URL"
git push origin main
```

或者直接在 GitHub 网页上编辑 `deploy/hotfront/index.html` 的第 1 行，改成你的 Worker URL，然后 Commit。

---

## 📱 最终效果

部署完成后，你就有了一个完整的热榜 App：

| 服务 | 地址 |
|------|------|
| 热榜 App | `https://yanyang0226.github.io/hot-search/` |
| 热榜 API | `https://你的-worker.workers.dev/api/baidu` |

手机直接打开 GitHub Pages 地址即可使用，API 请求到 Cloudflare Worker，**全球任何地方都能用，速度极快**。

---

## 🔧 如果想绑定自己的域名（可选）

1. Cloudflare Dashboard → Workers & Pages → 找到你的 Worker
2. 点击「Triggers」→「Custom Domains」→「Add Custom Domain」
3. 输入你的域名，按提示在 DNS 里加一条 CNAME 记录

---

## 💡 常用命令

```bash
# 查看 Worker 日志（实时）
npx wrangler tail

# 本地开发测试（不部署）
npx wrangler dev

# 重新部署
npx wrangler deploy

# 删除 Worker
npx wrangler delete hotsearch-worker
```

---

## ⚠️ 注意事项

1. **免费额度**：每天 10 万次请求，个人使用绑绑够
2. **KV 缓存**（可选）：热榜数据会被缓存 5 分钟，减少重复抓取。如果启用 KV，数据更新可能有几分钟延迟
3. **首次启用 KV**：在 `wrangler.toml` 里取消注释 KV 配置，部署后运行 `npx wrangler kv:namespace create HOTDATA`，把返回的 id 填入配置

---

## 🌐 完整架构

```
手机浏览器
    │
    ▼
GitHub Pages (热榜App前端)
    │  AJAX /api/xxx
    ▼
Cloudflare Worker (API层)
    │
    ├─ /api/baidu    → 抓取 tophub.today 百度热搜 → 返回 JSON
    ├─ /api/weibo    → 抓取 tophub.today 微博热搜 → 返回 JSON
    ├─ /proxy?url=   → 代理抓取任意文章 → 返回干净 HTML
    │
    ▼
tophub.today / 各新闻网站
```
