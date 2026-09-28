跨平台音乐播放器，支持桌面端与 Android 的**系统级悬浮歌词**。

## 下载哪个

| 平台 | 文件 | 说明 |
| :--- | :--- | :--- |
| macOS (Apple Silicon) | `Music-*-arm64.dmg` | M 系列芯片 |
| macOS (Intel) | `Music-*.dmg`（不带 arm64） | Intel 芯片 |
| Windows | `Music Setup *.exe` | 64 位安装器 |
| Linux | `Music-*.AppImage` / `music_*_amd64.deb` | AppImage 免安装，deb 适用于 Debian/Ubuntu |
| Android | `Music-*-android.apk` | 需在系统里允许安装未知来源应用 |

## 安装提示

**macOS**：安装包未经 Apple 公证，首次打开会提示「已损坏」或「无法验证开发者」。在终端执行一次即可：

```bash
xattr -cr /Applications/Music.app
```

**Windows**：SmartScreen 可能拦截，点「更多信息 → 仍要运行」。

**Android**：APK 使用调试密钥签名，可正常安装；如已装过其他签名的版本，需先卸载。

## 悬浮歌词怎么开

- **桌面端**：播放条右下角的画中画图标，或 `Ctrl/Cmd + Shift + L`，也可在「设置 · 悬浮歌词」里调字号与颜色。窗口可拖动，锁定后鼠标穿透。
- **Android**：设置 → 悬浮歌词 → 开启，会跳到系统「显示在其他应用上层」授权页，打开后返回即可。

## 移动端需要连接服务端

Android App 内不含后端，需要指向电脑上运行的 Music 服务：**设置 → 服务器地址** 填 `http://192.168.x.x:15000`，点「测试并保存」。

桌面端已内嵌服务端，装完直接用。

完整构建与开发说明见 [PLATFORMS.md](../blob/main/PLATFORMS.md)。
