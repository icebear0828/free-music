import { registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import type {
  FloatingLyricsBridge,
  LyricsCommand,
  LyricsSnapshot,
  LyricsStyle,
} from './types';

interface FloatingLyricsPlugin {
  hasPermission(): Promise<{ granted: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  show(): Promise<void>;
  hide(): Promise<void>;
  isVisible(): Promise<{ visible: boolean }>;
  update(options: LyricsSnapshot): Promise<void>;
  setStyle(options: LyricsStyle): Promise<void>;
  addListener(
    event: 'command',
    handler: (data: { command: LyricsCommand }) => void
  ): Promise<PluginListenerHandle>;
}

const FloatingLyrics = registerPlugin<FloatingLyricsPlugin>('FloatingLyrics');

/**
 * Android overlay: a SYSTEM_ALERT_WINDOW view driven by a foreground service.
 * The permission is granted from a system settings screen, not a runtime
 * dialog, so `requestPermission` resolves once the user comes back to the app.
 */
export function createCapacitorBridge(kind: 'android' | 'ios'): FloatingLyricsBridge {
  const supported = kind === 'android';

  return {
    kind,
    supported,
    needsPermission: supported,
    hasPermission: async () => {
      if (!supported) return false;
      const { granted } = await FloatingLyrics.hasPermission();
      return granted;
    },
    requestPermission: async () => {
      if (!supported) return false;
      const { granted } = await FloatingLyrics.requestPermission();
      return granted;
    },
    show: async () => {
      if (!supported) return;
      await FloatingLyrics.show();
    },
    hide: async () => {
      if (!supported) return;
      await FloatingLyrics.hide();
    },
    isVisible: async () => {
      if (!supported) return false;
      const { visible } = await FloatingLyrics.isVisible();
      return visible;
    },
    update: async (snapshot: LyricsSnapshot) => {
      if (!supported) return;
      await FloatingLyrics.update(snapshot);
    },
    setStyle: async (style: LyricsStyle) => {
      if (!supported) return;
      await FloatingLyrics.setStyle(style);
    },
    onCommand: (handler: (command: LyricsCommand) => void) => {
      if (!supported) return () => undefined;
      const pending = FloatingLyrics.addListener('command', ({ command }) => handler(command));
      return () => {
        void pending.then((listener) => listener.remove());
      };
    },
  };
}
