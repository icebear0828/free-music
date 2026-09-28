import {
  DEFAULT_LYRICS_STYLE,
  EMPTY_SNAPSHOT,
  type FloatingLyricsBridge,
  type LyricsCommand,
  type LyricsSnapshot,
  type LyricsStyle,
} from './types';

const PIP_STYLES = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif;
    background: transparent;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100vh;
    padding: 12px 18px;
    overflow: hidden;
    user-select: none;
  }
  #meta {
    font-size: 12px;
    opacity: 0.6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 6px;
  }
  #line { line-height: 1.25; word-break: break-word; }
  #translation { margin-top: 4px; opacity: 0.75; }
  #next { margin-top: 6px; opacity: 0.4; font-size: 0.6em; }
  #controls {
    display: flex;
    gap: 14px;
    align-items: center;
    margin-top: 12px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  body:hover #controls { opacity: 1; }
  #controls button {
    background: rgba(255,255,255,0.12);
    border: none;
    border-radius: 999px;
    color: inherit;
    cursor: pointer;
    font-size: 13px;
    padding: 5px 12px;
  }
  #controls button:hover { background: rgba(255,255,255,0.24); }
`;

interface PipRefs {
  win: Window;
  root: HTMLElement;
  meta: HTMLElement;
  line: HTMLElement;
  translation: HTMLElement;
  next: HTMLElement;
  playBtn: HTMLButtonElement;
}

/**
 * Browser fallback: Document Picture-in-Picture gives a genuinely
 * always-on-top OS window without any native shell (Chromium 116+).
 * `show()` must be called from a user gesture.
 */
export function createWebBridge(): FloatingLyricsBridge {
  const supported =
    typeof window !== 'undefined' && typeof window.documentPictureInPicture !== 'undefined';

  let refs: PipRefs | null = null;
  let style: LyricsStyle = DEFAULT_LYRICS_STYLE;
  let snapshot: LyricsSnapshot = EMPTY_SNAPSHOT;
  const handlers = new Set<(command: LyricsCommand) => void>();

  const emit = (command: LyricsCommand) => handlers.forEach((handler) => handler(command));

  const paint = () => {
    if (!refs) return;
    refs.meta.textContent = snapshot.title
      ? `${snapshot.title} — ${snapshot.artist}`
      : '未在播放';
    refs.line.textContent = snapshot.line || '♪';
    refs.translation.textContent = style.showTranslation ? snapshot.translation : '';
    refs.translation.style.display =
      style.showTranslation && snapshot.translation ? 'block' : 'none';
    refs.next.textContent = snapshot.nextLine;
    refs.next.style.display = snapshot.nextLine ? 'block' : 'none';
    refs.playBtn.textContent = snapshot.isPlaying ? '暂停' : '播放';

    refs.root.style.color = style.color;
    refs.line.style.color = style.activeColor;
    refs.line.style.fontSize = `${style.fontSize}px`;
    refs.line.style.fontWeight = style.bold ? '700' : '500';
    refs.root.style.background = style.background;
    refs.root.style.opacity = String(style.opacity);
  };

  const teardown = () => {
    refs = null;
  };

  return {
    kind: 'web',
    supported,
    needsPermission: false,
    hasPermission: async () => supported,
    requestPermission: async () => supported,
    isVisible: async () => refs !== null,
    show: async () => {
      if (!supported || refs) return;
      const pip = window.documentPictureInPicture;
      if (!pip) return;
      const win = await pip.requestWindow({ width: 520, height: 200 });

      const styleEl = win.document.createElement('style');
      styleEl.textContent = PIP_STYLES;
      win.document.head.appendChild(styleEl);

      const meta = win.document.createElement('div');
      meta.id = 'meta';
      const line = win.document.createElement('div');
      line.id = 'line';
      const translation = win.document.createElement('div');
      translation.id = 'translation';
      const next = win.document.createElement('div');
      next.id = 'next';

      const controls = win.document.createElement('div');
      controls.id = 'controls';
      const makeButton = (label: string, command: LyricsCommand) => {
        const button = win.document.createElement('button');
        button.textContent = label;
        button.addEventListener('click', () => emit(command));
        controls.appendChild(button);
        return button;
      };
      makeButton('上一首', 'prev');
      const playBtn = win.document.createElement('button');
      playBtn.textContent = '播放';
      playBtn.addEventListener('click', () => emit(snapshot.isPlaying ? 'pause' : 'play'));
      controls.appendChild(playBtn);
      makeButton('下一首', 'next');

      const body = win.document.body;
      body.append(meta, line, translation, next, controls);

      win.addEventListener('pagehide', () => {
        teardown();
        emit('close');
      });

      refs = { win, root: body, meta, line, translation, next, playBtn };
      paint();
    },
    hide: async () => {
      refs?.win.close();
      teardown();
    },
    update: async (nextSnapshot: LyricsSnapshot) => {
      snapshot = nextSnapshot;
      paint();
    },
    setStyle: async (nextStyle: LyricsStyle) => {
      style = nextStyle;
      paint();
    },
    onCommand: (handler: (command: LyricsCommand) => void) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}
