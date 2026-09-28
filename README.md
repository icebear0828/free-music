<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Free Music 本地音乐播放及聚合服务

这是一个基于 **React 19**、**Vite 6**、**Tailwind CSS** 和 **Express (TypeScript)** 构建的本地音乐聚合播放、检索及高品质下载服务。

该服务通过动态加载各种音源平台解析插件，实现了单曲检索、歌单导入、在线播放、卡拉OK歌词滚动、以及包括 FLAC/WAV 无损品质在内的音乐和歌词本地下载功能。

同一份客户端代码可打包为 **网页 / PWA、Windows·macOS·Linux 桌面端（Electron）、Android 与 iOS App（Capacitor）**，
桌面端与 Android 支持真正的**系统级悬浮歌词**。构建与授权步骤见 [PLATFORMS.md](PLATFORMS.md)。

---

## 🌟 核心特性

- **全平台客户端**: 桌面端（Electron，内嵌 Express 服务，双击即用）、移动端（Capacitor，连接局域网服务端）、浏览器 PWA 可安装。移动端为独立的底部 Tab + 迷你播放器 + 全屏播放页布局，非缩放版桌面界面。
- **悬浮歌词**: 桌面端为透明置顶窗口（可拖动、可锁定鼠标穿透、悬停出控制条）；Android 为 `SYSTEM_ALERT_WINDOW` 前台服务悬浮窗；浏览器回退到 Document Picture-in-Picture。字号、颜色、译文开关全平台统一设置。
- **系统媒体控制**: 接入 MediaSession，锁屏 / 通知栏 / 耳机线控可直接控制播放。

- **多源聚合搜索**: 支持通过流式 SSE (`GET /api/search/stream`) 或普通 JSON (`GET /api/search`) 在多个第三方平台进行单曲/歌手/歌单检索，支持后台用户自定义偏好音源过滤。
- **高品质音乐下载**: 提供专门的 `GET /api/download` & `POST /api/download` API 支持，可指定音频品质（低、标准、FLAC 无损、WAV 原轨）以及自定义保存的文件名。
- **歌词同步与下载**: 支持卡拉OK时间戳歌词实时高亮显示，并提供 `.lrc` 文件直接下载 API (`GET/POST /api/download/lyric`)。
- **智能防刷与防盗链代理**:
  - 音频流经由服务端代理 (`/api/proxy`)，解决大部分音源网站的跨域拦截及防盗链。
  - 智能封面图片预载机制与 Unsplash 歌曲占位组件 (`CoverImage`)，无缝解决第三方图片防盗链和 404 错误。
- **自动容错切源**: 针对网易云/小芸等音源的播放限制（如 30 秒试听或失效链接），插件层可智能识别并抛出错误，前端播放器自动静默切源，确保播放体验连贯。
- **客户端错误实时上报**: 网页端发生的任何运行时异常或未捕获 Promise Rejection 均会通过 `/api/log-client-error` 接口实时上报给服务端日志。

---

## 📂 项目结构

```text
├── server/                    # 后端 Node.js + Express 服务
│   ├── middleware/            # 错误处理及安全中间件
│   ├── plugins/               # 音乐平台解析插件 (如 xiaoyun, xiaoqiu 等)
│   ├── services/              # 业务逻辑服务层 (如 music-service)
│   ├── utils/                 # 工具类 (logger, paths 等)
│   ├── plugin-manager.ts      # 插件加载与生命周期管理器
│   ├── routes.ts              # Express API 路由定义
│   ├── app.ts                 # startServer() —— 可被 CLI 与 Electron 复用
│   └── server.ts              # CLI 启动入口
├── src/                       # 前端 React 19 客户端
│   ├── platform/              # 平台抽象层 (运行时探测 + 悬浮歌词桥接)
│   ├── components/
│   │   ├── desktop/           # 桌面布局 (侧边栏 + 表格)
│   │   ├── mobile/            # 移动布局 (Tab 栏 + 迷你播放器 + 全屏播放页)
│   │   └── ...                # 共享组件 (PlayerProvider, SettingsView 等)
│   ├── desktop-lyrics/        # 桌面悬浮歌词窗口的独立渲染入口
│   ├── hooks/                 # 业务逻辑 React Hooks (useLibrary, useDownloads 等)
│   ├── services/              # 前端 API 交互层 (api.ts)
│   ├── types.ts               # 前端 TypeScript 全局类型声明
│   └── main.tsx               # 前端渲染入口
├── electron/                  # Electron 主进程、preload、悬浮歌词窗口
├── android/                   # Capacitor Android (含悬浮歌词原生插件)
├── ios/                       # Capacitor iOS
├── desktop-lyrics.html        # 悬浮歌词窗口 HTML 入口
├── capacitor.config.ts        # Capacitor 配置
├── electron-builder.json      # 桌面端打包配置
├── start.sh                   # 生产环境一键构建并启动脚本 (tmux 后台运行)
├── prod-update.sh             # 生产环境拉取最新代码并热重构脚本
├── PLATFORMS.md               # 全平台构建与悬浮歌词说明
├── API.md                     # 详细的后端 API 接口规范说明书
└── TODO.md                    # 阶段开发与重构任务清单
```

---

## 🚀 启动与运行

项目提供了两种运行模式：**生产部署模式**（强烈推荐，可规避代理环境下的 Web Socket 冲突）与**本地开发调试模式**。

### 1. 生产部署模式 (推荐)

在生产部署模式下，服务会在系统的后台 `tmux` 容器中独立运行。即使您关闭终端窗口或退出登录，音乐服务依然在后台正常提供。

*   **启动/重启服务**:
    ```bash
    ./start.sh
    ```
    *注：该脚本会自动执行前端编译 (`npm run build`)，并在 `tmux` 会话 `music` 中以生产环境模式 (`NODE_ENV=production`) 启动后端服务。*
*   **查看服务控制台输出/调试**:
    ```bash
    tmux a -t music
    ```
    *(若要退出 tmux 监视视图，请按下 `Ctrl + B` 然后按 `D`。)*
*   **安全停止服务**:
    在 tmux 会话中按下 `Ctrl + C`，或者在主终端执行：
    ```bash
    tmux send-keys -t music C-c
    ```

### 2. 本地开发调试模式

适用于需要对 React 界面、CSS 样式或 Express 路由进行实时修改的场景：

1.  **安装依赖**:
    ```bash
    npm install
    ```
2.  **启动开发服务器**:
    ```bash
    PORT=15000 npm run dev
    ```

### 3. 桌面端 / 移动端

```bash
npm run dev:desktop        # Electron 桌面端（开发）
npm run dist:mac           # 打包 macOS 安装器，产物在 release/
npm run mobile:run:android # 构建并安装到已连接的 Android 设备
```

完整说明（含悬浮歌词权限、服务器地址配置、iOS 与 PWA）见 [PLATFORMS.md](PLATFORMS.md)。

---

## 🛠️ 配置说明 (.env)

在项目根目录下可以创建或修改 `.env` 文件来控制全局环境变量：

| 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `PORT` | `15000` | 音乐播放器的 Web 服务端口 |
| `HMR_PORT` | `15001` | Vite 模块热更新 (Hot Module Replacement) 监听端口 |
| `LX_API_URL` | 无 | 外链解析 API 地址（可选，等价于只填一个地址的 `LX_API_URLS`） |
| `LX_API_URLS` | 无 | 逗号分隔的外链解析 API 列表，按顺序尝试，排在公共 API 之前 |
| `LX_API_KEY` | `share-v3` | 外链解析 API 的 `X-Request-Key` |
| `LX_API_DISABLE_PUBLIC` | 无 | 设为 `1` 时不再请求公共 API，只用自建地址 |

### 播放链接是怎么解析的

每个平台按顺序尝试：**外链解析 API → 平台自家接口**。两步都失败时，服务端会拿歌名+歌手去
其他平台搜同一首歌，只有标题与歌手都对得上的结果才会试播（最多 6 个候选）。

公共外链 API 是所有人共用的，请求过猛会按 IP 封禁并对**所有**平台返回
`禁止批量下载`，表现就是每首歌都「无法获取播放链接」。为此客户端做了限流、
结果缓存和熔断：某个地址返回封禁/限流后会停用 10 分钟，期间直接走平台自家接口。
需要稳定播放建议自建一份并填进 `LX_API_URLS`。

以下变量为可选，填了就用你自己的账号解析（不填则只能播放各平台公开可听的部分）：

| 变量名 | 说明 |
| :--- | :--- |
| `NETEASE_COOKIE` | 网易云登录 Cookie |
| `QQ_MUSIC_COOKIE` / `QQ_MUSIC_UIN` | QQ 音乐登录 Cookie 与 uin |
| `KUGOU_COOKIE` / `KUGOU_TOKEN` / `KUGOU_USERID` | 酷狗登录凭据 |

---

## 🖥️ macOS 开机自启服务 (launchd)

如果您希望在 macOS 系统开机或登录时自动在后台启动此服务，可以使用配置好的守护进程配置文件：

1.  确认您的 `plist` 配置文件已放置于：
    `~/Library/LaunchAgents/com.yutao.music.plist`
2.  **载入并启用开机自启**:
    ```bash
    launchctl bootstrap gui/501 ~/Library/LaunchAgents/com.yutao.music.plist
    ```
3.  **停用开机自启服务**:
    ```bash
    launchctl bootout gui/501 ~/Library/LaunchAgents/com.yutao.music.plist
    ```

---

## 🧪 自动化测试

项目采用了类型安全的 **Vitest** 作为单元和集成测试框架：

- **运行交互式测试监视器 (Watch Mode)**:
  ```bash
  npm run test
  ```
- **单次运行所有测试 (CI / 一次性校验)**:
  ```bash
  npm run test:run
  ```

---

## 📖 接口文档说明

有关 API 的详细请求格式、参数说明及返回示例，请参阅项目中的 [API.md](file:///Users/yutao/music/API.md) 说明文档。包含以下核心接口：

- `GET /api/search` / `GET /api/search/stream` — 综合搜索 / 流式 SSE 搜索
- `POST /api/play` — 获取真实播放媒体源地址
- `POST /api/lyric` — 获取格式化歌词
- `GET /api/proxy` — 媒体防盗链代理转发
- `GET /api/download` — 高品质音乐直接下载 (包含 GET 快捷下载与 POST 实体对象下载)
- `GET /api/download/lyric` — 卡拉OK时间戳歌词文件下载

---

## ⚠️ 常见问题与排查 (Troubleshooting)

### 1. 为什么在开发模式下打开网页会“卡死”或无限加载？
当本地运行了系统全局代理软件（如 Clash 监听在 7897 端口）时，Vite 开发服务器的 HMR 模块热更新 WebSocket 握手可能被代理拦截或陷入死循环，造成浏览器 JS 主线程阻塞。
- **解决方案**: 推荐使用 `./start.sh` 切换到 **生产部署模式**。该模式已将前端静态编译，不再依赖开发环境的热更新 WebSocket 连接，加载时间可缩短至毫秒级。

### 2. 提示端口冲突（Port 15000 already in use）
如果有残留的 Node.js 僵尸进程占用了端口，可以运行以下命令找到占用进程并清理：
```bash
# 查找占用 15000 端口 of 进程 PID
lsof -i :15000

# 结束对应的进程
kill -9 <PID>
```
或者直接使用 `tmux a -t music` 进入会话使用 `Ctrl + C` 关闭旧的运行实例。

### 3. 如何查看客户端上报 of 错误日志？
前端浏览器捕获的未处理异常会实时发送至后端，在服务端的 stdout 或 tmux 日志中会以 `[ERROR] [Client Error]` 开头打印，便于无源部署时的排障定位。
