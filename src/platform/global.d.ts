import type { LyricsCommand, LyricsSnapshot, LyricsStyle } from './types';

export interface DesktopAppInfo {
  platform: string;
  appVersion: string;
  serverPort: number;
}

/** Surface exposed by electron/preload.cjs on the main window. */
export interface DesktopBridge {
  readonly platform: string;
  getInfo(): Promise<DesktopAppInfo>;
  lyrics: {
    show(): Promise<void>;
    hide(): Promise<void>;
    isVisible(): Promise<boolean>;
    update(snapshot: LyricsSnapshot): Promise<void>;
    setStyle(style: LyricsStyle): Promise<void>;
    onCommand(handler: (command: LyricsCommand) => void): () => void;
  };
  window: {
    minimize(): void;
    toggleMaximize(): void;
    close(): void;
  };
}

/** Surface exposed by electron/lyrics-preload.cjs on the overlay window. */
export interface DesktopLyricsBridge {
  onSnapshot(handler: (snapshot: LyricsSnapshot) => void): () => void;
  onStyle(handler: (style: LyricsStyle) => void): () => void;
  send(command: LyricsCommand): void;
  setIgnoreMouseEvents(ignore: boolean): void;
}

declare global {
  interface Window {
    desktop?: DesktopBridge;
    desktopLyrics?: DesktopLyricsBridge;
    documentPictureInPicture?: {
      requestWindow(options?: { width?: number; height?: number }): Promise<Window>;
      window: Window | null;
    };
  }
}

export {};
