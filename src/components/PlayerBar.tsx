import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Heart, ChevronDown, Maximize2, ListMusic, PictureInPicture2, X, Trash2, Repeat, Repeat1, FolderPlus } from 'lucide-react';
import { usePlayer } from './PlayerProvider';
import { useFloatingLyrics } from './FloatingLyricsProvider';

const modifierLabel = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform) ? '⌘' : 'Ctrl';

const formatTime = (time: number) => {
  if (!time || isNaN(time)) return "0:00";
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

import { Playlist, Song } from '../types';
import { getProxiedCoverUrl } from '../services/api';
import { CoverImage } from './CoverImage';

export function PlayerBar({ playlists, toggleInPlaylist, isInPlaylist }: { playlists: Playlist[]; toggleInPlaylist: (pid: string, song: Song) => void; isInPlaylist: (pid: string, id: string) => boolean; }) {
  const { 
    currentSong, isPlaying, currentTime, duration, volume,
    togglePlay, playNext, playPrev, setVolume, handleSeek, showLyricsView, setShowLyricsView, audioRef, handleTimeUpdate,
    playlist, currentIndex, removeFromQueue, clearQueue, playSong, playQueueIndex,
    repeatMode, toggleRepeatMode, handleEnded
  } = usePlayer();

  const floating = useFloatingLyrics();
  const [showQueue, setShowQueue] = useState(false);
  const [showPlaylistsMenu, setShowPlaylistsMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowPlaylistsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    handleSeek(percent);
  };

  const formatDuration = (dt: number | string | undefined) => {
    if (!dt) return '--:--';
    if (typeof dt === 'string' && dt.includes(':')) return dt;
    let seconds = typeof dt === 'string' ? parseInt(dt, 10) : dt;
    if (seconds > 10000) seconds = Math.floor(seconds / 1000);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {showQueue && (
        <div className="absolute top-0 right-0 bottom-[80px] w-96 bg-white border-l border-[#EDEDF2] z-40 flex flex-col shadow-[-4px_0_24px_rgba(0,0,0,0.05)]">
          <div className="p-5 border-b border-[#EDEDF2] flex items-center justify-between bg-white/80 backdrop-blur-md">
            <h3 className="font-[600] text-[17px] text-[#1D1D1F]">播放队列</h3>
            <div className="flex items-center gap-3">
               <button 
                 onClick={clearQueue}
                 className="text-[#6E6E73] hover:text-[#0071E3] text-[12px] flex items-center gap-1 font-[500]"
               >
                 <Trash2 className="w-4 h-4" /> 清空
               </button>
               <button onClick={() => setShowQueue(false)} className="text-[#6E6E73] hover:text-[#1D1D1F] p-1">
                 <X className="w-5 h-5 flex-shrink-0" />
               </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-white p-2">
            {playlist.length === 0 ? (
              <div className="p-8 text-center text-[#6E6E73] text-[17px] mt-10">队列为空</div>
            ) : (
              <div className="space-y-1">
                {playlist.map((song, index) => (
                  <div 
                    key={`${song.id}-${index}`}
                    className={`flex items-center justify-between p-3 rounded-[8px] hover:bg-[#F5F5F7] group cursor-pointer border border-transparent ${index === currentIndex ? 'bg-[#F5F5F7] border-[#EDEDF2]' : ''}`}
                    onClick={() => playQueueIndex(index)}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <p className={`text-[15px] font-[500] leading-[20px] truncate ${index === currentIndex ? 'text-[#0071E3]' : 'text-[#1D1D1F]'}`}>
                        {song.title}
                      </p>
                      <p className="text-[12px] leading-[16px] text-[#6E6E73] truncate">{song.artist}</p>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="text-[12px] text-[#6E6E73] hidden group-hover:block transition animate-in font-mono opacity-0 group-hover:opacity-100">
                         {formatDuration(song.duration)}
                       </span>
                       <button 
                         className="text-[#6E6E73] hover:text-[#e30000] p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                         onClick={(e) => { e.stopPropagation(); removeFromQueue(index); }}
                       >
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <footer className="h-[80px] bg-white/80 backdrop-blur-xl border-t border-[#EDEDF2] flex items-center justify-between px-8 absolute bottom-0 left-0 right-0 z-50 shrink-0 select-none">
      {/* Current Track Info */}
      <div className="flex items-center gap-4 w-1/3 min-w-0">
        {currentSong ? (
          <>
            <div 
              className="relative w-14 h-14 rounded-[8px] bg-[#EDEDF2] shrink-0 overflow-hidden cursor-pointer group border border-black/5 shadow-sm"
               onClick={() => setShowLyricsView(!showLyricsView)}
            >
              <CoverImage 
                src={getProxiedCoverUrl(currentSong.cover)} 
                alt="Cover" 
                className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
              />
              <div className="absolute inset-0 bg-black/20 hidden group-hover:flex items-center justify-center text-white p-1">
                {showLyricsView ? <ChevronDown className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
              </div>
            </div>
            <div className="min-w-0 flex flex-col justify-center">
              <p className="text-[#1D1D1F] text-[15px] leading-[20px] font-[600] truncate cursor-pointer hover:underline" onClick={() => setShowLyricsView(!showLyricsView)}>{currentSong.title}</p>
              <p className="text-[12px] leading-[16px] text-[#6E6E73] truncate mt-0.5">{currentSong.artist}</p>
            </div>
            <div className="flex items-center gap-1 relative ml-2">
              <button 
                className={`transition-colors p-2 rounded-full hover:bg-black/5 ${isInPlaylist('default', currentSong.id) ? 'text-[#0071E3]' : 'text-[#6E6E73] hover:text-[#1D1D1F]'}`}
                onClick={() => toggleInPlaylist('default', currentSong)}
                title="喜欢"
              >
                <Heart className={`w-5 h-5 ${isInPlaylist('default', currentSong.id) ? 'fill-current' : ''}`} />
              </button>
              <div className="relative" ref={menuRef}>
                <button 
                  className="transition-colors p-2 rounded-full text-[#6E6E73] hover:text-[#1D1D1F] hover:bg-black/5"
                  onClick={() => setShowPlaylistsMenu(!showPlaylistsMenu)}
                  title="添加到歌单"
                >
                  <FolderPlus className="w-5 h-5" />
                </button>
                {showPlaylistsMenu && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 w-56 bg-white/90 backdrop-blur-xl border border-[#EDEDF2] rounded-[16px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] py-2 z-50 overflow-hidden">
                    <div className="px-4 py-2 text-[12px] font-[600] text-[#6E6E73] border-b border-[#EDEDF2] uppercase tracking-wider mb-1">添加到歌单</div>
                    <div className="max-h-48 overflow-y-auto">
                      {playlists.filter((p: Playlist) => p.id !== 'default').map((p: Playlist) => (
                        <button 
                          key={p.id}
                          className="w-full text-left px-4 py-2.5 text-[15px] hover:bg-[#F5F5F7] flex items-center justify-between group transition-colors"
                          onClick={() => { toggleInPlaylist(p.id, currentSong); setShowPlaylistsMenu(false); }}
                        >
                          <span className="truncate text-[#1D1D1F]">{p.name}</span>
                          {isInPlaylist(p.id, currentSong.id) && <span className="text-[12px] text-[#0071E3] font-[600]">已添加</span>}
                        </button>
                      ))}
                      {playlists.filter((p: Playlist) => p.id !== 'default').length === 0 && (
                        <div className="px-4 py-3 text-[13px] text-[#6E6E73] text-center">暂无自定义歌单</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4 w-full opacity-50">
             <div className="w-14 h-14 rounded-[8px] bg-[#EDEDF2] animate-pulse" />
             <div className="space-y-2">
               <div className="h-3.5 w-32 bg-[#EDEDF2] rounded-full animate-pulse" />
               <div className="h-2.5 w-20 bg-[#EDEDF2] rounded-full animate-pulse" />
             </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center flex-1 max-w-[500px] px-6">
        <div className="flex items-center gap-6 mb-2">
          <button className="text-[#1D1D1F] hover:text-[#0071E3] transition-colors p-2 disabled:opacity-30 disabled:hover:text-[#1D1D1F]" onClick={playPrev} disabled={!currentSong}>
            <SkipBack className="w-6 h-6 fill-current" />
          </button>
          <button 
            className="w-11 h-11 flex items-center justify-center bg-[#1D1D1F] text-white rounded-full hover:bg-[#0071E3] hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:bg-[#1D1D1F] disabled:hover:scale-100 shadow-md"
            onClick={togglePlay}
            disabled={!currentSong}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-1" />}
          </button>
          <button className="text-[#1D1D1F] hover:text-[#0071E3] transition-colors p-2 disabled:opacity-30 disabled:hover:text-[#1D1D1F]" onClick={() => playNext()} disabled={!currentSong}>
            <SkipForward className="w-6 h-6 fill-current" />
          </button>
          <button 
            className={`transition-colors p-2 rounded-full hover:bg-black/5 ${repeatMode !== 'none' ? 'text-[#0071E3]' : 'text-[#6E6E73] hover:text-[#1D1D1F]'}`}
            onClick={toggleRepeatMode}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
          </button>
        </div>
        <div className="w-full flex items-center gap-3">
          <span className="text-[12px] text-[#6E6E73] w-10 text-right font-mono tracking-tight">{formatTime(currentTime)}</span>
          <div className="flex-1 h-3 group cursor-pointer flex items-center" onClick={handleProgressBarClick}>
            <div className="w-full h-1.5 bg-[#EDEDF2] rounded-full relative overflow-hidden group-hover:overflow-visible transition-all">
              <div 
                className="h-full bg-[#0071E3] rounded-full relative"
                style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
              >
                <div className="w-3.5 h-3.5 bg-[#0071E3] border-2 border-white rounded-full absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transform translate-x-1/2 shadow-sm transition-opacity" />
              </div>
            </div>
          </div>
          <span className="text-[12px] text-[#6E6E73] w-10 font-mono tracking-tight">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right Tools - Volume etc */}
      <div className="flex items-center justify-end gap-3 w-1/3 text-[#6E6E73]">
        <button
          className={`hover:text-[#1D1D1F] transition-colors p-2 rounded-full hover:bg-black/5 disabled:opacity-30 disabled:hover:text-[#6E6E73] ${
            floating.enabled ? 'text-[#0071E3]' : ''
          }`}
          onClick={() => void floating.toggle()}
          disabled={!floating.supported}
          title={
            floating.supported
              ? `${floating.enabled ? '关闭' : '开启'}桌面歌词 (${modifierLabel}+Shift+L)`
              : floating.unsupportedHint
          }
        >
          <PictureInPicture2 className="w-5 h-5" />
        </button>
        <button
          className={`hover:text-[#1D1D1F] transition-colors p-2 rounded-full hover:bg-black/5 ${showQueue ? 'text-[#0071E3]' : ''}`}
          onClick={() => setShowQueue(!showQueue)}
        >
          <ListMusic className="w-5 h-5" />
        </button>
        <button 
          className="hover:text-[#1D1D1F] transition-colors p-2 rounded-full hover:bg-black/5"
          onClick={() => setVolume(volume === 0 ? 1 : 0)}
          title={volume === 0 ? "取消静音" : "静音"}
        >
          {volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
        <div className="w-24 group flex items-center pr-2">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            className="w-full h-1.5 bg-[#EDEDF2] rounded-full appearance-none cursor-pointer focus:outline-none transition-all duration-100 player-volume-slider"
            style={{ 
              background: `linear-gradient(to right, #0071E3 ${volume * 100}%, #EDEDF2 ${volume * 100}%)` 
            }}
          />
        </div>
      </div>
    </footer>
    </>
  );
}
