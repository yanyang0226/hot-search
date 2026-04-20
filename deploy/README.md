# 飞牛NAS (fnOS) 一键部署指南

## 📦 包含服务

| 服务 | 地址 | 说明 |
|------|------|------|
| **RSSHub** | http://NASIP:1200 | RSS 订阅源生成器，支持上千个网站 |
| **热榜 API** | http://NASIP:3001 | 聚合 8 个平台热搜数据 |
| **热榜前端** | http://NASIP:3000 | 带内嵌阅读器的热榜 App |

---

## 🚀 部署步骤（3分钟完成）

### 方法一：Web UI 导入（推荐）

1. **打开飞牛NAS Web 管理页面**
   - 地址：`http://192.168.2.210:3000`（或你的NAS地址）

2. **进入 Docker → 项目 → 导入项目**
   - 点击「导入项目」
   - 上传本目录的 `docker-compose.yml`

3. **等待构建完成**（约1-2分钟）
   - 容器自动启动
   - 绿点 = 正常运行

4. **访问服务**
   - 热榜 App：`http://192.168.2.210:3000`
   - RSSHub：`http://192.168.2.210:1200`
   - 热榜 API：`http://192.168.2.210:3001/health`

---

### 方法二：SSH 终端部署

```bash
# 1. SSH 登录 NAS
ssh admin@192.168.2.210

# 2. 进入目录
cd /你的/部署目录/deploy

# 3. 启动所有服务
docker-compose up -d

# 4. 查看状态
docker-compose ps

# 5. 查看日志
docker-compose logs -f rsshub
```

---

## 📱 使用说明

### 热榜 App（主要功能）

打开 `http://NASIP:3000`，体验如下：

```
┌──────────────────────────────────┐
│ 🔥 热榜         [NAS在线]        │ ← 顶部状态
│ [百度] [微博] [知乎] [微信] ... │ ← 8个平台切换
├──────────────────────────────────┤
│ ● 1  日本发生7.5级地震           │ ← 点击进入内嵌阅读器
│    微博 · 🔥 150万热度           │
│ ● 2  四川4.5级地震              │
│    知乎 · 8907热度               │
│ ● 3  华为发布新手机             │
│    IT之家 · 🔥 72万热度          │
└──────────────────────────────────┘

点击任意条目 → 弹出内嵌阅读器 → 直接看文章正文
滑动返回 ← 继续浏览列表
```

### 内嵌阅读器功能
- ✅ 自动提取正文，去除广告/导航/侧边栏
- ✅ 点击「浏览器打开」跳转到原站
- ✅ 支持手势返回（左滑返回列表）
- ✅ 标题 + 来源 + 正文完整展示

---

## 🔧 API 接口文档

### 热榜数据 API

```
GET http://NASIP:3001/api/baidu
GET http://NASIP:3001/api/weibo
GET http://NASIP:3001/api/zhihu
GET http://NASIP:3001/api/weixin
GET http://NASIP:3001/api/thepaper
GET http://NASIP:3001/api/huxiu
GET http://NASIP:3001/api/ithome
GET http://NASIP:3001/api/all
GET http://NASIP:3001/health
```

返回格式：
```json
{
  "code": 1,
  "platform": "baidu",
  "updatedAt": "2026-04-20T12:00:00.000Z",
  "count": 50,
  "items": [
    { "title": "文章标题", "url": "https://...", "hot": "1.2万", "source": "知乎" }
  ]
}
```

### 文章代理 API（供内嵌阅读器使用）
```
GET http://NASIP:3001/proxy?url=https://目标文章URL
```
返回目标网页的 HTML 内容（解决 CORS 跨域问题）

---

## 🌐 RSSHub 使用

打开 `http://NASIP:1200`，可以生成任意网站的 RSS：

| 订阅源 | RSS 地址 |
|--------|---------|
| 知乎热榜 | http://NASIP:1200/zhihu/hot |
| 微博热搜 | http://NASIP:1200/weibo/search/hot |
| 虎嗅头条 | http://NASIP:1200/huxiu |
| IT之家 | http://NASIP:1200/ithome |
| 澎湃新闻 | http://NASIP:1200/thepaper |
| 任意网站 | http://NASIP:1200/支持RSS的任意路由 |

完整路由文档：https://docs.rsshub.app/

---

## 🔄 更新服务

```bash
# 进入目录
cd /你的/部署目录/deploy

# 拉取最新镜像并重启
docker-compose pull
docker-compose up -d
```

---

## 🗑️ 卸载

```bash
cd /你的/部署目录/deploy
docker-compose down -v   # -v 会删除数据卷
```

---

## ⚠️ 常见问题

**Q: 容器启动失败？**
A: 检查 NAS 是否开启了 Docker 功能，飞牛NAS需要先在「应用中心」安装 Docker。

**Q: 热榜显示「NAS离线」？**
A: 检查 hotapi 容器是否正常运行：`docker-compose ps hotapi`

**Q: 文章加载失败？**
A: 部分网站（如知乎/公众号）有反爬措施，hotapi 会自动降级为跳转原站。

**Q: 外网无法访问？**
A: 需要在路由器设置端口映射，或使用 Cloudflare Tunnel 等内网穿透工具。

**Q: RSSHub 用不了？**
A: 如果 NAS 无法访问外网，需要设置 HTTP_PROXY 环境变量。

---

## 📂 目录结构

```
deploy/
├── docker-compose.yml   # 主编排文件
├── README.md           # 本说明
├── hotapi/
│   ├── server.js      # 热榜 API 服务端代码
│   ├── package.json   # Node.js 依赖
│   └── Dockerfile     # 镜像构建文件
└── hotfront/
    ├── index.html    # 热榜前端（带内嵌阅读器）
    └── nginx.conf    # Nginx 配置
```
