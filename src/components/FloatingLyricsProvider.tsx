import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { usePlayer } from './PlayerProvider';
import { findLyricIndex } from '../hooks/useCurrentLyric';
import { floatingLyrics, unsupportedReason } from '../platform/floatingLyrics';
import { DEFAULT_LYRICS_STYLE, type LyricsSnapshot, type LyricsStyle, type PlatformKind } from '../platform/types';
import { getProxiedCoverUrl } from '../services/api';

const ENABLED_KEY = 'floating_lyrics_enabled';
const STYLE_KEY = 'floating_lyrics_style';

interface FloatingLyricsContextType {
  kind: PlatformKind;
  supported: boolean;
  needsPermission: boolean;
  enabled: boolean;
  style: LyricsStyle;
  error: string | null;
  unsupportedHint: string;
  enable: () => Promise<void>;
  disable: () => Promise<void>;
  toggle: () => Promise<void>;
  updateStyle: (patch: Partial<LyricsStyle>) => void;
  resetStyle: () => void;
}

const FloatingLyricsContext = createContext<FloatingLyricsContextType | undefined>(undefined);

function loadStyle(): LyricsStyle {
  try {
    const saved = localStorage.getItem(STYLE_KEY);
    if (saved) return { ...DEFAULT_LYRICS_STYLE, ...(JSON.parse(saved) as Partial<LyricsStyle>) };
  } catch {
    // fall through to defaults
  }
  return DEFAULT_LYRICS_STYLE;
}

export function FloatingLyricsProvider({ children }: { children: React.ReactNode }) {
  const { currentSong, isPlaying, currentTime, duration, lyrics, togglePlay, playNext, playPrev } = usePlayer();

  const bridge = useMemo(() => floatingLyrics(), []);
  const [enabled, setEnabled] = useState(false);
  const [style, setStyle] = useState<LyricsStyle>(loadStyle);
  const [error, setError] = useState<string | null>(null);

  // Player actions are recreated every render; refs keep the command listener stable.
  const actionsRef = useRef({ togglePlay, playNext, playPrev });
  actionsRef.current = { togglePlay, playNext, playPrev };

  const lineIndex = findLyricIndex(lyrics, currentTime);
  const line = lineIndex >= 0 ? lyrics[lineIndex] : undefined;
  const nextLine = lineIndex >= 0 ? lyrics[lineIndex + 1] : lyrics[0];

  const snapshot: LyricsSnapshot = useMemo(
    () => ({
      title: currentSong?.title ?? '',
      artist: currentSong?.artist ?? '',
      cover: currentSong ? getProxiedCoverUrl(currentSong.cover) : '',
      line: line?.text ?? (currentSong ? '♪' : ''),
      translation: line?.translation ?? '',
      nextLine: nextLine?.text ?? '',
      isPlaying,
      currentTime,
      duration,
    }),
    // currentTime intentionally excluded: it changes ~4x/s and would spam the
    // native bridge. A separate interval below refreshes progress once a second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentSong?.id, currentSong?.title, line?.text, line?.translation, nextLine?.text, isPlaying, duration]
  );

  const snapshotRef = useRef(snapshot);
  snapshotRef.current = { ...snapshot, currentTime };

  const disable = useCallback(async () => {
    setEnabled(false);
    localStorage.setItem(ENABLED_KEY, 'false');
    await bridge.hide().catch(() => undefined);
  }, [bridge]);

  const enable = useCallback(async () => {
    setError(null);
    if (!bridge.supported) {
      setError(unsupportedReason(bridge));
      return;
    }
    if (bridge.needsPermission && !(await bridge.hasPermission())) {
      const granted = await bridge.requestPermission();
      if (!granted) {
        setError('未获得悬浮窗权限，请在系统设置中允许「显示在其他应用上层」后重试。');
        return;
      }
    }
    try {
      await bridge.setStyle(style);
      await bridge.show();
      await bridge.update(snapshotRef.current);
      setEnabled(true);
      localStorage.setItem(ENABLED_KEY, 'true');
    } catch (err) {
      setError(err instanceof Error ? err.message : '悬浮歌词启动失败');
    }
  }, [bridge, style]);

  const toggle = useCallback(async () => {
    if (enabled) await disable();
    else await enable();
  }, [enabled, enable, disable]);

  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;

  const updateStyle = useCallback((patch: Partial<LyricsStyle>) => {
    setStyle((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STYLE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const resetStyle = useCallback(() => {
    setStyle(DEFAULT_LYRICS_STYLE);
    localStorage.setItem(STYLE_KEY, JSON.stringify(DEFAULT_LYRICS_STYLE));
  }, []);

  // Restore the previous session's overlay. The browser fallback needs a user
  // gesture to open a picture-in-picture window, so it is never auto-restored.
  useEffect(() => {
    if (localStorage.getItem(ENABLED_KEY) !== 'true') return;
    if (!bridge.supported || bridge.kind === 'web') return;
    void enable();
    // Restore once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return bridge.onCommand((command) => {
      const actions = actionsRef.current;
      switch (command) {
        case 'play':
        case 'pause':
          actions.togglePlay();
          break;
        case 'next':
          actions.playNext();
          break;
        case 'prev':
          actions.playPrev();
          break;
        case 'close':
          void disable();
          break;
        case 'toggle':
          void toggleRef.current();
          break;
        case 'lock':
          updateStyle({ locked: true });
          break;
        case 'unlock':
          updateStyle({ locked: false });
          break;
        case 'open-app':
          break;
      }
    });
  }, [bridge, disable, updateStyle]);

  useEffect(() => {
    if (!enabled) return;
    void bridge.update(snapshotRef.current).catch(() => undefined);
  }, [bridge, enabled, snapshot]);

  useEffect(() => {
    if (!enabled) return;
    void bridge.setStyle(style).catch(() => undefined);
  }, [bridge, enabled, style]);

  useEffect(() => {
    if (!enabled || !isPlaying) return;
    const timer = setInterval(() => {
      void bridge.update(snapshotRef.current).catch(() => undefined);
    }, 1000);
    return () => clearInterval(timer);
  }, [bridge, enabled, isPlaying]);

  const value: FloatingLyricsContextType = {
    kind: bridge.kind,
    supported: bridge.supported,
    needsPermission: bridge.needsPermission,
    enabled,
    style,
    error,
    unsupportedHint: unsupportedReason(bridge),
    enable,
    disable,
    toggle,
    updateStyle,
    resetStyle,
  };

  return <FloatingLyricsContext.Provider value={value}>{children}</FloatingLyricsContext.Provider>;
}

export function useFloatingLyrics(): FloatingLyricsContextType {
  const context = useContext(FloatingLyricsContext);
  if (context === undefined) {
    throw new Error('useFloatingLyrics must be used within a FloatingLyricsProvider');
  }
  return context;
}
