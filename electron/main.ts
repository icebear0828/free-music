import { app, BrowserWindow, globalShortcut, ipcMain, Menu, Tray, nativeImage, shell } from 'electron';
import path from 'path';
import fs from 'fs';
import { IPC } from './ipc.js';
import { LyricsWindow } from './lyrics-window.js';
import { startServer, type RunningServer } from '../server/app.js';
import type { LyricsSnapshot, LyricsStyle } from '../src/platform/types.js';

const isDev = !app.isPackaged;
const APP_ROOT = path.join(__dirname, '..');
const RENDERER_DIR = path.join(APP_ROOT, 'dist');

let mainWindow: BrowserWindow | null = null;
let lyricsWindow: LyricsWindow | null = null;
let tray: Tray | null = null;
let server: RunningServer | null = null;

function sendCommand(command: string) {
  mainWindow?.webContents.send(IPC.lyricsCommand, command);
}

async function bootServer(): Promise<RunningServer> {
  // An installed app cannot write next to its own binary, so plugins and the
  // JSON databases live under the per-user app data directory.
  process.env.MUSIC_DATA_DIR = path.join(app.getPath('userData'), 'server');
  process.env.MUSIC_STATIC_DIR = RENDERER_DIR;
  process.env.MUSIC_BUNDLED_PLUGINS_DIR = isDev
    ? path.join(APP_ROOT, 'server', 'plugins')
    : path.join(process.resourcesPath, 'plugins');
  fs.mkdirSync(process.env.MUSIC_DATA_DIR, { recursive: true });

  return startServer({
    // Port 0 lets the OS pick a free port so two copies never collide.
    port: Number(process.env.PORT || 0),
    host: '127.0.0.1',
    production: true,
    staticDir: RENDERER_DIR,
  });
}

function createMainWindow(baseUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(baseUrl);
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createTray(baseUrl: string) {
  const iconPath = path.join(APP_ROOT, 'resources', 'tray.png');
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  // A template image follows the macOS menu bar's light/dark appearance.
  if (process.platform === 'darwin') icon.setTemplateImage(true);

  tray = new Tray(icon);
  tray.setToolTip('Music');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示主窗口', click: () => (mainWindow ? mainWindow.show() : createMainWindow(baseUrl)) },
      { label: '切换悬浮歌词', click: () => sendCommand('toggle') },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
  );
  tray.on('click', () => mainWindow?.show());
}

function registerIpc(baseUrl: string) {
  lyricsWindow = new LyricsWindow({
    preloadPath: path.join(__dirname, 'lyrics-preload.cjs'),
    baseUrl,
    onCommand: sendCommand,
  });

  ipcMain.handle(IPC.lyricsShow, () => lyricsWindow?.show());
  ipcMain.handle(IPC.lyricsHide, () => lyricsWindow?.hide());
  ipcMain.handle(IPC.lyricsIsVisible, () => lyricsWindow?.isVisible() ?? false);
  ipcMain.handle(IPC.lyricsUpdate, (_event, snapshot: LyricsSnapshot) => lyricsWindow?.update(snapshot));
  ipcMain.handle(IPC.lyricsSetStyle, (_event, style: LyricsStyle) => lyricsWindow?.setStyle(style));

  ipcMain.handle(IPC.appInfo, () => ({
    platform: process.platform,
    appVersion: app.getVersion(),
    serverPort: server?.port ?? 0,
  }));

  ipcMain.on(IPC.windowMinimize, () => mainWindow?.minimize());
  ipcMain.on(IPC.windowToggleMaximize, () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on(IPC.windowClose, () => mainWindow?.close());
}

function registerShortcuts() {
  globalShortcut.register('CommandOrControl+Shift+L', () => sendCommand('toggle'));
  globalShortcut.register('CommandOrControl+Shift+Right', () => sendCommand('next'));
  globalShortcut.register('CommandOrControl+Shift+Left', () => sendCommand('prev'));
  globalShortcut.register('CommandOrControl+Shift+Space', () => sendCommand('play'));
}

// A single instance owns the server port and the overlay window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    const devUrl = process.env.MUSIC_DEV_SERVER_URL;
    let baseUrl: string;

    if (isDev && devUrl) {
      baseUrl = devUrl;
    } else {
      server = await bootServer();
      baseUrl = server.url;
    }

    registerIpc(baseUrl);
    createMainWindow(baseUrl);
    createTray(baseUrl);
    registerShortcuts();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow(baseUrl);
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    lyricsWindow?.destroy();
    void server?.close();
  });
}
