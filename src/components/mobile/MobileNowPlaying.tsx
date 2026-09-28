import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  Heart,
  ListMusic,
  Pause,
  PictureInPicture2,
  Play,
  Repeat,
  Repeat1,
  SkipBack,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { usePlayer } from '../PlayerProvider';
import { useAppData } from '../AppDataProvider';
import { useFloatingLyrics } from '../FloatingLyricsProvider';
import { CoverImage } from '../CoverImage';
import { getProxiedCoverUrl } from '../../services/api';
import { findLyricIndex } from '../../hooks/useCurrentLyric';
import { formatTime } from '../../utils/format';

type Panel = 'cover' | 'lyrics' | 'queue';

export function MobileNowPlaying({ onClose }: { onClose: () => void }) {
  const {
    currentSong,
    isPlaying,
    currentTime,
    duration,
    lyrics,
    playlist,
    currentIndex,
    togglePlay,
    playNext,
    playPrev,
    handleSeek,
    playQueueIndex,
    removeFromQueue,
    repeatMode,
    toggleRepeatMode,
  } = usePlayer();
  const { playlists } = useAppData();
  const floating = useFloatingLyrics();

  const [panel, setPanel] = useState<Panel>('cover');
  const [scrubbing, setScrubbing] = useState<number | null>(null);
  const lyricsRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lineIndex = findLyricIndex(lyrics, currentTime);

  useEffect(() => {
    if (panel !== 'lyrics' || !autoScroll || lineIndex < 0) return;
    const container = lyricsRef.current;
    const active = container?.querySelector<HTMLElement>(`[data-line="${lineIndex}"]`);
    if (container && active) {
      container.scrollTo({
        top: active.offsetTop - container.clientHeight / 2 + active.clientHeight / 2,
        behavior: 'smooth',
      });
    }
  }, [lineIndex, panel, autoScroll]);

  const pauseAutoScroll = () => {
    setAutoScroll(false);
    if (autoScrollTimer.current) clearTimeout(autoScrollTimer.current);
    autoScrollTimer.current = setTimeout(() => setAutoScroll(true), 4000);
  };

  useEffect(() => () => {
    if (autoScrollTimer.current) clearTimeout(autoScrollTimer.current);
  }, []);

  if (!currentSong) return null;

  const displayTime = scrubbing ?? currentTime;
  const liked = playlists.isInPlaylist('default', currentSong.id);

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 260 }}
      className="fixed inset-0 z-[90] flex flex-col text-white overflow-hidden"
    >
      <div className="absolute inset-0 -z-10">
        <CoverImage
          src={getProxiedCoverUrl(currentSong.cover)}
          alt=""
          className="w-full h-full object-cover scale-125 blur-3xl opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-black/90" />
      </div>

      <header
        className="flex items-center justify-between px-4 h-14 shrink-0"
        style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <button onClick={onClose} className="p-2 -ml-2" aria-label="收起">
          <ChevronDown className="w-6 h-6" />
        </button>
        <div className="text-center min-w-0 px-2">
          <p className="text-[13px] font-[600] truncate">{currentSong.title}</p>
          <p className="text-[11px] text-white/60 truncate">{currentSong.artist}</p>
        </div>
        <button
          onClick={() => void floating.toggle()}
          disabled={!floating.supported}
          className={`p-2 -mr-2 disabled:opacity-30 ${floating.enabled ? 'text-[#4EA1FF]' : ''}`}
          aria-label="悬浮歌词"
          title={floating.supported ? '悬浮歌词' : floating.unsupportedHint}
        >
          <PictureInPicture2 className="w-[22px] h-[22px]" />
        </button>
      </header>

      <div className="flex-1 min-h-0 px-6 flex flex-col">
        {panel === 'cover' && (
          <button className="flex-1 flex items-center justify-center" onClick={() => setPanel('lyrics')}>
            <CoverImage
              src={getProxiedCoverUrl(currentSong.cover)}
              alt={currentSong.title}
              className={`w-full max-w-[320px] aspect-square rounded-[18px] object-cover shadow-2xl transition-transform duration-500 ${
                isPlaying ? 'scale-100' : 'scale-95'
              }`}
            />
          </button>
        )}

        {panel === 'lyrics' && (
          <div
            ref={lyricsRef}
            onTouchStart={pauseAutoScroll}
            onWheel={pauseAutoScroll}
            onClick={() => setPanel('cover')}
            className="flex-1 overflow-y-auto no-scrollbar"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, black 14%, black 84%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 14%, black 84%, transparent)',
            }}
          >
            <div className="py-[35vh]">
              {lyrics.length > 0 ? (
                lyrics.map((line, idx) => (
                  <div
                    key={`${line.time}-${idx}`}
                    data-line={idx}
                    className={`py-2 text-center transition-all duration-300 ${
                      idx === lineIndex ? 'text-white' : 'text-white/40'
                    }`}
                  >
                    <p className={idx === lineIndex ? 'text-[21px] font-[700]' : 'text-[17px] font-[600]'}>
                      {line.text}
                    </p>
                    {line.translation && (
                      <p className={`mt-1 ${idx === lineIndex ? 'text-[15px] text-[#4EA1FF]' : 'text-[13px] text-white/35'}`}>
                        {line.translation}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-white/50 text-[15px]">暂无歌词</p>
              )}
            </div>
          </div>
        )}

        {panel === 'queue' && (
          <div className="flex-1 overflow-y-auto no-scrollbar py-2">
            {playlist.length === 0 ? (
              <p className="text-center text-white/50 text-[15px] mt-10">队列为空</p>
            ) : (
              <ul className="divide-y divide-white/10">
                {playlist.map((song, index) => (
                  <li key={`${song.id}-${index}`} className="flex items-center gap-2 py-3">
                    <button
                      className="flex-1 min-w-0 text-left"
                      onClick={() => playQueueIndex(index)}
                    >
                      <p
                        className={`text-[15px] font-[500] truncate ${
                          index === currentIndex ? 'text-[#4EA1FF]' : 'text-white'
                        }`}
                      >
                        {song.title}
                      </p>
                      <p className="text-[12px] text-white/50 truncate">{song.artist}</p>
                    </button>
                    <button className="p-2 text-white/40" onClick={() => removeFromQueue(index)} aria-label="移出队列">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="px-6 pt-2 shrink-0">
        <input
          type="range"
          min={0}
          max={Math.max(1, duration)}
          step={0.5}
          value={displayTime}
          onChange={(e) => setScrubbing(Number(e.target.value))}
          onPointerUp={() => {
            if (scrubbing !== null && duration > 0) handleSeek(scrubbing / duration);
            setScrubbing(null);
          }}
          className="w-full accent-white h-1"
          aria-label="播放进度"
        />
        <div className="flex justify-between text-[11px] text-white/55 font-mono mt-1">
          <span>{formatTime(displayTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between px-8 pt-3 shrink-0">
        <button
          onClick={() => playlists.toggleInPlaylist('default', currentSong)}
          className={liked ? 'text-[#FF375F]' : 'text-white/60'}
          aria-label="喜欢"
        >
          <Heart className={`w-6 h-6 ${liked ? 'fill-current' : ''}`} />
        </button>
        <button onClick={playPrev} aria-label="上一首">
          <SkipBack className="w-8 h-8 fill-current" />
        </button>
        <button
          onClick={togglePlay}
          className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center active:scale-95 transition-transform"
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? <Pause className="w-8 h-8 fill-current" /> : <Play className="w-8 h-8 fill-current ml-1" />}
        </button>
        <button onClick={() => playNext()} aria-label="下一首">
          <SkipForward className="w-8 h-8 fill-current" />
        </button>
        <button
          onClick={toggleRepeatMode}
          className={repeatMode === 'none' ? 'text-white/60' : 'text-[#4EA1FF]'}
          aria-label="循环模式"
        >
          {repeatMode === 'one' ? <Repeat1 className="w-6 h-6" /> : <Repeat className="w-6 h-6" />}
        </button>
      </div>

      <div
        className="flex items-center justify-center gap-6 pt-4 pb-4 text-[12px] text-white/55 shrink-0"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={() => setPanel(panel === 'lyrics' ? 'cover' : 'lyrics')}
          className={panel === 'lyrics' ? 'text-white' : ''}
        >
          歌词
        </button>
        <button
          onClick={() => setPanel(panel === 'queue' ? 'cover' : 'queue')}
          className={`flex items-center gap-1 ${panel === 'queue' ? 'text-white' : ''}`}
        >
          <ListMusic className="w-4 h-4" />
          队列 {playlist.length > 0 ? playlist.length : ''}
        </button>
      </div>
    </motion.div>
  );
}
