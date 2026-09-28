import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePlayer } from './PlayerProvider';
import { getProxiedCoverUrl } from '../services/api';
import { CoverImage } from './CoverImage';
import { motion } from 'framer-motion';

export function LyricsView() {
  const { currentSong, isPlaying, currentTime, lyrics, showLyricsView, setShowLyricsView } = usePlayer();
  const lyricScrollRef = useRef<HTMLDivElement>(null);
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const userScrollTimeout = useRef<NodeJS.Timeout | null>(null);

  const currentLyricIndex = lyrics.findIndex((l, i) => {
    const nextLine = lyrics[i + 1];
    return currentTime >= l.time && (!nextLine || currentTime < nextLine.time);
  });

  const handleUserInteract = () => {
    setIsAutoScroll(false);
    if (userScrollTimeout.current) {
      clearTimeout(userScrollTimeout.current);
    }
    userScrollTimeout.current = setTimeout(() => {
      setIsAutoScroll(true);
    }, 3000);
  };

  useEffect(() => {
    if (showLyricsView && isAutoScroll && lyricScrollRef.current && currentLyricIndex !== -1) {
      const container = lyricScrollRef.current;
      const lyricsWrapper = container.children[0] as HTMLElement;
      if (lyricsWrapper && lyricsWrapper.children.length > currentLyricIndex) {
         const lyricEl = lyricsWrapper.children[currentLyricIndex] as HTMLElement;
         if (lyricEl) {
             container.scrollTo({
                top: lyricEl.offsetTop - container.clientHeight / 2 + lyricEl.clientHeight / 2,
                behavior: 'smooth'
             });
         }
      }
    }
  }, [currentLyricIndex, showLyricsView, isAutoScroll]);

  if (!currentSong) return null;

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 180 }}
      className="absolute inset-0 bg-[#F5F5F7]/95 backdrop-blur-3xl z-30 flex flex-col pt-10"
    >
      <div className="flex justify-between items-center px-10 mb-8">
        <button 
          onClick={() => setShowLyricsView(false)}
          className="text-[#1D1D1F] hover:bg-black/5 transition-colors p-2 rounded-full"
        >
          <ChevronDown className="w-6 h-6" />
        </button>
      </div>
      
      <div className="flex-1 flex px-10 pb-[120px] gap-16 items-center justify-center max-w-6xl mx-auto w-full">
        {/* Record player visual area */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-sm">
          <div className={`relative w-80 h-80 rounded-[16px] bg-[#EDEDF2] flex items-center justify-center shadow-lg transition-transform duration-[20s] linear ${isPlaying ? 'scale-105' : 'scale-100'} overflow-hidden border border-black/5`}>
            <CoverImage 
              src={getProxiedCoverUrl(currentSong.cover)} 
              alt={currentSong.title} 
              className="w-full h-full object-cover" 
            />
          </div>
          <div className="mt-8 text-center">
            <h2 className="text-[28px] leading-[32px] font-[700] text-[#1D1D1F] tracking-tight mb-2">{currentSong.title}</h2>
            <p className="text-[17px] leading-[25px] text-[#0071E3] font-[500]">{currentSong.artist} <span className="text-[#6E6E73] font-[400]">— {currentSong.album}</span></p>
          </div>
        </div>

        {/* Lyrics scrolling area */}
        <div 
          ref={lyricScrollRef}
          onWheel={handleUserInteract}
          onTouchStart={handleUserInteract}
          onTouchMove={handleUserInteract}
          onMouseDown={handleUserInteract}
          className="flex-1 h-[60vh] overflow-y-auto no-scrollbar mask-image-fade"
          style={{ maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)' }}
        >
          <div className="py-[30vh]">
            {lyrics.length > 0 ? (
              lyrics.map((line, idx) => (
                <div 
                  key={idx} 
                  className={`text-center py-2.5 px-6 transition-all duration-300 flex flex-col gap-1 justify-center items-center ${
                    idx === currentLyricIndex 
                      ? 'text-[#1D1D1F] scale-105 origin-center' 
                      : 'text-[#6E6E73] opacity-50 hover:opacity-80'
                  }`}
                >
                  <p className={`transition-all duration-300 ${
                    idx === currentLyricIndex ? 'text-[24px] font-[700] drop-shadow-sm' : 'text-[20px] font-[600]'
                  }`}>
                    {line.text}
                  </p>
                  {line.translation && (
                    <p className={`transition-all duration-300 ${
                      idx === currentLyricIndex 
                        ? 'text-[#0071E3] text-[18px] font-[600] mt-1' 
                        : 'text-[#86868B] text-[15px] font-[500] mt-0.5'
                    }`}>
                      {line.translation}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-[#6E6E73] opacity-80 animate-pulse">
                <p className="text-[20px] font-[600] tracking-wider">暂无歌词</p>
                <p className="text-[14px]">正在寻找中...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
