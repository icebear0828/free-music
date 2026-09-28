# 全平台构建与悬浮歌词

同一份 React 客户端跑在四种壳里：浏览器 / PWA、Electron 桌面端、Capacitor Android、Capacitor iOS。
后端始终是同一个 Express 服务 —— 桌面端把它嵌进主进程，移动端通过局域网连接它。

```text
src/
├── platform/                    平台抽象层（唯一的分叉点）
│   ├── runtime.ts               运行时探测 + apiUrl() 后端地址解析
│   ├── types.ts                 LyricsSnapshot / LyricsStyle / FloatingLyricsBridge
│   ├── floatingLyrics.ts        按平台挑选实现
│   ├── floatingLyrics.electron.ts   IPC → 透明置顶窗口
│   ├── floatingLyrics.capacitor.ts  → Android SYSTEM_ALERT_WINDOW
│   └── floatingLyrics.web.ts        → Document Picture-in-Picture
├── components/
│   ├── AppDataProvider.tsx      两套 Shell 共享的数据层
│   ├── FloatingLyricsProvider.tsx   播放状态 → 悬浮歌词，反向接收控制指令
│   ├── desktop/                 侧边栏 + 表格布局
│   └── mobile/                  底部 Tab + 迷你播放器 + 全屏播放页
└── desktop-lyrics/              桌面歌词窗口的独立渲染入口
electron/                        主进程、preload、悬浮歌词窗口
android/                         Capacitor Android（含悬浮歌词原生插件）
ios/                            Capacitor iOS
```

## 各平台的悬浮歌词能力

| 平台 | 实现 | 能力 |
| :--- | :--- | :--- |
| Windows / macOS / Linux | Electron 独立 `BrowserWindow`（`transparent` + `alwaysOnTop: 'screen-saver'`） | 真·全局置顶，可拖动、可锁定鼠标穿透、悬停出控制条，全屏应用之上也可见 |
| Android | `SYSTEM_ALERT_WINDOW` + 前台服务 | 真·系统级悬浮窗，切到任意应用都在，可上下拖动、点按出控制条、可锁定不响应触摸 |
| 浏览器 | Document Picture-in-Picture（Chrome / Edge 116+） | 系统级置顶小窗，需由用户点击触发 |
| iOS | 不支持 | 系统禁止应用绘制其他应用之上；改用锁屏 / 控制中心（MediaSession）+ 应用内全屏歌词 |

三端共用同一个 `FloatingLyricsBridge` 接口，业务代码里没有任何 `if (platform)` 分支。

---

## 桌面端（Electron）

```bash
npm install

# 开发：Express + Vite 热更新，Electron 连上去
npm run dev:desktop

# 本机跑一次生产构建
npm run desktop

# 打包安装器（产物在 release/）
npm run dist:mac      # dmg + zip，arm64 & x64
npm run dist:win      # nsis 安装器
npm run dist:linux    # AppImage + deb
```

细节：

- 打包后主进程**内嵌启动 Express**，端口由 `PORT` 决定（`.env` 里已是 15000），插件与 JSON 数据落在 `app.getPath('userData')/server`，不写入应用包内部。
- 音源插件通过 `extraResources` 随包发出到 `resources/plugins`，启动时复制进 `userData/server/plugins`；改动插件后要同步提升 `plugin-manager.ts` 里的 `PLUGIN_BUNDLE_VERSION`，否则老安装会继续用旧副本。
- 插件放在应用包外，那里没有 `node_modules`，所以插件的 `require("axios")` 由服务端自己的 require 代为解析，不依赖插件所在目录。
- 全局快捷键：`Ctrl/Cmd+Shift+L` 开关悬浮歌词，`Ctrl/Cmd+Shift+←/→` 上下一首，`Ctrl/Cmd+Shift+Space` 播放暂停。
- 托盘菜单同样可以开关悬浮歌词。
- 悬浮歌词窗口是第二个 Vite 入口 `desktop-lyrics.html`，不会把主界面代码打进去。

---

## Android

前置：Android Studio（含 SDK 36）、JDK 17。

```bash
npm run mobile:sync          # vite build + cap sync
npm run mobile:android       # 打开 Android Studio
# 或直接跑到已连接的设备
npm run mobile:run:android
```

首次运行需要两步授权：

1. 系统弹窗授予**通知权限**（前台服务通知）。
2. 在 App 内 **设置 → 悬浮歌词 → 开启**，会跳到系统「显示在其他应用上层」页面，打开开关后返回。

原生实现位于 `android/app/src/main/java/com/yutao/music/floatinglyrics/`：

| 文件 | 职责 |
| :--- | :--- |
| `FloatingLyricsPlugin.java` | Capacitor 插件，桥接 TS 的 `FloatingLyricsBridge` |
| `FloatingLyricsService.java` | 前台服务，持有 `WindowManager` 悬浮视图，负责渲染与拖动 |
| `LyricsState.java` | 最近一次快照与样式，服务重建后可立即恢复画面 |
| `ColorUtils.java` | 解析 Web 设置里产生的 `#RRGGBB` / `rgba()` 颜色 |

> 用 Java 而非 Kotlin，是因为 Capacitor 生成的工程本身是纯 Java，这样不必额外引入 Kotlin Gradle 插件。

`minSdkVersion` 已从 24 提升到 **26**：通知渠道与 `startForegroundService` 是悬浮歌词的硬依赖。

### 连接后端

移动端 App 内不含服务端，需要指向电脑上运行的 Music 服务：

**设置 → 服务器地址** 填入 `http://192.168.x.x:15000`，点「测试并保存」（会打 `GET /api/health` 探活）。
服务端已开放 CORS，Android 也已配置明文 HTTP 白名单。

---

## iOS

前置：Xcode。

```bash
npm run mobile:ios
```

已配置后台音频（`UIBackgroundModes: audio`）与本地网络访问说明。悬浮歌词在 iOS 上会显示为不可用，
播放控制走系统 MediaSession（锁屏 / 控制中心）。

---

## PWA

`npm run build && npm run start` 之后，用手机浏览器打开服务地址，选择「添加到主屏幕」即可获得独立图标与全屏体验。
Service Worker 只缓存应用外壳，`/api/*` 一律走网络，避免搜索结果与播放地址被缓存。

---

## 新增的 npm scripts

| 命令 | 作用 |
| :--- | :--- |
| `npm run build:web` | 只构建前端（两个 HTML 入口） |
| `npm run build:server` | 只打包服务端 |
| `npm run build:electron` | 编译 Electron 主进程与 preload 到 `dist-electron/` |
| `npm run dev:desktop` | 桌面端开发模式 |
| `npm run desktop` | 桌面端生产模式本地运行 |
| `npm run dist:desktop` / `dist:mac` / `dist:win` / `dist:linux` | 打包安装器 |
| `npm run mobile:sync` | 构建前端并同步到 android/ios |
| `npm run mobile:android` / `mobile:ios` | 打开对应 IDE |
| `npm run mobile:run:android` | 直接安装运行到 Android 设备 |
