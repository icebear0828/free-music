import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Lock, Pause, Play, Unlock, X } from 'lucide-react';
import {
  DEFAULT_LYRICS_STYLE,
  EMPTY_SNAPSHOT,
  type LyricsCommand,
  type LyricsSnapshot,
  type LyricsStyle,
} from '../platform/types';

export function DesktopLyricsOverlay() {
  const [snapshot, setSnapshot] = useState<LyricsSnapshot>(EMPTY_SNAPSHOT);
  const [style, setStyle] = useState<LyricsStyle>(DEFAULT_LYRICS_STYLE);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const bridge = window.desktopLyrics;
    if (!bridge) return;
    const offSnapshot = bridge.onSnapshot(setSnapshot);
    const offStyle = bridge.onStyle(setStyle);
    return () => {
      offSnapshot();
      offStyle();
    };
  }, []);

  // In locked mode the window ignores clicks, but Electron still forwards move
  // events — so hovering temporarily re-enables interaction for the toolbar.
  useEffect(() => {
    window.desktopLyrics?.setIgnoreMouseEvents(style.locked && !hovering);
  }, [style.locked, hovering]);

  const send = (command: LyricsCommand) => window.desktopLyrics?.send(command);

  const progress = snapshot.duration > 0 ? (snapshot.currentTime / snapshot.duration) * 100 : 0;
  const idle = !snapshot.title;

  return (
    <div
      className={`overlay${idle ? ' idle' : ''}`}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      style={{
        background: style.background,
        color: style.color,
        opacity: style.opacity,
      }}
    >
      <div className="overlay__meta">
        {snapshot.title ? `${snapshot.title} — ${snapshot.artist}` : ''}
      </div>

      <div className="overlay__toolbar">
        <button onClick={() => send('prev')} title="上一首">
          <ChevronLeft size={15} />
        </button>
        <button onClick={() => send(snapshot.isPlaying ? 'pause' : 'play')} title="播放 / 暂停">
          {snapshot.isPlaying ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={() => send('next')} title="下一首">
          <ChevronRight size={15} />
        </button>
        <button
          onClick={() => send(style.locked ? 'unlock' : 'lock')}
          title={style.locked ? '解锁（可拖动）' : '锁定（鼠标穿透）'}
        >
          {style.locked ? <Lock size={13} /> : <Unlock size={13} />}
        </button>
        <button onClick={() => send('close')} title="关闭桌面歌词">
          <X size={14} />
        </button>
      </div>

      <div
        className="overlay__line"
        style={{
          color: style.activeColor,
          fontSize: `${style.fontSize}px`,
          fontWeight: style.bold ? 700 : 500,
        }}
      >
        {snapshot.line || (idle ? '桌面歌词已开启' : '♪')}
      </div>

      {style.showTranslation && snapshot.translation && (
        <div className="overlay__translation" style={{ fontSize: `${Math.round(style.fontSize * 0.62)}px` }}>
          {snapshot.translation}
        </div>
      )}

      {snapshot.nextLine && (
        <div className="overlay__next" style={{ fontSize: `${Math.round(style.fontSize * 0.52)}px` }}>
          {snapshot.nextLine}
        </div>
      )}

      <div className="overlay__progress">
        <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
    </div>
  );
}
