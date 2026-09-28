import { isAndroid, isElectron, isIOS } from './runtime';
import { createCapacitorBridge } from './floatingLyrics.capacitor';
import { createElectronBridge } from './floatingLyrics.electron';
import { createWebBridge } from './floatingLyrics.web';
import type { FloatingLyricsBridge } from './types';

function pickBridge(): FloatingLyricsBridge {
  if (isElectron) {
    const electron = createElectronBridge();
    if (electron) return electron;
  }
  if (isAndroid) return createCapacitorBridge('android');
  if (isIOS) return createCapacitorBridge('ios');
  return createWebBridge();
}

let cached: FloatingLyricsBridge | null = null;

export function floatingLyrics(): FloatingLyricsBridge {
  if (!cached) cached = pickBridge();
  return cached;
}

/** Human-readable reason shown in settings when the overlay is unavailable. */
export function unsupportedReason(bridge: FloatingLyricsBridge): string {
  switch (bridge.kind) {
    case 'ios':
      return 'iOS 不允许应用绘制系统级悬浮窗，请使用锁屏/灵动岛歌词或应用内全屏歌词。';
    case 'web':
      return '当前浏览器不支持文档画中画，请改用桌面版或 Chrome / Edge 116+。';
    default:
      return '当前平台不支持悬浮歌词。';
  }
}

export * from './types';
