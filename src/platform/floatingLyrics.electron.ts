import type {
  FloatingLyricsBridge,
  LyricsCommand,
  LyricsSnapshot,
  LyricsStyle,
} from './types';

/**
 * Desktop overlay: a separate transparent, always-on-top BrowserWindow owned by
 * the Electron main process. Everything here is a thin IPC pass-through.
 */
export function createElectronBridge(): FloatingLyricsBridge | null {
  const desktop = window.desktop;
  if (!desktop) return null;

  return {
    kind: 'electron',
    supported: true,
    needsPermission: false,
    hasPermission: async () => true,
    requestPermission: async () => true,
    show: () => desktop.lyrics.show(),
    hide: () => desktop.lyrics.hide(),
    isVisible: () => desktop.lyrics.isVisible(),
    update: (snapshot: LyricsSnapshot) => desktop.lyrics.update(snapshot),
    setStyle: (style: LyricsStyle) => desktop.lyrics.setStyle(style),
    onCommand: (handler: (command: LyricsCommand) => void) =>
      desktop.lyrics.onCommand(handler),
  };
}
