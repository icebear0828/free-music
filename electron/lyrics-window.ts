import { BrowserWindow, screen, ipcMain } from 'electron';
import path from 'path';
import { IPC } from './ipc.js';
import type { LyricsSnapshot, LyricsStyle } from '../src/platform/types.js';

const WIDTH_RATIO = 0.6;
const MIN_WIDTH = 520;
const HEIGHT = 190;

export interface LyricsWindowDeps {
  preloadPath: string;
  /** Base URL of the embedded server, or the Vite dev server in development. */
  baseUrl: string;
  onCommand: (command: string) => void;
}

/**
 * A frameless, transparent, always-on-top window that sits above every other
 * app. `setIgnoreMouseEvents` with `forward: true` is what makes "locked" mode
 * click-through while still letting the overlay highlight on hover.
 */
export class LyricsWindow {
  private win: BrowserWindow | null = null;
  private snapshot: LyricsSnapshot | null = null;
  private style: LyricsStyle | null = null;
  private readonly deps: LyricsWindowDeps;

  constructor(deps: LyricsWindowDeps) {
    this.deps = deps;
    this.registerDragHandlers();
  }

  private registerDragHandlers() {
    ipcMain.on(IPC.lyricsIgnoreMouse, (_event, ignore: boolean) => {
      this.win?.setIgnoreMouseEvents(ignore, { forward: true });
    });
    ipcMain.on(IPC.lyricsCommand, (_event, command: string) => {
      this.deps.onCommand(command);
    });
  }

  isVisible(): boolean {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible());
  }

  show(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.showInactive();
      return;
    }

    const display = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = display.workAreaSize;
    const width = Math.max(MIN_WIDTH, Math.round(screenWidth * WIDTH_RATIO));

    this.win = new BrowserWindow({
      width,
      height: HEIGHT,
      x: Math.round((screenWidth - width) / 2),
      y: screenHeight - HEIGHT - 60,
      frame: false,
      transparent: true,
      resizable: true,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      focusable: true,
      alwaysOnTop: true,
      acceptFirstMouse: true,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: this.deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // "screen-saver" keeps the overlay above full-screen video players too.
    this.win.setAlwaysOnTop(true, 'screen-saver');
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this.win.loadURL(`${this.deps.baseUrl}/desktop-lyrics.html`);

    this.win.once('ready-to-show', () => {
      this.win?.showInactive();
      this.flush();
    });

    this.win.on('closed', () => {
      this.win = null;
      this.deps.onCommand('close');
    });
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) {
      this.win.close();
    }
    this.win = null;
  }

  update(snapshot: LyricsSnapshot): void {
    this.snapshot = snapshot;
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send(IPC.lyricsSnapshot, snapshot);
    }
  }

  setStyle(style: LyricsStyle): void {
    this.style = style;
    if (this.win && !this.win.isDestroyed()) {
      this.win.setIgnoreMouseEvents(style.locked, { forward: true });
      this.win.webContents.send(IPC.lyricsStyle, style);
    }
  }

  private flush(): void {
    if (this.style) this.setStyle(this.style);
    if (this.snapshot) this.update(this.snapshot);
  }

  destroy(): void {
    this.hide();
  }
}

export function resolvePreload(dir: string, file: string): string {
  return path.join(dir, file);
}
