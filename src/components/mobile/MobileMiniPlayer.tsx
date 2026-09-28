import { ChevronUp, Pause, Play, SkipForward } from 'lucide-react';
import { usePlayer } from '../PlayerProvider';
import { CoverImage } from '../CoverImage';
import { getProxiedCoverUrl } from '../../services/api';

export function MobileMiniPlayer({ onExpand }: { onExpand: () => void }) {
  const { currentSong, isPlaying, currentTime, duration, togglePlay, playNext } = usePlayer();
  if (!currentSong) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="shrink-0 border-t border-[#EDEDF2] bg-white/92 backdrop-blur-xl">
      <div className="h-[2px] bg-[#EDEDF2]">
        <div className="h-full bg-[#0071E3] transition-[width] duration-300" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center gap-3 px-3 h-[60px]">
        <button className="flex items-center gap-3 flex-1 min-w-0 text-left" onClick={onExpand}>
          <CoverImage
            src={getProxiedCoverUrl(currentSong.cover)}
            alt={currentSong.title}
            className="w-11 h-11 rounded-[8px] bg-[#EDEDF2] border border-black/5 shrink-0"
          />
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="text-[14px] font-[600] truncate">{currentSong.title}</span>
            <span className="text-[11px] text-[#6E6E73] truncate mt-0.5">{currentSong.artist}</span>
          </span>
        </button>
        <button
          onClick={togglePlay}
          className="w-10 h-10 flex items-center justify-center rounded-full text-[#1D1D1F] active:bg-black/5"
          aria-label={isPlaying ? '暂停' : '播放'}
        >
          {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
        </button>
        <button
          onClick={() => playNext()}
          className="w-10 h-10 flex items-center justify-center rounded-full text-[#1D1D1F] active:bg-black/5"
          aria-label="下一首"
        >
          <SkipForward className="w-5 h-5 fill-current" />
        </button>
        <button
          onClick={onExpand}
          className="w-8 h-10 flex items-center justify-center text-[#8E8E93]"
          aria-label="展开播放页"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
